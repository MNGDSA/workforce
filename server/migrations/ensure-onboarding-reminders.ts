import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Task #214 — boot-time idempotent migration for onboarding document
 * reminder columns + new sms_outbox_kind enum values. Production
 * deploys do not run drizzle-kit push automatically; without this the
 * scheduled reminder sweep would fail at runtime with
 *   column "last_reminder_sent_at" does not exist
 * or
 *   invalid input value for enum sms_outbox_kind: "onboarding_reminder"
 */
export async function ensureOnboardingReminders(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  // Add the four reminder-state columns to onboarding. NOT NULL DEFAULT 0
  // for reminder_count is safe: existing rows backfill to 0.
  await db.execute(sql`
    ALTER TABLE onboarding
      ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS reminders_paused_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS eliminated_at TIMESTAMP
  `);

  // Extend the sms_outbox_kind enum. ADD VALUE IF NOT EXISTS is the
  // documented idempotent path; both values must be added in their
  // own statement (Postgres forbids multi-value ALTER TYPE in one
  // command on older versions).
  await db.execute(
    sql`ALTER TYPE sms_outbox_kind ADD VALUE IF NOT EXISTS 'onboarding_reminder'`,
  );
  await db.execute(
    sql`ALTER TYPE sms_outbox_kind ADD VALUE IF NOT EXISTS 'onboarding_final_warning'`,
  );

  log(
    "onboarding reminder columns + sms_outbox_kind enum values ensured",
    "boot-migrate",
  );
}
