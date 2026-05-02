import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Task #281 — boot-time idempotent migration for the welcome-employee
 * SMS plumbing.
 *
 * 1. Adds the `welcome_employee` value to the `sms_outbox_kind` enum so
 *    the future sender (currently stubbed in convertOnboardingToEmployee)
 *    can insert outbox rows without `invalid input value for enum`.
 *
 * 2. Reserves two `system_settings` keys exactly as specified in
 *    .local/tasks/task-281.md "T009 SMS plumbing":
 *      welcome_employee_sms_ar
 *      welcome_employee_sms_en
 *    seeded with sensible defaults that use the {name} and {manager_name}
 *    placeholders. INSERT … ON CONFLICT DO NOTHING so re-deploys never
 *    overwrite an operator-edited template.
 *
 * Safe to run on every boot — `ADD VALUE IF NOT EXISTS` and the
 * conflict-do-nothing inserts are both no-ops once the values are
 * present.
 */
export async function ensureWelcomeEmployeeEnum(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  await db.execute(
    sql`ALTER TYPE sms_outbox_kind ADD VALUE IF NOT EXISTS 'welcome_employee'`,
  );
  log("sms_outbox_kind enum value 'welcome_employee' ensured", "boot-migrate");

  // Reserve the bilingual template keys per spec. Defaults are short,
  // brand-neutral and use the documented {name} / {manager_name}
  // placeholders so the eventual sender can string-replace without
  // additional schema work.
  await db.execute(sql`
    INSERT INTO system_settings (key, value)
    VALUES (
      'welcome_employee_sms_en',
      'Welcome {name}! You have been onboarded. Your manager is {manager_name}.'
    )
    ON CONFLICT (key) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO system_settings (key, value)
    VALUES (
      'welcome_employee_sms_ar',
      'مرحبًا {name}! تم تعيينك. مديرك هو {manager_name}.'
    )
    ON CONFLICT (key) DO NOTHING
  `);
  log(
    "welcome_employee_sms_ar / welcome_employee_sms_en setting keys reserved",
    "boot-migrate",
  );
}
