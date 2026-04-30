import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Boot-time idempotent migration: ensures interviews.archived_at column
 * and its supporting index exist.
 *
 * Added so completed interviews can be archived (hidden from the default
 * list and stats) instead of being cancelled. The cancel action is
 * reserved for not-yet-finished sessions; archive is the correct verb
 * once an interview has run. Mirrors the events / candidates / workforce
 * archive pattern (NULL = active, non-NULL = archived).
 *
 * Production deploys do not run drizzle-kit push, so without this
 * migration the archive endpoint would fail with: column "archived_at"
 * does not exist, and getInterviews would crash on the isNull(archivedAt)
 * filter.
 */
export async function ensureInterviewsArchivedAt(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  await db.execute(
    sql`ALTER TABLE interviews ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS interviews_archived_at_idx ON interviews (archived_at)`,
  );
  log("interviews.archived_at column + index ensured", "boot-migrate");
}
