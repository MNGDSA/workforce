// Task #223 — regression coverage for the atomic "Reset Like" manual
// flow. Task #219 made the auto-elimination path atomic by wrapping
// the application-status flip and the shared shortlist-reset cleanup
// in a single `db.transaction(...)`. Task #223 extends the same
// guarantee to the manual `PATCH /api/applications/:id` route via
// `applyApplicationStatusUpdate` in `server/application-status-cleanup.ts`.
//
// The safety property under test mirrors the Mode-A test in
// `onboarding-reminders-safety.test.ts`: when the in-cleanup
// `storage.deleteOnboardingRecord` call throws, EVERY write the
// transaction had performed must roll back together — i.e.:
//
//   1. The application status MUST stay at "shortlisted"
//      (the pre-update value) — never the half-applied
//      non-shortlisted value the manual reset was attempting.
//   2. The onboarding row MUST stay intact (no rows
//      deleted, no audit log written).
//
// Without atomicity, the manual route would leave a non-shortlisted
// application paired with an active onboarding row — the exact
// partial state the auto-elimination path eliminated in #219.

import { strict as assert } from "node:assert";
import { afterEach, before, describe, it, mock } from "node:test";
import { eq, like } from "drizzle-orm";

import { db } from "../db";
import { storage } from "../storage";
import {
  applications,
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
// without colliding with real seed data or with the marker used by
// `onboarding-reminders-safety.test.ts`.
const FIXTURE_MARKER = "__t223_manual_reset__";

interface ManualResetFixture {
  candidateId: string;
  applicationId: string;
  onboardingId: string;
  jobId: string;
  eventId: string;
}

// Seed the realistic pre-reset shape: a shortlisted application + an
// in_progress onboarding row pointing at the same candidate. This is
// exactly what the admin sees right before clicking "Reset Like".
async function seedFixture(): Promise<ManualResetFixture> {
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
    // The pre-reset state: admin shortlisted the candidate, the
    // admit dialog created the onboarding row, and now the admin is
    // about to undo the like. The forced cleanup failure must put us
    // back exactly here.
    status: "shortlisted",
  }).returning();

  const [ob] = await db.insert(onboarding).values({
    candidateId: candidate.id,
    applicationId: app.id,
    jobId: job.id,
    eventId: event.id,
    // "in_progress" is in the removable set
    // (pending|in_progress|ready) so `applyShortlistResetCleanup`
    // will attempt to delete it — which is what triggers the forced
    // failure under test.
    status: "in_progress",
    hasPhoto: false,
    hasIban: false,
    hasNationalId: false,
    reminderCount: 0,
  }).returning();

  return {
    candidateId: candidate.id,
    applicationId: app.id,
    onboardingId: ob.id,
    jobId: job.id,
    eventId: event.id,
  };
}

async function tearDownFixture(f: ManualResetFixture | null): Promise<void> {
  if (!f) return;
  await db.delete(onboarding).where(eq(onboarding.id, f.onboardingId));
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
  const [row] = await db.select({ status: applications.status }).from(applications).where(eq(applications.id, id));
  return row?.status;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Manual application reset atomicity (task #223)", () => {
  let fixture: ManualResetFixture | null = null;

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

  it("rolls the application status flip back when the in-cleanup deleteOnboardingRecord throws", async () => {
    fixture = await seedFixture();

    // Sanity-check the seeded state — we are going to assert these
    // exact values are restored after the forced failure.
    const startingAppStatus = await readAppStatus(fixture.applicationId);
    assert.equal(startingAppStatus, "shortlisted", "fixture seeds the application as 'shortlisted'");
    const startingOb = await readOnboarding(fixture.onboardingId);
    assert.ok(startingOb, "fixture seeds an onboarding row");
    assert.equal(startingOb!.status, "in_progress");

    // Force `applyShortlistResetCleanup`'s deleteOnboardingRecord call
    // to throw. This lands the throw AFTER the application status has
    // been flipped inside the transaction (so without atomicity the
    // status would be persisted at "interviewed") but BEFORE the
    // onboarding row is actually removed — i.e. exactly the partial
    // state task #223 closed off.
    const stub = mock.method(storage, "deleteOnboardingRecord", async () => {
      throw new Error("forced-failure-mid-manual-reset");
    });

    let threw: unknown = null;
    try {
      await applyApplicationStatusUpdate({
        applicationId: fixture.applicationId,
        data: { status: "interviewed" },
        actor: { id: null, name: "test-admin" },
      });
    } catch (err) {
      threw = err;
    } finally {
      stub.mock.restore();
    }

    // The route's outer try/catch maps the rethrown error to a 500;
    // the helper is required to surface the failure rather than
    // swallow it (that was the explicit behavioural change in #223).
    assert.ok(threw, "applyApplicationStatusUpdate must propagate the cleanup failure, not swallow it");
    assert.match(
      String((threw as Error).message ?? threw),
      /forced-failure-mid-manual-reset/,
      `expected the forced cleanup error to propagate; got ${String((threw as Error).message ?? threw)}`,
    );

    // 1. Application status MUST stay at "shortlisted" — Postgres
    //    rolled the flip back as part of the same transaction. Without
    //    atomicity, the row would now read "interviewed" while the
    //    onboarding row was still active.
    const restoredAppStatus = await readAppStatus(fixture.applicationId);
    assert.equal(
      restoredAppStatus,
      "shortlisted",
      "application status MUST be reverted from 'interviewed' back to 'shortlisted' — the entire manual reset is rolled back atomically",
    );

    // 2. The onboarding row MUST still exist with its original status.
    //    The cleanup never reached completion; nothing was deleted,
    //    nothing was audit-logged, nothing was mutated.
    const after = await readOnboarding(fixture.onboardingId);
    assert.ok(
      after,
      "onboarding row MUST still exist (cleanup never ran to completion and nothing was committed)",
    );
    assert.equal(after!.status, "in_progress", "onboarding status must be left untouched");
    assert.equal(after!.reminderCount, 0, "reminder bookkeeping must be left untouched");
  });
});
