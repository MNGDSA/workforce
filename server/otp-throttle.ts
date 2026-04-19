import type { Request } from "express";
import { db } from "./db";
import { loginRateLimitBuckets } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";

const VERIFY_WINDOW_MIN = 5;
const VERIFY_LOCKOUT_MIN = 15;
const VERIFY_MAX_ATTEMPTS = 10;

const REQUEST_WINDOW_MIN = 10;
const REQUEST_LOCKOUT_MIN = 30;
const REQUEST_MAX_ATTEMPTS = 20;

const VERIFY_SCOPE = "otp_verify_ip";
const REQUEST_SCOPE = "otp_request_ip";

function getClientIp(req: Request): string {
  // Mirror server/login-rate-limit.ts — trust ONLY the rightmost X-Forwarded-For
  // entry (the one appended by our reverse proxy), never the leftmost.
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    const parts = xff.split(",");
    return parts[parts.length - 1]!.trim();
  }
  return req.ip ?? "unknown";
}

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

export async function checkOtpRequestIp(req: Request): Promise<OtpThrottleDecision> {
  return isLocked(REQUEST_SCOPE, getClientIp(req));
}
export async function recordOtpRequest(req: Request): Promise<void> {
  return bumpFailure(REQUEST_SCOPE, getClientIp(req), REQUEST_WINDOW_MIN, REQUEST_LOCKOUT_MIN, REQUEST_MAX_ATTEMPTS);
}
