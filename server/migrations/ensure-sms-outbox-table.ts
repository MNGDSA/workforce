import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Boot-time idempotent migration: ensures the `sms_outbox_kind` enum and
 * the `sms_outbox` table (Task #107) exist. Decouples enqueue (e.g. inside
 * an SMP commit transaction or a bulk reissue) from delivery (rate-limited,
 * retried).
 *
 * Production deploys do not run drizzle-kit push automatically. Without
 * this script, every SMP activation enqueue crashes with
 * `relation "sms_outbox" does not exist` and the outbox drain worker
 * fails immediately.
 *
 * MUST run before:
 *   • ensureSmsOutboxNextAttempt — adds a column to this table.
 *   • ensureOnboardingReminders  — adds new values to this enum.
 *
 * The `DO $$ ... EXCEPTION WHEN duplicate_object $$` pattern is the
 * canonical Postgres idiom for `CREATE TYPE IF NOT EXISTS` since the
 * shorthand does not exist for ENUM types. We seed only the original
 * three values here; ensureOnboardingReminders adds the two reminder
 * values via `ALTER TYPE ... ADD VALUE IF NOT EXISTS`.
 */
export async function ensureSmsOutboxTable(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE sms_outbox_kind AS ENUM (
        'smp_activation',
        'smp_activation_reissue',
        'smp_activation_self_heal'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sms_outbox (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_phone varchar(20) NOT NULL,
      kind sms_outbox_kind NOT NULL,
      payload jsonb NOT NULL,
      candidate_id varchar REFERENCES candidates(id) ON DELETE SET NULL,
      dedupe_key varchar(100),
      attempts integer NOT NULL DEFAULT 0,
      last_error text,
      sent_at timestamp,
      dead_letter_at timestamp,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);

  // Coarse pending index — kept for compatibility with older queries.
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS sms_outbox_pending_idx
      ON sms_outbox (created_at)
      WHERE sent_at IS NULL AND dead_letter_at IS NULL
  `);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS sms_outbox_dedupe_idx
        ON sms_outbox (dedupe_key)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS sms_outbox_candidate_idx
        ON sms_outbox (candidate_id)`,
  );

  log("sms_outbox table + sms_outbox_kind enum ensured", "boot-migrate");
}
