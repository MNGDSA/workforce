// Task #214 — onboarding document-reminder engine.
//
// Single source of truth for: (a) the persisted reminder configuration
// (master switch, cadence, quiet hours, required-document list), (b) the
// derived per-row scheduling state (next send, elimination time,
// missing docs), and (c) the side-effecting sweep that enqueues
// reminder/final-warning SMS and eliminates expired rows.
//
// Storage: a single JSON blob in system_settings under
// `onboarding_reminder_config`. The frontend writes it via the
// settings tab; the scheduler reads it once per sweep.
//
// All scheduling math is server-side. The frontend asks the server for
// the derived per-row state via /api/onboarding/reminders/status — it
// never reproduces the cadence math itself, which prevents drift
// between admin previews and what actually fires.
import { and, eq, isNull, sql, gte, notInArray } from "drizzle-orm";
import { db } from "./db";
import {
  onboarding,
  applications,
  candidates,
  smsOutbox,
  systemSettings,
  type Application,
  type OnboardingRecord,
  type Candidate,
} from "@shared/schema";
import { storage } from "./storage";
import { applyShortlistResetCleanup, applySystemApplicationStatusFlip } from "./application-status-cleanup";
import { recordReminderRollback } from "./reminder-rollback-telemetry";

// ─── Config ────────────────────────────────────────────────────────────────

export type ReminderDocId = "photo" | "iban" | "national_id" | "vaccination_report";

export interface ReminderConfig {
  enabled: boolean;
  /**
   * ISO timestamp of the most recent OFF→ON flip of `enabled`. The
   * sweep filters onboarding rows by `createdAt >= enabledAt` so a
   * historical backlog cannot suddenly start receiving reminders the
   * moment an admin enables the loop. Null when `enabled` is false.
   */
  enabledAt: string | null;
  firstAfterHours: number;        // first reminder = createdAt + this
  repeatEveryHours: number;       // subsequent reminders cadence
  maxReminders: number;           // hard cap on how many to send
  totalDeadlineDays: number;      // overall deadline from createdAt → eliminate (days)
  finalWarningHours: number;      // how far before deadline to send last-chance SMS
  quietHoursStart: string;        // "HH:MM" in tz
  quietHoursEnd: string;          // "HH:MM" in tz
  quietHoursTz: string;           // IANA timezone
  requiredDocs: ReminderDocId[];  // which docs admin cares about
}

// Sensible defaults — master switch OFF, quiet 21:00–08:00 Riyadh,
// matches the Q&A locked spec.
const DEFAULT_CONFIG: ReminderConfig = {
  enabled: false,
  enabledAt: null,
  firstAfterHours: 24,
  repeatEveryHours: 24,
  maxReminders: 3,
  totalDeadlineDays: 4,
  finalWarningHours: 24,
  quietHoursStart: "21:00",
  quietHoursEnd: "08:00",
  quietHoursTz: "Asia/Riyadh",
  requiredDocs: ["photo", "iban", "national_id", "vaccination_report"],
};

const SETTINGS_KEY = "onboarding_reminder_config";

export async function getReminderConfig(): Promise<ReminderConfig> {
  const raw = await storage.getSystemSetting(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function setReminderConfig(patch: Partial<ReminderConfig>): Promise<ReminderConfig> {
  const current = await getReminderConfig();
  const next: ReminderConfig = { ...current, ...patch };
  // Stamp enabledAt on OFF→ON transitions; clear it on ON→OFF. The
  // sweep uses this to avoid acting on rows that pre-date the most
  // recent enablement (out-of-scope guard, per spec).
  if (!current.enabled && next.enabled) {
    next.enabledAt = new Date().toISOString();
  } else if (current.enabled && !next.enabled) {
    next.enabledAt = null;
  } else {
    next.enabledAt = current.enabledAt;
  }
  // Normalize the doc list — drop unknown ids, dedupe, preserve order.
  const knownDocs: ReminderDocId[] = ["photo", "iban", "national_id", "vaccination_report"];
  const seen = new Set<string>();
  next.requiredDocs = (Array.isArray(next.requiredDocs) ? next.requiredDocs : [])
    .filter((d): d is ReminderDocId =>
      knownDocs.includes(d as ReminderDocId) && !seen.has(d) && (seen.add(d), true),
    );
  next.firstAfterHours    = clampHours(next.firstAfterHours,    0, 24 * 30);
  next.repeatEveryHours   = clampHours(next.repeatEveryHours,   0, 24 * 30);
  next.maxReminders       = clampInt(next.maxReminders,         0, 20);
  next.totalDeadlineDays  = clampInt(next.totalDeadlineDays,   0, 365);
  next.finalWarningHours  = clampHours(next.finalWarningHours,  0, 24 * 30);
  await storage.setSystemSetting(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

// ─── Templates (system_settings keys) ───────────────────────────────────────
// Stored separately from the config blob so an admin can iterate on
// copy without tripping numeric validation. Each template supports the
// placeholders {name}, {missing_docs}, {portal_url}, {deadline_date}.

export type ReminderTemplateKey =
  | "onboarding_reminder_sms_ar"
  | "onboarding_reminder_sms_en"
  | "onboarding_final_warning_sms_ar"
  | "onboarding_final_warning_sms_en";

export const REMINDER_TEMPLATE_KEYS: ReminderTemplateKey[] = [
  "onboarding_reminder_sms_ar",
  "onboarding_reminder_sms_en",
  "onboarding_final_warning_sms_ar",
  "onboarding_final_warning_sms_en",
];

const TEMPLATE_DEFAULTS: Record<ReminderTemplateKey, string> = {
  onboarding_reminder_sms_ar:
    "وورك فورس: {name}، لم يكتمل تأهيلك بعد. يُرجى رفع المستندات التالية للحفاظ على عرض العمل: {missing_docs}. آخر موعد: {deadline_date}. تسجيل الدخول: {portal_url}",
  onboarding_reminder_sms_en:
    "Workforce: {name}, your onboarding is incomplete. Please upload: {missing_docs}. Deadline: {deadline_date}. Log in: {portal_url}",
  onboarding_final_warning_sms_ar:
    "وورك فورس: تنبيه أخير {name} — سيتم إلغاء تأهيلك في {deadline_date} ما لم ترفع: {missing_docs}. سجّل الدخول الآن: {portal_url}",
  onboarding_final_warning_sms_en:
    "Workforce: FINAL NOTICE {name} — your onboarding will be cancelled on {deadline_date} unless you upload: {missing_docs}. Log in now: {portal_url}",
};

export async function getReminderTemplate(key: ReminderTemplateKey): Promise<string> {
  const raw = await storage.getSystemSetting(key);
  return raw && raw.trim().length > 0 ? raw : TEMPLATE_DEFAULTS[key];
}

export async function getAllReminderTemplates(): Promise<Record<ReminderTemplateKey, string>> {
  const out = {} as Record<ReminderTemplateKey, string>;
  for (const k of REMINDER_TEMPLATE_KEYS) {
    out[k] = await getReminderTemplate(k);
  }
  return out;
}

export async function setReminderTemplates(
  patch: Partial<Record<ReminderTemplateKey, string>>,
): Promise<Record<ReminderTemplateKey, string>> {
  for (const k of REMINDER_TEMPLATE_KEYS) {
    const v = patch[k];
    if (typeof v === "string") {
      // Persist trimmed value; empty string falls back to default on read.
      await storage.setSystemSetting(k, v.trim());
    }
  }
  return getAllReminderTemplates();
}

/** Substitute the four supported placeholders. Unknown tokens stay literal. */
export function renderReminderTemplate(
  template: string,
  vars: { name: string; missingDocs: string; portalUrl: string; deadlineDate: string },
): string {
  return template
    .replaceAll("{name}", vars.name)
    .replaceAll("{missing_docs}", vars.missingDocs)
    .replaceAll("{portal_url}", vars.portalUrl)
    .replaceAll("{deadline_date}", vars.deadlineDate);
}

function clampHours(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : DEFAULT_CONFIG.firstAfterHours;
  return Math.max(min, Math.min(max, Math.round(v)));
}
function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 1;
  return Math.max(min, Math.min(max, Math.round(v)));
}

// ─── Doc-list helpers ──────────────────────────────────────────────────────

// Lookup table: doc id → onboarding column. Mirrors ALL_PREREQUISITES
// in client/src/pages/onboarding.tsx.
const DOC_TO_COLUMN: Record<ReminderDocId, keyof OnboardingRecord> = {
  photo: "hasPhoto",
  iban: "hasIban",
  national_id: "hasNationalId",
  vaccination_report: "hasVaccinationReport",
};

// SMP candidates have a lighter checklist (no IBAN — they're paid through
// the company). Vaccination report applies to everyone (workplace health
// requirement), so it joins photo + national_id in the SMP whitelist.
const SMP_DOC_WHITELIST: Set<ReminderDocId> = new Set(["photo", "national_id", "vaccination_report"]);

/** Onboarding row is SMP iff applicationId is null (matches existing convention). */
export function isSmpOnboarding(rec: OnboardingRecord): boolean {
  return rec.applicationId == null;
}

/**
 * The doc list this row should be reminded about — intersection of the
 * admin's required_docs config with the SMP-aware lighter checklist.
 */
export function effectiveRequiredDocs(rec: OnboardingRecord, cfg: ReminderConfig): ReminderDocId[] {
  const isSmp = isSmpOnboarding(rec);
  return cfg.requiredDocs.filter((d) => !isSmp || SMP_DOC_WHITELIST.has(d));
}

/** Doc ids still missing on this row (after applying the SMP filter). */
export function missingDocsFor(rec: OnboardingRecord, cfg: ReminderConfig): ReminderDocId[] {
  return effectiveRequiredDocs(rec, cfg).filter((d) => !rec[DOC_TO_COLUMN[d]]);
}

// ─── Scheduling math ───────────────────────────────────────────────────────

export type ReminderRowState =
  | "off"
  | "pending"
  | "due"
  | "paused"
  | "warning"        // final warning SMS already sent AND <=24h to elimination
  | "max_reached"
  | "eliminated";

export interface ReminderEvent {
  /** 1-based reminder index for "regular" kind; null for the final-warning event. */
  n: number | null;
  kind: "reminder" | "final_warning";
  sentAt: string;
}

export interface ReminderRowStatus {
  onboardingId: string;
  state: ReminderRowState;
  missingDocs: ReminderDocId[];
  reminderCount: number;
  maxReminders: number;
  lastReminderSentAt: string | null;
  nextScheduledAt: string | null;
  eliminationAt: string | null;
  finalWarningAt: string | null;
  finalWarningSentAt: string | null;
  remindersPaused: boolean;
  /** Per-event timeline so the UI can show per-pip "Sent at …" tooltips. */
  events: ReminderEvent[];
}

/**
 * Compute next-scheduled / elimination / state for a single row given
 * the current config. Pure function — no I/O. The scheduler and the
 * status endpoint share this so admin previews never drift from what
 * actually fires.
 */
export function computeRowStatus(
  rec: OnboardingRecord,
  cfg: ReminderConfig,
  now: Date,
  events: ReminderEvent[] = [],
): ReminderRowStatus {
  const missing = missingDocsFor(rec, cfg);
  const finalWarningSentAt = rec.finalWarningSentAt ? rec.finalWarningSentAt.toISOString() : null;
  const base = {
    onboardingId: rec.id,
    missingDocs: missing,
    reminderCount: rec.reminderCount,
    maxReminders: cfg.maxReminders,
    lastReminderSentAt: rec.lastReminderSentAt ? rec.lastReminderSentAt.toISOString() : null,
    finalWarningSentAt,
    remindersPaused: rec.remindersPausedAt != null,
    events,
  };

  // Pre-enable rows must be invisible: the sweep gates by createdAt >= enabledAt
  // (so it never sends to old rows), and the UI must mirror that — otherwise
  // pre-enable rows show bells/at-risk states even though no SMS will ever
  // fire for them. The same gate applies when the master switch is off,
  // when there are no missing docs, or when the row's status is no longer
  // actionable (converted/rejected/terminated).
  const preEnable = cfg.enabledAt
    ? rec.createdAt.getTime() < new Date(cfg.enabledAt).getTime()
    : !cfg.enabled;
  if (!cfg.enabled || preEnable || missing.length === 0 || !isReminderEligibleStatus(rec.status)) {
    return {
      ...base,
      state: "off",
      nextScheduledAt: null,
      eliminationAt: null,
      finalWarningAt: null,
    };
  }

  const createdAtMs = rec.createdAt.getTime();
  const eliminationMs = createdAtMs + cfg.totalDeadlineDays * 86400_000;
  const finalWarningMs = eliminationMs - cfg.finalWarningHours * 3600_000;
  const eliminationAt = new Date(eliminationMs).toISOString();
  const finalWarningAt = new Date(finalWarningMs).toISOString();

  if (rec.remindersPausedAt) {
    return { ...base, state: "paused", nextScheduledAt: null, eliminationAt, finalWarningAt };
  }

  if (now.getTime() >= eliminationMs) {
    return { ...base, state: "eliminated", nextScheduledAt: null, eliminationAt, finalWarningAt };
  }

  let nextMs: number;
  if (rec.reminderCount === 0) {
    nextMs = createdAtMs + cfg.firstAfterHours * 3600_000;
  } else {
    const last = rec.lastReminderSentAt?.getTime() ?? createdAtMs;
    nextMs = last + cfg.repeatEveryHours * 3600_000;
  }
  if (nextMs > eliminationMs) nextMs = eliminationMs;
  const nextScheduledAt = new Date(nextMs).toISOString();

  // Warning visual = final warning SMS already sent AND <=24h to elimination.
  // Time-window-only matches do NOT short-circuit here; they are handled
  // below as due/pending so the sweep can actually send the warning first.
  const within24hOfElim = eliminationMs - now.getTime() <= 24 * 3600_000;
  if (rec.finalWarningSentAt != null && within24hOfElim) {
    return { ...base, state: "warning", nextScheduledAt, eliminationAt, finalWarningAt };
  }

  if (rec.reminderCount >= cfg.maxReminders) {
    return { ...base, state: "max_reached", nextScheduledAt: null, eliminationAt, finalWarningAt };
  }
  if (now.getTime() >= nextMs) {
    return { ...base, state: "due", nextScheduledAt, eliminationAt, finalWarningAt };
  }
  return { ...base, state: "pending", nextScheduledAt, eliminationAt, finalWarningAt };
}

function isReminderEligibleStatus(s: OnboardingRecord["status"]): boolean {
  // Only nag candidates whose row is still actionable — never converted /
  // rejected / terminated.
  return s === "pending" || s === "in_progress" || s === "ready";
}

// ─── Quiet hours ───────────────────────────────────────────────────────────

/**
 * Returns true if `now` falls inside the configured quiet window
 * (interpreted in the configured tz). Handles wraparound (e.g. 21:00–08:00).
 */
export function isInQuietHours(now: Date, cfg: ReminderConfig): boolean {
  const startMin = parseHHMM(cfg.quietHoursStart);
  const endMin = parseHHMM(cfg.quietHoursEnd);
  if (startMin == null || endMin == null || startMin === endMin) return false;
  const nowMin = minutesInTz(now, cfg.quietHoursTz);
  if (nowMin == null) return false;
  if (startMin < endMin) {
    // Same-day window, e.g. 13:00–17:00.
    return nowMin >= startMin && nowMin < endMin;
  }
  // Wraparound window, e.g. 21:00–08:00.
  return nowMin >= startMin || nowMin < endMin;
}

function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function minutesInTz(d: Date, tz: string): number | null {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
    // 24:00 → 00:00 normalization for some locales.
    return ((h % 24) * 60 + mm) % (24 * 60);
  } catch {
    return null;
  }
}

// ─── Sweep ─────────────────────────────────────────────────────────────────

export interface SweepResult {
  considered: number;
  remindersEnqueued: number;
  finalWarningsEnqueued: number;
  eliminated: number;
  skippedQuietHours: number;
  /**
   * Architect hardening item #2 — count of rows that threw inside the
   * per-row body of the sweep loop. Each row is wrapped in its own
   * try/catch so a single config error (e.g. a vanished SMS plugin or
   * an unset portal URL surfaced through the SMS payload-resolution
   * path) cannot abort the entire batch and starve every other
   * pending candidate. Failures are also console.error'd with the
   * onboardingId so operators can correlate.
   */
  failed: number;
}

/**
 * Hourly sweep: for every active onboarding row with missing docs,
 * decide whether to enqueue a reminder, enqueue the final warning, or
 * eliminate the row.
 *
 * Rules:
 *   - master switch off  → no-op
 *   - within quiet hours → defer reminder/final-warning enqueues only.
 *     Elimination still fires (it's a state change, not a notification).
 *   - past deadline      → eliminate via the same path as a manual
 *     "Reset Like" (application status → "interviewed"), which the
 *     reverse-sync hook in routes.ts uses to drop the orphan onboarding.
 *
 * Idempotency: SMS rows are deduped via dedupeKey
 *   onboarding_reminder:{onboardingId}:{n}
 *   onboarding_final_warning:{onboardingId}
 * so a sweep that runs twice on the same minute (manual + cron) cannot
 * double-send.
 */
export async function runOnboardingReminderSweep(now: Date = new Date()): Promise<SweepResult> {
  const cfg = await getReminderConfig();
  const result: SweepResult = {
    considered: 0,
    remindersEnqueued: 0,
    finalWarningsEnqueued: 0,
    eliminated: 0,
    skippedQuietHours: 0,
    failed: 0,
  };
  if (!cfg.enabled) return result;

  // Pull only rows that could possibly be acted on. Status filter
  // mirrors isReminderEligibleStatus and the missing-docs filter is
  // applied per-row (it depends on SMP-vs-individual + config).
  // Out-of-scope guard: only act on rows whose `createdAt` is at or
  // after the most recent OFF→ON flip. This prevents a backlog of
  // pre-existing pending onboardings from being eliminated the moment
  // an admin first enables the loop.
  const enabledAtFilter = cfg.enabledAt
    ? gte(onboarding.createdAt, new Date(cfg.enabledAt))
    : sql`false`;
  const rows = await db
    .select()
    .from(onboarding)
    .where(and(
      isNull(onboarding.eliminatedAt),
      sql`${onboarding.status} IN ('pending', 'in_progress', 'ready')`,
      enabledAtFilter,
    ));
  result.considered = rows.length;

  const inQuiet = isInQuietHours(now, cfg);

  for (const rec of rows) {
    // Architect hardening item #2 — per-row try/catch isolates failures
    // (e.g. PortalBaseUrlNotConfiguredError, an SMS plugin that just
    // vanished, a transient DB conflict on the conditional UPDATE) so
    // one poison row cannot abort the entire batch. Each failure is
    // logged with the onboardingId for triage and counted in
    // `result.failed` for telemetry.
    try {
      const status = computeRowStatus(rec, cfg, now);

      if (status.state === "off") continue;

      if (status.state === "eliminated") {
        const ok = await eliminateOnboarding(rec);
        if (ok) result.eliminated++;
        continue;
      }

      if (inQuiet) {
        result.skippedQuietHours++;
        continue;
      }

      if (rec.remindersPausedAt) continue;

      // Final-warning send is gated by the time window + not-yet-sent flag,
      // independent of the visual state (which only flips to "warning"
      // after the SMS has actually been enqueued).
      const eliminationMs = rec.createdAt.getTime() + cfg.totalDeadlineDays * 86400_000;
      const finalWarningMs = eliminationMs - cfg.finalWarningHours * 3600_000;
      if (now.getTime() >= finalWarningMs && rec.finalWarningSentAt == null && status.missingDocs.length > 0) {
        const enqueued = await enqueueFinalWarningSms(rec, cfg, status.missingDocs);
        if (enqueued) result.finalWarningsEnqueued++;
        continue;
      }

      if (status.state === "max_reached" || status.state === "warning") continue;

      if (status.state === "due") {
        const claimed = await claimAndEnqueueReminder(rec, status.missingDocs, now, cfg);
        if (claimed) result.remindersEnqueued++;
      }
    } catch (err) {
      result.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[onboarding-reminders] sweep failed for row ${rec.id}: ${msg}`);
    }
  }

  return result;
}

/**
 * Manual "send now" — bypasses quiet hours & cadence. Race-safe with
 * the hourly sweep: if both writers observe the same reminderCount,
 * only one will pass the conditional UPDATE and only one SMS is
 * enqueued (deterministic dedupeKey ":n+1"). Returns the (possibly
 * bumped) row on success, null if the row vanished.
 */
export async function sendReminderNow(onboardingId: string): Promise<OnboardingRecord | null> {
  const cfg = await getReminderConfig();
  const [rec] = await db.select().from(onboarding).where(eq(onboarding.id, onboardingId));
  if (!rec) return null;
  const missing = missingDocsFor(rec, cfg);
  if (missing.length === 0) return rec;
  await claimAndEnqueueReminder(rec, missing, new Date(), cfg);
  // Whether or not we actually claimed the slot (someone else may have
  // raced us and the dedupe key blocked the duplicate insert), return
  // the latest row to the caller so the UI shows the up-to-date state.
  const [latest] = await db.select().from(onboarding).where(eq(onboarding.id, onboardingId));
  return latest ?? rec;
}

/**
 * Atomic "claim and enqueue" used by both the sweep and manual send-now.
 *
 * Concurrency model:
 *   1. Compute the next reminder index from the observed reminderCount.
 *   2. Run a conditional UPDATE that bumps reminder_count from N → N+1.
 *      Only one writer will succeed when two read the same N.
 *   3. The winner inserts the SMS row with deterministic dedupeKey
 *      `onboarding_reminder:{id}:{N+1}` (ON CONFLICT DO NOTHING). The
 *      conflict is a defensive fallback — under normal operation only
 *      one writer ever reaches this line for a given (id, N+1).
 *   4. Losers exit silently with `false` so callers can tell whether
 *      their attempt actually queued an SMS.
 */
async function claimAndEnqueueReminder(
  rec: OnboardingRecord,
  missing: ReminderDocId[],
  now: Date,
  cfg: ReminderConfig,
): Promise<boolean> {
  if (missing.length === 0) return false;

  // Resolve recipient/payload BEFORE the transaction (read-only, no race risk).
  const ctx = await resolveSmsContext(rec, cfg);
  if (!ctx) return false;

  const observed = rec.reminderCount ?? 0;
  const nextN = observed + 1;
  const dedupeKey = `onboarding_reminder:${rec.id}:${nextN}`;

  // Atomic claim + enqueue: count bump and SMS insert commit together
  // or roll back together. Prevents the "count consumed, no message
  // queued" drift the prior implementation could exhibit on enqueue
  // failure.
  try {
    return await db.transaction(async (tx) => {
      const [claimed] = await tx.update(onboarding)
        .set({
          reminderCount: nextN,
          lastReminderSentAt: now,
          updatedAt: now,
        })
        .where(and(
          eq(onboarding.id, rec.id),
          eq(onboarding.reminderCount, observed),
          isNull(onboarding.eliminatedAt),
        ))
        .returning();
      if (!claimed) return false; // Another writer beat us to this slot.

      const inserted = await tx.insert(smsOutbox).values({
        candidateId: rec.candidateId,
        recipientPhone: ctx.phone,
        kind: "onboarding_reminder",
        payload: {
          onboardingId: rec.id,
          missingDocs: missing,
          locale: ctx.locale,
          link: ctx.link,
          candidateName: ctx.candidateName,
          deadlineAt: ctx.deadlineAt,
          portalUrl: ctx.link,
        },
        dedupeKey,
      }).onConflictDoNothing({ target: smsOutbox.dedupeKey }).returning();

      if (inserted.length === 0) {
        // Defensive: a row with this dedupeKey already exists (e.g.
        // crash-recovery scenario). Roll back the count bump so the
        // sweep's view of state stays self-consistent.
        throw new Error("__rollback_claim_dedupe");
      }
      return true;
    });
  } catch (err: any) {
    if (err?.message === "__rollback_claim_dedupe") {
      // Task #216 — surface the rollback to operators. The transaction
      // already rolled back atomically (count bump reverted, no SMS
      // queued); this call just logs/counts/alerts so a sustained spike
      // becomes visible instead of being swallowed.
      void recordReminderRollback({
        onboardingId: rec.id,
        nextN,
        reason: "dedupe_conflict",
      });
      return false;
    }
    throw err;
  }
}

export async function pauseReminders(onboardingId: string): Promise<OnboardingRecord | null> {
  const [rec] = await db.update(onboarding)
    .set({ remindersPausedAt: new Date(), updatedAt: new Date() })
    .where(eq(onboarding.id, onboardingId))
    .returning();
  return rec ?? null;
}

export async function resumeReminders(onboardingId: string): Promise<OnboardingRecord | null> {
  const [rec] = await db.update(onboarding)
    .set({ remindersPausedAt: null, updatedAt: new Date() })
    .where(eq(onboarding.id, onboardingId))
    .returning();
  return rec ?? null;
}

// ─── Internals ─────────────────────────────────────────────────────────────

/**
 * Resolve the candidate-side context (phone, locale, name, deadline,
 * portal link) needed to populate an SMS outbox payload. Pure read; no
 * race risk — safe to call outside any transaction.
 *
 * Returns null if the row cannot be reminded (no candidate, no phone).
 */
interface ResolvedSmsContext {
  phone: string;
  locale: "ar" | "en";
  candidateName: string;
  link: string;
  deadlineAt: string;
}

async function resolveSmsContext(
  rec: OnboardingRecord,
  cfg: ReminderConfig,
): Promise<ResolvedSmsContext | null> {
  const [cand] = await db.select().from(candidates).where(eq(candidates.id, rec.candidateId));
  if (!cand) return null;
  const phone = cand.phone?.trim();
  if (!phone) return null;

  let locale: "ar" | "en" = "ar";
  if (cand.userId) {
    const u = await storage.getUser(cand.userId);
    if (u?.locale === "en") locale = "en";
    else if (u?.locale === "ar") locale = "ar";
  }

  const candidateName = cand.fullNameEn ?? "";

  // {portal_url} = bare workforce app base URL. The client router
  // (client/src/App.tsx) does not register a `/candidate/onboarding`
  // path — sending one produced a hard 404 for every candidate who
  // tapped the SMS link. The app's existing auth/redirect chain at the
  // root path lands the candidate in the right place after login, so
  // the bare base URL is the correct destination. The base resolver
  // (server/lib/portal-url.ts) throws loudly when no source is set —
  // no hard-coded production hostname masks misconfiguration on a
  // future deployment that lives at a different host.
  // (Final-mile defence: server/sms-sender.ts strips Arabic-Indic digits
  // from every outbound message regardless of source — see
  // toWesternDigitsForSms.)
  const { getPortalBaseUrl } = await import("./lib/portal-url");
  const link = await getPortalBaseUrl();

  const deadlineAt = new Date(rec.createdAt.getTime() + cfg.totalDeadlineDays * 86400_000).toISOString();

  return { phone, locale, candidateName, link, deadlineAt };
}

async function enqueueFinalWarningSms(
  rec: OnboardingRecord,
  cfg: ReminderConfig,
  missing: ReminderDocId[],
): Promise<boolean> {
  if (missing.length === 0) return false;
  const ctx = await resolveSmsContext(rec, cfg);
  if (!ctx) return false;

  const dedupeKey = `onboarding_final_warning:${rec.id}`;
  const inserted = await db.insert(smsOutbox).values({
    candidateId: rec.candidateId,
    recipientPhone: ctx.phone,
    kind: "onboarding_final_warning",
    payload: {
      onboardingId: rec.id,
      missingDocs: missing,
      locale: ctx.locale,
      link: ctx.link,
      candidateName: ctx.candidateName,
      deadlineAt: ctx.deadlineAt,
      portalUrl: ctx.link,
    },
    dedupeKey,
  }).onConflictDoNothing({ target: smsOutbox.dedupeKey }).returning();

  if (inserted.length > 0) {
    await db.update(onboarding)
      .set({ finalWarningSentAt: new Date(), updatedAt: new Date() })
      .where(and(eq(onboarding.id, rec.id), isNull(onboarding.finalWarningSentAt)));
    return true;
  }
  return false;
}

/**
 * Tear down an expired onboarding row. Routes through the same shared
 * cleanup helper as manual "Reset Like" so the reverse-sync contract is
 * identical for both paths (admin alerts, audit, orphan teardown for
 * pending|in_progress|ready statuses).
 *
 * Atomicity (Task #219): every state-changing write — the
 * `eliminated_at` CAS stamp, the application status flip, the
 * onboarding row delete (via `applyShortlistResetCleanup`), and the
 * final `onboarding.auto_eliminated` audit log — runs inside a single
 * `db.transaction(...)` block. Postgres rolls the entire set back
 * automatically if any step throws, so partial state is impossible by
 * construction. This replaces the earlier manual revert-in-reverse
 * pattern, which required every newly added write on the path to ship
 * with a matching unwind clause to keep the safety property intact.
 *
 * The CAS update on `eliminated_at` still serves as the concurrency
 * guard against a parallel sweep racing this one — when the predicate
 * matches zero rows we abort the transaction with `false` instead of
 * doing further work (and the empty transaction commits as a no-op).
 *
 * The admin alert is intentionally enqueued AFTER the transaction
 * commits: it is a notification side-effect, not part of the
 * elimination itself, and an alert-table failure must not undo the
 * candidate's elimination (matches the prior non-fatal try/catch
 * around it).
 */
async function eliminateOnboarding(rec: OnboardingRecord): Promise<boolean> {
  let eliminated = false;
  try {
    eliminated = await db.transaction(async (tx) => {
      // Acquire the elimination lease via CAS so a concurrent sweep
      // sees no row to update and exits without progressing further.
      // Inside the transaction so the lease + downstream writes commit
      // (or roll back) as one unit.
      const [stamped] = await tx.update(onboarding)
        .set({ eliminatedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(onboarding.id, rec.id), isNull(onboarding.eliminatedAt)))
        .returning();
      if (!stamped) return false;

      if (rec.applicationId) {
        const app = await storage.getApplication(rec.applicationId);
        if (app) {
          // Always reset the application back to "interviewed" on
          // auto-elimination (regardless of pre-update status) so the
          // candidate can be re-evaluated cleanly. Mirrors the manual
          // "Reset Like" intent applied to the auto-elimination trigger.
          const previousStatus: Application["status"] = app.status;
          if (previousStatus !== "interviewed") {
            // Goes through applySystemApplicationStatusFlip so the
            // auto-elimination flow writes its own `application.status_change`
            // audit row alongside the existing `onboarding.auto_eliminated`
            // row. The helper no-ops if status already matches, so the
            // outer guard here is now redundant but kept for readability.
            await applySystemApplicationStatusFlip({
              applicationId: rec.applicationId,
              newStatus: "interviewed",
              actor: { id: null, name: "system" },
              reason: "auto_eliminated",
              metadata: { onboardingId: rec.id, reminderCount: rec.reminderCount },
            }, tx);
          }
          const candidate = await storage.getCandidate(rec.candidateId).catch(() => null);
          // Pass the REAL previousStatus + force=true so the shared
          // cleanup helper produces an accurate audit record but still
          // teardowns the onboarding row even when previousStatus !==
          // "shortlisted".
          await applyShortlistResetCleanup({
            previousStatus,
            newStatus: "interviewed",
            applicationId: rec.applicationId,
            candidateId: rec.candidateId,
            candidateName: candidate?.fullNameEn ?? null,
            actor: { id: null, name: "system" },
            metadata: { reason: "auto_eliminated", reminderCount: rec.reminderCount },
            force: true,
          }, tx);
        } else {
          // Application went missing between sweep selection and
          // elimination — still drop the onboarding row directly.
          await storage.deleteOnboardingRecord(rec.id, tx);
        }
      } else {
        // SMP rows have no application — delete directly.
        await storage.deleteOnboardingRecord(rec.id, tx);
      }

      await storage.createAuditLog({
        action: "onboarding.auto_eliminated",
        entityType: "onboarding",
        entityId: rec.id,
        description: `Onboarding ${rec.id} auto-eliminated after deadline (missing required documents).`,
        metadata: {
          candidateId: rec.candidateId,
          applicationId: rec.applicationId,
          reminderCount: rec.reminderCount,
        },
        actorId: null,
        actorName: "system",
      }, tx);

      return true;
    });
  } catch (err) {
    // Postgres rolled the whole transaction back already — eliminated_at,
    // app-status flip, onboarding delete, and audit log are all gone.
    // Just log; the next sweep will retry from a clean slate.
    console.error(`[onboarding-reminders] eliminate failed for ${rec.id}:`, err);
    return false;
  }

  if (!eliminated) return false;

  // Notification side-effect, after commit. Failure here must not undo
  // the elimination (matches the prior non-fatal behaviour) — and is
  // outside the transaction so an alerts-table outage cannot leave a
  // candidate stuck at "in_progress".
  try {
    await storage.createAdminAlert(
      "تم استبعاد مرشح تلقائيًا بعد انتهاء مهلة التذكيرات",
      `استُبعد المرشح ${rec.candidateId} لانتهاء مهلة رفع المستندات المطلوبة بعد ${rec.reminderCount ?? 0} تذكير(ات).`,
      {
        kind: "onboarding_auto_eliminated",
        candidateId: rec.candidateId,
        applicationId: rec.applicationId,
        onboardingId: rec.id,
        reminderCount: rec.reminderCount,
      },
    );
  } catch (alertErr) {
    console.error(`[onboarding-reminders] admin alert failed for ${rec.id}:`, alertErr);
  }

  return true;
}

/**
 * Bulk fetch derived status for a set of onboarding rows. Used by the
 * GET /api/onboarding/reminders/status endpoint so the frontend never
 * recomputes scheduling math.
 */
export async function getReminderStatusMap(
  onboardingIds?: string[],
): Promise<ReminderRowStatus[]> {
  const cfg = await getReminderConfig();
  const now = new Date();
  const rows = onboardingIds && onboardingIds.length > 0
    ? await db.select().from(onboarding).where(
        sql`${onboarding.id} IN (${sql.join(onboardingIds.map((id) => sql`${id}`), sql`, `)})`,
      )
    : await db.select().from(onboarding).where(and(
        isNull(onboarding.eliminatedAt),
        notInArray(onboarding.status, ["converted", "rejected", "terminated"]),
      ));
  const eventsByRow = await loadReminderEventsForRows(rows.map((r) => r.id));
  // Returned as an array so the frontend can iterate it directly without
  // worrying about iteration semantics on a plain object map.
  return rows.map((rec) => computeRowStatus(rec, cfg, now, eventsByRow.get(rec.id) ?? []));
}

/**
 * Batch-load per-row reminder send events from sms_outbox.
 *
 * The reminder enqueuer writes deterministic dedupe keys
 * `onboarding_reminder:${onboardingId}:${n}` for the regular cadence and
 * `onboarding_final_warning:${onboardingId}` for the last-chance SMS.
 * We parse those keys so the UI can show per-pip "Sent at …" tooltips
 * without round-tripping for each row.
 */
export async function loadReminderEventsForRows(
  onboardingIds: string[],
): Promise<Map<string, ReminderEvent[]>> {
  const map = new Map<string, ReminderEvent[]>();
  if (onboardingIds.length === 0) return map;
  // dedupe_key LIKE pattern per row, OR'd. The unique index on dedupe_key
  // keeps each lookup cheap; row count is bounded by maxReminders+1.
  //
  // IMPORTANT: when binding a JS array as a single parameter, the pg
  // driver serialises it via JSON and Postgres rejects the query with
  //   "op ANY/ALL (array) requires array on right side"
  // We construct an explicit `ARRAY[$1, $2, ...]::text[]` literal so
  // each pattern binds as its own parameter and the right-hand side is
  // an unambiguous text array.
  const patterns = onboardingIds.flatMap((id) => [
    `onboarding_reminder:${id}:%`,
    `onboarding_final_warning:${id}`,
  ]);
  const rows = await db.select({
    dedupeKey: smsOutbox.dedupeKey,
    sentAt: smsOutbox.sentAt,
  })
    .from(smsOutbox)
    .where(and(
      sql`${smsOutbox.sentAt} IS NOT NULL`,
      sql`${smsOutbox.dedupeKey} LIKE ANY(ARRAY[${sql.join(patterns.map((p) => sql`${p}`), sql`, `)}]::text[])`,
    ));
  for (const r of rows) {
    if (!r.dedupeKey || !r.sentAt) continue;
    if (r.dedupeKey.startsWith("onboarding_reminder:")) {
      const parts = r.dedupeKey.split(":");
      if (parts.length !== 3) continue;
      const id = parts[1];
      const n = Number(parts[2]);
      if (!id || !Number.isFinite(n)) continue;
      const list = map.get(id) ?? [];
      list.push({ n, kind: "reminder", sentAt: r.sentAt.toISOString() });
      map.set(id, list);
    } else if (r.dedupeKey.startsWith("onboarding_final_warning:")) {
      const id = r.dedupeKey.slice("onboarding_final_warning:".length);
      if (!id) continue;
      const list = map.get(id) ?? [];
      list.push({ n: null, kind: "final_warning", sentAt: r.sentAt.toISOString() });
      map.set(id, list);
    }
  }
  // Sort each row's events: regular reminders by n asc, final warning last.
  for (const [, list] of map) {
    list.sort((a, b) => {
      if (a.kind === b.kind) return (a.n ?? 0) - (b.n ?? 0);
      return a.kind === "reminder" ? -1 : 1;
    });
  }
  return map;
}

// Used in tests / manual ops.
//
// `claimAndEnqueueReminder` and `eliminateOnboarding` are exposed here
// (rather than as top-level exports) so the rest of the codebase keeps
// going through the public surface (`runOnboardingReminderSweep`,
// `sendReminderNow`) but the safety-property tests in
// `server/__tests__/onboarding-reminders-safety.test.ts` can drive them
// directly to exercise concurrency / rollback edges that the hourly
// sweep would normally hide.
export const __internal = {
  DEFAULT_CONFIG,
  DOC_TO_COLUMN,
  SMP_DOC_WHITELIST,
  claimAndEnqueueReminder,
  eliminateOnboarding,
};
