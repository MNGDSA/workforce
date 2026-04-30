import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Boot-time idempotent migration: ensures the partial index that backs
 * the headcount Golden Rule lookup on the `workforce` table.
 *
 * Background — Task #64 introduced the partial index
 *   `workforce (event_id) WHERE is_active = true AND offboarding_status IS NULL`
 * to keep the events-list count step (Task #37) cheap at the 10K-worker
 * scale. Its predicate matches `activeWorkforceFilter()` in
 * `server/headcount.ts` so Postgres can serve the count by an index-only
 * scan instead of seq-scanning a multi-million-row workforce table.
 *
 * The index was declared in `shared/schema.ts` (Task #241 baseline) but
 * never shipped as an ensure-script, so production carried it via an
 * early `drizzle-kit push` and a fresh database / recovery rebuild would
 * silently miss it. Without it, every events-list render would degrade
 * to a full table scan and the page would stall.
 *
 * Idempotent: `CREATE INDEX IF NOT EXISTS` is a no-op once the index
 * already exists, so this is safe to run on every boot.
 */
export async function ensureWorkforceEventActiveIdx(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS workforce_event_active_idx
        ON workforce (event_id)
        WHERE is_active = true AND offboarding_status IS NULL`,
  );
  log("workforce event_id partial index (active, non-offboarding) ensured", "boot-migrate");
}
