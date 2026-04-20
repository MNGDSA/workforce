// Task #107 — Single authority enforcing the rule "scheduled-session and
// direct-hire/apply pipelines are individual-classification-only."
//
// Every action layer that mutates an invitee/applicant set MUST call
// `assertIndividualPipelineEligible(candidateIds)` before persisting. The
// helper throws a structured error when any candidate is SMP-classified;
// route handlers translate it to a 400 with a bilingual i18n key.
import { db } from "./db";
import { candidates } from "@shared/schema";
import { inArray } from "drizzle-orm";

export class SmpPipelineExclusionError extends Error {
  readonly code = "SMP_NOT_ELIGIBLE";
  readonly i18nKey = "pipeline.smpNotEligible";
  readonly blockedIds: string[];
  constructor(blockedIds: string[]) {
    super(`SMP candidates are excluded from individual pipelines: ${blockedIds.join(", ")}`);
    this.blockedIds = blockedIds;
  }
}

/**
 * Throws SmpPipelineExclusionError if ANY id in the list is classified=smp.
 * No-op when list is empty. Inputs: candidate UUIDs (deduped internally).
 */
export async function assertIndividualPipelineEligible(
  candidateIds: string[],
): Promise<void> {
  const unique = Array.from(new Set(candidateIds.filter(Boolean)));
  if (unique.length === 0) return;

  const rows = await db
    .select({ id: candidates.id, classification: candidates.classification })
    .from(candidates)
    .where(inArray(candidates.id, unique));

  const blocked = rows.filter((r) => r.classification === "smp").map((r) => r.id);
  if (blocked.length > 0) {
    throw new SmpPipelineExclusionError(blocked);
  }
}
