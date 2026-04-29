// Regression coverage for the "Admit Candidate" eligibility query.
//
// The dialog on /onboarding now reads from a tight server endpoint
// (`GET /api/onboarding/admit-eligible`, backed by
// `storage.getAdmitEligibleCandidates`) so it can open in milliseconds
// even on tenants with thousands of applications. The eligibility
// rules — "currently shortlisted, not archived, no active onboarding
// row, deduped per candidate by latest appliedAt" — used to live in
// the React component and are now codified in SQL. If any of them
// regress, the dialog will silently include the wrong people; this
// test pins each rule down with a fixture that would fail loudly.

import { strict as assert } from "node:assert";
import { afterEach, before, describe, it } from "node:test";
import { eq, like } from "drizzle-orm";

import { db } from "../db";
import {
  applications,
  candidates,
  events,
  jobPostings,
  onboarding,
} from "@shared/schema";
import { storage } from "../storage";

const FIXTURE_MARKER = "__admit_eligible__";

interface AdmitFixture {
  eventId: string;
  jobId: string;
  secondJobId?: string;
  // candidateId -> friendly label for assertions
  candidateLabels: Map<string, string>;
}

async function seedFixture(): Promise<AdmitFixture> {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const [event] = await db.insert(events).values({
    name: `${FIXTURE_MARKER}-event-${suffix}`,
    startDate: "2026-01-01",
  }).returning();

  const [job] = await db.insert(jobPostings).values({
    title: `${FIXTURE_MARKER}-job-${suffix}`,
    eventId: event.id,
  }).returning();

  const labels = new Map<string, string>();

  // ─── Candidate A: shortlisted, eligible (the happy path) ─────────────
  const [candA] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-A-${suffix}`,
    phone: `+96650${Math.floor(1000000 + Math.random() * 8999999)}`,
  }).returning();
  await db.insert(applications).values({
    candidateId: candA.id, jobId: job.id, status: "shortlisted",
  });
  labels.set(candA.id, "A:eligible");

  // ─── Candidate B: shortlisted but archived → MUST be excluded ────────
  const [candB] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-B-${suffix}`,
    phone: `+96650${Math.floor(1000000 + Math.random() * 8999999)}`,
    archivedAt: new Date(),
  }).returning();
  await db.insert(applications).values({
    candidateId: candB.id, jobId: job.id, status: "shortlisted",
  });
  labels.set(candB.id, "B:archived");

  // ─── Candidate C: shortlisted but already has an active onboarding
  //                  row → MUST be excluded ───────────────────────────
  const [candC] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-C-${suffix}`,
    phone: `+96650${Math.floor(1000000 + Math.random() * 8999999)}`,
  }).returning();
  const [appC] = await db.insert(applications).values({
    candidateId: candC.id, jobId: job.id, status: "shortlisted",
  }).returning();
  await db.insert(onboarding).values({
    candidateId: candC.id, applicationId: appC.id, jobId: job.id, eventId: event.id,
    status: "in_progress", hasPhoto: false, hasIban: false, hasNationalId: false, reminderCount: 0,
  });
  labels.set(candC.id, "C:active-onboarding");

  // ─── Candidate D: shortlisted with a *converted* onboarding row →
  //                  MUST still be eligible (converted is not active) ──
  const [candD] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-D-${suffix}`,
    phone: `+96650${Math.floor(1000000 + Math.random() * 8999999)}`,
  }).returning();
  const [appD] = await db.insert(applications).values({
    candidateId: candD.id, jobId: job.id, status: "shortlisted",
  }).returning();
  await db.insert(onboarding).values({
    candidateId: candD.id, applicationId: appD.id, jobId: job.id, eventId: event.id,
    status: "converted", hasPhoto: false, hasIban: false, hasNationalId: false, reminderCount: 0,
  });
  labels.set(candD.id, "D:converted-only");

  // ─── Candidate E: only application is "new" (not shortlisted) →
  //                  MUST be excluded ─────────────────────────────────
  const [candE] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-E-${suffix}`,
    phone: `+96650${Math.floor(1000000 + Math.random() * 8999999)}`,
  }).returning();
  await db.insert(applications).values({
    candidateId: candE.id, jobId: job.id, status: "new",
  });
  labels.set(candE.id, "E:not-shortlisted");

  // ─── Candidate F: TWO shortlisted applications (to two different
  //                  jobs — applications has a unique (candidateId,
  //                  jobId) index so the same candidate can only apply
  //                  to a given job once) → MUST appear once, carrying
  //                  the LATER applicationId (deduped by applied_at
  //                  DESC). This pins the DISTINCT ON ────────────────
  const [job2] = await db.insert(jobPostings).values({
    title: `${FIXTURE_MARKER}-job-${suffix}-second`,
    eventId: event.id,
  }).returning();
  const [candF] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-F-${suffix}`,
    phone: `+96650${Math.floor(1000000 + Math.random() * 8999999)}`,
  }).returning();
  const earlier = new Date(Date.now() - 60_000);
  const later = new Date();
  const [appFold] = await db.insert(applications).values({
    candidateId: candF.id, jobId: job.id, status: "shortlisted", appliedAt: earlier,
  }).returning();
  const [appFnew] = await db.insert(applications).values({
    candidateId: candF.id, jobId: job2.id, status: "shortlisted", appliedAt: later,
  }).returning();
  labels.set(candF.id, `F:dedupe(latest=${appFnew.id},older=${appFold.id})`);

  return { eventId: event.id, jobId: job.id, candidateLabels: labels, secondJobId: job2.id };
}

async function tearDownFixture(f: AdmitFixture | null): Promise<void> {
  if (!f) return;
  const ids = Array.from(f.candidateLabels.keys());
  for (const id of ids) {
    await db.delete(onboarding).where(eq(onboarding.candidateId, id));
    await db.delete(applications).where(eq(applications.candidateId, id));
    await db.delete(candidates).where(eq(candidates.id, id));
  }
  // jobPostings.event_id has a FK to events — drop jobs first.
  await db.delete(jobPostings).where(eq(jobPostings.id, f.jobId));
  if (f.secondJobId) {
    await db.delete(jobPostings).where(eq(jobPostings.id, f.secondJobId));
  }
  await db.delete(events).where(eq(events.id, f.eventId));
}

describe("storage.getAdmitEligibleCandidates", () => {
  let fixture: AdmitFixture | null = null;

  before(async () => {
    // Drop any stragglers from previously aborted runs. Order matters
    // because of FKs: applications → candidates → onboarding need their
    // candidates around, and jobPostings.event_id → events forces jobs
    // to drop before events.
    await db.delete(candidates).where(like(candidates.fullNameEn, `${FIXTURE_MARKER}-%`));
    await db.delete(jobPostings).where(like(jobPostings.title, `${FIXTURE_MARKER}-job-%`));
    await db.delete(events).where(like(events.name, `${FIXTURE_MARKER}-event-%`));
  });

  afterEach(async () => {
    await tearDownFixture(fixture);
    fixture = null;
  });

  it("returns shortlisted, non-archived candidates with no active onboarding (dedup'd by latest application)", async () => {
    fixture = await seedFixture();

    const result = await storage.getAdmitEligibleCandidates();
    const myRows = result.filter(r => fixture!.candidateLabels.has(r.id));
    const byCandidate = new Map(myRows.map(r => [r.id, r]));

    // Eligible: A and D (shortlisted, no active onboarding) and F (dedup'd to 1).
    const expectedEligible = Array.from(fixture.candidateLabels.entries())
      .filter(([, l]) => l.startsWith("A:") || l.startsWith("D:") || l.startsWith("F:"))
      .map(([id]) => id);
    for (const id of expectedEligible) {
      assert.ok(
        byCandidate.has(id),
        `candidate ${fixture.candidateLabels.get(id)} MUST be eligible (was missing from results)`,
      );
    }

    // Excluded: B (archived), C (active onboarding), E (not shortlisted).
    const expectedExcluded = Array.from(fixture.candidateLabels.entries())
      .filter(([, l]) => l.startsWith("B:") || l.startsWith("C:") || l.startsWith("E:"))
      .map(([id]) => id);
    for (const id of expectedExcluded) {
      assert.ok(
        !byCandidate.has(id),
        `candidate ${fixture.candidateLabels.get(id)} MUST be excluded (but appeared in results)`,
      );
    }

    // F dedup: exactly one row, carrying the LATER applicationId. The
    // admit POST links onboarding.applicationId to this value, so the
    // wrong choice would link the wrong job to the new onboarding row.
    const fId = Array.from(fixture.candidateLabels.entries()).find(([, l]) => l.startsWith("F:"))![0];
    const fRows = myRows.filter(r => r.id === fId);
    assert.equal(fRows.length, 1, "candidate F MUST appear exactly once (DISTINCT ON candidate_id)");
    const fLabel = fixture.candidateLabels.get(fId)!;
    const latestId = fLabel.match(/latest=([^,]+)/)![1];
    assert.equal(
      fRows[0].applicationId,
      latestId,
      "dedup MUST keep the LATEST shortlisted application (ORDER BY applied_at DESC)",
    );
  });
});
