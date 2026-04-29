// Task #230 — extend reject-cleanup coverage to "withdrawn" and "closed".
//
// `applyApplicationStatusUpdate` (in `server/application-status-cleanup.ts`)
// sweeps active onboarding rows whenever a *shortlisted* application is
// flipped to ANY non-shortlisted status. The sibling test
// `reject-removes-onboarding.test.ts` (task #229) only locks in the
// "rejected" target. This file mirrors that pattern for the other two
// non-shortlisted statuses in the application_status enum
// ("withdrawn", "closed") so a future refactor that narrows the gate to
// rejected-only fails loudly here.

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
// which uses `__t229_reject_cleanup__`).
const FIXTURE_MARKER = "__t230_withdraw_close_cleanup__";

interface CleanupFixture {
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

// Seed the realistic "operator just flipped the application to
// withdrawn/closed" shape:
//   - one shortlisted application
//   - three active onboarding rows (one per removable status)
//   - one already-converted onboarding row that must be preserved
//
// Seeding multiple active rows guards against a bug where the cleanup
// only deletes the first match — every removable row must go.
async function seedFixture(): Promise<CleanupFixture> {
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

async function tearDownFixture(f: CleanupFixture | null): Promise<void> {
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

describe("Reverse-sync cleanup also fires for withdrawn / closed (task #230)", () => {
  let fixture: CleanupFixture | null = null;

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

  // The cleanup gate in `applyApplicationStatusUpdate` reads:
  //   previousStatus === "shortlisted" && newStatus !== "shortlisted"
  // so EVERY non-shortlisted target must trigger the sweep. We exercise
  // each of the two non-rejected terminal statuses the application
  // status enum exposes ("withdrawn", "closed"). If either case ever
  // stops sweeping, this loop fails for the offending status and names
  // it explicitly in the assertion message.
  for (const targetStatus of ["withdrawn", "closed"] as const) {
    it(`removes every active onboarding row when a shortlisted application is flipped to "${targetStatus}"`, async () => {
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

      // Act — flip the application to the non-shortlisted target via
      // the same helper the PATCH /api/applications/:id route uses.
      const updated = await applyApplicationStatusUpdate({
        applicationId: fixture.applicationId,
        data: { status: targetStatus },
        actor: { id: null, name: "test-admin" },
      });

      assert.ok(updated, "applyApplicationStatusUpdate must return the updated application");
      assert.equal(
        updated!.status,
        targetStatus,
        `application status MUST be updated to "${targetStatus}"`,
      );

      // 1. Application status was persisted as the target.
      assert.equal(
        await readAppStatus(fixture.applicationId),
        targetStatus,
        `application row in the database MUST read "${targetStatus}" after the flip`,
      );

      // 2. Every active onboarding row MUST be deleted. This is the
      //    core invariant: HR is promised that a
      //    withdrawn-or-closed candidate does not linger in the
      //    onboarding pipeline. If this assertion fails for either
      //    "withdrawn" or "closed", the cleanup gate has been
      //    accidentally narrowed (e.g. to `newStatus === "rejected"`).
      for (const id of fixture.activeOnboardingIds) {
        const row = await readOnboarding(id);
        assert.equal(
          row,
          undefined,
          `active onboarding row ${id} MUST be removed when the application is flipped to "${targetStatus}" — ` +
            `if this assertion fails, ${targetStatus} candidates are silently lingering in the onboarding pipeline`,
        );
      }

      // 3. The "converted" onboarding row MUST be preserved — the
      //    cleanup is scoped to pending|in_progress|ready and must
      //    never tear down completed onboarding history.
      const preservedAfter = await readOnboarding(fixture.preservedOnboardingId);
      assert.ok(
        preservedAfter,
        "non-active 'converted' onboarding row MUST be preserved (cleanup is scoped to active rows only)",
      );
      assert.equal(preservedAfter!.status, "converted");

      // 4. An audit log entry MUST be written for each removed row so
      //    HR has a paper trail of why the rows disappeared. We assert
      //    one entry per active row that got swept and confirm the
      //    audit metadata reflects the actual target status (otherwise
      //    a regression that hard-codes "rejected" in the audit
      //    description would slip through).
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
          `audit log MUST record the removal of onboarding row ${id} for "${targetStatus}" flip`,
        );
      }
      for (const a of audits) {
        const md = (a.metadata ?? {}) as Record<string, unknown>;
        assert.equal(
          md.newStatus,
          targetStatus,
          `audit metadata.newStatus MUST be "${targetStatus}" — guards against a regression that hard-codes the audit message to one status`,
        );
        assert.equal(
          md.previousStatus,
          "shortlisted",
          "audit metadata.previousStatus MUST capture the pre-flip 'shortlisted' state",
        );
      }
    });
  }
});
