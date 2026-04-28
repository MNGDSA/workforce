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
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "./db";
import {
  onboarding,
  applications,
  candidates,
  smsOutbox,
  systemSettings,
  type OnboardingRecord,
  type Candidate,
} from "@shared/schema";
import { storage } from "./storage";

// ─── Config ────────────────────────────────────────────────────────────────

export type ReminderDocId = "photo" | "iban" | "national_id";

export interface ReminderConfig {
  enabled: boolean;
  firstAfterHours: number;        // first reminder = createdAt + this
  repeatEveryHours: number;       // subsequent reminders cadence
  maxReminders: number;           // hard cap on how many to send
  totalDeadlineHours: number;     // overall deadline from createdAt → eliminate
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
  firstAfterHours: 24,
  repeatEveryHours: 24,
  maxReminders: 3,
  totalDeadlineHours: 96,
  finalWarningHours: 24,
  quietHoursStart: "21:00",
  quietHoursEnd: "08:00",
  quietHoursTz: "Asia/Riyadh",
  requiredDocs: ["photo", "iban", "national_id"],
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
  // Normalize the doc list — drop unknown ids, dedupe, preserve order.
  const knownDocs: ReminderDocId[] = ["photo", "iban", "national_id"];
  const seen = new Set<string>();
  next.requiredDocs = (Array.isArray(next.requiredDocs) ? next.requiredDocs : [])
    .filter((d): d is ReminderDocId =>
      knownDocs.includes(d as ReminderDocId) && !seen.has(d) && (seen.add(d), true),
    );
  // Clamp numeric fields so a typo can't push the cadence into pathological ranges.
  next.firstAfterHours    = clampHours(next.firstAfterHours,    1, 24 * 30);
  next.repeatEveryHours   = clampHours(next.repeatEveryHours,   1, 24 * 30);
  next.maxReminders       = clampInt(next.maxReminders,         1, 20);
  next.totalDeadlineHours = clampHours(next.totalDeadlineHours, 1, 24 * 365);
  next.finalWarningHours  = clampHours(next.finalWarningHours,  0, 24 * 30);
  await storage.setSystemSetting(SETTINGS_KEY, JSON.stringify(next));
  return next;
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
};

// SMP candidates have a lighter checklist (photo + national_id only).
// Mirror the same rule so reminders never ask SMP workers for IBAN.
const SMP_DOC_WHITELIST: Set<ReminderDocId> = new Set(["photo", "national_id"]);

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
  | "off"            // master switch off, or no missing docs, or not eligible
  | "pending"        // master on, missing docs, but no reminder due yet
  | "due"            // a reminder should fire on the next sweep
  | "paused"         // admin paused this row
  | "warning"        // within finalWarningHours of elimination
  | "max_reached"    // sent all reminders, waiting for deadline
  | "eliminated";    // deadline passed (transient — sweep will tear it down)

export interface ReminderRowStatus {
  onboardingId: string;
  state: ReminderRowState;
  missingDocs: ReminderDocId[];
  reminderCount: number;
  maxReminders: number;
  lastReminderSentAt: string | null;
  nextScheduledAt: string | null;     // null when state == "off" / "paused" / "max_reached"
  eliminationAt: string | null;       // null when state == "off"
  finalWarningAt: string | null;      // null when state == "off"
  remindersPaused: boolean;
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
): ReminderRowStatus {
  const missing = missingDocsFor(rec, cfg);
  const base = {
    onboardingId: rec.id,
    missingDocs: missing,
    reminderCount: rec.reminderCount,
    maxReminders: cfg.maxReminders,
    lastReminderSentAt: rec.lastReminderSentAt ? rec.lastReminderSentAt.toISOString() : null,
    remindersPaused: rec.remindersPausedAt != null,
  };

  // OFF cases: no reminder math at all.
  if (!cfg.enabled || missing.length === 0 || !isReminderEligibleStatus(rec.status)) {
    return {
      ...base,
      state: "off",
      nextScheduledAt: null,
      eliminationAt: null,
      finalWarningAt: null,
    };
  }

  const createdAtMs = rec.createdAt.getTime();
  const eliminationMs = createdAtMs + cfg.totalDeadlineHours * 3600_000;
  const finalWarningMs = eliminationMs - cfg.finalWarningHours * 3600_000;
  const eliminationAt = new Date(eliminationMs).toISOString();
  const finalWarningAt = new Date(finalWarningMs).toISOString();

  if (rec.remindersPausedAt) {
    return { ...base, state: "paused", nextScheduledAt: null, eliminationAt, finalWarningAt };
  }

  // Already past deadline — sweep will eliminate on the next tick.
  if (now.getTime() >= eliminationMs) {
    return { ...base, state: "eliminated", nextScheduledAt: null, eliminationAt, finalWarningAt };
  }

  // Compute the next reminder due time.
  let nextMs: number;
  if (rec.reminderCount === 0) {
    nextMs = createdAtMs + cfg.firstAfterHours * 3600_000;
  } else {
    const last = rec.lastReminderSentAt?.getTime() ?? createdAtMs;
    nextMs = last + cfg.repeatEveryHours * 3600_000;
  }
  // Clamp the displayed next-scheduled to the deadline so we never
  // imply a reminder will go out after elimination.
  if (nextMs > eliminationMs) nextMs = eliminationMs;
  const nextScheduledAt = new Date(nextMs).toISOString();

  // Within final-warning window?
  if (now.getTime() >= finalWarningMs) {
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
  };
  if (!cfg.enabled) return result;

  // Pull only rows that could possibly be acted on. Status filter
  // mirrors isReminderEligibleStatus and the missing-docs filter is
  // applied per-row (it depends on SMP-vs-individual + config).
  const rows = await db
    .select()
    .from(onboarding)
    .where(and(
      isNull(onboarding.eliminatedAt),
      sql`${onboarding.status} IN ('pending', 'in_progress', 'ready')`,
    ));
  result.considered = rows.length;

  const inQuiet = isInQuietHours(now, cfg);

  for (const rec of rows) {
    const status = computeRowStatus(rec, cfg, now);

    if (status.state === "off" || status.state === "max_reached") continue;

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

    // Final warning takes priority over a regular reminder when we're
    // inside the warning window AND we have not yet sent the warning.
    if (status.state === "warning") {
      const enqueued = await enqueueReminderSms(rec, cfg, status.missingDocs, "final");
      if (enqueued) result.finalWarningsEnqueued++;
      continue;
    }

    if (status.state === "due") {
      const claimed = await claimAndEnqueueReminder(rec, status.missingDocs, now);
      if (claimed) result.remindersEnqueued++;
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
  await claimAndEnqueueReminder(rec, missing, new Date());
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
): Promise<boolean> {
  if (missing.length === 0) return false;

  // Resolve recipient/payload BEFORE the transaction (read-only, no race risk).
  // If we can't resolve a phone, abort cleanly without consuming a slot.
  const [cand] = await db.select().from(candidates).where(eq(candidates.id, rec.candidateId));
  if (!cand) return false;
  const phone = cand.phone?.trim();
  if (!phone) return false;
  let locale: "ar" | "en" = "ar";
  if (cand.userId) {
    const u = await storage.getUser(cand.userId);
    const loc = (u as any)?.locale;
    if (loc === "en") locale = "en";
    else if (loc === "ar") locale = "ar";
  }
  const baseUrl = (await storage.getSystemSetting("public_app_url"))
    ?? process.env.PUBLIC_APP_URL
    ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
    ?? "https://workforce.tanaqolapp.com";
  const link = `${baseUrl.replace(/\/$/, "")}/candidate/onboarding`;

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
        recipientPhone: phone,
        kind: "onboarding_reminder",
        payload: {
          onboardingId: rec.id,
          missingDocs: missing,
          locale,
          link,
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
    if (err?.message === "__rollback_claim_dedupe") return false;
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

async function enqueueReminderSms(
  rec: OnboardingRecord,
  cfg: ReminderConfig,
  missing: ReminderDocId[],
  variant: "regular" | "final",
  opts: { sequenceN?: number } = {},
): Promise<boolean> {
  if (missing.length === 0) return false;

  const [cand] = await db.select().from(candidates).where(eq(candidates.id, rec.candidateId));
  if (!cand) return false;
  const phone = cand.phone?.trim();
  if (!phone) return false;

  // Candidate's preferred locale lives on the linked user row (candidates
  // table has no locale column). Fall back to "ar" — project default.
  let locale: "ar" | "en" = "ar";
  if (cand.userId) {
    const u = await storage.getUser(cand.userId);
    const loc = (u as any)?.locale;
    if (loc === "en") locale = "en";
    else if (loc === "ar") locale = "ar";
  }

  // Deterministic dedupeKey: the sequence number is supplied by the
  // race-safe claimAndEnqueueReminder caller (already incremented). Both
  // sweep and manual send-now agree on this number, so a duplicate
  // attempt collides at the unique-index level and is silently ignored.
  const sequenceN = opts.sequenceN ?? ((rec.reminderCount ?? 0) + 1);
  const dedupeKey = variant === "final"
    ? `onboarding_final_warning:${rec.id}`
    : `onboarding_reminder:${rec.id}:${sequenceN}`;

  const baseUrl = (await storage.getSystemSetting("public_app_url"))
    ?? process.env.PUBLIC_APP_URL
    ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
    ?? "https://workforce.tanaqolapp.com";
  const link = `${baseUrl.replace(/\/$/, "")}/candidate/onboarding`;

  await db.insert(smsOutbox).values({
    candidateId: rec.candidateId,
    recipientPhone: phone,
    kind: variant === "final" ? "onboarding_final_warning" : "onboarding_reminder",
    payload: {
      onboardingId: rec.id,
      missingDocs: missing,
      locale,
      link,
    },
    dedupeKey,
  }).onConflictDoNothing({ target: smsOutbox.dedupeKey });

  return true;
}

/**
 * Tear down an expired onboarding row. Mirrors the manual "Reset Like"
 * path in routes.ts so the existing reverse-sync hook handles
 * downstream cleanup.
 *
 * Two cases:
 *   - applicationId set → flip the application back to "interviewed"
 *     (this is what the reverse-sync hook listens for) and let it
 *     drop the orphan onboarding row.
 *   - applicationId null (SMP) → delete the onboarding row directly.
 *
 * In both cases we stamp eliminated_at first so a duplicate sweep
 * (e.g. a manual restart of the scheduler) skips the row.
 */
async function eliminateOnboarding(rec: OnboardingRecord): Promise<boolean> {
  try {
    // Atomic tear-down: stamp eliminated_at + flip application + delete
    // onboarding row in a single transaction. If any step throws, the
    // whole thing rolls back and the next sweep sees the row exactly as
    // before — no half-eliminated state where the row is excluded from
    // future sweeps but the application/onboarding cleanup never ran.
    const result = await db.transaction(async (tx) => {
      const [stamped] = await tx.update(onboarding)
        .set({ eliminatedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(onboarding.id, rec.id), isNull(onboarding.eliminatedAt)))
        .returning();
      if (!stamped) return false; // already eliminated by a concurrent sweep

      if (rec.applicationId) {
        // Use tx-scoped read/write so that any subsequent failure rolls
        // BOTH the application status flip AND the onboarding delete back.
        // Calling storage.* here would bypass the tx and commit the app
        // change independently — defeating the atomicity guarantee.
        const [app] = await tx.select().from(applications)
          .where(eq(applications.id, rec.applicationId));
        if (app && app.status === "shortlisted") {
          await tx.update(applications)
            .set({ status: "interviewed", updatedAt: new Date() })
            .where(eq(applications.id, rec.applicationId));
        }
        await tx.delete(onboarding).where(eq(onboarding.id, rec.id));
      } else {
        // SMP onboarding has no application linkage — delete directly.
        await tx.delete(onboarding).where(eq(onboarding.id, rec.id));
      }
      return true;
    });
    if (!result) return false;

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
    });
    return true;
  } catch (err) {
    console.error(`[onboarding-reminders] eliminate failed for ${rec.id}:`, err);
    return false;
  }
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
        ne(onboarding.status, "converted" as any),
        ne(onboarding.status, "rejected" as any),
        ne(onboarding.status, "terminated" as any),
      ));
  // Returned as an array so the frontend can iterate it directly without
  // worrying about iteration semantics on a plain object map.
  return rows.map((rec) => computeRowStatus(rec, cfg, now));
}

// Used in tests / manual ops.
export const __internal = { DEFAULT_CONFIG, DOC_TO_COLUMN, SMP_DOC_WHITELIST };
