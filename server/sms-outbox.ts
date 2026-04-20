// Task #107 — SMS outbox enqueue + drain worker.
//
// Why an outbox?  SMP commits enqueue thousands of activation SMS in a
// single transaction. Doing per-row HTTP calls to the SMS plugin inside
// that transaction would blow the request budget and tie atomicity to
// network reliability. Instead the route writes outbox rows; a background
// drain worker pulls them with `FOR UPDATE SKIP LOCKED`, sends, and stamps
// `sent_at` (or increments `attempts`, eventually `dead_letter_at`).
import { eq, sql, and, isNull, lt } from "drizzle-orm";
import { db } from "./db";
import {
  smsOutbox,
  candidates,
  systemSettings,
  type SmsOutboxRow,
} from "@shared/schema";
import { sendSmsViaPlugin } from "./sms-sender";
import { storage } from "./storage";
import { markActivationSmsSent } from "./activation-tokens";
import { trL } from "./i18n";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;

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
  tx: typeof db = db,
): Promise<void> {
  const baseUrl = (await tx
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "public_app_url")))[0]?.value
    ?? process.env.PUBLIC_APP_URL
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
 * Drain the next batch of pending SMS rows. Called every 30s by the
 * scheduler. Uses SKIP LOCKED so multiple workers (if any) coexist.
 */
export async function drainSmsOutbox(): Promise<{ sent: number; deadLettered: number; remaining: number }> {
  // Claim a batch.
  const claimed: SmsOutboxRow[] = await db.execute(sql`
    UPDATE sms_outbox
    SET attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM sms_outbox
      WHERE sent_at IS NULL AND dead_letter_at IS NULL
      ORDER BY created_at ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `).then((r: any) => r.rows ?? r);

  if (!Array.isArray(claimed) || claimed.length === 0) {
    return { sent: 0, deadLettered: 0, remaining: 0 };
  }

  // Resolve active SMS plugin once per batch.
  const plugin = await storage.getActiveSmsPlugin();
  if (!plugin) {
    // No active SMS plugin — leave rows pending, decrement attempts so we
    // don't burn the retry budget on misconfiguration.
    await db.update(smsOutbox)
      .set({ attempts: sql`GREATEST(0, ${smsOutbox.attempts} - 1)`, lastError: "no_active_sms_plugin" })
      .where(sql`${smsOutbox.id} IN (${sql.join(claimed.map((r: any) => sql`${r.id}`), sql`, `)})`);
    return { sent: 0, deadLettered: 0, remaining: claimed.length };
  }

  let sent = 0;
  let deadLettered = 0;

  for (const row of claimed) {
    const payload = row.payload as { link: string; locale: string; tokenRowId?: string };
    const locale = payload.locale === "ar" ? "ar" : "en";
    const message = trL(locale, "sms.smpActivation", { link: payload.link });

    try {
      const result = await sendSmsViaPlugin(plugin, row.recipientPhone, message);
      if (result.success) {
        await db.update(smsOutbox)
          .set({ sentAt: new Date(), lastError: null })
          .where(eq(smsOutbox.id, row.id));
        if (payload.tokenRowId) {
          await markActivationSmsSent(payload.tokenRowId);
        }
        sent++;
      } else {
        const err = result.error ?? "unknown_error";
        if (row.attempts >= MAX_ATTEMPTS) {
          await db.update(smsOutbox)
            .set({ deadLetterAt: new Date(), lastError: err })
            .where(eq(smsOutbox.id, row.id));
          deadLettered++;
        } else {
          await db.update(smsOutbox)
            .set({ lastError: err })
            .where(eq(smsOutbox.id, row.id));
        }
      }
    } catch (e: any) {
      const err = (e?.message ?? String(e)).slice(0, 500);
      if (row.attempts >= MAX_ATTEMPTS) {
        await db.update(smsOutbox)
          .set({ deadLetterAt: new Date(), lastError: err })
          .where(eq(smsOutbox.id, row.id));
        deadLettered++;
      } else {
        await db.update(smsOutbox)
          .set({ lastError: err })
          .where(eq(smsOutbox.id, row.id));
      }
    }
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
