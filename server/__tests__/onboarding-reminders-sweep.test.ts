// Task #220 — regression coverage for the higher-level state transitions
// the hourly sweep is responsible for. Complements the helper-driven
// race / partial-state tests in `onboarding-reminders-safety.test.ts`
// by exercising the public entry point `runOnboardingReminderSweep`.
//
// Three behaviours the admin-facing contract silently relies on:
//
//   1. Quiet hours: rows in `due` state must be SKIPPED while the wall
//      clock falls inside the configured quiet window — but rows past
//      the elimination deadline must STILL be eliminated, because
//      eliminations are state changes (not notifications) and the
//      candidate ageing out of their window has nothing to do with
//      whether it's polite to text them at 03:00.
//
//   2. The `enabledAt` out-of-scope guard: rows whose `createdAt`
//      predates the most recent OFF→ON flip of the master switch must
//      never receive reminders or be eliminated. Without this guard,
//      flipping the loop on for the first time would auto-eliminate the
//      pre-existing pending-onboardings backlog in a single sweep.
//
//   3. The final-warning gate: rows past `finalWarningHours` from the
//      deadline must enqueue `onboarding_final_warning` exactly once
//      and the derived row state must flip to `warning` after the row
//      is updated. Re-running the sweep on the same row must be a
//      no-op (dedupe key + finalWarningSentAt CAS).
//
// Concurrency note: `npm test` runs each test file in its own worker
// process, but they all share the dev DB. Two specific cross-file
// hazards apply here, and both have explicit mitigations:
//
//   * The sweep reads its config from
//     `system_settings.onboarding_reminder_config` — the SAME key the
//     neighbouring safety tests mutate via `setReminderConfig`. To
//     avoid the safety test's config write landing in the middle of
//     our sweep, each test here stubs `storage.getSystemSetting` for
//     that single key so the sweep always observes OUR pinned config
//     regardless of what other workers do.
//
//   * `runOnboardingReminderSweep` operates on EVERY eligible
//     onboarding row in the DB (not just ours). The neighbouring
//     safety tests seed fixture rows that are ~10 days old, well past
//     the deadline for the cadence we use here. Without a guard, our
//     sweep would mass-eliminate those rows mid-test and the safety
//     test would observe its fixture vanishing under it. We narrow
//     `enabledAt` per test so the SQL filter (`createdAt >= enabledAt`)
//     excludes any 10-day-old row before the loop body runs — keeping
//     OUR row eligible while shielding the safety fixtures completely.
//
// Assertions are scoped to our own fixture's persisted state (count
// of outbox rows for our id, our row's stamps) rather than the global
// sweep counters — other workers may still seed onboarding rows of
// their own that would otherwise add to `result.eliminated` etc.

// Default NODE_ENV to "test" if the runner didn't set it. The shared
// portal-URL helper (server/lib/portal-url.ts) gates its
// REPLIT_DEV_DOMAIN fallback to dev/test environments only — without
// this default, the sweep's SMS-context resolver would throw under
// `npx tsx --test` because NODE_ENV is unset and PUBLIC_APP_URL isn't
// configured in the test process.
process.env.NODE_ENV ??= "test";

import { strict as assert } from "node:assert";
import { afterEach, before, describe, it, mock } from "node:test";
import { eq, like, sql } from "drizzle-orm";

import { db } from "../db";
import { storage } from "../storage";
import {
  applications,
  candidates,
  events,
  jobPostings,
  onboarding,
  smsOutbox,
  type OnboardingRecord,
} from "@shared/schema";
import {
  computeRowStatus,
  runOnboardingReminderSweep,
  type ReminderConfig,
} from "../onboarding-reminders";

// ─── Fixture helpers ────────────────────────────────────────────────────────

const FIXTURE_MARKER = "__t220_sweep__";
const SETTINGS_KEY = "onboarding_reminder_config";

interface SweepFixture {
  candidateId: string;
  onboardingId: string;
  applicationId: string | null;
  jobId: string | null;
  eventId: string | null;
}

interface SeedOpts {
  /** Seed an application + job posting + event so elimination exercises the full path. */
  withApplication: boolean;
  /** Override `createdAt` so the test can pin the row at a precise scheduling state. */
  createdAt: Date;
  /** Override `reminderCount` so the test can simulate "already sent N reminders". */
  reminderCount?: number;
  /** Pre-set finalWarningSentAt so the test can simulate "already warned". */
  finalWarningSentAt?: Date | null;
}

async function seedFixture(opts: SeedOpts): Promise<SweepFixture> {
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
      status: "shortlisted",
    }).returning();
    applicationId = app.id;
  }

  const [ob] = await db.insert(onboarding).values({
    candidateId: candidate.id,
    applicationId,
    jobId,
    eventId,
    status: "in_progress",
    hasPhoto: false,
    hasIban: false,
    hasNationalId: false,
    reminderCount: opts.reminderCount ?? 0,
    finalWarningSentAt: opts.finalWarningSentAt ?? null,
    createdAt: opts.createdAt,
    updatedAt: opts.createdAt,
  }).returning();

  return {
    candidateId: candidate.id,
    onboardingId: ob.id,
    applicationId,
    jobId,
    eventId,
  };
}

async function tearDownFixture(f: SweepFixture | null): Promise<void> {
  if (!f) return;
  await db.delete(smsOutbox).where(
    sql`${smsOutbox.dedupeKey} LIKE ${`onboarding_reminder:${f.onboardingId}:%`}`,
  );
  await db.delete(smsOutbox).where(
    eq(smsOutbox.dedupeKey, `onboarding_final_warning:${f.onboardingId}`),
  );
  // The onboarding row may already be gone (elimination tests); ignore mismatches.
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

/**
 * Pin the reminder config the sweep observes, regardless of what
 * other test workers may be writing to system_settings concurrently.
 *
 * We can't write to system_settings ourselves and rely on it staying
 * put — `npm test` parallelises test files and the safety test in
 * the neighbouring file mutates the same key. Instead, we stub
 * `storage.getSystemSetting` so the in-process call from
 * `getReminderConfig` always returns OUR config; every other key
 * (templates, public_app_url, etc.) is forwarded to the real impl.
 *
 * Returns a `restore` callback that puts the storage method back.
 */
function pinConfigForSweep(cfg: ReminderConfig): { restore: () => void } {
  const real = storage.getSystemSetting.bind(storage);
  const cfgJson = JSON.stringify(cfg);
  const stub = mock.method(storage, "getSystemSetting", async (key: string) => {
    if (key === SETTINGS_KEY) return cfgJson;
    return real(key);
  });
  return { restore: () => stub.mock.restore() };
}

/** Read a single onboarding row back fresh, no caching. */
async function readOnboarding(id: string): Promise<OnboardingRecord | undefined> {
  const [row] = await db.select().from(onboarding).where(eq(onboarding.id, id));
  return row;
}

/** Count regular-reminder outbox rows for a row id (excludes final-warning). */
async function countReminderOutboxRows(onboardingId: string): Promise<number> {
  const rows = await db.select({ id: smsOutbox.id })
    .from(smsOutbox)
    .where(like(smsOutbox.dedupeKey, `onboarding_reminder:${onboardingId}:%`));
  return rows.length;
}

/** Count final-warning outbox rows for a row id (always 0 or 1, dedupe-keyed). */
async function countFinalWarningOutboxRows(onboardingId: string): Promise<number> {
  const rows = await db.select({ id: smsOutbox.id })
    .from(smsOutbox)
    .where(eq(smsOutbox.dedupeKey, `onboarding_final_warning:${onboardingId}`));
  return rows.length;
}

/**
 * Compute the "minute of day" that the given Date falls on in the
 * Asia/Riyadh timezone. Used to construct a quiet-hours window around
 * the test's `now` so the sweep observes "we are inside quiet hours"
 * regardless of when the test happens to run.
 */
function riyadhMinutesOfDay(d: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return ((h % 24) * 60 + m) % 1440;
}

function fmtHHMM(totalMinutes: number): string {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Build a quiet-hours window that contains `now` in Asia/Riyadh
 * (start = now-2h, end = now+2h). Width is well within
 * `isInQuietHours`'s wraparound handling — the window stays
 * unambiguous even when `now` is near midnight.
 */
function quietWindowAroundNow(now: Date): { start: string; end: string } {
  const min = riyadhMinutesOfDay(now);
  return { start: fmtHHMM(min - 120), end: fmtHHMM(min + 120) };
}

/**
 * Build a quiet-hours window that does NOT contain `now`. Shifted
 * 12 hours away so we're solidly outside the window regardless of
 * minor formatting ambiguities at the boundary.
 */
function quietWindowAwayFromNow(now: Date): { start: string; end: string } {
  const min = riyadhMinutesOfDay(now);
  const opposite = (min + 12 * 60) % 1440;
  return { start: fmtHHMM(opposite - 60), end: fmtHHMM(opposite + 60) };
}

function baseConfig(): ReminderConfig {
  return {
    enabled: true,
    enabledAt: new Date(0).toISOString(),
    firstAfterHours: 1,
    repeatEveryHours: 1,
    maxReminders: 3,
    totalDeadlineDays: 4,
    finalWarningHours: 24,
    quietHoursStart: "00:00",
    quietHoursEnd: "00:00",
    quietHoursTz: "Asia/Riyadh",
    requiredDocs: ["photo", "iban", "national_id"],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Onboarding reminder sweep — state transitions (task #220)", () => {
  // Each test owns its own list of fixtures so we can seed multiple
  // rows in a single test and still tear them all down cleanly.
  let fixtures: SweepFixture[] = [];
  let restoreConfig: (() => void) | null = null;

  before(async () => {
    // Safety net for crashed prior runs — drop any stragglers carrying
    // our fixture marker so unique constraints don't trip on re-run.
    await db.delete(candidates).where(like(candidates.fullNameEn, `${FIXTURE_MARKER}-%`));
    await db.delete(events).where(like(events.name, `${FIXTURE_MARKER}-event-%`));
    await db.delete(jobPostings).where(like(jobPostings.title, `${FIXTURE_MARKER}-job-%`));
  });

  afterEach(async () => {
    for (const f of fixtures) await tearDownFixture(f);
    fixtures = [];
    if (restoreConfig) {
      restoreConfig();
      restoreConfig = null;
    }
  });

  it("during quiet hours: skips reminders for rows in `due` state but still eliminates rows past the deadline", async () => {
    const now = new Date();

    const cfg = baseConfig();
    // enabledAt sits between our oldest fixture row (5d) and the
    // safety test's 10d-old fixtures so the SQL filter includes ours
    // but excludes theirs (see the cross-file isolation note above).
    cfg.enabledAt = new Date(now.getTime() - 6 * 86400_000).toISOString();
    const quiet = quietWindowAroundNow(now);
    cfg.quietHoursStart = quiet.start;
    cfg.quietHoursEnd = quiet.end;
    const { restore } = pinConfigForSweep(cfg);
    restoreConfig = restore;

    // Row A: createdAt = now - 2h → past firstAfterHours=1, no reminder
    // sent yet → state "due". The sweep MUST NOT enqueue a reminder
    // for this row while we're inside quiet hours.
    const dueRow = await seedFixture({
      withApplication: false,
      createdAt: new Date(now.getTime() - 2 * 3600_000),
    });
    fixtures.push(dueRow);

    // Row B: createdAt = now - 5d → past totalDeadlineDays=4 → state
    // "eliminated". The sweep MUST eliminate it even during quiet
    // hours — eliminations are state changes, not notifications.
    const expiredRow = await seedFixture({
      withApplication: false,
      createdAt: new Date(now.getTime() - 5 * 86400_000),
    });
    fixtures.push(expiredRow);

    await runOnboardingReminderSweep(now);

    // Quiet-hours skip: no reminder SMS for the due row.
    assert.equal(
      await countReminderOutboxRows(dueRow.onboardingId),
      0,
      "due row must NOT have a reminder enqueued during quiet hours",
    );
    const dueAfter = await readOnboarding(dueRow.onboardingId);
    assert.ok(dueAfter, "due row must still exist (no elimination)");
    assert.equal(dueAfter!.reminderCount, 0, "reminder_count must remain 0 — no SMS was sent");
    assert.equal(dueAfter!.lastReminderSentAt, null, "lastReminderSentAt must remain null");

    // Elimination MUST fire despite quiet hours. Row B is SMP (no
    // application), so `eliminateOnboarding` deletes the row directly.
    const expiredAfter = await readOnboarding(expiredRow.onboardingId);
    assert.equal(
      expiredAfter,
      undefined,
      "past-deadline SMP row must be deleted by eliminateOnboarding even during quiet hours",
    );
  });

  it("the enabledAt out-of-scope guard: rows whose createdAt predates the most recent OFF→ON flip are NEVER reminded or eliminated", async () => {
    const now = new Date();

    // The row is created first so `enabledAt` lands AFTER its
    // createdAt — the exact "pre-existing backlog" scenario the guard
    // was added for.
    const oldRow = await seedFixture({
      withApplication: false,
      // 10 days old: well past both firstAfterHours AND totalDeadlineDays.
      // Without the guard, the sweep would try to eliminate this on
      // the first tick after the loop is enabled.
      createdAt: new Date(now.getTime() - 10 * 86400_000),
    });
    fixtures.push(oldRow);

    const cfg = baseConfig();
    // enabledAt is "now" — strictly AFTER the row's createdAt. The
    // sweep's WHERE clause `createdAt >= enabledAt` must filter the
    // row out entirely.
    cfg.enabledAt = now.toISOString();
    // Quiet hours OFF so we know any inaction here comes from the
    // enabledAt guard, not the quiet-hours skip.
    const awayWindow = quietWindowAwayFromNow(now);
    cfg.quietHoursStart = awayWindow.start;
    cfg.quietHoursEnd = awayWindow.end;
    const { restore } = pinConfigForSweep(cfg);
    restoreConfig = restore;

    await runOnboardingReminderSweep(now);

    // Persisted row state must be untouched — the SQL filter excluded
    // the row entirely, so no branch of the sweep ran for it.
    const after = await readOnboarding(oldRow.onboardingId);
    assert.ok(after, "pre-enable row must still exist after the sweep");
    assert.equal(after!.eliminatedAt, null, "eliminated_at must remain NULL — guard skipped the row");
    assert.equal(after!.reminderCount, 0, "reminder_count must remain 0");
    assert.equal(after!.lastReminderSentAt, null, "lastReminderSentAt must remain null");
    assert.equal(after!.finalWarningSentAt, null, "finalWarningSentAt must remain null");

    // No outbox rows of any kind for this onboarding id.
    assert.equal(
      await countReminderOutboxRows(oldRow.onboardingId),
      0,
      "no regular-reminder outbox rows should exist for a pre-enable row",
    );
    assert.equal(
      await countFinalWarningOutboxRows(oldRow.onboardingId),
      0,
      "no final-warning outbox row should exist for a pre-enable row",
    );
  });

  it("final-warning gate: enqueues exactly one final-warning SMS for our row, stamps finalWarningSentAt, flips derived state to `warning`, and is idempotent on a second sweep", async () => {
    const now = new Date();

    const cfg = baseConfig();
    // enabledAt sits between our 84h-old fixture row and the safety
    // test's 10d-old fixtures so the SQL filter includes ours but
    // excludes theirs (see the cross-file isolation note above).
    cfg.enabledAt = new Date(now.getTime() - 5 * 86400_000).toISOString();
    // Quiet hours OFF — we want the final-warning enqueue path to run.
    const awayWindow = quietWindowAwayFromNow(now);
    cfg.quietHoursStart = awayWindow.start;
    cfg.quietHoursEnd = awayWindow.end;
    const { restore } = pinConfigForSweep(cfg);
    restoreConfig = restore;

    // Row aged 84h: with totalDeadlineDays=4 (96h) and
    // finalWarningHours=24, the elimination point is now+12h and the
    // final-warning point is now-12h. We're past finalWarning and
    // still before deadline — exactly the slot the gate fires in.
    const row = await seedFixture({
      withApplication: false,
      createdAt: new Date(now.getTime() - 84 * 3600_000),
    });
    fixtures.push(row);

    const before = await readOnboarding(row.onboardingId);
    assert.ok(before, "fixture row must exist");
    assert.equal(before!.finalWarningSentAt, null, "fresh fixture starts without a final warning sent");

    // First sweep: must enqueue the final warning + stamp the row.
    await runOnboardingReminderSweep(now);

    const after1 = await readOnboarding(row.onboardingId);
    assert.ok(after1, "row must still exist (not eliminated yet, deadline is in the future)");
    assert.ok(after1!.finalWarningSentAt, "finalWarningSentAt MUST be stamped after the gate fires");
    assert.equal(after1!.eliminatedAt, null, "row must NOT be eliminated yet — deadline is +12h away");
    // The final-warning gate `continue`s before the regular-reminder
    // branch — reminder_count must not be bumped in the same tick.
    assert.equal(
      after1!.reminderCount,
      0,
      "reminder_count must NOT be bumped — final-warning is its own slot, not a regular reminder",
    );
    assert.equal(
      await countFinalWarningOutboxRows(row.onboardingId),
      1,
      "exactly one onboarding_final_warning outbox row must exist after the first sweep",
    );
    assert.equal(
      await countReminderOutboxRows(row.onboardingId),
      0,
      "no regular-reminder outbox rows for our row when the final-warning gate handled it",
    );

    // The derived state must flip to `warning` so the admin UI
    // visibly reflects "final warning sent, deadline imminent".
    const status1 = computeRowStatus(after1!, cfg, now);
    assert.equal(
      status1.state,
      "warning",
      "computeRowStatus MUST return 'warning' once finalWarningSentAt is set and we're <=24h to elimination",
    );

    // Second sweep: must be a no-op for this row. The dedupe key
    // blocks a second outbox insert, and finalWarningSentAt being
    // non-null gates the enqueue path out.
    await runOnboardingReminderSweep(now);
    assert.equal(
      await countFinalWarningOutboxRows(row.onboardingId),
      1,
      "still exactly one final-warning outbox row after the second sweep — dedupe key blocks any duplicate",
    );

    const after2 = await readOnboarding(row.onboardingId);
    assert.equal(
      after2!.finalWarningSentAt!.getTime(),
      after1!.finalWarningSentAt!.getTime(),
      "finalWarningSentAt must NOT be re-stamped on the second sweep",
    );
  });
});
