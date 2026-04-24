// Excel export logic for the applicants table on /job-posting/:id, lifted
// out of the page component so it can be unit-tested without a React /
// JSX runtime. The page imports `exportApplicantsToFile` (the same
// behaviour as before) and tests import `buildApplicantsWorkbook` to
// inspect the workbook contents directly.

import * as XLSX from "xlsx";
import type { TFunction } from "i18next";

export type GenderValue = "male" | "female" | "other" | "prefer_not_to_say";

export type ExportJob = { title: string };

export type ExportApplication = {
  id: string;
  candidateId: string;
  status: string;
  questionSetAnswers?: { questionSetId?: string; answers?: Record<string, string> } | null;
};

export type ExportCandidate = {
  id: string;
  fullNameEn: string;
  nationalId?: string;
  phone?: string;
  email?: string;
  city?: string;
  gender?: GenderValue | null;
};

export type ExportQuestion = { id: string; text: string; type?: string; options?: string[] };

export const VALID_STATUSES = [
  "new", "shortlisted", "interviewed", "offered", "hired", "rejected",
] as const;

export function formatAnswerForDisplay(q: ExportQuestion, raw: string): string {
  if (!raw) return "";
  if (q.type === "job_ranking") {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    return parts.map((p, i) => `${i + 1}. ${p}`).join(" · ");
  }
  return raw;
}

export function genderLabel(gender: GenderValue | null | undefined, t: TFunction): string {
  if (gender === "male") return t("jobPosting:detail.sexMale");
  if (gender === "female") return t("jobPosting:detail.sexFemale");
  if (gender === "other" || gender === "prefer_not_to_say") return t("jobPosting:detail.sexOther");
  return "—";
}

export function buildApplicantsWorkbook(
  job: ExportJob,
  applications: ExportApplication[],
  candidates: ExportCandidate[],
  questions: ExportQuestion[] = [],
  t: TFunction,
): XLSX.WorkBook {
  const candidateMap = Object.fromEntries(candidates.map((c) => [c.id, c]));
  const questionHeaders = questions.map((q, i) => `Q${i + 1}: ${q.text}`);
  const fixedHeaders = [
    t("jobPosting:detail.exportColAppId"),
    t("jobPosting:detail.exportColName"),
    t("jobPosting:detail.exportColNationalId"),
    t("jobPosting:detail.exportColEmail"),
    t("jobPosting:detail.exportColPhone"),
    t("jobPosting:detail.colCity"),
    t("jobPosting:detail.colSex"),
    t("jobPosting:detail.exportColCurrentStatus"),
    t("jobPosting:detail.exportColNewStatus"),
  ];
  const headers = [...fixedHeaders, ...questionHeaders];
  const rows = applications.map((app) => {
    const c = candidateMap[app.candidateId];
    const answers = app.questionSetAnswers?.answers ?? {};
    return [
      app.id,
      c?.fullNameEn ?? t("jobPosting:detail.unknownCandidate"),
      c?.nationalId ?? "",
      c?.email ?? "",
      c?.phone ?? "",
      c?.city ?? "",
      genderLabel(c?.gender, t),
      app.status,
      app.status,
      ...questions.map((q) => formatAnswerForDisplay(q, answers[q.id] ?? "")),
    ];
  });
  const instructionRow = [
    t("jobPosting:detail.exportInstruction", {
      title: job.title,
      validStatuses: VALID_STATUSES.join(", "),
    }),
  ];
  const ws = XLSX.utils.aoa_to_sheet([instructionRow, headers, ...rows]);
  const colWidths = headers.map((h, i) => ({
    wch: Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length), 14),
  }));
  ws["!cols"] = colWidths;
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Applicants");
  return wb;
}

export function exportApplicantsToFile(
  job: ExportJob,
  applications: ExportApplication[],
  candidates: ExportCandidate[],
  questions: ExportQuestion[] = [],
  t: TFunction,
) {
  const wb = buildApplicantsWorkbook(job, applications, candidates, questions, t);
  XLSX.writeFile(wb, `applicants-${job.title.replace(/\s+/g, "-")}.xlsx`);
}
