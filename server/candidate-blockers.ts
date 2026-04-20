// Task #107 — Single source of truth for "is this candidate blocked from
// being reclassified / sent-to-onboarding / re-issued an activation token?"
//
// Returns a per-candidate map of blocker reasons. UI surfaces them as a
// human-readable list; admin endpoints refuse the action when any blocker
// is present (or when --force is asserted, the admin endpoint logs the
// override and proceeds — see /api/candidates/:id/reclassify).
import { db } from "./db";
import {
  workforce,
  onboarding,
  interviews,
  applications,
} from "@shared/schema";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

export type BlockerReason =
  | "active_workforce"        // is_active=true row exists
  | "pending_onboarding"      // onboarding row in non-terminal status
  | "scheduled_session"       // upcoming interview/training session
  | "pending_application";    // application in non-terminal status

export interface CandidateBlockers {
  candidateId: string;
  reasons: BlockerReason[];
}

/**
 * Returns one entry per candidate id (preserving input order). Empty
 * reasons array = candidate is unblocked.
 *
 * Implementation note: this is intentionally a single function rather than
 * four scattered checks. Every call site (reclassify, send-to-onboarding,
 * reissue) MUST go through here so that adding a new blocker type only
 * requires editing this file.
 */
export async function getCandidateBlockers(
  candidateIds: string[],
): Promise<CandidateBlockers[]> {
  if (candidateIds.length === 0) return [];

  // Active workforce records (any classification — both individual and SMP
  // active records block re-issuance / reclassification).
  const activeWf = await db
    .select({ candidateId: workforce.candidateId })
    .from(workforce)
    .where(and(
      inArray(workforce.candidateId, candidateIds),
      eq(workforce.isActive, true),
    ));
  const activeWfSet = new Set(activeWf.map((r) => r.candidateId));

  // Pending onboarding records (anything not converted/cancelled).
  const pendingOnb = await db
    .select({ candidateId: onboarding.candidateId })
    .from(onboarding)
    .where(and(
      inArray(onboarding.candidateId, candidateIds),
      sql`${onboarding.status} NOT IN ('converted', 'rejected', 'terminated')`,
    ));
  const pendingOnbSet = new Set(pendingOnb.map((r) => r.candidateId));

  // Scheduled (future) interview/training sessions where this candidate is
  // the primary or in invitedCandidateIds.
  const scheduled = await db
    .select({
      candidateId: interviews.candidateId,
      invited: interviews.invitedCandidateIds,
    })
    .from(interviews)
    .where(and(
      sql`${interviews.scheduledAt} > now()`,
      sql`${interviews.status} IN ('scheduled')`,
      or(
        inArray(interviews.candidateId, candidateIds),
        sql`${interviews.invitedCandidateIds} && ARRAY[${sql.join(candidateIds.map((id) => sql`${id}`), sql`, `)}]::text[]`,
      ),
    ));
  const scheduledSet = new Set<string>();
  for (const row of scheduled) {
    if (row.candidateId && candidateIds.includes(row.candidateId)) scheduledSet.add(row.candidateId);
    for (const id of row.invited ?? []) {
      if (candidateIds.includes(id)) scheduledSet.add(id);
    }
  }

  // Pending applications.
  const pendingApp = await db
    .select({ candidateId: applications.candidateId })
    .from(applications)
    .where(and(
      inArray(applications.candidateId, candidateIds),
      sql`${applications.status} NOT IN ('rejected', 'withdrawn', 'hired')`,
    ));
  const pendingAppSet = new Set(
    pendingApp.map((r) => r.candidateId).filter((id): id is string => !!id),
  );

  return candidateIds.map((id) => {
    const reasons: BlockerReason[] = [];
    if (activeWfSet.has(id)) reasons.push("active_workforce");
    if (pendingOnbSet.has(id)) reasons.push("pending_onboarding");
    if (scheduledSet.has(id)) reasons.push("scheduled_session");
    if (pendingAppSet.has(id)) reasons.push("pending_application");
    return { candidateId: id, reasons };
  });
}
