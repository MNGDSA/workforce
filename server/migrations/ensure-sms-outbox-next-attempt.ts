import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Boot-time idempotent migration: ensures sms_outbox.next_attempt_at
 * column and the worker-oriented partial index exist. Added because
 * production deploys do not run drizzle-kit push automatically, and
 * the SMS outbox drain (Task #107) reads/writes next_attempt_at to
 * gate re-claims under concurrent workers. Without this, drainSmsOutbox
 * would fail at runtime with: column "next_attempt_at" does not exist.
 *
 * The partial index matches the claim predicate
 *   sent_at IS NULL AND dead_letter_at IS NULL
 * and orders on (next_attempt_at NULLS FIRST, created_at) so the
 * worker's "smallest pending row that is due now" lookup is a single
 * index scan even with thousands of pending rows.
 */
export async function ensureSmsOutboxNextAttempt(log: (msg: string, source?: string) => void): Promise<void> {
  await db.execute(
    sql`ALTER TABLE sms_outbox ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS sms_outbox_pending_due_idx
        ON sms_outbox (next_attempt_at NULLS FIRST, created_at)
        WHERE sent_at IS NULL AND dead_letter_at IS NULL`,
  );
  log("sms_outbox.next_attempt_at column + worker index ensured", "boot-migrate");
}
