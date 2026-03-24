import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
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
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Candidate = { id: string; fullNameEn: string; nationalId?: string };
type Applicant = { candidateId: string; applicationId: string; fullNameEn: string; nationalId: string | null; applicationStatus: string; appliedAt: string };
type SelectedCandidate = { fullNameEn: string; nationalId: string | null };
type Job = { id: string; title: string; status: string };
type Application = { id: string; candidateId: string; jobId: string; status: string };
type Interview = {
  id: string;
  candidateId: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  type: string;
  meetingUrl?: string;
  notes?: string;
};
type InterviewStats = {
  total: number;
  scheduled: number;
  completed: number;
  cancelled: number;
};

const scheduleSchema = z.object({
  groupName: z.string().min(2, "Group name is required"),
  date: z.string().min(1, "Date is required"),
  time: z.string().min(1, "Time is required"),
  venueName: z.string().min(2, "Venue name is required"),
  durationMinutes: z.coerce.number().min(15).max(180),
  googleLocation: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  notes: z.string().optional(),
});
type ScheduleForm = z.infer<typeof scheduleSchema>;

function ScheduleInterviewDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Selection: Map<candidateId, SelectedCandidate> — persists across pages/searches
  const [selected, setSelected] = useState<Map<string, SelectedCandidate>>(new Map());
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [candidateError, setCandidateError] = useState<string | null>(null);

  // Pagination & search
  const PAGE_SIZE = 15;
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input → reset to page 1 when search changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const { data: activeJobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/jobs", "active"],
    queryFn: () => apiRequest("GET", "/api/jobs?status=active").then((r) => r.json()),
    enabled: open,
    staleTime: 0,
  });

  // Paginated server-side applicant query — no more full candidate list load
  const { data: applicantsResult, isLoading: loadingApps } = useQuery<{ data: Applicant[]; total: number }>({
    queryKey: ["/api/applications/applicants", selectedJobId, page, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({ jobId: selectedJobId, page: String(page), limit: String(PAGE_SIZE) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      return apiRequest("GET", `/api/applications/applicants?${params}`).then((r) => r.json());
    },
    enabled: !!selectedJobId,
    staleTime: 0,
  });

  const applicants = applicantsResult?.data ?? [];
  const total = applicantsResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const handleJobSelect = (jobId: string) => {
    setSelectedJobId(jobId);
    setSelected(new Map());
    setSearchInput("");
    setDebouncedSearch("");
    setPage(1);
    setCandidateError(null);
  };

  const toggleCandidate = (a: Applicant) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(a.candidateId)) {
        next.delete(a.candidateId);
      } else {
        next.set(a.candidateId, { fullNameEn: a.fullNameEn, nationalId: a.nationalId });
        setCandidateError(null);
      }
      return next;
    });
  };

  const selectAllOnPage = () => {
    setSelected((prev) => {
      const next = new Map(prev);
      applicants.forEach((a) => next.set(a.candidateId, { fullNameEn: a.fullNameEn, nationalId: a.nationalId }));
      if (next.size > 0) setCandidateError(null);
      return next;
    });
  };

  const deselectAllOnPage = () => {
    const pageIds = new Set(applicants.map((a) => a.candidateId));
    setSelected((prev) => {
      const next = new Map(prev);
      pageIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const clearAll = () => setSelected(new Map());

  const allPageSelected = applicants.length > 0 && applicants.every((a) => selected.has(a.candidateId));

  const form = useForm<ScheduleForm>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      groupName: "",
      date: new Date().toISOString().slice(0, 10),
      time: "10:00",
      venueName: "",
      durationMinutes: 30,
      googleLocation: "",
      notes: "",
    },
  });

  const schedule = useMutation({
    mutationFn: async (data: ScheduleForm) => {
      const code = "GRP-" + Math.random().toString(36).substring(2, 7).toUpperCase();
      const candidate = await apiRequest("POST", "/api/candidates", {
        candidateCode: code,
        fullNameEn: data.groupName,
      }).then((r) => r.json());

      const scheduledAt = new Date(`${data.date}T${data.time}:00`).toISOString();
      const payload: Record<string, unknown> = {
        candidateId: candidate.id,
        scheduledAt,
        durationMinutes: data.durationMinutes,
        type: data.venueName,
      };
      if (data.googleLocation) payload.meetingUrl = data.googleLocation;

      const invitedNames = Array.from(selected.values()).map((c) => c.fullNameEn).join(", ");
      const notesText = [data.notes, invitedNames ? `Invited: ${invitedNames}` : ""].filter(Boolean).join("\n");
      if (notesText) payload.notes = notesText;

      return apiRequest("POST", "/api/interviews", payload).then((r) => r.json());
    },
    onSuccess: () => {
      toast({ title: "Interview scheduled", description: "The interview has been added to the schedule." });
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/interviews/stats"] });
      form.reset();
      setSelected(new Map());
      setSearchInput("");
      setDebouncedSearch("");
      setSelectedJobId("");
      setPage(1);
      setCandidateError(null);
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to schedule", description: "Please check the details and try again.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Schedule Interview
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Create a new interview session for a group of candidates.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((d) => {
              if (selected.size === 0) {
                setCandidateError("Select at least one candidate from the application list.");
                return;
              }
              schedule.mutate(d);
            })}
            className="space-y-4 pt-1"
          >

            {/* Group Name */}
            <FormField control={form.control} name="groupName" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Group Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Batch A – Makkah Region" className="bg-muted/30 border-border" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="date" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Date</FormLabel>
                  <FormControl>
                    <Input type="date" className="bg-muted/30 border-border" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="time" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Time</FormLabel>
                  <FormControl>
                    <Input type="time" className="bg-muted/30 border-border" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Venue Name & Duration */}
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="venueName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Venue Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Riyadh Main Hall" className="bg-muted/30 border-border" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="durationMinutes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Duration (min)</FormLabel>
                  <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                    <FormControl>
                      <SelectTrigger className="bg-muted/30 border-border">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="15">15 min</SelectItem>
                      <SelectItem value="30">30 min</SelectItem>
                      <SelectItem value="45">45 min</SelectItem>
                      <SelectItem value="60">60 min</SelectItem>
                      <SelectItem value="90">90 min</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Google Location */}
            <FormField control={form.control} name="googleLocation" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Google Location</FormLabel>
                <FormControl>
                  <Input placeholder="https://maps.google.com/..." className="bg-muted/30 border-border" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Candidate Picker */}
            <div className="space-y-2">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <p className={`text-xs uppercase tracking-wider font-semibold flex items-center gap-1 ${candidateError ? "text-destructive" : "text-muted-foreground"}`}>
                  Candidates
                  <span className="text-destructive">*</span>
                  {selected.size > 0 && (
                    <span className="ml-1 text-primary font-bold normal-case">— {selected.size} selected</span>
                  )}
                </p>
                {selected.size > 0 && (
                  <button type="button" onClick={clearAll} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">
                    Clear all
                  </button>
                )}
              </div>

              {/* Selected chips — scrollable horizontal strip */}
              {selected.size > 0 && (
                <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                  {Array.from(selected.entries()).map(([id, c]) => (
                    <Badge
                      key={id}
                      variant="outline"
                      className="bg-primary/10 text-primary border-primary/30 text-[10px] gap-0.5 pr-0.5 cursor-pointer hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                      onClick={() => setSelected((prev) => { const n = new Map(prev); n.delete(id); return n; })}
                      data-testid={`chip-invited-${id}`}
                    >
                      {c.fullNameEn}
                      <X className="h-2.5 w-2.5 opacity-60" />
                    </Badge>
                  ))}
                </div>
              )}

              {/* Job selector */}
              <Select value={selectedJobId || "none"} onValueChange={(v) => handleJobSelect(v === "none" ? "" : v)}>
                <SelectTrigger className={`bg-muted/30 h-9 text-sm ${candidateError && !selectedJobId ? "border-destructive" : "border-border"}`} data-testid="select-job-applications">
                  <SelectValue placeholder="Select a job to browse applicants…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select a job to browse applicants…</SelectItem>
                  {activeJobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Search + page actions row */}
              {selectedJobId && (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or National ID…"
                      className="pl-8 h-8 text-xs bg-muted/30 border-border"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      data-testid="input-invite-search"
                    />
                  </div>
                  {applicants.length > 0 && (
                    <button
                      type="button"
                      onClick={allPageSelected ? deselectAllOnPage : selectAllOnPage}
                      className="shrink-0 text-[10px] font-semibold text-primary hover:text-primary/70 transition-colors whitespace-nowrap"
                      data-testid="button-select-page"
                    >
                      {allPageSelected ? "Deselect page" : "Select page"}
                    </button>
                  )}
                </div>
              )}

              {/* Applicant list */}
              <div className={`rounded-md border bg-muted/10 divide-y divide-border ${candidateError && selected.size === 0 ? "border-destructive" : "border-border"}`}>
                {!selectedJobId ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    Select a job above to browse its applicants
                  </p>
                ) : loadingApps ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : applicants.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    {total === 0 && !debouncedSearch ? "No applicants for this job yet" : "No matches found"}
                  </p>
                ) : (
                  <div className="max-h-40 overflow-y-auto">
                    {applicants.map((a) => {
                      const isSelected = selected.has(a.candidateId);
                      return (
                        <div
                          key={a.candidateId}
                          className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-muted/30"}`}
                          onClick={() => toggleCandidate(a)}
                          data-testid={`row-invite-${a.candidateId}`}
                        >
                          <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                            {isSelected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={`text-sm font-medium truncate block ${isSelected ? "text-primary" : "text-white"}`}>
                              {a.fullNameEn}
                            </span>
                          </div>
                          <code className="text-[10px] text-muted-foreground font-mono shrink-0">{a.nationalId ?? "—"}</code>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pagination footer */}
                {selectedJobId && total > 0 && (
                  <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-muted/5">
                    <span className="text-[10px] text-muted-foreground">
                      {from}–{to} of {total.toLocaleString()} applicants
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="h-5 w-5 flex items-center justify-center rounded disabled:opacity-30 hover:bg-muted transition-colors"
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </button>
                      <span className="text-[10px] text-muted-foreground min-w-8 text-center">{page}/{totalPages}</span>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="h-5 w-5 flex items-center justify-center rounded disabled:opacity-30 hover:bg-muted transition-colors"
                        data-testid="button-next-page"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {candidateError && selected.size === 0 && (
                <p className="text-xs text-destructive flex items-center gap-1.5 pt-0.5">
                  <span>⚠</span> {candidateError}
                </p>
              )}
            </div>

            {/* Notes */}
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Notes</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Interview instructions, topics to cover, etc."
                    className="bg-muted/30 border-border resize-none"
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" className="border-border" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary text-primary-foreground font-bold min-w-[140px]" disabled={schedule.isPending}>
                {schedule.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><Plus className="mr-1.5 h-4 w-4" />Schedule</>}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

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

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default function InterviewsPage() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cancelPendingId, setCancelPendingId] = useState<string | null>(null);
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
      iv.status.toLowerCase().includes(q)
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
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Interview Calls</h1>
            <p className="text-muted-foreground mt-1">Manage and track candidate interview schedules.</p>
          </div>
          <Button
            className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs"
            onClick={() => setOpen(true)}
            data-testid="button-schedule-interview"
          >
            <Plus className="mr-2 h-4 w-4" />
            Schedule Interview
          </Button>
        </div>

        <ScheduleInterviewDialog open={open} onOpenChange={setOpen} />

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
              placeholder="Search by candidate, type, or status…"
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
                <p className="text-muted-foreground/60 text-sm mt-1">Click "Schedule Interview" to add one</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Candidate</TableHead>
                    <TableHead className="text-muted-foreground">Schedule</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">Type</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">Duration</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((iv) => {
                    const candidate = candidateMap[iv.candidateId];
                    const { date, time } = formatScheduled(iv.scheduledAt);
                    return (
                      <TableRow key={iv.id} className="border-border hover:bg-muted/20" data-testid={`row-interview-${iv.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 border border-border">
                              <AvatarFallback className="bg-primary/20 text-primary text-xs">
                                {candidate ? initials(candidate.fullNameEn) : "??"}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-white text-sm">
                                {candidate?.fullNameEn ?? "Unknown Candidate"}
                              </p>
                              <p className="text-[10px] text-muted-foreground font-mono">
                                {candidate?.nationalId ?? iv.candidateId.slice(0, 8)}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-sm text-white">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              {date}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {time}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            {typeIcon(iv.type)}
                            {typeLabel(iv.type)}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {iv.durationMinutes} min
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`font-medium border-0 capitalize ${statusStyle(iv.status)}`}>
                            {iv.status === "completed" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                            {statusLabel(iv.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" data-testid={`button-interview-actions-${iv.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
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
