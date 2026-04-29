import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { DatePickerField } from "@/components/ui/date-picker-field";
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
  Hash,
  AlertTriangle,
  Copy,
  Download,
  CheckSquare,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation, Trans } from "react-i18next";
import { formatNumber } from "@/lib/format";
import {
  parseSearchTokens,
  MAX_SEARCH_TOKENS,
  type CandidateSearchMeta,
} from "@shared/candidate-search";

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

const PAGE_SIZE = 200;

export default function ScheduleInterviewPage() {
  const { t, i18n } = useTranslation(["scheduleInterview"]);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const scheduleSchema = useMemo(() => z.object({
    groupName: z.string().min(2, t("scheduleInterview:validation.groupName")),
    date: z.string().min(1, t("scheduleInterview:validation.date")),
    time: z.string().min(1, t("scheduleInterview:validation.time")),
    venueName: z.string().min(2, t("scheduleInterview:validation.venueName")),
    durationMinutes: z.coerce.number().min(15).max(480),
    googleLocation: z.string().min(1, t("scheduleInterview:validation.googleLocation")).url(t("scheduleInterview:validation.googleLocationUrl")),
    notes: z.string().min(1, t("scheduleInterview:validation.notes")),
  }), [t]);
  type ScheduleForm = z.infer<typeof scheduleSchema>;

  const urlParams = new URLSearchParams(window.location.search);
  const preselectedId = urlParams.get("candidateId");
  const preselectedName = urlParams.get("candidateName");

  const [selected, setSelected] = useState<Map<string, SelectedCandidate>>(() => {
    if (preselectedId && preselectedName) {
      return new Map([[preselectedId, { fullNameEn: preselectedName, nationalId: null }]]);
    }
    return new Map();
  });
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [candidateError, setCandidateError] = useState<string | null>(null);

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

  const { data: activeJobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/jobs", "active"],
    queryFn: () => apiRequest("GET", "/api/jobs?status=active").then((r) => r.json()),
    staleTime: 0,
  });

  const { data: applicantsResult, isLoading: loadingApps } = useQuery<{
    data: Applicant[];
    total: number;
    searchMeta?: CandidateSearchMeta;
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

  // Task #224 — port the talent page's bulk-paste search to this
  // applicant picker. `liveParsedSearch` drives the in-input "Searching
  // N IDs" pill (immediate); `parsedSearch` is debounced and gates the
  // missing-IDs banner so it agrees with the server response.
  const parsedSearch = useMemo(() => parseSearchTokens(debouncedSearch), [debouncedSearch]);
  const liveParsedSearch = useMemo(() => parseSearchTokens(searchInput), [searchInput]);
  const searchMeta = applicantsResult?.searchMeta;

  // Single-line `<input>` strips newlines on paste, which would
  // collapse a pasted Excel column of IDs into one continuous string.
  // Intercept the paste, normalise CRLF/LF/tab to commas (which the
  // shared parser splits on) and inject the cleaned string at the
  // caret position. Pastes without those separators fall through.
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
    const next = input.value.slice(0, start) + normalized + input.value.slice(end);
    setSearchInput(next);
    setPage(1);
  }, []);

  const handleCopyMissingIds = useCallback(async () => {
    if (!searchMeta || searchMeta.missingIds.length === 0) return;
    try {
      await navigator.clipboard.writeText(searchMeta.missingIds.join("\n"));
      toast({
        title: t("scheduleInterview:multiSearch.copied", { n: formatNumber(searchMeta.missingIds.length, i18n.language) }),
      });
    } catch {
      toast({ title: t("scheduleInterview:multiSearch.copyFailed"), variant: "destructive" });
    }
  }, [searchMeta, toast, t, i18n.language]);

  const handleDownloadMissingIds = useCallback(() => {
    if (!searchMeta || searchMeta.missingIds.length === 0) return;
    const csv = "id\n" + searchMeta.missingIds.map((id) => `"${id.replace(/"/g, '""')}"`).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `missing_ids_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [searchMeta]);

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
      let createdByName = "Admin";
      try {
        const session = JSON.parse(localStorage.getItem("workforce_candidate") ?? "{}");
        if (session?.fullName) createdByName = session.fullName;
        else if (session?.fullNameEn) createdByName = session.fullNameEn;
      } catch { /* ignore */ }

      const scheduledAt = new Date(`${data.date}T${data.time}:00`).toISOString();
      const invitedCandidateIds = Array.from(selected.keys());
      const payload: Record<string, unknown> = {
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
        title: t("scheduleInterview:toast.scheduledTitle"),
        description: t("scheduleInterview:toast.scheduledDesc", { count: selected.size, replace: { count: formatNumber(selected.size, i18n.language) } }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/interviews/stats"] });
      navigate("/interviews");
    },
    onError: () => {
      toast({
        title: t("scheduleInterview:toast.failTitle"),
        description: t("scheduleInterview:toast.failDesc"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ScheduleForm) => {
    if (selected.size === 0) {
      setCandidateError(t("scheduleInterview:candidates.validationError"));
      return;
    }
    schedule.mutate(data);
  };

  const localizedStatus = (s: string) => t(`scheduleInterview:status.${s}`, { defaultValue: s.replace(/_/g, " ") });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate("/interviews")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors"
            data-testid="button-back-interviews"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t("scheduleInterview:back")}
          </button>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm text-white font-medium">{t("scheduleInterview:breadcrumb")}</span>
        </div>

        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight flex items-center gap-3">
            <Calendar className="h-7 w-7 text-primary" />
            {t("scheduleInterview:pageTitle")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("scheduleInterview:pageSubtitle")}
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

              <div className="lg:col-span-2 space-y-5">
                <Card className="bg-card border-border">
                  <CardContent className="pt-5 space-y-4">
                    <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-1">
                      {t("scheduleInterview:details.heading")}
                    </p>

                    <FormField control={form.control} name="groupName" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                          {t("scheduleInterview:details.groupName")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("scheduleInterview:details.groupNamePh")}
                            className="bg-muted/30 border-border"
                            data-testid="input-group-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="date" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                            {t("scheduleInterview:details.date")}
                          </FormLabel>
                          <FormControl>
                            <DatePickerField value={field.value} onChange={field.onChange} className="bg-muted/30 border-border" data-testid="input-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="time" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                            {t("scheduleInterview:details.time")}
                          </FormLabel>
                          <FormControl>
                            <Input type="time" dir="ltr" className="bg-muted/30 border-border" data-testid="input-time" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <FormField control={form.control} name="venueName" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1.5">
                          <MapPin className="h-3 w-3" /> {t("scheduleInterview:details.venue")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("scheduleInterview:details.venuePh")}
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
                          <Clock className="h-3 w-3" /> {t("scheduleInterview:details.duration")}
                        </FormLabel>
                        <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                          <FormControl>
                            <SelectTrigger className="bg-muted/30 border-border" data-testid="select-duration">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="15">{t("scheduleInterview:details.minutes", { n: formatNumber(15, i18n.language) })}</SelectItem>
                            <SelectItem value="20">{t("scheduleInterview:details.minutes", { n: formatNumber(20, i18n.language) })}</SelectItem>
                            <SelectItem value="30">{t("scheduleInterview:details.minutes", { n: formatNumber(30, i18n.language) })}</SelectItem>
                            <SelectItem value="45">{t("scheduleInterview:details.minutes", { n: formatNumber(45, i18n.language) })}</SelectItem>
                            <SelectItem value="60">{t("scheduleInterview:details.minutes", { n: formatNumber(60, i18n.language) })}</SelectItem>
                            <SelectItem value="90">{t("scheduleInterview:details.minutes", { n: formatNumber(90, i18n.language) })}</SelectItem>
                            <SelectItem value="120">{t("scheduleInterview:details.hours", { n: formatNumber(2, i18n.language) })}</SelectItem>
                            <SelectItem value="180">{t("scheduleInterview:details.hours", { n: formatNumber(3, i18n.language) })}</SelectItem>
                            <SelectItem value="240">{t("scheduleInterview:details.hours", { n: formatNumber(4, i18n.language) })}</SelectItem>
                            <SelectItem value="480">{t("scheduleInterview:details.fullDay")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="googleLocation" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                          {t("scheduleInterview:details.googleMaps")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("scheduleInterview:details.googleMapsPh")}
                            dir="ltr"
                            className="bg-muted/30 border-border"
                            data-testid="input-google-location"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="notes" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                          {t("scheduleInterview:details.smsContent")}
                        </FormLabel>

                        <div className="flex flex-wrap gap-1.5 mb-1">
                          {[
                            { label: "{{batch}}", titleKey: "batch" },
                            { label: "{{date}}",  titleKey: "date" },
                            { label: "{{time}}",  titleKey: "time" },
                            { label: "{{venue}}", titleKey: "venue" },
                            { label: "{{location}}", titleKey: "location" },
                          ].map(({ label, titleKey }) => (
                            <button
                              key={label}
                              type="button"
                              title={t(`scheduleInterview:vars.${titleKey}`)}
                              onClick={() => insertVariable(label)}
                              dir="ltr"
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
                            placeholder={t("scheduleInterview:details.smsPh")}
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

                        {watchedNotes && (
                          <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 space-y-1">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60">
                              {t("scheduleInterview:details.previewLabel")}
                            </p>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
                              {resolveTemplate(watchedNotes)}
                            </p>
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground/70 mt-1">
                          {t("scheduleInterview:details.smsHelp")}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 border-border"
                    onClick={() => navigate("/interviews")}
                    data-testid="button-cancel"
                  >
                    {t("scheduleInterview:buttons.cancel")}
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
                        <Plus className="me-2 h-4 w-4" />
                        {t("scheduleInterview:buttons.schedule")}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="lg:col-span-3 space-y-4">
                <Card className="bg-card border-border">
                  <CardContent className="pt-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className={`text-xs uppercase tracking-widest font-bold flex items-center gap-2 ${candidateError ? "text-destructive" : "text-muted-foreground"}`}>
                        <Users className="h-3.5 w-3.5" />
                        {t("scheduleInterview:candidates.title")}
                        <span className="text-destructive">*</span>
                        {selected.size > 0 && (
                          <span className="text-primary font-extrabold normal-case ms-1">
                            {t("scheduleInterview:candidates.selectedCount", { count: formatNumber(selected.size, i18n.language) })}
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
                          {t("scheduleInterview:candidates.clearAll")}
                        </button>
                      )}
                    </div>

                    {selected.size > 0 && (
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 rounded-md bg-muted/10 border border-border">
                        {Array.from(selected.entries()).map(([id, c]) => (
                          <Badge
                            key={id}
                            variant="outline"
                            className="bg-primary/10 text-primary border-primary/30 text-xs gap-1 pe-1 cursor-pointer hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                            onClick={() =>
                              setSelected((prev) => {
                                const n = new Map(prev);
                                n.delete(id);
                                return n;
                              })
                            }
                            data-testid={`chip-invited-${id}`}
                          >
                            <bdi>{c.fullNameEn}</bdi>
                            <X className="h-2.5 w-2.5 opacity-60" />
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                        {t("scheduleInterview:candidates.filterByJob")}
                      </p>
                      <Select
                        value={selectedJobId || "none"}
                        onValueChange={(v) => handleJobSelect(v === "none" ? "" : v)}
                      >
                        <SelectTrigger
                          className={`bg-muted/30 ${candidateError && !selectedJobId ? "border-destructive" : "border-border"}`}
                          data-testid="select-job-applications"
                        >
                          <SelectValue placeholder={t("scheduleInterview:candidates.selectJobPh")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("scheduleInterview:candidates.selectJobPh")}</SelectItem>
                          {activeJobs.map((job) => (
                            <SelectItem key={job.id} value={job.id}>
                              <bdi>{job.title}</bdi>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedJobId && (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="relative flex-1">
                            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder={t("scheduleInterview:candidates.search")}
                              className={`ps-10 bg-muted/30 border-border ${liveParsedSearch.isMulti ? "pe-44" : ""}`}
                              value={searchInput}
                              onChange={(e) => setSearchInput(e.target.value)}
                              onPaste={handleSearchPaste}
                              spellCheck={false}
                              autoComplete="off"
                              data-testid="input-invite-search"
                            />
                            {liveParsedSearch.isMulti && (
                              <div
                                className={`pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-medium whitespace-nowrap ${
                                  liveParsedSearch.truncated
                                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                    : "bg-primary/15 text-primary border border-primary/30"
                                }`}
                                data-testid="badge-search-token-count"
                                title={liveParsedSearch.truncated
                                  ? t("scheduleInterview:multiSearch.pillTruncatedTitle", { n: formatNumber(MAX_SEARCH_TOKENS, i18n.language) })
                                  : undefined}
                              >
                                <Hash className="h-3 w-3" />
                                {liveParsedSearch.truncated
                                  ? t("scheduleInterview:multiSearch.pillTruncated", { n: formatNumber(MAX_SEARCH_TOKENS, i18n.language) })
                                  : t("scheduleInterview:multiSearch.pill", { n: formatNumber(liveParsedSearch.tokens.length, i18n.language) })}
                              </div>
                            )}
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
                              {allPageSelected ? t("scheduleInterview:candidates.deselectPage") : t("scheduleInterview:candidates.selectPage")}
                            </Button>
                          )}
                        </div>

                        {/* Multi-ID search outcome banners (mirrors talent page #195).
                            Only render when 2+ identifiers were pasted. */}
                        {parsedSearch.isMulti && searchMeta && searchMeta.missingIds.length > 0 && (
                          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3" data-testid="panel-missing-ids">
                            <div className="flex items-start justify-between gap-3 flex-col sm:flex-row">
                              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-xs font-semibold text-amber-100" data-testid="text-missing-title">
                                    {t("scheduleInterview:multiSearch.missingTitle", { n: formatNumber(searchMeta.missingIds.length, i18n.language) })}
                                  </h3>
                                  <p className="text-[11px] text-amber-100/70 mt-0.5">
                                    {t("scheduleInterview:multiSearch.missingDesc")}
                                    {searchMeta.droppedFreeText > 0 && (
                                      <> {t("scheduleInterview:multiSearch.droppedFreeText", { n: formatNumber(searchMeta.droppedFreeText, i18n.language) })}</>
                                    )}
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-1 max-h-24 overflow-y-auto pe-1">
                                    {searchMeta.missingIds.map((id, idx) => (
                                      <span
                                        key={`${id}-${idx}`}
                                        className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono bg-amber-500/10 text-amber-50 border border-amber-500/20 rounded"
                                        dir="ltr"
                                        data-testid={`missing-id-${idx}`}
                                      >
                                        {id}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-2 shrink-0 self-end sm:self-start">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs border-amber-500/40 bg-transparent text-amber-100 hover:bg-amber-500/10 hover:text-amber-50"
                                  onClick={handleCopyMissingIds}
                                  data-testid="button-copy-missing-ids"
                                >
                                  <Copy className="me-1 h-3 w-3" />
                                  {t("scheduleInterview:multiSearch.copy")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs border-amber-500/40 bg-transparent text-amber-100 hover:bg-amber-500/10 hover:text-amber-50"
                                  onClick={handleDownloadMissingIds}
                                  data-testid="button-download-missing-ids"
                                >
                                  <Download className="me-1 h-3 w-3" />
                                  {t("scheduleInterview:multiSearch.download")}
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                        {parsedSearch.isMulti && searchMeta && searchMeta.missingIds.length === 0 && (
                          <div
                            className="flex items-center gap-2 text-xs px-3 py-2 rounded-sm bg-emerald-500/5 border border-emerald-500/30 text-emerald-300"
                            data-testid="status-all-matched"
                          >
                            <CheckSquare className="h-3.5 w-3.5" />
                            <span>
                              {t("scheduleInterview:multiSearch.allMatched", { n: formatNumber(searchMeta.tokenCount, i18n.language) })}
                              {searchMeta.droppedFreeText > 0 && (
                                <> · {t("scheduleInterview:multiSearch.droppedFreeText", { n: formatNumber(searchMeta.droppedFreeText, i18n.language) })}</>
                              )}
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    <div
                      className={`rounded-md border divide-y divide-border overflow-hidden ${
                        candidateError && selected.size === 0 ? "border-destructive" : "border-border"
                      }`}
                    >
                      {!selectedJobId ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                          <Users className="h-10 w-10 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">
                            {t("scheduleInterview:candidates.noJobYet")}
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
                              ? t("scheduleInterview:candidates.noApplicantsYet")
                              : t("scheduleInterview:candidates.noMatches")}
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
                              <div className="flex-1 min-w-0">
                                <span
                                  className={`text-sm font-semibold truncate block ${
                                    isSelected ? "text-primary" : "text-white"
                                  }`}
                                >
                                  <bdi>{a.fullNameEn}</bdi>
                                </span>
                                <span className={`text-xs ${statusColor} capitalize`}>
                                  {localizedStatus(a.applicationStatus)}
                                </span>
                              </div>
                              <code className="text-xs text-muted-foreground font-mono shrink-0" dir="ltr">
                                {a.nationalId ?? "—"}
                              </code>
                            </div>
                          );
                        })
                      )}

                      {selectedJobId && total > 0 && (
                        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/5">
                          <span className="text-xs text-muted-foreground">
                            <Trans
                              i18nKey="scheduleInterview:pager.showing"
                              values={{
                                from: formatNumber(from, i18n.language),
                                to: formatNumber(to, i18n.language),
                                total: formatNumber(total, i18n.language),
                              }}
                              components={{ strong: <strong className="text-white" /> }}
                            />
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPage((p) => Math.max(1, p - 1))}
                              disabled={page === 1}
                              className="h-7 w-7 flex items-center justify-center rounded border border-border disabled:opacity-30 hover:bg-muted transition-colors"
                              data-testid="button-prev-page"
                            >
                              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                            </button>
                            <span className="text-xs text-muted-foreground min-w-16 text-center">
                              {t("scheduleInterview:pager.page", { page: formatNumber(page, i18n.language), total: formatNumber(totalPages, i18n.language) })}
                            </span>
                            <button
                              type="button"
                              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                              disabled={page === totalPages}
                              className="h-7 w-7 flex items-center justify-center rounded border border-border disabled:opacity-30 hover:bg-muted transition-colors"
                              data-testid="button-next-page"
                            >
                              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

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
