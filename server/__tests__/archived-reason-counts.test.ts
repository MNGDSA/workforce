// Task #266 — regression test that picking a reason chip on the
// /talent Archived view does NOT collapse the other reason counts.
//
// `storage.getArchivedReasonCounts` deliberately strips
// `archivedReason` out of the query before counting so the four
// chips always span the full Archived population. If a future
// refactor "forgets" that strip, the dropdown would still render
// but every chip except the picked one would silently drop to
// zero — admins would think there is nothing left to triage.
//
// We pin the contract with two assertions:
//   1) calling with `archivedReason="missed_activation"` returns
//      the SAME counts as calling with no `archivedReason`. This
//      is the bug-shaped check.
//   2) a different filter (`classification="smp"`) DOES change
//      the counts. Without this, an empty implementation that
//      returned the same numbers for every input would pass (1).
//
// We narrow the global Archived population to a fixture cohort
// via the `search` filter so the absolute numbers we assert
// against are deterministic regardless of what else is in the
// dev database.

import { strict as assert } from "node:assert";
import { afterEach, before, describe, it } from "node:test";
import { eq, like } from "drizzle-orm";

import { db } from "../db";
import { candidates, type CandidateQuery } from "@shared/schema";
import { storage } from "../storage";
import {
  ARCHIVED_REASONS,
  type ArchivedReason,
} from "@shared/candidate-status";

// `archivedReason` is consumed by `buildCandidateOtherConditions` (see
// server/storage.ts) but is intentionally NOT modelled on the shared
// `candidateQuerySchema` — the field is owned by storage as an
// internal extension to keep the public schema stable. Mirror the
// same structural extension here so we can exercise the field
// without resorting to `as any`. This matches the pattern used inside
// storage.ts for `docFlags` (see comment around line 788).
type CountsQuery = Partial<CandidateQuery> & {
  archivedReason?: ArchivedReason;
};

// Search-friendly marker (no separators per shared/candidate-search.ts:
// SEPARATOR_REGEX matches \n\r,;\t and 2+ spaces, none of which appear
// here) so we can pin the cohort with `?search=marker`.
const FIXTURE_MARKER = "archreasoncounts";

interface CountsFixture {
  marker: string;
  ids: string[];
  // Rows we deliberately seeded outside the Archived bucket so they
  // also need cleanup, but should NEVER appear in any reason count.
  nonArchivedIds: string[];
  // Rows we seeded as `incomplete_profile` BUT classified as `smp` so
  // the classification filter test has a row left over after we strip
  // out the individual rows.
  smpIncompleteIds: string[];
  expected: Record<ArchivedReason, number>;
}

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function seedFixture(): Promise<CountsFixture> {
  const suffix = uniqueSuffix();
  const marker = `${FIXTURE_MARKER}${suffix}`;

  const longAgo = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000); // > 365d
  const monthAndAHalfAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000); // > 30d

  const ids: string[] = [];
  const nonArchivedIds: string[] = [];
  const smpIncompleteIds: string[] = [];

  const expected: Record<ArchivedReason, number> = {
    inactive_one_year: 3,
    incomplete_profile: 4,
    missed_activation: 5,
    manually_archived: 2,
  };

  // ─── manually_archived (×2) ──────────────────────────────────────────
  // Manual archive wins regardless of classification or profile state,
  // so we keep these as plain individuals to avoid leaking into the
  // classification-filter assertion.
  for (let i = 0; i < expected.manually_archived; i++) {
    const [row] = await db.insert(candidates).values({
      fullNameEn: `${marker}-manual-${i}`,
      classification: "individual",
      archivedAt: new Date(),
    }).returning();
    ids.push(row.id);
  }

  // ─── inactive_one_year (×3) ──────────────────────────────────────────
  // profile_completed=true + last_login_at IS NULL (the SQL CASE
  // accepts NULL OR <365d). Status must NOT be blocked/hired.
  for (let i = 0; i < expected.inactive_one_year; i++) {
    const [row] = await db.insert(candidates).values({
      fullNameEn: `${marker}-inactive-${i}`,
      classification: "individual",
      profileCompleted: true,
      status: "available",
      lastLoginAt: longAgo,
    }).returning();
    ids.push(row.id);
  }

  // ─── incomplete_profile (×4) ─────────────────────────────────────────
  // Mixed cohort:
  //   - 3 individuals: classification='individual', profile_completed=false
  //   - 1 SMP that logged in but never completed profile → also lands
  //     in incomplete_profile (rule 7 of ARCHIVED_REASON_SQL). We need
  //     this so the classification="smp" filter assertion still has
  //     non-zero non-missed_activation rows from our cohort.
  for (let i = 0; i < 3; i++) {
    const [row] = await db.insert(candidates).values({
      fullNameEn: `${marker}-incomplete-ind-${i}`,
      classification: "individual",
      profileCompleted: false,
      status: "available",
    }).returning();
    ids.push(row.id);
  }
  {
    const [row] = await db.insert(candidates).values({
      fullNameEn: `${marker}-incomplete-smp-0`,
      classification: "smp",
      profileCompleted: false,
      status: "available",
      lastLoginAt: new Date(),
    }).returning();
    ids.push(row.id);
    smpIncompleteIds.push(row.id);
  }

  // ─── missed_activation (×5) ──────────────────────────────────────────
  // SMP, never logged in, created_at older than 30d. We override the
  // server-default `created_at` so the row immediately falls past the
  // 30-day "not_activated" grace window into the archived branch.
  for (let i = 0; i < expected.missed_activation; i++) {
    const [row] = await db.insert(candidates).values({
      fullNameEn: `${marker}-missed-${i}`,
      classification: "smp",
      profileCompleted: false,
      status: "available",
      createdAt: monthAndAHalfAgo,
    }).returning();
    ids.push(row.id);
  }

  // ─── Decoy: a non-archived row that matches the marker ──────────────
  // A completed individual with a fresh login should land in
  // displayStatus='completed', not 'archived', so it must NOT appear
  // in any of the four reason counts. Without this, a regression
  // that silently dropped the forced `status='archived'` clause
  // could pass the test by counting every cohort row.
  {
    const [row] = await db.insert(candidates).values({
      fullNameEn: `${marker}-decoy-completed-0`,
      classification: "individual",
      profileCompleted: true,
      status: "available",
      lastLoginAt: new Date(),
    }).returning();
    nonArchivedIds.push(row.id);
  }

  return { marker, ids, nonArchivedIds, smpIncompleteIds, expected };
}

async function tearDownFixture(f: CountsFixture | null): Promise<void> {
  if (!f) return;
  for (const id of [...f.ids, ...f.nonArchivedIds]) {
    await db.delete(candidates).where(eq(candidates.id, id));
  }
}

describe("storage.getArchivedReasonCounts", () => {
  let fixture: CountsFixture | null = null;

  before(async () => {
    // Drop any stragglers from previously aborted runs.
    await db
      .delete(candidates)
      .where(like(candidates.fullNameEn, `${FIXTURE_MARKER}%`));
  });

  afterEach(async () => {
    await tearDownFixture(fixture);
    fixture = null;
  });

  it("ignores the archivedReason filter so picking a chip never collapses the other counts", async () => {
    fixture = await seedFixture();

    const baseline = await storage.getArchivedReasonCounts({
      search: fixture.marker,
    });

    // Sanity: every reason key is present (the implementation
    // initialises all four, see storage.ts:1544-1549).
    for (const r of ARCHIVED_REASONS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(baseline, r),
        `baseline counts MUST include key '${r}'`,
      );
      assert.equal(
        typeof baseline[r],
        "number",
        `baseline.${r} MUST be a number`,
      );
    }

    // The cohort is isolated by the search marker, so the counts
    // should match exactly what we seeded.
    assert.deepEqual(
      baseline,
      fixture.expected,
      "baseline counts MUST match the seeded cohort exactly (search filter isolated us)",
    );

    // The bug-shaped check: picking *any* reason chip MUST NOT change
    // the other three counts. We pick "missed_activation" because that
    // is the chip name called out in the task, but the contract holds
    // for every reason — assert across all of them.
    for (const reason of ARCHIVED_REASONS) {
      const reasonQuery: CountsQuery = {
        search: fixture.marker,
        archivedReason: reason,
      };
      const withReason = await storage.getArchivedReasonCounts(reasonQuery);
      assert.deepEqual(
        withReason,
        baseline,
        `picking archivedReason='${reason}' MUST NOT collapse the other counts ` +
          `(expected ${JSON.stringify(baseline)}, got ${JSON.stringify(withReason)})`,
      );
    }
  });

  it("DOES respect non-reason filters so the contract isn't satisfied by an empty implementation", async () => {
    fixture = await seedFixture();

    const all = await storage.getArchivedReasonCounts({
      search: fixture.marker,
    });
    const smpOnly = await storage.getArchivedReasonCounts({
      search: fixture.marker,
      classification: "smp",
    });

    // The classification filter must actually narrow the population.
    // In our fixture only the missed_activation rows (×5) and the
    // single SMP incomplete row (×1) are smp; the other 8 are
    // individuals and MUST drop out of every count.
    assert.deepEqual(
      smpOnly,
      {
        inactive_one_year: 0,
        incomplete_profile: 1,
        missed_activation: fixture.expected.missed_activation,
        manually_archived: 0,
      },
      "classification='smp' MUST narrow the counts; an empty implementation that returned the full cohort regardless of filter would fail here",
    );

    // And finally a defensive sanity check: combining the two
    // filters keeps the classification narrowing while still ignoring
    // the reason filter. Picking missed_activation while filtered to
    // SMP must STILL return the SMP-narrowed counts unchanged.
    const smpAndReasonQuery: CountsQuery = {
      search: fixture.marker,
      classification: "smp",
      archivedReason: "missed_activation",
    };
    const smpAndReason = await storage.getArchivedReasonCounts(smpAndReasonQuery);
    assert.deepEqual(
      smpAndReason,
      smpOnly,
      "archivedReason MUST be ignored even when other filters narrow the cohort",
    );

    // And, just to make the "filters change counts" assertion fully
    // explicit, the classification-narrowed counts MUST differ from
    // the unfiltered baseline somewhere — otherwise our filter wasn't
    // doing anything.
    const sameAsBaseline = ARCHIVED_REASONS.every((r) => smpOnly[r] === all[r]);
    assert.ok(
      !sameAsBaseline,
      "classification='smp' MUST change at least one reason count vs. the unfiltered baseline",
    );
  });
});
