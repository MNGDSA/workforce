// Shared helper for the "shortlisted → non-shortlisted" reverse-sync rule.
//
// Two callers must agree on this behaviour:
//   1. PATCH /api/applications/:id  (manual "Reset Like" by an admin)
//   2. The onboarding reminder engine when it auto-eliminates a row
//      whose deadline has elapsed.
//
// Centralising the rule here means an isolated change to one path
// cannot drift away from the other — which was the root cause of the
// task #214 architect rejection. Both callers receive the same audit
// record, the same orphan-cleanup behaviour, and the same admin alert
// signalling.

import type { Application, InsertApplication } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";

export interface ReverseSyncContext {
  /** Pre-update application status (must be the value BEFORE the storage update). */
  previousStatus: string | null;
  /** Post-update application status. */
  newStatus: string;
  /** Application id that just changed. */
  applicationId: string;
  /** Candidate id from the PRE-update snapshot (orphan belongs to the OLD candidate if both fields mutated). */
  candidateId: string | null;
  /** Display name for audit/alert. */
  candidateName?: string | null;
  /** Audit actor — null for system-driven flips (the reminder sweep). */
  actor: { id: string | null; name: string };
  /** Optional extra metadata attached to the audit log. */
  metadata?: Record<string, unknown>;
  /**
   * When true, bypass the "previousStatus must be shortlisted" gate.
   * Used by the auto-elimination path which always wants the cleanup
   * regardless of the pre-update application status. The manual PATCH
   * /api/applications/:id route never sets this (preserves manual
   * reset semantics).
   */
  force?: boolean;
}

export interface ReverseSyncResult {
  removedOnboardingIds: string[];
}

/**
 * Apply the same orphan-onboarding cleanup that the manual "Reset Like"
 * flow performs. Safe to call when the transition is not actually a
 * reset (we no-op in that case).
 *
 * Optionally accepts a transaction handle (`tx`). When supplied, the
 * onboarding deletes and audit-log inserts execute against that tx so
 * the caller can wrap several writes in a single atomic block. The
 * pre-flight read of existing onboarding records still goes through
 * `storage.getOnboardingRecords` (which uses the base `db`); the
 * cleanup is always invoked under contexts where the candidate's
 * onboarding rows would not be concurrently mutated, so we accept the
 * cross-handle read for simplicity.
 */
export async function applyShortlistResetCleanup(
  ctx: ReverseSyncContext,
  tx?: any,
): Promise<ReverseSyncResult> {
  const result: ReverseSyncResult = { removedOnboardingIds: [] };

  if (!ctx.candidateId) return result;
  if (!ctx.force) {
    if (ctx.previousStatus !== "shortlisted" || ctx.newStatus === "shortlisted") {
      return result;
    }
  }

  const all = await storage.getOnboardingRecords({
    candidateId: ctx.candidateId,
  });
  const removable = all.filter(o =>
    o.status === "pending" || o.status === "in_progress" || o.status === "ready"
  );
  if (removable.length === 0) return result;

  for (const ob of removable) {
    await storage.deleteOnboardingRecord(ob.id, tx);
    result.removedOnboardingIds.push(ob.id);
    await storage.createAuditLog({
      action: "onboarding.auto_remove_on_reset",
      entityType: "onboarding",
      entityId: ob.id,
      description: `Removed ${ob.status} onboarding for "${ctx.candidateName ?? ctx.candidateId}" because the application shortlist was reset (${ctx.previousStatus} → ${ctx.newStatus}).`,
      metadata: {
        candidateId: ctx.candidateId,
        applicationId: ctx.applicationId,
        onboardingId: ob.id,
        previousStatus: ctx.previousStatus,
        newStatus: ctx.newStatus,
        ...(ctx.metadata ?? {}),
      },
      actorId: ctx.actor.id,
      actorName: ctx.actor.name,
    }, tx);
  }

  return result;
}

/**
 * Manual-reset entry point used by `PATCH /api/applications/:id`.
 *
 * Wraps the application-status update and the shared
 * `applyShortlistResetCleanup` call in a single `db.transaction(...)` so
 * the manual "Reset Like" flow gets the same all-or-nothing semantics
 * Task #219 gave the auto-elimination flow. If the cleanup throws (e.g.
 * `storage.deleteOnboardingRecord` fails), Postgres rolls the status
 * flip back too — no more orphan onboarding rows left behind by a
 * partial reset.
 *
 * Returns the updated application, or `undefined` when the application
 * id does not exist (so callers can map to a 404). Errors are
 * rethrown unchanged so the caller's error handler can decide how to
 * surface them — we deliberately do NOT swallow cleanup failures.
 */
export async function applyApplicationStatusUpdate(opts: {
  applicationId: string;
  data: Partial<InsertApplication>;
  actor: { id: string | null; name: string };
}): Promise<Application | undefined> {
  // Pre-update snapshot. Read OUTSIDE the transaction — it is a plain
  // SELECT and the snapshot intentionally captures the OLD candidateId
  // even when the same PATCH mutates both candidateId and status (the
  // orphan onboarding row belongs to the OLD candidate, not the new
  // one).
  const previousApp = await storage.getApplication(opts.applicationId);
  const previousStatus = previousApp?.status ?? null;
  const cleanupCandidateId = previousApp?.candidateId ?? null;

  return await db.transaction(async (tx) => {
    const updated = await storage.updateApplication(opts.applicationId, opts.data, tx);
    if (!updated) return undefined;

    // Reverse-sync: shortlist → reset (or any non-shortlisted status)
    // sweeps any pending|in_progress|ready onboarding rows for this
    // candidate. Identical to the auto-elimination caller modulo the
    // `force` flag — manual resets keep the original gate so flipping
    // a non-shortlisted status to another non-shortlisted status never
    // tears down onboarding work.
    const newStatus = opts.data.status;
    if (
      previousStatus === "shortlisted" &&
      typeof newStatus === "string" &&
      newStatus !== "shortlisted" &&
      cleanupCandidateId
    ) {
      const candidate = await storage.getCandidate(cleanupCandidateId);
      await applyShortlistResetCleanup({
        previousStatus,
        newStatus,
        applicationId: updated.id,
        candidateId: cleanupCandidateId,
        candidateName: candidate?.fullNameEn ?? null,
        actor: opts.actor,
      }, tx);
    }

    return updated;
  });
}
