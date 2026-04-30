import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Boot-time idempotent migration: ensures the candidates-table columns
 * added during the SMP/individual classification rollout (Task #107) and
 * the driver's-license document feature exist, plus the backing
 * `candidate_classification` enum type.
 *
 *   • candidate_classification enum  ('individual', 'smp')
 *   • candidates.classification              NOT NULL DEFAULT 'individual'
 *   • candidates.has_drivers_license         BOOLEAN NOT NULL DEFAULT false
 *   • candidates.drivers_license_file_url    TEXT
 *   • candidates.vaccination_report_file_url TEXT
 *
 * Production deploys do not run drizzle-kit push automatically. Without
 * this script, every candidate read/write crashes with
 * `column "classification" does not exist` and the SMP pipeline filters
 * (which key on classification) cannot run.
 *
 * The DO $$ ... EXCEPTION WHEN duplicate_object $$ pattern is the
 * canonical Postgres idiom for `CREATE TYPE IF NOT EXISTS` since the
 * shorthand does not exist for ENUM types.
 *
 * NOT NULL DEFAULT for `classification` is safe because Postgres stores
 * the default in the catalog and skips the row rewrite — even with
 * 70k+ candidate rows the ALTER is instant.
 */
export async function ensureCandidateClassificationAndDocs(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE candidate_classification AS ENUM ('individual', 'smp');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await db.execute(sql`
    ALTER TABLE candidates
      ADD COLUMN IF NOT EXISTS classification candidate_classification NOT NULL DEFAULT 'individual',
      ADD COLUMN IF NOT EXISTS has_drivers_license boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS drivers_license_file_url text,
      ADD COLUMN IF NOT EXISTS vaccination_report_file_url text
  `);

  // Composite index referenced by SMP pipeline filters and the awaiting-
  // activation sweep. Mirrors candidates_classification_status_idx in
  // shared/schema.ts.
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS candidates_classification_status_idx
      ON candidates (classification, status)
  `);

  log(
    "candidates classification + driver's-license + vaccination-report columns ensured",
    "boot-migrate",
  );
}
