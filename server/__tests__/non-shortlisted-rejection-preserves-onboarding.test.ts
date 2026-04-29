// Task #231 — guard the *inverse* invariant of the shortlist-reset cleanup.
//
// `applyApplicationStatusUpdate` (in `server/application-status-cleanup.ts`)
// sweeps active onboarding rows ONLY when the pre-update application
// status is exactly "shortlisted". The sibling tests
// `reject-removes-onboarding.test.ts` (task #229) and
// `withdraw-close-removes-onboarding.test.ts` (task #230) lock in the
// *positive* direction (shortlisted → non-shortlisted DOES sweep), but
// nothing currently fails if a future refactor accidentally widens the
// gate (e.g. drops the `previousStatus === "shortlisted"` check). That
// regression would silently destroy onboarding history for candidates
// whose applications were never shortlisted in the first place — and
// the existing reject/withdraw/close tests would still pass because
// they only seed shortlisted fixtures.
//
// This file pins down the inverse: when the pre-update status is
// "interviewed" or "offered" (non-shortlisted statuses an application
// can legitimately hold), flipping to "rejected"/"withdrawn"/"closed"
// MUST leave the candidate's active onboarding rows untouched and MUST
// NOT emit the `onboarding.auto_remove_on_reset` audit log.

import { strict as assert } from "node:assert";
import { afterEach, before, describe, it } from "node:test";
import { and, eq, inArray, like } from "drizzle-orm";

import { db } from "../db";
import {
  applications,
  auditLogs,
  candidates,
  events,
  jobPostings,
  onboarding,
  type OnboardingRecord,
} from "@shared/schema";
import { applyApplicationStatusUpdate } from "../application-status-cleanup";

// ─── Fixture helpers ────────────────────────────────────────────────────────

// Marker baked into every fixture name so the `before` safety net and
// the per-test teardown can scoop up everything this file created
// without colliding with real seed data or with the markers used by
// sibling tests in this directory (notably the task #229 reject test
// which uses `__t229_reject_cleanup__` and the task #230 withdraw/close
// test which uses `__t230_withdraw_close_cleanup__`).
const FIXTURE_MARKER = "__t231_non_shortlisted_preserve__";

interface PreserveFixture {
  candidateId: string;
  applicationId: string;
  jobId: string;
  eventId: string;
  // Active onboarding rows that MUST be preserved (the gate must NOT
  // fire for non-shortlisted pre-update statuses).
  activeOnboardingIds: string[];
}

// Seed a realistic "candidate already past the shortlist stage" shape:
//   - one application in the supplied non-shortlisted starting status
//     (the gate-narrowing regression we're guarding against would
//     incorrectly sweep onboarding for ANY pre-update status, so we
//     parameterise this to exercise multiple)
//   - three active onboarding rows (one per removable status) — the
//     same rows the *positive* tests delete
//
// Seeding multiple active rows guards against a partial-regression
// where the gate widens but only deletes the first match: even one
// surviving deletion is still a data-loss bug worth failing on.
async function seedFixture(
  startingStatus: "interviewed" | "offered" | "new" | "reviewing",
): Promise<PreserveFixture> {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const phone = `+9665${Math.floor(10000000 + Math.random() * 89999999)}`;

  const [candidate] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-${suffix}`,
    phone,
  }).returning();

  const [event] = await db.insert(events).values({
    name: `${FIXTURE_MARKER}-event-${suffix}`,
    startDate: "2026-01-01",
  }).returning();

  const [job] = await db.insert(jobPostings).values({
    title: `${FIXTURE_MARKER}-job-${suffix}`,
    eventId: event.id,
  }).returning();

  const [app] = await db.insert(applications).values({
    candidateId: candidate.id,
    jobId: job.id,
    status: startingStatus,
  }).returning();

  // Three active onboarding rows — one for each status the cleanup is
  // documented to sweep when the gate fires. We seed the SAME shape as
  // the positive tests so the only thing differentiating this fixture
  // is the application's pre-update status.
  const activeStatuses: Array<"pending" | "in_progress" | "ready"> = [
    "pending",
    "in_progress",
    "ready",
  ];
  const activeOnboardingIds: string[] = [];
  for (const status of activeStatuses) {
    const [row] = await db.insert(onboarding).values({
      candidateId: candidate.id,
      applicationId: app.id,
      jobId: job.id,
      eventId: event.id,
      status,
      hasPhoto: false,
      hasIban: false,
      hasNationalId: false,
      reminderCount: 0,
    }).returning();
    activeOnboardingIds.push(row.id);
  }

  return {
    candidateId: candidate.id,
    applicationId: app.id,
    jobId: job.id,
    eventId: event.id,
    activeOnboardingIds,
  };
}

async function tearDownFixture(f: PreserveFixture | null): Promise<void> {
  if (!f) return;
  // Audit logs reference the onboarding row by `entityId`; clear ours
  // first so we do not leave orphaned audit rows behind. Scope the
  // delete to OUR fixture's onboarding ids so a parallel run or shared
  // dev DB does not lose unrelated audit rows.
  await db.delete(auditLogs).where(
    and(
      eq(auditLogs.action, "onboarding.auto_remove_on_reset"),
      eq(auditLogs.entityType, "onboarding"),
      inArray(auditLogs.entityId, f.activeOnboardingIds),
    ),
  );
  await db.delete(onboarding).where(eq(onboarding.candidateId, f.candidateId));
  await db.delete(applications).where(eq(applications.id, f.applicationId));
  await db.delete(candidates).where(eq(candidates.id, f.candidateId));
  await db.delete(jobPostings).where(eq(jobPostings.id, f.jobId));
  await db.delete(events).where(eq(events.id, f.eventId));
}

async function readOnboarding(id: string): Promise<OnboardingRecord | undefined> {
  const [row] = await db.select().from(onboarding).where(eq(onboarding.id, id));
  return row;
}

async function readAppStatus(id: string): Promise<string | undefined> {
  const [row] = await db
    .select({ status: applications.status })
    .from(applications)
    .where(eq(applications.id, id));
  return row?.status;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Non-shortlisted application rejection preserves onboarding (task #231)", () => {
  let fixture: PreserveFixture | null = null;

  before(async () => {
    // Safety net — drop any stragglers carrying our marker so a
    // previously aborted run cannot trip unique constraints on re-run.
    await db.delete(candidates).where(like(candidates.fullNameEn, `${FIXTURE_MARKER}-%`));
    await db.delete(events).where(like(events.name, `${FIXTURE_MARKER}-event-%`));
    await db.delete(jobPostings).where(like(jobPostings.title, `${FIXTURE_MARKER}-job-%`));
  });

  afterEach(async () => {
    await tearDownFixture(fixture);
    fixture = null;
  });

  // Each row is `[startingStatus, targetStatus]`. The cleanup gate in
  // `applyApplicationStatusUpdate` reads:
  //   previousStatus === "shortlisted" && newStatus !== "shortlisted"
  // so for EVERY combination below the sweep MUST NOT fire — the
  // pre-update status is not "shortlisted". The first two combinations
  // are the ones the task spec explicitly calls out
  // ("interviewed → rejected" and "offered → withdrawn"); the
  // remaining cases ("new" → "closed", "reviewing" → "rejected") give
  // us breadth across the rest of the non-shortlisted enum members so
  // a regression that widens the gate to ANY non-shortlisted source is
  // caught here rather than slipping through on a narrow seed.
  const cases: Array<{
    starting: "interviewed" | "offered" | "new" | "reviewing";
    target: "rejected" | "withdrawn" | "closed";
  }> = [
    { starting: "interviewed", target: "rejected" },
    { starting: "offered", target: "withdrawn" },
    { starting: "new", target: "closed" },
    { starting: "reviewing", target: "rejected" },
  ];

  for (const { starting, target } of cases) {
    it(`leaves active onboarding intact when "${starting}" → "${target}" (gate must NOT fire)`, async () => {
      fixture = await seedFixture(starting);

      // Sanity-check the seed: the application starts in the
      // non-shortlisted source status and has three active onboarding
      // rows. If the seed itself is wrong the rest of the assertions
      // would be meaningless, so we fail fast with a clear message.
      assert.equal(
        await readAppStatus(fixture.applicationId),
        starting,
        `fixture seeds the application as "${starting}"`,
      );
      for (const id of fixture.activeOnboardingIds) {
        const row = await readOnboarding(id);
        assert.ok(row, `fixture seeds active onboarding row ${id}`);
        assert.ok(
          row!.status === "pending" || row!.status === "in_progress" || row!.status === "ready",
          `fixture row ${id} has a removable status (got "${row!.status}")`,
        );
      }

      // Act — flip the application to the non-shortlisted target via
      // the same helper the PATCH /api/applications/:id route uses.
      const updated = await applyApplicationStatusUpdate({
        applicationId: fixture.applicationId,
        data: { status: target },
        actor: { id: null, name: "test-admin" },
      });

      assert.ok(updated, "applyApplicationStatusUpdate must return the updated application");
      assert.equal(
        updated!.status,
        target,
        `application status MUST be updated to "${target}"`,
      );

      // 1. Application status was persisted as the target. We don't
      //    care about the cleanup here — but if this fails the test is
      //    measuring something other than what we intended.
      assert.equal(
        await readAppStatus(fixture.applicationId),
        target,
        `application row in the database MUST read "${target}" after the flip`,
      );

      // 2. THE inverse invariant — every active onboarding row MUST
      //    still exist, with its original status untouched. If any of
      //    these assertions fail, the cleanup gate has been
      //    accidentally widened (e.g. the `previousStatus ===
      //    "shortlisted"` check was dropped) and onboarding history
      //    for non-shortlisted candidates is being silently destroyed.
      for (const id of fixture.activeOnboardingIds) {
        const row = await readOnboarding(id);
        assert.ok(
          row,
          `active onboarding row ${id} MUST be preserved when a "${starting}" application is flipped to "${target}" — ` +
            `if this assertion fails, the cleanup gate has widened beyond "shortlisted" and is destroying onboarding history for candidates that were never shortlisted`,
        );
        assert.ok(
          row!.status === "pending" || row!.status === "in_progress" || row!.status === "ready",
          `preserved onboarding row ${id} MUST keep its original active status (got "${row!.status}")`,
        );
      }

      // 3. No `onboarding.auto_remove_on_reset` audit row may exist
      //    for any of our onboarding ids. The audit log is the
      //    second-line signal HR sees when rows disappear; emitting
      //    one without an actual delete would still falsely advertise
      //    "we cleaned up an orphan" and is itself a regression worth
      //    failing on.
      const audits = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.action, "onboarding.auto_remove_on_reset"),
            eq(auditLogs.entityType, "onboarding"),
            inArray(auditLogs.entityId, fixture.activeOnboardingIds),
          ),
        );
      assert.equal(
        audits.length,
        0,
        `no onboarding.auto_remove_on_reset audit rows may be emitted for a "${starting}" → "${target}" flip ` +
          `(found ${audits.length}); the gate must skip the cleanup entirely when previousStatus !== "shortlisted"`,
      );
    });
  }
});
