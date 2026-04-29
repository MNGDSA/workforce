// Task #215 — regression coverage for the safety properties Task #214
// hardened in `server/onboarding-reminders.ts`.
//
// The reminder engine has three subtle race / partial-state edges that
// admin-facing behaviour silently depends on:
//
//   1. Compare-and-swap on reminder_count + dedupeKey on the SMS row
//      means two concurrent claim attempts on the same onboarding row
//      may only ever produce ONE outbox row, and reminder_count must
//      advance by EXACTLY one. Without this, a manual "Send now" while
//      the hourly sweep is mid-flight would double-SMS the candidate.
//
//   2. The atomic transaction wrapping the count-bump and outbox insert
//      means a dedupe-key collision on the outbox insert (e.g.
//      crash-recovery scenario where the row already exists) MUST roll
//      back the count bump. Otherwise the count creeps without the SMS
//      ever being queued and the candidate ages out of reminders.
//
//   3. Auto-elimination performs three observable side effects in
//      sequence: stamp `eliminated_at`, flip the application status to
//      "interviewed", run the shared shortlist-reset cleanup. If the
//      cleanup throws mid-flight, ALL THREE must roll back together —
//      otherwise the candidate is stuck at "interviewed" while the
//      onboarding row still appears resumable, and the next sweep will
//      not retry because `eliminated_at` was left stamped.
//
// Each test seeds its own candidate (and, where needed, application +
// job posting + event) with a unique fixture marker, drives the
// internal helpers exposed via `__internal`, asserts on the persisted
// DB state, and tears down everything it created in `afterEach`. The
// tests do not share state and run against the dev DB so the actual
// Postgres CAS / unique-index semantics are exercised end-to-end.

import { strict as assert } from "node:assert";
import { afterEach, before, describe, it, mock } from "node:test";
import { and, eq, like, sql } from "drizzle-orm";

import { db } from "../db";
import { storage } from "../storage";
import {
  applications,
  candidates,
  events,
  jobPostings,
  onboarding,
  smsOutbox,
  type InsertAuditLog,
  type OnboardingRecord,
} from "@shared/schema";
import {
  __internal,
  setReminderConfig,
  type ReminderConfig,
  type ReminderDocId,
} from "../onboarding-reminders";

// ─── Fixture helpers ────────────────────────────────────────────────────────

// Marker baked into every fixture name so the cleanup query at the end
// of each test (and the safety net in `before`) catches everything this
// file created without colliding with any real seed data.
const FIXTURE_MARKER = "__t215_safety__";

interface SafetyFixture {
  candidateId: string;
  onboardingId: string;
  applicationId: string | null;
  jobId: string | null;
  eventId: string | null;
}

// Seed a candidate + onboarding row (and optionally an application + job
// posting + event) all marked with the fixture marker. Returns the ids
// for the test to operate on.
async function seedFixture(opts: { withApplication: boolean }): Promise<SafetyFixture> {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const phone = `+9665${Math.floor(10000000 + Math.random() * 89999999)}`;

  const [candidate] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-${suffix}`,
    phone,
  }).returning();

  let applicationId: string | null = null;
  let jobId: string | null = null;
  let eventId: string | null = null;

  if (opts.withApplication) {
    const [event] = await db.insert(events).values({
      name: `${FIXTURE_MARKER}-event-${suffix}`,
      startDate: "2026-01-01",
    }).returning();
    eventId = event.id;

    const [job] = await db.insert(jobPostings).values({
      title: `${FIXTURE_MARKER}-job-${suffix}`,
      eventId: event.id,
    }).returning();
    jobId = job.id;

    const [app] = await db.insert(applications).values({
      candidateId: candidate.id,
      jobId: job.id,
      // "shortlisted" is the realistic pre-elimination state — admins
      // shortlist a candidate, an onboarding row appears, the candidate
      // never uploads docs, the engine eliminates them. The catch-block
      // revert MUST put the application back here, not at "interviewed".
      status: "shortlisted",
    }).returning();
    applicationId = app.id;
  }

  // The reminder engine reads `createdAt` to derive cadence; we backdate
  // it well past the first-reminder window so `claimAndEnqueueReminder`
  // never short-circuits on "not yet due". The DB default is `now()`,
  // so we explicitly override.
  const backdated = new Date(Date.now() - 10 * 86400_000);
  const [ob] = await db.insert(onboarding).values({
    candidateId: candidate.id,
    applicationId,
    jobId,
    eventId,
    status: "in_progress",
    hasPhoto: false,
    hasIban: false,
    hasNationalId: false,
    reminderCount: 0,
    createdAt: backdated,
    updatedAt: backdated,
  }).returning();

  return {
    candidateId: candidate.id,
    onboardingId: ob.id,
    applicationId,
    jobId,
    eventId,
  };
}

// Tear down everything the test created. We delete by id to be precise
// (avoids racing with parallel test files that might share the marker).
async function tearDownFixture(f: SafetyFixture | null): Promise<void> {
  if (!f) return;
  // sms_outbox dedupe rows reference the onboarding id via dedupeKey
  // (not a FK), so clean those up first.
  await db.delete(smsOutbox).where(
    sql`${smsOutbox.dedupeKey} LIKE ${`onboarding_reminder:${f.onboardingId}:%`}`,
  );
  await db.delete(smsOutbox).where(
    eq(smsOutbox.dedupeKey, `onboarding_final_warning:${f.onboardingId}`),
  );
  // FK cascade from candidates → applications → onboarding handles the rest,
  // but we delete the onboarding row first in case the test already did.
  await db.delete(onboarding).where(eq(onboarding.id, f.onboardingId));
  if (f.applicationId) {
    await db.delete(applications).where(eq(applications.id, f.applicationId));
  }
  await db.delete(candidates).where(eq(candidates.id, f.candidateId));
  if (f.jobId) {
    await db.delete(jobPostings).where(eq(jobPostings.id, f.jobId));
  }
  if (f.eventId) {
    await db.delete(events).where(eq(events.id, f.eventId));
  }
}

// Best-effort reset of the global reminder config used by the engine —
// the helpers we exercise read the persisted config, so we make sure
// the tests run with a known, enabled config and restore the prior
// state at the end. Returns the prior raw value so the test file can
// put it back.
async function withEnabledConfig(): Promise<{ restore: () => Promise<void> }> {
  const prior = await storage.getSystemSetting("onboarding_reminder_config");
  await setReminderConfig({
    enabled: true,
    firstAfterHours: 1,
    repeatEveryHours: 1,
    maxReminders: 3,
    totalDeadlineDays: 4,
    finalWarningHours: 24,
    quietHoursStart: "00:00",
    quietHoursEnd: "00:00",
    quietHoursTz: "Asia/Riyadh",
    requiredDocs: ["photo", "iban", "national_id"],
  });
  return {
    restore: async () => {
      if (prior == null) {
        await storage.setSystemSetting("onboarding_reminder_config", "");
      } else {
        await storage.setSystemSetting("onboarding_reminder_config", prior);
      }
    },
  };
}

// Convenience: read the onboarding row back (fresh, no caching).
async function readOnboarding(id: string): Promise<OnboardingRecord | undefined> {
  const [row] = await db.select().from(onboarding).where(eq(onboarding.id, id));
  return row;
}

// Convenience: read the application status back.
async function readAppStatus(id: string): Promise<string | undefined> {
  const [row] = await db.select({ status: applications.status }).from(applications).where(eq(applications.id, id));
  return row?.status;
}

// Convenience: count outbox rows for this onboarding (excluding the
// final-warning slot — the tests below only care about regular reminders).
async function countReminderOutboxRows(onboardingId: string): Promise<number> {
  const rows = await db.select({ id: smsOutbox.id })
    .from(smsOutbox)
    .where(like(smsOutbox.dedupeKey, `onboarding_reminder:${onboardingId}:%`));
  return rows.length;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Onboarding reminder safety properties (task #215)", () => {
  let fixture: SafetyFixture | null = null;
  let restoreConfig: (() => Promise<void>) | null = null;

  before(async () => {
    // Safety net — if a previous run aborted partway through, drop any
    // stragglers carrying our marker so the unique constraints don't
    // trip on a re-run.
    await db.delete(candidates).where(like(candidates.fullNameEn, `${FIXTURE_MARKER}-%`));
    await db.delete(events).where(like(events.name, `${FIXTURE_MARKER}-event-%`));
    await db.delete(jobPostings).where(like(jobPostings.title, `${FIXTURE_MARKER}-job-%`));
  });

  afterEach(async () => {
    await tearDownFixture(fixture);
    fixture = null;
    if (restoreConfig) {
      await restoreConfig();
      restoreConfig = null;
    }
  });

  it("two concurrent reminder claims produce exactly one SMS and bump reminder_count by exactly one", async () => {
    fixture = await seedFixture({ withApplication: false });
    const { restore } = await withEnabledConfig();
    restoreConfig = restore;

    const before = await readOnboarding(fixture.onboardingId);
    assert.ok(before, "fixture row must exist");
    assert.equal(before!.reminderCount, 0, "fresh fixture starts at reminder_count=0");

    // The "two concurrent writers observe the same reminderCount"
    // scenario — exactly the race the CAS guard was designed for.
    // Both calls receive the same in-memory snapshot (`before`) so
    // they both compute nextN=1. Postgres serialises the conditional
    // UPDATE; only one can match `reminder_count = 0` and survive.
    const cfg: ReminderConfig = {
      ...__internal.DEFAULT_CONFIG,
      enabled: true,
      enabledAt: new Date(0).toISOString(),
      requiredDocs: ["photo", "iban", "national_id"],
    };
    const missing: ReminderDocId[] = ["photo", "iban", "national_id"];
    const now = new Date();

    const [a, b] = await Promise.all([
      __internal.claimAndEnqueueReminder(before!, missing, now, cfg),
      __internal.claimAndEnqueueReminder(before!, missing, now, cfg),
    ]);

    // Exactly one writer succeeds — the other must observe the bumped
    // reminder_count via the CAS predicate failing and exit silently.
    assert.equal(
      [a, b].filter(Boolean).length,
      1,
      `expected exactly one claim to succeed, got [${a}, ${b}]`,
    );

    const after = await readOnboarding(fixture.onboardingId);
    assert.equal(after!.reminderCount, 1, "reminder_count must advance by exactly 1, never 2");
    assert.ok(after!.lastReminderSentAt, "lastReminderSentAt must be stamped by the winning writer");

    const outboxCount = await countReminderOutboxRows(fixture.onboardingId);
    assert.equal(
      outboxCount,
      1,
      `expected exactly one sms_outbox row for the reminder, got ${outboxCount}`,
    );
  });

  it("dedupe-key collision on the outbox insert rolls back the reminder_count bump", async () => {
    fixture = await seedFixture({ withApplication: false });
    const { restore } = await withEnabledConfig();
    restoreConfig = restore;

    const before = await readOnboarding(fixture.onboardingId);
    assert.equal(before!.reminderCount, 0);

    // Simulate the crash-recovery edge: a previous attempt already
    // wrote the dedupe row but its reminder_count bump never made it.
    // The next claim must observe ON CONFLICT DO NOTHING and roll the
    // count bump back inside its transaction so the engine's view of
    // state stays self-consistent.
    const dedupeKey = `onboarding_reminder:${fixture.onboardingId}:1`;
    await db.insert(smsOutbox).values({
      candidateId: fixture.candidateId,
      recipientPhone: "+966500000000",
      kind: "onboarding_reminder",
      payload: { onboardingId: fixture.onboardingId, prepopulated: true },
      dedupeKey,
    });

    const cfg: ReminderConfig = {
      ...__internal.DEFAULT_CONFIG,
      enabled: true,
      enabledAt: new Date(0).toISOString(),
      requiredDocs: ["photo", "iban", "national_id"],
    };
    const missing: ReminderDocId[] = ["photo", "iban", "national_id"];

    const claimed = await __internal.claimAndEnqueueReminder(before!, missing, new Date(), cfg);
    assert.equal(claimed, false, "claim must report failure when the outbox dedupe row already exists");

    const after = await readOnboarding(fixture.onboardingId);
    assert.equal(
      after!.reminderCount,
      0,
      "reminder_count MUST stay at 0 — bumping it without an SMS being queued would silently age the candidate out of reminders",
    );
    assert.equal(
      after!.lastReminderSentAt,
      null,
      "lastReminderSentAt must also be rolled back — it is part of the same transaction",
    );

    // Only the prepopulated row should exist; no second insert was made.
    const outboxCount = await countReminderOutboxRows(fixture.onboardingId);
    assert.equal(outboxCount, 1, "no new outbox row should be inserted on collision");
  });

  it("a failure mid-elimination (BEFORE the onboarding row is deleted) rolls back eliminated_at, the application status, AND leaves the onboarding row intact", async () => {
    fixture = await seedFixture({ withApplication: true });
    assert.ok(fixture.applicationId, "fixture must include an application for this test");

    // Sanity-check the seeded state — we're going to assert on these
    // exact values being restored after the forced failure.
    const startingAppStatus = await readAppStatus(fixture.applicationId!);
    assert.equal(startingAppStatus, "shortlisted", "fixture seeds the application as 'shortlisted'");

    // Force `applyShortlistResetCleanup` to throw mid-elimination by
    // stubbing the storage call it depends on. This lands the throw
    // AFTER the application status flip but BEFORE the onboarding
    // delete — i.e. the exact window where partial state would leak
    // without the rollback hardening.
    const stub = mock.method(storage, "deleteOnboardingRecord", async () => {
      throw new Error("forced-failure-mid-elimination");
    });

    try {
      const before = await readOnboarding(fixture.onboardingId);
      const ok = await __internal.eliminateOnboarding(before!);
      assert.equal(ok, false, "eliminate must report failure when the cleanup helper throws");
    } finally {
      stub.mock.restore();
    }

    // 1. eliminated_at MUST be reverted so the next sweep retries.
    const after = await readOnboarding(fixture.onboardingId);
    assert.ok(after, "onboarding row MUST still exist (cleanup never ran to completion)");
    assert.equal(
      after!.eliminatedAt,
      null,
      "eliminated_at MUST be reverted to NULL — leaving it stamped would block all future sweeps",
    );

    // 2. application status MUST be restored to its pre-update value.
    //    Without this revert the candidate would be stuck at
    //    'interviewed' even though no elimination actually happened.
    const restoredAppStatus = await readAppStatus(fixture.applicationId!);
    assert.equal(
      restoredAppStatus,
      "shortlisted",
      "application status MUST be reverted from 'interviewed' back to its pre-update value",
    );

    // 3. The onboarding row's reminder bookkeeping should be preserved
    //    so the engine has the same visibility it had before the failed
    //    attempt.
    assert.equal(after!.status, "in_progress", "onboarding status must be left untouched");
    assert.equal(after!.reminderCount, 0, "reminder_count must not have been mutated");
  });

  it("a failure on the final audit-log write rolls everything back atomically (Task #219 — single-transaction semantics)", async () => {
    // Task #219 makes elimination atomic: the eliminated_at stamp, the
    // application status flip, the onboarding row delete, and the final
    // audit log all live inside one Postgres transaction. If any of
    // them throws — including the LAST write — Postgres rolls the whole
    // set back, so partial state is impossible by construction.
    //
    // This test exercises the "last write throws" edge specifically:
    // earlier writes (incl. the in-cleanup auto_remove_on_reset audit
    // log AND the onboarding delete) succeed, but the final
    // onboarding.auto_eliminated audit log throws. We assert that the
    // deletion and the status flip are BOTH undone — i.e. the row is
    // restored and the app is back to its pre-update status — so the
    // next sweep retries from a clean slate.
    //
    // (The old manual-revert design left the deletion intact in this
    // window because there was no way to un-delete a row outside a
    // transaction. The atomic design removes that limitation.)
    fixture = await seedFixture({ withApplication: true });
    assert.ok(fixture.applicationId, "fixture must include an application for this test");

    const startingAppStatus = await readAppStatus(fixture.applicationId!);
    assert.equal(startingAppStatus, "shortlisted");

    // Mock the FINAL audit-log write to throw. Only the
    // action="onboarding.auto_eliminated" log is the "final" one; the
    // per-row log inside `applyShortlistResetCleanup`
    // (action="onboarding.auto_remove_on_reset") must still succeed so
    // the throw lands AFTER the deletion has been written into the
    // transaction (but before commit).
    const realCreateAuditLog = storage.createAuditLog.bind(storage);
    const stub = mock.method(storage, "createAuditLog", async (data: InsertAuditLog, tx?: any) => {
      if (data.action === "onboarding.auto_eliminated") {
        throw new Error("forced-failure-on-final-audit-log");
      }
      return realCreateAuditLog(data, tx);
    });

    try {
      const before = await readOnboarding(fixture.onboardingId);
      const ok = await __internal.eliminateOnboarding(before!);
      assert.equal(ok, false, "eliminate must report failure when the final audit-log write throws");
    } finally {
      stub.mock.restore();
    }

    // 1. The onboarding row MUST be restored — the in-tx delete was
    //    rolled back along with everything else. Without atomicity the
    //    row would stay deleted and the candidate would be unrecoverable.
    const after = await readOnboarding(fixture.onboardingId);
    assert.ok(
      after,
      "onboarding row MUST be restored by the transaction rollback — a deleted row with no audit trail is exactly the partial state Task #219 prevents",
    );
    assert.equal(
      after!.eliminatedAt,
      null,
      "eliminated_at MUST be NULL after rollback so the next sweep can re-evaluate the row",
    );
    assert.equal(after!.status, "in_progress", "onboarding status must be left untouched");
    assert.equal(after!.reminderCount, 0, "reminder_count must not have been mutated");

    // 2. The application status MUST be restored to its pre-update
    //    value. Postgres rolled the flip back as part of the same
    //    transaction; no manual revert needed.
    const finalAppStatus = await readAppStatus(fixture.applicationId!);
    assert.equal(
      finalAppStatus,
      "shortlisted",
      "application status MUST be restored to 'shortlisted' — the entire elimination is rolled back atomically",
    );
  });
});
