/**
 * OTP table maintenance:
 *   - Self-bootstraps a composite index on (phone, created_at DESC) so
 *     countRecentOtpRequests / getLatestOtpVerification stop scanning the
 *     whole table as it grows past ~300K rows / month at 10K OTP/day.
 *   - Periodic purge of rows older than the retention window. OTPs that
 *     succeeded already have usedForRegistration=true; expired-and-never-used
 *     rows have no audit value past a few days.
 *
 * Both are idempotent and best-effort — failures never break OTP flow.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";

const RETENTION_DAYS = 7;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

async function ensureIndex(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS otp_verifications_phone_created_idx
      ON otp_verifications (phone, created_at DESC)
    `);
  } catch (err) {
    console.warn("[otp-maintenance] index bootstrap failed:", err);
  }
}

async function purge(): Promise<void> {
  try {
    // nosemgrep: javascript.drizzle-orm.security.audit.ban-drizzle-sql-raw
    // RETENTION_DAYS is a module-level numeric constant — never user input.
    await db.execute(sql`
      DELETE FROM otp_verifications
      WHERE created_at < NOW() - INTERVAL '${sql.raw(String(RETENTION_DAYS))} days'
    `);
  } catch (err) {
    console.warn("[otp-maintenance] purge failed:", err);
  }
}

void ensureIndex();
setInterval(purge, PURGE_INTERVAL_MS).unref();
