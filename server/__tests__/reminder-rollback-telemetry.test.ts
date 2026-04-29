// Task #216 — pin the contract of the reminder-rollback rolling
// counter and the threshold-based admin alert hook. Until this signal
// existed, the sentinel rollback inside `claimAndEnqueueReminder` was
// completely silent — operators only learned about it when candidates
// complained about missing reminders.
//
// What we lock here:
//   - The summary starts empty with `lastAlertedAt=null` (distinct
//     from a real ISO string after a real alert fired).
//   - `lastHour` reflects only events in the trailing 60 minutes.
//   - Crossing `alertThresholdPerHour` fires exactly ONE admin alert
//     (debounced) — sustained spikes do not flood the inbox.
//   - The alert payload includes the running hourly count and the
//     onboarding id of the most recent rollback so operators can
//     locate the row.
//   - A failure inside `storage.createAdminAlert` does not throw out
//     of the recorder — the reminder sweep must keep advancing.
//
// Run with: `npm test`, or
// `npx tsx --test server/__tests__/reminder-rollback-telemetry.test.ts`.

import { strict as assert } from "node:assert";
import { describe, it, beforeEach, mock } from "node:test";

import {
  recordReminderRollback,
  getReminderRollbackSummary,
  __resetReminderRollbackTelemetryForTests,
} from "../reminder-rollback-telemetry";
import { storage } from "../storage";

describe("reminder-rollback-telemetry — Task #216", () => {
  beforeEach(() => {
    __resetReminderRollbackTelemetryForTests();
    mock.restoreAll();
  });

  it("starts empty with no alerts and no events", () => {
    const s = getReminderRollbackSummary();
    assert.equal(s.total, 0);
    assert.equal(s.lastHour, 0);
    assert.equal(s.lastAlertedAt, null);
    assert.equal(s.oldestAt, null);
    assert.equal(s.mostRecentAt, null);
    assert.equal(s.windowHours, 24);
    assert.ok(s.alertThresholdPerHour > 0);
  });

  it("counts each rollback in total and trailing-hour buckets", async () => {
    // Stub the alert sink so the threshold hit at the third event
    // does not require a real DB.
    const createAlert = mock.method(storage, "createAdminAlert", async () => ({} as never));

    await recordReminderRollback({ onboardingId: "ob1", nextN: 1 });
    await recordReminderRollback({ onboardingId: "ob2", nextN: 2 });

    const s = getReminderRollbackSummary();
    assert.equal(s.total, 2);
    assert.equal(s.lastHour, 2);
    assert.match(s.oldestAt!, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(s.mostRecentAt!, /^\d{4}-\d{2}-\d{2}T/);
    // Two events is below threshold (3) so no alert fired yet.
    assert.equal(createAlert.mock.callCount(), 0);
  });

  it("fires exactly one admin alert when the trailing-hour count crosses threshold", async () => {
    const createAlert = mock.method(storage, "createAdminAlert", async () => ({} as never));

    const threshold = getReminderRollbackSummary().alertThresholdPerHour;
    for (let i = 0; i < threshold; i++) {
      await recordReminderRollback({ onboardingId: `ob${i}`, nextN: i + 1 });
    }

    assert.equal(
      createAlert.mock.callCount(),
      1,
      "exactly one alert when threshold is first crossed",
    );
    const [, , metadata] = createAlert.mock.calls[0].arguments as [
      string,
      string,
      Record<string, unknown>,
    ];
    assert.equal(metadata.kind, "onboarding_reminder_rollback_spike");
    assert.equal(metadata.threshold, threshold);
    assert.equal(metadata.hourlyCount, threshold);
    assert.equal(metadata.mostRecentOnboardingId, `ob${threshold - 1}`);
    assert.equal(metadata.mostRecentNextN, threshold);
    assert.equal(metadata.reason, "dedupe_conflict");

    const s = getReminderRollbackSummary();
    assert.ok(s.lastAlertedAt, "lastAlertedAt is populated after first alert");
    assert.match(s.lastAlertedAt!, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("debounces follow-up alerts within the suppression window", async () => {
    const createAlert = mock.method(storage, "createAdminAlert", async () => ({} as never));

    const threshold = getReminderRollbackSummary().alertThresholdPerHour;
    // First batch crosses the threshold and fires one alert.
    for (let i = 0; i < threshold; i++) {
      await recordReminderRollback({ onboardingId: `ob${i}`, nextN: i + 1 });
    }
    // Sustained spike — should NOT fire a second alert immediately.
    for (let i = 0; i < threshold * 3; i++) {
      await recordReminderRollback({ onboardingId: `extra${i}`, nextN: 99 });
    }
    assert.equal(
      createAlert.mock.callCount(),
      1,
      "debounce keeps the inbox to a single alert during a sustained spike",
    );
  });

  it("never throws out of the recorder when the alert sink fails", async () => {
    mock.method(storage, "createAdminAlert", async () => {
      throw new Error("notifications table is unreachable");
    });
    const threshold = getReminderRollbackSummary().alertThresholdPerHour;
    for (let i = 0; i < threshold; i++) {
      await recordReminderRollback({ onboardingId: `ob${i}`, nextN: i + 1 });
    }
    // The recorder swallowed the alert failure; the counter still
    // advanced so operators can still see the spike via the endpoint.
    const s = getReminderRollbackSummary();
    assert.equal(s.total, threshold);
    assert.equal(s.lastHour, threshold);
    // And critically, lastAlertedAt is NOT set — so the next rollback
    // will retry the alert rather than being suppressed by debounce.
    assert.equal(s.lastAlertedAt, null);
  });

  it("retries the alert on the next rollback when a transient sink failure prevented the inbox row", async () => {
    let callCount = 0;
    const createAlert = mock.method(storage, "createAdminAlert", async () => {
      callCount++;
      if (callCount === 1) throw new Error("transient DB blip");
      return {} as never;
    });

    const threshold = getReminderRollbackSummary().alertThresholdPerHour;
    // Cross the threshold; first attempt fails so debounce should NOT
    // be armed.
    for (let i = 0; i < threshold; i++) {
      await recordReminderRollback({ onboardingId: `ob${i}`, nextN: i + 1 });
    }
    assert.equal(getReminderRollbackSummary().lastAlertedAt, null);

    // One more rollback while still over-threshold — recorder should
    // retry the alert, this time successfully.
    await recordReminderRollback({ onboardingId: "ob-retry", nextN: 99 });

    assert.equal(createAlert.mock.callCount(), 2, "alert is retried after transient failure");
    assert.ok(getReminderRollbackSummary().lastAlertedAt, "debounce arms only after the alert actually lands");
  });
});
