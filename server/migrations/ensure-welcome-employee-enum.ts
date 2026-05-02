import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Task #281 — boot-time idempotent migration for the new
 * `welcome_employee` value on the sms_outbox_kind enum. Production
 * deploys do not run drizzle-kit push automatically; without this the
 * future welcome-employee sender (currently stubbed in
 * convertOnboardingToEmployee) would fail at runtime with
 *   invalid input value for enum sms_outbox_kind: "welcome_employee"
 *
 * Safe to run on every boot — `ADD VALUE IF NOT EXISTS` is a no-op
 * once the value is present.
 */
export async function ensureWelcomeEmployeeEnum(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  await db.execute(
    sql`ALTER TYPE sms_outbox_kind ADD VALUE IF NOT EXISTS 'welcome_employee'`,
  );
  log("sms_outbox_kind enum value 'welcome_employee' ensured", "boot-migrate");
}
