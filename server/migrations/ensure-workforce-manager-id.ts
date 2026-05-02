import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Task #281 — Boot-time idempotent migration: adds workforce.manager_id
 * (FK → managers.id, ON DELETE SET NULL) plus its supporting index.
 *
 * Must run AFTER ensureManagersTable so the FK target exists.
 */
export async function ensureWorkforceManagerId(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  await db.execute(sql`
    ALTER TABLE workforce
      ADD COLUMN IF NOT EXISTS manager_id VARCHAR REFERENCES managers(id) ON DELETE SET NULL
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS workforce_manager_idx ON workforce (manager_id)
  `);
  log("workforce.manager_id column + index ensured", "boot-migrate");
}
