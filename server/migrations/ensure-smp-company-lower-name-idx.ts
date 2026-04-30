import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Boot-time idempotent migration: ensures the case-insensitive
 * uniqueness index on `smp_companies.lower(name)` exists.
 *
 * Background — Task #107 introduced the SMP bulk-upload company matcher,
 * which dedupes incoming rows by `lower(name)` and relies on a unique
 * index to make the upsert atomic across concurrent uploads. The index
 * was declared in `shared/schema.ts` (Task #241 baseline) but never
 * shipped as an ensure-script, so production carried it via an early
 * `drizzle-kit push` and a fresh database / recovery rebuild would
 * silently miss it. Without the unique index the matcher would let two
 * "Acme Co." and "ACME CO." rows coexist and the dedupe upsert would
 * fall back to inserting duplicates.
 *
 * Idempotent: `CREATE UNIQUE INDEX IF NOT EXISTS` is a no-op once the
 * index already exists, so this is safe to run on every boot.
 */
export async function ensureSmpCompanyLowerNameIdx(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS smp_companies_lower_name_idx
        ON smp_companies (lower(name))`,
  );
  log("smp_companies lower(name) unique index ensured", "boot-migrate");
}
