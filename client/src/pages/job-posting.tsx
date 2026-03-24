import * as XLSX from "xlsx";
import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Briefcase,
  Plus,
  Search,
  MapPin,
  Building,
  MoreHorizontal,
  Loader2,
  Users,
  DollarSign,
  X,
  FileDown,
  FileUp,
  ChevronRight,
  Calendar,
  UserCheck,
  Save,
  CheckCircle2,
  XCircle,
  Star,
  AlertTriangle,
} from "lucide-react";
import { useRef } from "react";
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
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import type { JobPosting, Season } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// ─── Status styles ─────────────────────────────────────────────────────────
const statusStyles: Record<string, string> = {
  active: "bg-green-500/10 text-green-500",
  draft: "bg-muted text-muted-foreground",
  closed: "bg-red-500/10 text-red-400",
  filled: "bg-blue-500/10 text-blue-400",
};

const statusLabel: Record<string, string> = {
  active: "Active",
  draft: "Draft",
  closed: "Ended",
  filled: "Filled",
};

const SAUDI_REGIONS = [
  "Riyadh", "Makkah", "Eastern Province", "Madinah", "Qassim",
  "Asir", "Tabuk", "Hail", "Northern Borders", "Jazan", "Najran", "Bahah", "Jouf",
];

// ─── Create Job Form Schema ─────────────────────────────────────────────────
const createJobSchema = z.object({
  title: z.string().min(3, "Job title is required"),
  department: z.string().optional(),
  type: z.enum(["full_time", "part_time"]),
  location: z.string().optional(),
  region: z.string().optional(),
  salaryMin: z.coerce.number().optional(),
  salaryMax: z.coerce.number().optional(),
  deadline: z.string().optional(),
  status: z.enum(["draft", "active"]),
  description: z.string().optional(),
  requirements: z.string().optional(),
  seasonId: z.string().optional(),
  questionSetId: z.string().optional(),
});

type CreateJobForm = z.infer<typeof createJobSchema>;

// ─── Create Job Dialog ──────────────────────────────────────────────────────
function CreateJobDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: seasons = [] } = useQuery<Season[]>({
    queryKey: ["/api/seasons"],
    queryFn: () => apiRequest("GET", "/api/seasons").then(r => r.json()),
    enabled: open,
  });

  const { data: questionSets = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/question-sets"],
    queryFn: () => apiRequest("GET", "/api/question-sets").then(r => r.json()),
    enabled: open,
  });

  const form = useForm<CreateJobForm>({
    resolver: zodResolver(createJobSchema),
    defaultValues: {
      title: "",
      department: "",
      type: "full_time",
      location: "",
      region: "",
      salaryMin: undefined,
      salaryMax: undefined,
      deadline: "",
      status: "draft",
      description: "",
      requirements: "",
      seasonId: "",
      questionSetId: "",
    },
  });

  const createJob = useMutation({
    mutationFn: (data: CreateJobForm) => {
      const payload: Record<string, unknown> = { ...data, type: "seasonal" };
      if (!payload.seasonId) delete payload.seasonId;
      if (!payload.deadline) delete payload.deadline;
      if (!payload.questionSetId) delete payload.questionSetId;
      if (payload.salaryMin != null && payload.salaryMin !== "") {
        payload.salaryMin = String(payload.salaryMin);
      } else {
        delete payload.salaryMin;
      }
      if (payload.salaryMax != null && payload.salaryMax !== "") {
        payload.salaryMax = String(payload.salaryMax);
      } else {
        delete payload.salaryMax;
      }
      return apiRequest("POST", "/api/jobs", payload).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/stats"] });
      toast({ title: "Job published successfully" });
      form.reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to create job", description: "Please check all required fields and try again.", variant: "destructive" });
    },
  });

  function onSubmit(values: CreateJobForm) {
    createJob.mutate(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Create Consolidated App
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Fill in the details below. Save as draft or publish immediately.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            {/* ── Core Info ── */}
            <div className="space-y-4">
              <div className="w-full h-px bg-border" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Basic Info</p>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                        Application Title <span className="text-primary">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Crowd Control Officer"
                          className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm"
                          data-testid="input-job-title"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />


                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Job Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10 bg-muted/30 border-border focus:ring-primary/20 rounded-sm" data-testid="select-job-type">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="full_time">Full Time</SelectItem>
                          <SelectItem value="part_time">Part Time</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* ── Location & Season ── */}
            <div className="space-y-4">
              <div className="w-full h-px bg-border" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Location & Season</p>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">City / Location</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Makkah"
                          className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm"
                          data-testid="input-job-location"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="region"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Region</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10 bg-muted/30 border-border focus:ring-primary/20 rounded-sm" data-testid="select-job-region">
                            <SelectValue placeholder="Select region" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SAUDI_REGIONS.map(r => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="seasonId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Hiring Season</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10 bg-muted/30 border-border focus:ring-primary/20 rounded-sm" data-testid="select-job-season">
                            <SelectValue placeholder="Select season" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {seasons.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Application Deadline</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm"
                          data-testid="input-job-deadline"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* ── Openings & Salary ── */}
            <div className="space-y-4">
              <div className="w-full h-px bg-border" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Compensation</p>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="salaryMin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Min Salary (SAR)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          placeholder="e.g. 3000"
                          className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm"
                          data-testid="input-salary-min"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="salaryMax"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Max Salary (SAR)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          placeholder="e.g. 5000"
                          className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm"
                          data-testid="input-salary-max"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* ── Description & Requirements ── */}
            <div className="space-y-4">
              <div className="w-full h-px bg-border" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Details</p>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Job Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the role, responsibilities, and work environment..."
                        rows={4}
                        className="bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm resize-none"
                        data-testid="textarea-job-description"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requirements"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Requirements</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="List candidate requirements, qualifications, and skills..."
                        rows={3}
                        className="bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm resize-none"
                        data-testid="textarea-job-requirements"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="questionSetId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Screening Question Set</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                      value={field.value || "none"}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10 bg-muted/30 border-border focus:ring-primary/20 rounded-sm" data-testid="select-job-questionset">
                          <SelectValue placeholder="None (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="none">None</SelectItem>
                        {questionSets.map(qs => (
                          <SelectItem key={qs.id} value={qs.id}>{qs.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Footer ── */}
            <DialogFooter className="pt-2 flex gap-2 sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-muted-foreground"
                data-testid="button-cancel-job"
              >
                Cancel
              </Button>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="outline"
                  disabled={createJob.isPending}
                  onClick={() => form.setValue("status", "draft")}
                  className="border-border bg-background hover:bg-muted"
                  data-testid="button-save-draft"
                >
                  {createJob.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save as Draft"}
                </Button>

                <Button
                  type="submit"
                  disabled={createJob.isPending}
                  onClick={() => form.setValue("status", "active")}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-wide text-xs rounded-sm"
                  data-testid="button-publish-job"
                >
                  {createJob.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="mr-1.5 h-4 w-4" />
                      Publish
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Post Job Dialog (single posting) ───────────────────────────────────────
const postJobSchema = z.object({
  title: z.string().min(3, "Job title is required"),
  type: z.enum(["full_time", "part_time"]),
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
  const isEdit = !!initialJob;

  const { data: questionSets = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/question-sets"],
    queryFn: () => apiRequest("GET", "/api/question-sets").then(r => r.json()),
    enabled: open,
  });

  const form = useForm<PostJobForm>({
    resolver: zodResolver(postJobSchema),
    defaultValues: { title: "", type: "full_time", location: "", region: "", deadline: "", description: "", requirements: "", status: "active", questionSetId: "" },
  });

  // Pre-fill form when editing an existing job
  useEffect(() => {
    if (open && initialJob) {
      form.reset({
        title:       initialJob.title ?? "",
        type:        (initialJob.type === "full_time" || initialJob.type === "part_time") ? initialJob.type : "full_time",
        location:    initialJob.location ?? "",
        region:      initialJob.region ?? "",
        deadline:    initialJob.deadline ?? "",
        description: initialJob.description ?? "",
        requirements:initialJob.requirements ?? "",
        status:      (initialJob.status === "draft" || initialJob.status === "active") ? initialJob.status : "active",
        questionSetId: initialJob.questionSetId ?? "",
        salaryMin:   initialJob.salaryMin != null ? Number(initialJob.salaryMin) : undefined,
        salaryMax:   initialJob.salaryMax != null ? Number(initialJob.salaryMax) : undefined,
      });
    } else if (open && !initialJob) {
      form.reset({ title: "", type: "full_time", location: "", region: "", deadline: "", description: "", requirements: "", status: "active", questionSetId: "" });
    }
  }, [open, initialJob]);

  const postJob = useMutation({
    mutationFn: (data: PostJobForm) => {
      const payload: Record<string, unknown> = { ...data };
      if (!payload.deadline) delete payload.deadline;
      if (!payload.questionSetId) delete payload.questionSetId;
      if (payload.salaryMin != null && payload.salaryMin !== "") {
        payload.salaryMin = String(payload.salaryMin);
      } else {
        delete payload.salaryMin;
      }
      if (payload.salaryMax != null && payload.salaryMax !== "") {
        payload.salaryMax = String(payload.salaryMax);
      } else {
        delete payload.salaryMax;
      }
      if (isEdit) {
        return apiRequest("PATCH", `/api/jobs/${initialJob!.id}`, payload).then(r => r.json());
      }
      return apiRequest("POST", "/api/jobs", payload).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/stats"] });
      toast({ title: isEdit ? "Job updated successfully" : "Job posted successfully" });
      form.reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: isEdit ? "Failed to update job" : "Failed to post job", description: "Please check all required fields and try again.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-amber-400" />
            {isEdit ? "Edit Job" : "Post a Job"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isEdit ? `Editing: ${initialJob?.title}` : "Create a single standalone job posting."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => postJob.mutate(d))} className="space-y-5 pt-1">

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                    Job Title <span className="text-primary">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Security Guard" className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm" data-testid="input-postjob-title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                    Job Type <span className="text-primary">*</span>
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10 bg-muted/30 border-border focus:ring-primary/20 rounded-sm" data-testid="select-postjob-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="full_time">Full Time</SelectItem>
                      <SelectItem value="part_time">Part Time</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="location" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">City / Location</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Riyadh" className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm" data-testid="input-postjob-location" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="region" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Region</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10 bg-muted/30 border-border focus:ring-primary/20 rounded-sm" data-testid="select-postjob-region">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SAUDI_REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="salaryMin" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Min (SAR)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} placeholder="3000" className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm" data-testid="input-postjob-salary-min" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="salaryMax" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Max (SAR)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} placeholder="6000" className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm" data-testid="input-postjob-salary-max" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="deadline" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Application Deadline</FormLabel>
                <FormControl>
                  <Input type="date" className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm" data-testid="input-postjob-deadline" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Description</FormLabel>
                <FormControl>
                  <Textarea placeholder="Describe the role and responsibilities..." rows={3} className="bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm resize-none" data-testid="textarea-postjob-description" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="requirements" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Requirements</FormLabel>
                <FormControl>
                  <Textarea placeholder="List qualifications, experience, and skills required..." rows={3} className="bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm resize-none" data-testid="textarea-postjob-requirements" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="questionSetId" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Screening Question Set</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                  value={field.value || "none"}
                >
                  <FormControl>
                    <SelectTrigger className="h-10 bg-muted/30 border-border focus:ring-primary/20 rounded-sm" data-testid="select-postjob-questionset">
                      <SelectValue placeholder="None (optional)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="none">None</SelectItem>
                    {questionSets.map(qs => (
                      <SelectItem key={qs.id} value={qs.id}>{qs.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter className="pt-1 flex gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground" data-testid="button-cancel-postjob">
                Cancel
              </Button>
              <div className="flex gap-2">
                <Button type="submit" variant="outline" disabled={postJob.isPending} onClick={() => form.setValue("status", "draft")} className="border-border bg-background hover:bg-muted" data-testid="button-postjob-draft">
                  {postJob.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save as Draft"}
                </Button>
                <Button type="submit" disabled={postJob.isPending} onClick={() => form.setValue("status", "active")} className="bg-amber-500 hover:bg-amber-500/90 text-white font-bold uppercase tracking-wide text-xs rounded-sm" data-testid="button-postjob-publish">
                  {postJob.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? <><Save className="mr-1.5 h-4 w-4" />Update Job</> : <><Plus className="mr-1.5 h-4 w-4" />Post Job</>}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Applicants Sheet ────────────────────────────────────────────────────────
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
};

type ExportQuestion = { id: string; text: string };

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

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

const VALID_STATUSES = ["new", "shortlisted", "interviewed", "hired", "rejected"] as const;
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
      app.id,                                                                   // __app_id
      c?.fullNameEn ?? "Unknown",
      c?.nationalId ?? "",
      c?.email ?? "",
      c?.phone ?? "",
      app.status,                                                               // Current Status (read-only)
      app.status,                                                               // New Status (editable)
      ...questions.map((q) => answers[q.id] ?? ""),
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Lock all columns except New Status (col index 6) by styling
  const colWidths = headers.map((h, i) => ({
    wch: Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length), 14),
  }));
  ws["!cols"] = colWidths;

  // Add a note row at top explaining the format
  XLSX.utils.sheet_add_aoa(ws, [
    [`# BULK STATUS UPDATE — Job: ${job.title} | Only edit the "New Status" column | Valid values: ${VALID_STATUSES.join(", ")} | Do NOT add/remove/reorder rows or columns`],
  ], { origin: "A1", sheetRows: 1 });
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: applications = [], isLoading } = useQuery<Application[]>({
    queryKey: ["/api/applications", job?.id],
    queryFn: () => apiRequest("GET", `/api/applications?jobId=${job!.id}`).then((r) => r.json()),
    enabled: !!job && open,
  });

  const { data: candidates = [] } = useQuery<CandidateInfo[]>({
    queryKey: ["/api/candidates/list"],
    queryFn: async () => {
      const json = await apiRequest("GET", "/api/candidates?limit=100").then((r) => r.json());
      return Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    },
    enabled: !!job && open,
  });
  const candidateMap = Object.fromEntries(candidates.map((c) => [c.id, c]));

  // Fetch question set for this job (to get question texts for export + display)
  const { data: questionSet } = useQuery<{ id: string; name: string; questions: ExportQuestion[] }>({
    queryKey: ["/api/question-sets", job?.questionSetId],
    queryFn: () => apiRequest("GET", `/api/question-sets/${job!.questionSetId}`).then((r) => r.json()),
    enabled: !!job?.questionSetId && open,
  });
  const questions: ExportQuestion[] = (questionSet?.questions ?? []) as ExportQuestion[];
  const hasQuestions = questions.length > 0;

  // ── Single-row status mutation ────────────────────────────────────────────
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/applications/${id}`, { status }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/applications", job?.id] }),
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  // ── Bulk status mutation ──────────────────────────────────────────────────
  const bulkUpdate = useMutation({
    mutationFn: (updates: { id: string; status: string }[]) =>
      apiRequest("POST", "/api/applications/bulk-status", { updates }).then((r) => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/applications", job?.id] });
      setImportResult({ succeeded: data.succeeded, failed: data.failed, errors: data.results.filter((r: { success: boolean }) => !r.success).map((r: { id: string }) => r.id) });
    },
    onError: () => toast({ title: "Bulk update failed", variant: "destructive" }),
  });

  // ── Excel import handler ──────────────────────────────────────────────────
  function handleImport(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });

        // Validate columns
        const missing = BULK_FIXED_COLS.filter((col) => !(col in (rows[0] ?? {})));
        if (missing.length) {
          toast({ title: "Format error", description: `Missing columns: ${missing.join(", ")}`, variant: "destructive" });
          return;
        }

        // Validate row count matches current applications
        if (rows.length !== applications.length) {
          toast({ title: "Row count mismatch", description: `File has ${rows.length} data rows but job has ${applications.length} applications. Do not add or remove rows.`, variant: "destructive" });
          return;
        }

        // Validate app IDs all exist
        const knownIds = new Set(applications.map((a) => a.id));
        const unknownIds = rows.filter((r) => !knownIds.has(r["__app_id"])).map((r) => r["__app_id"]);
        if (unknownIds.length) {
          toast({ title: "Unknown Application IDs", description: `${unknownIds.length} row(s) have IDs not found in this job. Do not edit the __app_id column.`, variant: "destructive" });
          return;
        }

        // Validate status values and collect changes
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
          toast({ title: "Invalid status values", description: `${invalid.slice(0, 3).join("; ")}${invalid.length > 3 ? ` (+${invalid.length - 3} more)` : ""}. Valid: ${VALID_STATUSES.join(", ")}`, variant: "destructive" });
          return;
        }
        if (updates.length === 0) {
          toast({ title: "No changes detected", description: "The New Status column matches Current Status for all rows." });
          return;
        }

        bulkUpdate.mutate(updates);
      } catch {
        toast({ title: "Failed to parse file", description: "Ensure the file is a valid .xlsx exported from this system.", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (!job) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl bg-card border-border flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div>
            <SheetTitle className="font-display text-xl font-bold text-white">{job.title}</SheetTitle>
            <div className="text-muted-foreground mt-1 flex items-center gap-3 flex-wrap text-sm">
              {job.region && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.region}</span>}
              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{job.openings} openings</span>
              <Badge variant="outline" className={`border-0 text-xs ${statusStyles[job.status] ?? "bg-muted text-muted-foreground"}`}>
                {statusLabel[job.status] ?? job.status}
              </Badge>
            </div>
          </div>

          {/* Summary bar */}
          <div className="flex items-center justify-between gap-4 mt-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 text-sm">
                <UserCheck className="h-4 w-4 text-primary" />
                <span className="text-white font-bold">{applications.length}</span>
                <span className="text-muted-foreground">applicant{applications.length !== 1 ? "s" : ""}</span>
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
                      {count} {status}
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
                Export
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
                Import
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

        {/* Import result banner */}
        {importResult && (
          <div className={`mx-6 mt-4 p-3 rounded-sm border flex items-start gap-3 text-sm ${importResult.failed === 0 ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-amber-500/10 border-amber-500/30 text-amber-400"}`}>
            {importResult.failed === 0 ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
            <div className="flex-1">
              <span className="font-medium">{importResult.succeeded} status{importResult.succeeded !== 1 ? "es" : ""} updated successfully</span>
              {importResult.failed > 0 && <span className="ml-2 text-destructive">{importResult.failed} failed</span>}
            </div>
            <button onClick={() => setImportResult(null)} className="hover:opacity-70"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : applications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground font-medium">No applicants yet</p>
              <p className="text-muted-foreground/60 text-sm mt-1">Applications submitted via the candidate portal will appear here</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Candidate</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Contact</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Applied</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                  {hasQuestions && (
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Answers</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {applications.map((app) => {
                  const candidate = candidateMap[app.candidateId];
                  const answers = app.questionSetAnswers?.answers ?? {};
                  const hasAnswers = Object.keys(answers).length > 0;
                  const isExpanded = expandedRow === app.id;
                  return (
                    <>
                      <tr key={app.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-applicant-${app.id}`}>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 border border-border shrink-0">
                              <AvatarFallback className="bg-primary/20 text-primary text-xs">
                                {candidate ? initials(candidate.fullNameEn) : "?"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-white truncate">
                                {candidate?.fullNameEn ?? "Unknown Candidate"}
                              </div>
                              <div className="text-xs text-muted-foreground font-mono">{candidate?.nationalId ?? "—"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            {candidate?.email && <div>{candidate.email}</div>}
                            {candidate?.phone && <div>{candidate.phone}</div>}
                            {!candidate?.email && !candidate?.phone && <span>—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`border-0 text-xs capitalize ${appStatusStyle[app.status] ?? "bg-muted text-muted-foreground"}`}>
                            {app.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(app.appliedAt).toLocaleDateString("en-SA")}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {app.status !== "shortlisted" && app.status !== "hired" && app.status !== "rejected" && (
                              <button
                                onClick={() => updateStatus.mutate({ id: app.id, status: "shortlisted" })}
                                disabled={updateStatus.isPending}
                                title="Shortlist"
                                className="p-1.5 rounded-sm text-blue-400 hover:bg-blue-500/15 transition-colors"
                                data-testid={`button-shortlist-${app.id}`}
                              >
                                <Star className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {(app.status === "shortlisted" || app.status === "interviewed") && (
                              <button
                                onClick={() => updateStatus.mutate({ id: app.id, status: "hired" })}
                                disabled={updateStatus.isPending}
                                title="Mark as Hired"
                                className="p-1.5 rounded-sm text-emerald-400 hover:bg-emerald-500/15 transition-colors"
                                data-testid={`button-hire-${app.id}`}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {app.status !== "rejected" && app.status !== "hired" && (
                              <button
                                onClick={() => updateStatus.mutate({ id: app.id, status: "rejected" })}
                                disabled={updateStatus.isPending}
                                title="Not Shortlisted"
                                className="p-1.5 rounded-sm text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors"
                                data-testid={`button-reject-${app.id}`}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {(app.status === "hired" || app.status === "rejected") && (
                              <span className="text-xs text-muted-foreground/40 italic">Final</span>
                            )}
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
                                {isExpanded ? "Hide" : "View"}
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
                                Screening Answers — {questionSet?.name}
                              </p>
                              <div className="space-y-2">
                                {questions.map((q, idx) => (
                                  <div key={q.id} className="flex items-start gap-3 text-sm">
                                    <span className="text-xs font-bold text-primary/60 mt-0.5 shrink-0 w-5 text-right">{idx + 1}.</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-muted-foreground text-xs">{q.text}</p>
                                      <p className={`font-medium mt-0.5 ${answers[q.id] ? "text-white" : "text-muted-foreground/40 italic"}`}>
                                        {answers[q.id] || "No answer"}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
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

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function JobPostingPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [postJobOpen, setPostJobOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobPosting | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: jobs = [], isLoading } = useQuery<JobPosting[]>({
    queryKey: ["/api/jobs"],
    queryFn: () => apiRequest("GET", "/api/jobs").then(r => r.json()),
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

  const deleteJob = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/jobs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/stats"] });
    },
  });

  const stats = jobStats as { total: number; active: number; draft: number; filled: number; totalOpenings: number } | undefined;

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
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Job Applications</h1>
            <p className="text-muted-foreground mt-1">Manage and publish job applications.</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setPostJobOpen(true)}
              className="h-11 border-border bg-background font-bold uppercase tracking-wide text-xs rounded-sm"
              data-testid="button-post-job"
            >
              <Plus className="mr-2 h-4 w-4" />
              Post Job
            </Button>
            <Button
              onClick={() => setCreateOpen(true)}
              className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs rounded-sm shadow-[0_0_20px_rgba(25,90,55,0.25)] hover:shadow-[0_0_30px_rgba(25,90,55,0.45)] transition-all"
              data-testid="button-create-job"
            >
              <Plus className="mr-2 h-4 w-4" />
              Post Consolidated Jobs
            </Button>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-jobs">{stats?.total ?? "—"}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-green-500" data-testid="stat-active-jobs">{stats?.active ?? "—"}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Drafts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-muted-foreground" data-testid="stat-draft-jobs">{stats?.draft ?? "—"}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Openings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-openings">{stats?.totalOpenings?.toLocaleString() ?? "—"}</div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col md:flex-row gap-3 items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by job title, location..."
              className="pl-10 h-10 bg-muted/30 border-border focus-visible:ring-primary/20"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-jobs"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {["all", "active", "draft", "closed"].map(s => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                className={`h-10 capitalize ${statusFilter === s ? "bg-primary text-primary-foreground" : "border-border bg-background"}`}
                onClick={() => setStatusFilter(s)}
                data-testid={`filter-status-${s}`}
              >
                {s}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <Card className="bg-card border-border">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base font-display text-white">
              Applications
              {filtered.length > 0 && <span className="text-muted-foreground font-normal text-sm ml-2">({filtered.length})</span>}
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
                <p className="text-muted-foreground font-medium">No jobs found</p>
                <p className="text-muted-foreground/60 text-sm mt-1">Post a consolidated application to attract candidates</p>
                <Button
                  onClick={() => setCreateOpen(true)}
                  className="mt-4 h-9 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wide rounded-sm"
                  data-testid="button-create-first-job"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Create Your First Job
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Job Title</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">Location</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">Type</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">Openings</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">Salary Range</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">Posted</TableHead>
                    <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((job) => (
                    <TableRow
                      key={job.id}
                      className="border-border hover:bg-muted/20 cursor-pointer"
                      data-testid={`row-job-${job.id}`}
                      onClick={() => { setSelectedJob(job); setSheetOpen(true); }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-white">{job.title}</div>
                            {job.department && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                <Building className="h-3 w-3" />
                                {job.department} · {job.type}
                              </div>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 ml-1" />
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {job.location && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {job.location}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge
                          variant="outline"
                          className={`border-0 text-xs font-medium ${job.seasonId ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-400"}`}
                          data-testid={`type-job-${job.id}`}
                        >
                          {job.seasonId ? "Consolidated" : "Single"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-1 text-sm text-white">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          {job.openings.toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {job.salaryMin && job.salaryMax ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <DollarSign className="h-3 w-3" />
                            {Number(job.salaryMin).toLocaleString()} – {Number(job.salaryMax).toLocaleString()} SAR
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
                          {statusLabel[job.status] ?? job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" data-testid={`button-job-actions-${job.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => { setSelectedJob(job); setSheetOpen(true); }}>
                              View Applicants
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setEditingJob(job); setPostJobOpen(true); }}>
                              Edit Job
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {job.status === "draft" && (
                              <DropdownMenuItem onClick={() => updateJob.mutate({ id: job.id, status: "active" })}>
                                Publish
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-500"
                              onClick={() => deleteJob.mutate(job.id)}
                            >
                              Delete
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

      {/* Create Job Dialog */}
      <CreateJobDialog open={createOpen} onOpenChange={setCreateOpen} />
      {/* Post Job Dialog */}
      <PostJobDialog
        open={postJobOpen}
        onOpenChange={(v) => { setPostJobOpen(v); if (!v) setEditingJob(null); }}
        initialJob={editingJob}
      />
      {/* Applicants Sheet */}
      <ApplicantsSheet job={selectedJob} open={sheetOpen} onOpenChange={setSheetOpen} />
    </DashboardLayout>
  );
}
