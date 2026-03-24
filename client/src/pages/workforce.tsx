import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Filter,
  MoreHorizontal,
  Users,
  Plus,
  Briefcase,
  Clock,
  MapPin,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────
type Season = { id: string; name: string; status: string };
type Job = { id: string; title: string; status: string };
type Application = { id: string; candidateId: string; jobId: string; status: string };
type Candidate = { id: string; fullNameEn: string; nationalId?: string; status: string };

type WorkforceGroup = {
  id: string;
  name: string;
  size: number;
  role: string;
  startDate: string;
  endDate?: string;
  status: "Onboarding" | "Active" | "Offboarded";
  progress: number;
  region: string;
  department?: string;
  seasonName?: string;
  notes?: string;
};

// ─── Initial mock groups (Saudi context) ──────────────────────────────────────
const INITIAL_GROUPS: WorkforceGroup[] = [
  {
    id: "WG-001",
    name: "Hajj 2026 – Crowd Management Alpha",
    size: 120,
    role: "Crowd Management Officer",
    startDate: "May 10, 2026",
    status: "Onboarding",
    progress: 20,
    region: "Makkah",
    department: "Operations",
    seasonName: "Hajj 2026",
  },
  {
    id: "WG-002",
    name: "Ramadan 2026 – Gate Security",
    size: 60,
    role: "Security Personnel",
    startDate: "Mar 01, 2026",
    status: "Active",
    progress: 100,
    region: "Madinah",
    department: "Security",
    seasonName: "Ramadan 2026",
  },
  {
    id: "WG-003",
    name: "Umrah Peak – Medical Support",
    size: 30,
    role: "Paramedic / First Aid",
    startDate: "Jan 15, 2026",
    status: "Active",
    progress: 100,
    region: "Makkah",
    department: "Medical",
    seasonName: "Umrah Season",
  },
  {
    id: "WG-004",
    name: "Hajj 2025 – Transportation Crew",
    size: 85,
    role: "Driver / Logistics",
    startDate: "Jun 01, 2025",
    status: "Offboarded",
    progress: 100,
    region: "Nationwide",
    department: "Logistics",
    seasonName: "Hajj 2025",
  },
];

// ─── Saudi Arabia regions ─────────────────────────────────────────────────────
const SA_REGIONS = [
  "Makkah",
  "Madinah",
  "Riyadh",
  "Eastern Province",
  "Asir",
  "Tabuk",
  "Hail",
  "Northern Borders",
  "Najran",
  "Al Bahah",
  "Al Jawf",
  "Jizan",
  "Qassim",
  "Nationwide",
];

const SA_DEPARTMENTS = [
  "Operations",
  "Security",
  "Medical",
  "Logistics",
  "Hospitality",
  "Administration",
  "Technical",
  "Communications",
  "Finance",
  "Other",
];

// ─── Form schema ──────────────────────────────────────────────────────────────
const createGroupSchema = z.object({
  name: z.string().min(3, "Group name must be at least 3 characters"),
  role: z.string().min(2, "Role / position is required"),
  department: z.string().optional(),
  seasonId: z.string().optional(),
  region: z.string().min(1, "Region is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});
type CreateGroupForm = z.infer<typeof createGroupSchema>;

// ─── Group status helpers ─────────────────────────────────────────────────────
function statusStyle(status: string) {
  if (status === "Active")     return "bg-green-500/10 text-green-500";
  if (status === "Onboarding") return "bg-blue-500/10 text-blue-500";
  if (status === "Offboarded") return "bg-muted text-muted-foreground";
  return "bg-zinc-800 text-zinc-500";
}

function groupProgress(status: string) {
  if (status === "Onboarding") return 20;
  if (status === "Active")     return 100;
  return 100;
}

// ─── Create Group Dialog ──────────────────────────────────────────────────────
function CreateGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (group: WorkforceGroup) => void;
}) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Member selection state ──
  const [memberSource, setMemberSource] = useState<"applications" | "talent">("applications");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [memberJobId, setMemberJobId] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

  const { data: seasons = [] } = useQuery<Season[]>({
    queryKey: ["/api/seasons"],
    queryFn: () => apiRequest("GET", "/api/seasons").then((r) => r.json()),
    enabled: open,
    staleTime: 0,
  });

  const { data: activeJobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/jobs", "active"],
    queryFn: () => apiRequest("GET", "/api/jobs?status=active").then((r) => r.json()),
    enabled: open,
    staleTime: 0,
  });

  const { data: jobApplications = [], isLoading: loadingApps } = useQuery<Application[]>({
    queryKey: ["/api/applications", memberJobId],
    queryFn: () => apiRequest("GET", `/api/applications?jobId=${memberJobId}`).then((r) => r.json()),
    enabled: !!memberJobId,
    staleTime: 0,
  });

  const { data: allCandidates = [] } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates/list"],
    queryFn: async () => {
      const json = await apiRequest("GET", "/api/candidates?limit=100").then((r) => r.json());
      return Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    },
    enabled: open,
    staleTime: 0,
  });

  // Applicants for selected job
  const applicantIds = new Set(jobApplications.map((a) => a.candidateId));
  const jobApplicants = allCandidates.filter((c) => applicantIds.has(c.id));

  // Talent pool filtered by search
  const talentPool = allCandidates.filter(
    (c) =>
      !memberSearch ||
      c.fullNameEn.toLowerCase().includes(memberSearch.toLowerCase()) ||
      (c.nationalId ?? "").toLowerCase().includes(memberSearch.toLowerCase())
  );

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const form = useForm<CreateGroupForm>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      name: "",
      role: "",
      department: "",
      seasonId: "",
      region: "",
      startDate: "",
      endDate: "",
      notes: "",
    },
  });

  function formatDisplayDate(iso: string) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-SA", { month: "short", day: "numeric", year: "numeric" });
  }

  function resetMemberState() {
    setSelectedIds(new Set());
    setMemberJobId("");
    setMemberSearch("");
    setMemberSource("applications");
  }

  async function onSubmit(data: CreateGroupForm) {
    setIsSubmitting(true);
    try {
      const seasonName = seasons.find((s) => s.id === data.seasonId)?.name;

      const counter = Math.random().toString(36).substring(2, 5).toUpperCase();
      const newGroup: WorkforceGroup = {
        id: `WG-${counter}`,
        name: data.name,
        size: selectedIds.size,
        role: data.role,
        startDate: formatDisplayDate(data.startDate),
        endDate: data.endDate ? formatDisplayDate(data.endDate) : undefined,
        status: "Onboarding",
        progress: groupProgress("Onboarding"),
        region: data.region,
        department: data.department || undefined,
        seasonName: seasonName,
        notes: data.notes || undefined,
      };

      onCreated(newGroup);
      toast({
        title: "Group created",
        description: `"${data.name}" has been added with ${selectedIds.size} member${selectedIds.size !== 1 ? "s" : ""}.`,
      });
      form.reset();
      resetMemberState();
      onOpenChange(false);
    } catch {
      toast({
        title: "Failed to create group",
        description: "Please check the details and try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenChange(v: boolean) {
    if (!v) resetMemberState();
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Create Workforce Group
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Define a new group of seasonal workers for deployment.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-1">

            {/* Group Identity */}
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/60 border-b border-border pb-1.5">
                Group Identity
              </p>

              {/* Group Name */}
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                    Group Name <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Hajj 2026 – Crowd Management Alpha"
                      className="bg-muted/30 border-border"
                      data-testid="input-group-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Role & Department */}
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                      Role / Position <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Security Officer"
                        className="bg-muted/30 border-border"
                        data-testid="input-group-role"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="department" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Department</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || "none"}>
                      <FormControl>
                        <SelectTrigger className="bg-muted/30 border-border" data-testid="select-department">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {SA_DEPARTMENTS.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Season & Region */}
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="seasonId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Season</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || "none"}>
                      <FormControl>
                        <SelectTrigger className="bg-muted/30 border-border" data-testid="select-season">
                          <SelectValue placeholder="Select season…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No Season</SelectItem>
                        {seasons.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="region" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                      Region <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || "none"}>
                      <FormControl>
                        <SelectTrigger className="bg-muted/30 border-border" data-testid="select-region">
                          <SelectValue placeholder="Select region…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Select region…</SelectItem>
                        {SA_REGIONS.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Schedule */}
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/60 border-b border-border pb-1.5">
                Schedule
              </p>

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                      Start Date <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        className="bg-muted/30 border-border"
                        data-testid="input-start-date"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="endDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">End Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        className="bg-muted/30 border-border"
                        data-testid="input-end-date"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Members */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-1.5">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/60">
                  Members
                </p>
                {selectedIds.size > 0 && (
                  <span className="text-xs font-semibold text-primary">
                    {selectedIds.size} selected
                  </span>
                )}
              </div>

              {/* Selected member chips */}
              {selectedIds.size > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {allCandidates.filter((c) => selectedIds.has(c.id)).map((c) => (
                    <Badge
                      key={c.id}
                      variant="outline"
                      className="bg-primary/10 text-primary border-primary/30 text-xs gap-1 pr-1 cursor-pointer hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                      onClick={() => toggleMember(c.id)}
                      data-testid={`chip-member-${c.id}`}
                    >
                      {c.fullNameEn}
                      <span className="opacity-60">×</span>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Source toggle */}
              <div className="flex rounded-sm overflow-hidden border border-border bg-muted/10">
                <button
                  type="button"
                  onClick={() => setMemberSource("applications")}
                  className={`flex-1 text-xs font-semibold py-2 transition-colors ${
                    memberSource === "applications"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-white"
                  }`}
                  data-testid="tab-source-applications"
                >
                  Job Applications
                </button>
                <button
                  type="button"
                  onClick={() => setMemberSource("talent")}
                  className={`flex-1 text-xs font-semibold py-2 transition-colors ${
                    memberSource === "talent"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-white"
                  }`}
                  data-testid="tab-source-talent"
                >
                  Talent Pool
                </button>
              </div>

              {/* Job Applications source */}
              {memberSource === "applications" && (
                <div className="space-y-2">
                  <Select value={memberJobId || "none"} onValueChange={(v) => setMemberJobId(v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-muted/30 border-border h-9 text-sm" data-testid="select-member-job">
                      <SelectValue placeholder="Select a job to see its applicants…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select a job…</SelectItem>
                      {activeJobs.map((j) => (
                        <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/10 divide-y divide-border">
                    {!memberJobId ? (
                      <p className="text-xs text-muted-foreground text-center py-5">Select a job above to see applicants</p>
                    ) : loadingApps ? (
                      <div className="flex items-center justify-center py-5">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : jobApplicants.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-5">No applicants found for this job</p>
                    ) : (
                      jobApplicants.map((c) => {
                        const selected = selectedIds.has(c.id);
                        return (
                          <div
                            key={c.id}
                            className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${selected ? "bg-primary/10" : "hover:bg-muted/30"}`}
                            onClick={() => toggleMember(c.id)}
                            data-testid={`row-member-${c.id}`}
                          >
                            <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${selected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                              {selected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                            </div>
                            <span className={`text-sm font-medium flex-1 truncate ${selected ? "text-primary" : "text-white"}`}>{c.fullNameEn}</span>
                            <code className="text-[10px] text-muted-foreground font-mono shrink-0">{c.nationalId ?? "—"}</code>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Talent Pool source */}
              {memberSource === "talent" && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or code…"
                      className="pl-9 h-9 text-sm bg-muted/30 border-border"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      data-testid="input-member-search"
                    />
                  </div>

                  <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/10 divide-y divide-border">
                    {talentPool.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-5">
                        {allCandidates.length === 0 ? "No candidates in the talent pool yet" : "No matches found"}
                      </p>
                    ) : (
                      talentPool.map((c) => {
                        const selected = selectedIds.has(c.id);
                        return (
                          <div
                            key={c.id}
                            className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${selected ? "bg-primary/10" : "hover:bg-muted/30"}`}
                            onClick={() => toggleMember(c.id)}
                            data-testid={`row-talent-${c.id}`}
                          >
                            <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${selected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                              {selected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                            </div>
                            <span className={`text-sm font-medium flex-1 truncate ${selected ? "text-primary" : "text-white"}`}>{c.fullNameEn}</span>
                            <code className="text-[10px] text-muted-foreground font-mono shrink-0">{c.nationalId ?? "—"}</code>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Notes</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Special instructions, uniform requirements, clearance needed, etc."
                    className="bg-muted/30 border-border resize-none"
                    rows={3}
                    data-testid="textarea-notes"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="flex justify-end gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                className="border-border"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-create-group"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-primary text-primary-foreground font-bold min-w-[140px]"
                disabled={isSubmitting}
                data-testid="button-submit-create-group"
              >
                {isSubmitting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><Plus className="mr-1.5 h-4 w-4" />Create Group</>}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WorkforcePage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [groups, setGroups] = useState<WorkforceGroup[]>(INITIAL_GROUPS);

  const filtered = groups.filter(
    (g) =>
      !search ||
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.role.toLowerCase().includes(search.toLowerCase()) ||
      g.region.toLowerCase().includes(search.toLowerCase())
  );

  const activePersonnel = groups
    .filter((g) => g.status !== "Offboarded")
    .reduce((acc, g) => acc + g.size, 0);
  const onboardingCount = groups.filter((g) => g.status === "Onboarding").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Workforce Groups</h1>
            <p className="text-muted-foreground mt-1">Manage teams, assignments, and group lifecycles.</p>
          </div>
          <Button
            className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs self-start sm:self-auto"
            onClick={() => setDialogOpen(true)}
            data-testid="button-create-group"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Group
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Groups</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-groups">{groups.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Active & Archived</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Personnel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-active-personnel">{activePersonnel.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">Currently deployed</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Onboarding</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-onboarding">{onboardingCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Groups in setup phase</p>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar */}
        <div className="flex flex-col md:flex-row gap-4 items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search groups by name, role, or region…"
              className="pl-10 h-12 bg-muted/30 border-border focus-visible:ring-primary/20 text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-groups"
            />
          </div>
          <Button variant="outline" className="h-12 border-border bg-background w-full md:w-auto">
            <Filter className="mr-2 h-4 w-4" />
            Status
          </Button>
        </div>

        {/* Groups Table */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-display text-white">
              Groups List
              <span className="ml-2 text-sm font-normal text-muted-foreground">({filtered.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Users className="h-12 w-12 text-muted-foreground/20 mb-4" />
                <p className="text-muted-foreground">No groups found</p>
                <Button
                  variant="outline"
                  className="mt-4 border-border"
                  onClick={() => setDialogOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Group
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-[90px] text-muted-foreground pl-6">ID</TableHead>
                    <TableHead className="text-muted-foreground">Group Name</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">Role & Region</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">Lifecycle</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-right text-muted-foreground pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((group) => (
                    <TableRow key={group.id} className="border-border hover:bg-muted/20" data-testid={`row-group-${group.id}`}>
                      <TableCell className="font-mono text-xs text-muted-foreground pl-6">{group.id}</TableCell>
                      <TableCell className="py-4">
                        <div className="font-medium text-white">{group.name}</div>
                        <div className="flex flex-wrap items-center text-xs text-muted-foreground mt-1 gap-x-2 gap-y-0.5">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {group.size.toLocaleString()} members
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {group.startDate}
                          </span>
                          {group.seasonName && (
                            <>
                              <span>•</span>
                              <span className="text-primary/70">{group.seasonName}</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell py-4">
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-1.5 text-white">
                            <Briefcase className="h-3 w-3 text-primary shrink-0" />
                            {group.role}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {group.region}
                            {group.department && ` · ${group.department}`}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell w-[200px] py-4">
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Cycle Completion</span>
                            <span className="text-white font-medium">{group.progress}%</span>
                          </div>
                          <Progress value={group.progress} className="h-1.5" />
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge
                          variant="outline"
                          className={`font-medium border-0 ${statusStyle(group.status)}`}
                          data-testid={`badge-status-${group.id}`}
                        >
                          {group.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6 py-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-white"
                          data-testid={`button-group-actions-${group.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateGroupDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(g) => setGroups((prev) => [g, ...prev])}
      />
    </DashboardLayout>
  );
}
