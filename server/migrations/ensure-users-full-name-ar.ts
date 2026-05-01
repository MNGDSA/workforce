import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Boot-time idempotent migration: ensures users.full_name_ar column exists.
 * Added so the audit log + admin user listings can render bilingual names
 * (e.g. "Faisal Alamri فيصل العمري") without requiring a manual drizzle-kit
 * push in production. Nullable on purpose — historical admin rows seeded
 * before this column existed remain valid until an admin sets the Arabic
 * form via the Admin Users UI (or, for the founding super admin, via the
 * seed script which backfills it on every boot).
 */
export async function ensureUsersFullNameArColumn(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  await db.execute(
    sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name_ar TEXT`,
  );
  log("users.full_name_ar column ensured", "boot-migrate");
}
