import { useState, useRef, useCallback, useEffect } from "react";
import { printContract } from "@/lib/print-contract";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  FileText,
  GripVertical,
  Copy,
  Pencil,
  Archive,
  ChevronUp,
  ChevronDown,
  Upload,
  Image,
} from "lucide-react";

type OnboardingStatus = "pending" | "in_progress" | "ready" | "converted" | "rejected";

interface OnboardingRecord {
  id: string;
  candidateId: string;
  applicationId?: string | null;
  jobId?: string | null;
  eventId?: string | null;
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

interface CandidateContractRecord {
  id: string;
  candidateId: string;
  onboardingId?: string | null;
  templateId: string;
  status: "generated" | "sent" | "signed";
  signedAt?: string | null;
  signedIp?: string | null;
  createdAt: string;
}

function ContractPhaseSection({ onboardingRecord, candidate, docsComplete }: { onboardingRecord: OnboardingRecord; candidate: Candidate | undefined; docsComplete: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: templates = [] } = useQuery<ContractTemplate[]>({
    queryKey: ["/api/contract-templates"],
    select: (data: ContractTemplate[]) => data.filter(t => t.status === "active"),
  });

  const { data: contracts = [] } = useQuery<CandidateContractRecord[]>({
    queryKey: ["/api/candidate-contracts", { onboardingId: onboardingRecord.id }],
    queryFn: () => apiRequest("GET", `/api/candidate-contracts?onboardingId=${onboardingRecord.id}`).then(r => r.json()),
  });

  const generateMutation = useMutation({
    mutationFn: (templateId: string) =>
      apiRequest("POST", `/api/onboarding/${onboardingRecord.id}/generate-contract`, { templateId }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/candidate-contracts"] });
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      toast({ title: "Contract generated and ready for signing" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const latestContract = contracts[0];
  const isLocked = !docsComplete;

  return (
    <div className={`border-t border-zinc-800 pt-4 mt-4 ${isLocked ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2 mb-3">
        <FileSignature className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-white">Phase 2: Employment Contract</span>
        {isLocked && (
          <Badge className="text-[10px] bg-zinc-800 text-zinc-500 border-0">Complete documents first</Badge>
        )}
      </div>

      {isLocked ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          <p className="text-xs text-zinc-500 flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Complete all document requirements above to unlock contract generation
          </p>
        </div>
      ) : latestContract ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {latestContract.status === "signed" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Clock className="h-4 w-4 text-yellow-500" />
              )}
              <span className="text-sm text-white">
                {latestContract.status === "signed" ? "Contract Signed" : latestContract.status === "sent" ? "Awaiting Signature" : "Contract Generated"}
              </span>
            </div>
            <Badge className={`text-xs border-0 ${latestContract.status === "signed" ? "bg-emerald-900/40 text-emerald-400" : "bg-yellow-900/40 text-yellow-400"}`}>
              {latestContract.status}
            </Badge>
          </div>
          {latestContract.signedAt && (
            <p className="text-xs text-zinc-500">
              Signed on {new Date(latestContract.signedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-3">
          <p className="text-xs text-zinc-400">Select a contract template to generate for this candidate:</p>
          <div className="flex gap-2">
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 flex-1" data-testid="select-contract-template">
                <SelectValue placeholder="Select template…" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name} (v{t.version})</SelectItem>
                ))}
                {templates.length === 0 && (
                  <SelectItem value="none" disabled>No active templates — create one first</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1 shrink-0"
              disabled={!selectedTemplateId || generateMutation.isPending}
              onClick={() => selectedTemplateId && generateMutation.mutate(selectedTemplateId)}
              data-testid="button-generate-contract"
            >
              {generateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              Generate
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ContractTemplate {
  id: string;
  name: string;
  eventId?: string | null;
  version: number;
  parentTemplateId?: string | null;
  status: "draft" | "active" | "archived";
  logoUrl?: string | null;
  companyName?: string | null;
  headerText?: string | null;
  footerText?: string | null;
  articles: { title: string; body: string }[];
  createdAt: string;
}

interface Event {
  id: string;
  name: string;
}

const AVAILABLE_VARIABLES = [
  { key: "{{fullName}}", label: "Full Name" },
  { key: "{{nationalId}}", label: "National ID / Iqama" },
  { key: "{{phone}}", label: "Phone Number" },
  { key: "{{iban}}", label: "IBAN Number" },
  { key: "{{position}}", label: "Position" },
  { key: "{{salary}}", label: "Salary" },
  { key: "{{startDate}}", label: "Start Date" },
  { key: "{{eventName}}", label: "Event Name" },
  { key: "{{contractDate}}", label: "Contract Date" },
  { key: "{{companyName}}", label: "Company Name" },
];

function ContractTemplatesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<ContractTemplate | null>(null);

  const [formName, setFormName] = useState("");
  const [formEventId, setFormEventId] = useState("");
  const [formCompanyName, setFormCompanyName] = useState("");
  const [formHeaderText, setFormHeaderText] = useState("");
  const [formFooterText, setFormFooterText] = useState("");
  const [formDocumentFooter, setFormDocumentFooter] = useState("");
  const [formLogoAlignment, setFormLogoAlignment] = useState<"left" | "center" | "right">("center");
  const [formPreamble, setFormPreamble] = useState("");
  const [formArticles, setFormArticles] = useState<{ title: string; body: string; subArticles?: { title: string; body: string }[] }[]>([{ title: "", body: "", subArticles: [] }]);
  const lastFocusedTextarea = useRef<{ type: "preamble" } | { type: "article"; idx: number } | { type: "subarticle"; idx: number; subIdx: number } | null>(null);
  const [formStatus, setFormStatus] = useState<"draft" | "active">("draft");
  const logoInputRef = useRef<HTMLInputElement>(null);

  const { data: templates = [], isLoading } = useQuery<ContractTemplate[]>({
    queryKey: ["/api/contract-templates"],
  });

  const { data: eventsData = [] } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/contract-templates", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contract-templates"] });
      toast({ title: "Template created" });
      closeEditor();
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/contract-templates/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contract-templates"] });
      toast({ title: "Template updated" });
      closeEditor();
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/contract-templates/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contract-templates"] });
      toast({ title: "Template deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const newVersionMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/contract-templates/${id}/new-version`, {}).then(r => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/contract-templates"] });
      toast({ title: `New version (v${data.version}) created` });
      openEditor(data);
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const logoUploadMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/contract-templates/${id}/logo`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Logo upload failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contract-templates"] });
      toast({ title: "Logo uploaded" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  function openEditor(template?: ContractTemplate) {
    if (template) {
      setEditingTemplate(template);
      setFormName(template.name);
      setFormEventId(template.eventId || "");
      setFormCompanyName(template.companyName || "");
      setFormHeaderText(template.headerText || "");
      setFormFooterText(template.footerText || "");
      setFormDocumentFooter((template as any).documentFooter || "");
      setFormLogoAlignment((template as any).logoAlignment || "center");
      setFormPreamble((template as any).preamble || "");
      setFormArticles(Array.isArray(template.articles) && template.articles.length > 0 ? template.articles.map((a: any) => ({ title: a.title || "", body: a.body || "", subArticles: Array.isArray(a.subArticles) ? a.subArticles : [] })) : [{ title: "", body: "", subArticles: [] }]);
      setFormStatus(template.status === "archived" ? "draft" : template.status);
    } else {
      setEditingTemplate(null);
      setFormName("");
      setFormEventId("");
      setFormCompanyName("");
      setFormHeaderText("");
      setFormFooterText("");
      setFormDocumentFooter("");
      setFormLogoAlignment("center");
      setFormPreamble("");
      setFormArticles([{ title: "", body: "", subArticles: [] }]);
      setFormStatus("draft");
    }
    lastFocusedTextarea.current = null;
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingTemplate(null);
    lastFocusedTextarea.current = null;
  }

  function handleSave() {
    if (!formName.trim()) {
      toast({ title: "Template name is required", variant: "destructive" });
      return;
    }
    const validArticles = formArticles.filter(a => a.title.trim() || a.body.trim());
    if (validArticles.length === 0) {
      toast({ title: "Add at least one article", variant: "destructive" });
      return;
    }
    const payload = {
      name: formName.trim(),
      eventId: formEventId === "none" ? null : formEventId || null,
      companyName: formCompanyName.trim() || null,
      headerText: formHeaderText.trim() || null,
      footerText: formFooterText.trim() || null,
      documentFooter: formDocumentFooter.trim() || null,
      logoAlignment: formLogoAlignment,
      preamble: formPreamble.trim() || null,
      articles: validArticles,
      status: formStatus,
    };
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function addArticle() {
    setFormArticles(prev => [...prev, { title: "", body: "", subArticles: [] }]);
  }

  function removeArticle(idx: number) {
    setFormArticles(prev => prev.filter((_, i) => i !== idx));
  }

  function moveArticle(idx: number, dir: "up" | "down") {
    setFormArticles(prev => {
      const arr = [...prev];
      const target = dir === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  }

  function updateArticle(idx: number, field: "title" | "body", value: string) {
    setFormArticles(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  }

  function addSubArticle(articleIdx: number) {
    setFormArticles(prev => prev.map((a, i) => {
      if (i !== articleIdx) return a;
      return { ...a, subArticles: [...(a.subArticles || []), { title: "", body: "" }] };
    }));
  }

  function removeSubArticle(articleIdx: number, subIdx: number) {
    setFormArticles(prev => prev.map((a, i) => {
      if (i !== articleIdx) return a;
      return { ...a, subArticles: (a.subArticles || []).filter((_, si) => si !== subIdx) };
    }));
  }

  function updateSubArticle(articleIdx: number, subIdx: number, field: "title" | "body", value: string) {
    setFormArticles(prev => prev.map((a, i) => {
      if (i !== articleIdx) return a;
      return { ...a, subArticles: (a.subArticles || []).map((s, si) => si === subIdx ? { ...s, [field]: value } : s) };
    }));
  }

  function insertVariableAtCursor(variable: string) {
    const target = lastFocusedTextarea.current;
    if (!target) {
      toast({ title: "Click inside the preamble or an article body first", variant: "destructive" });
      return;
    }

    const el = document.querySelector(
      target.type === "preamble"
        ? `[data-testid="input-preamble"]`
        : target.type === "subarticle"
          ? `[data-testid="input-subarticle-body-${target.idx}-${target.subIdx}"]`
          : `[data-testid="input-article-body-${target.idx}"]`
    ) as HTMLTextAreaElement | null;

    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;

    if (target.type === "preamble") {
      const before = formPreamble.slice(0, start);
      const after = formPreamble.slice(end);
      setFormPreamble(before + variable + after);
    } else if (target.type === "subarticle") {
      const { idx, subIdx } = target;
      setFormArticles(prev => prev.map((a, i) => {
        if (i !== idx) return a;
        return { ...a, subArticles: (a.subArticles || []).map((s, si) => {
          if (si !== subIdx) return s;
          const before = s.body.slice(0, start);
          const after = s.body.slice(end);
          return { ...s, body: before + variable + after };
        })};
      }));
    } else {
      setFormArticles(prev => prev.map((a, i) => {
        if (i !== target.idx) return a;
        const before = a.body.slice(0, start);
        const after = a.body.slice(end);
        return { ...a, body: before + variable + after };
      }));
    }

    setTimeout(() => {
      if (el) {
        el.focus();
        const pos = start + variable.length;
        el.setSelectionRange(pos, pos);
      }
    }, 0);
  }

  function replaceVariables(text: string): string {
    let result = text;
    AVAILABLE_VARIABLES.forEach(v => {
      result = result.replace(new RegExp(v.key.replace(/[{}]/g, "\\$&"), "g"), `[${v.label}]`);
    });
    return result;
  }

  const activeTemplates = templates.filter(t => t.status !== "archived");
  const archivedTemplates = templates.filter(t => t.status === "archived");

  const statusBadge = (s: string) => {
    const styles: Record<string, string> = {
      draft: "bg-zinc-700 text-zinc-200",
      active: "bg-emerald-900/60 text-emerald-300",
      archived: "bg-zinc-800 text-zinc-500",
    };
    return styles[s] || styles.draft;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-zinc-400 text-sm">Create and manage employment contract templates for auto-generation</p>
        </div>
        <Button
          data-testid="button-create-template"
          onClick={() => openEditor()}
          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
        >
          <Plus className="h-4 w-4" />
          Create Template
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        </div>
      ) : activeTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="h-12 w-12 text-zinc-700 mb-4" />
          <p className="text-zinc-400 font-medium">No contract templates yet</p>
          <p className="text-zinc-600 text-sm mt-1">Create a template to start generating employment contracts</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeTemplates.map(t => {
            const eventName = eventsData.find(e => e.id === t.eventId)?.name;
            return (
              <div
                key={t.id}
                data-testid={`card-template-${t.id}`}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="h-12 w-12 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  {t.logoUrl ? (
                    <img src={t.logoUrl} alt="Logo" className="h-10 w-10 object-contain rounded" />
                  ) : (
                    <FileText className="h-6 w-6 text-zinc-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-sm">{t.name}</span>
                    <Badge className={`text-xs px-2 py-0.5 ${statusBadge(t.status)} border-0`}>
                      {t.status}
                    </Badge>
                    <span className="text-zinc-600 text-xs">v{t.version}</span>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-zinc-500">
                    {t.companyName && <span>{t.companyName}</span>}
                    {eventName && <span>Event: {eventName}</span>}
                    <span>{(Array.isArray(t.articles) ? t.articles.length : 0)} article{(Array.isArray(t.articles) ? t.articles.length : 0) !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1"
                    onClick={() => setPreviewTemplate(t)}
                    data-testid={`button-preview-template-${t.id}`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1"
                    onClick={() => openEditor(t)}
                    data-testid={`button-edit-template-${t.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1"
                    onClick={() => {
                      if (logoInputRef.current) {
                        logoInputRef.current.dataset.templateId = t.id;
                        logoInputRef.current.click();
                      }
                    }}
                    data-testid={`button-upload-logo-${t.id}`}
                  >
                    <Image className="h-3.5 w-3.5" />
                    Logo
                  </Button>
                  {t.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1"
                      onClick={() => newVersionMutation.mutate(t.id)}
                      data-testid={`button-new-version-${t.id}`}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      New Version
                    </Button>
                  )}
                  {t.status === "draft" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-900/60 text-red-400 hover:bg-red-950/40 gap-1"
                      onClick={() => deleteMutation.mutate(t.id)}
                      data-testid={`button-delete-template-${t.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {archivedTemplates.length > 0 && (
        <details className="mt-4">
          <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400">
            Archived versions ({archivedTemplates.length})
          </summary>
          <div className="space-y-2 mt-2">
            {archivedTemplates.map(t => (
              <div key={t.id} className="bg-zinc-950 border border-zinc-900 rounded-lg p-3 flex items-center gap-3 opacity-60">
                <FileText className="h-4 w-4 text-zinc-600" />
                <span className="text-sm text-zinc-500">{t.name} v{t.version}</span>
                <Badge className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-500 border-0">archived</Badge>
              </div>
            ))}
          </div>
        </details>
      )}

      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const templateId = logoInputRef.current?.dataset.templateId;
          if (file && templateId) {
            logoUploadMutation.mutate({ id: templateId, file });
          }
          e.target.value = "";
        }}
      />

      <Dialog open={editorOpen} onOpenChange={(v) => { if (!v) closeEditor(); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {editingTemplate ? `Edit Template: ${editingTemplate.name}` : "Create Contract Template"}
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              Define the contract structure with articles. Use {"{{variables}}"} for auto-filled candidate data.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Template Name *</Label>
                <Input
                  data-testid="input-template-name"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Ramadan 2026 Employment Agreement"
                  className="bg-zinc-900 border-zinc-700"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Linked Event</Label>
                <Select value={formEventId} onValueChange={setFormEventId}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700" data-testid="select-template-event">
                    <SelectValue placeholder="No event linked" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="none">No event linked</SelectItem>
                    {eventsData.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Company Name</Label>
                <Input
                  data-testid="input-company-name"
                  value={formCompanyName}
                  onChange={e => setFormCompanyName(e.target.value)}
                  placeholder="e.g. Luxury Carts Company Ltd"
                  className="bg-zinc-900 border-zinc-700"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Status</Label>
                <Select value={formStatus} onValueChange={(v: any) => setFormStatus(v)}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700" data-testid="select-template-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Header Text</Label>
                <Input
                  data-testid="input-header-text"
                  value={formHeaderText}
                  onChange={e => setFormHeaderText(e.target.value)}
                  placeholder="e.g. Employment Contract"
                  className="bg-zinc-900 border-zinc-700"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Logo Position</Label>
                <div className="flex gap-1">
                  {(["left", "center", "right"] as const).map(pos => (
                    <button
                      key={pos}
                      type="button"
                      data-testid={`button-logo-align-${pos}`}
                      className={`flex-1 h-9 rounded text-xs font-medium transition-colors ${formLogoAlignment === pos ? "bg-primary text-primary-foreground" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
                      onClick={() => setFormLogoAlignment(pos)}
                    >
                      {pos.charAt(0).toUpperCase() + pos.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4 space-y-4">
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                <p className="text-xs text-zinc-500 mb-2">Available variables (click to insert at cursor):</p>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_VARIABLES.map(v => (
                    <button
                      key={v.key}
                      type="button"
                      className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 rounded font-mono transition-colors"
                      onClick={() => insertVariableAtCursor(v.key)}
                    >
                      {v.key}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Preamble & Recitals</Label>
                <Textarea
                  value={formPreamble}
                  onChange={e => setFormPreamble(e.target.value)}
                  onFocus={() => { lastFocusedTextarea.current = { type: "preamble" }; }}
                  placeholder="e.g. This Employment Contract is entered into between {{companyName}} (hereinafter referred to as the &quot;Employer&quot;) and {{fullName}} (hereinafter referred to as the &quot;Employee&quot;), holder of ID No. {{nationalId}}…"
                  className="bg-zinc-900 border-zinc-700 text-sm min-h-24"
                  data-testid="input-preamble"
                />
                <p className="text-[11px] text-zinc-600">Introductory section — identifies the parties, recites the background, and sets up the definitions before the numbered articles begin.</p>
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Contract Articles</Label>
                <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 gap-1" onClick={addArticle} data-testid="button-add-article">
                  <Plus className="h-3.5 w-3.5" />
                  Add Article
                </Button>
              </div>

              <div className="space-y-3">
                {formArticles.map((article, idx) => (
                  <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-600 font-mono w-16 shrink-0">Art. {idx + 1}</span>
                      <Input
                        value={article.title}
                        onChange={e => updateArticle(idx, "title", e.target.value)}
                        placeholder="Article title"
                        className="bg-zinc-800 border-zinc-700 h-8 text-sm flex-1"
                        data-testid={`input-article-title-${idx}`}
                      />
                      <div className="flex gap-0.5">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-zinc-500 hover:text-white" onClick={() => moveArticle(idx, "up")} disabled={idx === 0}>
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-zinc-500 hover:text-white" onClick={() => moveArticle(idx, "down")} disabled={idx === formArticles.length - 1}>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-400" onClick={() => removeArticle(idx)} disabled={formArticles.length <= 1}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      value={article.body}
                      onChange={e => updateArticle(idx, "body", e.target.value)}
                      onFocus={() => { lastFocusedTextarea.current = { type: "article", idx }; }}
                      placeholder="Article body — use {{variables}} for auto-filled data"
                      className="bg-zinc-800 border-zinc-700 text-sm min-h-20"
                      data-testid={`input-article-body-${idx}`}
                    />
                    {(article.subArticles || []).map((sub, subIdx) => (
                      <div key={subIdx} className="ml-8 border-l-2 border-zinc-700 pl-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-600 font-mono w-12 shrink-0">{idx + 1}.{subIdx + 1}</span>
                          <Input
                            value={sub.title}
                            onChange={e => updateSubArticle(idx, subIdx, "title", e.target.value)}
                            placeholder="Sub-article title"
                            className="bg-zinc-800 border-zinc-700 h-7 text-xs flex-1"
                            data-testid={`input-subarticle-title-${idx}-${subIdx}`}
                          />
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-400" onClick={() => removeSubArticle(idx, subIdx)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <Textarea
                          value={sub.body}
                          onChange={e => updateSubArticle(idx, subIdx, "body", e.target.value)}
                          onFocus={() => { lastFocusedTextarea.current = { type: "subarticle", idx, subIdx }; }}
                          placeholder="Sub-article body — use {{variables}} for auto-filled data"
                          className="bg-zinc-800 border-zinc-700 text-xs min-h-16"
                          data-testid={`input-subarticle-body-${idx}-${subIdx}`}
                        />
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-zinc-500 hover:text-zinc-300 ml-8"
                      onClick={() => addSubArticle(idx)}
                      data-testid={`button-add-subarticle-${idx}`}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Sub-Article {idx + 1}.{(article.subArticles || []).length + 1}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400 uppercase tracking-wider">Testimonium</Label>
              <Textarea
                data-testid="input-footer-text"
                value={formFooterText}
                onChange={e => setFormFooterText(e.target.value)}
                onFocus={() => { lastFocusedTextarea.current = { type: "preamble" }; }}
                placeholder="e.g. IN WITNESS WHEREOF, the parties hereto have executed this Agreement as of the date first written above."
                className="bg-zinc-900 border-zinc-700 text-sm min-h-20"
              />
              <p className="text-[11px] text-zinc-600">Closing clause — the formal attestation that the parties have agreed and signed the contract.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400 uppercase tracking-wider">Document Footer</Label>
              <Textarea
                data-testid="input-document-footer"
                value={formDocumentFooter}
                onChange={e => setFormDocumentFooter(e.target.value)}
                placeholder="e.g. Luxury Carts Company Ltd | CR No. 4030123456 | P.O. Box 12345, Makkah 21955, Saudi Arabia | Tel: +966 12 345 6789"
                className="bg-zinc-900 border-zinc-700 text-[11px] min-h-16 font-mono"
              />
              <p className="text-[11px] text-zinc-600">Small print at the bottom of every page — company name, commercial registration, address, contact details.</p>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" className="border-zinc-700" onClick={closeEditor}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
              data-testid="button-save-template"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingTemplate ? "Update Template" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewTemplate} onOpenChange={(v) => { if (!v) setPreviewTemplate(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Preview: {previewTemplate?.name}
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              This shows how the contract will look with sample data filled in.
            </DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <>
              <div className="contract-print-area mt-4 bg-white text-black rounded-lg p-8 space-y-6 font-serif">
                {previewTemplate.logoUrl && (
                  <div className={`flex ${(previewTemplate as any).logoAlignment === "left" ? "justify-start" : (previewTemplate as any).logoAlignment === "right" ? "justify-end" : "justify-center"}`}>
                    <img src={previewTemplate.logoUrl} alt="Logo" className="h-16 object-contain" />
                  </div>
                )}
                {previewTemplate.headerText && (
                  <p className="text-center text-xl font-bold border-b pb-4">{previewTemplate.headerText}</p>
                )}
                {(previewTemplate as any).preamble && (
                  <div className="text-sm whitespace-pre-wrap leading-relaxed italic">
                    {replaceVariables((previewTemplate as any).preamble)}
                  </div>
                )}
                {Array.isArray(previewTemplate.articles) && previewTemplate.articles.map((article: any, idx: number) => (
                  <div key={idx}>
                    <h3 className="font-bold text-sm mb-1">Article {idx + 1}: {article.title}</h3>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{replaceVariables(article.body)}</p>
                    {Array.isArray(article.subArticles) && article.subArticles.map((sub: any, subIdx: number) => (
                      <div key={subIdx} className="ml-6 mt-2">
                        <h4 className="font-bold text-sm mb-0.5">{idx + 1}.{subIdx + 1} {sub.title}</h4>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{replaceVariables(sub.body)}</p>
                      </div>
                    ))}
                  </div>
                ))}
                {previewTemplate.footerText && (
                  <div className="border-t pt-4 mt-6">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed italic">{replaceVariables(previewTemplate.footerText)}</p>
                  </div>
                )}
                <div className="border-t pt-4 grid grid-cols-2 gap-8 mt-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-8">Employer Signature</p>
                    <div className="border-b border-gray-300" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-8">Employee Signature</p>
                    <div className="border-b border-gray-300" />
                  </div>
                </div>
                {(previewTemplate as any).documentFooter && (
                  <div className="border-t border-gray-200 mt-10 pt-3 no-print">
                    <p className="text-[10px] text-gray-400 text-center whitespace-pre-wrap leading-relaxed">{(previewTemplate as any).documentFooter}</p>
                  </div>
                )}
                {(previewTemplate as any).documentFooter && (
                  <div className="contract-page-footer" dangerouslySetInnerHTML={{ __html: ((previewTemplate as any).documentFooter || '').replace(/\n/g, '<br/>') }} />
                )}
              </div>
              <div className="flex justify-end mt-3 no-print">
                <Button
                  variant="outline"
                  className="border-zinc-700 text-zinc-300 gap-2"
                  onClick={() => printContract(previewTemplate?.name || 'Contract')}
                  data-testid="button-print-contract"
                >
                  <Download className="h-4 w-4" />
                  Print / Export PDF
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
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
      const q = search.toLowerCase();
      const name = candidate?.fullNameEn?.toLowerCase() ?? "";
      const code = candidate?.candidateCode?.toLowerCase() ?? "";
      const nationalId = candidate?.nationalId?.toLowerCase() ?? "";
      const iqama = (candidate as any)?.iqamaNumber?.toLowerCase() ?? "";
      const phone = candidate?.phone?.toLowerCase() ?? "";
      if (!name.includes(q) && !code.includes(q) && !nationalId.includes(q) && !iqama.includes(q) && !phone.includes(q)) return false;
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
        </div>

        <Tabs defaultValue="pipeline" className="w-full">
          <TabsList className="bg-zinc-900 border border-zinc-800 p-1">
            <TabsTrigger value="pipeline" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 gap-2" data-testid="tab-pipeline">
              <ClipboardCheck className="h-4 w-4" />
              Onboarding Pipeline
            </TabsTrigger>
            <TabsTrigger value="templates" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 gap-2" data-testid="tab-templates">
              <FileText className="h-4 w-4" />
              Contract Templates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="space-y-6 mt-4">
        <div className="flex justify-end gap-2">
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
              placeholder="Search by name, ID number, or phone…"
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
                    {(() => {
                      const docPrereqs = getPrerequisites(isSmp).filter(p => p.key !== "hasSignedContract");
                      const docsComplete = docPrereqs.every(p => rec[p.key as keyof OnboardingRecord]);
                      const docsDone = docPrereqs.filter(p => rec[p.key as keyof OnboardingRecord]).length;
                      const contractSigned = !!rec.hasSignedContract || !!rec.contractSignedAt;
                      const phase = isConverted ? 3 : isSmp ? (docsComplete ? 3 : 1) : contractSigned ? 3 : docsComplete ? 2 : 1;
                      return (
                        <div className="mt-2">
                          <div className="flex items-center gap-1 text-xs">
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${phase >= 1 ? (docsComplete ? "bg-emerald-900/40 text-emerald-400" : "bg-yellow-900/40 text-yellow-400") : "bg-zinc-800 text-zinc-500"}`}>
                              <ClipboardCheck className="h-3 w-3" />
                              Docs {docsDone}/{docPrereqs.length}
                            </div>
                            <div className={`w-4 h-px ${phase >= 2 ? "bg-emerald-700" : "bg-zinc-700"}`} />
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${isSmp ? "bg-zinc-800 text-zinc-600" : phase >= 2 ? (contractSigned ? "bg-emerald-900/40 text-emerald-400" : "bg-yellow-900/40 text-yellow-400") : "bg-zinc-800 text-zinc-600"}`}>
                              <FileSignature className="h-3 w-3" />
                              {isSmp ? "N/A" : contractSigned ? "Signed" : docsComplete ? "Pending" : "Locked"}
                            </div>
                            <div className={`w-4 h-px ${phase >= 3 ? "bg-emerald-700" : "bg-zinc-700"}`} />
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${phase >= 3 ? "bg-emerald-900/40 text-emerald-400" : "bg-zinc-800 text-zinc-600"}`}>
                              <CheckCircle2 className="h-3 w-3" />
                              {isConverted ? "Converted" : phase >= 3 ? "Ready" : "—"}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
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
          </TabsContent>

          <TabsContent value="templates" className="mt-4">
            <ContractTemplatesTab />
          </TabsContent>
        </Tabs>
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

              {!checklistIsSmp && (
                <ContractPhaseSection
                  onboardingRecord={checklistRecord}
                  candidate={checklistCand}
                  docsComplete={checklistPrereqs.filter(p => p.key !== "hasSignedContract").every(p => checklistRecord[p.key as keyof OnboardingRecord])}
                />
              )}

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
                <DatePickerField
                  data-testid="input-convert-startdate"
                  value={convertForm.startDate}
                  onChange={v => setConvertForm(f => ({ ...f, startDate: v }))}
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
                <DatePickerField
                  data-testid="input-bulk-start-date"
                  value={bulkConvertForm.startDate}
                  onChange={v => setBulkConvertForm(f => ({ ...f, startDate: v }))}
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
