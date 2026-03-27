import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  UserCheck,
  Search,
  Plus,
  ClipboardCheck,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Users,
  Camera,
  CreditCard,
  IdCard,
  FileSignature,
  Briefcase,
  Loader2,
  TriangleAlert,
  Eye,
  Download,
  ExternalLink,
  Check,
  Trash2,
} from "lucide-react";

type OnboardingStatus = "pending" | "in_progress" | "ready" | "converted" | "rejected";

interface OnboardingRecord {
  id: string;
  candidateId: string;
  applicationId?: string | null;
  jobId?: string | null;
  seasonId?: string | null;
  status: OnboardingStatus;
  hasPhoto: boolean;
  hasIban: boolean;
  hasNationalId: boolean;
  hasSignedContract: boolean;
  hasEmergencyContact: boolean;
  contractSignedAt?: string | null;
  contractUrl?: string | null;
  position?: string | null;
  department?: string | null;
  startDate?: string | null;
  salary?: string | null;
  notes?: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
  convertedAt?: string | null;
  createdAt: string;
}

interface Candidate {
  id: string;
  candidateCode: string;
  fullNameEn: string;
  fullNameAr?: string | null;
  phone?: string | null;
  nationalId?: string | null;
  hasPhoto: boolean;
  hasIban: boolean;
  hasNationalId: boolean;
  status: string;
  source: string;
  ibanNumber?: string | null;
  ibanFileUrl?: string | null;
  photoUrl?: string | null;
  nationalIdFileUrl?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
}

interface Application {
  id: string;
  candidateId: string;
  status: string;
  jobId?: string | null;
}

const STATUS_CONFIG: Record<OnboardingStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending:     { label: "Pending",     color: "bg-zinc-700 text-zinc-200",        icon: Clock },
  in_progress: { label: "In Progress", color: "bg-yellow-900/60 text-yellow-300", icon: ClipboardCheck },
  ready:       { label: "Ready",       color: "bg-emerald-900/60 text-emerald-300", icon: CheckCircle2 },
  converted:   { label: "Converted",   color: "bg-blue-900/60 text-blue-300",     icon: UserCheck },
  rejected:    { label: "Rejected",    color: "bg-red-900/60 text-red-300",       icon: XCircle },
};

const ALL_PREREQUISITES = [
  { key: "hasPhoto",           label: "Personal Photo",       icon: Camera,        hint: "Clear ID-style photo uploaded",  profileKey: "photoUrl" as const,              isFile: true,  smp: true },
  { key: "hasIban",            label: "IBAN Certificate",     icon: CreditCard,    hint: "Saudi bank IBAN on file",        profileKey: "ibanFileUrl" as const,           isFile: true,  smp: false },
  { key: "hasNationalId",      label: "National ID / Iqama",  icon: IdCard,        hint: "ID copy submitted & verified",   profileKey: "nationalIdFileUrl" as const,     isFile: true,  smp: true },
  { key: "hasSignedContract",  label: "Signed Contract",      icon: FileSignature, hint: "Employment contract signed",     profileKey: null,                             isFile: false, smp: false },
] as const;

function getPrerequisites(isSmp: boolean) {
  return isSmp ? ALL_PREREQUISITES.filter(p => p.smp) : ALL_PREREQUISITES;
}

function prereqCount(rec: OnboardingRecord, isSmp: boolean) {
  const keys = getPrerequisites(isSmp).map(p => p.key);
  return keys.filter(k => rec[k as keyof OnboardingRecord]).length;
}

function prereqTotal(isSmp: boolean) {
  return getPrerequisites(isSmp).length;
}

function AutoSaveNotes({ recordId, initialValue, onSave }: { recordId: string; initialValue: string; onSave: (id: string, notes: string) => void }) {
  const [value, setValue] = useState(initialValue);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(initialValue);

  useEffect(() => {
    setValue(initialValue);
    lastSavedRef.current = initialValue;
    setSaveStatus("idle");
  }, [recordId, initialValue]);

  const debouncedSave = useCallback((text: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (text !== lastSavedRef.current) {
        setSaveStatus("saving");
        lastSavedRef.current = text;
        onSave(recordId, text);
        setTimeout(() => setSaveStatus("saved"), 400);
        setTimeout(() => setSaveStatus("idle"), 2500);
      }
    }, 800);
  }, [recordId, onSave]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-zinc-400 text-sm">Notes</Label>
        <span className="text-[11px] text-zinc-500 flex items-center gap-1">
          {saveStatus === "saving" && <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>}
          {saveStatus === "saved" && <><Check className="h-3 w-3 text-emerald-500" /> Saved</>}
          {saveStatus === "idle" && "Auto-saved"}
        </span>
      </div>
      <Textarea
        data-testid="textarea-onboarding-notes"
        placeholder="Add notes about this candidate's onboarding…"
        value={value}
        onChange={e => { setValue(e.target.value); debouncedSave(e.target.value); }}
        className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 resize-none text-sm"
        rows={3}
      />
    </div>
  );
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  const color = pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-yellow-500" : "bg-zinc-500";
  return (
    <div className="w-full bg-zinc-800 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function OnboardingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [admitOpen, setAdmitOpen] = useState(false);
  const [checklistRecord, setChecklistRecord] = useState<OnboardingRecord | null>(null);
  const [convertRecord, setConvertRecord] = useState<OnboardingRecord | null>(null);
  const [admitSearch, setAdmitSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [admitPage, setAdmitPage] = useState(1);
  const [convertForm, setConvertForm] = useState({ position: "", department: "", startDate: "", salary: "" });
  const [rejectConfirmId, setRejectConfirmId] = useState<string | null>(null);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<{ candidateId: string; docType: string; label: string } | null>(null);
  const [bulkConvertOpen, setBulkConvertOpen] = useState(false);
  const [bulkConvertForm, setBulkConvertForm] = useState({ position: "", department: "", startDate: "", salary: "" });
  const ADMIT_PAGE_SIZE = 10;

  const { data: records = [], isLoading } = useQuery<OnboardingRecord[]>({
    queryKey: ["/api/onboarding"],
  });

  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates", { limit: 1000, status: "active" }],
    queryFn: () => apiRequest("GET", "/api/candidates?limit=1000&status=active").then(r => r.json()),
    select: (r: any) => r?.data ?? [],
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: applications = [] } = useQuery<Application[]>({
    queryKey: ["/api/applications"],
    select: (r: any) => Array.isArray(r) ? r : [],
  });

  const { data: adminUsers = [] } = useQuery<{ id: string; fullName: string }[]>({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest("GET", "/api/users").then(r => r.json()),
    select: (data: any[]) => data.map((u: any) => ({ id: u.id, fullName: u.fullName })),
  });
  const getAdminName = useCallback((id: string | null | undefined) => {
    if (!id) return null;
    return adminUsers.find(u => u.id === id)?.fullName ?? "Unknown admin";
  }, [adminUsers]);

  type AdmitItem = { candidateId: string; applicationId: string | null; jobId: string | null; hasPhoto: boolean; hasIban: boolean; hasNationalId: boolean };
  const admitMutation = useMutation({
    mutationFn: async (items: AdmitItem[]) => {
      await Promise.all(items.map(body => apiRequest("POST", "/api/onboarding", body)));
    },
    onSuccess: (_data, items) => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      setAdmitOpen(false);
      setSelectedIds(new Set());
      setAdmitSearch("");
      setAdmitPage(1);
      toast({ title: `${items.length} candidate${items.length !== 1 ? "s" : ""} admitted to onboarding` });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message ?? "Could not admit candidates", variant: "destructive" }),
  });

  const checklistMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      apiRequest("PATCH", `/api/onboarding/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      // Refresh the local checklist record
      setChecklistRecord(prev => prev ? { ...prev, ...(checklistMutation.variables?.data as any) } : prev);
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const { data: meUser } = useQuery<{ id: string; fullName?: string }>({
    queryKey: ["/api/me"],
    queryFn: () => apiRequest("GET", "/api/me").then(r => r.json()),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/onboarding/${id}`, { status: "rejected", rejectedBy: meUser?.id ?? null }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      toast({ title: "Candidate rejected from onboarding" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const convertMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      apiRequest("POST", `/api/onboarding/${id}/convert`, body).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      setConvertRecord(null);
      setConvertForm({ position: "", department: "", startDate: "", salary: "" });
      toast({ title: "Successfully converted to employee!", description: "Workforce record created." });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const bulkConvertMutation = useMutation({
    mutationFn: (body: { ids: string[]; position: string; department: string; startDate: string; salary: string }) =>
      apiRequest("POST", "/api/onboarding/bulk-convert", body).then(r => r.json()),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      setBulkConvertOpen(false);
      setBulkConvertForm({ position: "", department: "", startDate: "", salary: "" });
      const errCount = data.errors?.length ?? 0;
      toast({
        title: `${data.converted} employee${data.converted !== 1 ? "s" : ""} created`,
        description: errCount > 0 ? `${errCount} failed — check records individually.` : "All ready candidates converted successfully.",
        variant: errCount > 0 ? "destructive" : "default",
      });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/onboarding/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      toast({ title: "Record removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const deleteDocMutation = useMutation({
    mutationFn: ({ candidateId, docType }: { candidateId: string; docType: string }) =>
      apiRequest("DELETE", `/api/candidates/${candidateId}/documents/${docType}`).then(r => r.json()),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      qc.invalidateQueries({ queryKey: ["/api/candidates"] });
      const labels: Record<string, string> = { photo: "Photo", nationalId: "National ID", iban: "IBAN Certificate" };
      toast({ title: `${labels[vars.docType] ?? "Document"} removed`, description: "Candidate will see the missing document on next login." });
      const flagMap: Record<string, string> = { photo: "hasPhoto", nationalId: "hasNationalId", iban: "hasIban" };
      const flag = flagMap[vars.docType];
      if (flag) setChecklistRecord(prev => prev ? { ...prev, [flag]: false } : prev);
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const filtered = records.filter(r => {
    if (statusFilter === "active" && (r.status === "rejected" || r.status === "converted")) return false;
    if (statusFilter !== "all" && statusFilter !== "active" && r.status !== statusFilter) return false;
    if (search) {
      const candidate = candidates.find(c => c.id === r.candidateId);
      const name = candidate?.fullNameEn?.toLowerCase() ?? "";
      const code = candidate?.candidateCode?.toLowerCase() ?? "";
      const q = search.toLowerCase();
      if (!name.includes(q) && !code.includes(q)) return false;
    }
    return true;
  });

  // Candidates eligible for admission: active + has at least one interviewed/hired application
  const interviewedIds = new Set(
    applications.filter(a => ["interviewed", "hired", "shortlisted"].includes(a.status)).map(a => a.candidateId)
  );
  const alreadyOnboarding = new Set(
    records.filter(r => r.status !== "converted" && r.status !== "rejected").map(r => r.candidateId)
  );
  const eligibleCandidates = candidates.filter(c =>
    (interviewedIds.has(c.id) || c.status === "hired") && !alreadyOnboarding.has(c.id)
  );
  const admitFiltered = eligibleCandidates.filter(c =>
    !admitSearch || c.fullNameEn.toLowerCase().includes(admitSearch.toLowerCase()) || c.candidateCode.toLowerCase().includes(admitSearch.toLowerCase())
  );
  const admitTotalPages = Math.max(1, Math.ceil(admitFiltered.length / ADMIT_PAGE_SIZE));
  const admitPageCandidates = admitFiltered.slice((admitPage - 1) * ADMIT_PAGE_SIZE, admitPage * ADMIT_PAGE_SIZE);
  const allPageSelected = admitPageCandidates.length > 0 && admitPageCandidates.every(c => selectedIds.has(c.id));
  const somePageSelected = admitPageCandidates.some(c => selectedIds.has(c.id));

  function getCandidateFor(rec: OnboardingRecord) {
    return candidates.find(c => c.id === rec.candidateId);
  }

  function handleAdmit() {
    if (selectedIds.size === 0) return;
    const items = [...selectedIds].map(id => {
      const c = eligibleCandidates.find(x => x.id === id)!;
      const app = applications.find(a => a.candidateId === id && ["interviewed", "hired", "shortlisted"].includes(a.status));
      return {
        candidateId: id,
        applicationId: app?.id ?? null,
        jobId: app?.jobId ?? null,
        hasPhoto: c.hasPhoto,
        hasIban: c.hasIban,
        hasNationalId: c.hasNationalId,
      };
    });
    admitMutation.mutate(items);
  }

  function toggleCandidate(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleChecklistToggle(rec: OnboardingRecord, key: string, value: boolean) {
    const update = { [key]: value };
    checklistMutation.mutate({ id: rec.id, data: update });
    setChecklistRecord(prev => prev ? { ...prev, ...update } : prev);
  }

  const stats = {
    total:     records.length,
    pending:   records.filter(r => r.status === "pending").length,
    inProgress:records.filter(r => r.status === "in_progress").length,
    ready:     records.filter(r => r.status === "ready").length,
    converted: records.filter(r => r.status === "converted").length,
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Onboarding</h1>
            <p className="text-zinc-400 mt-1 text-sm">Convert shortlisted candidates into employees after prerequisite verification</p>
          </div>
          <div className="flex gap-2">
            {stats.ready > 0 && (
              <Button
                data-testid="button-bulk-convert"
                onClick={() => setBulkConvertOpen(true)}
                variant="outline"
                className="border-emerald-700 text-emerald-400 hover:bg-emerald-900/30 gap-2"
              >
                <UserCheck className="h-4 w-4" />
                Convert All Ready ({stats.ready})
              </Button>
            )}
            <Button
              data-testid="button-admit-candidate"
              onClick={() => setAdmitOpen(true)}
              className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white gap-2"
            >
              <Plus className="h-4 w-4" />
              Admit Candidate
            </Button>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total",       value: stats.total,      color: "text-white" },
            { label: "Pending",     value: stats.pending,    color: "text-zinc-400" },
            { label: "In Progress", value: stats.inProgress, color: "text-yellow-400" },
            { label: "Ready",       value: stats.ready,      color: "text-emerald-400" },
            { label: "Converted",   value: stats.converted,  color: "text-blue-400" },
          ].map(s => (
            <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color} mt-1`} data-testid={`stat-onboarding-${s.label.toLowerCase().replace(" ", "-")}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              data-testid="input-search-onboarding"
              placeholder="Search by name or code…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-status-filter" className="w-40 bg-zinc-900 border-zinc-700 text-white">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Records List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Users className="h-12 w-12 text-zinc-700 mb-4" />
            <p className="text-zinc-400 font-medium">No onboarding records found</p>
            <p className="text-zinc-600 text-sm mt-1">Admit a shortlisted candidate to begin the onboarding process</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(rec => {
              const candidate = getCandidateFor(rec);
              const isSmp = candidate?.source === "smp";
              const done = prereqCount(rec, isSmp);
              const total = prereqTotal(isSmp);
              const cfg = STATUS_CONFIG[rec.status];
              const StatusIcon = cfg.icon;
              const isReady = rec.status === "ready";
              const isConverted = rec.status === "converted";
              const isRejected = rec.status === "rejected";

              return (
                <div
                  key={rec.id}
                  data-testid={`card-onboarding-${rec.id}`}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                >
                  {/* Avatar */}
                  <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 text-lg font-bold text-zinc-300">
                    {candidate?.fullNameEn?.charAt(0).toUpperCase() ?? "?"}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white text-sm">{candidate?.fullNameEn ?? "Unknown"}</span>
                      <span className="text-zinc-500 text-xs font-mono">{candidate?.candidateCode}</span>
                      <Badge className={`text-xs px-2 py-0.5 ${cfg.color} border-0`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {cfg.label}
                      </Badge>
                      {isSmp && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-800 text-blue-400">SMP</Badge>
                      )}
                      {isRejected && rec.rejectedAt && (
                        <span className="text-[11px] text-zinc-500">
                          Rejected {new Date(rec.rejectedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} at {new Date(rec.rejectedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          {rec.rejectedBy && <> by <strong className="text-zinc-400">{getAdminName(rec.rejectedBy)}</strong></>}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <ProgressBar value={done} total={total} />
                      <span className="text-xs text-zinc-500 shrink-0">{done}/{total}</span>
                    </div>
                    {/* Prereq chips */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {getPrerequisites(isSmp).map(p => (
                        <span
                          key={p.key}
                          className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            rec[p.key as keyof OnboardingRecord]
                              ? "bg-emerald-900/40 text-emerald-400 border border-emerald-800/50"
                              : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                          }`}
                        >
                          <p.icon className="h-3 w-3" />
                          {p.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    {!isConverted && !isRejected && (
                      <Button
                        data-testid={`button-checklist-${rec.id}`}
                        size="sm"
                        variant="outline"
                        className="border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 gap-1"
                        onClick={() => setChecklistRecord(rec)}
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Checklist
                      </Button>
                    )}
                    {isReady && (
                      <Button
                        data-testid={`button-convert-${rec.id}`}
                        size="sm"
                        className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white gap-1"
                        onClick={() => {
                          setConvertRecord(rec);
                          setConvertForm({
                            position: rec.position ?? "",
                            department: rec.department ?? "",
                            startDate: rec.startDate ?? "",
                            salary: rec.salary ?? "",
                          });
                        }}
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Convert to Employee
                      </Button>
                    )}
                    {!isConverted && !isRejected && (
                      <Button
                        data-testid={`button-reject-${rec.id}`}
                        size="sm"
                        variant="outline"
                        className="border-red-900/60 text-red-400 hover:bg-red-950/40 gap-1"
                        onClick={() => setRejectConfirmId(rec.id)}
                        disabled={rejectMutation.isPending}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    )}
                    {isConverted && (
                      <div className="flex items-center gap-1 text-blue-400 text-xs">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Moved to Workforce</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Admit Candidate Dialog ── */}
      <Dialog open={admitOpen} onOpenChange={setAdmitOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Admit Candidates to Onboarding</DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              Select one or more interviewed / shortlisted candidates to admit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                data-testid="input-admit-search"
                placeholder="Search candidates…"
                value={admitSearch}
                onChange={e => { setAdmitSearch(e.target.value); setAdmitPage(1); }}
                className="pl-9 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>

            {/* Select-all row */}
            {admitPageCandidates.length > 0 && (
              <div className="flex items-center justify-between px-1">
                <button
                  data-testid="button-select-all-page"
                  onClick={() => {
                    if (allPageSelected) {
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        admitPageCandidates.forEach(c => next.delete(c.id));
                        return next;
                      });
                    } else {
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        admitPageCandidates.forEach(c => next.add(c.id));
                        return next;
                      });
                    }
                  }}
                  className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  <div className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                    allPageSelected ? "bg-[hsl(155,45%,45%)] border-[hsl(155,45%,45%)]"
                    : somePageSelected ? "bg-[hsl(155,45%,45%)]/30 border-[hsl(155,45%,45%)]"
                    : "border-zinc-600 bg-zinc-900"
                  }`}>
                    {(allPageSelected || somePageSelected) && <span className="text-white text-[9px] font-bold leading-none">{allPageSelected ? "✓" : "–"}</span>}
                  </div>
                  {allPageSelected ? "Deselect all on page" : "Select all on page"}
                </button>
                {selectedIds.size > 0 && (
                  <span className="text-xs text-[hsl(155,45%,55%)] font-medium">
                    {selectedIds.size} selected total
                  </span>
                )}
              </div>
            )}

            {/* Candidate list */}
            <div className="space-y-1">
              {admitFiltered.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-sm">
                  {eligibleCandidates.length === 0
                    ? "No eligible candidates — candidates must be interviewed or shortlisted first"
                    : "No candidates match your search"}
                </div>
              ) : admitPageCandidates.map(c => {
                const isSelected = selectedIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    data-testid={`button-select-candidate-${c.id}`}
                    onClick={() => toggleCandidate(c.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center gap-3 ${
                      isSelected
                        ? "border-[hsl(155,45%,45%)] bg-[hsl(155,45%,45%)]/10"
                        : "border-zinc-800 hover:border-zinc-600 bg-zinc-900"
                    }`}
                  >
                    {/* Checkbox */}
                    <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      isSelected ? "bg-[hsl(155,45%,45%)] border-[hsl(155,45%,45%)]" : "border-zinc-600 bg-zinc-900"
                    }`}>
                      {isSelected && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
                    </div>
                    {/* Avatar */}
                    <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-300 shrink-0">
                      {c.fullNameEn.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{c.fullNameEn}</p>
                      <p className="text-xs text-zinc-500 font-mono">{c.candidateCode}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {c.hasPhoto      && <span title="Photo"      className="text-emerald-500"><Camera     className="h-3.5 w-3.5" /></span>}
                      {c.hasIban       && <span title="IBAN"       className="text-emerald-500"><CreditCard  className="h-3.5 w-3.5" /></span>}
                      {c.hasNationalId && <span title="National ID" className="text-emerald-500"><IdCard     className="h-3.5 w-3.5" /></span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Pagination */}
            {admitTotalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <Button
                  data-testid="button-admit-prev-page"
                  size="sm"
                  variant="outline"
                  disabled={admitPage === 1}
                  onClick={() => setAdmitPage(p => Math.max(1, p - 1))}
                  className="border-zinc-700 text-zinc-300 h-7 px-2 text-xs"
                >
                  ← Prev
                </Button>
                <span className="text-xs text-zinc-500">
                  Page {admitPage} of {admitTotalPages} &nbsp;·&nbsp; {admitFiltered.length} eligible
                </span>
                <Button
                  data-testid="button-admit-next-page"
                  size="sm"
                  variant="outline"
                  disabled={admitPage === admitTotalPages}
                  onClick={() => setAdmitPage(p => Math.min(admitTotalPages, p + 1))}
                  className="border-zinc-700 text-zinc-300 h-7 px-2 text-xs"
                >
                  Next →
                </Button>
              </div>
            )}

            {/* Footer actions */}
            <div className="flex gap-2 justify-end pt-1">
              <Button
                variant="outline"
                className="border-zinc-700 text-zinc-300"
                onClick={() => { setAdmitOpen(false); setSelectedIds(new Set()); setAdmitSearch(""); setAdmitPage(1); }}
              >
                Cancel
              </Button>
              <Button
                data-testid="button-confirm-admit"
                disabled={selectedIds.size === 0 || admitMutation.isPending}
                onClick={handleAdmit}
                className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
              >
                {admitMutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : selectedIds.size > 0
                    ? `Admit ${selectedIds.size} Candidate${selectedIds.size !== 1 ? "s" : ""}`
                    : "Select Candidates"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Checklist Sheet ── */}
      <Sheet open={!!checklistRecord} onOpenChange={o => !o && setChecklistRecord(null)}>
        <SheetContent className="bg-zinc-950 border-zinc-800 text-white w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="font-display text-lg">Onboarding Checklist</SheetTitle>
            <SheetDescription className="text-zinc-400 text-sm">
              {checklistRecord && (() => {
                const c = getCandidateFor(checklistRecord);
                return `${c?.fullNameEn ?? "Candidate"} — ${c?.candidateCode ?? ""}`;
              })()}
            </SheetDescription>
          </SheetHeader>

          {checklistRecord && (() => {
            const checklistCand = getCandidateFor(checklistRecord);
            const checklistIsSmp = checklistCand?.source === "smp";
            const checklistPrereqs = getPrerequisites(checklistIsSmp);
            const checklistDone = prereqCount(checklistRecord, checklistIsSmp);
            const checklistTotal = prereqTotal(checklistIsSmp);
            return (
            <div className="mt-6 space-y-4">
              {checklistIsSmp && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-950/30 border border-blue-800/40 text-blue-300 text-xs">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  SMP worker — lighter checklist (photo + ID only)
                </div>
              )}
              {/* Progress summary */}
              <div className="bg-zinc-900 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-zinc-400">Completion</span>
                  <span className="text-sm font-medium text-white">{checklistDone}/{checklistTotal}</span>
                </div>
                <ProgressBar value={checklistDone} total={checklistTotal} />
                {checklistDone === checklistTotal && (
                  <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    All prerequisites complete — candidate is ready to convert
                  </p>
                )}
              </div>

              {/* Checklist items */}
              <div className="space-y-3">
                {checklistPrereqs.map(p => {
                  const checked = checklistRecord[p.key as keyof OnboardingRecord] as boolean;
                  const cand = getCandidateFor(checklistRecord);
                  let profileValue = p.profileKey && cand ? (cand as any)[p.profileKey] : null;
                  if (!profileValue && p.profileKey === "ibanFileUrl" && cand?.ibanNumber?.startsWith("/uploads/")) {
                    profileValue = cand.ibanNumber;
                  }
                  const hasProfileData = !!profileValue;
                  const isFilePrereq = p.isFile && p.profileKey;
                  const isContractPrereq = p.key === "hasSignedContract";
                  const docTypeMap: Record<string, string> = { photoUrl: "photo", nationalIdFileUrl: "nationalId", ibanFileUrl: "iban" };
                  const docType = p.profileKey ? docTypeMap[p.profileKey] : null;
                  const isConverted = checklistRecord.status === "converted" || checklistRecord.status === "rejected";
                  return (
                    <div
                      key={p.key}
                      className={`p-3 rounded-lg border transition-colors ${
                        checked ? "bg-emerald-950/20 border-emerald-800/40" : "bg-zinc-900 border-zinc-800"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {isContractPrereq ? (
                          <Checkbox
                            id={`prereq-${p.key}`}
                            data-testid={`checkbox-prereq-${p.key}`}
                            checked={checked}
                            disabled={isConverted}
                            onCheckedChange={val => handleChecklistToggle(checklistRecord, p.key, !!val)}
                            className="mt-0.5 border-zinc-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                          />
                        ) : (
                          <div className={`mt-0.5 h-4 w-4 rounded-sm border flex items-center justify-center shrink-0 ${
                            checked ? "bg-emerald-600 border-emerald-600" : "border-zinc-600 bg-transparent"
                          }`}>
                            {checked && <Check className="h-3 w-3 text-white" />}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white flex items-center gap-2">
                            <p.icon className="h-4 w-4 text-zinc-400" />
                            {p.label}
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5">{p.hint}</p>
                        </div>
                        {checked && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />}
                      </div>
                      {hasProfileData && isFilePrereq && (
                        <div className="mt-2 ml-8 bg-zinc-800/60 rounded-md p-2.5 border border-zinc-700/50">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Download className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                              {p.profileKey === "photoUrl" ? (
                                <a href={profileValue} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer" onClick={e => e.stopPropagation()}>
                                  <img src={profileValue} alt="Candidate photo" className="h-8 w-8 rounded-sm object-cover border border-zinc-600" />
                                  <span className="text-xs text-emerald-400 underline underline-offset-2 flex items-center gap-1">View photo <ExternalLink className="h-2.5 w-2.5" /></span>
                                </a>
                              ) : (
                                <a href={profileValue} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-400 underline underline-offset-2 flex items-center gap-1 hover:text-emerald-300 transition-colors cursor-pointer" onClick={e => e.stopPropagation()}>
                                  View document <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className="text-[10px] border-emerald-800 text-emerald-400">Uploaded</Badge>
                              {!isConverted && docType && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                  data-testid={`button-delete-doc-${docType}`}
                                  onClick={e => {
                                    e.stopPropagation();
                                    const labels: Record<string, string> = { photo: "Photo", nationalId: "National ID", iban: "IBAN Certificate" };
                                    setPendingDeleteDoc({ candidateId: cand!.id, docType: docType!, label: labels[docType!] ?? "Document" });
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      {!hasProfileData && isFilePrereq && (
                        <div className="mt-2 ml-8 bg-zinc-800/40 rounded-md p-2 border border-zinc-700/30">
                          <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                            <TriangleAlert className="h-3 w-3" />
                            Not yet submitted by candidate
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Notes */}
              <AutoSaveNotes
                recordId={checklistRecord.id}
                initialValue={checklistRecord.notes ?? ""}
                onSave={(id, notes) => checklistMutation.mutate({ id, data: { notes } })}
              />

              {/* Status indicator */}
              {checklistRecord.status !== "converted" && checklistRecord.status !== "rejected" && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                  checklistDone === checklistTotal
                    ? "bg-emerald-950/30 text-emerald-400 border border-emerald-800/40"
                    : "bg-zinc-900 text-zinc-400 border border-zinc-800"
                }`}>
                  {checklistDone === checklistTotal
                    ? <><CheckCircle2 className="h-4 w-4 shrink-0" /> Ready to convert — use the "Convert to Employee" button on the main list</>
                    : <><TriangleAlert className="h-4 w-4 shrink-0" /> {checklistTotal - checklistDone} prerequisite(s) still outstanding</>
                  }
                </div>
              )}
            </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ── Convert to Employee Dialog ── */}
      <Dialog open={!!convertRecord} onOpenChange={o => !o && setConvertRecord(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-emerald-400" />
              Convert to Employee
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              {convertRecord && (() => {
                const c = getCandidateFor(convertRecord);
                return `${c?.fullNameEn ?? "Candidate"} will be moved to Workforce.`;
              })()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-lg p-3 text-sm text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              All prerequisites verified. Fill in the employment details to complete the conversion.
            </div>

            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-sm">Position / Role <span className="text-red-400">*</span></Label>
                <Input
                  data-testid="input-convert-position"
                  value={convertForm.position}
                  onChange={e => setConvertForm(f => ({ ...f, position: e.target.value }))}
                  placeholder="e.g. Cart Supervisor"
                  className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-sm">Department</Label>
                <Input
                  data-testid="input-convert-department"
                  value={convertForm.department}
                  onChange={e => setConvertForm(f => ({ ...f, department: e.target.value }))}
                  placeholder="e.g. Ground Operations"
                  className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-sm">Start Date <span className="text-red-400">*</span></Label>
                <Input
                  data-testid="input-convert-startdate"
                  type="date"
                  value={convertForm.startDate}
                  onChange={e => setConvertForm(f => ({ ...f, startDate: e.target.value }))}
                  className="bg-zinc-900 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-sm">Monthly Salary (SAR)</Label>
                <Input
                  data-testid="input-convert-salary"
                  type="number"
                  value={convertForm.salary}
                  onChange={e => setConvertForm(f => ({ ...f, salary: e.target.value }))}
                  placeholder="e.g. 3500"
                  className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button
                variant="outline"
                className="border-zinc-700 text-zinc-300"
                onClick={() => setConvertRecord(null)}
              >
                Cancel
              </Button>
              <Button
                data-testid="button-confirm-convert"
                disabled={!convertForm.position || !convertForm.startDate || convertMutation.isPending}
                onClick={() => convertRecord && convertMutation.mutate({
                  id: convertRecord.id,
                  body: convertForm,
                })}
                className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white gap-2"
              >
                {convertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserCheck className="h-4 w-4" /> Confirm & Convert</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Convert Dialog ── */}
      <Dialog open={bulkConvertOpen} onOpenChange={setBulkConvertOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Convert to Employees</DialogTitle>
            <DialogDescription>
              Convert all {stats.ready} ready candidates into employees at once. Fill in the shared employment details below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-emerald-900/20 border border-emerald-800 rounded-lg p-3 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-300">{stats.ready} candidates ready</p>
                <p className="text-xs text-emerald-400/70">All prerequisites verified</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-zinc-300 text-sm">Position *</Label>
                <Input
                  data-testid="input-bulk-position"
                  value={bulkConvertForm.position}
                  onChange={e => setBulkConvertForm(f => ({ ...f, position: e.target.value }))}
                  placeholder="e.g. Cart Operator"
                  className="bg-zinc-900 border-zinc-700 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-zinc-300 text-sm">Department</Label>
                <Input
                  data-testid="input-bulk-department"
                  value={bulkConvertForm.department}
                  onChange={e => setBulkConvertForm(f => ({ ...f, department: e.target.value }))}
                  placeholder="e.g. Operations"
                  className="bg-zinc-900 border-zinc-700 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-zinc-300 text-sm">Start Date *</Label>
                <Input
                  data-testid="input-bulk-start-date"
                  type="date"
                  value={bulkConvertForm.startDate}
                  onChange={e => setBulkConvertForm(f => ({ ...f, startDate: e.target.value }))}
                  className="bg-zinc-900 border-zinc-700 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-zinc-300 text-sm">Salary (SAR)</Label>
                <Input
                  data-testid="input-bulk-salary"
                  type="number"
                  value={bulkConvertForm.salary}
                  onChange={e => setBulkConvertForm(f => ({ ...f, salary: e.target.value }))}
                  placeholder="e.g. 3000"
                  className="bg-zinc-900 border-zinc-700 text-white mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkConvertOpen(false)} className="border-zinc-700 text-zinc-300">
                Cancel
              </Button>
              <Button
                data-testid="button-confirm-bulk-convert"
                disabled={!bulkConvertForm.position || !bulkConvertForm.startDate || bulkConvertMutation.isPending}
                onClick={() => {
                  const readyIds = records.filter(r => r.status === "ready").map(r => r.id);
                  bulkConvertMutation.mutate({ ids: readyIds, ...bulkConvertForm });
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                {bulkConvertMutation.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Converting...</>
                  : <><UserCheck className="h-4 w-4" /> Convert {stats.ready} Employees</>
                }
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!rejectConfirmId} onOpenChange={(v) => { if (!v) setRejectConfirmId(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Reject this candidate?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will remove the candidate from the onboarding pipeline. You can re-admit them later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border" data-testid="button-reject-cancel">Keep</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-reject-confirm"
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (rejectConfirmId) rejectMutation.mutate(rejectConfirmId);
                setRejectConfirmId(null);
              }}
            >
              Yes, Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!pendingDeleteDoc} onOpenChange={(v) => { if (!v) setPendingDeleteDoc(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete {pendingDeleteDoc?.label}?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently remove the uploaded file. The candidate will need to re-upload it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border" data-testid="button-delete-doc-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-delete-doc-confirm"
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (pendingDeleteDoc) deleteDocMutation.mutate({ candidateId: pendingDeleteDoc.candidateId, docType: pendingDeleteDoc.docType });
                setPendingDeleteDoc(null);
              }}
            >
              Yes, Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
