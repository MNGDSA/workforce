import type { Request } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { auditLogs, loginRateLimitBuckets } from "@shared/schema";
import { and, eq, gt, lt } from "drizzle-orm";

const WINDOW_MIN = 15;
const LOCKOUT_MIN = 30;
const MAX_ATTEMPTS = 5;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

function getClientIp(req: Request): string {
  // DO App Platform / typical reverse proxy: the load balancer APPENDS the
  // real client IP to any client-supplied X-Forwarded-For. So the rightmost
  // entry is the only one we trust. Taking the leftmost would let an attacker
  // pre-poison the header to rotate fake IPs and bypass the limiter.
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    const parts = xff.split(",");
    return parts[parts.length - 1]!.trim();
  }
  return req.ip ?? "unknown";
}

function sanitizeIdentifierForLog(id: string): string {
  if (!id) return "(empty)";
  const head = id.slice(0, 3);
  return `${head}***[len=${id.length}]`;
}

function normalizeIdentifier(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

function auditLockout(req: Request, scope: "ip" | "identifier", value: string, identifier: string): void {
  setImmediate(async () => {
    try {
      await db.insert(auditLogs).values({
        actorId: null,
        actorName: "anonymous",
        action: "auth.login_lockout",
        entityType: "auth",
        entityId: scope,
        description: `Login lockout (${scope}) for ${LOCKOUT_MIN} min after ${MAX_ATTEMPTS} failed attempts`,
        metadata: {
          scope,
          value: scope === "identifier" ? sanitizeIdentifierForLog(value) : value,
          identifier: sanitizeIdentifierForLog(identifier),
          ip: getClientIp(req),
          windowMin: WINDOW_MIN,
          lockoutMin: LOCKOUT_MIN,
        },
      } as any);
    } catch {
      // never break login on audit failure
    }
  });
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSec: number;
  reason?: "ip_locked" | "identifier_locked";
}

async function isLocked(scope: "ip" | "identifier", key: string): Promise<{ locked: boolean; retryAfterSec: number }> {
  const rows = await db
    .select({ lockedUntil: loginRateLimitBuckets.lockedUntil })
    .from(loginRateLimitBuckets)
    .where(and(eq(loginRateLimitBuckets.scope, scope), eq(loginRateLimitBuckets.key, key)))
    .limit(1);
  const row = rows[0];
  if (!row?.lockedUntil) return { locked: false, retryAfterSec: 0 };
  const ms = row.lockedUntil.getTime() - Date.now();
  if (ms <= 0) return { locked: false, retryAfterSec: 0 };
  return { locked: true, retryAfterSec: Math.ceil(ms / 1000) };
}

export async function checkLoginRateLimit(req: Request, identifierRaw: unknown): Promise<RateLimitDecision> {
  const ip = getClientIp(req);
  const id = normalizeIdentifier(identifierRaw);

  const ipCheck = await isLocked("ip", ip);
  if (ipCheck.locked) return { allowed: false, retryAfterSec: ipCheck.retryAfterSec, reason: "ip_locked" };
  if (id) {
    const idCheck = await isLocked("identifier", id);
    if (idCheck.locked) return { allowed: false, retryAfterSec: idCheck.retryAfterSec, reason: "identifier_locked" };
  }
  return { allowed: true, retryAfterSec: 0 };
}

interface UpsertResult {
  attempt_count: number;
  locked_until: Date | null;
  was_locked: boolean;
}

async function upsertFailure(scope: "ip" | "identifier", key: string): Promise<UpsertResult | null> {
  // Single atomic UPSERT:
  //  - INSERT a fresh row at attempt_count=1 if none exists.
  //  - On conflict: if the existing window has expired, reset to 1; else +1.
  //  - If the resulting attempt_count crosses MAX_ATTEMPTS, set locked_until.
  //  - was_locked tells the caller "this call is the one that flipped it locked"
  //    so we audit only the transition, not every subsequent failure.
  const result = await db.execute(sql`
    INSERT INTO login_rate_limit_buckets
      (scope, key, attempt_count, window_start, locked_until, updated_at)
    VALUES
      (${scope}, ${key}, 1, NOW(), NULL, NOW())
    ON CONFLICT (scope, key) DO UPDATE SET
      attempt_count = CASE
        WHEN login_rate_limit_buckets.window_start < NOW() - INTERVAL '${sql.raw(String(WINDOW_MIN))} minutes'
          THEN 1
        ELSE login_rate_limit_buckets.attempt_count + 1
      END,
      window_start = CASE
        WHEN login_rate_limit_buckets.window_start < NOW() - INTERVAL '${sql.raw(String(WINDOW_MIN))} minutes'
          THEN NOW()
        ELSE login_rate_limit_buckets.window_start
      END,
      locked_until = CASE
        WHEN (CASE
                WHEN login_rate_limit_buckets.window_start < NOW() - INTERVAL '${sql.raw(String(WINDOW_MIN))} minutes' THEN 1
                ELSE login_rate_limit_buckets.attempt_count + 1
              END) >= ${MAX_ATTEMPTS}
          AND (login_rate_limit_buckets.locked_until IS NULL OR login_rate_limit_buckets.locked_until <= NOW())
          THEN NOW() + INTERVAL '${sql.raw(String(LOCKOUT_MIN))} minutes'
        ELSE login_rate_limit_buckets.locked_until
      END,
      updated_at = NOW()
    RETURNING
      attempt_count,
      locked_until,
      (locked_until IS NOT NULL AND locked_until > NOW()
       AND updated_at = NOW()
       AND (xmax = 0 OR attempt_count >= ${MAX_ATTEMPTS})) AS was_locked
  `);
  const rows: any[] = (result as any).rows ?? (result as any) ?? [];
  if (!rows[0]) return null;
  return {
    attempt_count: Number(rows[0].attempt_count),
    locked_until: rows[0].locked_until ? new Date(rows[0].locked_until) : null,
    was_locked: rows[0].was_locked === true,
  };
}

// "was_locked" is best-effort from the SQL — to make the audit trigger crisp
// we additionally check: if the row's attempt_count == MAX_ATTEMPTS exactly,
// this caller is the one that crossed the threshold.
function justCrossedThreshold(r: UpsertResult | null): boolean {
  if (!r) return false;
  if (!r.locked_until) return false;
  if (r.locked_until.getTime() <= Date.now()) return false;
  return r.attempt_count === MAX_ATTEMPTS;
}

export async function recordLoginFailure(req: Request, identifierRaw: unknown): Promise<void> {
  const ip = getClientIp(req);
  const id = normalizeIdentifier(identifierRaw);

  try {
    const ipResult = await upsertFailure("ip", ip);
    if (justCrossedThreshold(ipResult)) auditLockout(req, "ip", ip, id);

    if (id) {
      const idResult = await upsertFailure("identifier", id);
      if (justCrossedThreshold(idResult)) auditLockout(req, "identifier", id, id);
    }
  } catch {
    // never break login on rate-limit infra failure — fail open
  }
}

export async function recordLoginSuccess(req: Request, identifierRaw: unknown): Promise<void> {
  const ip = getClientIp(req);
  const id = normalizeIdentifier(identifierRaw);
  try {
    await db.delete(loginRateLimitBuckets).where(
      and(eq(loginRateLimitBuckets.scope, "ip"), eq(loginRateLimitBuckets.key, ip)),
    );
    if (id) {
      await db.delete(loginRateLimitBuckets).where(
        and(eq(loginRateLimitBuckets.scope, "identifier"), eq(loginRateLimitBuckets.key, id)),
      );
    }
  } catch {
    // best-effort cleanup
  }
}

// Periodic cleanup: drop rows whose lockout has expired AND window is stale.
// Keeps the table bounded without affecting active throttling state.
async function sweep(): Promise<void> {
  try {
    await db.execute(sql`
      DELETE FROM login_rate_limit_buckets
      WHERE (locked_until IS NULL OR locked_until <= NOW())
        AND window_start < NOW() - INTERVAL '${sql.raw(String(WINDOW_MIN))} minutes'
    `);
  } catch {
    // best-effort
  }
}
setInterval(sweep, SWEEP_INTERVAL_MS).unref();
