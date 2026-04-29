// Task #216 — Reminder rollback telemetry & alerting.
//
// The reminder engine's `claimAndEnqueueReminder` rolls back its
// count-bump transaction when the deterministic dedupeKey insert into
// `sms_outbox` reports a conflict (sentinel-throw path). Under normal
// operation that branch is unreachable: the conditional UPDATE on
// `reminder_count` already serializes writers, so two writers cannot
// both reach the INSERT for the same `(onboarding_id, n+1)` pair.
//
// In practice it CAN fire when something upstream is wrong:
//   - A crashed sweep partially committed an SMS row and left
//     `reminder_count` un-bumped, so the next sweep replays the same
//     dedupeKey.
//   - The hourly sweep is being triggered twice in the same minute by
//     a duplicate scheduler (e.g. APP_DOMAIN cutover, two app
//     instances sharing the cron).
//   - System clock drift causes the sweep window to overlap itself.
//
// Until this counter existed, the engine swallowed the rollback and
// returned `false`; operators only learned about a regression when
// candidates complained that reminders had stopped (because the
// dedupeKey insert blocks an already-counted slot from firing again).
//
// Storage: process-local ring buffer of timestamps, mirroring
// `server/rotation-rescue-telemetry.ts`. Single-instance Node deploy
// today; promote to a `system_settings` JSON row or a dedicated table
// if we ever scale the app horizontally.
//
// Alerting: when the trailing 60-minute count crosses
// `ALERT_THRESHOLD_PER_HOUR`, the recorder fires ONE admin alert via
// the existing `notifications` (admin alerts inbox) table. A
// debounce timestamp suppresses repeat alerts for the next
// `ALERT_DEBOUNCE_MS` so a sustained spike does not flood the inbox.

import { storage } from "./storage";

const RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 10_000;

// One hour rolling window for the alert threshold check.
const ALERT_WINDOW_MS = 60 * 60 * 1000;

// Threshold per rolling hour. Set deliberately low: under normal
// operation the sentinel branch should never fire. Three rollbacks in
// one hour already indicates either a duplicate scheduler or a sweep
// retry loop and is worth surfacing in the bell. Tune via this
// constant rather than a config row — operators want a stable signal,
// not a knob that can be dialed away.
const ALERT_THRESHOLD_PER_HOUR = 3;

// Suppress repeat alerts for 60 minutes after one fires. Without
// debouncing, a sustained spike (say 50 rollbacks in 5 minutes) would
// create 50 inbox rows. One alert is sufficient — operators will see
// the live count via the telemetry endpoint when they investigate.
const ALERT_DEBOUNCE_MS = 60 * 60 * 1000;

export type ReminderRollbackReason =
  // sms_outbox dedupeKey already exists for this (onboarding_id, n+1)
  // — the canonical sentinel path inside `claimAndEnqueueReminder`.
  | "dedupe_conflict";

interface ReminderRollbackEvent {
  at: number;
  onboardingId: string;
  nextN: number;
  reason: ReminderRollbackReason;
}

const events: ReminderRollbackEvent[] = [];
let lastAlertedAt = 0;

function prune(now: number): void {
  const cutoff = now - RETENTION_MS;
  while (events.length > 0 && events[0].at < cutoff) {
    events.shift();
  }
  while (events.length > MAX_EVENTS) {
    events.shift();
  }
}

function countLastHour(now: number): number {
  const cutoff = now - ALERT_WINDOW_MS;
  let n = 0;
  // events are append-ordered, so iterate from the end and break
  // once we step out of the window.
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].at < cutoff) break;
    n++;
  }
  return n;
}

export interface RecordReminderRollbackInput {
  onboardingId: string;
  nextN: number;
  reason?: ReminderRollbackReason;
}

/**
 * Record a single rollback event and, if the trailing-hour count
 * crosses the threshold, fire a single (debounced) admin alert.
 *
 * Also emits a structured `[reminder-rollback]` log line so operators
 * who chart logs (e.g. via deployment log search) can correlate
 * spikes against the in-app counter.
 *
 * Always swallows alert-creation failures — the caller (the reminder
 * sweep) must not be blocked by a notifications-table outage.
 */
export async function recordReminderRollback(
  input: RecordReminderRollbackInput,
): Promise<void> {
  const now = Date.now();
  prune(now);
  const evt: ReminderRollbackEvent = {
    at: now,
    onboardingId: input.onboardingId,
    nextN: input.nextN,
    reason: input.reason ?? "dedupe_conflict",
  };
  events.push(evt);

  // Structured log line — picked up by deployment log search.
  // Keep the prefix stable so dashboards and alert rules can grep it.
  console.warn(
    `[reminder-rollback] reason=${evt.reason} onboardingId=${evt.onboardingId} nextN=${evt.nextN} hourly=${countLastHour(now)}`,
  );

  const hourly = countLastHour(now);
  if (
    hourly >= ALERT_THRESHOLD_PER_HOUR &&
    now - lastAlertedAt >= ALERT_DEBOUNCE_MS
  ) {
    try {
      await storage.createAdminAlert(
        "تنبيه: تراجعات غير معتادة في إرسال تذكيرات الإلحاق",
        `سجلنا ${hourly} حالة تراجع (rollback) خلال الساعة الأخيرة في محرك التذكيرات. قد يدل ذلك على تشغيل المجدول مرتين أو تعارض في مفتاح إزالة التكرار. راجع لوحة /api/admin/telemetry/reminder-rollbacks للتفاصيل.`,
        {
          kind: "onboarding_reminder_rollback_spike",
          hourlyCount: hourly,
          threshold: ALERT_THRESHOLD_PER_HOUR,
          windowMinutes: ALERT_WINDOW_MS / 60_000,
          mostRecentOnboardingId: evt.onboardingId,
          mostRecentNextN: evt.nextN,
          reason: evt.reason,
        },
      );
      // Only mark the debounce after the alert actually landed in the
      // inbox. If the notifications insert fails transiently (DB blip)
      // we still want the next rollback to retry the alert instead of
      // silently suppressing it for the debounce window.
      lastAlertedAt = now;
    } catch (alertErr) {
      console.error("[reminder-rollback] admin alert failed:", alertErr);
    }
  }
}

export interface ReminderRollbackSummary {
  windowHours: number;
  total: number;
  // Trailing-hour count — same number used to gate alerting. Lets the
  // admin dashboard display "current rate" without re-implementing
  // the math.
  lastHour: number;
  alertThresholdPerHour: number;
  // ISO timestamp of the last admin alert fired by this module, or
  // null if we have not alerted in this process. Lets operators see
  // whether a recent spike already produced an inbox entry.
  lastAlertedAt: string | null;
  oldestAt: string | null;
  mostRecentAt: string | null;
}

export function getReminderRollbackSummary(): ReminderRollbackSummary {
  const now = Date.now();
  prune(now);
  return {
    windowHours: 24,
    total: events.length,
    lastHour: countLastHour(now),
    alertThresholdPerHour: ALERT_THRESHOLD_PER_HOUR,
    lastAlertedAt: lastAlertedAt > 0 ? new Date(lastAlertedAt).toISOString() : null,
    oldestAt: events[0] ? new Date(events[0].at).toISOString() : null,
    mostRecentAt: events[events.length - 1]
      ? new Date(events[events.length - 1].at).toISOString()
      : null,
  };
}

// Test-only: clear buffer + debounce so individual tests are independent.
export function __resetReminderRollbackTelemetryForTests(): void {
  events.length = 0;
  lastAlertedAt = 0;
}
