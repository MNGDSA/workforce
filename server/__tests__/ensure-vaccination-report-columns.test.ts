// Task #233 — guard the boot-migrate self-heal that adds the
// has_vaccination_report column to candidates and onboarding. Without
// this column, the admit-to-onboarding POST returns a hard 500 with
// `column "has_vaccination_report" does not exist`, because the route
// builds an INSERT statement that references it (server/routes.ts:4237).
//
// Coverage layered to stay safe under the project's parallel
// `node:test` runner (run-tests.mjs spawns one tsx --test process per
// file, but other files share the same dev DB):
//
//   - Parallel-safe assertions (always run): script is idempotent,
//     column metadata is correct, and a real Drizzle INSERT that
//     references hasVaccinationReport succeeds — exercising the same
//     SQL path as the prod admit endpoint.
//   - Destructive scenario (gated behind `RUN_DESTRUCTIVE_DB_TESTS=1`):
//     drop both columns, run the ensure script, and verify it recreates
//     them. Skipped by default because `ALTER TABLE … DROP COLUMN`
//     takes ACCESS EXCLUSIVE locks on shared tables and could starve
//     concurrent tests that read those columns. Run manually with
//     `RUN_DESTRUCTIVE_DB_TESTS=1 npx tsx --test server/__tests__/ensure-vaccination-report-columns.test.ts`
//     when you need the full self-heal coverage.
//
// Run with: `npx tsx --test server/__tests__/ensure-vaccination-report-columns.test.ts`

import { strict as assert } from "node:assert";
import { describe, it, after } from "node:test";
import { sql, like } from "drizzle-orm";

import { db } from "../db";
import { candidates, onboarding } from "@shared/schema";
import { ensureVaccinationReportColumns } from "../migrations/ensure-vaccination-report-columns";

const noopLog = (_msg: string, _source?: string): void => {};

const FIXTURE_MARKER = "__ensure_vax_test__";
const RUN_DESTRUCTIVE = process.env.RUN_DESTRUCTIVE_DB_TESTS === "1";

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
  after(async () => {
    // Always restore (no-op if columns are present) and sweep any
    // fixture rows this suite may have left behind.
    await ensureVaccinationReportColumns(noopLog);
    await db.delete(onboarding).where(like(onboarding.notes, `%${FIXTURE_MARKER}%`));
    await db.delete(candidates).where(like(candidates.fullNameEn, `${FIXTURE_MARKER}%`));
  });

  // ── Parallel-safe assertions ────────────────────────────────────────

  it("is idempotent — running twice in a row never throws", async () => {
    await ensureVaccinationReportColumns(noopLog);
    await ensureVaccinationReportColumns(noopLog);
    assert.equal(await columnExists("candidates", "has_vaccination_report"), true);
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

  it("admit-style INSERT including hasVaccinationReport succeeds", async () => {
    // This is the closest reproduction of the prod admit endpoint
    // failure without standing up the HTTP layer: a real Drizzle
    // INSERT into onboarding (and candidates) that references
    // hasVaccinationReport — the same SQL the route builds at
    // server/routes.ts:4237. If the column is missing on either
    // table, both inserts 500 with the exact prod error.
    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const [cand] = await db
      .insert(candidates)
      .values({
        fullNameEn: `${FIXTURE_MARKER}-cand-${suffix}`,
        phone: `+96650${Math.floor(1000000 + Math.random() * 8999999)}`,
        hasVaccinationReport: true,
      })
      .returning();
    assert.equal(cand.hasVaccinationReport, true);

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

  // ── Destructive self-heal scenario (opt-in) ─────────────────────────
  // Gated because ALTER TABLE … DROP COLUMN takes ACCESS EXCLUSIVE
  // locks on shared tables; running it concurrently with other test
  // files that read candidates / onboarding would cause flakes or
  // outright failures during the brief window before the script runs
  // ADD COLUMN IF NOT EXISTS again.
  it(
    "recreates missing columns when run on a fresh schema",
    { skip: RUN_DESTRUCTIVE ? false : "set RUN_DESTRUCTIVE_DB_TESTS=1 to enable" },
    async () => {
      try {
        await db.execute(sql`ALTER TABLE candidates DROP COLUMN IF EXISTS has_vaccination_report`);
        await db.execute(sql`ALTER TABLE onboarding DROP COLUMN IF EXISTS has_vaccination_report`);
        assert.equal(await columnExists("candidates", "has_vaccination_report"), false);
        assert.equal(await columnExists("onboarding", "has_vaccination_report"), false);

        await ensureVaccinationReportColumns(noopLog);

        assert.equal(await columnExists("candidates", "has_vaccination_report"), true);
        assert.equal(await columnExists("onboarding", "has_vaccination_report"), true);
      } finally {
        // Belt-and-braces: even if an assertion above failed, leave
        // the schema in the expected state so the rest of the suite
        // (and any other tests sharing this DB) can keep working.
        await ensureVaccinationReportColumns(noopLog);
      }
    },
  );
});
