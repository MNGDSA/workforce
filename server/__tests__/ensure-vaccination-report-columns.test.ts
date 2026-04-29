// Task #233 — guard the boot-migrate self-heal that adds the
// has_vaccination_report column to candidates and onboarding. The
// admit-to-onboarding POST and several candidate writes reference this
// column, and prod stops working with a hard 500 if it is missing
// (commit 0930a84 added the schema but never wrote a migration).
//
// Run with: `npx tsx --test server/__tests__/ensure-vaccination-report-columns.test.ts`

import { strict as assert } from "node:assert";
import { describe, it, before, after } from "node:test";
import { sql } from "drizzle-orm";

import { db } from "../db";
import { ensureVaccinationReportColumns } from "../migrations/ensure-vaccination-report-columns";

const noopLog = (_msg: string, _source?: string): void => {};

async function columnExists(table: string, column: string): Promise<boolean> {
  const r: any = await db.execute(sql`
    SELECT 1
      FROM information_schema.columns
     WHERE table_name = ${table}
       AND column_name = ${column}
       AND table_schema = 'public'
  `);
  const rows: any[] = r?.rows ?? r ?? [];
  return rows.length > 0;
}

describe("ensureVaccinationReportColumns", () => {
  // Snapshot starting state so the suite is safe to run on a DB that
  // already has the column (the normal case after the first boot).
  let candidatesHadIt = true;
  let onboardingHadIt = true;

  before(async () => {
    candidatesHadIt = await columnExists("candidates", "has_vaccination_report");
    onboardingHadIt = await columnExists("onboarding", "has_vaccination_report");
  });

  after(async () => {
    // Always restore: ensure the column is back even if a test failed.
    await ensureVaccinationReportColumns(noopLog);
  });

  it("creates the column on candidates when missing and is idempotent", async () => {
    // Drop only if we own the test isolation (column was present at start
    // — meaning the boot-migrate had already run). Otherwise leave it
    // alone; a subsequent ensure call still has to be a no-op.
    if (candidatesHadIt) {
      await db.execute(sql`ALTER TABLE candidates DROP COLUMN has_vaccination_report`);
      assert.equal(await columnExists("candidates", "has_vaccination_report"), false);
    }

    await ensureVaccinationReportColumns(noopLog);
    assert.equal(await columnExists("candidates", "has_vaccination_report"), true);

    // Second call must not throw — IF NOT EXISTS guards both ALTERs.
    await ensureVaccinationReportColumns(noopLog);
    assert.equal(await columnExists("candidates", "has_vaccination_report"), true);
  });

  it("creates the column on onboarding when missing and is idempotent", async () => {
    if (onboardingHadIt) {
      await db.execute(sql`ALTER TABLE onboarding DROP COLUMN has_vaccination_report`);
      assert.equal(await columnExists("onboarding", "has_vaccination_report"), false);
    }

    await ensureVaccinationReportColumns(noopLog);
    assert.equal(await columnExists("onboarding", "has_vaccination_report"), true);

    await ensureVaccinationReportColumns(noopLog);
    assert.equal(await columnExists("onboarding", "has_vaccination_report"), true);
  });

  for (const table of ["candidates", "onboarding"] as const) {
    it(`creates ${table}.has_vaccination_report with the expected type and defaults`, async () => {
      const r: any = await db.execute(sql`
        SELECT data_type, is_nullable, column_default
          FROM information_schema.columns
         WHERE table_name = ${table}
           AND column_name = 'has_vaccination_report'
           AND table_schema = 'public'
      `);
      const rows: any[] = r?.rows ?? r ?? [];
      assert.equal(rows.length, 1, `expected one row describing ${table}.has_vaccination_report`);
      const row = rows[0];
      assert.equal(row.data_type, "boolean");
      assert.equal(row.is_nullable, "NO");
      // Postgres normalises `false` to the literal "false".
      assert.match(String(row.column_default), /false/);
    });
  }
});
