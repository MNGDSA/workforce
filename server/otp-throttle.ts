import type { Request } from "express";
import { db } from "./db";
import { loginRateLimitBuckets } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";
import { getClientIp } from "./client-ip";

const VERIFY_WINDOW_MIN = 5;
const VERIFY_LOCKOUT_MIN = 15;
const VERIFY_MAX_ATTEMPTS = 10;

const REQUEST_WINDOW_MIN = 10;
const REQUEST_LOCKOUT_MIN = 30;
const REQUEST_MAX_ATTEMPTS = 20;

const VERIFY_SCOPE = "otp_verify_ip";
const REQUEST_SCOPE = "otp_request_ip";

// Task #107 — public /api/auth/activate throttle (anti-DoS for SMP activation
// link). Window/lockout tuned looser than OTP verify because legitimate
// activation traffic from a single shared NAT IP can be heavier (one SMP
// company onboarding 200 workers from one office network).
const ACTIVATE_WINDOW_MIN = 10;
const ACTIVATE_LOCKOUT_MIN = 30;
const ACTIVATE_MAX_ATTEMPTS = 30;
const ACTIVATE_SCOPE = "activate_ip";

export interface OtpThrottleDecision {
  allowed: boolean;
  retryAfterSec: number;
}

async function isLocked(scope: string, key: string): Promise<OtpThrottleDecision> {
  try {
    const rows = await db
      .select({ lockedUntil: loginRateLimitBuckets.lockedUntil })
      .from(loginRateLimitBuckets)
      .where(and(eq(loginRateLimitBuckets.scope, scope), eq(loginRateLimitBuckets.key, key)))
      .limit(1);
    const r = rows[0];
    if (!r?.lockedUntil) return { allowed: true, retryAfterSec: 0 };
    const ms = r.lockedUntil.getTime() - Date.now();
    if (ms <= 0) return { allowed: true, retryAfterSec: 0 };
    return { allowed: false, retryAfterSec: Math.ceil(ms / 1000) };
  } catch {
    // Fail-open on infra failure — better to allow than to break legitimate auth.
    return { allowed: true, retryAfterSec: 0 };
  }
}

async function bumpFailure(
  scope: string,
  key: string,
  windowMin: number,
  lockoutMin: number,
  maxAttempts: number,
): Promise<void> {
  try {
    // nosemgrep: javascript.drizzle-orm.security.audit.ban-drizzle-sql-raw
    // sql.raw below interpolates module-level numeric constants only — never
    // user input. PG INTERVAL syntax does not accept parameter placeholders.
    await db.execute(sql`
      INSERT INTO login_rate_limit_buckets
        (scope, key, attempt_count, window_start, locked_until, updated_at)
      VALUES
        (${scope}, ${key}, 1, NOW(), NULL, NOW())
      ON CONFLICT (scope, key) DO UPDATE SET
        attempt_count = CASE
          WHEN login_rate_limit_buckets.window_start < NOW() - INTERVAL '${sql.raw(String(windowMin))} minutes'
            THEN 1
          ELSE login_rate_limit_buckets.attempt_count + 1
        END,
        window_start = CASE
          WHEN login_rate_limit_buckets.window_start < NOW() - INTERVAL '${sql.raw(String(windowMin))} minutes'
            THEN NOW()
          ELSE login_rate_limit_buckets.window_start
        END,
        locked_until = CASE
          WHEN (CASE
                  WHEN login_rate_limit_buckets.window_start < NOW() - INTERVAL '${sql.raw(String(windowMin))} minutes' THEN 1
                  ELSE login_rate_limit_buckets.attempt_count + 1
                END) >= ${maxAttempts}
            AND (login_rate_limit_buckets.locked_until IS NULL OR login_rate_limit_buckets.locked_until <= NOW())
            THEN NOW() + INTERVAL '${sql.raw(String(lockoutMin))} minutes'
          ELSE login_rate_limit_buckets.locked_until
        END,
        updated_at = NOW()
    `);
  } catch {
    // best-effort — never break OTP flow on rate-limit infra failure
  }
}

export async function checkOtpVerifyIp(req: Request): Promise<OtpThrottleDecision> {
  return isLocked(VERIFY_SCOPE, getClientIp(req));
}
export async function recordOtpVerifyFailure(req: Request): Promise<void> {
  return bumpFailure(VERIFY_SCOPE, getClientIp(req), VERIFY_WINDOW_MIN, VERIFY_LOCKOUT_MIN, VERIFY_MAX_ATTEMPTS);
}

export async function checkActivateIp(req: Request): Promise<OtpThrottleDecision> {
  return isLocked(ACTIVATE_SCOPE, getClientIp(req));
}
export async function recordActivateFailure(req: Request): Promise<void> {
  return bumpFailure(ACTIVATE_SCOPE, getClientIp(req), ACTIVATE_WINDOW_MIN, ACTIVATE_LOCKOUT_MIN, ACTIVATE_MAX_ATTEMPTS);
}

/**
 * Atomic reserve-then-decide for /otp/request — closes the same-burst race
 * where N concurrent requests all read "0 attempts, not locked" before any of
 * them increment. Single SQL statement increments the counter and returns the
 * post-increment value; the caller decides based on the returned count, not
 * a separate prior read. PostgreSQL serializes concurrent UPDATEs on the same
 * (scope,key) row so each request sees a unique post-increment count.
 */
export async function tryReserveOtpRequest(req: Request): Promise<OtpThrottleDecision> {
  const ip = getClientIp(req);
  try {
    // nosemgrep: javascript.drizzle-orm.security.audit.ban-drizzle-sql-raw
    // sql.raw interpolates module-level numeric constants (REQUEST_WINDOW_MIN,
    // REQUEST_LOCKOUT_MIN, REQUEST_MAX_ATTEMPTS) only — never user input.
    const result = await db.execute(sql`
      INSERT INTO login_rate_limit_buckets
        (scope, key, attempt_count, window_start, locked_until, updated_at)
      VALUES
        (${REQUEST_SCOPE}, ${ip}, 1, NOW(), NULL, NOW())
      ON CONFLICT (scope, key) DO UPDATE SET
        attempt_count = CASE
          WHEN login_rate_limit_buckets.window_start < NOW() - INTERVAL '${sql.raw(String(REQUEST_WINDOW_MIN))} minutes'
            THEN 1
          ELSE login_rate_limit_buckets.attempt_count + 1
        END,
        window_start = CASE
          WHEN login_rate_limit_buckets.window_start < NOW() - INTERVAL '${sql.raw(String(REQUEST_WINDOW_MIN))} minutes'
            THEN NOW()
          ELSE login_rate_limit_buckets.window_start
        END,
        locked_until = CASE
          WHEN (CASE
                  WHEN login_rate_limit_buckets.window_start < NOW() - INTERVAL '${sql.raw(String(REQUEST_WINDOW_MIN))} minutes' THEN 1
                  ELSE login_rate_limit_buckets.attempt_count + 1
                END) > ${REQUEST_MAX_ATTEMPTS}
            AND (login_rate_limit_buckets.locked_until IS NULL OR login_rate_limit_buckets.locked_until <= NOW())
            THEN NOW() + INTERVAL '${sql.raw(String(REQUEST_LOCKOUT_MIN))} minutes'
          ELSE login_rate_limit_buckets.locked_until
        END,
        updated_at = NOW()
      RETURNING attempt_count, locked_until
    `);
    const row: any = (result as any).rows?.[0];
    if (!row) return { allowed: true, retryAfterSec: 0 };

    const count = Number(row.attempt_count);
    const lockedUntil = row.locked_until ? new Date(row.locked_until) : null;

    // If a prior burst already armed the lock, honour it.
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      return { allowed: false, retryAfterSec: Math.ceil((lockedUntil.getTime() - Date.now()) / 1000) };
    }
    // Post-increment count exceeds limit → this very call is denied.
    if (count > REQUEST_MAX_ATTEMPTS) {
      return { allowed: false, retryAfterSec: REQUEST_LOCKOUT_MIN * 60 };
    }
    return { allowed: true, retryAfterSec: 0 };
  } catch {
    // Fail-open on infra failure — never break OTP delivery on rate-limit error.
    return { allowed: true, retryAfterSec: 0 };
  }
}
