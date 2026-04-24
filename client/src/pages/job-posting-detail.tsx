import { useState, Fragment } from "react";
import {
  exportApplicantsToFile,
  formatAnswerForDisplay,
  genderLabel,
  VALID_STATUSES,
  type GenderValue,
  type ExportQuestion,
} from "./job-posting-detail-export";
import {
  filterApplicants,
  sortApplicants,
  type SortKey,
  type SortDir,
} from "./job-posting-detail-filter-sort";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { cityLabel } from "@/lib/i18n/labels";
import { formatDate, formatNumber } from "@/lib/format";
import type { TFunction } from "i18next";
import {
  ArrowLeft,
  MapPin,
  Users,
  Briefcase,
  Calendar,
  Loader2,
  FileDown,
  ChevronRight,
  UserCheck,
  Banknote,
  Clock,
  Search,
  Share2,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";

type JobPosting = {
  id: string;
  title: string;
  description?: string;
  requirements?: string;
  location?: string;
  region?: string;
  department?: string;
  type: string;
  salaryMin?: string;
  salaryMax?: string;
  status: string;
  deadline?: string;
  skills?: string[];
  questionSetId?: string;
};

type Application = {
  id: string;
  candidateId: string;
  jobId: string;
  status: string;
  appliedAt: string;
  notes?: string;
  questionSetAnswers?: { questionSetId?: string; answers?: Record<string, string> } | null;
};

type CandidateInfo = {
  id: string;
  fullNameEn: string;
  nationalId?: string;
  phone?: string;
  email?: string;
  city?: string;
  nationality?: string;
  gender?: GenderValue | null;
  photoUrl?: string | null;
};

const appStatusStyle: Record<string, string> = {
  new:         "bg-blue-500/10 text-blue-400",
  reviewing:   "bg-amber-500/10 text-amber-400",
  shortlisted: "bg-primary/10 text-primary",
  interviewed: "bg-purple-500/10 text-purple-400",
  offered:     "bg-cyan-500/10 text-cyan-400",
  hired:       "bg-emerald-500/10 text-emerald-400",
  rejected:    "bg-destructive/10 text-destructive",
  withdrawn:   "bg-muted text-muted-foreground",
};

const statusStyles: Record<string, string> = {
  active:   "bg-emerald-500/10 text-emerald-400",
  draft:    "bg-amber-500/10 text-amber-400",
  closed:   "bg-muted text-muted-foreground",
  filled:   "bg-primary/10 text-primary",
  archived: "bg-muted/60 text-muted-foreground",
};

function typeLabel(type: string, t: TFunction) {
  const key = `jobPosting:detail.types.${type}`;
  const v = t(key);
  return v === key ? type : v;
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function salaryLabel(job: JobPosting, t: TFunction) {
  const min = job.salaryMin ? parseFloat(job.salaryMin) : null;
  const max = job.salaryMax ? parseFloat(job.salaryMax) : null;
  if (min && max) return t("jobPosting:detail.salaryRange", { min: formatNumber(min), max: formatNumber(max) });
  if (min) return t("jobPosting:detail.salaryFrom", { min: formatNumber(min) });
  return null;
}

// Pink = female, blue = male, muted dash for other / null.
function genderBadgeClass(gender: GenderValue | null | undefined): string {
  if (gender === "female") return "bg-pink-500/10 text-pink-400";
  if (gender === "male")   return "bg-blue-500/10 text-blue-400";
  return "bg-muted text-muted-foreground";
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  ariaLabel,
  className = "",
  testId,
  t,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  ariaLabel: string;
  className?: string;
  testId?: string;
  t: TFunction;
}) {
  const isActive = activeKey === sortKey;
  const Icon = !isActive ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  const directionLabel = isActive
    ? t(dir === "asc" ? "jobPosting:detail.sortAsc" : "jobPosting:detail.sortDesc")
    : "";
  const buttonLabel = directionLabel ? `${ariaLabel} — ${directionLabel}` : ariaLabel;
  return (
    <th
      scope="col"
      aria-sort={isActive ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={buttonLabel}
        className={`inline-flex items-center gap-1 hover:text-white transition-colors ${
          isActive ? "text-white" : ""
        }`}
        data-testid={testId}
      >
        <span>{label}</span>
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    </th>
  );
}

export default function JobPostingDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation(["jobPosting", "common"]);
  const queryClient = useQueryClient();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [appSearch, setAppSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("applied");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Active language drives the locale-aware string compare so Arabic city
  // and candidate names sort in their own collation order rather than by
  // raw code-point. `undefined` falls back to the browser default.
  const { i18n } = useTranslation();
  const collator = new Intl.Collator(i18n.language || undefined, { sensitivity: "base" });

  // Click a header → toggle direction if it's already the active column,
  // otherwise switch to that column with a sensible default direction
  // (descending for "applied" so newest stays on top, ascending for everything
  // else so the alphabet/order makes sense at a glance).
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "applied" ? "desc" : "asc");
    }
  };

  const { data: job, isLoading: jobLoading } = useQuery<JobPosting>({
    queryKey: ["/api/jobs", params.id],
    queryFn: () => apiRequest("GET", `/api/jobs/${params.id}`).then((r) => r.json()),
    enabled: !!params.id,
  });

  const { data: applications = [], isLoading: appsLoading } = useQuery<(Application & { candidate?: CandidateInfo | null })[]>({
    queryKey: ["/api/applications", params.id],
    queryFn: () => apiRequest("GET", `/api/applications?jobId=${params.id}`).then((r) => r.json()),
    enabled: !!params.id,
  });

  const candidates: CandidateInfo[] = applications
    .map(a => a.candidate)
    .filter((c): c is CandidateInfo => !!c);
  const candidateMap = Object.fromEntries(candidates.map((c) => [c.id, c]));

  const { data: questionSet } = useQuery<{ id: string; name: string; questions: ExportQuestion[] }>({
    queryKey: ["/api/question-sets", job?.questionSetId],
    queryFn: () => apiRequest("GET", `/api/question-sets/${job!.questionSetId}`).then((r) => r.json()),
    enabled: !!job?.questionSetId,
  });
  const questions: ExportQuestion[] = (questionSet?.questions ?? []) as ExportQuestion[];
  const hasQuestions = questions.length > 0;

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/applications/${id}`, { status }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/applications", params.id] }),
    onError: () => toast({ title: t("jobPosting:detail.updateFailed"), variant: "destructive" }),
  });

  // Filter first, then sort — see job-posting-detail-filter-sort.ts.
  const filteredApps = filterApplicants(applications, candidateMap, appSearch, statusFilter);
  const sortedApps = sortApplicants(filteredApps, candidateMap, sortKey, sortDir, collator);

  const statusCounts = applications.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  if (jobLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!job) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-32 text-center gap-4">
          <Briefcase className="h-14 w-14 text-muted-foreground/30" />
          <p className="text-white font-bold text-xl">{t("jobPosting:detail.notFound")}</p>
          <Button onClick={() => setLocation("/job-posting")} variant="outline" className="border-border">
            {t("jobPosting:detail.backToJobs")}
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const salary = salaryLabel(job, t);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/job-posting")}
            className="text-muted-foreground hover:text-white gap-1.5"
            data-testid="button-back-to-jobs"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t("jobPosting:detail.backToJobs")}
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="border-border gap-1.5"
            data-testid="button-copy-public-link"
            onClick={async () => {
              const url = `${window.location.origin}/jobs/${job.id}`;
              try {
                await navigator.clipboard.writeText(url);
                toast({ title: t("jobPosting:actions.linkCopied"), description: t("jobPosting:actions.linkCopiedDesc") });
              } catch {
                toast({ title: t("jobPosting:actions.linkCopyFailed"), description: url, variant: "destructive" });
              }
            }}
          >
            <Share2 className="h-4 w-4" />
            {t("jobPosting:actions.copyPublicLink")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-border gap-1.5"
            data-testid="button-open-public-page"
            onClick={() => window.open(`/jobs/${job.id}`, "_blank", "noopener")}
          >
            <ExternalLink className="h-4 w-4" />
            {t("jobPosting:actions.openPublicPage")}
          </Button>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="lg:w-80 shrink-0 space-y-4">
            <Card className="bg-card border-border">
              <CardContent className="p-5 space-y-4">
                <div>
                  <h1 className="text-xl font-display font-bold text-white" data-testid="text-job-title"><bdi>{job.title}</bdi></h1>
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    <Badge variant="outline" className={`border-0 text-xs ${statusStyles[job.status] ?? "bg-muted text-muted-foreground"}`}>
                      {t(`jobPosting:status.${job.status}`, { defaultValue: job.status })}
                    </Badge>
                    <Badge variant="outline" className="border-border text-muted-foreground text-xs">
                      {typeLabel(job.type, t)}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2.5 text-sm">
                  {job.region && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span><bdi>{t(`common:regionsKsa.${job.region}` as any, job.region)}</bdi></span>
                    </div>
                  )}
                  {salary && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Banknote className="h-4 w-4 shrink-0" />
                      <span>{salary}</span>
                    </div>
                  )}
                  {job.deadline && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>{t("jobPosting:detail.deadline", { date: formatDate(job.deadline) })}</span>
                    </div>
                  )}
                  {job.department && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Briefcase className="h-4 w-4 shrink-0" />
                      <span>{job.department}</span>
                    </div>
                  )}
                </div>

                {job.description && (
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{t("jobPosting:detail.description")}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{job.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("jobPosting:detail.applicantSummary")}</p>
                <div className="flex items-center gap-2 mb-3">
                  <UserCheck className="h-5 w-5 text-primary" />
                  <span className="text-2xl font-bold text-white">{formatNumber(applications.length)}</span>
                  <span className="text-muted-foreground text-sm">{t("jobPosting:detail.total")}</span>
                </div>
                <div className="space-y-1.5">
                  {Object.entries(statusCounts).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between text-sm">
                      <Badge variant="outline" className={`border-0 text-xs capitalize ${appStatusStyle[status] ?? "bg-muted text-muted-foreground"}`}>
                        {t(`jobPosting:appStatus.${status}`, { defaultValue: status })}
                      </Badge>
                      <span className="text-white font-medium">{formatNumber(count)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-lg font-display font-bold text-white">{t("jobPosting:detail.applicants")}</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={appSearch}
                    onChange={e => setAppSearch(e.target.value)}
                    placeholder={t("jobPosting:detail.searchPlaceholder")}
                    className="ps-8 h-9 w-52 text-sm bg-background border-border"
                    data-testid="input-applicant-search"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px] bg-background border-border text-sm h-9" data-testid="select-status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="all">{t("jobPosting:detail.allStatus")}</SelectItem>
                    {VALID_STATUSES.map(s => (
                      <SelectItem key={s} value={s} className="capitalize">{t(`jobPosting:appStatus.${s}`, { defaultValue: s })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-border gap-1.5"
                  onClick={() => exportApplicantsToFile(job, applications, candidates, questions, t)}
                  disabled={applications.length === 0}
                  data-testid="button-export-applicants"
                >
                  <FileDown className="h-4 w-4" />
                  {t("jobPosting:detail.export")}
                </Button>
              </div>
            </div>

            <Card className="bg-card border-border">
              <CardContent className="p-0">
                {appsLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : filteredApps.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                    <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground font-medium">
                      {applications.length === 0 ? t("jobPosting:detail.noApplicantsYet") : t("jobPosting:detail.noMatch")}
                    </p>
                    <p className="text-muted-foreground/60 text-sm mt-1">
                      {applications.length === 0 ? t("jobPosting:detail.noApplicantsHint") : t("jobPosting:detail.noMatchHint")}
                    </p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border text-start">
                        <SortableHeader
                          label={t("jobPosting:detail.colCandidate")}
                          sortKey="candidate"
                          activeKey={sortKey}
                          dir={sortDir}
                          onSort={handleSort}
                          ariaLabel={t("jobPosting:detail.sortBy", { col: t("jobPosting:detail.colCandidate") })}
                          className="px-6"
                          testId="header-sort-candidate"
                          t={t}
                        />
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">{t("jobPosting:detail.colContact")}</th>
                        <SortableHeader
                          label={t("jobPosting:detail.colCity")}
                          sortKey="city"
                          activeKey={sortKey}
                          dir={sortDir}
                          onSort={handleSort}
                          ariaLabel={t("jobPosting:detail.sortBy", { col: t("jobPosting:detail.colCity") })}
                          className="hidden sm:table-cell"
                          testId="header-sort-city"
                          t={t}
                        />
                        <SortableHeader
                          label={t("jobPosting:detail.colSex")}
                          sortKey="sex"
                          activeKey={sortKey}
                          dir={sortDir}
                          onSort={handleSort}
                          ariaLabel={t("jobPosting:detail.sortBy", { col: t("jobPosting:detail.colSex") })}
                          testId="header-sort-sex"
                          t={t}
                        />
                        <SortableHeader
                          label={t("jobPosting:detail.colStatus")}
                          sortKey="status"
                          activeKey={sortKey}
                          dir={sortDir}
                          onSort={handleSort}
                          ariaLabel={t("jobPosting:detail.sortBy", { col: t("jobPosting:detail.colStatus") })}
                          testId="header-sort-status"
                          t={t}
                        />
                        <SortableHeader
                          label={t("jobPosting:detail.colApplied")}
                          sortKey="applied"
                          activeKey={sortKey}
                          dir={sortDir}
                          onSort={handleSort}
                          ariaLabel={t("jobPosting:detail.sortBy", { col: t("jobPosting:detail.colApplied") })}
                          className="hidden sm:table-cell"
                          testId="header-sort-applied"
                          t={t}
                        />
                        {hasQuestions && (
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("jobPosting:detail.colAnswers")}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sortedApps.map((app) => {
                        const candidate = candidateMap[app.candidateId];
                        const answers = app.questionSetAnswers?.answers ?? {};
                        const hasAnswers = Object.keys(answers).length > 0;
                        const isExpanded = expandedRow === app.id;
                        return (
                          <Fragment key={app.id}>
                            <tr className="hover:bg-muted/20 transition-colors" data-testid={`row-applicant-${app.id}`}>
                              <td className="px-6 py-3">
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-8 w-8 border border-border shrink-0">
                                    {candidate?.photoUrl && <AvatarImage src={candidate.photoUrl} alt={candidate.fullNameEn} className="object-cover" />}
                                    <AvatarFallback className="bg-primary/20 text-primary text-xs">
                                      {candidate ? initials(candidate.fullNameEn) : "?"}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-white truncate">
                                      <bdi>{candidate?.fullNameEn ?? t("jobPosting:detail.unknownCandidate")}</bdi>
                                    </div>
                                    <div className="text-xs text-muted-foreground font-mono text-start"><bdi>{candidate?.nationalId ?? "—"}</bdi></div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 hidden md:table-cell">
                                <div className="text-xs text-muted-foreground space-y-0.5">
                                  {candidate?.email && <div dir="ltr">{candidate.email}</div>}
                                  {candidate?.phone && <div dir="ltr">{candidate.phone}</div>}
                                  {!candidate?.email && !candidate?.phone && <span>—</span>}
                                </div>
                              </td>
                              <td
                                className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground max-w-[12rem] truncate"
                                data-testid={`text-applicant-city-${app.id}`}
                              >
                                {candidate?.city
                                  ? <bdi>{cityLabel(t, candidate.city)}</bdi>
                                  : <span className="text-muted-foreground/40">—</span>}
                              </td>
                              <td className="px-4 py-3" data-testid={`text-applicant-sex-${app.id}`}>
                                {candidate?.gender === "male" || candidate?.gender === "female" ? (
                                  <Badge
                                    variant="outline"
                                    className={`border-0 text-xs ${genderBadgeClass(candidate.gender)}`}
                                  >
                                    {genderLabel(candidate.gender, t)}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground/40">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className={`border-0 text-xs capitalize ${appStatusStyle[app.status] ?? "bg-muted text-muted-foreground"}`}>
                                  {t(`jobPosting:appStatus.${app.status}`, { defaultValue: app.status })}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  <span dir="ltr">{formatDate(app.appliedAt)}</span>
                                </div>
                              </td>
                              {hasQuestions && (
                                <td className="px-4 py-3">
                                  {hasAnswers ? (
                                    <button
                                      type="button"
                                      onClick={() => setExpandedRow(isExpanded ? null : app.id)}
                                      className={`flex items-center gap-1 text-xs font-medium transition-colors px-2 py-1 rounded-sm border ${
                                        isExpanded
                                          ? "bg-primary/10 border-primary/40 text-primary"
                                          : "bg-muted/20 border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                                      }`}
                                      data-testid={`button-view-answers-${app.id}`}
                                    >
                                      <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                      {isExpanded ? t("jobPosting:detail.hide") : t("jobPosting:detail.view")}
                                    </button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground/40">—</span>
                                  )}
                                </td>
                              )}
                            </tr>
                            {isExpanded && hasAnswers && (
                              <tr key={`${app.id}-answers`} className="bg-muted/5">
                                {/* Columns now: Candidate · Contact · City · Sex · Status · Applied · (Answers).
                                    colSpan must always cover every header rendered above so the
                                    expanded answers panel spans the full table width. */}
                                <td colSpan={hasQuestions ? 7 : 6} className="px-6 pb-4 pt-2">
                                  <div className="border border-border rounded-md p-4 space-y-3 bg-muted/10">
                                    <p className="text-xs text-primary font-semibold uppercase tracking-wider">
                                      {t("jobPosting:detail.screeningAnswers", { name: questionSet?.name ?? "" })}
                                    </p>
                                    <div className="space-y-2">
                                      {questions.map((q, idx) => (
                                        <div key={q.id} className="flex items-start gap-3 text-sm">
                                          <span className="text-xs font-bold text-primary/60 mt-0.5 shrink-0 w-5 text-end">{idx + 1}.</span>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-muted-foreground text-xs">{q.text}</p>
                                            <p className={`font-medium mt-0.5 whitespace-pre-line ${answers[q.id] ? "text-white" : "text-muted-foreground/40 italic"}`}>
                                              {answers[q.id]
                                                ? formatAnswerForDisplay(q, answers[q.id])
                                                : t("jobPosting:detail.noAnswer")}
                                            </p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
