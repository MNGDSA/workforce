import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
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
} from "lucide-react";
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

// ─── Status styles ─────────────────────────────────────────────────────────
const statusStyles: Record<string, string> = {
  active: "bg-green-500/10 text-green-500",
  draft: "bg-muted text-muted-foreground",
  paused: "bg-amber-500/10 text-amber-400",
  closed: "bg-red-500/10 text-red-400",
  filled: "bg-blue-500/10 text-blue-400",
};

const statusLabel: Record<string, string> = {
  active: "Active",
  draft: "Draft",
  paused: "Paused",
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
  titleAr: z.string().optional(),
  department: z.string().optional(),
  type: z.enum(["seasonal", "full_time", "part_time", "contract"]),
  location: z.string().optional(),
  region: z.string().optional(),
  openings: z.coerce.number().int().min(1, "Must have at least 1 opening"),
  salaryMin: z.coerce.number().optional(),
  salaryMax: z.coerce.number().optional(),
  deadline: z.string().optional(),
  status: z.enum(["draft", "active"]),
  description: z.string().optional(),
  requirements: z.string().optional(),
  seasonId: z.string().optional(),
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

  const { data: seasons = [] } = useQuery<Season[]>({
    queryKey: ["/api/seasons"],
    queryFn: () => apiRequest("GET", "/api/seasons").then(r => r.json()),
    enabled: open,
  });

  const form = useForm<CreateJobForm>({
    resolver: zodResolver(createJobSchema),
    defaultValues: {
      title: "",
      titleAr: "",
      department: "",
      type: "seasonal",
      location: "",
      region: "",
      openings: 1,
      salaryMin: undefined,
      salaryMax: undefined,
      deadline: "",
      status: "draft",
      description: "",
      requirements: "",
      seasonId: "",
    },
  });

  const createJob = useMutation({
    mutationFn: (data: CreateJobForm) => {
      const payload: Record<string, unknown> = { ...data };
      if (!payload.seasonId) delete payload.seasonId;
      if (!payload.salaryMin) delete payload.salaryMin;
      if (!payload.salaryMax) delete payload.salaryMax;
      if (!payload.deadline) delete payload.deadline;
      return apiRequest("POST", "/api/jobs", payload).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/stats"] });
      form.reset();
      onOpenChange(false);
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
                  name="titleAr"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                        Arabic Title <span className="text-muted-foreground/50">(اختياري)</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="مثال: ضابط ضبط الحشود"
                          dir="rtl"
                          className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm font-sans"
                          data-testid="input-job-title-ar"
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
                          <SelectItem value="seasonal">Seasonal</SelectItem>
                          <SelectItem value="full_time">Full Time</SelectItem>
                          <SelectItem value="part_time">Part Time</SelectItem>
                          <SelectItem value="contract">Contract</SelectItem>
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
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Headcount & Compensation</p>

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="openings"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                        Openings <span className="text-primary">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm"
                          data-testid="input-job-openings"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                      Publish App
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
  location: z.string().optional(),
  region: z.string().optional(),
  openings: z.coerce.number().int().min(1, "At least 1 opening required"),
  salaryMin: z.coerce.number().optional(),
  salaryMax: z.coerce.number().optional(),
  deadline: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["draft", "active"]),
});

type PostJobForm = z.infer<typeof postJobSchema>;

function PostJobDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();

  const form = useForm<PostJobForm>({
    resolver: zodResolver(postJobSchema),
    defaultValues: { title: "", location: "", region: "", openings: 1, deadline: "", description: "", status: "active" },
  });

  const postJob = useMutation({
    mutationFn: (data: PostJobForm) => {
      const payload: Record<string, unknown> = { ...data, type: "seasonal" };
      if (!payload.salaryMin) delete payload.salaryMin;
      if (!payload.salaryMax) delete payload.salaryMax;
      if (!payload.deadline) delete payload.deadline;
      return apiRequest("POST", "/api/jobs", payload).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/stats"] });
      form.reset();
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-amber-400" />
            Post a Job
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Create a single standalone job posting.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => postJob.mutate(d))} className="space-y-5 pt-1">

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

            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="openings" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Openings <span className="text-primary">*</span></FormLabel>
                  <FormControl>
                    <Input type="number" min={1} className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm" data-testid="input-postjob-openings" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

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

            <DialogFooter className="pt-1 flex gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground" data-testid="button-cancel-postjob">
                Cancel
              </Button>
              <div className="flex gap-2">
                <Button type="submit" variant="outline" disabled={postJob.isPending} onClick={() => form.setValue("status", "draft")} className="border-border bg-background hover:bg-muted" data-testid="button-postjob-draft">
                  {postJob.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save as Draft"}
                </Button>
                <Button type="submit" disabled={postJob.isPending} onClick={() => form.setValue("status", "active")} className="bg-amber-500 hover:bg-amber-500/90 text-white font-bold uppercase tracking-wide text-xs rounded-sm" data-testid="button-postjob-publish">
                  {postJob.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1.5 h-4 w-4" />Post Job</>}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function JobPostingPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [postJobOpen, setPostJobOpen] = useState(false);

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
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Consolidated Apps</h1>
            <p className="text-muted-foreground mt-1">Manage and publish seasonal job opportunities.</p>
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
              Post Consolidated Application
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
            {["all", "active", "draft", "paused", "closed"].map(s => (
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
                    <TableRow key={job.id} className="border-border hover:bg-muted/20" data-testid={`row-job-${job.id}`}>
                      <TableCell>
                        <div className="font-medium text-white">{job.title}</div>
                        {job.department && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <Building className="h-3 w-3" />
                            {job.department} · {job.type}
                          </div>
                        )}
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
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" data-testid={`button-job-actions-${job.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem>View Applicants</DropdownMenuItem>
                            <DropdownMenuItem>Edit Job</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {job.status === "draft" && (
                              <DropdownMenuItem onClick={() => updateJob.mutate({ id: job.id, status: "active" })}>
                                Publish
                              </DropdownMenuItem>
                            )}
                            {job.status === "active" && (
                              <DropdownMenuItem onClick={() => updateJob.mutate({ id: job.id, status: "paused" })}>
                                Pause
                              </DropdownMenuItem>
                            )}
                            {job.status === "paused" && (
                              <DropdownMenuItem onClick={() => updateJob.mutate({ id: job.id, status: "active" })}>
                                Resume
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
      <PostJobDialog open={postJobOpen} onOpenChange={setPostJobOpen} />
    </DashboardLayout>
  );
}
