import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Task #281 — Boot-time idempotent migration: creates the `managers` table.
 *
 * Managers are a lightweight directory of Jisr-HR employees who exist in
 * the app only so workers (workforce rows) can be assigned a "reports to"
 * manager. They are NOT users (no login) and NOT workforce (don't clock in,
 * don't draw salary here).
 *
 * Idempotent — safe to run on every boot.
 */
export async function ensureManagersTable(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS managers (
      id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name_en  TEXT NOT NULL,
      full_name_ar  TEXT,
      email         TEXT,
      phone         TEXT NOT NULL,
      whatsapp      TEXT,
      jisr_employee_id VARCHAR(40),
      department_id VARCHAR REFERENCES departments(id) ON DELETE RESTRICT,
      position_id   VARCHAR REFERENCES positions(id) ON DELETE RESTRICT,
      reports_to_manager_id VARCHAR REFERENCES managers(id) ON DELETE SET NULL,
      is_active     BOOLEAN NOT NULL DEFAULT TRUE,
      notes         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS managers_jisr_employee_id_unique_idx
      ON managers (jisr_employee_id)
      WHERE jisr_employee_id IS NOT NULL
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS managers_email_unique_idx
      ON managers (email)
      WHERE email IS NOT NULL
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS managers_department_idx ON managers (department_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS managers_position_idx ON managers (position_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS managers_reports_to_idx ON managers (reports_to_manager_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS managers_active_idx ON managers (is_active)`);

  log("managers table + indexes ensured", "boot-migrate");
}
