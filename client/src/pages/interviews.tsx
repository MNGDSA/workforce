import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Candidate = { id: string; fullNameEn: string; nationalId?: string };
type Interview = {
  id: string;
  candidateId: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  type: string;
  meetingUrl?: string;
  notes?: string;
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
  invitedCandidates: { id: string; fullNameEn: string; nationalId: string | null }[];
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
  const { data, isLoading } = useQuery<InterviewDetail>({
    queryKey: ["/api/interviews", interviewId],
    queryFn: () => apiRequest("GET", `/api/interviews/${interviewId}`).then((r) => r.json()),
    enabled: open && !!interviewId,
    staleTime: 30_000,
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
            Interview session details and invited candidate list
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
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs font-bold">
                    {invitedCandidates.length.toLocaleString()}
                  </Badge>
                </div>

                {invitedCandidates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center rounded-md border border-dashed border-border">
                    <Users className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No candidates recorded for this session</p>
                  </div>
                ) : (
                  <div className="rounded-md border border-border divide-y divide-border overflow-hidden">
                    {invitedCandidates.map((c, idx) => (
                      <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors" data-testid={`detail-candidate-${c.id}`}>
                        <span className="text-[10px] text-muted-foreground/50 font-mono w-5 text-right shrink-0">{idx + 1}</span>
                        <Avatar className="h-7 w-7 border border-border shrink-0">
                          <AvatarFallback className="bg-primary/15 text-primary text-[10px]">
                            {initials(c.fullNameEn)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium truncate">{c.fullNameEn}</p>
                        </div>
                        <code className="text-[10px] text-muted-foreground font-mono shrink-0">
                          {c.nationalId ?? "—"}
                        </code>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
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
            <CardTitle className="text-lg font-display text-white">Interview Schedule</CardTitle>
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
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 border border-border shrink-0">
                              <AvatarFallback className="bg-primary/20 text-primary text-xs">
                                {candidate ? initials(candidate.fullNameEn) : "??"}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-white text-sm">
                                {candidate?.fullNameEn ?? "Unknown Group"}
                              </p>
                              <p className="text-[10px] text-muted-foreground font-mono">
                                {iv.id.slice(0, 8)}…
                              </p>
                            </div>
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
        groupName={detailInterview ? (candidateMap[detailInterview.candidateId]?.fullNameEn ?? "Interview Session") : ""}
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
