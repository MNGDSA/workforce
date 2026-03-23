import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Search,
  Filter,
  MoreHorizontal,
  Calendar,
  Users,
  Plus,
  Loader2,
  Info,
  FileDown,
  Upload,
  ChevronRight,
  FileSpreadsheet,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useRef as useFileRef } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import type { Season } from "@shared/schema";

const SAUDI_REGIONS = [
  "Riyadh",
  "Makkah",
  "Madinah",
  "Eastern Province",
  "Asir",
  "Tabuk",
  "Qassim",
  "Hail",
  "Jizan",
  "Najran",
  "Al Bahah",
  "Northern Borders",
  "Jawf",
];

const statusStyles: Record<string, string> = {
  upcoming: "bg-blue-500/10 text-blue-500",
  active: "bg-green-500/10 text-green-500",
  closed: "bg-muted text-muted-foreground",
  archived: "bg-zinc-800 text-zinc-500",
};

const createSeasonSchema = z.object({
  name: z.string().min(3, "Season name is required"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  region: z.string().optional(),
  targetHeadcount: z.coerce.number().int().min(0).default(0),
  budget: z.coerce.number().optional(),
  status: z.enum(["upcoming", "active"]),
});

type CreateSeasonForm = z.infer<typeof createSeasonSchema>;

function CreateSeasonDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery<{ fullName: string }>({
    queryKey: ["/api/me"],
    queryFn: () => apiRequest("GET", "/api/me").then((r) => r.json()),
  });

  const form = useForm<CreateSeasonForm>({
    resolver: zodResolver(createSeasonSchema),
    defaultValues: {
      name: "",
      description: "",
      startDate: "",
      endDate: "",
      region: "",
      targetHeadcount: 0,
      budget: undefined,
      status: "upcoming",
    },
  });

  const createSeason = useMutation({
    mutationFn: (data: CreateSeasonForm) =>
      apiRequest("POST", "/api/seasons", data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/seasons"] });
      toast({ title: "Season created", description: "The season has been added successfully." });
      form.reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create season.", variant: "destructive" });
    },
  });

  function onSubmit(data: CreateSeasonForm) {
    createSeason.mutate(data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-white font-display text-xl">Create Season</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-1">

            {/* Season Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                    Season Name <span className="text-primary">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Hajj Season 2026"
                      className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm"
                      data-testid="input-season-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                    Description
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief overview of this season's scope and goals..."
                      rows={3}
                      className="bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm resize-none"
                      data-testid="textarea-season-description"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Created By */}
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Created By</p>
              <Input
                value={currentUser?.fullName ?? "Loading..."}
                disabled
                className="h-10 bg-muted/10 border-border rounded-sm text-muted-foreground cursor-not-allowed"
                data-testid="input-season-created-by"
              />
            </div>

            {/* Dates */}
            <div className="w-full h-px bg-border" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Timeline</p>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                      Start Date <span className="text-primary">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm"
                        data-testid="input-season-start-date"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                      End Date <span className="text-primary">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm"
                        data-testid="input-season-end-date"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-1 flex gap-2 sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-muted-foreground"
                data-testid="button-cancel-season"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs"
                disabled={createSeason.isPending}
                data-testid="button-submit-season"
              >
                {createSeason.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Create Season
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  return (
    <span className="relative inline-flex items-center" ref={ref}>
      <button
        type="button"
        className="h-3.5 w-3.5 rounded-full border border-muted-foreground/50 text-muted-foreground hover:border-primary hover:text-primary flex items-center justify-center transition-colors focus:outline-none ml-1.5"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible((v) => !v)}
        aria-label="More information"
      >
        <Info className="h-2.5 w-2.5" />
      </button>
      {visible && (
        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 w-64 rounded-sm bg-popover border border-border px-3 py-2 text-xs text-muted-foreground shadow-lg leading-relaxed pointer-events-none">
          {text}
          <span className="absolute left-1/2 -translate-x-1/2 top-full h-0 w-0 border-x-4 border-x-transparent border-t-4 border-t-border" />
        </span>
      )}
    </span>
  );
}

const smpSchema = z.object({
  contractNumber: z.string().min(1, "Contract number is required"),
  contractorName: z.string().min(2, "Contractor name is required"),
  contractType: z.enum(["fixed_term", "open_ended", "project_based"]),
  region: z.string().min(1, "Region is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  notes: z.string().optional(),
});

type SMPForm = z.infer<typeof smpSchema>;

function CreateSMPContractDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (data: SMPForm) => void;
}) {
  const { toast } = useToast();

  const form = useForm<SMPForm>({
    resolver: zodResolver(smpSchema),
    defaultValues: {
      contractNumber: `SMP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      contractorName: "",
      contractType: "fixed_term",
      region: "",
      startDate: "",
      endDate: "",
      notes: "",
    },
  });

  function onSubmit(data: SMPForm) {
    toast({ title: "SMP Contract created", description: `Contract ${data.contractNumber} has been created.` });
    onCreated?.(data);
    form.reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-white font-display text-xl">Create SMP Contract</DialogTitle>
          <p className="text-muted-foreground text-sm">Seasonal Manpower Plan — define contractor terms and workforce allocation.</p>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            {/* Contract Identity */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 border-b border-border pb-2">Contract Identity</p>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="contractNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white text-sm">Contract Number</FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-muted/30 border-border font-mono text-xs" data-testid="input-smp-contract-number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="contractType" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white text-sm">Contract Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-muted/30 border-border" data-testid="select-smp-contract-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="fixed_term">Fixed Term</SelectItem>
                        <SelectItem value="open_ended">Open Ended</SelectItem>
                        <SelectItem value="project_based">Project Based</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Contractor */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 border-b border-border pb-2">Contractor</p>
              <FormField control={form.control} name="contractorName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white text-sm">Contractor Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. Al-Rashidi Services Co." className="bg-muted/30 border-border" data-testid="input-smp-contractor" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Scope & Terms */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 border-b border-border pb-2">Scope & Terms</p>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="region" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white text-sm">Region</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-muted/30 border-border" data-testid="select-smp-region">
                          <SelectValue placeholder="Select region" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SAUDI_REGIONS.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <div />
                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white text-sm">Start Date</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" className="bg-muted/30 border-border" data-testid="input-smp-start-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="endDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white text-sm">End Date</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" className="bg-muted/30 border-border" data-testid="input-smp-end-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Notes */}
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white text-sm">Notes & Remarks</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="Any special terms, conditions, or remarks..." className="bg-muted/30 border-border resize-none" rows={3} data-testid="textarea-smp-notes" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground">
                Cancel
              </Button>
              <Button type="submit" className="bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs" data-testid="button-submit-smp">
                <Plus className="mr-2 h-4 w-4" />
                Create Contract
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── SMP Contract Sheet ──────────────────────────────────────────────────────
type CandidateRow = {
  fullNameEn: string;
  fullNameAr: string;
  nationalId: string;
  phone: string;
  email: string;
  city: string;
  nationality: string;
  jobTitle: string;
  notes: string;
};

const TEMPLATE_HEADERS = [
  "Full Name (EN)",
  "Full Name (AR)",
  "National ID",
  "Phone",
  "Email",
  "City",
  "Nationality",
  "Job Title",
  "Notes",
];

const TEMPLATE_ROWS: string[][] = [
  ["Ahmed Al-Ghamdi", "أحمد الغامدي", "1012345678", "0501234567", "ahmed@example.com", "Makkah", "Saudi", "Crowd Management Officer", ""],
  ["Sara Al-Zahrani", "سارة الزهراني", "1087654321", "0557654321", "sara@example.com", "Jeddah", "Saudi", "Medical Support Technician", "BLS certified"],
];

function parseCSV(text: string): CandidateRow[] {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const rows: CandidateRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    rows.push({
      fullNameEn:  cols[0] ?? "",
      fullNameAr:  cols[1] ?? "",
      nationalId:  cols[2] ?? "",
      phone:       cols[3] ?? "",
      email:       cols[4] ?? "",
      city:        cols[5] ?? "",
      nationality: cols[6] ?? "",
      jobTitle:    cols[7] ?? "",
      notes:       cols[8] ?? "",
    });
  }
  return rows.filter((r) => r.fullNameEn || r.nationalId);
}

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SMPContractSheet({
  contract,
  open,
  onOpenChange,
  candidates,
  onCandidatesChange,
}: {
  contract: SMPForm | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidates: CandidateRow[];
  onCandidatesChange: (rows: CandidateRow[]) => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useFileRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  if (!contract) return null;

  function handleDownloadTemplate() {
    downloadCSV("smp-candidates-template.csv", TEMPLATE_HEADERS, TEMPLATE_ROWS);
    toast({ title: "Template downloaded", description: "Fill in the template and upload it below." });
  }

  function handleExport() {
    if (candidates.length === 0) return;
    const rows = candidates.map((c) => [
      c.fullNameEn, c.fullNameAr, c.nationalId, c.phone,
      c.email, c.city, c.nationality, c.jobTitle, c.notes,
    ]);
    downloadCSV(`smp-candidates-${contract.contractNumber}.csv`, TEMPLATE_HEADERS, rows);
    toast({ title: "Export ready", description: `${candidates.length} candidates exported.` });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        toast({ title: "No data found", description: "Make sure the file uses the correct template format.", variant: "destructive" });
      } else {
        onCandidatesChange([...candidates, ...parsed]);
        toast({ title: `${parsed.length} candidates uploaded`, description: `Added to contract ${contract.contractNumber}.` });
      }
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  }

  function removeCandidate(idx: number) {
    onCandidatesChange(candidates.filter((_, i) => i !== idx));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl bg-card border-border flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <SheetTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
                <code className="text-sm font-mono bg-primary/10 text-primary px-2 py-1 rounded">{contract.contractNumber}</code>
                <span>{contract.contractorName}</span>
              </SheetTitle>
              <SheetDescription className="text-muted-foreground mt-1.5 flex items-center gap-3 flex-wrap text-xs">
                <span className="capitalize">{contract.contractType.replace(/_/g, " ")}</span>
                <span>·</span>
                <span>{contract.region}</span>
                <span>·</span>
                <span>{contract.startDate} → {contract.endDate}</span>
              </SheetDescription>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="border-border gap-1.5 text-xs"
              onClick={handleDownloadTemplate}
              data-testid="button-download-template"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
              Download Template
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="border-border gap-1.5 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              data-testid="button-upload-candidates"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Upload Candidates
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />

            <Button
              size="sm"
              variant="outline"
              className="border-border gap-1.5 text-xs"
              onClick={handleExport}
              disabled={candidates.length === 0}
              data-testid="button-export-candidates"
            >
              <FileDown className="h-3.5 w-3.5" />
              Export Excel
            </Button>

            <div className="ml-auto flex items-center gap-1.5 text-sm">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-white font-bold">{candidates.length}</span>
              <span className="text-muted-foreground">candidate{candidates.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-6">
              <div
                className="border-2 border-dashed border-border rounded-sm p-10 w-full max-w-sm cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                data-testid="dropzone-upload"
              >
                <Upload className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-white font-medium mb-1">Upload candidate list</p>
                <p className="text-muted-foreground text-sm mb-4">CSV format · Use the template above</p>
                <Button size="sm" variant="outline" className="border-border text-xs gap-1.5">
                  <Upload className="h-3.5 w-3.5" />
                  Choose File
                </Button>
              </div>
              <p className="text-muted-foreground/50 text-xs mt-4">
                No candidates yet. Download the template, fill it in, then upload.
              </p>
            </div>
          ) : (
            <div>
              {/* Stats strip */}
              <div className="flex items-center gap-6 px-6 py-3 border-b border-border bg-muted/10 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  {candidates.length} total candidates
                </span>
                <span>{[...new Set(candidates.map((c) => c.city))].filter(Boolean).length} cities</span>
                <span>{[...new Set(candidates.map((c) => c.jobTitle))].filter(Boolean).length} job titles</span>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Candidate</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">ID / Phone</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Job Title</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">City</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {candidates.map((c, idx) => (
                    <tr key={idx} className="hover:bg-muted/20 transition-colors" data-testid={`row-smp-candidate-${idx}`}>
                      <td className="px-6 py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-7 w-7 border border-border shrink-0">
                            <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                              {c.fullNameEn.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="font-medium text-white truncate text-sm">{c.fullNameEn || "—"}</div>
                            {c.fullNameAr && <div className="text-xs text-muted-foreground truncate" dir="rtl">{c.fullNameAr}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {c.nationalId && <div className="font-mono">{c.nationalId}</div>}
                          {c.phone && <div>{c.phone}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">{c.jobTitle || "—"}</span>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <span className="text-xs text-muted-foreground">{c.city || "—"}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-red-400"
                          onClick={() => removeCandidate(idx)}
                          data-testid={`button-remove-candidate-${idx}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function SeasonsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [smpOpen, setSmpOpen] = useState(false);
  const [smpContracts, setSmpContracts] = useState<SMPForm[]>([]);
  const [selectedSmp, setSelectedSmp] = useState<SMPForm | null>(null);
  const [smpSheetOpen, setSmpSheetOpen] = useState(false);
  const [smpCandidates, setSmpCandidates] = useState<Record<string, CandidateRow[]>>({});

  const { data: seasons = [], isLoading } = useQuery<Season[]>({
    queryKey: ["/api/seasons"],
    queryFn: () => apiRequest("GET", "/api/seasons").then((r) => r.json()),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/seasons/${id}`, { status }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/seasons"] }),
  });

  const deleteSeason = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/seasons/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/seasons"] }),
  });

  const filtered = seasons.filter(
    (s) => !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = seasons.filter((s) => s.status === "active").length;
  const upcomingCount = seasons.filter((s) => s.status === "upcoming").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Seasons Management</h1>
            <p className="text-muted-foreground mt-1">Plan and track your seasonal workforce requirements.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-11 border-primary/40 text-primary hover:bg-primary/10 font-bold uppercase tracking-wide text-xs"
              data-testid="button-create-smp"
              onClick={() => setSmpOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create SMP Contract
            </Button>
            <Button
              className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs"
              data-testid="button-create-season"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Season
            </Button>
          </div>
        </div>

        <CreateSeasonDialog open={createOpen} onOpenChange={setCreateOpen} />
        <CreateSMPContractDialog open={smpOpen} onOpenChange={setSmpOpen} onCreated={(data) => setSmpContracts((prev) => [...prev, data])} />
        <SMPContractSheet
          contract={selectedSmp}
          open={smpSheetOpen}
          onOpenChange={setSmpSheetOpen}
          candidates={selectedSmp ? (smpCandidates[selectedSmp.contractNumber] ?? []) : []}
          onCandidatesChange={(rows) => {
            if (!selectedSmp) return;
            setSmpCandidates((prev) => ({ ...prev, [selectedSmp.contractNumber]: rows }));
          }}
        />

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-amber-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total SMP Contracts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-contracts">{smpContracts.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Created this session</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Seasons</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-seasons">{seasons.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Across all time</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Campaigns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-active-seasons">{activeCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Currently in progress</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Upcoming</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-upcoming-seasons">{upcomingCount}</div>
              <p className="text-xs text-muted-foreground mt-1">In planning phase</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="flex flex-col md:flex-row gap-4 items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search seasons by name or region..."
              className="pl-10 h-12 bg-muted/30 border-border focus-visible:ring-primary/20 text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-seasons"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="outline" className="h-12 border-border bg-background flex-1 md:flex-none">
              <Filter className="mr-2 h-4 w-4" />
              Status
            </Button>
            <Button variant="outline" className="h-12 border-border bg-background flex-1 md:flex-none">
              <Calendar className="mr-2 h-4 w-4" />
              Date Range
            </Button>
          </div>
        </div>

        {/* Seasons Table */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-display text-white">Seasons</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">No seasons found</p>
                <p className="text-muted-foreground/60 text-sm mt-1">Create your first season to get started</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Season Name</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">
                      <span className="flex items-center">
                        Expiry
                        <InfoTooltip text="SMP Contracts expiry dates should be set as the project's contractual expiry date." />
                      </span>
                    </TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">Region</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">Hiring Progress</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((season) => {
                    const pct =
                      season.targetHeadcount > 0
                        ? Math.round((season.filledPositions / season.targetHeadcount) * 100)
                        : 0;
                    return (
                      <TableRow key={season.id} className="border-border hover:bg-muted/20" data-testid={`row-season-${season.id}`}>
                        <TableCell>
                          <div className="font-medium text-white">{season.name}</div>
                          {season.description && (
                            <div className="text-xs text-muted-foreground mt-0.5 max-w-[260px] truncate">
                              {season.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-white">{season.endDate}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-sm text-muted-foreground">{season.region ?? "—"}</span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell w-[200px]">
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Users className="h-3 w-3" /> {season.filledPositions} / {season.targetHeadcount}
                              </span>
                              <span className="text-white font-medium">{pct}%</span>
                            </div>
                            <Progress value={pct} className="h-1.5" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`font-medium border-0 capitalize ${statusStyles[season.status] ?? "bg-muted text-muted-foreground"}`}
                            data-testid={`status-season-${season.id}`}
                          >
                            {season.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" data-testid={`button-season-actions-${season.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem>View Details</DropdownMenuItem>
                              <DropdownMenuItem>Edit Season</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {season.status === "upcoming" && (
                                <DropdownMenuItem onClick={() => updateStatus.mutate({ id: season.id, status: "active" })}>
                                  Activate
                                </DropdownMenuItem>
                              )}
                              {season.status === "active" && (
                                <DropdownMenuItem onClick={() => updateStatus.mutate({ id: season.id, status: "closed" })}>
                                  Close Season
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-500"
                                onClick={() => deleteSeason.mutate(season.id)}
                              >
                                Delete
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

        {/* SMP Contracts Table */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-display text-white">SMP Contracts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {smpContracts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">No SMP contracts yet</p>
                <p className="text-muted-foreground/60 text-sm mt-1">Click "Create SMP Contract" to add one</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Contract No.</TableHead>
                    <TableHead className="text-muted-foreground">Contractor</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">Type</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">Region</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">
                      <span className="flex items-center">
                        Expiry
                        <InfoTooltip text="SMP Contracts expiry dates should be set as the project's contractual expiry date." />
                      </span>
                    </TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {smpContracts.map((contract, idx) => (
                    <TableRow
                      key={idx}
                      className="border-border hover:bg-muted/20 cursor-pointer"
                      data-testid={`row-smp-${idx}`}
                      onClick={() => { setSelectedSmp(contract); setSmpSheetOpen(true); }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                            {contract.contractNumber}
                          </code>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {(smpCandidates[contract.contractNumber]?.length ?? 0)} candidates
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-white font-medium text-sm">{contract.contractorName}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="border-border text-muted-foreground font-normal capitalize text-xs">
                          {contract.contractType.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm text-muted-foreground">{contract.region || "—"}</span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-white">{contract.endDate || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground truncate max-w-[180px] block">
                          {contract.notes || "—"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
