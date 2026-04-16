import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

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
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

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

  // Run all once at startup, then every 24 hours
  runAutoActivateUpcomingEvents();
  runAutoCloseExpiredEvents();
  runEventDateAlertScheduler();
  runCandidateAgeOut();
  const schedulerTimers = [
    setInterval(runAutoActivateUpcomingEvents, 24 * 60 * 60 * 1000),
    setInterval(runAutoCloseExpiredEvents, 24 * 60 * 60 * 1000),
    setInterval(runEventDateAlertScheduler, 24 * 60 * 60 * 1000),
    setInterval(runCandidateAgeOut, 24 * 60 * 60 * 1000),
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
