import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatNumber, formatDate } from "@/lib/format";
import { printContract } from "@/lib/print-contract";
import { PdfViewer } from "@/components/pdf-viewer";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toProxiedFileUrl } from "@/lib/file-url";
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
  Bell,
  BellOff,
  Send,
  Pause,
  Play,
  AlertTriangle,
  Syringe,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

type OnboardingStatus = "pending" | "in_progress" | "ready" | "converted" | "rejected" | "terminated";

// Shape returned by GET /api/onboarding/admit-eligible. Mirrors the legacy
// in-component derivation so the dialog renderer keeps the exact same
// inputs (name + IDs + readiness pills + applicationId/jobId for the
// admit POST). One row per candidate; deduplication happens server-side.
type EligibleCandidate = {
  id: string;
  fullNameEn: string;
  nationalId: string | null;
  phone: string | null;
  photoUrl: string | null;
  hasPhoto: boolean | null;
  hasIban: boolean | null;
  hasNationalId: boolean | null;
  hasVaccinationReport: boolean | null;
  classification: "individual" | "smp" | null;
  applicationId: string;
  jobId: string | null;
};

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
  startDate?: string | null;
  notes?: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
  convertedAt?: string | null;
  createdAt: string;
  // Task #214 — reminder state (server-derived, see ReminderRowStatus)
  lastReminderSentAt?: string | null;
  reminderCount?: number;
  remindersPausedAt?: string | null;
  eliminatedAt?: string | null;
}

// Task #214 — onboarding document reminders.
type ReminderDocId = "photo" | "iban" | "national_id" | "vaccination_report";
type ReminderRowState =
  | "off" | "pending" | "due" | "paused" | "warning" | "max_reached" | "eliminated";

interface ReminderConfig {
  enabled: boolean;
  firstAfterHours: number;
  repeatEveryHours: number;
  maxReminders: number;
  totalDeadlineDays: number;
  finalWarningHours: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  quietHoursTz: string;
  requiredDocs: ReminderDocId[];
}

interface ReminderEvent {
  /** 1-based reminder index for "regular" kind; null for the final-warning event. */
  n: number | null;
  kind: "reminder" | "final_warning";
  sentAt: string;
}

interface ReminderRowStatus {
  onboardingId: string;
  state: ReminderRowState;
  missingDocs: ReminderDocId[];
  reminderCount: number;
  maxReminders: number;
  lastReminderSentAt: string | null;
  nextScheduledAt: string | null;
  eliminationAt: string | null;
  finalWarningAt: string | null;
  finalWarningSentAt: string | null;
  remindersPaused: boolean;
  events: ReminderEvent[];
}

// Inline reminder block carried by GET /api/onboarding (per row).
interface OnboardingReminderInline {
  enabled: boolean;
  paused: boolean;
  count: number;
  max: number;
  lastSentAt: string | null;
  nextScheduledAt: string | null;
  eliminationAt: string | null;
  finalWarningAt: string | null;
  finalWarningSentAt: string | null;
  state: ReminderRowState;
  missingDocs: ReminderDocId[];
  events: ReminderEvent[];
}

type ReminderTemplateKey =
  | "onboarding_reminder_sms_ar"
  | "onboarding_reminder_sms_en"
  | "onboarding_final_warning_sms_ar"
  | "onboarding_final_warning_sms_en";

type ReminderTemplates = Record<ReminderTemplateKey, string>;

interface ReminderActivityRow {
  onboardingId: string;
  candidateId: string;
  candidateName: string | null;
  candidatePhone: string | null;
  missingDocs: ReminderDocId[];
  reminderCount: number;
  maxReminders: number;
  remindersPaused: boolean;
  lastReminderSentAt: string | null;
  nextScheduledAt: string | null;
  eliminationAt: string | null;
  state: ReminderRowState;
  latestSmsOutboxId: string | null;
  latestSmsKind: string | null;
  latestSmsSentAt: string | null;
  latestSmsLastError: string | null;
}

interface Candidate {
  id: string;
  fullNameEn: string;
  phone?: string | null;
  nationalId?: string | null;
  hasPhoto: boolean;
  hasIban: boolean;
  hasNationalId: boolean;
  hasVaccinationReport?: boolean;
  status: string;
  source: string;
  ibanNumber?: string | null;
  ibanFileUrl?: string | null;
  photoUrl?: string | null;
  nationalIdFileUrl?: string | null;
  vaccinationReportFileUrl?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
}

interface Application {
  id: string;
  candidateId: string;
  status: string;
  jobId?: string | null;
  // Server includes a joined `candidate` summary when the requester has
  // applications:read (or super-admin). The admit dialog relies on this
  // joined data so it stays correct for tenants with more candidates than
  // /api/candidates returns in a single page.
  candidate?: {
    id: string;
    fullNameEn: string;
    nationalId: string | null;
    phone: string | null;
    email: string | null;
    photoUrl: string | null;
    hasPhoto: boolean | null;
    hasIban: boolean | null;
    hasNationalId: boolean | null;
    hasVaccinationReport: boolean | null;
    classification: "individual" | "smp" | null;
    status: string | null;
    archivedAt: string | null;
  } | null;
}

const STATUS_CONFIG: Record<OnboardingStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending:     { label: "Pending",     color: "bg-zinc-700 text-zinc-200",        icon: Clock },
  in_progress: { label: "In Progress", color: "bg-yellow-900/60 text-yellow-300", icon: ClipboardCheck },
  ready:       { label: "Ready",       color: "bg-emerald-900/60 text-emerald-300", icon: CheckCircle2 },
  converted:   { label: "Converted",   color: "bg-blue-900/60 text-blue-300",     icon: UserCheck },
  rejected:    { label: "Rejected",    color: "bg-red-900/60 text-red-300",       icon: XCircle },
  terminated:  { label: "Terminated",  color: "bg-orange-900/60 text-orange-300", icon: XCircle },
};

const ALL_PREREQUISITES = [
  { key: "hasPhoto",              label: "Personal Photo",       icon: Camera,        hint: "Clear ID-style photo uploaded",     profileKey: "photoUrl" as const,                    isFile: true,  smp: true },
  { key: "hasIban",               label: "IBAN Certificate",     icon: CreditCard,    hint: "Saudi bank IBAN on file",           profileKey: "ibanFileUrl" as const,                 isFile: true,  smp: false },
  { key: "hasNationalId",         label: "National ID / Iqama",  icon: IdCard,        hint: "ID copy submitted & verified",      profileKey: "nationalIdFileUrl" as const,           isFile: true,  smp: true },
  { key: "hasVaccinationReport",  label: "Vaccination Report",   icon: Syringe,       hint: "Workplace immunization on file",    profileKey: "vaccinationReportFileUrl" as const,    isFile: true,  smp: true },
] as const;

function getPrerequisites(isSmp: boolean) {
  return isSmp ? ALL_PREREQUISITES.filter(p => p.smp) : ALL_PREREQUISITES;
}

// Single source of truth for whether a prerequisite is satisfied.
// For *file* prereqs (photo / national-ID / IBAN certificate) we read
// the candidate's actual file URL — never the boolean shadow flag on
// the onboarding record. The flags can drift (e.g. server-side
// `applyServerIbanFields` flips `hasIban=true` from the IBAN *number*
// alone, even when no certificate file has been uploaded), and the
// drift was rendering the IBAN tile with a green check + 3/3
// "ready to convert" while the body said "Not yet submitted".
// For non-file prereqs the boolean flag is still the source of truth.
function isPrereqSatisfied(
  rec: OnboardingRecord,
  cand: any,
  p: typeof ALL_PREREQUISITES[number],
): boolean {
  if (p.isFile && p.profileKey) {
    if (cand && (cand as any)[p.profileKey]) return true;
    // Legacy fallback: some records store the IBAN file URL in the
    // `ibanNumber` text column when uploaded via older code paths.
    if (p.profileKey === "ibanFileUrl" && typeof cand?.ibanNumber === "string" && cand.ibanNumber.startsWith("/uploads/")) {
      return true;
    }
    return false;
  }
  return !!rec[p.key as keyof OnboardingRecord];
}

function prereqCount(rec: OnboardingRecord, cand: any, isSmp: boolean) {
  return getPrerequisites(isSmp).filter(p => isPrereqSatisfied(rec, cand, p)).length;
}

function prereqTotal(isSmp: boolean) {
  return getPrerequisites(isSmp).length;
}

function AutoSaveNotes({ recordId, initialValue, onSave }: { recordId: string; initialValue: string; onSave: (id: string, notes: string) => void }) {
  const { t } = useTranslation("onboarding");
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
        <Label className="text-zinc-400 text-sm">{t("checklist.notes")}</Label>
        <span className="text-[11px] text-zinc-500 flex items-center gap-1">
          {saveStatus === "saving" && <><Loader2 className="h-3 w-3 animate-spin" /> {t("checklist.saving")}</>}
          {saveStatus === "saved" && <><Check className="h-3 w-3 text-emerald-500" /> {t("checklist.saved")}</>}
          {saveStatus === "idle" && t("checklist.autoSaved")}
        </span>
      </div>
      <Textarea
        data-testid="textarea-onboarding-notes"
        placeholder={t("checklist.notesPlaceholder")}
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
  status: "generated" | "awaiting_signing" | "sent" | "signed";
  signedAt?: string | null;
  signedIp?: string | null;
  snapshotArticles?: any[];
  snapshotVariables?: Record<string, string>;
  createdAt: string;
}

function ContractPhaseSection({ onboardingRecord, candidate, docsComplete }: { onboardingRecord: OnboardingRecord; candidate: Candidate | undefined; docsComplete: boolean }) {
  const { t, i18n } = useTranslation("onboarding");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: templates = [] } = useQuery<ContractTemplate[]>({
    queryKey: ["/api/contract-templates"],
    select: (data: ContractTemplate[]) => data.filter(t => t.status === "active"),
  });

  const { data: contracts = [] } = useQuery<CandidateContractRecord[]>({
    queryKey: ["/api/candidate-contracts", { onboardingId: onboardingRecord.id }],
    queryFn: () => apiRequest("GET", `/api/candidate-contracts?onboardingId=${onboardingRecord.id}`).then(r => r.json()),
    refetchInterval: 15000,
  });

  const generateMutation = useMutation({
    mutationFn: (templateId: string) =>
      apiRequest("POST", `/api/onboarding/${onboardingRecord.id}/generate-contract`, { templateId }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/candidate-contracts"] });
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      toast({ title: t("toasts.contractGenerated") });
    },
    onError: (e: any) => toast({ title: t("toasts.error"), description: e?.message, variant: "destructive" }),
  });

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const latestContract = contracts[0];
  const [contractPreviewOpen, setContractPreviewOpen] = useState(false);
  const isLocked = !docsComplete;

  function replaceVars(text: string, vars?: Record<string, string>): string {
    let result = text;
    if (vars) {
      Object.entries(vars).forEach(([key, val]) => {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(val));
      });
    }
    return result;
  }

  const previewTpl = latestContract ? templates.find(t => t.id === latestContract.templateId) : null;

  return (
    <div className={`border-t border-zinc-800 pt-4 mt-4 ${isLocked ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2 mb-3">
        <FileSignature className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-white">{t("contract.phase2")}</span>
        {isLocked && (
          <Badge className="text-[10px] bg-zinc-800 text-zinc-500 border-0">{t("contract.completeDocsFirst")}</Badge>
        )}
      </div>

      {isLocked ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          <p className="text-xs text-zinc-500 flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            {t("contract.unlockHint")}
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
                {latestContract.status === "signed" ? t("contract.statusSigned") : latestContract.status === "awaiting_signing" ? t("contract.statusAwaiting") : latestContract.status === "sent" ? t("contract.statusSent") : t("contract.statusGenerated")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-zinc-400 hover:text-white"
                onClick={() => setContractPreviewOpen(true)}
                data-testid="button-view-candidate-contract"
              >
                <Eye className="h-3 w-3 me-1" />
                {t("contract.view")}
              </Button>
              <Badge className={`text-xs border-0 ${latestContract.status === "signed" ? "bg-emerald-900/40 text-emerald-400" : "bg-yellow-900/40 text-yellow-400"}`}>
                {latestContract.status === "signed" ? t("contract.badgeSigned") : latestContract.status === "awaiting_signing" ? t("contract.badgeAwaiting") : latestContract.status}
              </Badge>
            </div>
          </div>
          {latestContract.signedAt && (
            <p className="text-xs text-zinc-500" dir="ltr">
              {t("contract.signedOn", { date: formatDate(latestContract.signedAt, i18n.language) })}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-3">
          <p className="text-xs text-zinc-400">{t("contract.selectTemplate")}</p>
          <div className="flex gap-2">
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 flex-1" data-testid="select-contract-template">
                <SelectValue placeholder={t("contract.templatePlaceholder")} />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                {templates.map(tpl => (
                  <SelectItem key={tpl.id} value={tpl.id}><bdi>{tpl.name}</bdi> ({t("templates.version", { n: formatNumber(tpl.version) })})</SelectItem>
                ))}
                {templates.length === 0 && (
                  <SelectItem value="none" disabled>{t("contract.noActiveTemplates")}</SelectItem>
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
              {t("contract.generate")}
            </Button>
          </div>
        </div>
      )}

      {latestContract && previewTpl && (
        <Dialog open={contractPreviewOpen} onOpenChange={setContractPreviewOpen}>
          <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-lg flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                {t("contract.candidateContractTitle")}
                {latestContract.status === "signed" && (
                  <Badge className="bg-emerald-900/40 text-emerald-400 border-0 text-xs">{t("contract.badgeSigned")}</Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-zinc-400 text-sm">
                {t("contract.candidateContractDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="contract-print-area mt-4 bg-white text-black rounded-lg p-8 space-y-6" style={{ fontFamily: "'Cairo', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
              {previewTpl.logoUrl && (
                <div className={`flex ${(previewTpl as any).logoAlignment === "left" ? "justify-start" : (previewTpl as any).logoAlignment === "right" ? "justify-end" : "justify-center"}`}>
                  <img src={previewTpl.logoUrl} alt="Logo" className="h-16 object-contain" />
                </div>
              )}
              {previewTpl.headerText && (
                <p className="text-center text-xl font-bold border-b pb-4">{previewTpl.headerText}</p>
              )}
              {(previewTpl as any).preamble && (
                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                  {replaceVars((previewTpl as any).preamble, latestContract.snapshotVariables)}
                </div>
              )}
              {Array.isArray(latestContract.snapshotArticles || previewTpl.articles) && (latestContract.snapshotArticles || previewTpl.articles).map((article: any, idx: number) => (
                <div key={idx}>
                  <h3 className="font-bold text-sm mb-1">{t("contract.articlePrefix", { n: formatNumber(idx + 1), title: String(article.title || "").replace(/\{\{title\}\}\s*:?\s*/g, "").trim() })}</h3>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{replaceVars(article.body || "", latestContract.snapshotVariables)}</p>
                  {Array.isArray(article.subArticles) && article.subArticles.map((sub: any, subIdx: number) => (
                    <div key={subIdx} className="ms-6 mt-2">
                      <h4 className="font-bold text-sm mb-0.5">{formatNumber(idx + 1)}.{formatNumber(subIdx + 1)} {sub.title}</h4>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{replaceVars(sub.body || "", latestContract.snapshotVariables)}</p>
                    </div>
                  ))}
                </div>
              ))}
              {previewTpl.footerText && (
                <div className="border-t pt-4 mt-6">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{replaceVars(previewTpl.footerText, latestContract.snapshotVariables)}</p>
                </div>
              )}
              <div className="border-t pt-6 mt-8">
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <p className="text-sm font-bold">{t("contract.firstParty")}</p>
                    <p className="text-xs text-gray-600"><bdi>{(previewTpl as any).companyName || t("contract.defaultCompany")}</bdi></p>
                    <div className="border-b border-gray-400 mt-8 pt-6"></div>
                    <p className="text-xs text-gray-500">{t("contract.authorizedSignature")}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-bold">{t("contract.secondParty")}</p>
                    <p className="text-xs text-gray-600"><bdi>{latestContract.snapshotVariables?.fullName || (candidate as any)?.fullName || t("contract.defaultName")}</bdi></p>
                    {latestContract.status === "signed" && latestContract.signedAt ? (
                      <div className="mt-4 pt-2 text-center">
                        <div className="inline-block border-2 border-emerald-600 rounded-md px-4 py-2">
                          <p className="text-xs font-bold text-emerald-700">{t("contract.digitallySigned")}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5" dir="ltr">
                            {t("contract.digitallySignedAt", {
                              date: formatDate(latestContract.signedAt, i18n.language),
                              time: new Intl.DateTimeFormat("en-GB", { numberingSystem: "latn", hour: "2-digit", minute: "2-digit" }).format(new Date(latestContract.signedAt)),
                            })}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="border-b border-gray-400 mt-8 pt-6"></div>
                        <p className="text-xs text-gray-500">{t("contract.employeeSignature")}</p>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-6 text-center">
                  <p className="text-xs text-gray-500" dir="ltr">{t("contract.dateLabel", { date: latestContract.signedAt ? formatDate(latestContract.signedAt, i18n.language, { day: "numeric", month: "long", year: "numeric" }) : t("contract.dateBlank") })}</p>
                </div>
              </div>
              {(previewTpl as any).documentFooter && (
                <div className="border-t border-gray-200 mt-10 pt-3 no-print">
                  <p className="text-[10px] text-gray-400 text-center whitespace-pre-wrap leading-relaxed">{(previewTpl as any).documentFooter}</p>
                </div>
              )}
              {(previewTpl as any).documentFooter && (
                <div className="contract-page-footer" dangerouslySetInnerHTML={{ __html: ((previewTpl as any).documentFooter || '').replace(/\n/g, '<br/>') }} />
              )}
            </div>
            <div className="flex justify-end mt-3 no-print">
              <Button variant="outline" className="border-zinc-700 text-zinc-300 gap-2" onClick={() => printContract(previewTpl?.name || 'Contract')}>
                <Download className="h-4 w-4" />
                {t("contract.printExport")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
  { key: "{{startDate}}", label: "Start Date" },
  { key: "{{eventName}}", label: "Event Name" },
  { key: "{{contractDate}}", label: "Contract Date" },
  { key: "{{companyName}}", label: "Company Name" },
];

function ContractTemplatesTab() {
  const { t } = useTranslation("onboarding");
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
      toast({ title: t("toasts.templateCreated") });
      closeEditor();
    },
    onError: (e: any) => toast({ title: t("toasts.error"), description: e?.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/contract-templates/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contract-templates"] });
      toast({ title: t("toasts.templateUpdated") });
      closeEditor();
    },
    onError: (e: any) => toast({ title: t("toasts.error"), description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/contract-templates/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contract-templates"] });
      toast({ title: t("toasts.templateDeleted") });
    },
    onError: (e: any) => toast({ title: t("toasts.error"), description: e?.message, variant: "destructive" }),
  });

  const newVersionMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/contract-templates/${id}/new-version`, {}).then(r => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/contract-templates"] });
      toast({ title: t("toasts.newVersion", { n: formatNumber(data.version) }) });
      openEditor(data);
    },
    onError: (e: any) => toast({ title: t("toasts.error"), description: e?.message, variant: "destructive" }),
  });

  const logoUploadMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/contract-templates/${id}/logo`, { method: "POST", body: formData });
      if (!res.ok) throw new Error(t("toasts.logoUploadFailed"));
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contract-templates"] });
      toast({ title: t("toasts.logoUploaded") });
    },
    onError: (e: any) => toast({ title: t("toasts.error"), description: e?.message, variant: "destructive" }),
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
      toast({ title: t("toasts.templateNameRequired"), variant: "destructive" });
      return;
    }
    const validArticles = formArticles.filter(a => a.title.trim() || a.body.trim());
    if (validArticles.length === 0) {
      toast({ title: t("toasts.addAtLeastOneArticle"), variant: "destructive" });
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
      toast({ title: t("toasts.clickInsideFirst"), variant: "destructive" });
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

  function replaceVariables(text: string, snapshotVars?: Record<string, string>): string {
    let result = text;
    if (snapshotVars) {
      Object.entries(snapshotVars).forEach(([key, val]) => {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(val));
      });
    } else {
      AVAILABLE_VARIABLES.forEach(v => {
        result = result.replace(new RegExp(v.key.replace(/[{}]/g, "\\$&"), "g"), `[${v.label}]`);
      });
    }
    return result;
  }

  const activeTemplates = templates.filter(tpl => tpl.status !== "archived");
  const archivedTemplates = templates.filter(tpl => tpl.status === "archived");

  const statusBadge = (s: string) => {
    const styles: Record<string, string> = {
      draft: "bg-zinc-700 text-zinc-200",
      active: "bg-emerald-900/60 text-emerald-300",
      archived: "bg-zinc-800 text-zinc-500",
    };
    return styles[s] || styles.draft;
  };

  const statusLabel = (s: string) => {
    if (s === "draft") return t("templates.statusDraft");
    if (s === "active") return t("templates.statusActive");
    if (s === "archived") return t("templates.archived");
    return s;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-zinc-400 text-sm">{t("templates.subtitle")}</p>
        </div>
        <Button
          data-testid="button-create-template"
          onClick={() => openEditor()}
          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
        >
          <Plus className="h-4 w-4" />
          {t("templates.create")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        </div>
      ) : activeTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="h-12 w-12 text-zinc-700 mb-4" />
          <p className="text-zinc-400 font-medium">{t("templates.empty")}</p>
          <p className="text-zinc-600 text-sm mt-1">{t("templates.emptyHint")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeTemplates.map(tpl => {
            const eventName = eventsData.find(e => e.id === tpl.eventId)?.name;
            const articleCount = Array.isArray(tpl.articles) ? tpl.articles.length : 0;
            return (
              <div
                key={tpl.id}
                data-testid={`card-template-${tpl.id}`}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="h-12 w-12 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  {tpl.logoUrl ? (
                    <img src={tpl.logoUrl} alt={t("templates.logo")} className="h-10 w-10 object-contain rounded" />
                  ) : (
                    <FileText className="h-6 w-6 text-zinc-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-sm"><bdi>{tpl.name}</bdi></span>
                    <Badge className={`text-xs px-2 py-0.5 ${statusBadge(tpl.status)} border-0`}>
                      {statusLabel(tpl.status)}
                    </Badge>
                    <span className="text-zinc-600 text-xs">{t("templates.version", { n: formatNumber(tpl.version) })}</span>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-zinc-500">
                    {tpl.companyName && <span><bdi>{tpl.companyName}</bdi></span>}
                    {eventName && <span>{t("templates.eventLabel", { name: eventName })}</span>}
                    <span>{t("templates.articleCount", { n: formatNumber(articleCount), count: articleCount })}</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1"
                    onClick={() => setPreviewTemplate(tpl)}
                    data-testid={`button-preview-template-${tpl.id}`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {t("templates.preview")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1"
                    onClick={() => openEditor(tpl)}
                    data-testid={`button-edit-template-${tpl.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t("templates.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1"
                    onClick={() => {
                      if (logoInputRef.current) {
                        logoInputRef.current.dataset.templateId = tpl.id;
                        logoInputRef.current.click();
                      }
                    }}
                    data-testid={`button-upload-logo-${tpl.id}`}
                  >
                    <Image className="h-3.5 w-3.5" />
                    {t("templates.logo")}
                  </Button>
                  {tpl.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1"
                      onClick={() => newVersionMutation.mutate(tpl.id)}
                      data-testid={`button-new-version-${tpl.id}`}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {t("templates.newVersion")}
                    </Button>
                  )}
                  {tpl.status === "draft" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-emerald-700/70 text-emerald-400 hover:bg-emerald-950/40 gap-1"
                        onClick={() => {
                          if (window.confirm(t("templates.activateConfirm"))) {
                            updateMutation.mutate(
                              { id: tpl.id, data: { status: "active" } },
                              { onSuccess: () => toast({ title: t("toasts.templateActivated") }) },
                            );
                          }
                        }}
                        data-testid={`button-activate-template-${tpl.id}`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t("templates.activate")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-900/60 text-red-400 hover:bg-red-950/40 gap-1"
                        onClick={() => deleteMutation.mutate(tpl.id)}
                        data-testid={`button-delete-template-${tpl.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
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
            {t("templates.archivedToggle", { n: formatNumber(archivedTemplates.length) })}
          </summary>
          <div className="space-y-2 mt-2">
            {archivedTemplates.map(tpl => (
              <div key={tpl.id} className="bg-zinc-950 border border-zinc-900 rounded-lg p-3 flex items-center gap-3 opacity-60">
                <FileText className="h-4 w-4 text-zinc-600" />
                <span className="text-sm text-zinc-500"><bdi>{tpl.name}</bdi> {t("templates.version", { n: formatNumber(tpl.version) })}</span>
                <Badge className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-500 border-0">{t("templates.archived")}</Badge>
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
              {editingTemplate ? t("templates.editTitle", { name: editingTemplate.name }) : t("templates.createTitle")}
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              {t("templates.editorDescription", { vars: "{{variables}}" })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">{t("templates.name")}</Label>
                <Input
                  data-testid="input-template-name"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder={t("templates.namePlaceholder")}
                  className="bg-zinc-900 border-zinc-700"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">{t("templates.linkedEvent")}</Label>
                <Select value={formEventId} onValueChange={setFormEventId}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700" data-testid="select-template-event">
                    <SelectValue placeholder={t("templates.noEvent")} />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="none">{t("templates.noEvent")}</SelectItem>
                    {eventsData.map(e => (
                      <SelectItem key={e.id} value={e.id}><bdi>{e.name}</bdi></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">{t("templates.companyName")}</Label>
                <Input
                  data-testid="input-company-name"
                  value={formCompanyName}
                  onChange={e => setFormCompanyName(e.target.value)}
                  placeholder={t("templates.companyPlaceholder")}
                  className="bg-zinc-900 border-zinc-700"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">{t("templates.status")}</Label>
                <Select value={formStatus} onValueChange={(v: any) => setFormStatus(v)}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700" data-testid="select-template-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="draft">{t("templates.draft")}</SelectItem>
                    <SelectItem value="active">{t("templates.active")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">{t("templates.headerText")}</Label>
                <Input
                  data-testid="input-header-text"
                  value={formHeaderText}
                  onChange={e => setFormHeaderText(e.target.value)}
                  placeholder={t("templates.headerPlaceholder")}
                  className="bg-zinc-900 border-zinc-700"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">{t("templates.logoPosition")}</Label>
                <div className="flex gap-1">
                  {(["left", "center", "right"] as const).map(pos => (
                    <button
                      key={pos}
                      type="button"
                      data-testid={`button-logo-align-${pos}`}
                      className={`flex-1 h-9 rounded text-xs font-medium transition-colors ${formLogoAlignment === pos ? "bg-primary text-primary-foreground" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
                      onClick={() => setFormLogoAlignment(pos)}
                    >
                      {pos === "left" ? t("templates.logoLeft") : pos === "center" ? t("templates.logoCenter") : t("templates.logoRight")}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4 space-y-4">
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                <p className="text-xs text-zinc-500 mb-2">{t("templates.availableVars")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_VARIABLES.map(v => {
                    const varKey = v.key.replace(/[{}]/g, "");
                    return (
                      <button
                        key={v.key}
                        type="button"
                        className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 rounded font-mono transition-colors"
                        onClick={() => insertVariableAtCursor(v.key)}
                        title={t(`vars.${varKey}`, { defaultValue: v.label })}
                        dir="ltr"
                      >
                        {v.key}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">{t("templates.preamble")}</Label>
                <Textarea
                  value={formPreamble}
                  onChange={e => setFormPreamble(e.target.value)}
                  onFocus={() => { lastFocusedTextarea.current = { type: "preamble" }; }}
                  placeholder={t("templates.preamblePlaceholder")}
                  className="bg-zinc-900 border-zinc-700 text-sm min-h-24"
                  data-testid="input-preamble"
                />
                <p className="text-[11px] text-zinc-600">{t("templates.preambleHint")}</p>
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">{t("templates.articles")}</Label>
                <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 gap-1" onClick={addArticle} data-testid="button-add-article">
                  <Plus className="h-3.5 w-3.5" />
                  {t("templates.addArticle")}
                </Button>
              </div>

              <div className="space-y-3">
                {formArticles.map((article, idx) => (
                  <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-600 font-mono w-16 shrink-0">{t("templates.articleAbbr", { n: formatNumber(idx + 1) })}</span>
                      <Input
                        value={article.title}
                        onChange={e => updateArticle(idx, "title", e.target.value)}
                        placeholder={t("templates.articleTitle")}
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
                      placeholder={t("templates.articleBody", { vars: "{{variables}}" })}
                      className="bg-zinc-800 border-zinc-700 text-sm min-h-20"
                      data-testid={`input-article-body-${idx}`}
                    />
                    {(article.subArticles || []).map((sub, subIdx) => (
                      <div key={subIdx} className="ms-8 border-s-2 border-zinc-700 ps-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-600 font-mono w-12 shrink-0">{formatNumber(idx + 1)}.{formatNumber(subIdx + 1)}</span>
                          <Input
                            value={sub.title}
                            onChange={e => updateSubArticle(idx, subIdx, "title", e.target.value)}
                            placeholder={t("templates.subArticleTitle")}
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
                          placeholder={t("templates.subArticleBody", { vars: "{{variables}}" })}
                          className="bg-zinc-800 border-zinc-700 text-xs min-h-16"
                          data-testid={`input-subarticle-body-${idx}-${subIdx}`}
                        />
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-zinc-500 hover:text-zinc-300 ms-8"
                      onClick={() => addSubArticle(idx)}
                      data-testid={`button-add-subarticle-${idx}`}
                    >
                      <Plus className="h-3 w-3 me-1" />
                      {t("templates.addSubArticle", { n: `${formatNumber(idx + 1)}.${formatNumber((article.subArticles || []).length + 1)}` })}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400 uppercase tracking-wider">{t("templates.testimonium")}</Label>
              <Textarea
                data-testid="input-footer-text"
                value={formFooterText}
                onChange={e => setFormFooterText(e.target.value)}
                onFocus={() => { lastFocusedTextarea.current = { type: "preamble" }; }}
                placeholder={t("templates.testimoniumPlaceholder")}
                className="bg-zinc-900 border-zinc-700 text-sm min-h-20"
              />
              <p className="text-[11px] text-zinc-600">{t("templates.testimoniumHint")}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400 uppercase tracking-wider">{t("templates.documentFooter")}</Label>
              <Textarea
                data-testid="input-document-footer"
                value={formDocumentFooter}
                onChange={e => setFormDocumentFooter(e.target.value)}
                placeholder={t("templates.documentFooterPlaceholder")}
                className="bg-zinc-900 border-zinc-700 text-[11px] min-h-16 font-mono"
              />
              <p className="text-[11px] text-zinc-600">{t("templates.documentFooterHint")}</p>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" className="border-zinc-700" onClick={closeEditor}>
              {t("templates.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
              data-testid="button-save-template"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingTemplate ? t("templates.update") : t("templates.createBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewTemplate} onOpenChange={(v) => { if (!v) setPreviewTemplate(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              {t("templates.previewTitle", { name: previewTemplate?.name ?? "" })}
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              {t("templates.previewDescription")}
            </DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <>
              <div className="contract-print-area mt-4 bg-white text-black rounded-lg p-8 space-y-6" style={{ fontFamily: "'Cairo', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
                {previewTemplate.logoUrl && (
                  <div className={`flex ${(previewTemplate as any).logoAlignment === "left" ? "justify-start" : (previewTemplate as any).logoAlignment === "right" ? "justify-end" : "justify-center"}`}>
                    <img src={previewTemplate.logoUrl} alt="Logo" className="h-16 object-contain" />
                  </div>
                )}
                {previewTemplate.headerText && (
                  <p className="text-center text-xl font-bold border-b pb-4">{previewTemplate.headerText}</p>
                )}
                {(previewTemplate as any).preamble && (
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {replaceVariables((previewTemplate as any).preamble)}
                  </div>
                )}
                {Array.isArray(previewTemplate.articles) && previewTemplate.articles.map((article: any, idx: number) => (
                  <div key={idx}>
                    <h3 className="font-bold text-sm mb-1">{t("contract.articlePrefix", { n: formatNumber(idx + 1), title: String(article.title || "").replace(/\{\{title\}\}\s*:?\s*/g, "").trim() })}</h3>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{replaceVariables(article.body)}</p>
                    {Array.isArray(article.subArticles) && article.subArticles.map((sub: any, subIdx: number) => (
                      <div key={subIdx} className="ms-6 mt-2">
                        <h4 className="font-bold text-sm mb-0.5">{formatNumber(idx + 1)}.{formatNumber(subIdx + 1)} {sub.title}</h4>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{replaceVariables(sub.body)}</p>
                      </div>
                    ))}
                  </div>
                ))}
                {previewTemplate.footerText && (
                  <div className="border-t pt-4 mt-6">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{replaceVariables(previewTemplate.footerText)}</p>
                  </div>
                )}
                <div className="border-t pt-6 mt-8">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <p className="text-sm font-bold">{t("contract.firstParty")}</p>
                      <p className="text-xs text-gray-600"><bdi>{(previewTemplate as any).companyName || t("contract.defaultCompany")}</bdi></p>
                      <div className="border-b border-gray-400 mt-8 pt-6"></div>
                      <p className="text-xs text-gray-500">{t("contract.authorizedSignature")}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-bold">{t("contract.secondParty")}</p>
                      <p className="text-xs text-gray-600">{t("templates.previewSignature")}</p>
                      <div className="border-b border-gray-400 mt-8 pt-6"></div>
                      <p className="text-xs text-gray-500">{t("contract.employeeSignature")}</p>
                    </div>
                  </div>
                  <div className="mt-6 text-center">
                    <p className="text-xs text-gray-500" dir="ltr">{t("contract.dateLabel", { date: t("contract.dateBlank") })}</p>
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
                  {t("contract.printExport")}
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

const DOC_LABEL_KEYS: Record<ReminderDocId, string> = {
  photo: "reminders.docPhoto",
  iban: "reminders.docIban",
  national_id: "reminders.docNationalId",
  vaccination_report: "reminders.docVaccinationReport",
};
const DOC_PIP_ICON: Record<ReminderDocId, React.ElementType> = {
  photo: Camera,
  iban: CreditCard,
  national_id: IdCard,
  vaccination_report: Syringe,
};

function hoursUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.round(ms / (60 * 60 * 1000)));
}

function formatDuration(ms: number, locale: string): string {
  const abs = Math.max(0, Math.abs(ms));
  const days = Math.floor(abs / 86400_000);
  const hours = Math.floor((abs % 86400_000) / 3600_000);
  const minutes = Math.floor((abs % 3600_000) / 60_000);
  if (locale === "ar") {
    if (days > 0) return `${days} يوم${hours > 0 ? ` و${hours} ساعة` : ""}`;
    if (hours > 0) return `${hours} ساعة${minutes > 0 ? ` و${minutes} دقيقة` : ""}`;
    return `${minutes} دقيقة`;
  }
  if (days > 0) return `${days}d${hours > 0 ? ` ${hours}h` : ""}`;
  if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  return `${minutes}m`;
}

function ReminderRowIndicator({ status }: { status: ReminderRowStatus }) {
  const { t, i18n } = useTranslation("onboarding");
  const state = status.state;
  const isAr = i18n.language === "ar";

  const fmtDate = (iso: string | null) => iso
    ? new Date(iso).toLocaleString(isAr ? "ar-SA" : "en-GB", { dateStyle: "short", timeStyle: "short" })
    : "—";

  // Time-to-elimination drives the high-urgency RTL accent stripe.
  const eliminationMsLeft = status.eliminationAt
    ? Math.max(0, new Date(status.eliminationAt).getTime() - Date.now())
    : null;
  const within24h = eliminationMsLeft != null && eliminationMsLeft <= 24 * 3600_000;
  const within6h  = eliminationMsLeft != null && eliminationMsLeft <= 6  * 3600_000;

  // Bell visual states per spec:
  //   off          → null (hidden — render nothing)
  //   pending (no sends yet)            → outline grey
  //   pending/due (1+ sent, more left)  → solid amber  (in-progress reminders)
  //   max_reached  → solid orange + pulse
  //   warning      → solid orange + pulse + red accent
  //   paused       → slashed dim
  //   eliminated   → red X / strike
  const hasSent = (status.reminderCount ?? 0) > 0;
  const moreToSend = (status.reminderCount ?? 0) < (status.maxReminders ?? 0);
  const finalWarningSent = status.finalWarningSentAt != null;
  let bellNode: React.ReactNode = null;
  let bellAriaLabel = "";
  if (state !== "off") {
    if (state === "paused") {
      bellNode = <BellOff className="h-4 w-4 text-zinc-500" data-testid="icon-bell-paused" />;
      bellAriaLabel = t("reminders.row.paused");
    } else if (state === "eliminated") {
      bellNode = <XCircle className="h-4 w-4 text-red-500" data-testid="icon-bell-eliminated" />;
      bellAriaLabel = t("reminders.row.eliminated");
    } else if ((state === "pending" || state === "due") && hasSent && moreToSend && !finalWarningSent) {
      // 1+ reminders sent, more pending → solid amber regardless of "due now" vs scheduled.
      bellNode = <Bell className="h-4 w-4 text-amber-400 fill-amber-400" data-testid="icon-bell-due" />;
      bellAriaLabel = state === "due"
        ? t("reminders.row.due")
        : t("reminders.row.pending", { n: hoursUntil(status.nextScheduledAt) ?? "—" });
    } else if (state === "pending") {
      // No reminders sent yet → outline grey.
      bellNode = <Bell className="h-4 w-4 text-zinc-400 stroke-[1.5]" data-testid="icon-bell-pending" />;
      bellAriaLabel = t("reminders.row.pending", { n: hoursUntil(status.nextScheduledAt) ?? "—" });
    } else if (state === "due") {
      // First reminder due now → solid amber.
      bellNode = <Bell className="h-4 w-4 text-amber-400 fill-amber-400" data-testid="icon-bell-due" />;
      bellAriaLabel = t("reminders.row.due");
    } else if (state === "max_reached" || state === "warning") {
      bellNode = (
        <Bell
          className={`h-4 w-4 text-orange-400 fill-orange-400 animate-pulse ${state === "warning" ? "drop-shadow-[0_0_4px_rgba(248,113,113,0.6)]" : ""}`}
          data-testid={state === "warning" ? "icon-bell-warning" : "icon-bell-max"}
        />
      );
      bellAriaLabel = state === "warning"
        ? t("reminders.row.warning", { n: hoursUntil(status.eliminationAt) ?? "—" })
        : t("reminders.row.max_reached");
    }
  }

  const tooltipText = isAr
    ? `تم إرسال ${status.reminderCount} من ${status.maxReminders} تذكيرات. التذكير القادم: ${fmtDate(status.nextScheduledAt)}. يتبقى ${eliminationMsLeft != null ? formatDuration(eliminationMsLeft, "ar") : "—"} حتى الاستبعاد.`
    : `Sent ${status.reminderCount} of ${status.maxReminders} reminders. Next reminder: ${fmtDate(status.nextScheduledAt)}. ${eliminationMsLeft != null ? formatDuration(eliminationMsLeft, "en") : "—"} until elimination.`;

  // Pip strip: maxReminders+1 dots. The +1 (rendered as a diamond) is
  // the final-warning slot; the trailing tick (a red bar) marks the
  // hard elimination deadline. Per-pip tooltips read each event's actual
  // sentAt from `events[]` so historical pips don't render "—".
  const reminderEventByN = new Map<number, ReminderEvent>();
  let finalWarningEvent: ReminderEvent | null = null;
  for (const ev of status.events ?? []) {
    if (ev.kind === "reminder" && ev.n != null) reminderEventByN.set(ev.n, ev);
    else if (ev.kind === "final_warning") finalWarningEvent = ev;
  }
  const pipDots: { kind: "sent" | "future" | "final"; tip: string; testid: string }[] = [];
  for (let i = 0; i < status.maxReminders; i++) {
    const isSent = i < status.reminderCount;
    const oneBased = i + 1;
    const ev = reminderEventByN.get(oneBased);
    pipDots.push({
      kind: isSent ? "sent" : "future",
      tip: isSent
        // Prefer the per-event sentAt; fall back to lastReminderSentAt for
        // the most-recent pip when no matching event row was loaded yet.
        ? `${isAr ? "تم الإرسال" : "Sent"} • ${ev?.sentAt
            ? fmtDate(ev.sentAt)
            : (i === status.reminderCount - 1 && status.lastReminderSentAt ? fmtDate(status.lastReminderSentAt) : "—")}`
        : `${isAr ? "مجدول" : "Scheduled"} • ${i === status.reminderCount && status.nextScheduledAt ? fmtDate(status.nextScheduledAt) : "—"}`,
      testid: `pip-${i}`,
    });
  }
  pipDots.push({
    kind: "final",
    tip: finalWarningEvent
      ? `${isAr ? "تم إرسال التنبيه الأخير" : "Final warning sent"} • ${fmtDate(finalWarningEvent.sentAt)}`
      : `${isAr ? "تنبيه أخير" : "Final warning"} • ${fmtDate(status.eliminationAt)}`,
    testid: "pip-final",
  });

  const missingCount = status.missingDocs.length;

  return (
    <div className="mt-2" data-testid={`reminder-status-${status.onboardingId}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Bell glyph */}
        {bellNode && (
          <span title={tooltipText} aria-label={bellAriaLabel} className="inline-flex items-center" data-testid={`reminder-bell-${status.onboardingId}`}>
            {bellNode}
          </span>
        )}
        {/* Pip strip */}
        {state !== "off" && state !== "eliminated" && status.maxReminders > 0 && (
          <div className="flex items-center gap-0.5" data-testid={`pip-strip-${status.onboardingId}`}>
            {pipDots.map((p, i) => {
              const cls =
                p.kind === "sent"   ? "bg-amber-400"
              : p.kind === "future" ? "bg-zinc-700"
                                    : "bg-orange-500 rotate-45";
              const shape = p.kind === "final" ? "h-2 w-2" : "h-1.5 w-1.5 rounded-full";
              return (
                <span
                  key={i}
                  title={p.tip}
                  className={`inline-block ${shape} ${cls}`}
                  data-testid={`reminder-${p.testid}-${status.onboardingId}`}
                />
              );
            })}
            {/* Elimination tick */}
            <span
              title={`${isAr ? "موعد الاستبعاد" : "Elimination deadline"} • ${fmtDate(status.eliminationAt)}`}
              className="inline-block h-2.5 w-0.5 bg-red-500 ms-1"
              data-testid={`reminder-tick-elimination-${status.onboardingId}`}
            />
          </div>
        )}
        {/* Sent counter */}
        {state !== "off" && (
          <span className="text-[11px] text-zinc-500 ltr-numbers" data-testid={`reminder-count-${status.onboardingId}`}>
            {t("reminders.row.sentCount", { n: status.reminderCount, max: status.maxReminders })}
          </span>
        )}
        {/* Missing-doc pips */}
        {missingCount > 0 && (
          <div className="flex items-center gap-1" data-testid={`reminder-missing-${status.onboardingId}`}>
            {status.missingDocs.map(d => {
              const PipIcon = DOC_PIP_ICON[d];
              return (
                <span
                  key={d}
                  title={t(DOC_LABEL_KEYS[d])}
                  className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-red-950/50 border border-red-800/60 text-red-300"
                  data-testid={`reminder-missing-pip-${status.onboardingId}-${d}`}
                >
                  <PipIcon className="h-3 w-3" />
                </span>
              );
            })}
          </div>
        )}
        {state === "eliminated" && (
          <span className="text-[11px] text-red-400" data-testid={`reminder-state-${status.onboardingId}`}>
            {t("reminders.row.eliminated")}
          </span>
        )}
      </div>
    </div>
  );
}

function ReminderRowActions({
  rec,
  status,
  pending,
  onAction,
}: {
  rec: OnboardingRecord;
  status: ReminderRowStatus;
  pending: boolean;
  onAction: (action: "send-now" | "pause" | "resume") => void;
}) {
  const { t } = useTranslation("onboarding");
  const isPaused = status.remindersPaused;
  const canSendNow = status.missingDocs.length > 0 && !isPaused && status.state !== "max_reached";

  return (
    <>
      {canSendNow && (
        <Button
          data-testid={`button-reminder-send-now-${rec.id}`}
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => onAction("send-now")}
          className="border-blue-800 text-blue-300 hover:bg-blue-950/40 gap-1"
          title={t("reminders.actions.sendNow")}
        >
          <Send className="h-3.5 w-3.5" />
          {t("reminders.actions.sendNow")}
        </Button>
      )}
      {isPaused ? (
        <Button
          data-testid={`button-reminder-resume-${rec.id}`}
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => onAction("resume")}
          className="border-emerald-800 text-emerald-300 hover:bg-emerald-950/40 gap-1"
          title={t("reminders.actions.resume")}
        >
          <Play className="h-3.5 w-3.5" />
          {t("reminders.actions.resume")}
        </Button>
      ) : (
        <Button
          data-testid={`button-reminder-pause-${rec.id}`}
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => onAction("pause")}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1"
          title={t("reminders.actions.pause")}
        >
          <Pause className="h-3.5 w-3.5" />
          {t("reminders.actions.pause")}
        </Button>
      )}
    </>
  );
}

const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  enabled: false,
  firstAfterHours: 24,
  repeatEveryHours: 24,
  maxReminders: 3,
  totalDeadlineDays: 4,
  finalWarningHours: 24,
  quietHoursStart: "21:00",
  quietHoursEnd: "08:00",
  quietHoursTz: "Asia/Riyadh",
  requiredDocs: ["photo", "iban", "national_id", "vaccination_report"],
};

const DEFAULT_REMINDER_TEMPLATES: ReminderTemplates = {
  onboarding_reminder_sms_ar: "مرحباً {name}، يرجى إرفاق المستندات الناقصة ({missing_docs}) عبر البوابة: {portal_url}. الموعد النهائي {deadline_date}.",
  onboarding_reminder_sms_en: "Hi {name}, please upload the missing documents ({missing_docs}) on the portal: {portal_url}. Deadline: {deadline_date}.",
  onboarding_final_warning_sms_ar: "تنبيه أخير: لديك {deadline_date} لإكمال مستنداتك ({missing_docs}) عبر {portal_url} وإلا سيتم استبعادك تلقائياً.",
  onboarding_final_warning_sms_en: "Final warning: complete your missing documents ({missing_docs}) at {portal_url} by {deadline_date} or you will be auto-eliminated.",
};

function relTime(iso: string | null, locale: string, fallback: string): string {
  if (!iso) return fallback;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return fallback;
  const abs = Math.abs(ms);
  const sign = ms < 0 ? -1 : 1;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400_000], ["hour", 3600_000], ["minute", 60_000],
  ];
  for (const [unit, divisor] of units) {
    if (abs >= divisor || unit === "minute") {
      const v = Math.round(ms / divisor) * 1; // keep sign
      try {
        const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar" : "en", { numeric: "auto" });
        return rtf.format(Math.round(v), unit);
      } catch { return `${sign * Math.round(abs / divisor)} ${unit}`; }
    }
  }
  return fallback;
}

function ReminderActivityTable() {
  const { t, i18n } = useTranslation("onboarding");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery<ReminderActivityRow[]>({
    queryKey: ["/api/onboarding/reminders/activity"],
    queryFn: () => apiRequest("GET", "/api/onboarding/reminders/activity").then(r => r.json()),
    refetchInterval: 15000,
  });
  const actMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "send-reminder-now" | "pause-reminders" | "resume-reminders" }) =>
      apiRequest("POST", `/api/onboarding/${id}/${action}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding/reminders/activity"] });
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
    },
    onError: (e: any) => toast({ title: t("reminders.actionFailed"), description: e?.message, variant: "destructive" }),
  });

  const fmtDateTime = (iso: string | null) => iso
    ? new Date(iso).toLocaleString(i18n.language === "ar" ? "ar-SA" : "en-GB", { dateStyle: "short", timeStyle: "short" })
    : "—";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">{t("reminders.activity.title")}</h3>
          <p className="text-xs text-zinc-500 mt-1">{t("reminders.activity.subtitle")}</p>
        </div>
        <span className="text-[11px] text-zinc-500" data-testid="text-activity-count">
          {t("reminders.activity.rowCount", { n: rows.length })}
        </span>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>
      ) : rows.length === 0 ? (
        <div className="text-zinc-500 text-sm text-center py-6" data-testid="text-activity-empty">{t("reminders.activity.empty")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="table-reminder-activity">
            <thead className="text-zinc-400 border-b border-zinc-800">
              <tr>
                <th className="text-start py-2 px-2 font-medium">{t("reminders.activity.col.candidate")}</th>
                <th className="text-start py-2 px-2 font-medium">{t("reminders.activity.col.missing")}</th>
                <th className="text-start py-2 px-2 font-medium">{t("reminders.activity.col.sent")}</th>
                <th className="text-start py-2 px-2 font-medium">{t("reminders.activity.col.last")}</th>
                <th className="text-start py-2 px-2 font-medium">{t("reminders.activity.col.next")}</th>
                <th className="text-start py-2 px-2 font-medium">{t("reminders.activity.col.elimination")}</th>
                <th className="text-start py-2 px-2 font-medium">{t("reminders.activity.col.outbox")}</th>
                <th className="text-end py-2 px-2 font-medium">{t("reminders.activity.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const eliminationRel = relTime(r.eliminationAt, i18n.language, "—");
                return (
                  <tr key={r.onboardingId} className="border-b border-zinc-800/60" data-testid={`row-activity-${r.onboardingId}`}>
                    <td className="py-2 px-2 text-zinc-200">
                      <div data-testid={`text-activity-name-${r.onboardingId}`}>{r.candidateName ?? "—"}</div>
                      <div className="text-[11px] text-zinc-500 ltr-numbers">{r.candidatePhone ?? ""}</div>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex flex-wrap gap-1">
                        {r.missingDocs.length === 0
                          ? <span className="text-emerald-400">{t("reminders.activity.allDocs")}</span>
                          : r.missingDocs.map(d => (
                            <span key={d} className="px-1.5 py-0.5 rounded bg-red-950/40 text-red-300 border border-red-900/60">
                              {t(DOC_LABEL_KEYS[d])}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="py-2 px-2 ltr-numbers" data-testid={`text-activity-sent-${r.onboardingId}`}>
                      {r.reminderCount}/{r.maxReminders}
                    </td>
                    <td className="py-2 px-2 ltr-numbers text-zinc-300" title={r.lastReminderSentAt ?? ""}>
                      {fmtDateTime(r.lastReminderSentAt)}
                    </td>
                    <td className="py-2 px-2 ltr-numbers text-zinc-300" title={r.nextScheduledAt ?? ""}>
                      {fmtDateTime(r.nextScheduledAt)}
                    </td>
                    <td className="py-2 px-2 ltr-numbers" title={r.eliminationAt ?? ""}>
                      <div className={r.state === "warning" ? "text-red-300" : "text-zinc-300"}>
                        {fmtDateTime(r.eliminationAt)}
                      </div>
                      <div className="text-[11px] text-zinc-500" data-testid={`text-activity-countdown-${r.onboardingId}`}>{eliminationRel}</div>
                    </td>
                    <td className="py-2 px-2">
                      {r.latestSmsOutboxId ? (
                        <div className="text-zinc-400">
                          <a
                            href={`/api/sms/outbox/${r.latestSmsOutboxId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white inline-flex items-center gap-1 underline-offset-2 hover:underline"
                            title={r.latestSmsOutboxId}
                            data-testid={`link-activity-outbox-${r.onboardingId}`}
                          >
                            {(r.latestSmsKind ?? "sms").replace(/^onboarding_/, "")}
                          </a>
                          {r.latestSmsLastError && (
                            <span className="ml-1 text-red-400" title={r.latestSmsLastError}>!</span>
                          )}
                        </div>
                      ) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="py-2 px-2 text-end">
                      <div className="inline-flex gap-1">
                        <Button
                          data-testid={`button-activity-send-${r.onboardingId}`}
                          size="sm" variant="outline" disabled={actMut.isPending || r.remindersPaused || r.missingDocs.length === 0}
                          onClick={() => actMut.mutate({ id: r.onboardingId, action: "send-reminder-now" })}
                          className="border-blue-800 text-blue-300 hover:bg-blue-950/40 h-7 px-2"
                          title={t("reminders.actions.sendNow")}
                        >
                          <Send className="h-3 w-3" />
                        </Button>
                        {r.remindersPaused ? (
                          <Button
                            data-testid={`button-activity-resume-${r.onboardingId}`}
                            size="sm" variant="outline" disabled={actMut.isPending}
                            onClick={() => actMut.mutate({ id: r.onboardingId, action: "resume-reminders" })}
                            className="border-emerald-800 text-emerald-300 hover:bg-emerald-950/40 h-7 px-2"
                            title={t("reminders.actions.resume")}
                          >
                            <Play className="h-3 w-3" />
                          </Button>
                        ) : (
                          <Button
                            data-testid={`button-activity-pause-${r.onboardingId}`}
                            size="sm" variant="outline" disabled={actMut.isPending}
                            onClick={() => actMut.mutate({ id: r.onboardingId, action: "pause-reminders" })}
                            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-7 px-2"
                            title={t("reminders.actions.pause")}
                          >
                            <Pause className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReminderSettingsTab() {
  const { t } = useTranslation("onboarding");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<ReminderConfig | null>(null);
  const [tplForm, setTplForm] = useState<ReminderTemplates | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testVariant, setTestVariant] = useState<"regular" | "final">("regular");
  const [testLocale, setTestLocale] = useState<"ar" | "en">("ar");

  const { data: settings, isLoading } = useQuery<{ config: ReminderConfig; templates: ReminderTemplates }>({
    queryKey: ["/api/onboarding/reminder-settings"],
    queryFn: () => apiRequest("GET", "/api/onboarding/reminder-settings").then(r => r.json()),
  });
  useEffect(() => {
    if (settings && !form) setForm({ ...DEFAULT_REMINDER_CONFIG, ...settings.config });
    if (settings && !tplForm) setTplForm({ ...DEFAULT_REMINDER_TEMPLATES, ...settings.templates });
  }, [settings, form, tplForm]);

  const saveMutation = useMutation({
    mutationFn: (body: { config: ReminderConfig; templates: ReminderTemplates }) =>
      apiRequest("PUT", "/api/onboarding/reminder-settings", body).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding/reminder-settings"] });
      qc.invalidateQueries({ queryKey: ["/api/onboarding/reminders/status"] });
      qc.invalidateQueries({ queryKey: ["/api/onboarding/reminders/activity"] });
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      toast({ title: t("reminders.saved") });
    },
    onError: (e: any) => toast({ title: t("reminders.saveFailed"), description: e?.message, variant: "destructive" }),
  });

  const testSmsMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/onboarding/reminder-test-sms", {
      phone: testPhone.trim(), variant: testVariant, locale: testLocale,
    }).then(async r => ({ ok: r.ok, body: await r.json() })),
    onSuccess: (res) => {
      if (res.ok) {
        toast({ title: t("reminders.testSms.sent"), description: res.body?.preview ?? "" });
      } else {
        toast({
          title: t("reminders.testSms.failed"),
          description: res.body?.error ?? res.body?.message ?? t("reminders.testSms.unknown"),
          variant: "destructive",
        });
      }
    },
    onError: (e: any) => toast({ title: t("reminders.testSms.failed"), description: e?.message, variant: "destructive" }),
  });

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  const docs: ReminderDocId[] = ["photo", "iban", "national_id", "vaccination_report"];
  const toggleDoc = (d: ReminderDocId) => {
    setForm(f => {
      if (!f) return f;
      const has = f.requiredDocs.includes(d);
      return { ...f, requiredDocs: has ? f.requiredDocs.filter(x => x !== d) : [...f.requiredDocs, d] };
    });
  };
  const setNum = (key: keyof ReminderConfig, val: string) => {
    const n = Math.max(0, Math.floor(Number(val) || 0));
    setForm(f => f ? { ...f, [key]: n } as ReminderConfig : f);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-display font-bold text-white">{t("reminders.title")}</h2>
        <p className="text-zinc-400 text-sm mt-1">{t("reminders.subtitle")}</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Label className="text-white font-medium" htmlFor="reminders-master-switch">{t("reminders.masterSwitch")}</Label>
          <p className="text-xs text-zinc-500 mt-1">{t("reminders.masterSwitchHint")}</p>
        </div>
        <Switch
          id="reminders-master-switch"
          data-testid="switch-reminders-enabled"
          checked={form.enabled}
          onCheckedChange={(v) => setForm(f => f ? { ...f, enabled: !!v } : f)}
        />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-200">{t("reminders.cadence")}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-zinc-400 text-xs" htmlFor="cfg-first">{t("reminders.firstAfterHours")}</Label>
            <Input
              id="cfg-first"
              data-testid="input-reminder-first-after"
              type="number" min={0}
              value={form.firstAfterHours}
              onChange={e => setNum("firstAfterHours", e.target.value)}
              className="mt-1 bg-zinc-950 border-zinc-700 text-white"
            />
          </div>
          <div>
            <Label className="text-zinc-400 text-xs" htmlFor="cfg-repeat">{t("reminders.repeatEveryHours")}</Label>
            <Input
              id="cfg-repeat"
              data-testid="input-reminder-repeat-every"
              type="number" min={0}
              value={form.repeatEveryHours}
              onChange={e => setNum("repeatEveryHours", e.target.value)}
              className="mt-1 bg-zinc-950 border-zinc-700 text-white"
            />
          </div>
          <div>
            <Label className="text-zinc-400 text-xs" htmlFor="cfg-max">{t("reminders.maxReminders")}</Label>
            <Input
              id="cfg-max"
              data-testid="input-reminder-max"
              type="number" min={0}
              value={form.maxReminders}
              onChange={e => setNum("maxReminders", e.target.value)}
              className="mt-1 bg-zinc-950 border-zinc-700 text-white"
            />
          </div>
          <div>
            <Label className="text-zinc-400 text-xs" htmlFor="cfg-deadline">{t("reminders.totalDeadlineDays")}</Label>
            <Input
              id="cfg-deadline"
              data-testid="input-reminder-deadline"
              type="number" min={0}
              value={form.totalDeadlineDays}
              onChange={e => setNum("totalDeadlineDays", e.target.value)}
              className="mt-1 bg-zinc-950 border-zinc-700 text-white"
            />
          </div>
          <div>
            <Label className="text-zinc-400 text-xs" htmlFor="cfg-final">{t("reminders.finalWarningHours")}</Label>
            <Input
              id="cfg-final"
              data-testid="input-reminder-final-warning"
              type="number" min={0}
              value={form.finalWarningHours}
              onChange={e => setNum("finalWarningHours", e.target.value)}
              className="mt-1 bg-zinc-950 border-zinc-700 text-white"
            />
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">{t("reminders.quietHours")}</h3>
          <p className="text-xs text-zinc-500 mt-1">{t("reminders.quietHoursHint")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label className="text-zinc-400 text-xs" htmlFor="cfg-qh-start">{t("reminders.quietHoursStart")}</Label>
            <Input
              id="cfg-qh-start"
              data-testid="input-reminder-quiet-start"
              type="time"
              value={form.quietHoursStart}
              onChange={e => setForm(f => f ? { ...f, quietHoursStart: e.target.value } : f)}
              className="mt-1 bg-zinc-950 border-zinc-700 text-white"
            />
          </div>
          <div>
            <Label className="text-zinc-400 text-xs" htmlFor="cfg-qh-end">{t("reminders.quietHoursEnd")}</Label>
            <Input
              id="cfg-qh-end"
              data-testid="input-reminder-quiet-end"
              type="time"
              value={form.quietHoursEnd}
              onChange={e => setForm(f => f ? { ...f, quietHoursEnd: e.target.value } : f)}
              className="mt-1 bg-zinc-950 border-zinc-700 text-white"
            />
          </div>
          <div>
            <Label className="text-zinc-400 text-xs" htmlFor="cfg-qh-tz">{t("reminders.quietHoursTz")}</Label>
            <Input
              id="cfg-qh-tz"
              data-testid="input-reminder-quiet-tz"
              value={form.quietHoursTz}
              onChange={e => setForm(f => f ? { ...f, quietHoursTz: e.target.value } : f)}
              className="mt-1 bg-zinc-950 border-zinc-700 text-white"
            />
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">{t("reminders.requiredDocs")}</h3>
          <p className="text-xs text-zinc-500 mt-1">{t("reminders.requiredDocsHint")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {docs.map(d => {
            const checked = form.requiredDocs.includes(d);
            const Icon = DOC_PIP_ICON[d];
            return (
              <label
                key={d}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${checked ? "bg-zinc-800 border-zinc-700" : "bg-zinc-950 border-zinc-800"}`}
              >
                <Checkbox
                  data-testid={`checkbox-required-doc-${d}`}
                  checked={checked}
                  onCheckedChange={() => toggleDoc(d)}
                />
                <Icon className="h-4 w-4 text-zinc-400" />
                <span className="text-sm text-zinc-200">{t(DOC_LABEL_KEYS[d])}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">{t("reminders.templates.title")}</h3>
          <p className="text-xs text-zinc-500 mt-1">{t("reminders.templates.subtitle")}</p>
          <p className="text-[11px] text-zinc-500 mt-1">{t("reminders.templates.placeholders")}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.keys(DEFAULT_REMINDER_TEMPLATES) as ReminderTemplateKey[]).map(k => (
            <div key={k}>
              <Label className="text-zinc-400 text-xs" htmlFor={`tpl-${k}`}>{t(`reminders.templates.${k}`)}</Label>
              <textarea
                id={`tpl-${k}`}
                data-testid={`textarea-template-${k}`}
                value={tplForm?.[k] ?? ""}
                onChange={e => setTplForm(prev => prev ? { ...prev, [k]: e.target.value } : prev)}
                rows={4}
                dir={k.endsWith("_ar") ? "rtl" : "ltr"}
                className="mt-1 w-full bg-zinc-950 border border-zinc-700 text-white text-sm rounded-md p-2 font-mono"
              />
              <div className="text-[11px] text-zinc-600 mt-1 ltr-numbers">
                {(tplForm?.[k] ?? "").length} / 480
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">{t("reminders.testSms.title")}</h3>
          <p className="text-xs text-zinc-500 mt-1">{t("reminders.testSms.subtitle")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-zinc-400 text-xs" htmlFor="test-sms-phone">{t("reminders.testSms.phone")}</Label>
            <Input
              id="test-sms-phone"
              data-testid="input-test-sms-phone"
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              placeholder="+9665XXXXXXXX"
              dir="ltr"
              className="mt-1 bg-zinc-950 border-zinc-700 text-white"
            />
          </div>
          <div>
            <Label className="text-zinc-400 text-xs">{t("reminders.testSms.variant")}</Label>
            <select
              data-testid="select-test-sms-variant"
              value={testVariant}
              onChange={e => setTestVariant(e.target.value as "regular" | "final")}
              className="mt-1 w-full bg-zinc-950 border border-zinc-700 text-white text-sm rounded-md p-2 h-10"
            >
              <option value="regular">{t("reminders.testSms.variantRegular")}</option>
              <option value="final">{t("reminders.testSms.variantFinal")}</option>
            </select>
          </div>
          <div>
            <Label className="text-zinc-400 text-xs">{t("reminders.testSms.locale")}</Label>
            <select
              data-testid="select-test-sms-locale"
              value={testLocale}
              onChange={e => setTestLocale(e.target.value as "ar" | "en")}
              className="mt-1 w-full bg-zinc-950 border border-zinc-700 text-white text-sm rounded-md p-2 h-10"
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            data-testid="button-send-test-sms"
            onClick={() => testSmsMut.mutate()}
            disabled={testSmsMut.isPending || testPhone.trim().length < 5}
            variant="outline"
            className="border-blue-800 text-blue-300 hover:bg-blue-950/40 gap-2"
          >
            {testSmsMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t("reminders.testSms.send")}
          </Button>
        </div>
      </div>

      <ReminderActivityTable />

      <div className="flex justify-end">
        <Button
          data-testid="button-save-reminder-config"
          onClick={() => form && tplForm && saveMutation.mutate({ config: form, templates: tplForm })}
          disabled={saveMutation.isPending}
          className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white gap-2"
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saveMutation.isPending ? t("reminders.saving") : t("reminders.save")}
        </Button>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const { t, i18n } = useTranslation("onboarding");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [atRiskOnly, setAtRiskOnly] = useState<boolean>(false);
  const [admitOpen, setAdmitOpen] = useState(false);
  const [checklistRecord, setChecklistRecord] = useState<OnboardingRecord | null>(null);
  const [convertRecord, setConvertRecord] = useState<OnboardingRecord | null>(null);
  const [admitSearch, setAdmitSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [admitPage, setAdmitPage] = useState(1);
  const [convertForm, setConvertForm] = useState({ startDate: "", salary: "", eventId: "", smpCompanyId: "" });
  const [rejectConfirmId, setRejectConfirmId] = useState<string | null>(null);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<{ candidateId: string; docType: string; label: string } | null>(null);
  const [docPreview, setDocPreview] = useState<{ url: string; label: string; isImage: boolean } | null>(null);
  const [bulkConvertOpen, setBulkConvertOpen] = useState(false);
  const [bulkConvertForm, setBulkConvertForm] = useState({ startDate: "", salary: "", eventId: "", smpCompanyId: "" });
  const [bulkContractOpen, setBulkContractOpen] = useState(false);
  const [bulkContractTemplateId, setBulkContractTemplateId] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const ADMIT_PAGE_SIZE = 10;

  const { data: eventsList = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/events"],
    queryFn: () => apiRequest("GET", "/api/events").then(r => r.json()),
  });

  const { data: records = [], isLoading } = useQuery<OnboardingRecord[]>({
    queryKey: ["/api/onboarding", { eventId: eventFilter !== "all" ? eventFilter : undefined }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (eventFilter !== "all") params.set("eventId", eventFilter);
      return apiRequest("GET", `/api/onboarding${params.toString() ? `?${params}` : ""}`).then(r => r.json());
    },
    refetchInterval: 15000,
  });

  // Task #214 — derive the reminder status map directly from the inline
  // `reminder` block carried by GET /api/onboarding. The dedicated
  // /reminders/status endpoint is kept on the server for back-compat
  // but the pipeline no longer round-trips for it.
  const reminderStatusMap = (() => {
    const m = new Map<string, ReminderRowStatus>();
    for (const r of records) {
      const inline = (r as OnboardingRecord & { reminder?: OnboardingReminderInline }).reminder;
      if (!inline) continue;
      m.set(r.id, {
        onboardingId: r.id,
        state: inline.state,
        missingDocs: inline.missingDocs,
        reminderCount: inline.count,
        maxReminders: inline.max,
        lastReminderSentAt: inline.lastSentAt,
        nextScheduledAt: inline.nextScheduledAt,
        eliminationAt: inline.eliminationAt,
        finalWarningAt: inline.finalWarningAt ?? null,
        finalWarningSentAt: inline.finalWarningSentAt ?? null,
        remindersPaused: inline.paused,
        events: inline.events ?? [],
      });
    }
    return m;
  })();

  // Master switch flag for the whole pipeline (UI-level gate for the
  // at-risk filter chip). The server stamps every inline reminder block
  // with the same `enabled`, so reading the first record's flag is fine;
  // when there are no records yet we hide the chip too.
  const remindersMasterEnabled = (() => {
    for (const r of records) {
      const inline = (r as OnboardingRecord & { reminder?: OnboardingReminderInline }).reminder;
      if (inline) return inline.enabled === true;
    }
    return false;
  })();

  // If reminders get disabled while the at-risk filter is active, the
  // chip disappears but the filter would silently keep emptying the list
  // (state==="off" rows are excluded by atRiskOnly). Reset the toggle so
  // the filter is a true no-op when the master switch is off.
  useEffect(() => {
    if (!remindersMasterEnabled && atRiskOnly) {
      setAtRiskOnly(false);
    }
  }, [remindersMasterEnabled, atRiskOnly]);

  // Pull every non-archived candidate, NOT just those with a record-level
  // status of "available". The admit-dialog eligibility filter
  // (`eligibleCandidates` below) gates by application.status === "shortlisted"
  // — that is the source of truth for "Like" → "appears in admit dialog".
  // Filtering by candidates.status here used to silently hide liked
  // candidates whose record status was "active", "awaiting_activation",
  // "hired" (from a prior stint), etc. — even though their current
  // application was shortlisted.
  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates", { limit: 1000 }],
    queryFn: () => apiRequest("GET", "/api/candidates?limit=1000").then(r => r.json()),
    select: (r: any) => r?.data ?? [],
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // The big /api/applications payload is now used ONLY for the small
  // auxiliary lookups on the page (getJobMinForRecord and the per-row
  // "linked job" badge). The "Admit Candidate" dialog has its own tight
  // endpoint (`/api/onboarding/admit-eligible`) that pre-filters
  // eligibility in SQL and returns < a few KB even on tenants with
  // thousands of applications, which is what keeps the dialog opening in
  // milliseconds. We can therefore drop the 15s polling and the
  // refetchOnWindowFocus on this list — it changes only when the user
  // performs an action that already invalidates this key.
  const { data: applications = [] } = useQuery<Application[]>({
    queryKey: ["/api/applications"],
    queryFn: () => apiRequest("GET", "/api/applications").then(r => r.json()),
    select: (r: any) => Array.isArray(r) ? r : [],
  });

  // Eligibility for the Admit dialog. Pre-filtered server-side so the
  // dialog can render in milliseconds. `enabled: admitOpen` defers the
  // round-trip until the user actually opens the dialog, so the
  // onboarding page itself stays cheap to mount. `staleTime: 0` +
  // explicit invalidation on shortlist/admit mutations guarantee the
  // list is always current.
  const { data: eligibleFromServer = [], isFetching: eligibleFetching } = useQuery<EligibleCandidate[]>({
    queryKey: ["/api/onboarding/admit-eligible"],
    queryFn: () => apiRequest("GET", "/api/onboarding/admit-eligible").then(r => r.json()),
    enabled: admitOpen,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // Lightweight jobs lookup so we can surface the job's minimum salary as a
  // one-click prefill in the convert dialogs. Decoupled from the salary input
  // itself — the box stays empty by default; the chip is just a shortcut.
  const { data: jobsForSalary = [] } = useQuery<{ id: string; salaryMin: string | null }[]>({
    queryKey: ["/api/jobs"],
    queryFn: () => apiRequest("GET", "/api/jobs").then(r => r.json()),
    select: (r: any) => Array.isArray(r) ? r.map((j: any) => ({ id: j.id, salaryMin: j.salaryMin ?? null })) : [],
  });
  const getJobMinForRecord = useCallback((rec: OnboardingRecord | null | undefined): number | null => {
    if (!rec?.applicationId) return null;
    const app = applications.find(a => a.id === rec.applicationId);
    if (!app?.jobId) return null;
    const job = jobsForSalary.find(j => j.id === app.jobId);
    const n = job?.salaryMin != null ? Number(job.salaryMin) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [applications, jobsForSalary]);

  const { data: adminUsers = [] } = useQuery<{ id: string; fullName: string }[]>({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest("GET", "/api/users").then(r => r.json()),
    select: (data: { id: string; fullName: string; [key: string]: unknown }[]) => data.map(u => ({ id: u.id, fullName: u.fullName })),
  });
  const getAdminName = useCallback((id: string | null | undefined) => {
    if (!id) return null;
    return adminUsers.find(u => u.id === id)?.fullName ?? t("admin.unknown");
  }, [adminUsers, t]);

  type AdmitItem = { candidateId: string; applicationId: string | null; jobId: string | null; hasPhoto: boolean; hasIban: boolean; hasNationalId: boolean; hasVaccinationReport: boolean };
  const admitMutation = useMutation({
    mutationFn: async (items: AdmitItem[]) => {
      await Promise.all(items.map(body => apiRequest("POST", "/api/onboarding", body)));
    },
    onSuccess: (_data, items) => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      // Once admitted, those candidates now have an active onboarding row
      // and must drop out of the eligible list immediately.
      qc.invalidateQueries({ queryKey: ["/api/onboarding/admit-eligible"] });
      setAdmitOpen(false);
      setSelectedIds(new Set());
      setAdmitSearch("");
      setAdmitPage(1);
      toast({ title: t("toasts.admitted", { n: formatNumber(items.length), count: items.length }) });
    },
    onError: (e: any) => toast({ title: t("toasts.error"), description: e?.message ?? t("toasts.admitFailed"), variant: "destructive" }),
  });

  const checklistMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      apiRequest("PATCH", `/api/onboarding/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      // Refresh the local checklist record
      setChecklistRecord(prev => prev ? { ...prev, ...(checklistMutation.variables?.data as any) } : prev);
    },
    onError: (e: any) => toast({ title: t("toasts.error"), description: e?.message, variant: "destructive" }),
  });

  const { data: meUser } = useQuery<{ id: string; fullName?: string }>({
    queryKey: ["/api/me"],
    queryFn: () => apiRequest("GET", "/api/me").then(r => r.json()),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/onboarding/${id}`, { status: "rejected", rejectedBy: meUser?.id ?? null }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      // Rejecting clears the active onboarding row, so the candidate may
      // re-enter the eligible list if their application is still
      // shortlisted — refresh so the dialog reflects that immediately.
      qc.invalidateQueries({ queryKey: ["/api/onboarding/admit-eligible"] });
      toast({ title: t("toasts.rejected") });
    },
    onError: (e: any) => toast({ title: t("toasts.error"), description: e?.message, variant: "destructive" }),
  });

  const convertMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      apiRequest("POST", `/api/onboarding/${id}/convert`, body).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      qc.invalidateQueries({ queryKey: ["/api/onboarding/admit-eligible"] });
      setConvertRecord(null);
      setConvertForm({ startDate: "", salary: "", eventId: "", smpCompanyId: "" });
      toast({ title: t("toasts.converted"), description: t("toasts.convertedDesc") });
    },
    onError: (e: any) => toast({ title: t("toasts.error"), description: e?.message, variant: "destructive" }),
  });

  const bulkConvertMutation = useMutation({
    mutationFn: (body: { ids: string[]; startDate: string }) =>
      apiRequest("POST", "/api/onboarding/bulk-convert", body).then(r => r.json()),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      qc.invalidateQueries({ queryKey: ["/api/onboarding/admit-eligible"] });
      setBulkConvertOpen(false);
      setBulkConvertForm({ startDate: "", salary: "", eventId: "", smpCompanyId: "" });
      const errCount = data.errors?.length ?? 0;
      toast({
        title: t("toasts.bulkConverted", { n: formatNumber(data.converted), count: data.converted }),
        description: errCount > 0 ? t("toasts.bulkConvertedFailed", { n: formatNumber(errCount) }) : t("toasts.bulkConvertedAll"),
        variant: errCount > 0 ? "destructive" : "default",
      });
    },
    onError: (e: any) => toast({ title: t("toasts.error"), description: e?.message, variant: "destructive" }),
  });

  const { data: activeTemplates = [] } = useQuery<ContractTemplate[]>({
    queryKey: ["/api/contract-templates"],
    select: (data: ContractTemplate[]) => data.filter(tpl => tpl.status === "active"),
  });

  const { data: smpCompanies = [] } = useQuery<{ id: string; name: string; isActive: boolean }[]>({
    queryKey: ["/api/smp-companies"],
    queryFn: () => apiRequest("GET", "/api/smp-companies").then(r => r.json()),
    select: (data: { id: string; name: string; isActive: boolean }[]) => data.filter(c => c.isActive),
  });

  const bulkContractMutation = useMutation({
    mutationFn: (body: { onboardingIds: string[]; templateId: string }) =>
      apiRequest("POST", "/api/onboarding/bulk-generate-contracts", body).then(r => r.json()),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      qc.invalidateQueries({ queryKey: ["/api/candidate-contracts"] });
      setBulkContractOpen(false);
      setBulkContractTemplateId("");
      toast({
        title: t("toasts.contractsGenerated", { n: formatNumber(data.generated), count: data.generated }),
        description: data.failed > 0 ? t("toasts.contractsFailed", { n: formatNumber(data.failed) }) : t("toasts.contractsNotified"),
      });
    },
    onError: (e: any) => toast({ title: t("toasts.error"), description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/onboarding/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      // Deleting an active onboarding row makes the candidate eligible
      // again if their application is still shortlisted.
      qc.invalidateQueries({ queryKey: ["/api/onboarding/admit-eligible"] });
      toast({ title: t("toasts.recordRemoved") });
    },
    onError: (e: any) => toast({ title: t("toasts.error"), description: e?.message, variant: "destructive" }),
  });

  const deleteDocMutation = useMutation({
    mutationFn: ({ candidateId, docType }: { candidateId: string; docType: string }) =>
      apiRequest("DELETE", `/api/candidates/${candidateId}/documents/${docType}`).then(r => r.json()),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      qc.invalidateQueries({ queryKey: ["/api/candidates"] });
      const labelMap: Record<string, string> = {
        photo: t("docs.photo"),
        nationalId: t("docs.nationalId"),
        iban: t("docs.iban"),
        vaccinationReport: t("docs.vaccinationReport"),
      };
      toast({ title: t("toasts.docRemoved", { label: labelMap[vars.docType] ?? t("docs.document") }), description: t("toasts.docRemovedDesc") });
      const flagMap: Record<string, string> = { photo: "hasPhoto", nationalId: "hasNationalId", iban: "hasIban", vaccinationReport: "hasVaccinationReport" };
      const flag = flagMap[vars.docType];
      if (flag) setChecklistRecord(prev => prev ? { ...prev, [flag]: false } : prev);
    },
    onError: (e: any) => toast({ title: t("toasts.error"), description: e?.message, variant: "destructive" }),
  });

  // Task #214 — reminder action mutations
  const reminderActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "send-now" | "pause" | "resume" }) => {
      const path = action === "send-now" ? "send-reminder-now"
                 : action === "pause"     ? "pause-reminders"
                                          : "resume-reminders";
      return apiRequest("POST", `/api/onboarding/${id}/${path}`).then(r => r.json());
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding/reminders/status"] });
      qc.invalidateQueries({ queryKey: ["/api/onboarding/reminders/activity"] });
      qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
      const key = vars.action === "send-now" ? "sentNow" : vars.action === "pause" ? "paused" : "resumed";
      toast({ title: t(`reminders.toasts.${key}`) });
    },
    onError: (e: any) => toast({ title: t("reminders.toasts.actionFailed"), description: e?.message, variant: "destructive" }),
  });

  const filtered = records.filter(r => {
    if (statusFilter === "active" && (r.status === "rejected" || r.status === "converted" || r.status === "terminated")) return false;
    if (statusFilter !== "all" && statusFilter !== "active" && r.status !== statusFilter) return false;
    if (atRiskOnly) {
      const s = reminderStatusMap.get(r.id);
      if (!s || !s.eliminationAt || s.state === "off" || s.state === "eliminated") return false;
      const msLeft = new Date(s.eliminationAt).getTime() - Date.now();
      if (msLeft > 24 * 3600_000) return false;
    }
    if (search) {
      const candidate = candidates.find(c => c.id === r.candidateId);
      const q = search.toLowerCase();
      const name = candidate?.fullNameEn?.toLowerCase() ?? "";
      const nationalId = candidate?.nationalId?.toLowerCase() ?? "";
      const iqama = (candidate as any)?.iqamaNumber?.toLowerCase() ?? "";
      const phone = candidate?.phone?.toLowerCase() ?? "";
      if (!name.includes(q) && !nationalId.includes(q) && !iqama.includes(q) && !phone.includes(q)) return false;
    }
    return true;
  });

  // Candidates eligible for admission: ONLY those currently shortlisted
  // from the interviews page, with no active onboarding row, and not
  // archived. The eligibility filter now lives in SQL behind
  // GET /api/onboarding/admit-eligible (`storage.getAdmitEligibleCandidates`)
  // — the response is already deduped per candidate and carries the
  // exact (applicationId, jobId) the admit POST should link to. The
  // dialog opens in milliseconds because the server returns just the
  // ready-to-render list rather than asking the client to fan out the
  // full /api/applications payload.
  const eligibleCandidates: EligibleCandidate[] = eligibleFromServer;
  const admitFiltered = eligibleCandidates.filter(c =>
    !admitSearch || c.fullNameEn.toLowerCase().includes(admitSearch.toLowerCase()) || (c.nationalId ?? "").toLowerCase().includes(admitSearch.toLowerCase()) || (c.phone ?? "").toLowerCase().includes(admitSearch.toLowerCase())
  );
  const admitTotalPages = Math.max(1, Math.ceil(admitFiltered.length / ADMIT_PAGE_SIZE));
  const admitPageCandidates = admitFiltered.slice((admitPage - 1) * ADMIT_PAGE_SIZE, admitPage * ADMIT_PAGE_SIZE);
  const allPageSelected = admitPageCandidates.length > 0 && admitPageCandidates.every(c => selectedIds.has(c.id));
  const somePageSelected = admitPageCandidates.some(c => selectedIds.has(c.id));

  function getCandidateFor(rec: OnboardingRecord) {
    // Prefer the full Candidate from the paginated /api/candidates list
    // when it's there (gives us every column that the page might need),
    // but fall back to the smaller `candidate` summary the server now
    // embeds on each onboarding row. Without this fallback, tenants with
    // > 1000 candidates rendered the onboarded ones as "record.unknown"
    // because the older candidate IDs dropped off the first page of the
    // candidates list. The summary covers every field the onboarding
    // page reads via this helper — name, IDs, phone/email, file URLs
    // for the checklist drawer, classification, archivedAt — so the
    // unsafe-looking cast is shape-safe for this page's usage. Don't
    // assume Candidate-completeness elsewhere without re-checking.
    const fromList = candidates.find(c => c.id === rec.candidateId);
    if (fromList) return fromList;
    const embedded = (rec as OnboardingRecord & {
      candidate?: {
        id: string;
        fullNameEn: string;
        nationalId: string | null;
        phone: string | null;
        email: string | null;
        classification: string;
        archivedAt: string | null;
        photoUrl: string | null;
        nationalIdFileUrl: string | null;
        ibanFileUrl: string | null;
        ibanNumber: string | null;
        vaccinationReportFileUrl: string | null;
      } | null;
    }).candidate;
    if (!embedded) return undefined;
    return embedded as unknown as Candidate;
  }

  function handleAdmit() {
    if (selectedIds.size === 0) return;
    const items = [...selectedIds].map(id => {
      const c = eligibleCandidates.find(x => x.id === id)!;
      // Use the EXACT shortlisted application/job that put this candidate in
      // the dialog — `c.applicationId` was captured during eligibility
      // derivation from the shortlisted row. Falling back to a wider
      // status-set search risks linking onboarding to the wrong job (e.g.
      // an older "hired" application from a different posting).
      return {
        candidateId: id,
        applicationId: c.applicationId,
        jobId: c.jobId,
        // Coerce server-side nullables to strict booleans for the AdmitItem
        // contract. A missing flag means "not yet uploaded", which the
        // admit-side prerequisite check treats the same as `false`.
        hasPhoto: c.hasPhoto ?? false,
        hasIban: c.hasIban ?? false,
        hasNationalId: c.hasNationalId ?? false,
        hasVaccinationReport: c.hasVaccinationReport ?? false,
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

  const readyAll = records.filter(r => r.status === "ready");
  const convertibleReady = readyAll.filter(r => {
    const candidate = candidates.find(c => c.id === r.candidateId);
    const isSmpCandidate = (candidate as any)?.classification === "smp";
    const isSmpPipeline = isSmpCandidate || !r.applicationId;
    const contractSigned = r.hasSignedContract || !!r.contractSignedAt;
    return isSmpPipeline || contractSigned;
  });
  const stats = {
    total:     records.length,
    pending:   records.filter(r => r.status === "pending").length,
    inProgress:records.filter(r => r.status === "in_progress").length,
    ready:     readyAll.length,
    convertible: convertibleReady.length,
    readyNoContract: readyAll.length - convertibleReady.length,
    converted: records.filter(r => r.status === "converted").length,
    terminated: records.filter(r => r.status === "terminated").length,
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">{t("page.title")}</h1>
            <p className="text-zinc-400 mt-1 text-sm">{t("page.subtitle")}</p>
          </div>
        </div>

        <Tabs defaultValue="pipeline" className="w-full" dir={i18n.dir() as "ltr" | "rtl"}>
          <TabsList className="bg-zinc-900 border border-zinc-800 p-1">
            <TabsTrigger value="pipeline" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 gap-2" data-testid="tab-pipeline">
              <ClipboardCheck className="h-4 w-4" />
              {t("tabs.pipeline")}
            </TabsTrigger>
            <TabsTrigger value="templates" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 gap-2" data-testid="tab-templates">
              <FileText className="h-4 w-4" />
              {t("tabs.templates")}
            </TabsTrigger>
            <TabsTrigger value="reminders" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 gap-2" data-testid="tab-reminders">
              <Bell className="h-4 w-4" />
              {t("tabs.reminders")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="space-y-6 mt-4">
        <div className="flex justify-end gap-2">
            {activeTemplates.length > 0 && filtered.filter(r => r.status !== "converted" && r.status !== "rejected" && r.status !== "terminated").length > 0 && (
              <Button
                data-testid="button-bulk-contracts"
                onClick={() => setBulkContractOpen(true)}
                variant="outline"
                className="border-blue-700 text-blue-400 hover:bg-blue-900/30 gap-2"
              >
                <FileSignature className="h-4 w-4" />
                {t("actions.bulkGenerateContracts")}
              </Button>
            )}
            {stats.convertible > 0 && (
              <Button
                data-testid="button-bulk-convert"
                onClick={() => setBulkConvertOpen(true)}
                variant="outline"
                className="border-emerald-700 text-emerald-400 hover:bg-emerald-900/30 gap-2"
              >
                <UserCheck className="h-4 w-4" />
                {t("actions.convertAllReady", { n: formatNumber(stats.convertible) })}
              </Button>
            )}
            <Button
              data-testid="button-admit-candidate"
              onClick={() => setAdmitOpen(true)}
              className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white gap-2"
            >
              <Plus className="h-4 w-4" />
              {t("actions.admit")}
            </Button>
          </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { key: "total",      label: t("stats.total"),      value: stats.total,      color: "text-white" },
            { key: "pending",    label: t("stats.pending"),    value: stats.pending,    color: "text-zinc-400" },
            { key: "inProgress", label: t("stats.inProgress"), value: stats.inProgress, color: "text-yellow-400" },
            { key: "ready",      label: t("stats.ready"),      value: stats.ready,      color: "text-emerald-400" },
            { key: "converted",  label: t("stats.converted"),  value: stats.converted,  color: "text-blue-400" },
          ].map(s => (
            <div key={s.key} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color} mt-1`} data-testid={`stat-onboarding-${s.key}`}>{formatNumber(s.value)}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              data-testid="input-search-onboarding"
              placeholder={t("filters.searchPlaceholder")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="ps-9 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
            />
          </div>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger data-testid="select-event-filter-onboarding" className="w-40 bg-zinc-900 border-zinc-700 text-white">
              <SelectValue placeholder={t("filters.allEvents")} />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              <SelectItem value="all">{t("filters.allEvents")}</SelectItem>
              {eventsList.map((evt) => (
                <SelectItem key={evt.id} value={evt.id}><bdi>{evt.name}</bdi></SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-status-filter" className="w-40 bg-zinc-900 border-zinc-700 text-white">
              <SelectValue placeholder={t("filters.allStatuses")} />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              <SelectItem value="active">{t("filters.active")}</SelectItem>
              <SelectItem value="all">{t("filters.allStatuses")}</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{t(`status.${k}`, { defaultValue: v.label })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* At-risk chip is meaningless when the master switch is off:
              no row will ever flip into a reminder state, so the filter
              would be a no-op. Hide it entirely until reminders are
              enabled in the settings tab. */}
          {remindersMasterEnabled && (
            <Button
              data-testid="button-filter-at-risk"
              onClick={() => setAtRiskOnly(v => !v)}
              variant={atRiskOnly ? "default" : "outline"}
              className={atRiskOnly
                ? "bg-red-900/40 border-red-700 text-red-200 hover:bg-red-900/60 gap-2"
                : "border-zinc-700 text-zinc-400 hover:bg-zinc-800 gap-2"}
            >
              <AlertTriangle className="h-4 w-4" />
              {t("reminders.actions.filterAtRisk")}
            </Button>
          )}
        </div>

        {/* Records List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Users className="h-12 w-12 text-zinc-700 mb-4" />
            <p className="text-zinc-400 font-medium">{t("empty.noRecords")}</p>
            <p className="text-zinc-600 text-sm mt-1">{t("empty.admitFirst")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(rec => {
              const candidate = getCandidateFor(rec);
              const isSmp = (candidate as any)?.classification === "smp";
              const done = prereqCount(rec, candidate, isSmp);
              const total = prereqTotal(isSmp);
              const cfg = STATUS_CONFIG[rec.status];
              const StatusIcon = cfg.icon;
              const isReady = rec.status === "ready";
              const isConverted = rec.status === "converted";
              const isRejected = rec.status === "rejected";
              const contractSigned = rec.hasSignedContract || !!rec.contractSignedAt;
              const isSmpPipeline = isSmp || !rec.applicationId;
              const canConvert = isReady && (isSmpPipeline || contractSigned);
              const linkedApp = rec.applicationId ? applications.find(a => a.id === rec.applicationId) : null;
              const isOffered = linkedApp?.status === "offered";

              const reminderStatus = reminderStatusMap.get(rec.id);
              const elimMsLeft = reminderStatus?.eliminationAt
                ? new Date(reminderStatus.eliminationAt).getTime() - Date.now()
                : null;
              const within24h = elimMsLeft != null && elimMsLeft >= 0 && elimMsLeft <= 24 * 3600_000
                && reminderStatus?.state !== "off" && reminderStatus?.state !== "eliminated";
              const within6h = elimMsLeft != null && elimMsLeft >= 0 && elimMsLeft <= 6 * 3600_000
                && reminderStatus?.state !== "off" && reminderStatus?.state !== "eliminated";
              const accentClass = within6h
                ? "border-r-2 border-r-red-500"
                : within24h
                  ? "border-r-2 border-r-orange-500"
                  : "";
              return (
                <div
                  key={rec.id}
                  data-testid={`card-onboarding-${rec.id}`}
                  data-at-risk={within24h ? "true" : undefined}
                  className={`bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${accentClass}`}
                >
                  {/* Avatar */}
                  <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 text-lg font-bold text-zinc-300">
                    {candidate?.fullNameEn?.charAt(0).toUpperCase() ?? "?"}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white text-sm"><bdi>{candidate?.fullNameEn ?? t("record.unknown")}</bdi></span>
                      {candidate?.nationalId && <span className="text-zinc-500 text-xs font-mono" dir="ltr">{candidate.nationalId}</span>}
                      <Badge className={`text-xs px-2 py-0.5 ${cfg.color} border-0`}>
                        <StatusIcon className="h-3 w-3 me-1" />
                        {t(`status.${rec.status}`, { defaultValue: cfg.label })}
                      </Badge>
                      {isOffered && !isConverted && (
                        <Badge data-testid={`badge-offered-${rec.id}`} className="text-[10px] px-1.5 py-0.5 bg-cyan-900/50 text-cyan-400 border-0">{t("badges.offered")}</Badge>
                      )}
                      {isSmp && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-800 text-blue-400">{t("badges.smp")}</Badge>
                      )}
                      {isRejected && rec.rejectedAt && (
                        <span className="text-[11px] text-zinc-500">
                          {t("record.rejectedOn", { date: formatDate(rec.rejectedAt, i18n.language, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) })}
                          {rec.rejectedBy && <> {t("record.byAdmin")} <strong className="text-zinc-400"><bdi>{getAdminName(rec.rejectedBy)}</bdi></strong></>}
                        </span>
                      )}
                    </div>
                    {(() => {
                      const docPrereqs = getPrerequisites(isSmp);
                      const docsComplete = docPrereqs.every(p => isPrereqSatisfied(rec, candidate, p));
                      const docsDone = docPrereqs.filter(p => isPrereqSatisfied(rec, candidate, p)).length;
                      const phase = isConverted ? 3 : isSmpPipeline ? (docsComplete ? 3 : 1) : contractSigned ? 3 : docsComplete ? 2 : 1;
                      return (
                        <div className="mt-2">
                          <div className="flex items-center gap-1 text-xs">
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${phase >= 1 ? (docsComplete ? "bg-emerald-900/40 text-emerald-400" : "bg-yellow-900/40 text-yellow-400") : "bg-zinc-800 text-zinc-500"}`}>
                              <ClipboardCheck className="h-3 w-3" />
                              {t("phases.docs", { done: formatNumber(docsDone), total: formatNumber(docPrereqs.length) })}
                            </div>
                            <div className={`w-4 h-px ${phase >= 2 ? "bg-emerald-700" : "bg-zinc-700"}`} />
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${isSmpPipeline ? "bg-zinc-800 text-zinc-600" : phase >= 2 ? (contractSigned ? "bg-emerald-900/40 text-emerald-400" : "bg-yellow-900/40 text-yellow-400") : "bg-zinc-800 text-zinc-600"}`}>
                              <FileSignature className="h-3 w-3" />
                              {isSmpPipeline ? t("phases.notApplicable") : contractSigned ? t("phases.signed") : rec.contractUrl ? t("phases.awaitingSignature") : docsComplete ? t("phases.awaitingContract") : t("phases.notGenerated")}
                            </div>
                            <div className={`w-4 h-px ${phase >= 3 ? "bg-emerald-700" : "bg-zinc-700"}`} />
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${phase >= 3 ? "bg-emerald-900/40 text-emerald-400" : "bg-zinc-800 text-zinc-600"}`}>
                              <CheckCircle2 className="h-3 w-3" />
                              {isConverted ? t("phases.converted") : phase >= 3 ? t("phases.ready") : "—"}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    {/* Task #214 — reminder status indicator */}
                    {reminderStatus && reminderStatus.state !== "off" && !isConverted && !isRejected && (
                      <ReminderRowIndicator status={reminderStatus} />
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    {/* Task #214 — reminder action buttons */}
                    {reminderStatus && reminderStatus.state !== "off" && reminderStatus.state !== "eliminated" && !isConverted && !isRejected && (
                      <ReminderRowActions
                        rec={rec}
                        status={reminderStatus}
                        pending={reminderActionMutation.isPending}
                        onAction={(action) => reminderActionMutation.mutate({ id: rec.id, action })}
                      />
                    )}
                    {!isConverted && !isRejected && (
                      <Button
                        data-testid={`button-checklist-${rec.id}`}
                        size="sm"
                        variant="outline"
                        className="border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 gap-1"
                        onClick={() => setChecklistRecord(rec)}
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        {t("actions.checklist")}
                      </Button>
                    )}
                    {isReady && (
                      <div className="relative group">
                        <Button
                          data-testid={`button-convert-${rec.id}`}
                          size="sm"
                          className={canConvert ? "bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white gap-1" : "bg-zinc-700 text-zinc-400 gap-1 cursor-not-allowed"}
                          disabled={!canConvert}
                          onClick={() => {
                            if (!canConvert) return;
                            setConvertRecord(rec);
                            setConvertForm({
                              startDate: rec.startDate ?? "",
                              salary: "",
                              eventId: rec.eventId ?? "",
                              smpCompanyId: "",
                            });
                          }}
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          {t("actions.convertToEmployee")}
                        </Button>
                        {!canConvert && isReady && !isSmpPipeline && (
                          <div className="absolute bottom-full start-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-xs text-yellow-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            <FileSignature className="h-3 w-3 inline me-1" />
                            {t("actions.contractMustBeSigned")}
                          </div>
                        )}
                      </div>
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
                        {t("actions.reject")}
                      </Button>
                    )}
                    {isConverted && (
                      <div className="flex items-center gap-1 text-blue-400 text-xs">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{t("actions.movedToWorkforce")}</span>
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

          <TabsContent value="reminders" className="mt-4">
            <ReminderSettingsTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Admit Candidate Dialog ── */}
      <Dialog open={admitOpen} onOpenChange={setAdmitOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">{t("admit.title")}</DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              {t("admit.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                data-testid="input-admit-search"
                placeholder={t("admit.searchPlaceholder")}
                value={admitSearch}
                onChange={e => { setAdmitSearch(e.target.value); setAdmitPage(1); }}
                className="ps-9 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
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
                  {allPageSelected ? t("admit.deselectAll") : t("admit.selectAll")}
                </button>
                {selectedIds.size > 0 && (
                  <span className="text-xs text-[hsl(155,45%,55%)] font-medium">
                    {t("admit.selectedTotal", { n: formatNumber(selectedIds.size) })}
                  </span>
                )}
              </div>
            )}

            {/* Candidate list */}
            <div className="space-y-1">
              {admitFiltered.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-sm">
                  {eligibleCandidates.length === 0
                    ? t("admit.noEligible")
                    : t("admit.noMatch")}
                </div>
              ) : admitPageCandidates.map(c => {
                const isSelected = selectedIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    data-testid={`button-select-candidate-${c.id}`}
                    onClick={() => toggleCandidate(c.id)}
                    className={`w-full text-start px-3 py-2.5 rounded-lg border transition-colors flex items-center gap-3 ${
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
                      <p className="text-sm font-medium text-white truncate"><bdi>{c.fullNameEn}</bdi></p>
                      {c.nationalId && <p className="text-xs text-zinc-500 font-mono" dir="ltr">{c.nationalId}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {c.hasPhoto              && <span title={t("docs.photo")}              className="text-emerald-500"><Camera     className="h-3.5 w-3.5" /></span>}
                      {c.hasIban               && <span title={t("docs.iban")}               className="text-emerald-500"><CreditCard className="h-3.5 w-3.5" /></span>}
                      {c.hasNationalId         && <span title={t("docs.nationalId")}         className="text-emerald-500"><IdCard     className="h-3.5 w-3.5" /></span>}
                      {c.hasVaccinationReport  && <span title={t("docs.vaccinationReport")}  className="text-emerald-500"><Syringe    className="h-3.5 w-3.5" /></span>}
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
                  {t("admit.prev")}
                </Button>
                <span className="text-xs text-zinc-500">
                  {t("admit.pageOf", { page: formatNumber(admitPage), total: formatNumber(admitTotalPages) })} &nbsp;·&nbsp; {t("admit.eligibleCount", { n: formatNumber(admitFiltered.length) })}
                </span>
                <Button
                  data-testid="button-admit-next-page"
                  size="sm"
                  variant="outline"
                  disabled={admitPage === admitTotalPages}
                  onClick={() => setAdmitPage(p => Math.min(admitTotalPages, p + 1))}
                  className="border-zinc-700 text-zinc-300 h-7 px-2 text-xs"
                >
                  {t("admit.next")}
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
                {t("common.cancel")}
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
                    ? t("admit.confirmN", { n: formatNumber(selectedIds.size), count: selectedIds.size })
                    : t("admit.selectFirst")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Checklist Sheet ── */}
      <Sheet open={!!checklistRecord} onOpenChange={o => !o && setChecklistRecord(null)}>
        <SheetContent className="bg-zinc-950 border-zinc-800 text-white w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display text-lg">{t("checklist.title")}</SheetTitle>
            <SheetDescription className="text-zinc-400 text-sm" asChild>
              {checklistRecord ? (() => {
                const c = getCandidateFor(checklistRecord);
                return (
                  <div>
                    <bdi>{c?.fullNameEn ?? t("record.candidate")}</bdi>
                    {c?.nationalId ? <> — <span dir="ltr">{c.nationalId}</span></> : null}
                  </div>
                );
              })() : <div />}
            </SheetDescription>
          </SheetHeader>

          {checklistRecord && (() => {
            const checklistCand = getCandidateFor(checklistRecord);
            const checklistIsSmp = (checklistCand as any)?.classification === "smp";
            const checklistPrereqs = getPrerequisites(checklistIsSmp);
            const checklistDone = prereqCount(checklistRecord, checklistCand, checklistIsSmp);
            const checklistTotal = prereqTotal(checklistIsSmp);
            return (
            <div className="mt-6 space-y-4">
              {checklistIsSmp && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-950/30 border border-blue-800/40 text-blue-300 text-xs">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  {t("checklist.smpHint")}
                </div>
              )}
              {/* Progress summary */}
              <div className="bg-zinc-900 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-zinc-400">{t("checklist.completion")}</span>
                  <span className="text-sm font-medium text-white">{formatNumber(checklistDone)}/{formatNumber(checklistTotal)}</span>
                </div>
                <ProgressBar value={checklistDone} total={checklistTotal} />
                {checklistDone === checklistTotal && (
                  <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t("checklist.allComplete")}
                  </p>
                )}
              </div>

              {/* Checklist items */}
              <div className="space-y-3">
                {checklistPrereqs.map(p => {
                  const cand = getCandidateFor(checklistRecord);
                  const checked = isPrereqSatisfied(checklistRecord, cand, p);
                  let profileValue = p.profileKey && cand ? (cand as any)[p.profileKey] : null;
                  if (!profileValue && p.profileKey === "ibanFileUrl" && cand?.ibanNumber?.startsWith("/uploads/")) {
                    profileValue = cand.ibanNumber;
                  }
                  if (profileValue && p.profileKey && p.profileKey !== "photoUrl") {
                    profileValue = toProxiedFileUrl(profileValue) ?? profileValue;
                  }
                  const hasProfileData = !!profileValue;
                  const isFilePrereq = p.isFile && p.profileKey;
                  const docTypeMap: Record<string, string> = { photoUrl: "photo", nationalIdFileUrl: "nationalId", ibanFileUrl: "iban", vaccinationReportFileUrl: "vaccinationReport" };
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
                        <div className={`mt-0.5 h-4 w-4 rounded-sm border flex items-center justify-center shrink-0 ${
                            checked ? "bg-emerald-600 border-emerald-600" : "border-zinc-600 bg-transparent"
                          }`}>
                            {checked && <Check className="h-3 w-3 text-white" />}
                          </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white flex items-center gap-2">
                            <p.icon className="h-4 w-4 text-zinc-400" />
                            {t(`prereq.${p.key}.label`, { defaultValue: p.label })}
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5">{t(`prereq.${p.key}.hint`, { defaultValue: p.hint })}</p>
                        </div>
                        {checked && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />}
                      </div>
                      {hasProfileData && isFilePrereq && (
                        <div className="mt-2 ms-8 bg-zinc-800/60 rounded-md p-2.5 border border-zinc-700/50">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {(() => {
                                const isImg = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(profileValue);
                                const openPreview = (e: React.MouseEvent) => { e.stopPropagation(); setDocPreview({ url: profileValue, label: p.label, isImage: isImg }); };
                                return p.profileKey === "photoUrl" && isImg ? (
                                  <button className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer" onClick={openPreview}>
                                    <Eye className="h-5 w-5 text-emerald-400 shrink-0" />
                                    <img src={profileValue} alt={t("checklist.candidatePhotoAlt")} className="h-8 w-8 rounded-sm object-cover border border-zinc-600" />
                                    <span className="text-sm text-emerald-400 underline underline-offset-2">{t("checklist.viewPhoto")}</span>
                                  </button>
                                ) : (
                                  <button className="flex items-center gap-3 hover:text-emerald-300 transition-colors cursor-pointer" onClick={openPreview}>
                                    <Eye className="h-5 w-5 text-emerald-400 shrink-0" />
                                    <span className="text-sm text-emerald-400 underline underline-offset-2">{isImg ? t("checklist.viewImage") : t("checklist.viewDocument")}</span>
                                  </button>
                                );
                              })()}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className="text-[10px] border-emerald-800 text-emerald-400">{t("checklist.uploaded")}</Badge>
                              {!isConverted && docType && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                  data-testid={`button-delete-doc-${docType}`}
                                  onClick={e => {
                                    e.stopPropagation();
                                    const labels: Record<string, string> = {
                                      photo: t("docs.photo"),
                                      nationalId: t("docs.nationalId"),
                                      iban: t("docs.iban"),
                                    };
                                    setPendingDeleteDoc({ candidateId: cand!.id, docType: docType!, label: labels[docType!] ?? t("docs.document") });
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
                        <div className="mt-2 ms-8 bg-zinc-800/40 rounded-md p-2 border border-zinc-700/30">
                          <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                            <TriangleAlert className="h-3 w-3" />
                            {t("checklist.notSubmitted")}
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
                  docsComplete={checklistPrereqs.every(p => isPrereqSatisfied(checklistRecord, checklistCand, p))}
                />
              )}

              {/* Notes */}
              <AutoSaveNotes
                recordId={checklistRecord.id}
                initialValue={checklistRecord.notes ?? ""}
                onSave={(id, notes) => checklistMutation.mutate({ id, data: { notes } })}
              />

              {/* Status indicator */}
              {checklistRecord.status !== "converted" && checklistRecord.status !== "rejected" && checklistRecord.status !== "terminated" && (() => {
                const docsAllDone = checklistDone === checklistTotal;
                const contractRequired = !checklistIsSmp && !!checklistRecord.applicationId;
                const contractDone = checklistRecord.hasSignedContract || !!checklistRecord.contractSignedAt;
                const fullyReady = docsAllDone && (!contractRequired || contractDone);
                return (
                  <div className={`flex flex-col gap-2 p-3 rounded-lg text-sm ${
                    fullyReady
                      ? "bg-emerald-950/30 text-emerald-400 border border-emerald-800/40"
                      : "bg-zinc-900 text-zinc-400 border border-zinc-800"
                  }`}>
                    {fullyReady ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0" /> {t("checklist.readyHint")}
                      </div>
                    ) : (
                      <>
                        {!docsAllDone && (
                          <div className="flex items-center gap-2">
                            <TriangleAlert className="h-4 w-4 shrink-0" /> {t("checklist.outstanding", { n: formatNumber(checklistTotal - checklistDone), count: checklistTotal - checklistDone })}
                          </div>
                        )}
                        {docsAllDone && contractRequired && !contractDone && (
                          <div className="flex items-center gap-2 text-yellow-400">
                            <FileSignature className="h-4 w-4 shrink-0" /> {t("checklist.contractFirst")}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
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
              {t("convert.title")}
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm" asChild>
              {convertRecord ? (() => {
                const c = getCandidateFor(convertRecord);
                return <div>{t("convert.willMove", { name: c?.fullNameEn ?? t("record.candidate") })}</div>;
              })() : <div />}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-lg p-3 text-sm text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              {t("convert.verifiedHint")}
            </div>

            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-sm">{t("convert.event")} <span className="text-red-400">*</span></Label>
                <Select
                  value={convertForm.eventId}
                  onValueChange={v => setConvertForm(f => ({ ...f, eventId: v }))}
                >
                  <SelectTrigger data-testid="select-convert-event" className="bg-zinc-900 border-zinc-700 text-white">
                    <SelectValue placeholder={t("convert.eventPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                    {eventsList.map(ev => (
                      <SelectItem key={ev.id} value={ev.id} className="text-white focus:bg-zinc-800"><bdi>{ev.name}</bdi></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-sm">{t("convert.startDate")} <span className="text-red-400">*</span></Label>
                <DatePickerField
                  data-testid="input-convert-startdate"
                  value={convertForm.startDate}
                  onChange={v => setConvertForm(f => ({ ...f, startDate: v }))}
                  className="bg-zinc-900 border-zinc-700 text-white"
                />
              </div>
              {/* SMP Company selector — required for SMP candidates (no applicationId) */}
              {convertRecord && !convertRecord.applicationId && (
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-sm">{t("convert.smpCompany")} <span className="text-red-400">*</span></Label>
                  <select
                    data-testid="select-convert-smp-company"
                    value={convertForm.smpCompanyId}
                    onChange={e => setConvertForm(f => ({ ...f, smpCompanyId: e.target.value }))}
                    className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
                  >
                    <option value="" className="bg-zinc-900 text-zinc-400">{t("convert.smpPlaceholder")}</option>
                    {smpCompanies.map(c => (
                      <option key={c.id} value={c.id} className="bg-zinc-900 text-white">{c.name}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-red-400/70">{t("convert.smpRequired")}</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-sm">{t("convert.salary")}</Label>
                <Input
                  data-testid="input-convert-salary"
                  type="number"
                  placeholder={t("convert.salaryPlaceholder")}
                  value={convertForm.salary}
                  onChange={e => setConvertForm(f => ({ ...f, salary: e.target.value }))}
                  className="bg-zinc-900 border-zinc-700 text-white"
                />
                {(() => {
                  const min = getJobMinForRecord(convertRecord);
                  if (min == null) return null;
                  return (
                    <button
                      type="button"
                      data-testid="chip-convert-use-job-min"
                      onClick={() => setConvertForm(f => ({ ...f, salary: String(min) }))}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-emerald-700/50 bg-emerald-900/20 text-emerald-300 hover:bg-emerald-900/40 transition"
                    >
                      {t("convert.useJobMin", { n: formatNumber(min) })}
                    </button>
                  );
                })()}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button
                variant="outline"
                className="border-zinc-700 text-zinc-300"
                onClick={() => setConvertRecord(null)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                data-testid="button-confirm-convert"
                disabled={
                  !convertForm.startDate ||
                  !convertForm.eventId ||
                  (convertRecord && !convertRecord.applicationId && !convertForm.smpCompanyId) ||
                  convertMutation.isPending
                }
                onClick={() => convertRecord && convertMutation.mutate({
                  id: convertRecord.id,
                  body: { ...convertForm, smpCompanyId: convertForm.smpCompanyId || undefined },
                })}
                className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white gap-2"
              >
                {convertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserCheck className="h-4 w-4" /> {t("convert.confirm")}</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Convert Dialog ── */}
      <Dialog open={bulkConvertOpen} onOpenChange={setBulkConvertOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("bulkConvert.title")}</DialogTitle>
            <DialogDescription>
              {t("bulkConvert.description", { n: formatNumber(stats.convertible), count: stats.convertible })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-emerald-900/20 border border-emerald-800 rounded-lg p-3 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-300">{t("bulkConvert.ready", { n: formatNumber(stats.convertible), count: stats.convertible })}</p>
                <p className="text-xs text-emerald-400/70">{t("bulkConvert.readyHint")}</p>
              </div>
            </div>
            {stats.readyNoContract > 0 && (
              <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3 flex items-center gap-3">
                <FileSignature className="h-5 w-5 text-yellow-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-300">{t("bulkConvert.skipped", { n: formatNumber(stats.readyNoContract), count: stats.readyNoContract })}</p>
                  <p className="text-xs text-yellow-400/70">{t("bulkConvert.skippedHint")}</p>
                </div>
              </div>
            )}
            {(() => {
              const readyRecords = convertibleReady;
              const hasSmpReady = readyRecords.some(r => !r.applicationId);
              return (
                <div className="space-y-3">
                  <div>
                    <Label className="text-zinc-300 text-sm">{t("convert.event")} <span className="text-red-400">*</span></Label>
                    <Select
                      value={bulkConvertForm.eventId}
                      onValueChange={v => setBulkConvertForm(f => ({ ...f, eventId: v }))}
                    >
                      <SelectTrigger data-testid="select-bulk-event" className="bg-zinc-900 border-zinc-700 text-white mt-1">
                        <SelectValue placeholder={t("convert.eventPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                        {eventsList.map(ev => (
                          <SelectItem key={ev.id} value={ev.id} className="text-white focus:bg-zinc-800"><bdi>{ev.name}</bdi></SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-zinc-300 text-sm">{t("convert.startDate")} <span className="text-red-400">*</span></Label>
                    <DatePickerField
                      data-testid="input-bulk-start-date"
                      value={bulkConvertForm.startDate}
                      onChange={v => setBulkConvertForm(f => ({ ...f, startDate: v }))}
                      className="bg-zinc-900 border-zinc-700 text-white mt-1"
                    />
                  </div>
                  {hasSmpReady && (
                    <div>
                      <Label className="text-zinc-300 text-sm">{t("convert.smpCompany")} <span className="text-red-400">*</span></Label>
                      <select
                        data-testid="select-bulk-smp-company"
                        value={bulkConvertForm.smpCompanyId}
                        onChange={e => setBulkConvertForm(f => ({ ...f, smpCompanyId: e.target.value }))}
                        className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none mt-1"
                      >
                        <option value="" className="bg-zinc-900 text-zinc-400">{t("convert.smpPlaceholder")}</option>
                        {smpCompanies.map(c => (
                          <option key={c.id} value={c.id} className="bg-zinc-900 text-white">{c.name}</option>
                        ))}
                      </select>
                      <p className="text-[11px] text-red-400/70 mt-1">{t("bulkConvert.smpRequired")}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-zinc-300 text-sm">{t("convert.salary")}</Label>
                    <Input
                      data-testid="input-bulk-salary"
                      type="number"
                      placeholder={t("convert.salaryPlaceholder")}
                      value={bulkConvertForm.salary}
                      onChange={e => setBulkConvertForm(f => ({ ...f, salary: e.target.value }))}
                      className="bg-zinc-900 border-zinc-700 text-white mt-1"
                    />
                    {(() => {
                      // Surface one chip per distinct job-minimum across the
                      // selected ready records. Click fills the single salary
                      // input — admin keeps full control over what value is
                      // actually applied to everyone.
                      const mins = Array.from(new Set(
                        readyRecords.map(r => getJobMinForRecord(r)).filter((n): n is number => n != null)
                      )).sort((a, b) => a - b);
                      if (mins.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {mins.map(m => (
                            <button
                              key={m}
                              type="button"
                              data-testid={`chip-bulk-use-job-min-${m}`}
                              onClick={() => setBulkConvertForm(f => ({ ...f, salary: String(m) }))}
                              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-emerald-700/50 bg-emerald-900/20 text-emerald-300 hover:bg-emerald-900/40 transition"
                            >
                              {t("convert.useJobMin", { n: formatNumber(m) })}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setBulkConvertOpen(false)} className="border-zinc-700 text-zinc-300">
                      {t("common.cancel")}
                    </Button>
                    <Button
                      data-testid="button-confirm-bulk-convert"
                      disabled={
                        !bulkConvertForm.startDate ||
                        !bulkConvertForm.eventId ||
                        (hasSmpReady && !bulkConvertForm.smpCompanyId) ||
                        bulkConvertMutation.isPending
                      }
                      onClick={() => {
                        const readyIds = readyRecords.map(r => r.id);
                        bulkConvertMutation.mutate({ ids: readyIds, ...bulkConvertForm });
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                    >
                      {bulkConvertMutation.isPending
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("bulkConvert.converting")}</>
                        : <><UserCheck className="h-4 w-4" /> {t("bulkConvert.confirm", { n: formatNumber(stats.convertible), count: stats.convertible })}</>
                      }
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={bulkContractOpen} onOpenChange={setBulkContractOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-blue-400" />
              {t("bulkContracts.title")}
            </DialogTitle>
            <DialogDescription>
              {t("bulkContracts.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 flex items-center gap-3">
              <FileText className="h-5 w-5 text-blue-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-300">{t("bulkContracts.eligible", { n: formatNumber(records.filter(r => r.status !== "converted" && r.status !== "rejected" && r.status !== "terminated").length) })}</p>
                <p className="text-xs text-blue-400/70">{t("bulkContracts.eligibleHint")}</p>
              </div>
            </div>
            <div>
              <Label className="text-zinc-300 text-sm">{t("bulkContracts.template")}</Label>
              <Select value={bulkContractTemplateId} onValueChange={setBulkContractTemplateId}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700 mt-1" data-testid="select-bulk-contract-template">
                  <SelectValue placeholder={t("bulkContracts.templatePlaceholder")} />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {activeTemplates.map(tpl => (
                    <SelectItem key={tpl.id} value={tpl.id}><bdi>{tpl.name}</bdi> ({t("templates.version", { n: formatNumber(tpl.version) })})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkContractOpen(false)} className="border-zinc-700 text-zinc-300">
                {t("common.cancel")}
              </Button>
              <Button
                data-testid="button-confirm-bulk-contracts"
                disabled={!bulkContractTemplateId || bulkContractMutation.isPending}
                onClick={() => {
                  const eligibleIds = records
                    .filter(r => r.status !== "converted" && r.status !== "rejected" && r.status !== "terminated")
                    .filter(r => {
                      const c = getCandidateFor(r);
                      return c?.source !== "smp";
                    })
                    .map(r => r.id);
                  bulkContractMutation.mutate({ onboardingIds: eligibleIds, templateId: bulkContractTemplateId });
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
              >
                {bulkContractMutation.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("bulkContracts.generating")}</>
                  : <><FileSignature className="h-4 w-4" /> {t("bulkContracts.confirm")}</>
                }
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!rejectConfirmId} onOpenChange={(v) => { if (!v) setRejectConfirmId(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{t("rejectConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("rejectConfirm.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border" data-testid="button-reject-cancel">{t("rejectConfirm.keep")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-reject-confirm"
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (rejectConfirmId) rejectMutation.mutate(rejectConfirmId);
                setRejectConfirmId(null);
              }}
            >
              {t("rejectConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!pendingDeleteDoc} onOpenChange={(v) => { if (!v) setPendingDeleteDoc(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{t("deleteDoc.title", { label: pendingDeleteDoc?.label ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("deleteDoc.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border" data-testid="button-delete-doc-cancel">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-delete-doc-confirm"
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (pendingDeleteDoc) deleteDocMutation.mutate({ candidateId: pendingDeleteDoc.candidateId, docType: pendingDeleteDoc.docType });
                setPendingDeleteDoc(null);
              }}
            >
              {t("deleteDoc.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!docPreview} onOpenChange={(v) => { if (!v) setDocPreview(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-2xl max-h-[90vh] p-0">
          <DialogHeader className="px-5 pt-5 pb-0">
            <DialogTitle className="text-white font-display">{docPreview?.label ?? t("docPreview.title")}</DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm" asChild>
              {checklistRecord ? (() => {
                const c = getCandidateFor(checklistRecord);
                return c ? (
                  <div>
                    <bdi>{c.fullNameEn}</bdi>
                    {c.nationalId ? <> — <span dir="ltr">{c.nationalId}</span></> : null}
                  </div>
                ) : <div />;
              })() : <div />}
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 pb-4 flex items-center justify-center min-h-[300px] max-h-[70vh] overflow-auto">
            {docPreview?.isImage ? (
              <img src={docPreview.url} alt={docPreview.label} className="max-w-full max-h-[65vh] object-contain rounded-md" data-testid="img-doc-preview" />
            ) : docPreview?.url.match(/\.pdf(\?|$)/i) ? (
              <PdfViewer url={docPreview.url} className="w-full" />
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-zinc-800 flex items-center justify-center">
                  <Eye className="h-7 w-7 text-zinc-400" />
                </div>
                <p className="text-zinc-400 text-sm">{t("docPreview.notAvailable")}</p>
                <a href={docPreview?.url} target="_blank" rel="noopener noreferrer" className="text-emerald-400 text-sm underline underline-offset-2 flex items-center gap-1" data-testid="link-download-doc">
                  {t("docPreview.download")} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
          <DialogFooter className="px-5 pb-5 pt-4 border-t border-zinc-800">
            <a href={docPreview?.url} target="_blank" rel="noopener noreferrer" data-testid="button-open-new-tab">
              <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> {t("docPreview.openNewTab")}
              </Button>
            </a>
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white" onClick={() => setDocPreview(null)} data-testid="button-close-preview">
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
