import { useState, useCallback, useMemo, Fragment } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search, MoreHorizontal, Calendar, Clock, Video, Phone, MapPin,
  CheckCircle2, Loader2, Plus, Users, User, StickyNote, ExternalLink,
  ThumbsUp, ThumbsDown, RotateCcw, Maximize2, ArrowLeft, X,
  Hash, AlertTriangle, Copy, Download, CheckSquare, ChevronRight,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/format";
import { parseSearchTokens, MAX_SEARCH_TOKENS } from "@shared/candidate-search";
import {
  filterInvitees, computeInviteeSearchMeta,
  buildMissingIdsCsv, buildMissingIdsFilename,
} from "./interviews-multi-id-search";
import {
  buildExportRow, buildExportHeaders, buildSheetName, buildExportFilename,
} from "./interviews-export";
import * as XLSX from "xlsx";

type Candidate = { id: string; fullNameEn: string; nationalId?: string; photoUrl?: string | null };
type Interview = {
  id: string;
  candidateId: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  type: string;
  meetingUrl?: string;
  notes?: string;
  groupName?: string | null;
  invitedCandidateIds?: string[] | null;
  createdByName?: string | null;
  createdAt: string;
  shortlistedCount?: number;
  rejectedCount?: number;
  pendingCount?: number;
};
type InterviewStats = {
  total: number;
  scheduled: number;
  completed: number;
  cancelled: number;
};
type InvitedCandidate = {
  id: string;
  // Task #255: `candidateCode` is the human-friendly ID (e.g. "C-00042") that
  // recruiters paste back into bulk-invite; surfaced in the Excel export's
  // Candidate ID column with a UUID fallback when missing. `fullName` is the
  // Arabic display name placeholder for the export's "Full name (Arabic)"
  // column — currently always `null` because the candidates table has no
  // Arabic name field (see server/storage.ts comment on getInterviewDetail).
  // The column is preserved in the workbook contract so downstream tooling
  // sees a stable layout.
  candidateCode: string | null;
  fullName: string | null;
  fullNameEn: string;
  nationalId: string | null;
  phone: string | null;
  photoUrl: string | null;
  applicationId: string | null;
  applicationStatus: string | null;
  // The candidate's job posting question set + the answers they submitted
  // when applying. Surfaced inline in the invitee row "View Answers" panel
  // (mirrors the job-posting applicants sheet).
  questionSetId: string | null;
  questionSetAnswers: Record<string, string> | null;
};
type InterviewDetail = {
  interview: Interview;
  // Task #227: `phone` is included so the multi-ID search can match pasted
  // Saudi mobile numbers against invitees alongside nationalId / candidate UUID.
  invitedCandidates: InvitedCandidate[];
};
type QuestionSet = { id: string; name: string; questions: { id: string; text: string }[] };

function typeIcon(type: string) {
  if (type === "video") return <Video className="h-4 w-4" />;
  if (type === "phone") return <Phone className="h-4 w-4" />;
  return <MapPin className="h-4 w-4" />;
}

function statusStyle(status: string) {
  if (status === "scheduled") return "bg-blue-500/10 text-blue-400";
  if (status === "in_progress") return "bg-amber-500/10 text-amber-400";
  if (status === "completed") return "bg-emerald-500/10 text-emerald-400";
  if (status === "cancelled") return "bg-destructive/10 text-destructive";
  if (status === "no_show") return "bg-orange-500/10 text-orange-400";
  return "bg-muted text-muted-foreground";
}

function useFormatters() {
  const { i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const dateLocale = isAr ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB";
  return {
    isAr,
    formatScheduled(iso: string) {
      const d = new Date(iso);
      return {
        date: d.toLocaleDateString(dateLocale, { weekday: "short", month: "short", day: "numeric" }), // i18n-numerals: allow (dateLocale pins -u-nu-latn)
        time: d.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", hour12: false }), // i18n-numerals: allow (dateLocale pins -u-nu-latn)
      };
    },
    formatCreatedAt(iso: string) {
      return new Date(iso).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" }); // i18n-numerals: allow (dateLocale pins -u-nu-latn)
    },
  };
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function InterviewDetailSheet({
  interviewId,
  groupName,
  open,
  onOpenChange,
}: {
  interviewId: string;
  groupName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { t, i18n } = useTranslation(["interviews"]);
  const { isAr, formatScheduled, formatCreatedAt } = useFormatters();
  const [localStatuses, setLocalStatuses] = useState<Record<string, string>>({});
  const [candidateSearch, setCandidateSearch] = useState("");

  const { data, isLoading } = useQuery<InterviewDetail>({
    queryKey: ["/api/interviews", interviewId],
    queryFn: () => apiRequest("GET", `/api/interviews/${interviewId}`).then((r) => r.json()),
    enabled: open && !!interviewId,
    staleTime: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ appId, status }: { appId: string; candidateId: string; status: string }) =>
      apiRequest("PATCH", `/api/applications/${appId}`, { status }).then((r) => r.json()),
    onSuccess: (_data, vars) => {
      setLocalStatuses(prev => ({ ...prev, [vars.candidateId]: vars.status }));
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
      // Toggling shortlist status changes who appears in the Onboarding
      // page's "Admit Candidate" dialog — refresh that pre-filtered list.
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/admit-eligible"] });
      // Broad prefix invalidation refreshes both the open detail panel
      // (`["/api/interviews", id]`) AND the parent list query
      // (`["/api/interviews", { eventId }]`) so the Decisions column counts
      // stay in sync with the chips a moment after the user shortlists.
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      toast({ title: vars.status === "shortlisted" ? t("interviews:toast.shortlisted") : vars.status === "rejected" ? t("interviews:toast.rejected") : t("interviews:toast.updated") });
    },
    onError: () => toast({ title: t("interviews:toast.updateFail"), variant: "destructive" }),
  });

  const iv = data?.interview;
  const invitedCandidates = data?.invitedCandidates ?? [];
  const scheduled = iv ? formatScheduled(iv.scheduledAt) : null;

  // "View Answers" inline expansion. Mirrors job-posting.tsx ApplicantsSheet:
  // each invitee row gets a toggle that reveals a panel with their screening
  // answers. The set holds candidate.ids of currently-expanded rows. Question
  // sets are fetched lazily via useQueries — one parallel fetch per unique
  // questionSetId across the invitee list (typically all share one).
  const [expandedAnswerIds, setExpandedAnswerIds] = useState<Set<string>>(new Set());
  const toggleExpandedAnswers = useCallback((id: string) => {
    setExpandedAnswerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const uniqueQuestionSetIds = useMemo(() => Array.from(new Set(
    invitedCandidates.map(c => c.questionSetId).filter((v): v is string => !!v)
  )), [invitedCandidates]);
  const questionSetQueries = useQueries({
    queries: uniqueQuestionSetIds.map(qsId => ({
      queryKey: ["/api/question-sets", qsId],
      queryFn: () => apiRequest("GET", `/api/question-sets/${qsId}`).then(r => r.json() as Promise<QuestionSet>),
      staleTime: 5 * 60_000,
      enabled: !!qsId,
    })),
  });
  const questionSetMap = useMemo(() => {
    const m = new Map<string, QuestionSet>();
    questionSetQueries.forEach((q, i) => {
      const id = uniqueQuestionSetIds[i];
      if (id && q.data) m.set(id, q.data);
    });
    return m;
  }, [questionSetQueries, uniqueQuestionSetIds]);

  // Multi-ID paste search (Task #226). Mirror the Candidates-page UX: when
  // more than one identifier is detected, a count pill renders inside the
  // search input and a "Not in this interview" panel renders above the list.
  // The dialog's single-token behaviour stays nationalId-substring only.
  const parsedSearch = useMemo(() => parseSearchTokens(candidateSearch), [candidateSearch]);
  const searchMeta = useMemo(
    () => computeInviteeSearchMeta(invitedCandidates, parsedSearch),
    [invitedCandidates, parsedSearch],
  );

  // Single-line `<input>` collapses pasted CRLF/LF/tab into nothing, which
  // would silently swallow an Excel-column-of-IDs paste. Normalise the
  // separators to commas (which the shared parser splits on) and inject the
  // cleaned string at the caret. Pastes without those separators fall through.
  const handleCandidateSearchPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text || !/[\n\r\t]/.test(text)) return;
    e.preventDefault();
    const normalized = text
      .replace(/\r\n?/g, "\n")
      .replace(/[\n\t]+/g, ", ")
      .replace(/\s*,\s*,+\s*/g, ", ");
    const input = e.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    setCandidateSearch(input.value.slice(0, start) + normalized + input.value.slice(end));
  }, []);

  const handleCopyMissingIds = useCallback(async () => {
    if (!searchMeta || searchMeta.missingIds.length === 0) return;
    try {
      await navigator.clipboard.writeText(searchMeta.missingIds.join("\n"));
      toast({ title: t("interviews:multiSearch.copied", { n: formatNumber(searchMeta.missingIds.length, i18n.language) }) });
    } catch {
      toast({ title: t("interviews:multiSearch.copyFailed"), variant: "destructive" });
    }
  }, [searchMeta, toast, t, i18n.language]);

  const handleDownloadMissingIds = useCallback(() => {
    if (!searchMeta || searchMeta.missingIds.length === 0) return;
    const csv = buildMissingIdsCsv(searchMeta.missingIds);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildMissingIdsFilename(iv?.groupName ?? null);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [searchMeta, iv?.groupName]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isAr ? "left" : "right"} className="w-full sm:max-w-xl lg:max-w-3xl bg-card border-border p-0 flex flex-col">
        <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
          <SheetTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <bdi>{groupName}</bdi>
          </SheetTitle>
          <SheetDescription className="text-muted-foreground text-sm">
            {t("interviews:detail.desc")}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !iv ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            {t("interviews:detail.notFound")}
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="px-6 py-5 space-y-6">

              <div>
                <Badge variant="outline" className={`text-sm px-3 py-1 border-0 font-semibold ${statusStyle(iv.status)}`}>
                  {iv.status === "completed" && <CheckCircle2 className="me-1.5 h-3.5 w-3.5" />}
                  {t(`interviews:status.${iv.status}`, { defaultValue: iv.status })}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("interviews:detail.date")}</p>
                  <p className="text-sm text-white flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <bdi>{scheduled?.date}</bdi>
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("interviews:detail.time")}</p>
                  <p className="text-sm text-white flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span dir="ltr">{scheduled?.time}</span>
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("interviews:detail.venue")}</p>
                  <p className="text-sm text-white flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    <bdi>{iv.type ? t(`interviews:type.${iv.type}`, { defaultValue: iv.type }) : "—"}</bdi>
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("interviews:detail.duration")}</p>
                  <p className="text-sm text-white flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    {t("interviews:table.minSuffix", { n: formatNumber(iv.durationMinutes, i18n.language) })}
                  </p>
                </div>
                {iv.createdByName && (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("interviews:detail.createdBy")}</p>
                    <p className="text-sm text-white flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <bdi>{iv.createdByName}</bdi>
                    </p>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("interviews:detail.createdOn")}</p>
                  <p className="text-sm text-white"><bdi>{formatCreatedAt(iv.createdAt)}</bdi></p>
                </div>
              </div>

              {iv.meetingUrl && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t("interviews:detail.locationLink")}</p>
                  <a
                    href={iv.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:text-primary/70 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t("interviews:detail.openMaps")}
                  </a>
                </div>
              )}

              {iv.notes && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5">
                    <StickyNote className="h-3 w-3" />
                    {t("interviews:detail.notes")}
                  </p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/10 rounded-md px-3 py-2 border border-border">
                    <bdi>{iv.notes}</bdi>
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5">
                    <Users className="h-3 w-3" />
                    {t("interviews:detail.invited")}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs font-bold" dir="ltr">
                      {formatNumber(invitedCandidates.length, i18n.language)}
                    </Badge>
                    {invitedCandidates.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] gap-1 border-border hover:bg-primary/10 hover:text-primary"
                        data-testid="button-open-full-candidates"
                        onClick={() => {
                          onOpenChange(false);
                          navigate(`/interviews/${interviewId}/candidates`);
                        }}
                      >
                        <Maximize2 className="h-3 w-3" />
                        {t("interviews:detail.fullPage")}
                      </Button>
                    )}
                  </div>
                </div>

                {invitedCandidates.length > 5 && (
                  <div className="relative">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder={t("interviews:detail.searchIdPh")}
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                      onPaste={handleCandidateSearchPaste}
                      className={`ps-9 h-8 text-xs bg-background border-border ${parsedSearch.isMulti ? "pe-44" : ""}`}
                      spellCheck={false}
                      autoComplete="off"
                      data-testid="input-search-invited-candidates"
                    />
                    {parsedSearch.isMulti && (
                      <div
                        className={`pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-medium whitespace-nowrap ${
                          parsedSearch.truncated
                            ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                            : "bg-primary/15 text-primary border border-primary/30"
                        }`}
                        title={parsedSearch.truncated
                          ? t("interviews:multiSearch.pillTruncatedTitle", { n: formatNumber(MAX_SEARCH_TOKENS, i18n.language) })
                          : undefined}
                        data-testid="pill-multi-search"
                      >
                        <Hash className="h-2.5 w-2.5" />
                        {parsedSearch.truncated
                          ? t("interviews:multiSearch.pillTruncated", { n: formatNumber(MAX_SEARCH_TOKENS, i18n.language) })
                          : t("interviews:multiSearch.pill", { n: formatNumber(parsedSearch.tokens.length, i18n.language) })}
                      </div>
                    )}
                    {candidateSearch && !parsedSearch.isMulti && (
                      <button
                        onClick={() => setCandidateSearch("")}
                        className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}

                {/* Missing-IDs panel — Task #226. Renders above the invitee list when
                    the paste contained ID-shaped tokens that don't match anyone in
                    this interview. */}
                {parsedSearch.isMulti && searchMeta && searchMeta.missingIds.length > 0 && (
                  <div className="rounded-md bg-amber-500/5 border border-amber-500/30 p-3" data-testid="panel-missing-ids">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <h3 className="text-xs font-semibold text-amber-100">
                            {t("interviews:multiSearch.missingTitle", { n: formatNumber(searchMeta.missingIds.length, i18n.language) })}
                          </h3>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[10px] border-amber-500/40 bg-transparent text-amber-100 hover:bg-amber-500/10 hover:text-amber-50"
                              onClick={handleCopyMissingIds}
                              data-testid="button-copy-missing-ids"
                            >
                              <Copy className="me-1 h-2.5 w-2.5" />
                              {t("interviews:multiSearch.copy")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[10px] border-amber-500/40 bg-transparent text-amber-100 hover:bg-amber-500/10 hover:text-amber-50"
                              onClick={handleDownloadMissingIds}
                              data-testid="button-download-missing-ids"
                            >
                              <Download className="me-1 h-2.5 w-2.5" />
                              {t("interviews:multiSearch.download")}
                            </Button>
                          </div>
                        </div>
                        <p className="text-[10px] text-amber-100/70 mt-1">
                          {t("interviews:multiSearch.missingDesc")}
                          {searchMeta.droppedFreeText > 0 && (
                            <> {t("interviews:multiSearch.droppedFreeText", { n: formatNumber(searchMeta.droppedFreeText, i18n.language) })}</>
                          )}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1 max-h-24 overflow-y-auto pe-1">
                          {searchMeta.missingIds.map((id, idx) => (
                            <span
                              key={`${id}-${idx}`}
                              className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-amber-500/10 text-amber-50 border border-amber-500/20 rounded"
                              dir="ltr"
                              data-testid={`chip-missing-id-${id}`}
                            >
                              {id}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {parsedSearch.isMulti && searchMeta && searchMeta.missingIds.length === 0 && (
                  <div
                    className="flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-sm bg-emerald-500/5 border border-emerald-500/30 text-emerald-300"
                    data-testid="status-all-matched"
                  >
                    <CheckSquare className="h-3 w-3" />
                    <span>
                      {t("interviews:multiSearch.allMatched", { n: formatNumber(searchMeta.tokenCount, i18n.language) })}
                      {searchMeta.droppedFreeText > 0 && (
                        <> · {t("interviews:multiSearch.droppedFreeText", { n: formatNumber(searchMeta.droppedFreeText, i18n.language) })}</>
                      )}
                    </span>
                  </div>
                )}

                {invitedCandidates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center rounded-md border border-dashed border-border">
                    <Users className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">{t("interviews:detail.noCandidates")}</p>
                  </div>
                ) : (() => {
                  const filtered = filterInvitees(
                    invitedCandidates,
                    parsedSearch,
                    /* singleTermMatchesName */ false,
                  );
                  return filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center rounded-md border border-dashed border-border">
                      <Search className="h-6 w-6 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {parsedSearch.isMulti && searchMeta && searchMeta.missingIds.length > 0
                          ? t("interviews:detail.emptyAllMissing")
                          : t("interviews:detail.noMatches", { q: candidateSearch })}
                      </p>
                    </div>
                  ) : (
                  <div className="rounded-md border border-border divide-y divide-border overflow-hidden">
                    {filtered.map((c, idx) => {
                      const effectiveStatus = localStatuses[c.id] ?? c.applicationStatus;
                      const isShortlisted = effectiveStatus === "shortlisted";
                      const isRejected    = effectiveStatus === "rejected";
                      const isPending     = statusMutation.isPending && (statusMutation.variables as { candidateId?: string } | undefined)?.candidateId === c.id;
                      const answers = c.questionSetAnswers ?? null;
                      const hasAnswers = !!answers && Object.keys(answers).length > 0;
                      const isExpanded = expandedAnswerIds.has(c.id);
                      const qs = c.questionSetId ? questionSetMap.get(c.questionSetId) : undefined;
                      return (
                        <Fragment key={c.id}>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 hover:bg-muted/10 transition-colors" data-testid={`detail-candidate-${c.id}`}>
                          <div className="flex items-center gap-3 flex-1 basis-40 min-w-0">
                            <span className="text-[10px] text-muted-foreground/50 font-mono w-7 text-end shrink-0" dir="ltr">{formatNumber(idx + 1, i18n.language)}</span>
                            <Avatar className="h-7 w-7 border border-border shrink-0">
                              {c.photoUrl && <AvatarImage src={c.photoUrl} alt={c.fullNameEn} className="object-cover" />}
                              <AvatarFallback className="bg-primary/15 text-primary text-[10px]">
                                {initials(c.fullNameEn)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white font-medium truncate"><bdi>{c.fullNameEn}</bdi></p>
                              <p className="text-[10px] text-muted-foreground font-mono" dir="ltr">{c.nationalId ?? "—"}</p>
                            </div>
                          </div>

                          <div className="w-[10rem] shrink-0 flex items-center" aria-hidden={!isShortlisted && !isRejected}>
                            {isShortlisted && (
                              <Badge
                                className="bg-emerald-900/50 text-emerald-400 border-0 text-[10px] px-2 max-w-full"
                                title={t("interviews:labels.shortlisted")}
                              >
                                <span className="truncate min-w-0">{t("interviews:labels.shortlisted")}</span>
                              </Badge>
                            )}
                            {isRejected && (
                              <Badge
                                className="bg-red-900/50 text-red-400 border-0 text-[10px] px-2 max-w-full"
                                title={t("interviews:labels.rejected")}
                              >
                                <span className="truncate min-w-0">{t("interviews:labels.rejected")}</span>
                              </Badge>
                            )}
                          </div>

                          <div className="flex flex-nowrap gap-1 shrink-0 items-center ms-auto">
                            {hasAnswers && (
                              <button
                                type="button"
                                onClick={() => toggleExpandedAnswers(c.id)}
                                className={`flex items-center gap-1 text-[10px] font-medium transition-colors px-2 py-1 rounded-sm border ${
                                  isExpanded
                                    ? "bg-primary/10 border-primary/40 text-primary"
                                    : "bg-muted/20 border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                                }`}
                                title={isExpanded ? t("interviews:detail.hideAnswers") : t("interviews:detail.viewAnswers")}
                                data-testid={`button-view-answers-${c.id}`}
                              >
                                <ChevronRight className={`h-3 w-3 transition-transform rtl:rotate-180 ${isExpanded ? "rotate-90 rtl:rotate-90" : ""}`} />
                                {isExpanded ? t("interviews:detail.hideAnswers") : t("interviews:detail.viewAnswers")}
                              </button>
                            )}
                            {isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : c.applicationId ? (
                              <>
                                <Button
                                  data-testid={`button-shortlist-${c.id}`}
                                  size="icon"
                                  variant="ghost"
                                  title={t("interviews:detail.tipShortlist")}
                                  disabled={isShortlisted}
                                  onClick={() => statusMutation.mutate({ appId: c.applicationId!, candidateId: c.id, status: "shortlisted" })}
                                  className={`h-7 w-7 ${isShortlisted ? "text-emerald-500" : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-950/40"}`}
                                >
                                  <ThumbsUp className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  data-testid={`button-reject-${c.id}`}
                                  size="icon"
                                  variant="ghost"
                                  title={t("interviews:detail.tipReject")}
                                  disabled={isRejected}
                                  onClick={() => statusMutation.mutate({ appId: c.applicationId!, candidateId: c.id, status: "rejected" })}
                                  className={`h-7 w-7 ${isRejected ? "text-red-500" : "text-muted-foreground hover:text-red-400 hover:bg-red-950/40"}`}
                                >
                                  <ThumbsDown className="h-3.5 w-3.5" />
                                </Button>
                                {(isShortlisted || isRejected) ? (
                                  <Button
                                    data-testid={`button-reset-status-${c.id}`}
                                    size="icon"
                                    variant="ghost"
                                    title={t("interviews:detail.tipReset")}
                                    onClick={() => statusMutation.mutate({ appId: c.applicationId!, candidateId: c.id, status: "interviewed" })}
                                    className="h-7 w-7 text-muted-foreground hover:text-white hover:bg-muted/20"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </Button>
                                ) : (
                                  <span className="h-7 w-7 shrink-0 inline-block" aria-hidden="true" />
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/40 italic">{t("interviews:detail.noApplication")}</span>
                            )}
                          </div>
                        </div>
                        {isExpanded && hasAnswers && (
                          <div className="bg-muted/5 px-4 py-3" data-testid={`panel-answers-${c.id}`}>
                            <div className="border border-border rounded-md p-3 space-y-2 bg-muted/10">
                              <p className="text-[10px] text-primary font-semibold uppercase tracking-wider">
                                {t("interviews:detail.screeningAnswers", { name: qs?.name ?? "" })}
                              </p>
                              <div className="space-y-2">
                                {qs?.questions && qs.questions.length > 0 ? (
                                  qs.questions.map((q, qIdx) => (
                                    <div key={q.id} className="flex items-start gap-3 text-xs">
                                      <span className="text-[10px] font-bold text-primary/60 mt-0.5 shrink-0 w-5 text-end" dir="ltr">{formatNumber(qIdx + 1, i18n.language)}.</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-muted-foreground" data-testid={`text-question-${c.id}-${q.id}`}><bdi>{q.text}</bdi></p>
                                        <p className={`font-medium mt-0.5 ${answers![q.id] ? "text-white" : "text-muted-foreground/40 italic"}`} data-testid={`text-answer-${c.id}-${q.id}`}>
                                          <bdi>{answers![q.id] || t("interviews:detail.noAnswer")}</bdi>
                                        </p>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="space-y-2">
                                    {Object.entries(answers!).map(([qid, val], qIdx) => (
                                      <div key={qid} className="flex items-start gap-3 text-xs">
                                        <span className="text-[10px] font-bold text-primary/60 mt-0.5 shrink-0 w-5 text-end" dir="ltr">{formatNumber(qIdx + 1, i18n.language)}.</span>
                                        <p className="font-medium text-white flex-1" data-testid={`text-answer-${c.id}-${qid}`}><bdi>{val || t("interviews:detail.noAnswer")}</bdi></p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        </Fragment>
                      );
                    })}
                  </div>
                  );
                })()}
              </div>
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function InterviewCandidatesPage({ params }: { params: { id: string } }) {
  const interviewId = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation(["interviews"]);
  const { formatScheduled } = useFormatters();
  const [search, setSearch] = useState("");
  const [localStatuses, setLocalStatuses] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((candidates: { id: string; applicationId: string | null; applicationStatus: string | null }[]) => {
    const pending = candidates.filter(c => c.applicationId && (localStatuses[c.id] ?? c.applicationStatus) !== "shortlisted");
    setSelectedIds(new Set(pending.map(c => c.id)));
  }, [localStatuses]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const { data, isLoading } = useQuery<InterviewDetail>({
    queryKey: ["/api/interviews", interviewId],
    queryFn: () => apiRequest("GET", `/api/interviews/${interviewId}`).then((r) => r.json()),
    enabled: !!interviewId,
    staleTime: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ appId, status }: { appId: string; candidateId: string; status: string }) =>
      apiRequest("PATCH", `/api/applications/${appId}`, { status }).then((r) => r.json()),
    onSuccess: (_data, vars) => {
      setLocalStatuses(prev => ({ ...prev, [vars.candidateId]: vars.status }));
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
      // INVARIANT: every PATCH to /api/applications that can change status
      // MUST invalidate "/api/onboarding/admit-eligible" — otherwise the
      // Onboarding > Admit Candidate dialog serves a stale, pre-flip list
      // and the user thinks the candidate they just liked "never appeared".
      // The sibling statusMutation in InterviewDetailSheet (~line 168) does
      // this; this one was the brittle drift that caused the prod report.
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/admit-eligible"] });
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      toast({ title: vars.status === "shortlisted" ? t("interviews:toast.shortlisted") : vars.status === "rejected" ? t("interviews:toast.rejected") : t("interviews:toast.updated") });
    },
    onError: () => toast({ title: t("interviews:toast.updateFail"), variant: "destructive" }),
  });

  const bulkShortlistMutation = useMutation({
    mutationFn: (items: { appId: string; candidateId: string }[]) =>
      apiRequest("POST", "/api/applications/bulk-shortlist", {
        updates: items.map(i => ({ id: i.appId, status: "shortlisted" })),
      }).then(r => r.json()),
    onSuccess: (result, items) => {
      const updates: Record<string, string> = {};
      items.forEach(i => { updates[i.candidateId] = "shortlisted"; });
      setLocalStatuses(prev => ({ ...prev, ...updates }));
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
      // Bulk shortlist promotes a batch of candidates straight into the
      // Onboarding admit dialog — refresh that pre-filtered list too.
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/admit-eligible"] });
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      toast({ title: t("interviews:toast.bulkShortlisted", { count: result.succeeded, replace: { n: formatNumber(result.succeeded, i18n.language) } }) });
    },
    onError: () => toast({ title: t("interviews:toast.bulkFail"), variant: "destructive" }),
  });

  const iv = data?.interview;
  const invitedCandidates = data?.invitedCandidates ?? [];
  const scheduled = iv ? formatScheduled(iv.scheduledAt) : null;

  // "View Answers" inline expansion (mirrors InterviewDetailSheet). One row
  // per invitee can be toggled open to reveal a screening-answers panel.
  const [expandedAnswerIds, setExpandedAnswerIds] = useState<Set<string>>(new Set());
  // Task #255: brief loading state on the Excel export button. The workbook
  // is built synchronously off in-memory state so this only flips for the
  // single tick during XLSX.writeFile, but it disables the button to prevent
  // accidental double-clicks producing duplicate downloads on slow machines.
  const [isExporting, setIsExporting] = useState(false);
  const toggleExpandedAnswers = useCallback((id: string) => {
    setExpandedAnswerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const uniqueQuestionSetIds = useMemo(() => Array.from(new Set(
    invitedCandidates.map(c => c.questionSetId).filter((v): v is string => !!v)
  )), [invitedCandidates]);
  const questionSetQueries = useQueries({
    queries: uniqueQuestionSetIds.map(qsId => ({
      queryKey: ["/api/question-sets", qsId],
      queryFn: () => apiRequest("GET", `/api/question-sets/${qsId}`).then(r => r.json() as Promise<QuestionSet>),
      staleTime: 5 * 60_000,
      enabled: !!qsId,
    })),
  });
  const questionSetMap = useMemo(() => {
    const m = new Map<string, QuestionSet>();
    questionSetQueries.forEach((q, i) => {
      const id = uniqueQuestionSetIds[i];
      if (id && q.data) m.set(id, q.data);
    });
    return m;
  }, [questionSetQueries, uniqueQuestionSetIds]);

  // Multi-ID paste search (Task #226). The full-page invitee list keeps its
  // single-token name+nationalId substring behaviour; multi-token mode is the
  // ID-only set lookup mirrored from the Candidates page.
  const parsedSearch = useMemo(() => parseSearchTokens(search), [search]);
  const searchMeta = useMemo(
    () => computeInviteeSearchMeta(invitedCandidates, parsedSearch),
    [invitedCandidates, parsedSearch],
  );
  const filtered = useMemo(
    () => filterInvitees(invitedCandidates, parsedSearch, /* singleTermMatchesName */ true),
    [invitedCandidates, parsedSearch],
  );

  // See dialog handler above for rationale — single-line `<input>` strips
  // CRLF/LF/tab on paste, so normalise them to commas before insertion.
  const handleSearchPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text || !/[\n\r\t]/.test(text)) return;
    e.preventDefault();
    const normalized = text
      .replace(/\r\n?/g, "\n")
      .replace(/[\n\t]+/g, ", ")
      .replace(/\s*,\s*,+\s*/g, ", ");
    const input = e.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    setSearch(input.value.slice(0, start) + normalized + input.value.slice(end));
  }, []);

  const handleCopyMissingIds = useCallback(async () => {
    if (!searchMeta || searchMeta.missingIds.length === 0) return;
    try {
      await navigator.clipboard.writeText(searchMeta.missingIds.join("\n"));
      toast({ title: t("interviews:multiSearch.copied", { n: formatNumber(searchMeta.missingIds.length, i18n.language) }) });
    } catch {
      toast({ title: t("interviews:multiSearch.copyFailed"), variant: "destructive" });
    }
  }, [searchMeta, toast, t, i18n.language]);

  const handleDownloadMissingIds = useCallback(() => {
    if (!searchMeta || searchMeta.missingIds.length === 0) return;
    const csv = buildMissingIdsCsv(searchMeta.missingIds);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildMissingIdsFilename(iv?.groupName ?? null);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [searchMeta, iv?.groupName]);

  // Task #255 — export the currently visible candidate decisions to .xlsx so
  // the recruiter can identify "no action" rows (usually no-shows) and copy
  // their IDs into a new interview's bulk-invite. Built client-side from the
  // already-loaded list + optimistic localStatuses so the file always agrees
  // with what the recruiter sees on screen.
  const handleExportExcel = useCallback(() => {
    if (filtered.length === 0) {
      // Empty-result is the only status the recruiter cannot infer from the
      // browser's download bar — every other outcome (success or failure)
      // is communicated by the file appearing or not. Per task spec we
      // intentionally avoid toasting on the happy path to keep the UI quiet.
      toast({ title: t("interviews:export.toastEmpty"), variant: "destructive" });
      return;
    }
    setIsExporting(true);
    try {
      const headers = buildExportHeaders({
        num: t("interviews:export.cols.num"),
        fullNameEn: t("interviews:export.cols.fullNameEn"),
        nationalId: t("interviews:export.cols.nationalId"),
        phone: t("interviews:export.cols.phone"),
        decision: t("interviews:export.cols.decision"),
        decisionRaw: t("interviews:export.cols.decisionRaw"),
        applicationStatus: t("interviews:export.cols.applicationStatus"),
      });
      const labels = {
        liked: t("interviews:export.decisions.liked"),
        disliked: t("interviews:export.decisions.disliked"),
        none: t("interviews:export.decisions.none"),
      };

      const rows = filtered.map((c, idx) =>
        buildExportRow(c, idx, localStatuses, labels),
      );

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      // Force ID-shaped columns to text so Excel does not strip leading
      // zeros or convert long numerics to scientific notation. Indexes
      // match the order in buildExportHeaders / buildExportRow:
      //   2 = nationalId, 3 = phone.
      const TEXT_COL_INDEXES = [2, 3];
      for (let r = 1; r <= rows.length; r++) {
        for (const col of TEXT_COL_INDEXES) {
          const addr = XLSX.utils.encode_cell({ r, c: col });
          const cell = ws[addr];
          if (cell && cell.v != null) {
            cell.t = "s";
            cell.v = String(cell.v);
          }
        }
      }
      ws["!cols"] = [
        { wch: 5 },   // #
        { wch: 28 },  // Full name (English)
        { wch: 14 },  // National ID
        { wch: 14 },  // Phone
        { wch: 12 },  // Decision
        { wch: 12 },  // Decision raw
        { wch: 16 },  // Application status
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, buildSheetName(iv?.groupName));

      // Filename always includes a slug derived from the group name (falls
      // back to "session" when the name is missing or all-Arabic, matching
      // buildMissingIdsFilename), so two exports from different interviews
      // never collide in the recruiter's downloads folder.
      XLSX.writeFile(wb, buildExportFilename(iv?.groupName));
    } catch (err) {
      console.error("Excel export failed:", err);
      toast({ title: t("interviews:export.toastFail"), variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }, [filtered, localStatuses, iv?.groupName, t, toast]);

  const shortlistedCount = invitedCandidates.filter(c => (localStatuses[c.id] ?? c.applicationStatus) === "shortlisted").length;
  const rejectedCount = invitedCandidates.filter(c => (localStatuses[c.id] ?? c.applicationStatus) === "rejected").length;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rtl:rotate-180"
            onClick={() => navigate("/interviews")}
            data-testid="button-back-to-interviews"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl font-bold text-white truncate" data-testid="text-session-name">
              <bdi>{iv?.groupName || t("interviews:fullpage.session")}</bdi>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              <bdi>{scheduled ? `${scheduled.date} · ${scheduled.time}` : t("interviews:fullpage.loading")}</bdi>
              {iv && <> · {t(`interviews:type.${iv.type}`, { defaultValue: iv.type })}</>}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !iv ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            {t("interviews:detail.notFound")}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-sm font-bold px-3 py-1">
                {t("interviews:fullpage.candidates", { n: formatNumber(invitedCandidates.length, i18n.language) })}
              </Badge>
              {shortlistedCount > 0 && (
                <Badge className="bg-emerald-900/50 text-emerald-400 border-0 text-sm px-3 py-1">
                  {t("interviews:fullpage.shortlistedN", { n: formatNumber(shortlistedCount, i18n.language) })}
                </Badge>
              )}
              {rejectedCount > 0 && (
                <Badge className="bg-red-900/50 text-red-400 border-0 text-sm px-3 py-1">
                  {t("interviews:fullpage.rejectedN", { n: formatNumber(rejectedCount, i18n.language) })}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("interviews:fullpage.searchPh")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onPaste={handleSearchPaste}
                className={`ps-10 bg-background border-border ${parsedSearch.isMulti ? "pe-44" : ""}`}
                spellCheck={false}
                autoComplete="off"
                data-testid="input-fullpage-search-candidates"
              />
              {parsedSearch.isMulti && (
                <div
                  className={`pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-medium whitespace-nowrap ${
                    parsedSearch.truncated
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                      : "bg-primary/15 text-primary border border-primary/30"
                  }`}
                  title={parsedSearch.truncated
                    ? t("interviews:multiSearch.pillTruncatedTitle", { n: formatNumber(MAX_SEARCH_TOKENS, i18n.language) })
                    : undefined}
                  data-testid="pill-fullpage-multi-search"
                >
                  <Hash className="h-3 w-3" />
                  {parsedSearch.truncated
                    ? t("interviews:multiSearch.pillTruncated", { n: formatNumber(MAX_SEARCH_TOKENS, i18n.language) })
                    : t("interviews:multiSearch.pill", { n: formatNumber(parsedSearch.tokens.length, i18n.language) })}
                </div>
              )}
              {search && !parsedSearch.isMulti && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              </div>
              {/* Export button sits at the row's end side (left in RTL,
                  right in LTR). Pushed there by `ms-auto` so the search
                  input keeps its natural width without stretching to fill. */}
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 border-border bg-transparent text-foreground hover:bg-accent ms-auto"
                onClick={handleExportExcel}
                disabled={isExporting}
                aria-busy={isExporting}
                data-testid="button-export-interview-decisions"
              >
                {isExporting
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Download className="h-3.5 w-3.5" />}
                {t("interviews:export.button")}
              </Button>
            </div>

            {/* Missing-IDs panel — Task #226. Shown above the table when the
                paste contained ID-shaped tokens that aren't on this interview. */}
            {parsedSearch.isMulti && searchMeta && searchMeta.missingIds.length > 0 && (
              <Card className="bg-amber-500/5 border-amber-500/30" data-testid="panel-fullpage-missing-ids">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-amber-100">
                          {t("interviews:multiSearch.missingTitle", { n: formatNumber(searchMeta.missingIds.length, i18n.language) })}
                        </h3>
                        <p className="text-xs text-amber-100/70 mt-1">
                          {t("interviews:multiSearch.missingDesc")}
                          {searchMeta.droppedFreeText > 0 && (
                            <> {t("interviews:multiSearch.droppedFreeText", { n: formatNumber(searchMeta.droppedFreeText, i18n.language) })}</>
                          )}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pe-1">
                          {searchMeta.missingIds.map((id, idx) => (
                            <span
                              key={`${id}-${idx}`}
                              className="inline-flex items-center px-2 py-0.5 text-xs font-mono bg-amber-500/10 text-amber-50 border border-amber-500/20 rounded"
                              dir="ltr"
                              data-testid={`chip-fullpage-missing-id-${id}`}
                            >
                              {id}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 self-end sm:self-start">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-amber-500/40 bg-transparent text-amber-100 hover:bg-amber-500/10 hover:text-amber-50"
                        onClick={handleCopyMissingIds}
                        data-testid="button-fullpage-copy-missing-ids"
                      >
                        <Copy className="me-1.5 h-3 w-3" />
                        {t("interviews:multiSearch.copy")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-amber-500/40 bg-transparent text-amber-100 hover:bg-amber-500/10 hover:text-amber-50"
                        onClick={handleDownloadMissingIds}
                        data-testid="button-fullpage-download-missing-ids"
                      >
                        <Download className="me-1.5 h-3 w-3" />
                        {t("interviews:multiSearch.download")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {parsedSearch.isMulti && searchMeta && searchMeta.missingIds.length === 0 && (
              <div
                className="flex items-center gap-2 text-xs px-3 py-2 rounded-sm bg-emerald-500/5 border border-emerald-500/30 text-emerald-300"
                data-testid="status-fullpage-all-matched"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                <span>
                  {t("interviews:multiSearch.allMatched", { n: formatNumber(searchMeta.tokenCount, i18n.language) })}
                  {searchMeta.droppedFreeText > 0 && (
                    <> · {t("interviews:multiSearch.droppedFreeText", { n: formatNumber(searchMeta.droppedFreeText, i18n.language) })}</>
                  )}
                </span>
              </div>
            )}

            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-sm bg-primary/10 border border-primary/30">
                <span className="text-sm text-primary font-medium">
                  {t("interviews:fullpage.selected", { count: selectedIds.size, replace: { n: formatNumber(selectedIds.size, i18n.language) } })}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-muted-foreground hover:text-white text-xs"
                    onClick={clearSelection}
                    data-testid="button-bulk-clear-selection"
                  >
                    {t("interviews:fullpage.clear")}
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 text-xs"
                    disabled={bulkShortlistMutation.isPending}
                    onClick={() => {
                      const items = invitedCandidates
                        .filter(c => selectedIds.has(c.id) && c.applicationId)
                        .map(c => ({ appId: c.applicationId!, candidateId: c.id }));
                      if (items.length) bulkShortlistMutation.mutate(items);
                    }}
                    data-testid="button-bulk-shortlist"
                  >
                    {bulkShortlistMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ThumbsUp className="h-3.5 w-3.5" />
                    )}
                    {t("interviews:fullpage.shortlistN", { n: formatNumber(selectedIds.size, i18n.language) })}
                  </Button>
                </div>
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center rounded-md border border-dashed border-border">
                <Search className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {parsedSearch.isMulti && searchMeta && searchMeta.missingIds.length > 0
                    ? t("interviews:fullpage.emptyAllMissing")
                    : (search ? t("interviews:fullpage.noMatches", { q: search }) : t("interviews:fullpage.noCandidates"))}
                </p>
              </div>
            ) : (
              <Card className="bg-card border-border">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="w-10 ps-4">
                          {(() => {
                            const eligible = filtered.filter(c => c.applicationId && (localStatuses[c.id] ?? c.applicationStatus) !== "shortlisted");
                            const allSelected = eligible.length > 0 && eligible.every(c => selectedIds.has(c.id));
                            const someSelected = eligible.some(c => selectedIds.has(c.id));
                            return (
                              <Checkbox
                                checked={allSelected}
                                data-state={someSelected && !allSelected ? "indeterminate" : undefined}
                                onCheckedChange={(v) => v ? selectAll(filtered) : clearSelection()}
                                className="border-muted-foreground/40"
                                data-testid="checkbox-select-all"
                              />
                            );
                          })()}
                        </TableHead>
                        <TableHead className="w-10 text-center text-xs">{t("interviews:fullpage.h.num")}</TableHead>
                        <TableHead>{t("interviews:fullpage.h.candidate")}</TableHead>
                        <TableHead>{t("interviews:fullpage.h.id")}</TableHead>
                        <TableHead>{t("interviews:fullpage.h.status")}</TableHead>
                        <TableHead className="text-end">{t("interviews:fullpage.h.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c, idx) => {
                        const effectiveStatus = localStatuses[c.id] ?? c.applicationStatus;
                        const isShortlisted = effectiveStatus === "shortlisted";
                        const isRejected = effectiveStatus === "rejected";
                        const isPending = statusMutation.isPending && (statusMutation.variables as { candidateId?: string } | undefined)?.candidateId === c.id;
                        const isSelected = selectedIds.has(c.id);
                        const isEligible = !!c.applicationId && !isShortlisted;
                        const answers = c.questionSetAnswers ?? null;
                        const hasAnswers = !!answers && Object.keys(answers).length > 0;
                        const isExpanded = expandedAnswerIds.has(c.id);
                        const qs = c.questionSetId ? questionSetMap.get(c.questionSetId) : undefined;
                        return (
                          <Fragment key={c.id}>
                          <TableRow
                            className={`border-border ${isSelected ? "bg-primary/5" : ""}`}
                            data-testid={`fullpage-candidate-${c.id}`}
                          >
                            <TableCell className="ps-4">
                              {isEligible ? (
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleSelect(c.id)}
                                  className="border-muted-foreground/40"
                                  data-testid={`checkbox-candidate-${c.id}`}
                                />
                              ) : (
                                <span className="block w-4" />
                              )}
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground/50 font-mono text-xs" dir="ltr">
                              {formatNumber(idx + 1, i18n.language)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8 border border-border shrink-0">
                                  {c.photoUrl && <AvatarImage src={c.photoUrl} alt={c.fullNameEn} className="object-cover" />}
                                  <AvatarFallback className="bg-primary/15 text-primary text-[10px]">
                                    {initials(c.fullNameEn)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-medium text-white truncate"><bdi>{c.fullNameEn}</bdi></span>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground" dir="ltr">
                              {c.nationalId ?? "—"}
                            </TableCell>
                            <TableCell>
                              {isShortlisted && (
                                <Badge className="bg-emerald-900/50 text-emerald-400 border-0 text-[10px] px-2">{t("interviews:labels.shortlisted")}</Badge>
                              )}
                              {isRejected && (
                                <Badge className="bg-red-900/50 text-red-400 border-0 text-[10px] px-2">{t("interviews:labels.rejected")}</Badge>
                              )}
                              {!isShortlisted && !isRejected && effectiveStatus && (
                                <Badge variant="outline" className="text-[10px] px-2">{effectiveStatus}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-end">
                              <div className="flex justify-end gap-1 items-center">
                                {hasAnswers && (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpandedAnswers(c.id)}
                                    className={`flex items-center gap-1 text-xs font-medium transition-colors px-2 py-1 rounded-sm border ${
                                      isExpanded
                                        ? "bg-primary/10 border-primary/40 text-primary"
                                        : "bg-muted/20 border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                                    }`}
                                    title={isExpanded ? t("interviews:detail.hideAnswers") : t("interviews:detail.viewAnswers")}
                                    data-testid={`fullpage-view-answers-${c.id}`}
                                  >
                                    <ChevronRight className={`h-3 w-3 transition-transform rtl:rotate-180 ${isExpanded ? "rotate-90 rtl:rotate-90" : ""}`} />
                                    {isExpanded ? t("interviews:detail.hideAnswers") : t("interviews:detail.viewAnswers")}
                                  </button>
                                )}
                                {isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : c.applicationId ? (
                                  <>
                                    <Button
                                      data-testid={`fullpage-shortlist-${c.id}`}
                                      size="icon"
                                      variant="ghost"
                                      title={t("interviews:detail.tipShortlist")}
                                      disabled={isShortlisted}
                                      onClick={() => statusMutation.mutate({ appId: c.applicationId!, candidateId: c.id, status: "shortlisted" })}
                                      className={`h-8 w-8 ${isShortlisted ? "text-emerald-500" : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-950/40"}`}
                                    >
                                      <ThumbsUp className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      data-testid={`fullpage-reject-${c.id}`}
                                      size="icon"
                                      variant="ghost"
                                      title={t("interviews:detail.tipReject")}
                                      disabled={isRejected}
                                      onClick={() => statusMutation.mutate({ appId: c.applicationId!, candidateId: c.id, status: "rejected" })}
                                      className={`h-8 w-8 ${isRejected ? "text-red-500" : "text-muted-foreground hover:text-red-400 hover:bg-red-950/40"}`}
                                    >
                                      <ThumbsDown className="h-4 w-4" />
                                    </Button>
                                    {(isShortlisted || isRejected) && (
                                      <Button
                                        data-testid={`fullpage-reset-${c.id}`}
                                        size="icon"
                                        variant="ghost"
                                        title={t("interviews:detail.tipReset")}
                                        onClick={() => statusMutation.mutate({ appId: c.applicationId!, candidateId: c.id, status: "interviewed" })}
                                        className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-muted/20"
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground/40 italic">{t("interviews:detail.noApplication")}</span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          {isExpanded && hasAnswers && (
                            <TableRow className="bg-muted/5 hover:bg-muted/5 border-border" data-testid={`fullpage-panel-answers-${c.id}`}>
                              <TableCell colSpan={6} className="px-6 pb-4 pt-2">
                                <div className="border border-border rounded-md p-4 space-y-3 bg-muted/10">
                                  <p className="text-xs text-primary font-semibold uppercase tracking-wider">
                                    {t("interviews:detail.screeningAnswers", { name: qs?.name ?? "" })}
                                  </p>
                                  <div className="space-y-2">
                                    {qs?.questions && qs.questions.length > 0 ? (
                                      qs.questions.map((q, qIdx) => (
                                        <div key={q.id} className="flex items-start gap-3 text-sm">
                                          <span className="text-xs font-bold text-primary/60 mt-0.5 shrink-0 w-5 text-end" dir="ltr">{formatNumber(qIdx + 1, i18n.language)}.</span>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-muted-foreground text-xs" data-testid={`fullpage-text-question-${c.id}-${q.id}`}><bdi>{q.text}</bdi></p>
                                            <p className={`font-medium mt-0.5 ${answers![q.id] ? "text-white" : "text-muted-foreground/40 italic"}`} data-testid={`fullpage-text-answer-${c.id}-${q.id}`}>
                                              <bdi>{answers![q.id] || t("interviews:detail.noAnswer")}</bdi>
                                            </p>
                                          </div>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="space-y-2">
                                        {Object.entries(answers!).map(([qid, val], qIdx) => (
                                          <div key={qid} className="flex items-start gap-3 text-sm">
                                            <span className="text-xs font-bold text-primary/60 mt-0.5 shrink-0 w-5 text-end" dir="ltr">{formatNumber(qIdx + 1, i18n.language)}.</span>
                                            <p className="font-medium text-white flex-1" data-testid={`fullpage-text-answer-${c.id}-${qid}`}><bdi>{val || t("interviews:detail.noAnswer")}</bdi></p>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
            {search && filtered.length > 0 && filtered.length < invitedCandidates.length && (
              <p className="text-xs text-muted-foreground text-center">
                {t("interviews:fullpage.showing", { n: formatNumber(filtered.length, i18n.language), total: formatNumber(invitedCandidates.length, i18n.language) })}
              </p>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function InterviewsPage() {
  const [, navigate] = useLocation();
  const { t, i18n } = useTranslation(["interviews"]);
  const { formatScheduled, formatCreatedAt } = useFormatters();
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [cancelPendingId, setCancelPendingId] = useState<string | null>(null);
  const [archivePendingId, setArchivePendingId] = useState<string | null>(null);
  const [detailInterview, setDetailInterview] = useState<Interview | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: eventsList = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/events"],
    queryFn: () => apiRequest("GET", "/api/events").then((r) => r.json()),
  });

  const { data: interviewList = [], isLoading } = useQuery<Interview[]>({
    queryKey: ["/api/interviews", { eventId: eventFilter !== "all" ? eventFilter : undefined }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (eventFilter !== "all") params.set("eventId", eventFilter);
      return apiRequest("GET", `/api/interviews${params.toString() ? `?${params}` : ""}`).then((r) => r.json());
    },
  });

  const { data: stats } = useQuery<InterviewStats>({
    queryKey: ["/api/interviews/stats"],
    queryFn: () => apiRequest("GET", "/api/interviews/stats").then((r) => r.json()),
  });

  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates/list"],
    queryFn: async () => {
      const json = await apiRequest("GET", "/api/candidates?limit=100").then((r) => r.json());
      return Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    },
  });

  const candidateMap = Object.fromEntries(
    (Array.isArray(candidates) ? candidates : []).map((c) => [c.id, c])
  );

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/interviews/${id}`, { status }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/interviews/stats"] });
    },
    onError: () => toast({ title: t("interviews:toast.updateInterviewFail"), variant: "destructive" }),
  });

  // Archive is a separate verb from Cancel: it only applies to completed
  // interviews and removes them from the default list + dashboard tiles
  // without sending any candidate SMS. The server enforces the
  // status === "completed" guard, so a stale UI cannot bypass it.
  const archiveInterview = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/interviews/${id}/archive`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/interviews/stats"] });
      toast({
        title: t("interviews:toast.archivedTitle"),
        description: t("interviews:toast.archivedDesc"),
      });
    },
    onError: (err: any) =>
      toast({
        title: err?.message || t("interviews:toast.updateInterviewFail"),
        variant: "destructive",
      }),
  });

  const filtered = interviewList.filter((iv) => {
    if (!search) return true;
    const candidate = candidateMap[iv.candidateId];
    const q = search.toLowerCase();
    return (
      candidate?.fullNameEn.toLowerCase().includes(q) ||
      iv.type.toLowerCase().includes(q) ||
      iv.status.toLowerCase().includes(q) ||
      (iv.createdByName ?? "").toLowerCase().includes(q) ||
      (iv.groupName ?? "").toLowerCase().includes(q)
    );
  });

  const scheduledCount = stats?.scheduled ?? interviewList.filter((i) => i.status === "scheduled").length;
  const completedCount = stats?.completed ?? interviewList.filter((i) => i.status === "completed").length;
  const totalCount = stats?.total ?? interviewList.length;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">{t("interviews:page.title")}</h1>
            <p className="text-muted-foreground mt-1">{t("interviews:page.subtitle")}</p>
          </div>
          <Button
            className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs"
            onClick={() => navigate("/interviews/schedule")}
            data-testid="button-schedule-interview"
          >
            <Plus className="me-2 h-4 w-4" />
            {t("interviews:page.btnSchedule")}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border shadow-sm border-s-4 border-s-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("interviews:stats.total")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-interviews-total" dir="ltr">{formatNumber(totalCount, i18n.language)}</div>
              <p className="text-xs text-muted-foreground mt-1">{t("interviews:stats.totalHint")}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("interviews:stats.scheduled")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-interviews-scheduled" dir="ltr">{formatNumber(scheduledCount, i18n.language)}</div>
              <p className="text-xs text-muted-foreground mt-1">{t("interviews:stats.scheduledHint")}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("interviews:stats.completed")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-interviews-completed" dir="ltr">{formatNumber(completedCount, i18n.language)}</div>
              <p className="text-xs text-muted-foreground mt-1">{t("interviews:stats.completedHint")}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("interviews:stats.rate")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" dir="ltr">
                {formatNumber(completionRate, i18n.language)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t("interviews:stats.rateHint")}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder={t("interviews:filters.searchPh")}
              className="ps-10 h-12 bg-muted/30 border-border focus-visible:ring-primary/20 text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-interviews"
            />
          </div>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-[180px] h-12 bg-muted/30 border-border" data-testid="select-event-filter-interviews">
              <SelectValue placeholder={t("interviews:filters.allEvents")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("interviews:filters.allEvents")}</SelectItem>
              {eventsList.map((evt) => (
                <SelectItem key={evt.id} value={evt.id}><bdi>{evt.name}</bdi></SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-display text-white">{t("interviews:table.title")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">{t("interviews:table.empty")}</p>
                <p className="text-muted-foreground/60 text-sm mt-1">{t("interviews:table.emptyHint")}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">{t("interviews:table.h.group")}</TableHead>
                    <TableHead className="text-muted-foreground">{t("interviews:table.h.scheduled")}</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">{t("interviews:table.h.venue")}</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">{t("interviews:table.h.invited")}</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">{t("interviews:table.h.decisions")}</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">{t("interviews:table.h.created")}</TableHead>
                    <TableHead className="text-muted-foreground">{t("interviews:table.h.status")}</TableHead>
                    <TableHead className="text-end text-muted-foreground">{t("interviews:table.h.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((iv) => {
                    const candidate = candidateMap[iv.candidateId];
                    const { date, time } = formatScheduled(iv.scheduledAt);
                    const invitedCount = iv.invitedCandidateIds?.length ?? 0;
                    const shortlistedCount = iv.shortlistedCount ?? 0;
                    const rejectedCount = iv.rejectedCount ?? 0;
                    const pendingCount = iv.pendingCount ?? Math.max(invitedCount - shortlistedCount - rejectedCount, 0);
                    return (
                      <TableRow
                        key={iv.id}
                        className="border-border hover:bg-muted/20 cursor-pointer"
                        onClick={() => setDetailInterview(iv)}
                        data-testid={`row-interview-${iv.id}`}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium text-white text-sm">
                              <bdi>{iv.groupName || candidate?.fullNameEn || t("interviews:table.unnamed")}</bdi>
                            </p>
                            <p className="text-[10px] text-muted-foreground font-mono" dir="ltr">
                              {iv.id.slice(0, 8)}…
                            </p>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-sm text-white">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              <bdi>{date}</bdi>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground" dir="ltr">
                              <Clock className="h-3 w-3" />
                              {time} · {t("interviews:table.minSuffix", { n: formatNumber(iv.durationMinutes, i18n.language) })}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            {typeIcon(iv.type)}
                            <span className="truncate max-w-32"><bdi>{iv.type ? t(`interviews:type.${iv.type}`, { defaultValue: iv.type }) : "—"}</bdi></span>
                          </div>
                        </TableCell>

                        <TableCell className="hidden md:table-cell">
                          <Badge
                            variant="outline"
                            className="bg-primary/10 text-primary border-primary/20 font-semibold"
                            data-testid={`badge-invited-${iv.id}`}
                          >
                            <Users className="me-1 h-3 w-3" />
                            <span dir="ltr">{formatNumber(invitedCount, i18n.language)}</span>
                          </Badge>
                        </TableCell>

                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={`border-0 font-semibold tabular-nums ${shortlistedCount > 0 ? "bg-emerald-900/40 text-emerald-400" : "bg-muted/30 text-muted-foreground/50"}`}
                              title={t("interviews:table.decisions.shortlistedTip", { n: formatNumber(shortlistedCount, i18n.language) })}
                              data-testid={`badge-decisions-shortlisted-${iv.id}`}
                            >
                              <span dir="ltr">{formatNumber(shortlistedCount, i18n.language)}</span>
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`border-0 font-semibold tabular-nums ${rejectedCount > 0 ? "bg-red-900/40 text-red-400" : "bg-muted/30 text-muted-foreground/50"}`}
                              title={t("interviews:table.decisions.rejectedTip", { n: formatNumber(rejectedCount, i18n.language) })}
                              data-testid={`badge-decisions-rejected-${iv.id}`}
                            >
                              <span dir="ltr">{formatNumber(rejectedCount, i18n.language)}</span>
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`border-0 font-semibold tabular-nums ${pendingCount > 0 ? "bg-muted/50 text-muted-foreground" : "bg-muted/30 text-muted-foreground/50"}`}
                              title={t("interviews:table.decisions.pendingTip", { n: formatNumber(pendingCount, i18n.language) })}
                              data-testid={`badge-decisions-pending-${iv.id}`}
                            >
                              <span dir="ltr">{formatNumber(pendingCount, i18n.language)}</span>
                            </Badge>
                          </div>
                        </TableCell>

                        <TableCell className="hidden lg:table-cell">
                          <div className="space-y-0.5">
                            <p className="text-sm text-white"><bdi>{formatCreatedAt(iv.createdAt)}</bdi></p>
                            {iv.createdByName && (
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <User className="h-2.5 w-2.5" />
                                <bdi>{iv.createdByName}</bdi>
                              </p>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge variant="outline" className={`font-medium border-0 ${statusStyle(iv.status)}`}>
                            {iv.status === "completed" && <CheckCircle2 className="me-1 h-3 w-3" />}
                            {t(`interviews:status.${iv.status}`, { defaultValue: iv.status })}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" data-testid={`button-interview-actions-${iv.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => setDetailInterview(iv)}>
                                {t("interviews:actions.view")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {iv.status === "scheduled" && (
                                <DropdownMenuItem onClick={() => updateStatus.mutate({ id: iv.id, status: "in_progress" })}>
                                  {t("interviews:actions.markInProgress")}
                                </DropdownMenuItem>
                              )}
                              {(iv.status === "scheduled" || iv.status === "in_progress") && (
                                <DropdownMenuItem onClick={() => updateStatus.mutate({ id: iv.id, status: "completed" })}>
                                  {t("interviews:actions.markCompleted")}
                                </DropdownMenuItem>
                              )}
                              {iv.status === "scheduled" && (
                                <DropdownMenuItem onClick={() => updateStatus.mutate({ id: iv.id, status: "no_show" })}>
                                  {t("interviews:actions.markNoShow")}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {iv.status === "completed" ? (
                                <DropdownMenuItem
                                  onClick={() => setArchivePendingId(iv.id)}
                                  data-testid={`button-archive-interview-${iv.id}`}
                                >
                                  {t("interviews:actions.archive")}
                                </DropdownMenuItem>
                              ) : iv.status !== "cancelled" ? (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setCancelPendingId(iv.id)}
                                  data-testid={`button-cancel-interview-${iv.id}`}
                                >
                                  {t("interviews:actions.cancel")}
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <InterviewDetailSheet
        interviewId={detailInterview?.id ?? ""}
        groupName={detailInterview?.groupName || t("interviews:detail.title")}
        open={!!detailInterview}
        onOpenChange={(v) => { if (!v) setDetailInterview(null); }}
      />

      <AlertDialog open={!!cancelPendingId} onOpenChange={(v) => { if (!v) setCancelPendingId(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-display">{t("interviews:cancelDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("interviews:cancelDialog.desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-border text-muted-foreground hover:text-white"
              data-testid="button-cancel-confirm-dismiss"
            >
              {t("interviews:cancelDialog.keep")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-cancel-confirm-proceed"
              onClick={() => {
                if (cancelPendingId) {
                  updateStatus.mutate({ id: cancelPendingId, status: "cancelled" });
                  setCancelPendingId(null);
                }
              }}
            >
              {t("interviews:cancelDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!archivePendingId} onOpenChange={(v) => { if (!v) setArchivePendingId(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-display">{t("interviews:archiveDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("interviews:archiveDialog.desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-border text-muted-foreground hover:text-white"
              data-testid="button-archive-confirm-dismiss"
            >
              {t("interviews:archiveDialog.keep")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="button-archive-confirm-proceed"
              onClick={() => {
                if (archivePendingId) {
                  archiveInterview.mutate(archivePendingId);
                  setArchivePendingId(null);
                }
              }}
            >
              {t("interviews:archiveDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
