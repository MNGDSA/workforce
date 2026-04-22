import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import { readFileSync } from "fs";
import { join } from "path";
import { localeMiddleware } from "./locale-middleware";

const app = express();
const httpServer = createServer(app);

// Resolve req.locale ("ar" | "en") from query/header/Accept-Language for
// every request — used by error responses and SMS/email templates.
app.use(localeMiddleware);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// ─── Maintenance Mode (Option B) ───────────────────────────────────────────
// When MAINTENANCE_MODE=true, every request returns 503 with either an HTML
// page (browsers) or a JSON envelope (API). Used during prod migrations.
const MAINTENANCE_PAGE_PATH = join(process.cwd(), "server", "maintenance.html");
let cachedMaintenanceHtml: string | null = null;
function getMaintenanceHtml(): string {
  if (cachedMaintenanceHtml) return cachedMaintenanceHtml;
  try {
    cachedMaintenanceHtml = readFileSync(MAINTENANCE_PAGE_PATH, "utf-8");
  } catch {
    cachedMaintenanceHtml = "<h1>System Maintenance</h1><p>Workforce is undergoing maintenance. Please try again shortly.</p>";
  }
  return cachedMaintenanceHtml!;
}
app.use((req, res, next) => {
  if (process.env.MAINTENANCE_MODE !== "true") return next();
  res.setHeader("Retry-After", "300");
  if (req.path.startsWith("/api/")) {
    return res.status(503).json({
      maintenance: true,
      message: "Workforce is undergoing scheduled maintenance. Please try again in a few minutes.",
    });
  }
  res.status(503).type("html").send(getMaintenanceHtml());
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // PDPL/PII-safety: do NOT capture or log response bodies. They include
      // names, phones, national IDs, IBANs, and other personal data. Status
      // line + duration is enough for ops; deep diagnostics belong in the
      // error logger or a redacted audit log, not the request log.
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  // ─── Boot safety: refuse to start if dev OTP / throttle bypass flags are
  // misconfigured for the current NODE_ENV. See server/dev-otp-log.ts for
  // the full policy matrix. This MUST run before any traffic is served and
  // before registerRoutes() exposes /api/_dev/last-otp/:phone.
  try {
    const { assertDevGateSafe } = await import("./dev-otp-log");
    assertDevGateSafe(log);
  } catch (err) {
    console.error("Refusing to start:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // Boot-time idempotent schema patches. Production deploys do not run
  // drizzle-kit push, so schema additions must self-heal here. Keep these
  // small and ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS only.
  try {
    const { ensureLocaleColumn } = await import("./migrations/ensure-locale-column");
    await ensureLocaleColumn(log);
    const { ensureSmsOutboxNextAttempt } = await import("./migrations/ensure-sms-outbox-next-attempt");
    await ensureSmsOutboxNextAttempt(log);
  } catch (err) {
    log(`boot migration failed: ${err}`, "boot-migrate");
  }

  // Production safety net: verify critical tables exist. If drizzle-kit push
  // failed during build, fail fast with a clear operator message instead of
  // serving 500s for every API request.
  try {
    const { ensureCriticalTables } = await import("./migrations/ensure-critical-tables");
    await ensureCriticalTables(log);
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      console.error("Refusing to start: critical schema missing.", err);
      process.exit(1);
    }
    log(`ensure-critical-tables failed (non-prod, continuing): ${err}`, "ensure-tables");
  }

  // Seed RBAC system roles & permission catalog before routes mount,
  // so requirePermission cache loads against a populated DB.
  try {
    const { seedRbac } = await import("./seed-rbac");
    await seedRbac(log);
  } catch (err) {
    log(`RBAC seed failed: ${err}`, "rbac-seed");
  }

  await registerRoutes(httpServer, app);

  // Boot-time RBAC linter — logs which /api/* routes are guarded by the
  // declarative middleware. Non-fatal in dev; promote to hard fail in prod
  // by setting RBAC_STRICT_LINT=true once the T7 sweep is complete.
  try {
    const { lintRoutes } = await import("./auth-middleware");
    lintRoutes(app, log);
  } catch (err) {
    log(`RBAC linter failed: ${err}`, "rbac-lint");
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  // ─── Scheduled: auto-activate upcoming events on/after start date ─────────
  async function runAutoActivateUpcomingEvents() {
    try {
      const result = await storage.autoActivateUpcomingEvents();
      if (result.count > 0) {
        log(`Auto-activated ${result.count} event(s): ${result.names.join(", ")}`, "scheduler");
        for (const name of result.names) {
          await storage.createAdminAlert(
            "Event automatically activated",
            `"${name}" has reached its start date and is now active.`,
            { action: "auto_activated" }
          );
        }
      }
    } catch (err) {
      log(`Auto-activate scheduler error: ${err}`, "scheduler");
    }
  }

  // ─── Scheduled: auto-close expired duration-based events ──────────────────
  async function runAutoCloseExpiredEvents() {
    try {
      const result = await storage.autoCloseExpiredEvents();
      if (result.count > 0) {
        log(`Auto-closed ${result.count} expired event(s): ${result.names.join(", ")}`, "scheduler");
        for (const name of result.names) {
          await storage.createAdminAlert(
            "Event automatically closed",
            `"${name}" has passed its end date and has been closed automatically.`,
            { action: "auto_closed" }
          );
        }
      }
    } catch (err) {
      log(`Auto-close scheduler error: ${err}`, "scheduler");
    }
  }

  // ─── Scheduled: create bell alerts for events starting/ending in ≤3 days ──
  async function runEventDateAlertScheduler() {
    try {
      const { starting, ending } = await storage.getEventDateAlerts();
      const today = new Date().toISOString().split("T")[0];

      for (const ev of starting) {
        const label = ev.daysAway === 0 ? "today" : ev.daysAway === 1 ? "tomorrow" : `in ${ev.daysAway} days`;
        await storage.createAdminAlert(
          `Event starting ${label}`,
          `"${ev.name}" is scheduled to start ${label} (${ev.startDate}).`,
          { eventId: ev.id, action: "starting_soon", daysAway: ev.daysAway, alertDate: today }
        );
      }
      for (const ev of ending) {
        const label = ev.daysAway === 0 ? "today" : ev.daysAway === 1 ? "tomorrow" : `in ${ev.daysAway} days`;
        await storage.createAdminAlert(
          `Event ending ${label}`,
          `"${ev.name}" is scheduled to end ${label} (${ev.endDate}).`,
          { eventId: ev.id, action: "ending_soon", daysAway: ev.daysAway, alertDate: today }
        );
      }
      if (starting.length + ending.length > 0) {
        log(`Date alerts: ${starting.length} starting, ${ending.length} ending within 3 days`, "scheduler");
      }
    } catch (err) {
      log(`Date alert scheduler error: ${err}`, "scheduler");
    }
  }

  async function runCandidateAgeOut() {
    try {
      const aged = await storage.ageOutInactiveCandidates();
      if (aged > 0) {
        log(`Aged out ${aged} candidate(s) to inactive (no login in 1+ year)`, "scheduler");
      }
    } catch (err) {
      log(`Candidate age-out scheduler error: ${err}`, "scheduler");
    }
  }

  // Task #107: SMS outbox drain (every 30s) + daily awaiting-activation sweep.
  async function runSmsOutboxDrain() {
    try {
      const { drainSmsOutbox } = await import("./sms-outbox");
      const result = await drainSmsOutbox();
      if (result.sent > 0 || result.deadLettered > 0) {
        log(`SMS outbox: sent=${result.sent} dlq=${result.deadLettered} pending=${result.remaining}`, "scheduler");
      }
    } catch (err) {
      log(`SMS outbox drain error: ${err}`, "scheduler");
    }
  }

  async function runAwaitingActivationSweep() {
    try {
      const swept = await storage.sweepStaleAwaitingActivationCandidates();
      if (swept > 0) {
        log(`Awaiting-activation sweep: flipped ${swept} stale candidate(s) → inactive`, "scheduler");
      }
    } catch (err) {
      log(`Awaiting-activation sweep error: ${err}`, "scheduler");
    }
  }

  // Run all once at startup, then every 24 hours
  runAutoActivateUpcomingEvents();
  runAutoCloseExpiredEvents();
  runEventDateAlertScheduler();
  runCandidateAgeOut();
  runSmsOutboxDrain();
  runAwaitingActivationSweep();
  const schedulerTimers = [
    setInterval(runAutoActivateUpcomingEvents, 24 * 60 * 60 * 1000),
    setInterval(runAutoCloseExpiredEvents, 24 * 60 * 60 * 1000),
    setInterval(runEventDateAlertScheduler, 24 * 60 * 60 * 1000),
    setInterval(runCandidateAgeOut, 24 * 60 * 60 * 1000),
    setInterval(runSmsOutboxDrain, 30 * 1000),
    setInterval(runAwaitingActivationSweep, 24 * 60 * 60 * 1000),
  ];

  // ─── Graceful Shutdown ──────────────────────────────────────────────────────
  let isShuttingDown = false;
  const SHUTDOWN_TIMEOUT_MS = 15_000;

  async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    log(`${signal} received — starting graceful shutdown`, "shutdown");

    for (const timer of schedulerTimers) clearInterval(timer);
    log("Scheduler timers cleared", "shutdown");

    httpServer.close(() => {
      log("HTTP server closed — no more connections", "shutdown");
    });

    const forceExit = setTimeout(() => {
      log(`Shutdown timeout (${SHUTDOWN_TIMEOUT_MS}ms) reached — forcing exit`, "shutdown");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
      log("All in-flight requests drained", "shutdown");
    } catch (drainErr) {
      log(`Error draining connections: ${drainErr}`, "shutdown");
    }

    log("Graceful shutdown complete", "shutdown");
    process.exit(0);
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
})();
