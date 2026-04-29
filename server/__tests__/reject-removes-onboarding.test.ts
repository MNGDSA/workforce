// Task #229 — regression coverage for the "shortlist → reject" cleanup.
//
// The interview screen now exposes a dislike (reject) button that flips
// an already-shortlisted application to "rejected". The backend's
// `applyApplicationStatusUpdate` is responsible for removing the
// candidate's active onboarding row(s) when the application leaves the
// "shortlisted" state — otherwise rejected candidates would silently
// linger in the onboarding pipeline and confuse HR.
//
// The companion test `manual-application-reset-safety.test.ts` covers
// the *atomicity* of that flow (rollback when cleanup throws). This
// test covers the *functional* invariant: under happy-path conditions,
// flipping a shortlisted application to "rejected" MUST delete every
// active onboarding row (pending|in_progress|ready) for the candidate
// and leave non-active rows (e.g. converted) alone.
//
// If the cleanup branch in `applyApplicationStatusUpdate` is ever
// removed or its gate inverted, this test will fail loudly — the
// invariant the dislike button depends on is now guarded by an
// automated regression test.

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
// sibling tests in this directory.
const FIXTURE_MARKER = "__t229_reject_cleanup__";

interface RejectFixture {
  candidateId: string;
  applicationId: string;
  jobId: string;
  eventId: string;
  // Active onboarding rows that MUST be removed by the cleanup.
  activeOnboardingIds: string[];
  // Non-active onboarding row that MUST be left alone (status not in
  // pending|in_progress|ready).
  preservedOnboardingId: string;
}

// Seed the realistic "operator just clicked reject" shape:
//   - one shortlisted application
//   - three active onboarding rows (one per removable status)
//   - one already-converted onboarding row that must be preserved
//
// Seeding multiple active rows guards against a bug where the cleanup
// only deletes the first match — every removable row must go.
async function seedFixture(): Promise<RejectFixture> {
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
    status: "shortlisted",
  }).returning();

  // Three active onboarding rows — one for each removable status the
  // cleanup is documented to sweep.
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

  // Preserved row — "converted" is NOT in the removable set, so the
  // cleanup must leave it intact even though it shares the candidate.
  const [preserved] = await db.insert(onboarding).values({
    candidateId: candidate.id,
    applicationId: app.id,
    jobId: job.id,
    eventId: event.id,
    status: "converted",
    hasPhoto: false,
    hasIban: false,
    hasNationalId: false,
    reminderCount: 0,
  }).returning();

  return {
    candidateId: candidate.id,
    applicationId: app.id,
    jobId: job.id,
    eventId: event.id,
    activeOnboardingIds,
    preservedOnboardingId: preserved.id,
  };
}

async function tearDownFixture(f: RejectFixture | null): Promise<void> {
  if (!f) return;
  // Audit logs reference the onboarding row by `entityId`; clear ours
  // first so we do not leave orphaned audit rows behind. Scope the
  // delete to OUR fixture's onboarding ids so a parallel run or shared
  // dev DB does not lose unrelated audit rows.
  const ourOnboardingIds = [...f.activeOnboardingIds, f.preservedOnboardingId];
  await db.delete(auditLogs).where(
    and(
      eq(auditLogs.action, "onboarding.auto_remove_on_reset"),
      eq(auditLogs.entityType, "onboarding"),
      inArray(auditLogs.entityId, ourOnboardingIds),
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

describe("Reject removes active onboarding (task #229)", () => {
  let fixture: RejectFixture | null = null;

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

  it("removes every active onboarding row when a shortlisted application is rejected", async () => {
    fixture = await seedFixture();

    // Sanity-check the seed: one shortlisted application, three active
    // onboarding rows, one converted onboarding row.
    assert.equal(
      await readAppStatus(fixture.applicationId),
      "shortlisted",
      "fixture seeds the application as 'shortlisted'",
    );
    for (const id of fixture.activeOnboardingIds) {
      const row = await readOnboarding(id);
      assert.ok(row, `fixture seeds active onboarding row ${id}`);
      assert.ok(
        row!.status === "pending" || row!.status === "in_progress" || row!.status === "ready",
        `fixture row ${id} has a removable status (got "${row!.status}")`,
      );
    }
    const preservedBefore = await readOnboarding(fixture.preservedOnboardingId);
    assert.ok(preservedBefore, "fixture seeds the preserved (converted) onboarding row");
    assert.equal(preservedBefore!.status, "converted");

    // Act — exactly what the dislike button does on the backend: flip
    // the application to "rejected" via the same helper the route uses.
    const updated = await applyApplicationStatusUpdate({
      applicationId: fixture.applicationId,
      data: { status: "rejected" },
      actor: { id: null, name: "test-admin" },
    });

    assert.ok(updated, "applyApplicationStatusUpdate must return the updated application");
    assert.equal(updated!.status, "rejected", "application status MUST be updated to 'rejected'");

    // 1. Application status was persisted as "rejected".
    assert.equal(
      await readAppStatus(fixture.applicationId),
      "rejected",
      "application row in the database MUST read 'rejected' after the dislike flip",
    );

    // 2. Every active onboarding row MUST be deleted. This is the core
    //    invariant: the dislike button promises HR that rejected
    //    candidates do not linger in the onboarding pipeline.
    for (const id of fixture.activeOnboardingIds) {
      const row = await readOnboarding(id);
      assert.equal(
        row,
        undefined,
        `active onboarding row ${id} MUST be removed when the application is rejected — ` +
          `if this assertion fails, rejected candidates are silently lingering in the onboarding pipeline`,
      );
    }

    // 3. The "converted" onboarding row MUST be preserved — the cleanup
    //    is scoped to pending|in_progress|ready and must never tear
    //    down completed onboarding history.
    const preservedAfter = await readOnboarding(fixture.preservedOnboardingId);
    assert.ok(
      preservedAfter,
      "non-active 'converted' onboarding row MUST be preserved (cleanup is scoped to active rows only)",
    );
    assert.equal(preservedAfter!.status, "converted");

    // 4. An audit log entry MUST be written for each removed row so HR
    //    has a paper trail of why the rows disappeared. We assert one
    //    entry per active row that got swept.
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
    const auditedIds = new Set(audits.map((a) => a.entityId));
    for (const id of fixture.activeOnboardingIds) {
      assert.ok(
        auditedIds.has(id),
        `audit log MUST record the removal of onboarding row ${id}`,
      );
    }
  });
});
