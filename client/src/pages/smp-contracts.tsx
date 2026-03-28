import * as XLSX from "xlsx";
import DashboardLayout from "@/components/layout";
import { DatePickerField } from "@/components/ui/date-picker-field";
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
  Plus,
  Loader2,
  FileDown,
  Upload,
  ChevronRight,
  FileSpreadsheet,
  Trash2,
  CheckCircle2,
  Calendar,
  Users,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useToast } from "@/hooks/use-toast";
import type { SMPContract } from "@shared/schema";
import { KSA_REGIONS } from "@shared/schema";

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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createContract = useMutation({
    mutationFn: (data: SMPForm) =>
      apiRequest("POST", "/api/smp-contracts", data).then((r) => r.json()),
    onSuccess: (created: SMPContract) => {
      queryClient.invalidateQueries({ queryKey: ["/api/smp-contracts"] });
      toast({ title: "SMP Contract created", description: `Contract ${created.contractNumber} has been created.` });
      form.reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create contract.", variant: "destructive" });
    },
  });

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
    createContract.mutate(data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-white font-display text-xl">Create SMP Contract</DialogTitle>
          <p className="text-muted-foreground text-sm">Manpower Plan — define contractor terms and workforce allocation.</p>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                        {KSA_REGIONS.map((r) => (
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
                      <DatePickerField value={field.value} onChange={field.onChange} className="bg-muted/30 border-border" data-testid="input-smp-start-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="endDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white text-sm">End Date</FormLabel>
                    <FormControl>
                      <DatePickerField value={field.value} onChange={field.onChange} className="bg-muted/30 border-border" data-testid="input-smp-end-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>
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
              <Button type="submit" disabled={createContract.isPending} className="bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs" data-testid="button-submit-smp">
                {createContract.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Create Contract
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

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
  ["Ahmed Al-Ghamdi", "أحمد الغامدي", "1012345678", "0501234567", "ahmed@example.com", "Makkah", "Saudi", "Ramadan 2026", ""],
  ["Sara Al-Zahrani", "سارة الزهراني", "1087654321", "0557654321", "sara@example.com", "Jeddah", "Saudi", "Hajj 2026", "BLS certified"],
];

function parseCSV(text: string): CandidateRow[] {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const rows: CandidateRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    rows.push({
      fullNameEn: cols[0] ?? "",
      fullNameAr: cols[1] ?? "",
      nationalId: cols[2] ?? "",
      phone: cols[3] ?? "",
      email: cols[4] ?? "",
      city: cols[5] ?? "",
      nationality: cols[6] ?? "",
      jobTitle: cols[7] ?? "",
      notes: cols[8] ?? "",
    });
  }
  return rows.filter((r) => r.fullNameEn || r.nationalId);
}

function parseExcel(buffer: ArrayBuffer): CandidateRow[] {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
  if (rawRows.length < 2) return [];
  const rows: CandidateRow[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const cols = rawRows[i].map((v) => String(v ?? "").trim());
    rows.push({
      fullNameEn: cols[0] ?? "",
      fullNameAr: cols[1] ?? "",
      nationalId: cols[2] ?? "",
      phone: cols[3] ?? "",
      email: cols[4] ?? "",
      city: cols[5] ?? "",
      nationality: cols[6] ?? "",
      jobTitle: cols[7] ?? "",
      notes: cols[8] ?? "",
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
}: {
  contract: SMPContract | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const patchEmployees = useMutation({
    mutationFn: (rows: CandidateRow[]) =>
      apiRequest("PATCH", `/api/smp-contracts/${contract!.id}`, { employees: rows }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/smp-contracts"] }),
    onError: () => toast({ title: "Error", description: "Failed to save employees.", variant: "destructive" }),
  });

  if (!contract) return null;

  const candidates: CandidateRow[] = (contract.employees as CandidateRow[] | null) ?? [];

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
    downloadCSV(`smp-candidates-${contract!.contractNumber}.csv`, TEMPLATE_HEADERS, rows);
    toast({ title: "Export ready", description: `${candidates.length} candidates exported.` });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      let parsed: CandidateRow[] = [];
      if (isExcel) {
        parsed = parseExcel(ev.target?.result as ArrayBuffer);
      } else {
        parsed = parseCSV(ev.target?.result as string);
      }
      if (parsed.length === 0) {
        toast({ title: "No data found", description: "Make sure the file matches the template format.", variant: "destructive" });
      } else {
        patchEmployees.mutate([...candidates, ...parsed]);
        toast({ title: `${parsed.length} candidates uploaded`, description: `Added to contract ${contract!.contractNumber}.` });
      }
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  }

  function removeCandidate(idx: number) {
    patchEmployees.mutate(candidates.filter((_, i) => i !== idx));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl bg-card border-border flex flex-col p-0 overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <SheetTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
                <code className="text-sm font-mono bg-primary/10 text-primary px-2 py-1 rounded">{contract.contractNumber}</code>
                <span>{contract.contractorName}</span>
              </SheetTitle>
              <div className="text-muted-foreground mt-1.5 flex items-center gap-3 flex-wrap text-xs">
                <span className="capitalize">{contract.contractType.replace(/_/g, " ")}</span>
                <span>·</span>
                <span>{contract.region}</span>
                <span>·</span>
                <span>{contract.startDate} → {contract.endDate}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <Button size="sm" variant="outline" className="border-border gap-1.5 text-xs" onClick={handleDownloadTemplate} data-testid="button-download-template">
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
              Download Template
            </Button>
            <Button size="sm" variant="outline" className="border-border gap-1.5 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading} data-testid="button-upload-candidates">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Upload Candidates
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
            <Button size="sm" variant="outline" className="border-border gap-1.5 text-xs" onClick={handleExport} disabled={candidates.length === 0} data-testid="button-export-candidates">
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
                <p className="text-muted-foreground text-sm mb-4">CSV or Excel format · Use the template above</p>
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
              <div className="flex items-center gap-6 px-6 py-3 border-b border-border bg-muted/10 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  {candidates.length} total candidates
                </span>
                <span>{Array.from(new Set(candidates.map((c) => c.city))).filter(Boolean).length} cities</span>
                <span>{Array.from(new Set(candidates.map((c) => c.jobTitle))).filter(Boolean).length} job titles</span>
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
                            {(c as any).photoUrl && <AvatarImage src={(c as any).photoUrl} alt={c.fullNameEn} className="object-cover" />}
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

export default function SMPContractsPage() {
  const [search, setSearch] = useState("");
  const [smpOpen, setSmpOpen] = useState(false);
  const [selectedSmp, setSelectedSmp] = useState<SMPContract | null>(null);
  const [smpSheetOpen, setSmpSheetOpen] = useState(false);

  const { data: smpContracts = [], isLoading } = useQuery<SMPContract[]>({
    queryKey: ["/api/smp-contracts"],
    queryFn: () => apiRequest("GET", "/api/smp-contracts").then((r) => r.json()),
  });

  const filtered = smpContracts.filter(
    (c) => !search || c.contractorName.toLowerCase().includes(search.toLowerCase()) || c.contractNumber.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">SMP Contracts</h1>
            <p className="text-muted-foreground mt-1">Manage Sub-Manpower Provider contracts and workforce allocation.</p>
          </div>
          <Button
            className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs"
            data-testid="button-create-smp"
            onClick={() => setSmpOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create SMP Contract
          </Button>
        </div>

        <CreateSMPContractDialog open={smpOpen} onOpenChange={setSmpOpen} />
        <SMPContractSheet
          contract={selectedSmp ? (smpContracts.find((c) => c.id === selectedSmp.id) ?? selectedSmp) : null}
          open={smpSheetOpen}
          onOpenChange={setSmpSheetOpen}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-amber-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Contracts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-contracts">{smpContracts.length}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Workers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-workers">
                {smpContracts.reduce((sum, c) => sum + ((c.employees as unknown[]) ?? []).length, 0)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-blue-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Regions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-regions">
                {new Set(smpContracts.map(c => c.region).filter(Boolean)).size}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by contractor name or contract number..."
              className="pl-10 h-12 bg-muted/30 border-border focus-visible:ring-primary/20 text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-smp"
            />
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-display text-white">Contracts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">No SMP contracts found</p>
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
                    <TableHead className="text-muted-foreground hidden lg:table-cell">Start Date</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">End Date</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">Workers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((contract) => (
                    <TableRow
                      key={contract.id}
                      className="border-border hover:bg-muted/20 cursor-pointer"
                      data-testid={`row-smp-${contract.id}`}
                      onClick={() => { setSelectedSmp(contract); setSmpSheetOpen(true); }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                            {contract.contractNumber}
                          </code>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
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
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm text-white">{contract.startDate || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm text-white">{contract.endDate || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-sm font-medium text-white">{((contract.employees as unknown[]) ?? []).length}</span>
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
