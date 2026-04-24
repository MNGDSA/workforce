// Pure filter + sort logic for the applicants table on /job-posting/:id.
// Lifted out of the page component so the search+status+sort composition
// can be unit-tested without rendering React.

import type { GenderValue } from "./job-posting-detail-export";

export type ApplicantApplication = {
  id: string;
  candidateId: string;
  status: string;
  appliedAt: string;
  questionSetAnswers?: { questionSetId?: string; answers?: Record<string, string> } | null;
};

export type ApplicantCandidate = {
  id: string;
  fullNameEn: string;
  nationalId?: string;
  phone?: string;
  email?: string;
  city?: string;
  gender?: GenderValue | null;
};

export type SortKey = "candidate" | "city" | "sex" | "status" | "applied";
export type SortDir = "asc" | "desc";

export const STATUS_ORDER: Record<string, number> = {
  new: 0,
  reviewing: 1,
  shortlisted: 2,
  interviewed: 3,
  offered: 4,
  hired: 5,
  rejected: 6,
  withdrawn: 7,
  closed: 8,
};

export const GENDER_ORDER: Record<GenderValue, number> = {
  female: 0,
  male: 1,
  other: 2,
  prefer_not_to_say: 3,
};

export function filterApplicants(
  applications: ApplicantApplication[],
  candidateMap: Record<string, ApplicantCandidate>,
  search: string,
  statusFilter: string,
): ApplicantApplication[] {
  const q = search.trim().toLowerCase();
  return applications.filter((a) => {
    const c = candidateMap[a.candidateId];
    const matchesSearch = !q
      || c?.fullNameEn?.toLowerCase().includes(q)
      || c?.nationalId?.includes(q)
      || c?.phone?.includes(q)
      || c?.email?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    return Boolean(matchesSearch && matchesStatus);
  });
}

export function sortApplicants(
  applications: ApplicantApplication[],
  candidateMap: Record<string, ApplicantCandidate>,
  sortKey: SortKey,
  sortDir: SortDir,
  collator: Intl.Collator,
): ApplicantApplication[] {
  const dir = sortDir === "asc" ? 1 : -1;
  const blankCmp = (aBlank: boolean, bBlank: boolean): number | null => {
    if (aBlank && bBlank) return 0;
    if (aBlank) return 1;
    if (bBlank) return -1;
    return null;
  };
  return [...applications].sort((a, b) => {
    const ca = candidateMap[a.candidateId];
    const cb = candidateMap[b.candidateId];
    switch (sortKey) {
      case "candidate": {
        const av = ca?.fullNameEn ?? "";
        const bv = cb?.fullNameEn ?? "";
        const blank = blankCmp(!av, !bv);
        if (blank !== null) return blank;
        return collator.compare(av, bv) * dir;
      }
      case "city": {
        const av = ca?.city ?? "";
        const bv = cb?.city ?? "";
        const blank = blankCmp(!av, !bv);
        if (blank !== null) return blank;
        return collator.compare(av, bv) * dir;
      }
      case "sex": {
        const av = ca?.gender;
        const bv = cb?.gender;
        const blank = blankCmp(!av, !bv);
        if (blank !== null) return blank;
        return ((GENDER_ORDER[av!] ?? 99) - (GENDER_ORDER[bv!] ?? 99)) * dir;
      }
      case "status": {
        return ((STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)) * dir;
      }
      case "applied":
      default: {
        const at = a.appliedAt ? new Date(a.appliedAt).getTime() : 0;
        const bt = b.appliedAt ? new Date(b.appliedAt).getTime() : 0;
        return (at - bt) * dir;
      }
    }
  });
}

export function filterAndSortApplicants(
  applications: ApplicantApplication[],
  candidateMap: Record<string, ApplicantCandidate>,
  search: string,
  statusFilter: string,
  sortKey: SortKey,
  sortDir: SortDir,
  collator: Intl.Collator,
): ApplicantApplication[] {
  return sortApplicants(
    filterApplicants(applications, candidateMap, search, statusFilter),
    candidateMap,
    sortKey,
    sortDir,
    collator,
  );
}
