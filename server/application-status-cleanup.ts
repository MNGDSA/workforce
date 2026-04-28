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
}

export interface ReverseSyncResult {
  removedOnboardingIds: string[];
}

/**
 * Apply the same orphan-onboarding cleanup that the manual "Reset Like"
 * flow performs. Safe to call when the transition is not actually a
 * reset (we no-op in that case).
 */
export async function applyShortlistResetCleanup(ctx: ReverseSyncContext): Promise<ReverseSyncResult> {
  const result: ReverseSyncResult = { removedOnboardingIds: [] };

  if (
    ctx.previousStatus !== "shortlisted" ||
    ctx.newStatus === "shortlisted" ||
    !ctx.candidateId
  ) {
    return result;
  }

  const pending = await storage.getOnboardingRecords({
    candidateId: ctx.candidateId,
    status: "pending",
  });
  if (pending.length === 0) return result;

  for (const ob of pending) {
    await storage.deleteOnboardingRecord(ob.id);
    result.removedOnboardingIds.push(ob.id);
    await storage.createAuditLog({
      action: "onboarding.auto_remove_on_reset",
      entityType: "onboarding",
      entityId: ob.id,
      description: `Removed pending onboarding for "${ctx.candidateName ?? ctx.candidateId}" because the application shortlist was reset (${ctx.previousStatus} → ${ctx.newStatus}).`,
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
    });
  }

  return result;
}
