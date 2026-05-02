import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Task #281 — Boot-time GUARDED migration: drops workforce.supervisor_id.
 *
 * The column was scaffolded long ago and is never written to anywhere in
 * the codebase. The new managers/manager_id design supersedes it.
 *
 * Guard: if any row has a non-NULL supervisor_id we REFUSE to drop and log
 * loudly. The drop is then deferred until the operator investigates. The
 * migration is fully idempotent — if the column is already gone we no-op.
 */
export async function dropWorkforceSupervisorId(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  // 1. Detect whether the column still exists. We use information_schema
  //    rather than a try/catch because PostgreSQL's "column does not exist"
  //    error happens at parse time — a try/catch around the SELECT would
  //    not even allow the query to plan in some edge cases.
  const colCheck = await db.execute(sql`
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'workforce'
       AND column_name  = 'supervisor_id'
  `);
  // node-pg returns rows on the result object directly; drizzle's execute
  // wraps it but exposes `.rows` consistently.
  const colExists = (colCheck as unknown as { rows: unknown[] }).rows.length > 0;
  if (!colExists) {
    // Already dropped on a previous boot — silent no-op.
    return;
  }

  // 2. Safety check — refuse to drop if any row has a non-NULL value.
  const used = await db.execute(sql`
    SELECT count(*)::int AS n FROM workforce WHERE supervisor_id IS NOT NULL
  `);
  const usedRows = (used as unknown as { rows: Array<{ n: number }> }).rows;
  const n = usedRows[0]?.n ?? 0;
  if (n > 0) {
    log(
      `[ensure-managers] REFUSING to drop workforce.supervisor_id — ${n} rows non-null. Investigate before next deploy.`,
      "boot-migrate",
    );
    return;
  }

  // 3. Safe to drop.
  await db.execute(sql`ALTER TABLE workforce DROP COLUMN IF EXISTS supervisor_id`);
  log("workforce.supervisor_id column dropped (was 100% NULL)", "boot-migrate");
}
