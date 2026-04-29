// Task #233 — guard the boot-migrate self-heal that adds the
// has_vaccination_report column to candidates and onboarding. Without
// this column, the admit-to-onboarding POST returns a hard 500 with
// `column "has_vaccination_report" does not exist`, because the route
// builds an INSERT statement that references it (server/routes.ts:4237).
// Two layers of coverage:
//   1. Unit-level: the ensure script creates the column when missing,
//      is idempotent, and produces the expected type/nullability/default.
//   2. Integration-level: a real Drizzle INSERT that references
//      hasVaccinationReport succeeds end-to-end after the script runs —
//      this is the closest reproduction of the prod admit failure
//      without standing up the HTTP layer.
//
// Run with: `npx tsx --test server/__tests__/ensure-vaccination-report-columns.test.ts`

import { strict as assert } from "node:assert";
import { describe, it, before, after } from "node:test";
import { sql, eq, like } from "drizzle-orm";

import { db } from "../db";
import { candidates, onboarding } from "@shared/schema";
import { ensureVaccinationReportColumns } from "../migrations/ensure-vaccination-report-columns";

const noopLog = (_msg: string, _source?: string): void => {};

const FIXTURE_MARKER = "__ensure_vax_test__";

interface ColumnPresenceRow {
  present: number;
}

interface ColumnMetaRow {
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const r = await db.execute<ColumnPresenceRow>(sql`
    SELECT 1 AS present
      FROM information_schema.columns
     WHERE table_name = ${table}
       AND column_name = ${column}
       AND table_schema = 'public'
  `);
  return (r.rows ?? []).length > 0;
}

async function columnMeta(table: string, column: string): Promise<ColumnMetaRow | null> {
  const r = await db.execute<ColumnMetaRow>(sql`
    SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_name = ${table}
       AND column_name = ${column}
       AND table_schema = 'public'
  `);
  return (r.rows ?? [])[0] ?? null;
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
    // Always restore the column even if a test failed mid-run, then
    // sweep any fixture rows this suite may have left behind.
    await ensureVaccinationReportColumns(noopLog);
    await db.delete(onboarding).where(like(onboarding.notes, `%${FIXTURE_MARKER}%`));
    await db.delete(candidates).where(like(candidates.fullNameEn, `${FIXTURE_MARKER}%`));
  });

  it("creates the column on candidates when missing and is idempotent", async () => {
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
      const meta = await columnMeta(table, "has_vaccination_report");
      assert.notEqual(meta, null, `expected metadata row for ${table}.has_vaccination_report`);
      assert.equal(meta!.data_type, "boolean");
      assert.equal(meta!.is_nullable, "NO");
      // Postgres normalises a boolean default of `false` to the literal "false".
      assert.match(String(meta!.column_default ?? ""), /false/);
    });
  }

  it("admit-style INSERT including hasVaccinationReport succeeds after self-heal", async () => {
    // Reproduce the exact prod failure: drop both columns so the schema
    // mirrors the un-migrated production database, run the boot-migrate
    // step, then perform real Drizzle inserts that reference
    // hasVaccinationReport on both tables — the same SQL path that
    // server/routes.ts:4237 (the admit-to-onboarding POST) builds.
    if (await columnExists("candidates", "has_vaccination_report")) {
      await db.execute(sql`ALTER TABLE candidates DROP COLUMN has_vaccination_report`);
    }
    if (await columnExists("onboarding", "has_vaccination_report")) {
      await db.execute(sql`ALTER TABLE onboarding DROP COLUMN has_vaccination_report`);
    }

    await ensureVaccinationReportColumns(noopLog);

    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // Insert a candidate that explicitly sets hasVaccinationReport.
    const [cand] = await db
      .insert(candidates)
      .values({
        fullNameEn: `${FIXTURE_MARKER}-cand-${suffix}`,
        phone: `+96650${Math.floor(1000000 + Math.random() * 8999999)}`,
        hasVaccinationReport: true,
      })
      .returning();
    assert.equal(cand.hasVaccinationReport, true);

    // Insert the matching onboarding row, again referencing the column —
    // this is the SQL path that 500s in prod when the column is missing.
    const [ob] = await db
      .insert(onboarding)
      .values({
        candidateId: cand.id,
        notes: `${FIXTURE_MARKER}-${suffix}`,
        hasVaccinationReport: false,
      })
      .returning();
    assert.equal(ob.hasVaccinationReport, false);
    assert.equal(ob.candidateId, cand.id);
  });
});
