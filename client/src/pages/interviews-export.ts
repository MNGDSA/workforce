/**
 * Pure helpers for the InterviewCandidatesPage Excel export (Task #255).
 *
 * Extracted from interviews.tsx so the row-building, decision bucketing, and
 * filename derivation can be unit-tested without rendering the React tree or
 * spinning up the xlsx writer. The component owns IO (XLSX.writeFile, toasts);
 * everything here is referentially transparent.
 *
 * Schema note: the workbook is now 7 columns (down from the original 10).
 * The internal candidate ID (`candidateCode` / UUID), the Arabic display
 * name, and the question-set name were dropped per recruiter request —
 * those columns either duplicated information already keyed by the
 * national ID or surfaced internal identifiers that never made it into
 * the recruiter's downstream tooling. The remaining columns are the
 * minimum needed to match a row to a real person and capture the
 * shortlist/reject decision.
 */

import { slugifyForFilename } from "./interviews-multi-id-search";

export type ExportInvitee = {
  id: string;
  fullNameEn: string;
  nationalId: string | null;
  phone: string | null;
  applicationStatus: string | null;
};

export type ExportDecisionRaw = "shortlisted" | "rejected" | "none";

export interface DecisionLabels {
  liked: string;
  disliked: string;
  none: string;
}

/**
 * Bucket the effective application status into the three values the export
 * surfaces. Anything not equal to "shortlisted" or "rejected" — including
 * null, "invited", "interviewed", "withdrawn", etc — collapses to "none",
 * matching the on-screen badge logic in InterviewCandidatesPage.
 */
export function bucketDecision(effectiveStatus: string | null | undefined): ExportDecisionRaw {
  if (effectiveStatus === "shortlisted") return "shortlisted";
  if (effectiveStatus === "rejected") return "rejected";
  return "none";
}

/**
 * Build the 7-column row for a single invitee. Column order MUST match the
 * headers built in `buildExportHeaders`. Returned values are JS primitives so
 * the caller can pass them straight into `XLSX.utils.aoa_to_sheet`.
 *
 * `localStatuses` mirrors the optimistic state the user sees in the UI;
 * the export must reflect that, not the (possibly stale) server value.
 */
export function buildExportRow(
  candidate: ExportInvitee,
  index: number,
  localStatuses: Record<string, string>,
  labels: DecisionLabels,
): (string | number)[] {
  const effectiveStatus = localStatuses[candidate.id] ?? candidate.applicationStatus;
  const raw = bucketDecision(effectiveStatus);
  const decisionLabel =
    raw === "shortlisted" ? labels.liked
      : raw === "rejected" ? labels.disliked
      : labels.none;
  return [
    index + 1,
    candidate.fullNameEn ?? "",
    candidate.nationalId ?? "",
    candidate.phone ?? "",
    decisionLabel,
    raw,
    effectiveStatus ?? "",
  ];
}

export interface HeaderLabels {
  num: string;
  fullNameEn: string;
  nationalId: string;
  phone: string;
  decision: string;
  decisionRaw: string;
  applicationStatus: string;
}

export function buildExportHeaders(h: HeaderLabels): string[] {
  return [
    h.num,
    h.fullNameEn,
    h.nationalId,
    h.phone,
    h.decision,
    h.decisionRaw,
    h.applicationStatus,
  ];
}

/**
 * Sanitize an interview group name for use as an Excel sheet name. Excel
 * sheet names cannot exceed 31 characters and cannot contain any of the
 * characters : \\ / ? * [ ]. Empty/missing names fall back to "Interview".
 */
export function buildSheetName(groupName: string | null | undefined): string {
  const raw = (groupName ?? "").trim() || "Interview";
  return raw.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);
}

/**
 * Build the download filename. Always includes a slug derived from the
 * group name so the file is identifiable even when the recruiter exports
 * several interviews back-to-back; falls back to "session" when the name
 * is missing or contains no ASCII characters (matches the convention used
 * by `buildMissingIdsFilename` in interviews-multi-id-search.ts).
 */
export function buildExportFilename(groupName: string | null | undefined, now: Date = new Date()): string {
  const slug = slugifyForFilename(groupName ?? null, "session");
  const dateStr = now.toISOString().slice(0, 10);
  return `interview_${slug}_${dateStr}.xlsx`;
}
