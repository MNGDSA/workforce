import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Boot-time idempotent migration: ensures has_vaccination_report column
 * exists on both candidates and onboarding tables. Production deploys
 * do not run drizzle-kit push automatically, and the schema added this
 * column for the vaccination-report document requirement (commit 0930a84).
 * Without this, the admit-to-onboarding POST and any candidate write that
 * touches hasVaccinationReport fails at runtime with:
 *   column "has_vaccination_report" does not exist
 *
 * NOT NULL DEFAULT false means the ALTER runs instantly even on tables
 * with millions of rows (Postgres stores the default in the catalog and
 * skips the row rewrite).
 */
export async function ensureVaccinationReportColumns(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  await db.execute(
    sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS has_vaccination_report BOOLEAN NOT NULL DEFAULT false`,
  );
  await db.execute(
    sql`ALTER TABLE onboarding ADD COLUMN IF NOT EXISTS has_vaccination_report BOOLEAN NOT NULL DEFAULT false`,
  );
  log(
    "candidates+onboarding.has_vaccination_report column ensured",
    "boot-migrate",
  );
}
