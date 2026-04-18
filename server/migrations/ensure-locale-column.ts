import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Boot-time idempotent migration: ensures users.locale column exists.
 * Added because production deploys do not run drizzle-kit push automatically,
 * and the schema added users.locale (VARCHAR(8) NOT NULL DEFAULT 'ar') for
 * the bilingual Arabic/English feature. Without this, getUserByPhone /
 * getUserByEmail and every login flow fails with: column "locale" does not exist.
 */
export async function ensureLocaleColumn(log: (msg: string, source?: string) => void): Promise<void> {
  await db.execute(
    sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS locale VARCHAR(8) NOT NULL DEFAULT 'ar'`
  );
  log("users.locale column ensured", "boot-migrate");
}
