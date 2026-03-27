import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Filter,
  MoreHorizontal,
  Calendar,
  Clock,
  Video,
  Phone,
  MapPin,
  CheckCircle2,
  Loader2,
  Plus,
  Users,
  User,
  StickyNote,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Maximize2,
  ArrowLeft,
  X,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

// ─── Utility helpers ───────────────────────────────────────────────────────────
function typeIcon(type: string) {
  if (type === "video") return <Video className="h-4 w-4" />;
  if (type === "phone") return <Phone className="h-4 w-4" />;
  return <MapPin className="h-4 w-4" />;
}

function typeLabel(type: string) {
  if (type === "video") return "Video Call";
  if (type === "phone") return "Phone Call";
  if (type === "in_person") return "In Person";
  return type;
}

function statusStyle(status: string) {
  if (status === "scheduled") return "bg-blue-500/10 text-blue-400";
  if (status === "in_progress") return "bg-amber-500/10 text-amber-400";
  if (status === "completed") return "bg-emerald-500/10 text-emerald-400";
  if (status === "cancelled") return "bg-destructive/10 text-destructive";
  if (status === "no_show") return "bg-orange-500/10 text-orange-400";
  return "bg-muted text-muted-foreground";
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatScheduled(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-SA", { weekday: "short", month: "short", day: "numeric" }),
    time: d.toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" }),
  };
}

function formatCreatedAt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-SA", { day: "numeric", month: "short", year: "numeric" });
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// ─── Interview Detail Sheet ────────────────────────────────────────────────────
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
      toast({ title: vars.status === "shortlisted" ? "Candidate shortlisted" : vars.status === "rejected" ? "Candidate rejected" : "Status updated" });
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const iv = data?.interview;
  const invitedCandidates = data?.invitedCandidates ?? [];
  const scheduled = iv ? formatScheduled(iv.scheduledAt) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl bg-card border-border p-0 flex flex-col">
        <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
          <SheetTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            {groupName}
          </SheetTitle>
          <SheetDescription className="text-muted-foreground text-sm">
            Interview and Training session details and invited candidate list
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !iv ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Interview not found
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="px-6 py-5 space-y-6">

              {/* ── Status badge ── */}
              <div>
                <Badge variant="outline" className={`text-sm px-3 py-1 border-0 font-semibold ${statusStyle(iv.status)}`}>
                  {iv.status === "completed" && <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                  {statusLabel(iv.status)}
                </Badge>
              </div>

              {/* ── Session metadata ── */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Date</p>
                  <p className="text-sm text-white flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    {scheduled?.date}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Time</p>
                  <p className="text-sm text-white flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    {scheduled?.time}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Venue</p>
                  <p className="text-sm text-white flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    {iv.type || "—"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Duration</p>
                  <p className="text-sm text-white flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    {iv.durationMinutes} min
                  </p>
                </div>
                {iv.createdByName && (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Created by</p>
                    <p className="text-sm text-white flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {iv.createdByName}
                    </p>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Created on</p>
                  <p className="text-sm text-white">{formatCreatedAt(iv.createdAt)}</p>
                </div>
              </div>

              {/* ── Google Maps link ── */}
              {iv.meetingUrl && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Location Link</p>
                  <a
                    href={iv.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:text-primary/70 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in Google Maps
                  </a>
                </div>
              )}

              {/* ── Notes ── */}
              {iv.notes && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5">
                    <StickyNote className="h-3 w-3" />
                    Session Notes
                  </p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/10 rounded-md px-3 py-2 border border-border">
                    {iv.notes}
                  </p>
                </div>
              )}

              {/* ── Invited Candidates ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5">
                    <Users className="h-3 w-3" />
                    Invited Candidates
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs font-bold">
                      {invitedCandidates.length.toLocaleString()}
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
                        Full Page
                      </Button>
                    )}
                  </div>
                </div>

                {invitedCandidates.length > 5 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search by ID number…"
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                      className="pl-9 h-8 text-xs bg-background border-border"
                      data-testid="input-search-invited-candidates"
                    />
                    {candidateSearch && (
                      <button
                        onClick={() => setCandidateSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}

                {invitedCandidates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center rounded-md border border-dashed border-border">
                    <Users className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No candidates recorded for this session</p>
                  </div>
                ) : (() => {
                  const filtered = candidateSearch.trim()
                    ? invitedCandidates.filter(c => c.nationalId?.includes(candidateSearch.trim()))
                    : invitedCandidates;
                  return filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center rounded-md border border-dashed border-border">
                      <Search className="h-6 w-6 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">No candidates matching "{candidateSearch}"</p>
                    </div>
                  ) : (
                  <div className="rounded-md border border-border divide-y divide-border overflow-hidden">
                    {filtered.map((c, idx) => {
                      const effectiveStatus = localStatuses[c.id] ?? c.applicationStatus;
                      const isShortlisted = effectiveStatus === "shortlisted";
                      const isRejected    = effectiveStatus === "rejected";
                      const isPending     = statusMutation.isPending && (statusMutation.variables as any)?.candidateId === c.id;
                      return (
                        <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors" data-testid={`detail-candidate-${c.id}`}>
                          <span className="text-[10px] text-muted-foreground/50 font-mono w-5 text-right shrink-0">{idx + 1}</span>
                          <Avatar className="h-7 w-7 border border-border shrink-0">
                            {c.photoUrl && <AvatarImage src={c.photoUrl} alt={c.fullNameEn} className="object-cover" />}
                            <AvatarFallback className="bg-primary/15 text-primary text-[10px]">
                              {initials(c.fullNameEn)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium truncate">{c.fullNameEn}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{c.nationalId ?? "—"}</p>
                          </div>

                          {/* Status badge */}
                          {isShortlisted && (
                            <Badge className="bg-emerald-900/50 text-emerald-400 border-0 text-[10px] px-2 shrink-0">Shortlisted</Badge>
                          )}
                          {isRejected && (
                            <Badge className="bg-red-900/50 text-red-400 border-0 text-[10px] px-2 shrink-0">Rejected</Badge>
                          )}

                          {/* Action buttons */}
                          <div className="flex gap-1 shrink-0">
                            {isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : c.applicationId ? (
                              <>
                                <Button
                                  data-testid={`button-shortlist-${c.id}`}
                                  size="icon"
                                  variant="ghost"
                                  title="Shortlist"
                                  disabled={isShortlisted}
                                  onClick={() => statusMutation.mutate({ appId: c.applicationId!, candidateId: c.id, status: "shortlisted" })}
                                  className={`h-7 w-7 ${isShortlisted ? "text-emerald-500" : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-950/40"}`}
                                >
                                  <ThumbsUp className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  data-testid={`button-reject-candidate-${c.id}`}
                                  size="icon"
                                  variant="ghost"
                                  title="Reject"
                                  disabled={isRejected}
                                  onClick={() => statusMutation.mutate({ appId: c.applicationId!, candidateId: c.id, status: "rejected" })}
                                  className={`h-7 w-7 ${isRejected ? "text-red-500" : "text-muted-foreground hover:text-red-400 hover:bg-red-950/40"}`}
                                >
                                  <ThumbsDown className="h-3.5 w-3.5" />
                                </Button>
                                {(isShortlisted || isRejected) && (
                                  <Button
                                    data-testid={`button-reset-status-${c.id}`}
                                    size="icon"
                                    variant="ghost"
                                    title="Reset to interviewed"
                                    onClick={() => statusMutation.mutate({ appId: c.applicationId!, candidateId: c.id, status: "interviewed" })}
                                    className="h-7 w-7 text-muted-foreground hover:text-white hover:bg-muted/20"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </Button>
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/40 italic">No application</span>
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

// ─── Full Page Candidate List ─────────────────────────────────────────────────
export function InterviewCandidatesPage({ params }: { params: { id: string } }) {
  const interviewId = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [localStatuses, setLocalStatuses] = useState<Record<string, string>>({});

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
      toast({ title: vars.status === "shortlisted" ? "Candidate shortlisted" : vars.status === "rejected" ? "Candidate rejected" : "Status updated" });
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
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
            className="h-9 w-9 shrink-0"
            onClick={() => navigate("/interviews")}
            data-testid="button-back-to-interviews"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl font-bold text-white truncate" data-testid="text-session-name">
              {iv?.groupName || "Session"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {scheduled ? `${scheduled.date} at ${scheduled.time}` : "Loading…"}
              {iv && ` · ${typeLabel(iv.type)}`}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !iv ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            Interview not found
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-sm font-bold px-3 py-1">
                {invitedCandidates.length.toLocaleString()} Candidates
              </Badge>
              {shortlistedCount > 0 && (
                <Badge className="bg-emerald-900/50 text-emerald-400 border-0 text-sm px-3 py-1">
                  {shortlistedCount} Shortlisted
                </Badge>
              )}
              {rejectedCount > 0 && (
                <Badge className="bg-red-900/50 text-red-400 border-0 text-sm px-3 py-1">
                  {rejectedCount} Rejected
                </Badge>
              )}
            </div>

            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by ID number or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-background border-border"
                data-testid="input-fullpage-search-candidates"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center rounded-md border border-dashed border-border">
                <Search className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {search ? `No candidates matching "${search}"` : "No candidates in this session"}
                </p>
              </div>
            ) : (
              <Card className="bg-card border-border">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="w-12 text-center">#</TableHead>
                        <TableHead>Candidate</TableHead>
                        <TableHead>ID Number</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c, idx) => {
                        const effectiveStatus = localStatuses[c.id] ?? c.applicationStatus;
                        const isShortlisted = effectiveStatus === "shortlisted";
                        const isRejected = effectiveStatus === "rejected";
                        const isPending = statusMutation.isPending && (statusMutation.variables as any)?.candidateId === c.id;
                        return (
                          <TableRow key={c.id} className="border-border" data-testid={`fullpage-candidate-${c.id}`}>
                            <TableCell className="text-center text-muted-foreground/50 font-mono text-xs">
                              {idx + 1}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8 border border-border shrink-0">
                                  {c.photoUrl && <AvatarImage src={c.photoUrl} alt={c.fullNameEn} className="object-cover" />}
                                  <AvatarFallback className="bg-primary/15 text-primary text-[10px]">
                                    {initials(c.fullNameEn)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-medium text-white truncate">{c.fullNameEn}</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {c.nationalId ?? "—"}
                            </TableCell>
                            <TableCell>
                              {isShortlisted && (
                                <Badge className="bg-emerald-900/50 text-emerald-400 border-0 text-[10px] px-2">Shortlisted</Badge>
                              )}
                              {isRejected && (
                                <Badge className="bg-red-900/50 text-red-400 border-0 text-[10px] px-2">Rejected</Badge>
                              )}
                              {!isShortlisted && !isRejected && effectiveStatus && (
                                <Badge variant="outline" className="text-[10px] px-2">{statusLabel(effectiveStatus)}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : c.applicationId ? (
                                  <>
                                    <Button
                                      data-testid={`fullpage-shortlist-${c.id}`}
                                      size="icon"
                                      variant="ghost"
                                      title="Shortlist"
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
                                      title="Reject"
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
                                        title="Reset to interviewed"
                                        onClick={() => statusMutation.mutate({ appId: c.applicationId!, candidateId: c.id, status: "interviewed" })}
                                        className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-muted/20"
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground/40 italic">No application</span>
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
                Showing {filtered.length} of {invitedCandidates.length.toLocaleString()} candidates
              </p>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function InterviewsPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [cancelPendingId, setCancelPendingId] = useState<string | null>(null);
  const [detailInterview, setDetailInterview] = useState<Interview | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: interviewList = [], isLoading } = useQuery<Interview[]>({
    queryKey: ["/api/interviews"],
    queryFn: () => apiRequest("GET", "/api/interviews").then((r) => r.json()),
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
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const filtered = interviewList.filter((iv) => {
    if (!search) return true;
    const candidate = candidateMap[iv.candidateId];
    const q = search.toLowerCase();
    return (
      candidate?.fullNameEn.toLowerCase().includes(q) ||
      typeLabel(iv.type).toLowerCase().includes(q) ||
      iv.status.toLowerCase().includes(q) ||
      (iv.createdByName ?? "").toLowerCase().includes(q)
    );
  });

  const scheduledCount = stats?.scheduled ?? interviewList.filter((i) => i.status === "scheduled").length;
  const completedCount = stats?.completed ?? interviewList.filter((i) => i.status === "completed").length;
  const totalCount = stats?.total ?? interviewList.length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Interview & Training</h1>
            <p className="text-muted-foreground mt-1">Manage and track candidate interview & training schedules.</p>
          </div>
          <Button
            className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs"
            onClick={() => navigate("/interviews/schedule")}
            data-testid="button-schedule-interview"
          >
            <Plus className="mr-2 h-4 w-4" />
            Schedule Session
          </Button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-interviews-total">{totalCount}</div>
              <p className="text-xs text-muted-foreground mt-1">All interviews</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Scheduled</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-interviews-scheduled">{scheduledCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Upcoming calls</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-interviews-completed">{completedCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Successfully done</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Completion Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">
                {totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">Of all interviews</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="flex flex-col md:flex-row gap-4 items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by group name, type, status, or creator…"
              className="pl-10 h-12 bg-muted/30 border-border focus-visible:ring-primary/20 text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-interviews"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="outline" className="h-12 border-border bg-background flex-1 md:flex-none">
              <Filter className="mr-2 h-4 w-4" />
              Status
            </Button>
            <Button variant="outline" className="h-12 border-border bg-background flex-1 md:flex-none">
              <Calendar className="mr-2 h-4 w-4" />
              Date
            </Button>
          </div>
        </div>

        {/* Table */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-display text-white">Interview & Training Schedule</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">No interviews scheduled</p>
                <p className="text-muted-foreground/60 text-sm mt-1">Click "Schedule Session" to add one</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Group / Batch</TableHead>
                    <TableHead className="text-muted-foreground">Scheduled</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">Venue</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">Invited</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">Created</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-right text-muted-foreground">Actions</TableHead>
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
                        {/* Group name */}
                        <TableCell>
                          <div>
                            <p className="font-medium text-white text-sm">
                              {iv.groupName || candidate?.fullNameEn || "Unnamed Session"}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-mono">
                              {iv.id.slice(0, 8)}…
                            </p>
                          </div>
                        </TableCell>

                        {/* Scheduled date/time */}
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-sm text-white">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              {date}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {time} · {iv.durationMinutes} min
                            </div>
                          </div>
                        </TableCell>

                        {/* Venue */}
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            {typeIcon(iv.type)}
                            <span className="truncate max-w-32">{iv.type || "—"}</span>
                          </div>
                        </TableCell>

                        {/* Invited count */}
                        <TableCell className="hidden md:table-cell">
                          <Badge
                            variant="outline"
                            className="bg-primary/10 text-primary border-primary/20 font-semibold"
                            data-testid={`badge-invited-${iv.id}`}
                          >
                            <Users className="mr-1 h-3 w-3" />
                            {invitedCount.toLocaleString()}
                          </Badge>
                        </TableCell>

                        {/* Created column */}
                        <TableCell className="hidden lg:table-cell">
                          <div className="space-y-0.5">
                            <p className="text-sm text-white">{formatCreatedAt(iv.createdAt)}</p>
                            {iv.createdByName && (
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <User className="h-2.5 w-2.5" />
                                {iv.createdByName}
                              </p>
                            )}
                          </div>
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <Badge variant="outline" className={`font-medium border-0 capitalize ${statusStyle(iv.status)}`}>
                            {iv.status === "completed" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                            {statusLabel(iv.status)}
                          </Badge>
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" data-testid={`button-interview-actions-${iv.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => setDetailInterview(iv)}>
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {iv.status === "scheduled" && (
                                <DropdownMenuItem onClick={() => updateStatus.mutate({ id: iv.id, status: "in_progress" })}>
                                  Mark In Progress
                                </DropdownMenuItem>
                              )}
                              {(iv.status === "scheduled" || iv.status === "in_progress") && (
                                <DropdownMenuItem onClick={() => updateStatus.mutate({ id: iv.id, status: "completed" })}>
                                  Mark Completed
                                </DropdownMenuItem>
                              )}
                              {iv.status === "scheduled" && (
                                <DropdownMenuItem onClick={() => updateStatus.mutate({ id: iv.id, status: "no_show" })}>
                                  Mark No-Show
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setCancelPendingId(iv.id)}
                                data-testid={`button-cancel-interview-${iv.id}`}
                              >
                                Cancel Interview
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

      {/* ── Detail Sheet ── */}
      <InterviewDetailSheet
        interviewId={detailInterview?.id ?? ""}
        groupName={detailInterview?.groupName || "Interview & Training Session"}
        open={!!detailInterview}
        onOpenChange={(v) => { if (!v) setDetailInterview(null); }}
      />

      {/* ── Cancel Confirmation ── */}
      <AlertDialog open={!!cancelPendingId} onOpenChange={(v) => { if (!v) setCancelPendingId(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-display">Cancel this interview?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will mark the interview as cancelled. Candidates will receive a cancellation SMS and will no longer be expected to attend. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-border text-muted-foreground hover:text-white"
              data-testid="button-cancel-confirm-dismiss"
            >
              Keep Interview
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
              Yes, Cancel Interview
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
