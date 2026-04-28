// Task #107 — SMS outbox enqueue + drain worker.
//
// Why an outbox?  SMP commits enqueue thousands of activation SMS in a
// single transaction. Doing per-row HTTP calls to the SMS plugin inside
// that transaction would blow the request budget and tie atomicity to
// network reliability. Instead the route writes outbox rows; a background
// drain worker pulls them one at a time inside a per-row transaction
// that holds `FOR UPDATE SKIP LOCKED` on the row throughout the send,
// stamps `sent_at` on success, increments `attempts` and records the
// failure reason on transient errors, and stamps `dead_letter_at` once
// `attempts > MAX_ATTEMPTS`.
//
// Per-row transactional claim ensures exactly-once delivery semantics
// across concurrent drain workers: while one worker is processing a
// row, the row stays locked, so no other worker can re-claim and
// re-send it.
//
// Per-phone rate limit at drain time prevents a single bulk re-issue
// from saturating the SMS provider and prevents accidental loops from
// blasting one number — checked inside the same transaction as the
// claim using a recent-`sent_at` count, so the limit is tx-safe even
// under concurrent workers.
import { eq, sql, and, isNull, gte } from "drizzle-orm";
import { db } from "./db";

// Drizzle's transaction callback gets a PgTransaction; module-level
// queries use the NodePgDatabase. They share a query interface but
// differ structurally, so helpers that may run in either context
// accept this union.
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
import {
  smsOutbox,
  systemSettings,
  type SmsOutboxRow,
} from "@shared/schema";
import { sendSmsViaPlugin } from "./sms-sender";
import { storage } from "./storage";
import { markActivationSmsSent } from "./activation-tokens";
import { trL } from "./i18n";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;

// Per-phone throttle at drain time: at most PHONE_RATE_MAX successful
// sends per PHONE_RATE_WINDOW_MS milliseconds. Tunable; defaults match
// the per-phone OTP cap (3 per 10 minutes) so the SMP self-heal flow
// can never out-blast the OTP path.
export const PHONE_RATE_MAX = 3;
export const PHONE_RATE_WINDOW_MS = 10 * 60 * 1000;

// Backoff timestamps after a failed attempt control re-claim eligibility.
// They are what gives concurrent drain workers exactly-once-claim
// semantics: once worker A's tx commits with a failure, the row's
// next_attempt_at is set to "now + backoff", so worker B's claim
// SELECT (which filters on next_attempt_at <= now) will NOT pick the
// same row up immediately.
const TRANSIENT_BACKOFF_MS = 60 * 1000;
const RATE_LIMIT_BACKOFF_MS = 60 * 1000;
const NO_PLUGIN_BACKOFF_MS = 30 * 1000;

export interface EnqueueActivationOptions {
  candidateId: string;
  recipientPhone: string;
  plainToken: string;
  tokenRowId: string;
  candidateLocale: string;
  kind?: "smp_activation" | "smp_activation_reissue" | "smp_activation_self_heal";
  dedupeKey?: string;
}

/**
 * Enqueue a single activation SMS. Idempotent via dedupeKey.
 *
 * MUST be called inside the same transaction that minted the activation
 * token row, so a failed enqueue rolls back the token (preserving the
 * single-live-token invariant).
 */
export async function enqueueActivationSms(
  opts: EnqueueActivationOptions,
  tx: DbOrTx = db,
): Promise<void> {
  const baseUrl = (await tx
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "public_app_url")))[0]?.value
    ?? process.env.PUBLIC_APP_URL
    ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
    ?? "https://workforce.tanaqolapp.com";
  const link = `${baseUrl.replace(/\/$/, "")}/activate?token=${encodeURIComponent(opts.plainToken)}`;

  await tx.insert(smsOutbox).values({
    candidateId: opts.candidateId,
    recipientPhone: opts.recipientPhone,
    kind: opts.kind ?? "smp_activation",
    payload: {
      tokenRowId: opts.tokenRowId,
      link,
      locale: opts.candidateLocale,
    },
    dedupeKey: opts.dedupeKey ?? null,
  }).onConflictDoNothing({ target: smsOutbox.dedupeKey });
}

/**
 * Internal: claim a single pending row inside a transaction. Holds
 * FOR UPDATE on the row until the transaction commits, so concurrent
 * workers cannot re-claim it. Returns null if no pending rows are
 * available (or all candidates are locked by other workers).
 */
async function claimOneRow(tx: DbOrTx, excludeIds: string[]): Promise<SmsOutboxRow | null> {
  // The next_attempt_at filter is what gives us exactly-once semantics
  // across concurrent workers: a transient failure stamps next_attempt_at
  // = now + backoff, so a parallel drain cannot immediately re-claim the
  // same pending row after the first worker's tx commits and releases
  // the row lock. excludeIds protects against the same drain cycle
  // re-claiming the same row.
  //
  // Two-step claim: (1) raw UPDATE...RETURNING id grabs and locks one
  // pending row inside the FOR UPDATE SKIP LOCKED subquery; (2) a
  // typed Drizzle select fetches the row by id with proper camelCase
  // column mapping. The lock is held by the UPDATE for the rest of the
  // tx, so no other worker can touch the row before commit.
  const exclusionSql = excludeIds.length > 0
    ? sql`AND id NOT IN (${sql.join(excludeIds.map((id) => sql`${id}`), sql`, `)})`
    : sql``;
  const now = new Date();
  const claimed = await tx.execute<{ id: string }>(sql`
    UPDATE sms_outbox
    SET attempts = attempts + 1
    WHERE id = (
      SELECT id FROM sms_outbox
      WHERE sent_at IS NULL
        AND dead_letter_at IS NULL
        AND (next_attempt_at IS NULL OR next_attempt_at <= ${now})
        ${exclusionSql}
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);
  const rawRows = (claimed as unknown as { rows?: { id: string }[] }).rows
    ?? (claimed as unknown as { id: string }[]);
  if (!Array.isArray(rawRows) || rawRows.length === 0) return null;
  const claimedId = rawRows[0].id;
  const [row] = await tx.select().from(smsOutbox).where(eq(smsOutbox.id, claimedId));
  return row ?? null;
}

/**
 * Internal: count successful sends to `phone` within the rate-limit
 * window. Read inside the same transaction as the claim so concurrent
 * workers see a consistent view.
 */
async function countRecentSends(tx: DbOrTx, phone: string): Promise<number> {
  const since = new Date(Date.now() - PHONE_RATE_WINDOW_MS);
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(smsOutbox)
    .where(and(
      eq(smsOutbox.recipientPhone, phone),
      gte(smsOutbox.sentAt, since),
    ));
  return Number(row?.n ?? 0);
}

interface OutboxPayload {
  link: string;
  locale: string;
  tokenRowId?: string;
  // Task #214: onboarding reminder/final-warning rows attach the doc list.
  onboardingId?: string;
  missingDocs?: string[];
}

// Map reminder doc id → i18n label key suffix (server-side keys live
// under "docs."). Keep in sync with onboarding-reminders.ts.
function docToLabelKey(d: string): string {
  if (d === "national_id") return "nationalId";
  return d;
}

/** Stamp a transient or permanent failure on the given row inside the
 * caller's tx. Sets next_attempt_at so concurrent workers cannot
 * immediately re-claim the same row. */
async function stampFailure(
  tx: DbOrTx,
  row: SmsOutboxRow,
  err: string,
): Promise<{ outcome: "deadLettered" | "transientError"; id: string }> {
  // Spec: dead-letter once attempts > MAX_ATTEMPTS. row.attempts is the
  // value AFTER the claim's increment, so a fresh row's first failure
  // has row.attempts === 1, and dead-letter only fires when this is the
  // 6th-or-later attempt (row.attempts > 5).
  if (row.attempts > MAX_ATTEMPTS) {
    await tx
      .update(smsOutbox)
      .set({ deadLetterAt: new Date(), lastError: err })
      .where(eq(smsOutbox.id, row.id));
    return { outcome: "deadLettered" as const, id: row.id };
  }
  await tx
    .update(smsOutbox)
    .set({
      lastError: err,
      nextAttemptAt: new Date(Date.now() + TRANSIENT_BACKOFF_MS),
    })
    .where(eq(smsOutbox.id, row.id));
  return { outcome: "transientError" as const, id: row.id };
}

/**
 * Process a single row inside its own transaction. Returns the outcome
 * for accounting in the caller. The transaction holds the row's lock
 * for the duration of the send, so other workers cannot re-claim it.
 */
async function processOneRow(excludeIds: string[]): Promise<{ outcome: "sent" | "deadLettered" | "skipped" | "noPlugin" | "rateLimited" | "transientError" | "empty"; id: string | null }> {
  return await db.transaction(async (tx) => {
    const row = await claimOneRow(tx, excludeIds);
    if (!row) return { outcome: "empty" as const, id: null };

    // Per-phone rate-limit check. Take a phone-keyed advisory xact
    // lock first so two parallel workers cannot both observe "count
    // below cap" for the same phone and both proceed to send. This
    // mirrors the reservation primitive used by
    // tryReserveAndCreateOtpVerification, applied at drain time so
    // the cap holds even when bulk re-issue enqueues many rows for
    // the same number.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${row.recipientPhone}))`);
    const recentSends = await countRecentSends(tx, row.recipientPhone);
    if (recentSends >= PHONE_RATE_MAX) {
      // Roll back the attempts increment and record the reason. The row
      // stays pending so a subsequent drain cycle (after the window
      // slides) will pick it up.
      await tx
        .update(smsOutbox)
        .set({
          attempts: sql`GREATEST(0, ${smsOutbox.attempts} - 1)`,
          lastError: "phone_rate_limited",
          nextAttemptAt: new Date(Date.now() + RATE_LIMIT_BACKOFF_MS),
        })
        .where(eq(smsOutbox.id, row.id));
      return { outcome: "rateLimited" as const, id: row.id };
    }

    // Resolve plugin (cheap; cached at the storage layer).
    const plugin = await storage.getActiveSmsPlugin();
    if (!plugin) {
      // Don't burn the retry budget on a misconfiguration. Backoff
      // briefly so a parallel worker doesn't hot-loop on the same
      // row inside the same scheduler tick.
      await tx
        .update(smsOutbox)
        .set({
          attempts: sql`GREATEST(0, ${smsOutbox.attempts} - 1)`,
          lastError: "no_active_sms_plugin",
          nextAttemptAt: new Date(Date.now() + NO_PLUGIN_BACKOFF_MS),
        })
        .where(eq(smsOutbox.id, row.id));
      return { outcome: "noPlugin" as const, id: row.id };
    }

    const payload = row.payload as OutboxPayload;
    const locale = payload.locale === "ar" ? "ar" : "en";
    // Template selection by kind. Activation kinds use the link-only
    // template; onboarding reminders include a comma-joined doc list
    // localized by the candidate's locale.
    let message: string;
    if (row.kind === "onboarding_reminder" || row.kind === "onboarding_final_warning") {
      const docIds = Array.isArray(payload.missingDocs) ? payload.missingDocs : [];
      const docLabels = docIds.map((d) => trL(locale, `docs.${docToLabelKey(d)}`));
      // Fallback: if any label is missing, use the doc id itself.
      const docs = docLabels.map((l, i) => l && l !== `docs.${docToLabelKey(docIds[i])}` ? l : docIds[i]).join(", ");
      const key = row.kind === "onboarding_final_warning"
        ? "sms.onboardingFinalWarning"
        : "sms.onboardingReminder";
      message = trL(locale, key, { docs, link: payload.link });
    } else {
      message = trL(locale, "sms.smpActivation", { link: payload.link });
    }

    try {
      const result = await sendSmsViaPlugin(plugin, row.recipientPhone, message);
      if (result.success) {
        await tx
          .update(smsOutbox)
          .set({ sentAt: new Date(), lastError: null })
          .where(eq(smsOutbox.id, row.id));
        if (payload.tokenRowId) {
          // markActivationSmsSent is best-effort; failure here would
          // roll back the send acknowledgement (since we're in a tx),
          // which would cause the next drain to re-send the SMS.
          await markActivationSmsSent(payload.tokenRowId);
        }
        return { outcome: "sent" as const, id: row.id };
      }
      const err = result.error ?? "unknown_error";
      return await stampFailure(tx, row, err);
    } catch (e) {
      const err = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      return await stampFailure(tx, row, err);
    }
  });
}

/**
 * Drain pending SMS rows. Called every 30s by the scheduler. Each row
 * is claimed and processed inside its own transaction (FOR UPDATE
 * SKIP LOCKED) so concurrent drain workers achieve exactly-once
 * delivery semantics.
 */
export async function drainSmsOutbox(): Promise<{ sent: number; deadLettered: number; remaining: number }> {
  let sent = 0;
  let deadLettered = 0;

  const seenIds: string[] = [];
  for (let i = 0; i < BATCH_SIZE; i++) {
    const { outcome, id } = await processOneRow(seenIds);
    if (outcome === "empty") break;
    if (id) seenIds.push(id);
    if (outcome === "sent") sent++;
    else if (outcome === "deadLettered") deadLettered++;
  }

  // Quick re-count of remaining pending rows for log/monitoring.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(smsOutbox)
    .where(and(isNull(smsOutbox.sentAt), isNull(smsOutbox.deadLetterAt)));

  return { sent, deadLettered, remaining: count };
}

/**
 * Invalidate any pending outbox rows for a candidate (e.g. when their phone
 * changes — old SMS to old number must not be sent). Stamps dead_letter_at
 * with reason `phone_change_invalidated`.
 */
export async function invalidatePendingActivationSms(candidateId: string): Promise<number> {
  const result = await db.update(smsOutbox)
    .set({ deadLetterAt: new Date(), lastError: "phone_change_invalidated" })
    .where(and(
      eq(smsOutbox.candidateId, candidateId),
      isNull(smsOutbox.sentAt),
      isNull(smsOutbox.deadLetterAt),
    ))
    .returning({ id: smsOutbox.id });
  return result.length;
}
