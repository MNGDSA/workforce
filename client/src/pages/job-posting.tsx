import * as XLSX from "xlsx";
import DashboardLayout from "@/components/layout";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect, Fragment, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/lib/format";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Briefcase, Plus, Search, MapPin, Building, MoreHorizontal, Loader2, Users, X,
  FileDown, FileUp, ChevronRight, Calendar, UserCheck, Save, CheckCircle2, AlertTriangle, Filter,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { ar as arLocale } from "date-fns/locale";
import type { JobPosting } from "@shared/schema";
import { KSA_REGIONS } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const statusStyles: Record<string, string> = {
  active: "bg-green-500/10 text-green-500",
  draft: "bg-muted text-muted-foreground",
  closed: "bg-red-500/10 text-red-400",
  filled: "bg-blue-500/10 text-blue-400",
};

const appStatusStyle: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400",
  reviewing: "bg-amber-500/10 text-amber-400",
  shortlisted: "bg-primary/10 text-primary",
  interviewed: "bg-purple-500/10 text-purple-400",
  offered: "bg-cyan-500/10 text-cyan-400",
  hired: "bg-emerald-500/10 text-emerald-400",
  rejected: "bg-destructive/10 text-destructive",
  withdrawn: "bg-muted text-muted-foreground",
  closed: "bg-zinc-500/10 text-zinc-400",
};

const postJobSchema = z.object({
  title: z.string().min(3, "Job title is required"),
  eventId: z.string().min(1, "Event is required"),
  type: z.enum(["seasonal_full_time", "seasonal_part_time"]),
  location: z.string().optional(),
  region: z.string().optional(),
  salaryMin: z.coerce.number().optional(),
  salaryMax: z.coerce.number().optional(),
  deadline: z.string().optional(),
  description: z.string().optional(),
  requirements: z.string().optional(),
  status: z.enum(["draft", "active"]),
  questionSetId: z.string().optional(),
});

type PostJobForm = z.infer<typeof postJobSchema>;

function PostJobDialog({ open, onOpenChange, initialJob }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialJob?: JobPosting | null;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation(["jobPosting"]);
  const isEdit = !!initialJob;

  const { data: questionSets = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/question-sets"],
    queryFn: () => apiRequest("GET", "/api/question-sets").then(r => r.json()),
    enabled: open,
  });

  const { data: events = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/events"],
    queryFn: () => apiRequest("GET", "/api/events").then(r => r.json()),
    enabled: open,
  });

  const form = useForm<PostJobForm>({
    resolver: zodResolver(postJobSchema),
    defaultValues: { title: "", eventId: "", type: "seasonal_full_time", location: "", region: "", deadline: "", description: "", requirements: "", status: "active", questionSetId: "" },
  });

  useEffect(() => {
    if (open && initialJob) {
      form.reset({
        title: initialJob.title ?? "",
        eventId: initialJob.eventId ?? "",
        type: (initialJob.type === "seasonal_full_time" || initialJob.type === "seasonal_part_time") ? initialJob.type : "seasonal_full_time",
        location: initialJob.location ?? "",
        region: initialJob.region ?? "",
        deadline: initialJob.deadline ?? "",
        description: initialJob.description ?? "",
        requirements: initialJob.requirements ?? "",
        status: (initialJob.status === "draft" || initialJob.status === "active") ? initialJob.status : "active",
        questionSetId: initialJob.questionSetId ?? "",
        salaryMin: initialJob.salaryMin != null ? Number(initialJob.salaryMin) : undefined,
        salaryMax: initialJob.salaryMax != null ? Number(initialJob.salaryMax) : undefined,
      });
    } else if (open && !initialJob) {
      form.reset({ title: "", eventId: "", type: "seasonal_full_time", location: "", region: "", deadline: "", description: "", requirements: "", status: "active", questionSetId: "" });
    }
  }, [open, initialJob]);

  const postJob = useMutation({
    mutationFn: (data: PostJobForm) => {
      const payload: Record<string, unknown> = { ...data };
      if (!payload.deadline) delete payload.deadline;
      if (!payload.questionSetId) delete payload.questionSetId;
      if (payload.salaryMin != null && payload.salaryMin !== "") payload.salaryMin = String(payload.salaryMin); else delete payload.salaryMin;
      if (payload.salaryMax != null && payload.salaryMax !== "") payload.salaryMax = String(payload.salaryMax); else delete payload.salaryMax;
      if (isEdit) return apiRequest("PATCH", `/api/jobs/${initialJob!.id}`, payload).then(r => r.json());
      return apiRequest("POST", "/api/jobs", payload).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/stats"] });
      toast({ title: isEdit ? t("jobPosting:dialog.toastUpdated") : t("jobPosting:dialog.toastPosted") });
      form.reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: isEdit ? t("jobPosting:dialog.toastUpdateFail") : t("jobPosting:dialog.toastPostFail"), description: t("jobPosting:dialog.toastFailDesc"), variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            {isEdit ? t("jobPosting:dialog.edit") : t("jobPosting:dialog.post")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isEdit ? t("jobPosting:dialog.editingDesc", { title: initialJob?.title ?? "" }) : t("jobPosting:dialog.createDesc")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => postJob.mutate(d))} className="space-y-5 pt-1">

            <FormField control={form.control} name="eventId" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                  {t("jobPosting:dialog.event")} <span className="text-primary">*</span>
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-10 bg-muted/30 border-border focus:ring-primary/20 rounded-sm" data-testid="select-postjob-event">
                      <SelectValue placeholder={t("jobPosting:dialog.selectEvent")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {events.map(ev => <SelectItem key={ev.id} value={ev.id}><bdi>{ev.name}</bdi></SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                    {t("jobPosting:dialog.title")} <span className="text-primary">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder={t("jobPosting:dialog.titlePh")} className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm" data-testid="input-postjob-title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                    {t("jobPosting:dialog.type")} <span className="text-primary">*</span>
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10 bg-muted/30 border-border focus:ring-primary/20 rounded-sm" data-testid="select-postjob-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="seasonal_full_time">{t("jobPosting:jobType.seasonal_full_time")}</SelectItem>
                      <SelectItem value="seasonal_part_time">{t("jobPosting:jobType.seasonal_part_time")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="location" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("jobPosting:dialog.city")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("jobPosting:dialog.cityPh")} className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm" data-testid="input-postjob-location" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="region" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("jobPosting:dialog.region")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10 bg-muted/30 border-border focus:ring-primary/20 rounded-sm" data-testid="select-postjob-region">
                        <SelectValue placeholder={t("jobPosting:dialog.selectRegion")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {KSA_REGIONS.map(r => <SelectItem key={r} value={r}><bdi>{r}</bdi></SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="salaryMin" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("jobPosting:dialog.salaryMin")}</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} placeholder="3000" dir="ltr" className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm" data-testid="input-postjob-salary-min" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="salaryMax" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("jobPosting:dialog.salaryMax")}</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} placeholder="6000" dir="ltr" className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm" data-testid="input-postjob-salary-max" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="deadline" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("jobPosting:dialog.deadline")}</FormLabel>
                <FormControl>
                  <DatePickerField value={field.value} onChange={field.onChange} className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm" data-testid="input-postjob-deadline" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("jobPosting:dialog.description")}</FormLabel>
                <FormControl>
                  <Textarea placeholder={t("jobPosting:dialog.descriptionPh")} rows={3} className="bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm resize-none" data-testid="textarea-postjob-description" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="requirements" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("jobPosting:dialog.requirements")}</FormLabel>
                <FormControl>
                  <Textarea placeholder={t("jobPosting:dialog.requirementsPh")} rows={3} className="bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm resize-none" data-testid="textarea-postjob-requirements" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="questionSetId" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("jobPosting:dialog.questionSet")}</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                  value={field.value || "none"}
                >
                  <FormControl>
                    <SelectTrigger className="h-10 bg-muted/30 border-border focus:ring-primary/20 rounded-sm" data-testid="select-postjob-questionset">
                      <SelectValue placeholder={t("jobPosting:dialog.questionSetPh")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="none">{t("jobPosting:dialog.none")}</SelectItem>
                    {questionSets.map(qs => (
                      <SelectItem key={qs.id} value={qs.id}><bdi>{qs.name}</bdi></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter className="pt-1 flex gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground" data-testid="button-cancel-postjob">
                {t("jobPosting:dialog.cancel")}
              </Button>
              <div className="flex gap-2">
                <Button type="submit" variant="outline" disabled={postJob.isPending} onClick={() => form.setValue("status", "draft")} className="border-border bg-background hover:bg-muted" data-testid="button-postjob-draft">
                  {postJob.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("jobPosting:dialog.saveDraft")}
                </Button>
                <Button type="submit" disabled={postJob.isPending} onClick={() => form.setValue("status", "active")} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-wide text-xs rounded-sm" data-testid="button-postjob-publish">
                  {postJob.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? <><Save className="me-1.5 h-4 w-4" />{t("jobPosting:dialog.update")}</> : <><Plus className="me-1.5 h-4 w-4" />{t("jobPosting:dialog.post2")}</>}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

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
  photoUrl?: string | null;
};

type ExportQuestion = { id: string; text: string };

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

const VALID_STATUSES = ["new", "shortlisted", "interviewed", "offered", "hired", "rejected"] as const;
const BULK_FIXED_COLS = ["__app_id", "Candidate Name", "National ID", "Email", "Phone", "Current Status", "New Status"];

function exportToExcel(
  job: JobPosting,
  applications: Application[],
  candidates: CandidateInfo[],
  questions: ExportQuestion[] = [],
) {
  const candidateMap = Object.fromEntries(candidates.map((c) => [c.id, c]));
  const questionHeaders = questions.map((q, i) => `Q${i + 1}: ${q.text}`);
  const headers = [...BULK_FIXED_COLS, ...questionHeaders];

  const rows = applications.map((app) => {
    const c = candidateMap[app.candidateId];
    const answers = app.questionSetAnswers?.answers ?? {};
    return [
      app.id,
      c?.fullNameEn ?? "Unknown",
      c?.nationalId ?? "",
      c?.email ?? "",
      c?.phone ?? "",
      app.status,
      app.status,
      ...questions.map((q) => answers[q.id] ?? ""),
    ];
  });

  const instructionRow = [`# BULK STATUS UPDATE — Job: ${job.title} | Only edit the "New Status" column | Valid values: ${VALID_STATUSES.join(", ")} | Do NOT add/remove/reorder rows or columns`];
  const ws = XLSX.utils.aoa_to_sheet([instructionRow, headers, ...rows]);

  const colWidths = headers.map((h, i) => ({
    wch: Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length), 14),
  }));
  ws["!cols"] = colWidths;
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Applicants");
  XLSX.writeFile(wb, `applicants-${job.title.replace(/\s+/g, "-")}.xlsx`);
}

type ImportResult = { succeeded: number; failed: number; errors: string[] };

function ApplicantsSheet({
  job,
  open,
  onOpenChange,
}: {
  job: JobPosting | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [appSearch, setAppSearch] = useState("");
  const [appStatusFilter, setAppStatusFilter] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation(["jobPosting"]);
  const isAr = i18n.language.startsWith("ar");

  const { data: applications = [], isLoading } = useQuery<Application[]>({
    queryKey: ["/api/applications", job?.id],
    queryFn: () => apiRequest("GET", `/api/applications?jobId=${job!.id}`).then((r) => r.json()),
    enabled: !!job && open,
  });

  const candidateIds = applications.map(a => a.candidateId).filter(Boolean);
  const { data: candidates = [] } = useQuery<CandidateInfo[]>({
    queryKey: ["/api/candidates/by-ids", ...candidateIds],
    queryFn: async () => {
      if (candidateIds.length === 0) return [];
      const params = new URLSearchParams();
      candidateIds.forEach(id => params.append("ids", id));
      const json = await fetch(`/api/candidates/by-ids?${params.toString()}`, { credentials: "include" }).then(r => r.json());
      return Array.isArray(json) ? json : [];
    },
    enabled: !!job && open && applications.length > 0,
  });
  const candidateMap = Object.fromEntries(candidates.map((c) => [c.id, c]));

  const { data: questionSet } = useQuery<{ id: string; name: string; questions: ExportQuestion[] }>({
    queryKey: ["/api/question-sets", job?.questionSetId],
    queryFn: () => apiRequest("GET", `/api/question-sets/${job!.questionSetId}`).then((r) => r.json()),
    enabled: !!job?.questionSetId && open,
  });
  const questions: ExportQuestion[] = (questionSet?.questions ?? []) as ExportQuestion[];
  const hasQuestions = questions.length > 0;

  const filteredApplications = applications.filter(app => {
    const candidate = candidateMap[app.candidateId];
    const q = appSearch.trim().toLowerCase();
    const matchesSearch = !q
      || candidate?.fullNameEn?.toLowerCase().includes(q)
      || candidate?.nationalId?.includes(q)
      || candidate?.phone?.includes(q)
      || candidate?.email?.toLowerCase().includes(q);
    const matchesStatus = appStatusFilter === "all" || app.status === appStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const bulkUpdate = useMutation({
    mutationFn: (updates: { id: string; status: string }[]) =>
      apiRequest("POST", "/api/applications/bulk-status", { updates }).then((r) => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/applications", job?.id] });
      setImportResult({ succeeded: data.succeeded, failed: data.failed, errors: data.results.filter((r: { success: boolean }) => !r.success).map((r: { id: string }) => r.id) });
    },
    onError: () => toast({ title: t("jobPosting:applicants.toast.bulkFail"), variant: "destructive" }),
  });

  function handleImport(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "", range: 1 });

        const missing = BULK_FIXED_COLS.filter((col) => !(col in (rows[0] ?? {})));
        if (missing.length) {
          toast({ title: t("jobPosting:applicants.toast.formatErr"), description: t("jobPosting:applicants.toast.missingCols", { cols: missing.join(", ") }), variant: "destructive" });
          return;
        }

        if (rows.length !== applications.length) {
          toast({ title: t("jobPosting:applicants.toast.rowMismatch"), description: t("jobPosting:applicants.toast.rowMismatchDesc", { rows: formatNumber(rows.length, i18n.language), apps: formatNumber(applications.length, i18n.language) }), variant: "destructive" });
          return;
        }

        const knownIds = new Set(applications.map((a) => a.id));
        const unknownIds = rows.filter((r) => !knownIds.has(r["__app_id"])).map((r) => r["__app_id"]);
        if (unknownIds.length) {
          toast({ title: t("jobPosting:applicants.toast.unknownIds"), description: t("jobPosting:applicants.toast.unknownIdsDesc", { n: formatNumber(unknownIds.length, i18n.language) }), variant: "destructive" });
          return;
        }

        const invalid: string[] = [];
        const updates: { id: string; status: string }[] = [];
        for (const row of rows) {
          const newStatus = row["New Status"].trim().toLowerCase();
          if (!(VALID_STATUSES as readonly string[]).includes(newStatus)) {
            invalid.push(`"${row["Candidate Name"]}" → "${row["New Status"]}"`);
          } else if (newStatus !== row["Current Status"].trim().toLowerCase()) {
            updates.push({ id: row["__app_id"], status: newStatus });
          }
        }
        if (invalid.length) {
          const detail = `${invalid.slice(0, 3).join("; ")}${invalid.length > 3 ? ` (+${formatNumber(invalid.length - 3, i18n.language)} more)` : ""}`;
          toast({ title: t("jobPosting:applicants.toast.invalidStatus"), description: t("jobPosting:applicants.toast.invalidStatusDesc", { detail, valid: VALID_STATUSES.join(", ") }), variant: "destructive" });
          return;
        }
        if (updates.length === 0) {
          toast({ title: t("jobPosting:applicants.toast.noChanges"), description: t("jobPosting:applicants.toast.noChangesDesc") });
          return;
        }

        bulkUpdate.mutate(updates);
      } catch {
        toast({ title: t("jobPosting:applicants.toast.parseFail"), description: t("jobPosting:applicants.toast.parseFailDesc"), variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (!job) return null;

  const statusKeys = ["all", "new", "shortlisted", "interviewed", "offered", "hired", "rejected", "closed"];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isAr ? "left" : "right"} className="w-full sm:max-w-2xl bg-card border-border flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div>
            <SheetTitle className="font-display text-xl font-bold text-white"><bdi>{job.title}</bdi></SheetTitle>
            <div className="text-muted-foreground mt-1 flex items-center gap-3 flex-wrap text-sm">
              {job.region && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /><bdi>{job.region}</bdi></span>}
              <Badge variant="outline" className={`border-0 text-xs ${statusStyles[job.status] ?? "bg-muted text-muted-foreground"}`}>
                {t(`jobPosting:status.${job.status}`, { defaultValue: job.status })}
              </Badge>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 mt-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 text-sm">
                <UserCheck className="h-4 w-4 text-primary" />
                <span className="text-white font-bold" dir="ltr">{formatNumber(applications.length, i18n.language)}</span>
                <span className="text-muted-foreground">{t("jobPosting:applicants.applicants", { count: applications.length })}</span>
              </div>
              {applications.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {Object.entries(
                    applications.reduce<Record<string, number>>((acc, a) => {
                      acc[a.status] = (acc[a.status] ?? 0) + 1;
                      return acc;
                    }, {})
                  ).map(([status, count]) => (
                    <Badge key={status} variant="outline" className={`border-0 text-xs ${appStatusStyle[status] ?? "bg-muted text-muted-foreground"}`}>
                      <span dir="ltr">{formatNumber(count, i18n.language)}</span>{" "}{t(`jobPosting:appStatus.${status}`, { defaultValue: status })}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="border-border gap-1.5"
                onClick={() => exportToExcel(job, applications, candidates, questions)}
                disabled={applications.length === 0}
                data-testid="button-export-applicants"
              >
                <FileDown className="h-4 w-4" />
                {t("jobPosting:applicants.btnExport")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-primary/40 text-primary gap-1.5 hover:bg-primary/10"
                onClick={() => fileInputRef.current?.click()}
                disabled={applications.length === 0 || bulkUpdate.isPending}
                data-testid="button-import-applicants"
              >
                {bulkUpdate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                {t("jobPosting:applicants.btnImport")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }}
              />
            </div>
          </div>
        </SheetHeader>

        {importResult && (
          <div className={`mx-6 mt-4 p-3 rounded-sm border flex items-start gap-3 text-sm ${importResult.failed === 0 ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-amber-500/10 border-amber-500/30 text-amber-400"}`}>
            {importResult.failed === 0 ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
            <div className="flex-1">
              <span className="font-medium">{t("jobPosting:applicants.imp.succeeded", { count: importResult.succeeded, replace: { count: formatNumber(importResult.succeeded, i18n.language) } })}</span>
              {importResult.failed > 0 && <span className="ms-2">· {t("jobPosting:applicants.imp.failed", { count: importResult.failed, replace: { count: formatNumber(importResult.failed, i18n.language) } })}</span>}
              {importResult.errors.length > 0 && (
                <p className="text-xs mt-1 opacity-80" dir="ltr">{t("jobPosting:applicants.imp.errorIds", { ids: importResult.errors.slice(0, 5).join(", ") })}</p>
              )}
            </div>
            <button onClick={() => setImportResult(null)} className="text-muted-foreground hover:text-white"><X className="h-4 w-4" /></button>
          </div>
        )}

        {applications.length > 0 && (
          <div className="px-6 py-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={t("jobPosting:applicants.searchPh")}
                className="ps-9 h-8 text-xs bg-muted/30 border-border"
                value={appSearch}
                onChange={e => setAppSearch(e.target.value)}
                data-testid="input-applicant-search"
              />
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {statusKeys.map(s => {
                const count = s === "all" ? applications.length : applications.filter(a => a.status === s).length;
                return (
                  <button
                    key={s}
                    onClick={() => setAppStatusFilter(s)}
                    className={`px-2 py-0.5 rounded-sm text-xs font-medium transition-colors border ${
                      appStatusFilter === s
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-muted/20 border-border text-muted-foreground hover:border-primary/40"
                    }`}
                    data-testid={`filter-status-${s}`}
                  >
                    {t("jobPosting:applicants.filterCount", { label: t(`jobPosting:appStatus.${s}`), n: formatNumber(count, i18n.language) })}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : applications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground font-medium">{t("jobPosting:applicants.noApplicants")}</p>
              <p className="text-muted-foreground/60 text-sm mt-1">{t("jobPosting:applicants.noApplicantsHint")}</p>
            </div>
          ) : filteredApplications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">{t("jobPosting:applicants.noResults")}</p>
              <p className="text-muted-foreground/60 text-sm mt-1">{t("jobPosting:applicants.noResultsHint")}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-start">
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-start">{t("jobPosting:applicants.h.candidate")}</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell text-start">{t("jobPosting:applicants.h.contact")}</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-start">{t("jobPosting:applicants.h.status")}</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell text-start">{t("jobPosting:applicants.h.applied")}</th>
                  {hasQuestions && (
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-start">{t("jobPosting:applicants.h.answers")}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredApplications.map((app) => {
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
                                <bdi>{candidate?.fullNameEn ?? t("jobPosting:applicants.unknown")}</bdi>
                              </div>
                              <div className="text-xs text-muted-foreground font-mono" dir="ltr">{candidate?.nationalId ?? "—"}</div>
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
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`border-0 text-xs ${appStatusStyle[app.status] ?? "bg-muted text-muted-foreground"}`}>
                            {t(`jobPosting:appStatus.${app.status}`, { defaultValue: app.status })}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">
                          <div className="flex items-center gap-1" dir="ltr">
                            <Calendar className="h-3 w-3" />
                            {new Date(app.appliedAt).toLocaleDateString(isAr ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB")}
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
                                <ChevronRight className={`h-3 w-3 transition-transform rtl:rotate-180 ${isExpanded ? "rotate-90 rtl:rotate-90" : ""}`} />
                                {isExpanded ? t("jobPosting:applicants.hideAnswers") : t("jobPosting:applicants.viewAnswers")}
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                      {isExpanded && hasAnswers && (
                        <tr key={`${app.id}-answers`} className="bg-muted/5">
                          <td colSpan={hasQuestions ? 5 : 4} className="px-6 pb-4 pt-2">
                            <div className="border border-border rounded-md p-4 space-y-3 bg-muted/10">
                              <p className="text-xs text-primary font-semibold uppercase tracking-wider">
                                {t("jobPosting:applicants.screeningAnswers", { name: questionSet?.name ?? "" })}
                              </p>
                              <div className="space-y-2">
                                {questions.map((q, idx) => (
                                  <div key={q.id} className="flex items-start gap-3 text-sm">
                                    <span className="text-xs font-bold text-primary/60 mt-0.5 shrink-0 w-5 text-end" dir="ltr">{formatNumber(idx + 1, i18n.language)}.</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-muted-foreground text-xs"><bdi>{q.text}</bdi></p>
                                      <p className={`font-medium mt-0.5 ${answers[q.id] ? "text-white" : "text-muted-foreground/40 italic"}`}>
                                        <bdi>{answers[q.id] || t("jobPosting:applicants.noAnswer")}</bdi>
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
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function JobPostingPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation(["jobPosting"]);
  const isAr = i18n.language.startsWith("ar");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [postJobOpen, setPostJobOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobPosting | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: eventsList = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/events"],
    queryFn: () => apiRequest("GET", "/api/events").then(r => r.json()),
  });

  const { data: jobs = [], isLoading } = useQuery<JobPosting[]>({
    queryKey: ["/api/jobs", { eventId: eventFilter !== "all" ? eventFilter : undefined }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (eventFilter !== "all") params.set("eventId", eventFilter);
      return apiRequest("GET", `/api/jobs${params.toString() ? `?${params}` : ""}`).then(r => r.json());
    },
  });

  const { data: jobStats } = useQuery({
    queryKey: ["/api/jobs/stats"],
    queryFn: () => apiRequest("GET", "/api/jobs/stats").then(r => r.json()),
  });

  const updateJob = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/jobs/${id}`, { status }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/stats"] });
    },
  });

  const archiveJob = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/jobs/${id}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/stats"] });
    },
  });

  const stats = jobStats as { total: number; active: number; draft: number; filled: number } | undefined;

  const filtered = jobs.filter(j => {
    const matchSearch = !search || j.title.toLowerCase().includes(search.toLowerCase()) || (j.location ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || j.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">{t("jobPosting:page.title")}</h1>
            <p className="text-muted-foreground mt-1">{t("jobPosting:page.subtitle")}</p>
          </div>
          <Button
            onClick={() => setPostJobOpen(true)}
            className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs rounded-sm shadow-[0_0_20px_rgba(25,90,55,0.25)] hover:shadow-[0_0_30px_rgba(25,90,55,0.45)] transition-all"
            data-testid="button-post-job"
          >
            <Plus className="me-2 h-4 w-4" />
            {t("jobPosting:page.btnPost")}
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border shadow-sm border-s-4 border-s-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("jobPosting:stats.total")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-jobs" dir="ltr">{stats?.total != null ? formatNumber(stats.total, i18n.language) : "—"}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("jobPosting:stats.active")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-green-500" data-testid="stat-active-jobs" dir="ltr">{stats?.active != null ? formatNumber(stats.active, i18n.language) : "—"}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("jobPosting:stats.drafts")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-muted-foreground" data-testid="stat-draft-jobs" dir="ltr">{stats?.draft != null ? formatNumber(stats.draft, i18n.language) : "—"}</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col md:flex-row gap-3 items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder={t("jobPosting:filters.searchPh")}
              className="ps-10 h-10 bg-muted/30 border-border focus-visible:ring-primary/20"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-jobs"
            />
          </div>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-[180px] bg-muted/30 border-border" data-testid="select-event-filter-jobs">
              <SelectValue placeholder={t("jobPosting:filters.allEvents")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("jobPosting:filters.allEvents")}</SelectItem>
              {eventsList.map((evt) => (
                <SelectItem key={evt.id} value={evt.id}><bdi>{evt.name}</bdi></SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2 flex-wrap">
            {(["all", "active", "draft", "closed"] as const).map(s => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                className={`h-10 ${statusFilter === s ? "bg-primary text-primary-foreground" : "border-border bg-background"}`}
                onClick={() => setStatusFilter(s)}
                data-testid={`filter-status-${s}`}
              >
                {t(`jobPosting:filters.${s}`)}
              </Button>
            ))}
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base font-display text-white">
              {t("jobPosting:table.applications")}
              {filtered.length > 0 && <span className="text-muted-foreground font-normal text-sm ms-2" dir="ltr">{t("jobPosting:table.count", { n: formatNumber(filtered.length, i18n.language) })}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Briefcase className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">{t("jobPosting:table.empty")}</p>
                <p className="text-muted-foreground/60 text-sm mt-1">{t("jobPosting:table.emptyHint")}</p>
                <Button
                  onClick={() => setPostJobOpen(true)}
                  className="mt-4 h-9 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wide rounded-sm"
                  data-testid="button-create-first-job"
                >
                  <Plus className="me-1.5 h-3.5 w-3.5" />
                  {t("jobPosting:table.createFirst")}
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">{t("jobPosting:table.h.title")}</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">{t("jobPosting:table.h.location")}</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">{t("jobPosting:table.h.type")}</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">{t("jobPosting:table.h.salary")}</TableHead>
                    <TableHead className="text-muted-foreground">{t("jobPosting:table.h.status")}</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">{t("jobPosting:table.h.posted")}</TableHead>
                    <TableHead className="text-end text-muted-foreground">{t("jobPosting:table.h.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((job) => (
                    <TableRow
                      key={job.id}
                      className="border-border hover:bg-muted/20 cursor-pointer"
                      data-testid={`row-job-${job.id}`}
                      onClick={() => setLocation(`/job-posting/${job.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-white"><bdi>{job.title}</bdi></div>
                            {job.department && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                <Building className="h-3 w-3" />
                                <bdi>{job.department}</bdi> · {t(`jobPosting:jobType.${job.type}`, { defaultValue: job.type })}
                              </div>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 ms-1 rtl:rotate-180" />
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {job.location && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            <bdi>{job.location}</bdi>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge
                          variant="outline"
                          className="border-0 text-xs font-medium bg-primary/10 text-primary"
                          data-testid={`type-job-${job.id}`}
                        >
                          {job.type === "seasonal_part_time" ? t("jobPosting:jobType.seasonalPTShort") : t("jobPosting:jobType.seasonalFTShort")}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {job.salaryMin && job.salaryMax ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground" dir="ltr">
                            {t("jobPosting:table.salaryRange", {
                              min: formatNumber(Number(job.salaryMin), i18n.language),
                              max: formatNumber(Number(job.salaryMax), i18n.language),
                            })}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`font-medium border-0 text-xs ${statusStyles[job.status] ?? "bg-muted text-muted-foreground"}`}
                          data-testid={`status-job-${job.id}`}
                        >
                          {t(`jobPosting:status.${job.status}`, { defaultValue: job.status })}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true, locale: isAr ? arLocale : undefined })}
                      </TableCell>
                      <TableCell className="text-end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" data-testid={`button-job-actions-${job.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => setLocation(`/job-posting/${job.id}`)}>
                              {t("jobPosting:actions.viewApplicants")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setEditingJob(job); setPostJobOpen(true); }}>
                              {t("jobPosting:actions.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {job.status === "draft" && (
                              <DropdownMenuItem onClick={() => updateJob.mutate({ id: job.id, status: "active" })}>
                                {t("jobPosting:actions.publish")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => archiveJob.mutate(job.id)}
                            >
                              {t("jobPosting:actions.archive")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <PostJobDialog
        open={postJobOpen}
        onOpenChange={(v) => { setPostJobOpen(v); if (!v) setEditingJob(null); }}
        initialJob={editingJob}
      />
      <ApplicantsSheet job={selectedJob} open={sheetOpen} onOpenChange={setSheetOpen} />
    </DashboardLayout>
  );
}
