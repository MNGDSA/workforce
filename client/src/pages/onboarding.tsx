import { useState } from "react";
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
  UserCheck,
  Search,
  Plus,
  ClipboardCheck,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronRight,
  Users,
  Camera,
  CreditCard,
  IdCard,
  HeartPulse,
  FileSignature,
  Phone,
  Briefcase,
  Loader2,
  TriangleAlert,
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
  hasMedicalFitness: boolean;
  hasSignedContract: boolean;
  hasEmergencyContact: boolean;
  contractSignedAt?: string | null;
  contractUrl?: string | null;
  position?: string | null;
  department?: string | null;
  startDate?: string | null;
  salary?: string | null;
  notes?: string | null;
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
  ibanNumber?: string | null;
  photoUrl?: string | null;
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

const PREREQUISITES = [
  { key: "hasPhoto",           label: "Personal Photo",       icon: Camera,        hint: "Clear ID-style photo uploaded" },
  { key: "hasIban",            label: "IBAN Number",          icon: CreditCard,    hint: "Saudi bank IBAN on file" },
  { key: "hasNationalId",      label: "National ID / Iqama",  icon: IdCard,        hint: "ID copy submitted & verified" },
  { key: "hasMedicalFitness",  label: "Medical Fitness",      icon: HeartPulse,    hint: "Fitness certificate received" },
  { key: "hasSignedContract",  label: "Signed Contract",      icon: FileSignature, hint: "Employment contract signed" },
  { key: "hasEmergencyContact",label: "Emergency Contact",    icon: Phone,         hint: "Contact details recorded" },
] as const;

function prereqCount(rec: OnboardingRecord) {
  return [rec.hasPhoto, rec.hasIban, rec.hasNationalId, rec.hasMedicalFitness, rec.hasSignedContract, rec.hasEmergencyContact].filter(Boolean).length;
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [admitOpen, setAdmitOpen] = useState(false);
  const [checklistRecord, setChecklistRecord] = useState<OnboardingRecord | null>(null);
  const [convertRecord, setConvertRecord] = useState<OnboardingRecord | null>(null);
  const [admitSearch, setAdmitSearch] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [convertForm, setConvertForm] = useState({ position: "", department: "", startDate: "", salary: "" });

  const { data: records = [], isLoading } = useQuery<OnboardingRecord[]>({
    queryKey: ["/api/onboarding"],
  });

  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates", { limit: 200, status: "active" }],
    queryFn: () => apiRequest("/api/candidates?limit=200"),
    select: (r: any) => r?.data ?? [],
  });

  const { data: applications = [] } = useQuery<Application[]>({
    queryKey: ["/api/applications"],
    select: (r: any) => Array.isArray(r) ? r : [],
  });

  const admitMutation = useMutation({
    mutationFn: (body: object) => apiRequest("/api/onboarding", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      setAdmitOpen(false);
      setSelectedCandidate(null);
      setAdmitSearch("");
      toast({ title: "Candidate admitted to onboarding" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message ?? "Could not admit candidate", variant: "destructive" }),
  });

  const checklistMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      apiRequest(`/api/onboarding/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      // Refresh the local checklist record
      setChecklistRecord(prev => prev ? { ...prev, ...(checklistMutation.variables?.data as any) } : prev);
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/onboarding/${id}`, { method: "PATCH", body: JSON.stringify({ status: "rejected" }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      toast({ title: "Candidate rejected from onboarding" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const convertMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      apiRequest(`/api/onboarding/${id}/convert`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      setConvertRecord(null);
      setConvertForm({ position: "", department: "", startDate: "", salary: "" });
      toast({ title: "Successfully converted to employee!", description: "Workforce record created." });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/onboarding/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      toast({ title: "Record removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const filtered = records.filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
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

  function getCandidateFor(rec: OnboardingRecord) {
    return candidates.find(c => c.id === rec.candidateId);
  }

  function handleAdmit() {
    if (!selectedCandidate) return;
    const app = applications.find(a => a.candidateId === selectedCandidate.id && ["interviewed", "hired", "shortlisted"].includes(a.status));
    admitMutation.mutate({
      candidateId: selectedCandidate.id,
      applicationId: app?.id ?? null,
      jobId: app?.jobId ?? null,
      hasPhoto: selectedCandidate.hasPhoto,
      hasIban: selectedCandidate.hasIban,
      hasNationalId: selectedCandidate.hasNationalId,
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
          <Button
            data-testid="button-admit-candidate"
            onClick={() => setAdmitOpen(true)}
            className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white gap-2"
          >
            <Plus className="h-4 w-4" />
            Admit Candidate
          </Button>
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
              const done = prereqCount(rec);
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
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <ProgressBar value={done} total={6} />
                      <span className="text-xs text-zinc-500 shrink-0">{done}/6</span>
                    </div>
                    {/* Prereq chips */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {PREREQUISITES.map(p => (
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
                        onClick={() => rejectMutation.mutate(rec.id)}
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
            <DialogTitle className="font-display text-lg">Admit Candidate to Onboarding</DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              Only candidates who have been interviewed or shortlisted are eligible.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                data-testid="input-admit-search"
                placeholder="Search candidates…"
                value={admitSearch}
                onChange={e => setAdmitSearch(e.target.value)}
                className="pl-9 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {admitFiltered.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-sm">
                  {eligibleCandidates.length === 0
                    ? "No eligible candidates — candidates must be interviewed or shortlisted first"
                    : "No candidates match your search"}
                </div>
              ) : admitFiltered.map(c => (
                <button
                  key={c.id}
                  data-testid={`button-select-candidate-${c.id}`}
                  onClick={() => setSelectedCandidate(prev => prev?.id === c.id ? null : c)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center gap-3 ${
                    selectedCandidate?.id === c.id
                      ? "border-[hsl(155,45%,45%)] bg-[hsl(155,45%,45%)]/10"
                      : "border-zinc-800 hover:border-zinc-600 bg-zinc-900"
                  }`}
                >
                  <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-300 shrink-0">
                    {c.fullNameEn.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{c.fullNameEn}</p>
                    <p className="text-xs text-zinc-500 font-mono">{c.candidateCode}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {c.hasPhoto     && <span title="Photo"     className="text-emerald-500"><Camera    className="h-3.5 w-3.5" /></span>}
                    {c.hasIban      && <span title="IBAN"      className="text-emerald-500"><CreditCard className="h-3.5 w-3.5" /></span>}
                    {c.hasNationalId && <span title="National ID" className="text-emerald-500"><IdCard  className="h-3.5 w-3.5" /></span>}
                  </div>
                  {selectedCandidate?.id === c.id && <ChevronRight className="h-4 w-4 text-[hsl(155,45%,45%)]" />}
                </button>
              ))}
            </div>

            {selectedCandidate && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm">
                <p className="text-zinc-400">Selected: <span className="text-white font-medium">{selectedCandidate.fullNameEn}</span></p>
                <p className="text-zinc-500 text-xs mt-0.5">Profile flags already available will be pre-checked in the onboarding checklist.</p>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setAdmitOpen(false)}>
                Cancel
              </Button>
              <Button
                data-testid="button-confirm-admit"
                disabled={!selectedCandidate || admitMutation.isPending}
                onClick={handleAdmit}
                className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
              >
                {admitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Admit to Onboarding"}
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

          {checklistRecord && (
            <div className="mt-6 space-y-4">
              {/* Progress summary */}
              <div className="bg-zinc-900 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-zinc-400">Completion</span>
                  <span className="text-sm font-medium text-white">{prereqCount(checklistRecord)}/6</span>
                </div>
                <ProgressBar value={prereqCount(checklistRecord)} total={6} />
                {prereqCount(checklistRecord) === 6 && (
                  <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    All prerequisites complete — candidate is ready to convert
                  </p>
                )}
              </div>

              {/* Checklist items */}
              <div className="space-y-3">
                {PREREQUISITES.map(p => {
                  const checked = checklistRecord[p.key as keyof OnboardingRecord] as boolean;
                  return (
                    <div
                      key={p.key}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        checked ? "bg-emerald-950/20 border-emerald-800/40" : "bg-zinc-900 border-zinc-800"
                      }`}
                    >
                      <Checkbox
                        id={`prereq-${p.key}`}
                        data-testid={`checkbox-prereq-${p.key}`}
                        checked={checked}
                        onCheckedChange={val => handleChecklistToggle(checklistRecord, p.key, !!val)}
                        className="mt-0.5 border-zinc-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                      />
                      <div className="flex-1">
                        <label htmlFor={`prereq-${p.key}`} className="text-sm font-medium text-white cursor-pointer flex items-center gap-2">
                          <p.icon className="h-4 w-4 text-zinc-400" />
                          {p.label}
                        </label>
                        <p className="text-xs text-zinc-500 mt-0.5">{p.hint}</p>
                      </div>
                      {checked && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />}
                    </div>
                  );
                })}
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-zinc-400 text-sm">Notes</Label>
                <Textarea
                  data-testid="textarea-onboarding-notes"
                  placeholder="Add notes about this candidate's onboarding…"
                  defaultValue={checklistRecord.notes ?? ""}
                  onBlur={e => {
                    if (e.target.value !== checklistRecord.notes) {
                      checklistMutation.mutate({ id: checklistRecord.id, data: { notes: e.target.value } });
                    }
                  }}
                  className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 resize-none text-sm"
                  rows={3}
                />
              </div>

              {/* Status indicator */}
              {checklistRecord.status !== "converted" && checklistRecord.status !== "rejected" && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                  prereqCount(checklistRecord) === 6
                    ? "bg-emerald-950/30 text-emerald-400 border border-emerald-800/40"
                    : "bg-zinc-900 text-zinc-400 border border-zinc-800"
                }`}>
                  {prereqCount(checklistRecord) === 6
                    ? <><CheckCircle2 className="h-4 w-4 shrink-0" /> Ready to convert — use the "Convert to Employee" button on the main list</>
                    : <><TriangleAlert className="h-4 w-4 shrink-0" /> {6 - prereqCount(checklistRecord)} prerequisite(s) still outstanding</>
                  }
                </div>
              )}
            </div>
          )}
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
    </Layout>
  );
}
