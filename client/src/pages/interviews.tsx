import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Search, Filter, MoreHorizontal, Calendar, Clock, Video, Phone, MapPin,
  CheckCircle2, Loader2, Plus, Users, User, StickyNote, ExternalLink,
  ThumbsUp, RotateCcw, Maximize2, ArrowLeft, X,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/format";

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
};
type InterviewStats = {
  total: number;
  scheduled: number;
  completed: number;
  cancelled: number;
};
type InterviewDetail = {
  interview: Interview;
  invitedCandidates: { id: string; fullNameEn: string; nationalId: string | null; photoUrl: string | null; applicationId: string | null; applicationStatus: string | null }[];
};

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
        date: d.toLocaleDateString(dateLocale, { weekday: "short", month: "short", day: "numeric" }),
        time: d.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", hour12: false }),
      };
    },
    formatCreatedAt(iso: string) {
      return new Date(iso).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/interviews", interviewId] });
      toast({ title: vars.status === "shortlisted" ? t("interviews:toast.shortlisted") : vars.status === "rejected" ? t("interviews:toast.rejected") : t("interviews:toast.updated") });
    },
    onError: () => toast({ title: t("interviews:toast.updateFail"), variant: "destructive" }),
  });

  const iv = data?.interview;
  const invitedCandidates = data?.invitedCandidates ?? [];
  const scheduled = iv ? formatScheduled(iv.scheduledAt) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isAr ? "left" : "right"} className="w-full sm:max-w-xl bg-card border-border p-0 flex flex-col">
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
                      className="ps-9 h-8 text-xs bg-background border-border"
                      data-testid="input-search-invited-candidates"
                    />
                    {candidateSearch && (
                      <button
                        onClick={() => setCandidateSearch("")}
                        className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}

                {invitedCandidates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center rounded-md border border-dashed border-border">
                    <Users className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">{t("interviews:detail.noCandidates")}</p>
                  </div>
                ) : (() => {
                  const filtered = candidateSearch.trim()
                    ? invitedCandidates.filter(c => c.nationalId?.includes(candidateSearch.trim()))
                    : invitedCandidates;
                  return filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center rounded-md border border-dashed border-border">
                      <Search className="h-6 w-6 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">{t("interviews:detail.noMatches", { q: candidateSearch })}</p>
                    </div>
                  ) : (
                  <div className="rounded-md border border-border divide-y divide-border overflow-hidden">
                    {filtered.map((c, idx) => {
                      const effectiveStatus = localStatuses[c.id] ?? c.applicationStatus;
                      const isShortlisted = effectiveStatus === "shortlisted";
                      const isRejected    = effectiveStatus === "rejected";
                      const isPending     = statusMutation.isPending && (statusMutation.variables as { candidateId?: string } | undefined)?.candidateId === c.id;
                      return (
                        <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors" data-testid={`detail-candidate-${c.id}`}>
                          <span className="text-[10px] text-muted-foreground/50 font-mono w-5 text-end shrink-0" dir="ltr">{formatNumber(idx + 1, i18n.language)}</span>
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

                          {isShortlisted && (
                            <Badge className="bg-emerald-900/50 text-emerald-400 border-0 text-[10px] px-2 shrink-0">{t("interviews:labels.shortlisted")}</Badge>
                          )}
                          {isRejected && (
                            <Badge className="bg-red-900/50 text-red-400 border-0 text-[10px] px-2 shrink-0">{t("interviews:labels.rejected")}</Badge>
                          )}

                          <div className="flex gap-1 shrink-0">
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
                                {(isShortlisted || isRejected) && (
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
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/40 italic">{t("interviews:detail.noApplication")}</span>
                            )}
                          </div>
                        </div>
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
      queryClient.invalidateQueries({ queryKey: ["/api/interviews", interviewId] });
      toast({ title: vars.status === "shortlisted" ? t("interviews:toast.shortlisted") : vars.status === "rejected" ? t("interviews:toast.rejected") : t("interviews:toast.updated") });
    },
    onError: () => toast({ title: t("interviews:toast.updateFail"), variant: "destructive" }),
  });

  const bulkShortlistMutation = useMutation({
    mutationFn: (items: { appId: string; candidateId: string }[]) =>
      apiRequest("POST", "/api/applications/bulk-status", {
        updates: items.map(i => ({ id: i.appId, status: "shortlisted" })),
      }).then(r => r.json()),
    onSuccess: (result, items) => {
      const updates: Record<string, string> = {};
      items.forEach(i => { updates[i.candidateId] = "shortlisted"; });
      setLocalStatuses(prev => ({ ...prev, ...updates }));
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ["/api/interviews", interviewId] });
      toast({ title: t("interviews:toast.bulkShortlisted", { count: result.succeeded, replace: { n: formatNumber(result.succeeded, i18n.language) } }) });
    },
    onError: () => toast({ title: t("interviews:toast.bulkFail"), variant: "destructive" }),
  });

  const iv = data?.interview;
  const invitedCandidates = data?.invitedCandidates ?? [];
  const scheduled = iv ? formatScheduled(iv.scheduledAt) : null;

  const filtered = search.trim()
    ? invitedCandidates.filter(c =>
        c.nationalId?.includes(search.trim()) ||
        c.fullNameEn.toLowerCase().includes(search.trim().toLowerCase())
      )
    : invitedCandidates;

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

            <div className="relative max-w-md">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("interviews:fullpage.searchPh")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="ps-10 bg-background border-border"
                data-testid="input-fullpage-search-candidates"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

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
                  {search ? t("interviews:fullpage.noMatches", { q: search }) : t("interviews:fullpage.noCandidates")}
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
                        return (
                          <TableRow
                            key={c.id}
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
                              <div className="flex justify-end gap-1">
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
          <Card className="bg-card border-border shadow-sm border-s-4 border-l-primary">
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
          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="outline" className="h-12 border-border bg-background flex-1 md:flex-none">
              <Filter className="me-2 h-4 w-4" />
              {t("interviews:filters.status")}
            </Button>
            <Button variant="outline" className="h-12 border-border bg-background flex-1 md:flex-none">
              <Calendar className="me-2 h-4 w-4" />
              {t("interviews:filters.date")}
            </Button>
          </div>
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
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setCancelPendingId(iv.id)}
                                data-testid={`button-cancel-interview-${iv.id}`}
                              >
                                {t("interviews:actions.cancel")}
                              </DropdownMenuItem>
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
    </DashboardLayout>
  );
}
