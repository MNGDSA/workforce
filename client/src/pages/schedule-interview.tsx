import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  Loader2,
  CheckCircle2,
  Users,
  ArrowLeft,
  MapPin,
  Clock,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Applicant = {
  candidateId: string;
  applicationId: string;
  fullNameEn: string;
  nationalId: string | null;
  applicationStatus: string;
  appliedAt: string;
};
type SelectedCandidate = { fullNameEn: string; nationalId: string | null };
type Job = { id: string; title: string; status: string };

const scheduleSchema = z.object({
  groupName: z.string().min(2, "Group name is required"),
  date: z.string().min(1, "Date is required"),
  time: z.string().min(1, "Time is required"),
  venueName: z.string().min(2, "Venue name is required"),
  durationMinutes: z.coerce.number().min(15).max(480),
  googleLocation: z.string().min(1, "Google Maps link is required").url("Must be a valid URL"),
  notes: z.string().min(1, "SMS content is required"),
});
type ScheduleForm = z.infer<typeof scheduleSchema>;

const PAGE_SIZE = 25;

export default function ScheduleInterviewPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ─── Candidate selection ────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Map<string, SelectedCandidate>>(new Map());
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [candidateError, setCandidateError] = useState<string | null>(null);

  // ─── Pagination & search ────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const smsTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  // ─── Queries ────────────────────────────────────────────────────────────────
  const { data: activeJobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/jobs", "active"],
    queryFn: () => apiRequest("GET", "/api/jobs?status=active").then((r) => r.json()),
    staleTime: 0,
  });

  const { data: applicantsResult, isLoading: loadingApps } = useQuery<{
    data: Applicant[];
    total: number;
  }>({
    queryKey: ["/api/applications/applicants", selectedJobId, page, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({
        jobId: selectedJobId,
        page: String(page),
        limit: String(PAGE_SIZE),
      });
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

  // ─── Selection helpers ──────────────────────────────────────────────────────
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
      applicants.forEach((a) =>
        next.set(a.candidateId, { fullNameEn: a.fullNameEn, nationalId: a.nationalId })
      );
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

  const allPageSelected =
    applicants.length > 0 && applicants.every((a) => selected.has(a.candidateId));

  // ─── Form ───────────────────────────────────────────────────────────────────
  const form = useForm<ScheduleForm>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      groupName: "",
      date: new Date().toISOString().slice(0, 10),
      time: "09:00",
      venueName: "",
      durationMinutes: 30,
      googleLocation: "",
      notes: "",
    },
  });

  // ─── SMS template helpers (must come after useForm) ──────────────────────
  const watchedGroupName = useWatch({ control: form.control, name: "groupName" });
  const watchedDate      = useWatch({ control: form.control, name: "date" });
  const watchedTime      = useWatch({ control: form.control, name: "time" });
  const watchedVenue     = useWatch({ control: form.control, name: "venueName" });
  const watchedLocation  = useWatch({ control: form.control, name: "googleLocation" });
  const watchedNotes     = useWatch({ control: form.control, name: "notes" });

  const resolveTemplate = (template: string) =>
    template
      .replace(/\{\{batch\}\}/g, watchedGroupName || "{{batch}}")
      .replace(/\{\{date\}\}/g, watchedDate || "{{date}}")
      .replace(/\{\{time\}\}/g, watchedTime || "{{time}}")
      .replace(/\{\{venue\}\}/g, watchedVenue || "{{venue}}")
      .replace(/\{\{location\}\}/g, watchedLocation || "{{location}}");

  const insertVariable = (variable: string) => {
    const el = smsTextareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    const current = form.getValues("notes");
    const next = current.slice(0, start) + variable + current.slice(end);
    form.setValue("notes", next, { shouldValidate: true });
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + variable.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const schedule = useMutation({
    mutationFn: async (data: ScheduleForm) => {
      const code = "GRP-" + Math.random().toString(36).substring(2, 7).toUpperCase();
      const candidate = await apiRequest("POST", "/api/candidates", {
        candidateCode: code,
        fullNameEn: data.groupName,
      }).then((r) => r.json());

      // Resolve creator name from localStorage session
      let createdByName = "Admin";
      try {
        const session = JSON.parse(localStorage.getItem("workforce_candidate") ?? "{}");
        if (session?.fullName) createdByName = session.fullName;
        else if (session?.fullNameEn) createdByName = session.fullNameEn;
      } catch { /* ignore */ }

      const scheduledAt = new Date(`${data.date}T${data.time}:00`).toISOString();
      const invitedCandidateIds = Array.from(selected.keys());
      const payload: Record<string, unknown> = {
        candidateId: candidate.id,
        scheduledAt,
        durationMinutes: data.durationMinutes,
        type: data.venueName,
        groupName: data.groupName,
        invitedCandidateIds,
        createdByName,
      };
      payload.meetingUrl = data.googleLocation;
      payload.notes = data.notes.trim();

      return apiRequest("POST", "/api/interviews", payload).then((r) => r.json());
    },
    onSuccess: () => {
      toast({
        title: "Interview scheduled",
        description: `Session created with ${selected.size} candidate${selected.size !== 1 ? "s" : ""} invited.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/interviews/stats"] });
      navigate("/interviews");
    },
    onError: () => {
      toast({
        title: "Failed to schedule",
        description: "Please check the details and try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ScheduleForm) => {
    if (selected.size === 0) {
      setCandidateError("Select at least one candidate from the applicant list.");
      return;
    }
    schedule.mutate(data);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ── Page Header ─────────────────────────────────────── */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate("/interviews")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors"
            data-testid="button-back-interviews"
          >
            <ArrowLeft className="h-4 w-4" />
            Interview Calls
          </button>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm text-white font-medium">Schedule New Session</span>
        </div>

        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight flex items-center gap-3">
            <Calendar className="h-7 w-7 text-primary" />
            Schedule Interview Session
          </h1>
          <p className="text-muted-foreground mt-1">
            Define the session details and select candidates from an active job's applicant pool.
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

              {/* ══ LEFT — Session details (2/5 width) ═════════════════════════ */}
              <div className="lg:col-span-2 space-y-5">
                <Card className="bg-card border-border">
                  <CardContent className="pt-5 space-y-4">
                    <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-1">
                      Session Details
                    </p>

                    {/* Group / Batch Name */}
                    <FormField control={form.control} name="groupName" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                          Batch / Group Name
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Batch A – Makkah Region"
                            className="bg-muted/30 border-border"
                            data-testid="input-group-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* Date & Time */}
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="date" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                            Date
                          </FormLabel>
                          <FormControl>
                            <Input type="date" className="bg-muted/30 border-border" data-testid="input-date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="time" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                            Time
                          </FormLabel>
                          <FormControl>
                            <Input type="time" className="bg-muted/30 border-border" data-testid="input-time" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    {/* Venue & Duration */}
                    <FormField control={form.control} name="venueName" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1.5">
                          <MapPin className="h-3 w-3" /> Venue Name
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Riyadh Main Hall"
                            className="bg-muted/30 border-border"
                            data-testid="input-venue"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="durationMinutes" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1.5">
                          <Clock className="h-3 w-3" /> Duration per Candidate
                        </FormLabel>
                        <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                          <FormControl>
                            <SelectTrigger className="bg-muted/30 border-border" data-testid="select-duration">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="15">15 minutes</SelectItem>
                            <SelectItem value="20">20 minutes</SelectItem>
                            <SelectItem value="30">30 minutes</SelectItem>
                            <SelectItem value="45">45 minutes</SelectItem>
                            <SelectItem value="60">60 minutes</SelectItem>
                            <SelectItem value="90">90 minutes</SelectItem>
                            <SelectItem value="120">2 hours</SelectItem>
                            <SelectItem value="180">3 hours</SelectItem>
                            <SelectItem value="240">4 hours</SelectItem>
                            <SelectItem value="480">Full day (8h)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* Google Maps Link */}
                    <FormField control={form.control} name="googleLocation" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                          Google Maps Link
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://maps.google.com/…"
                            className="bg-muted/30 border-border"
                            data-testid="input-google-location"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* SMS Content */}
                    <FormField control={form.control} name="notes" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                          SMS Content
                        </FormLabel>

                        {/* Variable chips */}
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          {[
                            { label: "{{batch}}", title: "Batch / Group Name" },
                            { label: "{{date}}",  title: "Interview Date" },
                            { label: "{{time}}",  title: "Interview Time" },
                            { label: "{{venue}}", title: "Venue Name" },
                            { label: "{{location}}", title: "Google Maps Link" },
                          ].map(({ label, title }) => (
                            <button
                              key={label}
                              type="button"
                              title={title}
                              onClick={() => insertVariable(label)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors"
                              data-testid={`chip-var-${label.replace(/\{|\}/g, "")}`}
                            >
                              <Plus className="h-2.5 w-2.5" />
                              {label}
                            </button>
                          ))}
                        </div>

                        <FormControl>
                          <Textarea
                            placeholder={`e.g. Dear candidate, you are invited to interview for {{batch}}.\nVenue: {{venue}}\nDate: {{date}} at {{time}}\nLocation: {{location}}\nPlease bring your National ID.`}
                            className="bg-muted/30 border-border resize-none font-mono text-sm"
                            rows={5}
                            data-testid="input-sms-content"
                            {...field}
                            ref={(el) => {
                              field.ref(el);
                              smsTextareaRef.current = el;
                            }}
                          />
                        </FormControl>

                        {/* Live preview */}
                        {watchedNotes && (
                          <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 space-y-1">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60">
                              Preview — resolved message
                            </p>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
                              {resolveTemplate(watchedNotes)}
                            </p>
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Click a variable chip to insert it at the cursor. The message is sent via SMS to all invited candidates.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </CardContent>
                </Card>

                {/* ── Action Bar ─ */}
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 border-border"
                    onClick={() => navigate("/interviews")}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-primary text-primary-foreground font-bold"
                    disabled={schedule.isPending}
                    data-testid="button-submit-schedule"
                  >
                    {schedule.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Schedule Session
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* ══ RIGHT — Candidate Picker (3/5 width) ═══════════════════════ */}
              <div className="lg:col-span-3 space-y-4">
                <Card className="bg-card border-border">
                  <CardContent className="pt-5 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <p className={`text-xs uppercase tracking-widest font-bold flex items-center gap-2 ${candidateError ? "text-destructive" : "text-muted-foreground"}`}>
                        <Users className="h-3.5 w-3.5" />
                        Invited Candidates
                        <span className="text-destructive">*</span>
                        {selected.size > 0 && (
                          <span className="text-primary font-extrabold normal-case ml-1">
                            {selected.size.toLocaleString()} selected
                          </span>
                        )}
                      </p>
                      {selected.size > 0 && (
                        <button
                          type="button"
                          onClick={clearAll}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                          data-testid="button-clear-all"
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    {/* Selected chips */}
                    {selected.size > 0 && (
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 rounded-md bg-muted/10 border border-border">
                        {Array.from(selected.entries()).map(([id, c]) => (
                          <Badge
                            key={id}
                            variant="outline"
                            className="bg-primary/10 text-primary border-primary/30 text-xs gap-1 pr-1 cursor-pointer hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                            onClick={() =>
                              setSelected((prev) => {
                                const n = new Map(prev);
                                n.delete(id);
                                return n;
                              })
                            }
                            data-testid={`chip-invited-${id}`}
                          >
                            {c.fullNameEn}
                            <X className="h-2.5 w-2.5 opacity-60" />
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Job selector */}
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                        Filter by Job
                      </p>
                      <Select
                        value={selectedJobId || "none"}
                        onValueChange={(v) => handleJobSelect(v === "none" ? "" : v)}
                      >
                        <SelectTrigger
                          className={`bg-muted/30 ${candidateError && !selectedJobId ? "border-destructive" : "border-border"}`}
                          data-testid="select-job-applications"
                        >
                          <SelectValue placeholder="Select an active job to browse applicants…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select an active job to browse applicants…</SelectItem>
                          {activeJobs.map((job) => (
                            <SelectItem key={job.id} value={job.id}>
                              {job.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Search + bulk actions */}
                    {selectedJobId && (
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search by name or National ID…"
                            className="pl-10 bg-muted/30 border-border"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            data-testid="input-invite-search"
                          />
                        </div>
                        {applicants.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0 border-border text-xs font-semibold"
                            onClick={allPageSelected ? deselectAllOnPage : selectAllOnPage}
                            data-testid="button-select-page"
                          >
                            {allPageSelected ? "Deselect page" : "Select page"}
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Applicant list */}
                    <div
                      className={`rounded-md border divide-y divide-border overflow-hidden ${
                        candidateError && selected.size === 0 ? "border-destructive" : "border-border"
                      }`}
                    >
                      {!selectedJobId ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                          <Users className="h-10 w-10 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">
                            Select an active job above to browse its applicants
                          </p>
                        </div>
                      ) : loadingApps ? (
                        <div className="flex items-center justify-center py-16">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : applicants.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                          <Users className="h-8 w-8 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">
                            {total === 0 && !debouncedSearch
                              ? "No applicants for this job yet"
                              : "No matches — try a different search term"}
                          </p>
                        </div>
                      ) : (
                        applicants.map((a) => {
                          const isSelected = selected.has(a.candidateId);
                          const statusColor =
                            a.applicationStatus === "shortlisted"
                              ? "text-emerald-400"
                              : a.applicationStatus === "rejected"
                              ? "text-destructive"
                              : "text-muted-foreground";
                          return (
                            <div
                              key={a.candidateId}
                              className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors select-none ${
                                isSelected ? "bg-primary/10" : "hover:bg-muted/20"
                              }`}
                              onClick={() => toggleCandidate(a)}
                              data-testid={`row-invite-${a.candidateId}`}
                            >
                              {/* Checkbox */}
                              <div
                                className={`h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected
                                    ? "bg-primary border-primary"
                                    : "border-muted-foreground/40 bg-transparent"
                                }`}
                              >
                                {isSelected && (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-primary-foreground" />
                                )}
                              </div>
                              {/* Name */}
                              <div className="flex-1 min-w-0">
                                <span
                                  className={`text-sm font-semibold truncate block ${
                                    isSelected ? "text-primary" : "text-white"
                                  }`}
                                >
                                  {a.fullNameEn}
                                </span>
                                <span className={`text-xs ${statusColor} capitalize`}>
                                  {a.applicationStatus.replace(/_/g, " ")}
                                </span>
                              </div>
                              {/* National ID */}
                              <code className="text-xs text-muted-foreground font-mono shrink-0">
                                {a.nationalId ?? "—"}
                              </code>
                            </div>
                          );
                        })
                      )}

                      {/* Pagination footer */}
                      {selectedJobId && total > 0 && (
                        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/5">
                          <span className="text-xs text-muted-foreground">
                            Showing{" "}
                            <span className="font-semibold text-white">
                              {from.toLocaleString()}–{to.toLocaleString()}
                            </span>{" "}
                            of{" "}
                            <span className="font-semibold text-white">
                              {total.toLocaleString()}
                            </span>{" "}
                            applicants
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPage((p) => Math.max(1, p - 1))}
                              disabled={page === 1}
                              className="h-7 w-7 flex items-center justify-center rounded border border-border disabled:opacity-30 hover:bg-muted transition-colors"
                              data-testid="button-prev-page"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="text-xs text-muted-foreground min-w-16 text-center">
                              Page {page} of {totalPages}
                            </span>
                            <button
                              type="button"
                              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                              disabled={page === totalPages}
                              className="h-7 w-7 flex items-center justify-center rounded border border-border disabled:opacity-30 hover:bg-muted transition-colors"
                              data-testid="button-next-page"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Validation error */}
                    {candidateError && selected.size === 0 && (
                      <p className="text-sm text-destructive flex items-center gap-2">
                        <span>⚠</span> {candidateError}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </form>
        </Form>
      </div>
    </DashboardLayout>
  );
}
