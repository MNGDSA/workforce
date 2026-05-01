import DashboardLayout from "@/components/layout";
import { nationalityLabel } from "@/lib/i18n/nationalities";
import { resolveSaudiBank, validateSaudiIban } from "@/lib/saudi-banks";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { sanitizeSaMobileInput, normalizeSaMobileOnBlur, isValidSaMobile } from "@/lib/phone-input";
import { useLocation } from "wouter";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import {
  Search,
  Filter,
  MoreHorizontal,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Upload,
  RefreshCw,
  Users,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileDown,
  FileUp,
  X,
  FileSpreadsheet,
  SlidersHorizontal,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  GraduationCap,
  Calendar,
  CreditCard,
  Globe,
  Heart,
  AlertTriangle,
  Star,
  UserCheck,
  ShieldAlert,
  Info,
  Archive,
  ArchiveRestore,
  CheckSquare,
  Square,
  MinusSquare,
  Ban,
  Unlock,
  Send,
  UserPlus,
  Repeat,
  Pencil,
  FileText,
  Hash,
  Copy,
  Car,
  Syringe,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import type { Candidate } from "@shared/schema";
import { parseSearchTokens, MAX_SEARCH_TOKENS, type CandidateSearchMeta } from "@shared/candidate-search";
import {
  computeDisplayStatus,
  computeArchivedReason,
  ARCHIVED_REASONS,
  type DisplayStatus,
  type ArchivedReason,
} from "@shared/candidate-status";
import { useTranslation } from "react-i18next";
import { formatNumber, formatDate, formatCurrency } from "@/lib/format";
import { toProxiedFileUrl } from "@/lib/file-url";

type CandidateWithWorkforce = Candidate & { workforceRecordCount: number; workforceSeasonCount: number; completedStints: number; unpaidSettlements: number };
import { KSA_REGIONS } from "@shared/schema";

// Task #252 — colour map for the five derived display statuses. Legacy
// raw-enum values are kept on the side so the per-id profile-sheet
// endpoint (which doesn't yet project `displayStatus`) still renders
// a sensible badge if it falls back to the raw `status` field. The
// derivation helper always normalises down to one of the five
// derived keys, so in practice only those branches are hit.
const statusStyles: Record<string, string> = {
  // Derived (canonical)
  completed: "bg-green-500/10 text-green-500",
  not_activated: "bg-amber-500/10 text-amber-400",
  hired: "bg-blue-500/10 text-blue-400",
  blocked: "bg-red-500/10 text-red-500",
  archived: "bg-slate-500/10 text-slate-400",
  // Legacy raw enum (fallback only)
  available: "bg-green-500/10 text-green-500",
  active: "bg-green-500/10 text-green-500",
  pending_profile: "bg-amber-500/10 text-amber-400",
  inactive: "bg-gray-500/10 text-gray-400",
};

/**
 * Reads the canonical display status off a candidate row. Prefers the
 * server-projected `displayStatus` (always present on /api/candidates
 * responses) and falls back to running `computeDisplayStatus` locally
 * for any row that doesn't carry it (the per-id endpoint, mock data
 * in tests, etc.). Single chokepoint so badge + filter never drift.
 */
function readDisplayStatus(c: any): DisplayStatus {
  if (c && typeof c.displayStatus === "string") return c.displayStatus as DisplayStatus;
  return computeDisplayStatus({
    status: c?.status,
    archivedAt: c?.archivedAt,
    profileCompleted: c?.profileCompleted,
    classification: c?.classification,
    lastLoginAt: c?.lastLoginAt,
    createdAt: c?.createdAt,
  });
}

// Task #254 — single chokepoint for the Archived sub-bucket reason.
// Mirrors readDisplayStatus: prefer the server-projected value
// (always present on /api/candidates rows) and fall back to running
// `computeArchivedReason` locally for rows from the per-id endpoint
// or test mocks. Returns `null` for any non-archived row, so callers
// can render the chip unconditionally (it will simply collapse).
function readArchivedReason(c: any): ArchivedReason | null {
  if (c && typeof c.archivedReason === "string") {
    return c.archivedReason as ArchivedReason;
  }
  if (c && c.archivedReason === null) {
    return null;
  }
  return computeArchivedReason({
    status: c?.status,
    archivedAt: c?.archivedAt,
    profileCompleted: c?.profileCompleted,
    classification: c?.classification,
    lastLoginAt: c?.lastLoginAt,
    createdAt: c?.createdAt,
  });
}

// Task #264 — typed lookup for the per-reason chip row in the talent
// toolbar. Mapping to literal i18n keys (instead of building them from
// a template) keeps the `t()` calls strictly typed without an `as any`
// cast and keeps the chip-render order centralised.
const ARCHIVED_REASON_CHIPS = [
  { reason: "inactive_one_year", labelKey: "archivedReasonFilter.inactive_one_year" },
  { reason: "incomplete_profile", labelKey: "archivedReasonFilter.incomplete_profile" },
  { reason: "missed_activation", labelKey: "archivedReasonFilter.missed_activation" },
  { reason: "manually_archived", labelKey: "archivedReasonFilter.manually_archived" },
] as const satisfies ReadonlyArray<{ reason: ArchivedReason; labelKey: string }>;

type SortField = "createdAt" | "fullNameEn" | "city" | "classification" | "phone" | "email";

type ColumnKey = "id" | "candidate" | "classification" | "status" | "phone" | "email" | "city" | "iban" | "bank" | "emergency";

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "candidate", label: "Candidate" },
  { key: "classification", label: "Classification" },
  { key: "status", label: "Status" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "city", label: "City" },
  { key: "iban", label: "IBAN" },
  { key: "bank", label: "Bank" },
  { key: "emergency", label: "Emergency" },
];

const DEFAULT_VISIBLE: ColumnKey[] = ["id", "candidate", "classification", "status", "phone", "city", "iban", "bank", "emergency"];

// Task #107: this dialog is SMP-only. The /api/candidates/smp-validate +
// /api/candidates/smp-commit endpoints read exactly three fields per row:
//   - fullNameEn  (required — used to create the candidate row)
//   - nationalId  (recommended — drives dedupe against existing candidates;
//                  rows without nationalId are always treated as NEW)
//   - phone       (required — the activation SMS link is sent to this number;
//                  rows without phone create the candidate but the worker
//                  cannot activate until phone is added later)
// Any other column is ignored by the server, so the template intentionally
// omits city / nationality / gender / dob / source / email / SMP company.
// SMP company linkage is set later when workers are converted to workforce.
const BULK_TEMPLATE_HEADERS = [
  "fullNameEn", "nationalId", "phone",
];

const TEMPLATE_SAMPLE_ROWS = [
  ["Mohammed Al-Qahtani", "1012345678", "0551234567"],
  ["Abdullah Al-Harbi",   "1087654321", "0559876543"],
];

function downloadTemplate(format: "csv" | "xlsx") {
  if (format === "xlsx") {
    const ws = XLSX.utils.aoa_to_sheet([BULK_TEMPLATE_HEADERS, ...TEMPLATE_SAMPLE_ROWS]);
    ws["!cols"] = BULK_TEMPLATE_HEADERS.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SMP Workers");
    XLSX.writeFile(wb, "smp_workers_upload_template.xlsx");
  } else {
    const csv = BULK_TEMPLATE_HEADERS.join(",") + "\n" +
      TEMPLATE_SAMPLE_ROWS.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "smp_workers_upload_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
}

function parseFileToRows(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isExcel = /\.xlsx?$/i.test(file.name);

    if (isExcel) {
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
          const cleaned = rows.map(r => {
            const obj: Record<string, string> = {};
            for (const [k, v] of Object.entries(r)) obj[k.trim()] = String(v).trim();
            return obj;
          });
          resolve(cleaned);
        } catch {
          reject(new Error("Could not parse Excel file. Please use the template."));
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (ev) => {
        try {
          const text = ev.target?.result as string;
          const wb = XLSX.read(text, { type: "string" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
          const cleaned = rows.map(r => {
            const obj: Record<string, string> = {};
            for (const [k, v] of Object.entries(r)) obj[k.trim()] = String(v).trim();
            return obj;
          });
          resolve(cleaned);
        } catch {
          reject(new Error("Could not parse CSV file. Please use the template."));
        }
      };
      reader.readAsText(file);
    }
  });
}

const KSA_CITIES = [
  "Makkah", "Madinah", "Jeddah", "Riyadh", "Taif", "Dammam", "Khobar",
  "Dhahran", "Tabuk", "Abha", "Khamis Mushait", "Hail", "Buraidah",
  "Hofuf", "Yanbu", "Najran", "Jazan", "Other",
];
const GENDER_OPTIONS = ["male", "female"];
const MARITAL_OPTIONS = ["Single", "Married", "Divorced", "Widowed"];
const NATIONALITY_OPTIONS = [
  "Saudi Arabian", "Egyptian", "Yemeni", "Sudanese", "Jordanian", "Syrian",
  "Pakistani", "Indian", "Bangladeshi", "Filipino", "Indonesian", "Nigerian",
  "Ethiopian", "Burmese", "Nepali", "Sri Lankan", "Afghan", "Other",
];
const EDU_OPTIONS = ["High School and below", "University and higher"];

function useIdLabel() {
  const { t } = useTranslation("talent");
  return (val: string | null | undefined): string => {
    if (!val) return t("profile.idLabelDefault");
    if (val.startsWith("1")) return t("profile.idLabelNational");
    if (val.startsWith("2")) return t("profile.idLabelIqama");
    return t("profile.idLabelDefault");
  };
}

// Task #252 — replaces a hand-rolled `absolute start-1/2 -translate-x-1/2`
// tooltip block that sat misaligned at higher zoom levels and got
// clipped when the page had any `overflow:hidden` parent (every
// table cell does). Radix Tooltip portal-renders into <body> and
// uses Floating UI under the hood to anchor against the trigger
// without any clipping. The Tooltip stays open while the cursor is
// over the content (Radix default behaviour) so the legend remains
// readable on hover.
function StatusInfoHeader() {
  const { t } = useTranslation("talent");
  return (
    <span className="inline-flex items-center gap-1">
      {t("statusDefs.title")}
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-primary transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
            aria-label={t("statusDefs.ariaLabel")}
            data-testid="button-status-info"
          >
            <Info className="h-2.5 w-2.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="!z-[9999] w-80 max-w-[calc(100vw-1.5rem)] rounded-md border border-border bg-popover px-3.5 py-3 text-[11px] text-muted-foreground shadow-lg leading-relaxed space-y-2 normal-case"
          data-testid="tooltip-status-defs"
        >
          <span className="block"><span className="font-semibold text-green-400">{t("statusDefs.completed")}</span> — {t("statusDefs.completedDesc")}</span>
          <span className="block"><span className="font-semibold text-amber-400">{t("statusDefs.not_activated")}</span> — {t("statusDefs.not_activatedDesc")}</span>
          <span className="block"><span className="font-semibold text-blue-400">{t("statusDefs.hired")}</span> — {t("statusDefs.hiredDesc")}</span>
          <span className="block"><span className="font-semibold text-red-400">{t("statusDefs.blocked")}</span> — {t("statusDefs.blockedDesc")}</span>
          <span className="block"><span className="font-semibold text-slate-400">{t("statusDefs.archived")}</span> — {t("statusDefs.archivedDesc")}</span>
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

interface WorkforceRecord {
  id: string;
  employeeNumber: string;
  candidateId: string;
  jobId: string | null;
  eventId: string | null;
  salary: string | null;
  startDate: string;
  endDate: string | null;
  terminationReason: string | null;
  isActive: boolean;
  jobTitle?: string;
  eventName?: string;
  performanceScore?: string | null;
}

function FormerEmployeeSummary({ candidateId }: { candidateId: string }) {
  const { t, i18n } = useTranslation("talent");
  const lang = i18n.language;
  const { data: records = [], isLoading } = useQuery<WorkforceRecord[]>({
    queryKey: ["/api/workforce/all-by-candidate", candidateId],
    queryFn: () => apiRequest("GET", `/api/workforce/all-by-candidate/${candidateId}`).then(r => r.json()),
    enabled: !!candidateId,
  });

  const completedRecords = records.filter(r => !r.isActive);
  if (isLoading || completedRecords.length === 0) return null;

  const sorted = completedRecords.sort((a, b) =>
    new Date(b.endDate || b.startDate).getTime() - new Date(a.endDate || a.startDate).getTime()
  );
  const lastRecord = sorted[0];

  const lastPerfScore = sorted.find(r => r.performanceScore)?.performanceScore;

  const distinctEvents = new Set(completedRecords.filter(r => r.eventId).map(r => r.eventId));
  const seasonCount = distinctEvents.size || completedRecords.length;

  let totalDays = 0;
  for (const rec of completedRecords) {
    const start = new Date(rec.startDate);
    const end = rec.endDate ? new Date(rec.endDate) : new Date();
    totalDays += Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  }

  return (
    <div className="rounded-sm border border-emerald-500/25 bg-emerald-500/5 px-4 py-3" data-testid="former-employee-summary">
      <div className="flex items-center gap-2 mb-2.5">
        <UserCheck className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-semibold text-emerald-300">{t("former.title")}</span>
        <span className="text-[10px] text-emerald-400/70 ms-auto">{t("former.summary", { count: seasonCount, seasons: formatNumber(seasonCount), days: formatNumber(totalDays) })}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {lastRecord.jobTitle && (
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("former.lastPosition")}</p>
            <p className="text-sm text-white font-medium"><bdi>{lastRecord.jobTitle}</bdi></p>
          </div>
        )}
        {lastRecord.eventName && (
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("former.lastEvent")}</p>
            <p className="text-sm text-white"><bdi>{lastRecord.eventName}</bdi></p>
          </div>
        )}
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("former.lastEmployed")}</p>
          <p className="text-sm text-white" dir="ltr">
            {formatDate(lastRecord.startDate, lang)}
            {lastRecord.endDate && ` — ${formatDate(lastRecord.endDate, lang)}`}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("former.totalExperience")}</p>
          <p className="text-sm text-white">{t("former.calendarDays", { n: formatNumber(totalDays) })}</p>
        </div>
        {lastPerfScore && (
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("former.lastPerformance")}</p>
            <p className="text-sm text-white font-medium" dir="ltr">{t("former.performanceFmt", { score: formatNumber(Number(lastPerfScore), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function WorkforceHistorySection({ candidateId }: { candidateId: string }) {
  const { t, i18n } = useTranslation("talent");
  const lang = i18n.language;
  const { data: records = [], isLoading } = useQuery<WorkforceRecord[]>({
    queryKey: ["/api/workforce/all-by-candidate", candidateId],
    queryFn: () => apiRequest("GET", `/api/workforce/all-by-candidate/${candidateId}`).then(r => r.json()),
    enabled: !!candidateId,
  });

  if (isLoading) {
    return (
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5" /> {t("history.title")}
        </h4>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("history.loading")}
        </div>
      </div>
    );
  }

  if (records.length === 0) return null;

  return (
    <div data-testid="section-workforce-history">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Briefcase className="h-3.5 w-3.5" /> {t("history.title")}
        <span className="text-[10px] font-normal text-muted-foreground ms-auto">{t("history.count", { count: records.length, n: formatNumber(records.length) })}</span>
      </h4>
      <div className="space-y-2.5">
        {records.map((rec) => (
          <div
            key={rec.id}
            className={`rounded-sm border px-3 py-2.5 text-sm ${
              rec.isActive
                ? "border-primary/30 bg-primary/5"
                : "border-border bg-muted/10"
            }`}
            data-testid={`workforce-record-${rec.id}`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-xs text-primary font-medium" dir="ltr">{rec.employeeNumber}</span>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 border-0 ${
                  rec.isActive
                    ? "bg-green-500/10 text-green-400"
                    : "bg-gray-500/10 text-gray-400"
                }`}
              >
                {rec.isActive ? t("history.active") : t("history.terminated")}
              </Badge>
            </div>
            {rec.jobTitle && (
              <p className="text-white text-sm font-medium"><bdi>{rec.jobTitle}</bdi></p>
            )}
            {rec.eventName && (
              <p className="text-muted-foreground text-xs"><bdi>{rec.eventName}</bdi></p>
            )}
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1" dir="ltr">
                <Calendar className="h-3 w-3" />
                {formatDate(rec.startDate, lang)}
                {rec.endDate && ` — ${formatDate(rec.endDate, lang)}`}
              </span>
              {rec.salary && (
                <span dir="ltr">{t("history.salaryFmt", { amount: formatNumber(Number(rec.salary)) })}</span>
              )}
            </div>
            {rec.terminationReason && (
              <p className="text-xs text-amber-400/80 mt-1">{t("history.reason", { reason: rec.terminationReason })}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CandidateProfileSheet({
  candidate,
  onClose,
  onSaved,
}: {
  candidate: Candidate | null;
  onClose: () => void;
  onSaved: (c: Candidate) => void;
}) {
  const { toast } = useToast();
  const { t, i18n } = useTranslation("talent");
  const idLabel = useIdLabel();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  // Task #187 — inline header edits independent of the global edit
  // mode. Name writes through the candidate row directly; photo
  // replace hits the new admin-only endpoint that runs the same
  // Rekognition pipeline as the candidate portal.
  const [editName, setEditName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const photoFileRef = useRef<HTMLInputElement | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  // Click on the avatar opens a lightbox with the full-size image so admins
  // can actually see what got uploaded; the lightbox carries its own
  // "Change Photo" action so the edit affordance is preserved without
  // forcing the avatar itself to be a dual-purpose target.
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  // The component stays mounted across candidate selections (parent passes a
  // new `candidate` prop; we only return null when there's none). Without an
  // explicit reset, transient per-candidate UI state from candidate A leaks
  // into candidate B's view — e.g. the photo lightbox re-opens over B's
  // avatar, the inline name editor stays open showing A's name (which then
  // overwrites B's name on save), or the global edit form stays open
  // pre-filled with A's field values. Tie every piece of transient
  // selection-scoped state to the current candidate id so it auto-resets
  // whenever the selection changes or clears.
  useEffect(() => {
    setPhotoPreviewOpen(false);
    setEditName(false);
    setNameValue("");
    setEditing(false);
    setForm({});
    setPhoneConflict(null);
    setPhotoUploading(false);
    if (photoFileRef.current) photoFileRef.current.value = "";
  }, [candidate?.id]);
  const qc = useQueryClient();

  // Phone-conflict state: when PATCH returns 409 because the new phone is
  // already held by another candidate, surface a confirm dialog so the admin
  // can either Cancel or Transfer the phone (which nulls it on the conflicting
  // candidate). The pending payload is replayed with ?resolveConflict=transfer.
  const [phoneConflict, setPhoneConflict] = useState<{
    pendingPayload: Record<string, unknown>;
    conflict: {
      id: string;
      fullNameEn: string;
      classification: string;
      status: string;
      hasUserAccount: boolean;
    };
    newPhone: string;
  } | null>(null);

  async function patchCandidate(data: Record<string, unknown>, transfer: boolean): Promise<Candidate> {
    const url = `/api/candidates/${candidate!.id}${transfer ? "?resolveConflict=transfer" : ""}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });
    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      if (body?.conflict) {
        const err: any = new Error(body.message || "Phone conflict");
        err.kind = "phone_conflict";
        err.conflict = body.conflict;
        err.newPhone = (data.phone as string) ?? "";
        throw err;
      }
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  }

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => patchCandidate(data, false),
    onSuccess: (updated) => {
      onSaved(updated);
      setEditing(false);
      toast({ title: t("toast.profileUpdated") });
    },
    onError: (err: any, payload) => {
      if (err?.kind === "phone_conflict") {
        setPhoneConflict({ pendingPayload: payload, conflict: err.conflict, newPhone: err.newPhone });
        return;
      }
      toast({ title: t("toast.saveFailed"), variant: "destructive" });
    },
  });

  const transferMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => patchCandidate(data, true),
    onSuccess: (updated) => {
      setPhoneConflict(null);
      onSaved(updated);
      setEditing(false);
      toast({ title: t("toast.profileUpdated") });
    },
    onError: () => {
      setPhoneConflict(null);
      toast({ title: t("toast.saveFailed"), variant: "destructive" });
    },
  });

  // Task #187 — inline name edit. Reuses the same PATCH /api/candidates/:id
  // endpoint the rest of the form uses, just scoped to the single
  // `fullNameEn` field so we don't accidentally touch the phone-conflict
  // path (no phone in the payload → no 409 possible).
  const nameMutation = useMutation({
    mutationFn: (newName: string) => patchCandidate({ fullNameEn: newName }, false),
    onSuccess: (updated) => {
      onSaved(updated);
      setEditName(false);
      toast({ title: String(t("toast.nameUpdated", { defaultValue: "Name updated" } as any)) });
    },
    onError: (err: any) => {
      toast({
        title: t("toast.saveFailed"),
        description: err?.message,
        variant: "destructive",
      });
    },
  });

  // Task #187 — admin direct photo replace. The backend re-runs the
  // candidate-portal Rekognition pipeline so a non-face photo is
  // refused with a structured 422 envelope. We surface the top-level
  // message via toast.
  const photoMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      // Pass the active UI locale so the server's localized error messages
      // (e.g. "photo.qualityFailed") come back in the language the admin
      // is currently looking at — without this header the browser sends
      // its OS default and the server replies in English even when the
      // workspace is in Arabic. Don't set Content-Type — the browser
      // sets it (with the multipart boundary) for FormData uploads.
      const res = await fetch(`/api/admin/candidates/${candidate!.id}/photo`, {
        method: "POST",
        body: fd,
        credentials: "include",
        headers: { "Accept-Language": i18n.language || "ar" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err: any = new Error(body.message || `Upload failed (${res.status})`);
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/candidates"] });
      // Optimistically merge the new photo URL into the open sheet so
      // the avatar updates without a refetch lag.
      onSaved({ ...(candidate as any), photoUrl: data?.url ?? data?.candidate?.photoUrl ?? null, hasPhoto: true } as any);
      toast({ title: String(t("toast.photoReplaced", { defaultValue: "Photo replaced" } as any)) });
      setPhotoUploading(false);
      if (photoFileRef.current) photoFileRef.current.value = "";
    },
    onError: (err: any) => {
      toast({
        title: String(t("toast.photoReplaceFailed", { defaultValue: "Photo replace failed" } as any)),
        description: err?.message,
        variant: "destructive",
      });
      setPhotoUploading(false);
      if (photoFileRef.current) photoFileRef.current.value = "";
    },
  });

  // Task #254 — quick recovery actions inside the profile sheet for the
  // two recoverable archived reasons. Mutations are scoped here (rather
  // than passed in from the parent) so the sheet remains a self-contained
  // unit; both endpoints accept the same { ids } batch envelope, so we
  // reuse the row-menu wire format.
  const sheetReissueMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", "/api/candidates/activation-tokens/reissue", { ids: [id] }).then(r => r.json()),
    onSuccess: (data: { reissued?: number; skipped?: number }) => {
      const n = data.reissued ?? 0;
      const s = data.skipped ?? 0;
      toast({
        title: t("smpToast.reissued", { n: formatNumber(n), count: n }),
        description: s > 0 ? t("smpToast.reissuedSkipped", { n: formatNumber(s) }) : undefined,
        variant: n === 0 && s > 0 ? "destructive" : undefined,
      });
      qc.invalidateQueries({ queryKey: ["/api/candidates"] });
    },
    onError: () => toast({ title: t("toast.bulkActionFailed"), variant: "destructive" }),
  });

  const sheetReengagementMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", "/api/candidates/re-engagement-sms", { ids: [id] }).then(r => r.json()),
    onSuccess: (data: { sent?: number; skipped?: number; failed?: number }) => {
      const sent = data.sent ?? 0;
      const skipped = data.skipped ?? 0;
      const failed = data.failed ?? 0;
      const descParts: string[] = [];
      if (skipped > 0) descParts.push(t("smpToast.reengagementSkipped", { n: formatNumber(skipped) }));
      if (failed > 0)  descParts.push(t("smpToast.reengagementFailed",  { n: formatNumber(failed)  }));
      toast({
        title: t("smpToast.reengagementSent", { n: formatNumber(sent), count: sent }),
        description: descParts.length > 0 ? descParts.join(" · ") : undefined,
        variant: sent === 0 && (skipped > 0 || failed > 0) ? "destructive" : undefined,
      });
      qc.invalidateQueries({ queryKey: ["/api/candidates"] });
    },
    onError: () => toast({ title: t("toast.bulkActionFailed"), variant: "destructive" }),
  });

  function matchOption(val: string | null | undefined, options: string[]): string {
    if (!val) return "";
    const exact = options.find(o => o === val);
    if (exact) return exact;
    const lower = options.find(o => o.toLowerCase() === val.toLowerCase());
    return lower ?? val;
  }

  function startEditing() {
    if (!candidate) return;
    const c = candidate;
    setForm({
      city: matchOption(c.city, KSA_CITIES),
      region: matchOption(c.region, [...KSA_REGIONS]),
      gender: matchOption(c.gender, GENDER_OPTIONS),
      dateOfBirth: c.dateOfBirth ?? "",
      nationalityText: matchOption((c as any).nationalityText ?? (c.nationality === "saudi" ? "Saudi Arabian" : ""), NATIONALITY_OPTIONS),
      maritalStatus: matchOption(c.maritalStatus, MARITAL_OPTIONS),
      nationalId: c.nationalId ?? "",
      educationLevel: matchOption(c.educationLevel, EDU_OPTIONS),
      major: c.major ?? "",
      ibanNumber: c.ibanNumber ?? "",
      ibanBankName: (c as any).ibanBankName ?? "",
      ibanBankCode: (c as any).ibanBankCode ?? "",
      emergencyContactName: c.emergencyContactName ?? "",
      emergencyContactPhone: c.emergencyContactPhone ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
    });
    setEditing(true);
  }

  function handleSave() {
    if (form.ibanNumber && form.ibanNumber.replace(/\s+/g, "").length > 0) {
      const result = validateSaudiIban(form.ibanNumber);
      if (!result.ok) {
        const desc =
          result.reason === "missing_prefix" ? t("toast.invalidIbanPrefixDesc") :
          result.reason === "wrong_length"   ? t("toast.invalidIbanLengthDesc", { count: result.length ?? 0 }) :
          result.reason === "non_digit"      ? t("toast.invalidIbanCharsDesc") :
          result.reason === "bad_checksum"   ? t("toast.invalidIbanChecksumDesc") :
                                                t("toast.invalidIbanDesc");
        toast({ title: t("toast.invalidIban"), description: desc, variant: "destructive" });
        return;
      }
      form.ibanNumber = result.canonical;
    } else {
      form.ibanNumber = "";
    }
    if (form.phone && !isValidSaMobile(form.phone)) {
      toast({
        title: String(t("common:errors.invalidPhone", { defaultValue: "Please enter a valid Saudi mobile (05XXXXXXXX)." } as any)),
        variant: "destructive",
      });
      return;
    }
    const isNonSaudi = form.nationalityText !== "Saudi Arabian";
    saveMutation.mutate({
      phone: form.phone || null,
      email: form.email || null,
      city: form.city || null,
      region: form.region || null,
      gender: form.gender || null,
      dateOfBirth: form.dateOfBirth || null,
      nationalityText: form.nationalityText || null,
      nationality: isNonSaudi ? "non_saudi" : "saudi",
      maritalStatus: form.maritalStatus || null,
      nationalId: form.nationalId || null,
      educationLevel: form.educationLevel || null,
      major: form.educationLevel === "University and higher" ? (form.major || null) : null,
      ibanNumber: form.ibanNumber || null,
      ...(() => {
        const bank = resolveSaudiBank(form.ibanNumber || "");
        return { ibanBankName: bank?.ibanBankName || null, ibanBankCode: bank?.ibanBankCode || null };
      })(),
      emergencyContactName: form.emergencyContactName || null,
      emergencyContactPhone: form.emergencyContactPhone || null,
    });
  }

  function setField(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  if (!candidate) return null;
  const c = candidate;
  const initials = c.fullNameEn.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  // Task #252 — single source of truth for the badge. Uses the
  // server-projected `displayStatus` if present (talent list rows)
  // and falls back to local derivation if the row came from a
  // per-id endpoint that doesn't yet project the field.
  const displaySt = readDisplayStatus(c);
  const statusLabelText = t(`statusLabel.${displaySt}` as any, displaySt.replace("_", " "));
  // Task #254 — sub-bucket reason for the Archived badge in the sheet
  // header. Reads the same projected value as the table row so the
  // chip text + tooltip + recovery actions stay in lockstep.
  const sheetArchivedReason = displaySt === "archived" ? readArchivedReason(c) : null;

  const nidValue = editing ? form.nationalId : (c.nationalId ?? "");
  const nidLabelText = idLabel(nidValue);
  const dash = t("profile.dash");

  return (
    <Sheet open={!!candidate} onOpenChange={(o) => { if (!o) { setEditing(false); onClose(); } }}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-card border-border overflow-y-auto p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          {/* pe-10 reserves space at the inline-end edge so the inline
              name-edit Cancel button never sits behind the sheet's
              top-corner close X (top-left in RTL, top-right in LTR). */}
          <div className="flex items-center gap-4 pe-10">
            {/* Task #187 — Avatar is now a click-to-preview target.
                Clicking it opens a lightbox at the natural image size
                (capped to 70vh). The lightbox carries the "Change
                Photo" action so the edit affordance is preserved.
                If there is no photo yet, the click falls through to
                the file picker so admins can upload the first one
                without an empty preview step.
                The new admin endpoint runs the same Rekognition
                pipeline as the candidate portal so a non-face photo
                is still rejected. */}
            <div className="relative group shrink-0">
              <Avatar className="h-14 w-14 border-2 border-border">
                {(c as any).photoUrl && <AvatarImage src={(c as any).photoUrl} alt={c.fullNameEn} className="object-cover" />}
                <AvatarFallback className="bg-primary/10 text-primary font-display text-lg">{initials}</AvatarFallback>
              </Avatar>
              <button
                type="button"
                className="absolute inset-0 rounded-full bg-black/0 hover:bg-black/60 transition-colors flex items-center justify-center text-white opacity-0 group-hover:opacity-100 disabled:cursor-not-allowed"
                disabled={photoUploading}
                onClick={() => {
                  if ((c as any).photoUrl) setPhotoPreviewOpen(true);
                  else photoFileRef.current?.click();
                }}
                title={String((c as any).photoUrl
                  ? t("profile.viewPhoto", { defaultValue: "View photo" } as any)
                  : t("profile.changePhoto", { defaultValue: "Change photo" } as any))}
                aria-label={String((c as any).photoUrl
                  ? t("profile.viewPhoto", { defaultValue: "View photo" } as any)
                  : t("profile.changePhoto", { defaultValue: "Change photo" } as any))}
                data-testid="button-view-photo"
              >
                {photoUploading
                  ? <Loader2 className="h-5 w-5 animate-spin" />
                  : <Pencil className="h-4 w-4" />}
              </button>
              <input
                ref={photoFileRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png"
                className="hidden"
                data-testid="input-photo-file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setPhotoUploading(true);
                  photoMutation.mutate(file);
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              {editName ? (
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && nameValue.trim().length > 0) nameMutation.mutate(nameValue.trim());
                      if (e.key === "Escape") { setEditName(false); setNameValue(""); }
                    }}
                    placeholder={String(t("profile.namePlaceholder", { defaultValue: "Full name (English)" } as any))}
                    maxLength={120}
                    className="h-9 bg-muted/30 border-border text-sm flex-1 min-w-0"
                    data-testid="input-edit-name"
                  />
                  <Button
                    size="sm"
                    className="h-9 shrink-0"
                    disabled={nameMutation.isPending || nameValue.trim().length === 0}
                    onClick={() => nameMutation.mutate(nameValue.trim())}
                    data-testid="button-save-name"
                  >
                    {nameMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : String(t("profile.save", { defaultValue: "Save" } as any))}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 border-border shrink-0"
                    onClick={() => { setEditName(false); setNameValue(""); }}
                    data-testid="button-cancel-name"
                  >
                    {String(t("profile.cancel", { defaultValue: "Cancel" } as any))}
                  </Button>
                </div>
              ) : (
                <SheetTitle className="font-display text-xl font-bold text-white truncate flex items-center gap-2">
                  <bdi className="truncate">{c.fullNameEn}</bdi>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-white transition-colors p-1 -m-1 shrink-0"
                    onClick={() => { setNameValue(c.fullNameEn ?? ""); setEditName(true); }}
                    title={String(t("profile.editName", { defaultValue: "Edit name" } as any))}
                    aria-label={String(t("profile.editName", { defaultValue: "Edit name" } as any))}
                    data-testid="button-edit-name"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </SheetTitle>
              )}
              <SheetDescription asChild>
                <div className="text-muted-foreground text-sm flex items-center gap-2 mt-0.5">
                  {c.nationalId && <span dir="ltr">{c.nationalId}</span>}
                  <Badge className={`text-[10px] px-1.5 py-0 ${statusStyles[displaySt] || statusStyles.active}`}>{statusLabelText}</Badge>
                  {/* Task #254 — Archived sub-bucket chip in the sheet
                      header, parity with the per-row chip in the table.
                      The tooltip carries the longer description so admins
                      can see why the row landed in Archived without
                      leaving the sheet. */}
                  {sheetArchivedReason && (
                    <Tooltip delayDuration={150}>
                      <TooltipTrigger asChild>
                        <span
                          className="inline-flex items-center text-[10px] font-medium text-slate-200 bg-slate-500/15 border border-slate-500/30 px-1.5 py-0 rounded-sm cursor-default"
                          data-testid={`sheet-chip-archived-reason-${c.id}`}
                        >
                          {t(`archivedReason.${sheetArchivedReason}` as any)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        align="start"
                        sideOffset={6}
                        collisionPadding={12}
                        className="!z-[9999] max-w-xs rounded-md border border-border bg-popover px-3 py-2 text-[11px] text-muted-foreground shadow-lg leading-relaxed"
                      >
                        {t(`archivedReasonDesc.${sheetArchivedReason}` as any)}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {(c as any).classification === "smp" && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-400">{t("profile.smpBadge")}</Badge>}
                </div>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="px-6 py-5 space-y-6">
          {/* Task #254 — recovery panel for the two recoverable archived
              reasons. Sits above the rest of the body so admins triaging
              an archived row don't have to scroll past the contact /
              employment sections to find the "do something about this"
              button. Hidden for any other archived reason and for any
              non-archived bucket. */}
          {sheetArchivedReason === "missed_activation" && (
            <div
              className="rounded-md border border-border bg-muted/20 p-3 flex items-start gap-3"
              data-testid={`sheet-recovery-panel-${c.id}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">
                  {t("archivedReason.missed_activation")}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  {t("archivedReasonDesc.missed_activation")}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-border shrink-0"
                onClick={() => sheetReissueMutation.mutate(c.id)}
                disabled={sheetReissueMutation.isPending}
                data-testid={`sheet-resend-activation-${c.id}`}
              >
                {sheetReissueMutation.isPending
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : t("rowMenu.resendActivation")}
              </Button>
            </div>
          )}
          {sheetArchivedReason === "inactive_one_year" && (
            <div
              className="rounded-md border border-border bg-muted/20 p-3 flex items-start gap-3"
              data-testid={`sheet-recovery-panel-${c.id}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">
                  {t("archivedReason.inactive_one_year")}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  {t("archivedReasonDesc.inactive_one_year")}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-border shrink-0"
                onClick={() => sheetReengagementMutation.mutate(c.id)}
                disabled={sheetReengagementMutation.isPending}
                data-testid={`sheet-send-reengagement-${c.id}`}
              >
                {sheetReengagementMutation.isPending
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : t("rowMenu.sendReengagement")}
              </Button>
            </div>
          )}
          <FormerEmployeeSummary candidateId={c.id} />

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("profile.contact")}</h4>
            {editing ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">{t("profile.phone")}</p>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input
                      value={form.phone}
                      onChange={e => setField("phone", sanitizeSaMobileInput(e.target.value))}
                      onBlur={e => setField("phone", normalizeSaMobileOnBlur(e.target.value))}
                      placeholder="05XXXXXXXX"
                      inputMode="tel"
                      maxLength={10}
                      dir="ltr"
                      className="h-9 bg-muted/30 border-border text-sm flex-1"
                      data-testid="edit-phone"
                    />
                  </div>
                  {form.phone.length > 0 && !isValidSaMobile(form.phone) && (
                    <p className="text-[11px] text-amber-400" data-testid="text-phone-validation-hint">
                      {String(t("common:errors.invalidPhone", { defaultValue: "Please enter a valid Saudi mobile (05XXXXXXXX)." } as any))}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">{t("profile.email")}</p>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input
                      value={form.email}
                      onChange={e => setField("email", e.target.value.trim())}
                      placeholder="name@example.com"
                      inputMode="email"
                      type="email"
                      dir="ltr"
                      className="h-9 bg-muted/30 border-border text-sm flex-1"
                      data-testid="edit-email"
                    />
                  </div>
                </div>
                {c.whatsapp && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="text-white">{t("profile.whatsapp")} <span dir="ltr">{c.whatsapp}</span></span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {c.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-white" dir="ltr" data-testid="profile-phone">{c.phone}</span>
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-white" dir="ltr" data-testid="profile-email">{c.email}</span>
                  </div>
                )}
                {c.whatsapp && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="text-white">{t("profile.whatsapp")} <span dir="ltr">{c.whatsapp}</span></span>
                  </div>
                )}
                {!c.phone && !c.email && !c.whatsapp && (
                  <p className="text-sm text-muted-foreground">{dash}</p>
                )}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("profile.location")}</h4>
            {editing ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">{t("profile.city")}</p>
                  <select value={form.city} onChange={e => setField("city", e.target.value)} className="w-full h-9 bg-muted/30 border border-border rounded-sm px-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none" data-testid="edit-city">
                    <option value="" className="bg-card text-muted-foreground">{t("profile.selectPh")}</option>
                    {KSA_CITIES.map(city => <option key={city} value={city} className="bg-card text-white">{t(`profileSetup:cities.${city}` as any, city)}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">{t("profile.region")}</p>
                  <select value={form.region} onChange={e => setField("region", e.target.value)} className="w-full h-9 bg-muted/30 border border-border rounded-sm px-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none" data-testid="edit-region">
                    <option value="" className="bg-card text-muted-foreground">{t("profile.selectPh")}</option>
                    {KSA_REGIONS.map(r => <option key={r} value={r} className="bg-card text-white">{t(`profileSetup:regions.${r}` as any, r)}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-white">{[c.city ? t(`profileSetup:cities.${c.city}` as any, c.city) : null, c.region ? t(`profileSetup:regions.${c.region}` as any, c.region) : null].filter(Boolean).join("، ") || dash}</span>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("profile.personal")}</h4>
            {editing ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">{t("profile.gender")}</p>
                  <select value={form.gender} onChange={e => setField("gender", e.target.value)} className="w-full h-9 bg-muted/30 border border-border rounded-sm px-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none" data-testid="edit-gender">
                    <option value="" className="bg-card text-muted-foreground">{t("profile.selectPh")}</option>
                    {GENDER_OPTIONS.map(g => <option key={g} value={g} className="bg-card text-white">{t(`gender.${g}` as any, g)}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">{t("profile.dob")}</p>
                  <DatePickerField value={form.dateOfBirth} onChange={v => setField("dateOfBirth", v)} className="h-9 bg-muted/30 border-border text-sm" data-testid="edit-dob" />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">{t("profile.nationality")}</p>
                  <select value={form.nationalityText} onChange={e => setField("nationalityText", e.target.value)} className="w-full h-9 bg-muted/30 border border-border rounded-sm px-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none" data-testid="edit-nationality">
                    <option value="" className="bg-card text-muted-foreground">{t("profile.selectPh")}</option>
                    {NATIONALITY_OPTIONS.map(n => <option key={n} value={n} className="bg-card text-white">{nationalityLabel(n, i18n.language)}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">{t("profile.marital")}</p>
                  <select value={form.maritalStatus} onChange={e => setField("maritalStatus", e.target.value)} className="w-full h-9 bg-muted/30 border border-border rounded-sm px-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none" data-testid="edit-marital">
                    <option value="" className="bg-card text-muted-foreground">{t("profile.selectPh")}</option>
                    {MARITAL_OPTIONS.map(m => <option key={m} value={m} className="bg-card text-white">{t(`marital.${m}` as any, m)}</option>)}
                  </select>
                </div>
                <div className="space-y-1 col-span-2">
                  <p className="text-[11px] text-muted-foreground">{nidLabelText}</p>
                  <Input value={form.nationalId} onChange={e => setField("nationalId", e.target.value)} placeholder={t("profile.idPh")} maxLength={10} dir="ltr" className="h-9 bg-muted/30 border-border text-sm font-mono" data-testid="edit-national-id" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {c.gender && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t("profile.gender")}</p>
                    <p className="text-sm text-white">{t(`gender.${c.gender}` as any, c.gender)}</p>
                  </div>
                )}
                {c.dateOfBirth && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t("profile.dob")}</p>
                    <p className="text-sm text-white" dir="ltr">{c.dateOfBirth}</p>
                  </div>
                )}
                {((c as any).nationalityText || c.nationality) && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t("profile.nationality")}</p>
                    <p className="text-sm text-white">{nationalityLabel((c as any).nationalityText || (c.nationality === "saudi" ? "Saudi Arabian" : (c.nationality?.replace("_", " ") ?? "")), i18n.language)}</p>
                  </div>
                )}
                {c.maritalStatus && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t("profile.marital")}</p>
                    <p className="text-sm text-white">{t(`marital.${c.maritalStatus}` as any, c.maritalStatus)}</p>
                  </div>
                )}
                {c.nationalId && (
                  <div className="col-span-2">
                    <p className="text-[11px] text-muted-foreground">{nidLabelText}</p>
                    <p className="text-sm text-white font-mono" dir="ltr">{c.nationalId}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("profile.education")}</h4>
            {editing ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">{t("profile.educationLevel")}</p>
                  <select value={form.educationLevel} onChange={e => setField("educationLevel", e.target.value)} className="w-full h-9 bg-muted/30 border border-border rounded-sm px-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none" data-testid="edit-education">
                    <option value="" className="bg-card text-muted-foreground">{t("profile.selectPh")}</option>
                    {EDU_OPTIONS.map(opt => <option key={opt} value={opt} className="bg-card text-white">{t(`education.${opt}` as any, opt)}</option>)}
                  </select>
                </div>
                {form.educationLevel === "University and higher" && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">{t("profile.majorFull")}</p>
                    <Input value={form.major} onChange={e => setField("major", e.target.value)} placeholder={t("profile.majorPh")} className="h-9 bg-muted/30 border-border text-sm" data-testid="edit-major" />
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {c.educationLevel && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t("profile.level")}</p>
                    <p className="text-sm text-white">{t(`education.${c.educationLevel}` as any, c.educationLevel)}</p>
                  </div>
                )}
                {c.major && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t("profile.major")}</p>
                    <p className="text-sm text-white">{c.major}</p>
                  </div>
                )}
                {!c.educationLevel && !c.major && <p className="text-sm text-muted-foreground col-span-2">{dash}</p>}
              </div>
            )}
            {c.skills && c.skills.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] text-muted-foreground mb-1.5">{t("profile.skills")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.skills.map((s, i) => (
                    <Badge key={i} variant="outline" className="text-[11px] px-2 py-0.5 border-border text-white/80">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
            {c.languages && c.languages.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] text-muted-foreground mb-1.5">{t("profile.languages")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.languages.map((l, i) => (
                    <Badge key={i} variant="outline" className="text-[11px] px-2 py-0.5 border-primary/30 text-primary">{l}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("profile.iban")}</h4>
            {editing ? (
              <div className="space-y-2">
                <Input value={form.ibanNumber} onChange={e => {
                  const cleaned = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 24);
                  setField("ibanNumber", cleaned.replace(/(.{4})/g, "$1 ").trim());
                }} placeholder={t("profile.ibanPh")} maxLength={29} dir="ltr" className="h-9 bg-muted/30 border-border text-sm font-mono" data-testid="edit-iban" />
                {(() => {
                  if (!form.ibanNumber) return null;
                  const result = validateSaudiIban(form.ibanNumber);
                  if (result.ok) return null;
                  if (result.reason === "empty") return null;
                  const msg =
                    result.reason === "missing_prefix" ? t("toast.invalidIbanPrefixDesc") :
                    result.reason === "wrong_length"   ? t("toast.invalidIbanLengthDesc", { count: result.length ?? 0 }) :
                    result.reason === "bad_checksum"   ? t("toast.invalidIbanChecksumDesc") :
                                                          t("toast.invalidIbanCharsDesc");
                  return <p className="text-[11px] text-amber-400">{msg}</p>;
                })()}
                {(() => {
                  const bank = resolveSaudiBank(form.ibanNumber || "");
                  return bank ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">{t("profile.bankName")}</p>
                        <Input value={bank.ibanBankName} readOnly className="h-8 bg-muted/10 border-border text-xs text-muted-foreground cursor-not-allowed" data-testid="view-bank-name" />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">{t("profile.bankCode")}</p>
                        <Input value={bank.ibanBankCode} readOnly dir="ltr" className="h-8 bg-muted/10 border-border text-xs text-muted-foreground cursor-not-allowed font-mono" data-testid="view-bank-code" />
                      </div>
                    </div>
                  ) : form.ibanNumber?.length >= 6 ? (
                    <p className="text-[11px] text-amber-400">{t("profile.bankUnknown")}</p>
                  ) : null;
                })()}
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-white font-mono" dir="ltr">{(c as any).ibanNumber || dash}</p>
                {(c as any).ibanBankName && (
                  <p className="text-xs text-muted-foreground">{(c as any).ibanBankName} <span className="font-mono text-primary ms-1" dir="ltr">{(c as any).ibanBankCode}</span></p>
                )}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("profile.emergency")}</h4>
            {editing ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">{t("profile.emergencyName")}</p>
                  <Input value={form.emergencyContactName} onChange={e => setField("emergencyContactName", e.target.value)} placeholder={t("profile.emergencyNamePh")} className="h-9 bg-muted/30 border-border text-sm" data-testid="edit-emergency-name" />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">{t("profile.emergencyPhone")}</p>
                  <Input
                    value={form.emergencyContactPhone}
                    onChange={e => setField("emergencyContactPhone", sanitizeSaMobileInput(e.target.value))}
                    onBlur={e => setField("emergencyContactPhone", normalizeSaMobileOnBlur(e.target.value))}
                    placeholder="05XXXXXXXX"
                    inputMode="tel"
                    maxLength={10}
                    dir="ltr"
                    className="h-9 bg-muted/30 border-border text-sm"
                    data-testid="edit-emergency-phone"
                  />
                  {form.emergencyContactPhone.length > 0 && !isValidSaMobile(form.emergencyContactPhone) && (
                    <p className="text-[11px] text-amber-400" data-testid="text-emergency-phone-validation-hint">
                      {String(t("common:errors.invalidPhone", { defaultValue: "Please enter a valid Saudi mobile (05XXXXXXXX)." } as any))}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("profile.emergencyName")}</p>
                  <p className="text-sm text-white">{c.emergencyContactName || dash}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("profile.emergencyPhone")}</p>
                  <p className="text-sm text-white" dir="ltr">{c.emergencyContactPhone || dash}</p>
                </div>
              </div>
            )}
          </div>

          {c.hasChronicDiseases && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> {t("profile.healthNotes")}
              </h4>
              <p className="text-sm text-amber-200/80">{c.chronicDiseases || t("profile.healthDefault")}</p>
            </div>
          )}

          {(() => {
            const cvUrl = (c as any).hasResume ? toProxiedFileUrl((c as any).resumeUrl) : null;
            const idUrl = (c as any).hasNationalId ? toProxiedFileUrl((c as any).nationalIdFileUrl) : null;
            const ibanUrl = (c as any).hasIban ? toProxiedFileUrl((c as any).ibanFileUrl) : null;
            const dlUrl = (c as any).hasDriversLicense ? toProxiedFileUrl((c as any).driversLicenseFileUrl) : null;
            const vacUrl = (c as any).hasVaccinationReport ? toProxiedFileUrl((c as any).vaccinationReportFileUrl) : null;
            if (!cvUrl && !idUrl && !ibanUrl && !dlUrl && !vacUrl) return null;
            return (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("profile.documents")}</h4>
                <div className="flex flex-wrap gap-2">
                  {cvUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-border"
                      onClick={() => window.open(cvUrl, "_blank", "noopener,noreferrer")}
                      data-testid="button-view-cv"
                    >
                      <FileText className="me-2 h-4 w-4" />
                      {t("profile.viewCv")}
                    </Button>
                  )}
                  {idUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-border"
                      onClick={() => window.open(idUrl, "_blank", "noopener,noreferrer")}
                      data-testid="button-view-national-id"
                    >
                      <FileText className="me-2 h-4 w-4" />
                      {t("profile.viewNationalId")}
                    </Button>
                  )}
                  {ibanUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-border"
                      onClick={() => window.open(ibanUrl, "_blank", "noopener,noreferrer")}
                      data-testid="button-view-iban"
                    >
                      <FileText className="me-2 h-4 w-4" />
                      {t("profile.viewIban")}
                    </Button>
                  )}
                  {dlUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-border"
                      onClick={() => window.open(dlUrl, "_blank", "noopener,noreferrer")}
                      data-testid="button-view-drivers-license"
                    >
                      <FileText className="me-2 h-4 w-4" />
                      {t("profile.viewDriversLicense")}
                    </Button>
                  )}
                  {vacUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-border"
                      onClick={() => window.open(vacUrl, "_blank", "noopener,noreferrer")}
                      data-testid="button-view-vaccination-report"
                    >
                      <FileText className="me-2 h-4 w-4" />
                      {t("profile.viewVaccinationReport")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}

          <WorkforceHistorySection candidateId={c.id} />

          {c.notes && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("profile.notes")}</h4>
              <p className="text-sm text-white/70">{c.notes}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex gap-2">
          {editing ? (
            <>
              <Button
                size="sm"
                className="flex-1 bg-primary text-primary-foreground"
                onClick={handleSave}
                disabled={saveMutation.isPending}
                data-testid="profile-save"
              >
                {saveMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                {t("profile.save")}
              </Button>
              <Button size="sm" variant="outline" className="border-border" onClick={() => setEditing(false)}>
                {t("profile.cancel")}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className="border-border"
                onClick={startEditing}
                data-testid="profile-edit"
              >
                {t("profile.edit")}
              </Button>
              <Button size="sm" variant="outline" className="border-border" onClick={onClose}>
                {t("profile.close")}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
      <AlertDialog open={!!phoneConflict} onOpenChange={(o) => { if (!o) setPhoneConflict(null); }}>
        <AlertDialogContent data-testid="dialog-phone-conflict">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {String(t("profile.phoneConflict.title", { defaultValue: "Phone number already in use" } as any))}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {String(t("profile.phoneConflict.body", {
                    defaultValue: "The phone number {{phone}} is currently held by {{name}}.",
                    phone: phoneConflict?.newPhone ?? "",
                    name: phoneConflict?.conflict.fullNameEn ?? "",
                  } as any))}
                </p>
                <div className="rounded-sm border border-border bg-muted/20 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{String(t("profile.phoneConflict.holderLabel", { defaultValue: "Current holder" } as any))}</span>
                    <span className="text-white font-medium"><bdi>{phoneConflict?.conflict.fullNameEn}</bdi></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{String(t("profile.phoneConflict.classificationLabel", { defaultValue: "Type" } as any))}</span>
                    <span className="text-white">
                      {phoneConflict?.conflict.classification === "smp"
                        ? String(t("classification.smp", { defaultValue: "SMP" } as any))
                        : String(t("classification.individual", { defaultValue: "Individual" } as any))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{String(t("profile.phoneConflict.statusLabel", { defaultValue: "Status" } as any))}</span>
                    <span className="text-white">{phoneConflict?.conflict.status}</span>
                  </div>
                </div>
                <p className="text-amber-400 text-xs">
                  {String(t("profile.phoneConflict.warning", {
                    defaultValue: "If you transfer the phone, the current holder will be left without a phone number until a new one is added. Any pending activation links sent to that number will be invalidated.",
                  } as any))}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-phone-conflict-cancel">
              {String(t("profile.cancel", { defaultValue: "Cancel" } as any))}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-phone-conflict-transfer"
              onClick={() => {
                if (phoneConflict) transferMutation.mutate(phoneConflict.pendingPayload);
              }}
              disabled={transferMutation.isPending}
              className="bg-amber-600 hover:bg-amber-600/90 text-white"
            >
              {transferMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {String(t("profile.phoneConflict.transferBtn", { defaultValue: "Transfer phone" } as any))}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Task #189 — Photo preview lightbox.
          Opens when the avatar is clicked (and a photo exists). Click
          outside the panel to close (Radix's onOpenChange fires for
          backdrop clicks and Escape). The "Change Photo" button reuses
          the same hidden file input as the avatar overlay so the upload
          path / Rekognition validation is identical.
          The DialogContent here is intentionally borderless and
          background-less so the image itself is the visual focus. */}
      <Dialog open={photoPreviewOpen} onOpenChange={setPhotoPreviewOpen}>
        <DialogContent
          className="max-w-[90vw] sm:max-w-2xl bg-card border-border p-4"
          data-testid="dialog-photo-preview"
        >
          <DialogHeader>
            <DialogTitle className="text-base font-display pe-10">
              {String(t("profile.photoPreviewTitle", { defaultValue: "Profile photo" } as any))}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {String(t("profile.photoPreviewTitle", { defaultValue: "Profile photo" } as any))}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center bg-black/40 rounded-md overflow-hidden">
            {(c as any).photoUrl ? (
              <img
                src={(c as any).photoUrl}
                alt={c.fullNameEn}
                className="max-h-[70vh] max-w-full object-contain"
                data-testid="img-photo-preview"
              />
            ) : (
              <div className="h-40 w-full flex items-center justify-center text-muted-foreground text-sm">—</div>
            )}
          </div>
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              variant="outline"
              className="border-border gap-2"
              disabled={photoUploading}
              onClick={() => photoFileRef.current?.click()}
              data-testid="button-change-photo-from-preview"
            >
              {photoUploading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Pencil className="h-3.5 w-3.5" />}
              {String(t("profile.changePhoto", { defaultValue: "Change photo" } as any))}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

function ReclassifyConfirmDialog({
  state,
  onCancel,
  onConfirm,
  pending,
}: {
  state: { id: string; name: string } | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  pending: boolean;
}) {
  const { t } = useTranslation("talent");
  const open = !!state;
  const [reason, setReason] = useState("");
  // Reset the input every time the dialog re-opens for a fresh candidate so
  // a previous candidate's reason is never accidentally re-submitted.
  useEffect(() => {
    if (open) setReason("");
  }, [open, state?.id]);
  const reasonValid = reason.trim().length >= 10;
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent
        className="start-auto end-auto left-[50%] -translate-x-1/2 bg-card border-border"
        data-testid="dialog-reclassify-confirm"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {String(t("reclassify.toIndividual.title"))}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                {String(t("reclassify.toIndividual.body", { name: state?.name ?? "" }))}
              </p>
              <p className="text-xs text-amber-400">
                {String(t("reclassify.warning"))}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="reclassify-reason" className="text-sm">
            {String(t("reclassify.reasonLabel"))}
          </Label>
          <Textarea
            id="reclassify-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={String(t("reclassify.reasonPlaceholder"))}
            rows={3}
            className="bg-muted/30 border-border resize-none"
            disabled={pending}
            data-testid="input-reclassify-reason"
          />
          <p className="text-[11px] text-muted-foreground">
            {String(t("reclassify.reasonHint"))}
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} data-testid="button-reclassify-cancel">
            {String(t("reclassify.cancel"))}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || !reasonValid}
            onClick={() => onConfirm(reason.trim())}
            data-testid="button-reclassify-confirm"
          >
            {pending
              ? String(t("reclassify.working"))
              : String(t("reclassify.toIndividual.cta"))}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function TalentPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t, i18n } = useTranslation("talent");
  const lang = i18n.language;
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  // Task #252 — initial filter is "all" so the first request matches
  // the dropdown's default option. Previously this defaulted to the
  // legacy raw enum value "available" which (after the derivation
  // refactor) is no longer one of the dropdown options, silently
  // hiding rows that no longer carry that raw status.
  const [status, setStatus] = useState("all");
  // Task #254 — sub-filter for the Archived bucket. Only meaningful when
  // status==="archived"; we always reset it whenever the parent filter
  // moves away (see effect below). "all" means "any archived reason".
  const [archivedReason, setArchivedReason] = useState<ArchivedReason | "all">(() => {
    if (typeof window === "undefined") return "all";
    const v = new URLSearchParams(window.location.search).get("archivedReason");
    return v && (ARCHIVED_REASONS as readonly string[]).includes(v) ? (v as ArchivedReason) : "all";
  });
  const [sourceFilter, setSourceFilter] = useState("all");
  const [formerEmployeeFilter, setFormerEmployeeFilter] = useState(false);
  // Task #209 — recruiter-facing toggles for events that require a
  // licensed driver or a vaccination report. Hydrated from the URL on
  // mount and round-tripped back to the query string so a filtered
  // view is shareable.
  const [hasDriversLicenseFilter, setHasDriversLicenseFilter] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("hasDriversLicense") === "true";
  });
  const [hasVaccinationReportFilter, setHasVaccinationReportFilter] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("hasVaccinationReport") === "true";
  });
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  // Default to oldest-first so the very first registrations show on page 1
  // (per product decision). Users can flip direction by clicking the
  // "Created" column header.
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(new Set(DEFAULT_VISIBLE));
  const [uploadOpen, setUploadOpen] = useState(false);

  // Task #107: support deep-link from /smp-companies "Upload Workers" button
  // (?openBulkUpload=1[&smpCompanyId=...]). Auto-opens the bulk upload dialog
  // once on mount and strips the params from the URL so refreshes don't loop.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("openBulkUpload") === "1") {
      setUploadOpen(true);
      params.delete("openBulkUpload");
      params.delete("smpCompanyId");
      const remaining = params.toString();
      const newUrl = window.location.pathname + (remaining ? `?${remaining}` : "");
      window.history.replaceState({}, "", newUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<Record<string, string>[] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [smpValidating, setSmpValidating] = useState(false);
  const [smpValidationResults, setSmpValidationResults] = useState<{
    status: "new" | "clean" | "blocked" | "phone_conflict";
    row: Record<string, string>;
    candidate?: { id: string; fullNameEn: string; nationalId: string | null };
    conflictCandidate?: {
      id: string;
      fullNameEn: string;
      nationalId: string | null;
      classification: string;
      status: string;
      hasUserAccount: boolean;
    };
    blockedReason?: string;
  }[] | null>(null);
  const [smpConfirmedClean, setSmpConfirmedClean] = useState<Set<number>>(new Set());
  // Per-row resolution for `phone_conflict` results. Key = index in
  // smpValidationResults. Default policy is `skip` so admins must opt in
  // to either reclassify the existing phone-owner or transfer the phone
  // away from them.
  const [smpConflictResolutions, setSmpConflictResolutions] =
    useState<Map<number, "reclassify" | "transfer" | "skip">>(new Map());
  const [profileCandidate, setProfileCandidate] = useState<Candidate | null>(null);
  const [exporting, setExporting] = useState(false);
  const [blockCandidate, setBlockCandidate] = useState<Candidate | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<Candidate | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmAction, setBulkConfirmAction] = useState<"block" | "unblock" | "archive" | "unarchive" | null>(null);
  // Reclassify confirm: row-menu reclassify actions stage their intent here
  // so an AlertDialog can ask the admin to confirm before mutating.
  const [reclassifyConfirm, setReclassifyConfirm] = useState<{
    id: string;
    name: string;
  } | null>(null);

  function toggleColumn(key: ColumnKey) {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size <= 2) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const col = (key: ColumnKey) => visibleColumns.has(key);

  const debouncedSearch = useDebounce(search, 300);

  // Task #195 — parse the search box client-side so the "Searching N
  // IDs" pill renders immediately on type/paste; the server uses the
  // same parser so the pill, query, and missing-IDs report agree.
  const parsedSearch = useMemo(() => parseSearchTokens(debouncedSearch), [debouncedSearch]);
  const liveParsedSearch = useMemo(() => parseSearchTokens(search), [search]);

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: "100",
    sortBy,
    sortOrder,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    // Task #252 — every non-"all" dropdown value is one of the new
    // derived buckets (completed, not_activated, hired, blocked,
    // archived). They all flow through the server's
    // DISPLAY_STATUS_SQL CASE filter via ?status=. The legacy
    // ?archived=true path is reserved for explicit manual-archive
    // queries (none of which the talent page issues today) — using
    // it for the derived "archived" bucket would limit results to
    // archived_at IS NOT NULL and silently hide derive-archived
    // rows (e.g. individuals whose profile is incomplete).
    ...(status && status !== "all" ? { status } : {}),
    // Task #254 — only forward the sub-bucket reason when the user
    // has narrowed the parent status to Archived. Server validates
    // against the closed ARCHIVED_REASONS set, so a stray value is
    // silently dropped, but we still gate it here to avoid sending
    // a redundant param when the user is browsing other buckets.
    ...(status === "archived" && archivedReason !== "all" ? { archivedReason } : {}),
    ...(sourceFilter && sourceFilter !== "all" ? { classification: sourceFilter } : {}),
    ...(formerEmployeeFilter ? { formerEmployee: "true" } : {}),
    ...(hasDriversLicenseFilter ? { hasDriversLicense: "true" } : {}),
    ...(hasVaccinationReportFilter ? { hasVaccinationReport: "true" } : {}),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "/api/candidates",
      page,
      debouncedSearch,
      status,
      archivedReason,
      sourceFilter,
      formerEmployeeFilter,
      hasDriversLicenseFilter,
      hasVaccinationReportFilter,
      sortBy,
      sortOrder,
    ],
    queryFn: () => apiRequest("GET", `/api/candidates?${queryParams.toString()}`).then(r => r.json()),
  });

  // Task #209 — keep ?hasDriversLicense / ?hasVaccinationReport in
  // sync with the toggles so a filtered view of the talent pool is
  // shareable via URL. We use replaceState (not push) so flipping the
  // toggle does not pollute the browser history stack, and we
  // preserve any unrelated query params already present (e.g. legacy
  // openBulkUpload deep-link params have been stripped on mount, but
  // future deep-links should not be clobbered).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (hasDriversLicenseFilter) {
      params.set("hasDriversLicense", "true");
    } else {
      params.delete("hasDriversLicense");
    }
    if (hasVaccinationReportFilter) {
      params.set("hasVaccinationReport", "true");
    } else {
      params.delete("hasVaccinationReport");
    }
    // Task #254 — round-trip the Archived sub-bucket to the URL so a
    // filtered view (e.g. "show me everyone in missed_activation") is
    // shareable. Only emitted while the parent status is "archived";
    // otherwise the param is stripped to keep the URL clean.
    if (status === "archived" && archivedReason !== "all") {
      params.set("archivedReason", archivedReason);
    } else {
      params.delete("archivedReason");
    }
    const remaining = params.toString();
    const nextUrl = window.location.pathname + (remaining ? `?${remaining}` : "");
    const currentUrl = window.location.pathname + window.location.search;
    if (nextUrl !== currentUrl) {
      window.history.replaceState({}, "", nextUrl);
    }
  }, [hasDriversLicenseFilter, hasVaccinationReportFilter, status, archivedReason]);

  // Task #254 — when the parent Status filter moves away from
  // Archived, drop any stale sub-bucket pick so the next visit to
  // Archived starts at "all reasons" rather than carrying the old
  // chip across an unrelated bucket switch.
  useEffect(() => {
    if (status !== "archived" && archivedReason !== "all") {
      setArchivedReason("all");
    }
  }, [status, archivedReason]);

  const searchMeta: CandidateSearchMeta | undefined = data?.searchMeta;

  // Task #265 — both stats queries below run COUNT aggregations that
  // are expensive on a 70k-row tenant. Two safeguards keep them from
  // being noisy without changing user-visible behaviour:
  //   1. `staleTime` — within the window we treat any cached response
  //      for the same key as fresh, so rapid toggle-spam (e.g. flipping
  //      a chip on/off, status round-trips) reuses the previous
  //      aggregation instead of re-firing it. Real data changes still
  //      invalidate the cache via the mutation handlers below
  //      (updateStatus / archiveMutation / restoreMutation), so chip
  //      counts stay correct after any actual write.
  //   2. `placeholderData: (prev) => prev` — when the query key DOES
  //      change (filter input, search debounce settling) we hold the
  //      last counts on screen while the new request resolves, instead
  //      of flashing chips back to `undefined → 0`.
  // Search input is already debounced (300 ms via `debouncedSearch`)
  // so a multi-ID paste fires at most one aggregation per pause; do
  // not undo this without checking the multi-ID paste flow on a large
  // tenant.
  const STATS_STALE_MS = 1_500;
  const { data: statsData } = useQuery({
    queryKey: ["/api/candidates/stats"],
    queryFn: () => apiRequest("GET", "/api/candidates/stats").then(r => r.json()),
    staleTime: STATS_STALE_MS,
    placeholderData: (prev) => prev,
  });

  // Task #261 — per-reason headcount inside the Archived bucket. Reuses
  // the same filter set as the table query (search, classification,
  // doc toggles, …) so the chip totals always reflect what the admin
  // is currently looking at; the server forces status="archived" and
  // ignores any incoming archivedReason so the four counts always
  // span the full Archived population. Only fired while the parent
  // Status filter is "archived" — every other status renders zero
  // archived rows by definition, so the round-trip would be wasted.
  const archivedReasonStatsParams = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (sourceFilter && sourceFilter !== "all") p.set("classification", sourceFilter);
    if (formerEmployeeFilter) p.set("formerEmployee", "true");
    if (hasDriversLicenseFilter) p.set("hasDriversLicense", "true");
    if (hasVaccinationReportFilter) p.set("hasVaccinationReport", "true");
    return p.toString();
  }, [
    debouncedSearch,
    sourceFilter,
    formerEmployeeFilter,
    hasDriversLicenseFilter,
    hasVaccinationReportFilter,
  ]);

  const { data: archivedReasonStats } = useQuery<Record<ArchivedReason, number>>({
    queryKey: [
      "/api/candidates/archived-reason-stats",
      archivedReasonStatsParams,
    ],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/candidates/archived-reason-stats${archivedReasonStatsParams ? `?${archivedReasonStatsParams}` : ""}`,
      ).then(r => r.json()),
    enabled: status === "archived",
    // Task #265 — see the rationale block above the /stats query for
    // why we both cache and keep-previous on this expensive aggregation.
    staleTime: STATS_STALE_MS,
    placeholderData: (prev) => prev,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/candidates/${id}`, { status }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/archived-reason-stats"] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/candidates/${id}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/archived-reason-stats"] });
      toast({ title: t("toast.candidateArchived") });
    },
    onError: () => toast({ title: t("toast.archiveFailed"), variant: "destructive" }),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/candidates/${id}/unarchive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/archived-reason-stats"] });
      toast({ title: t("toast.candidateRestored") });
    },
    onError: () => toast({ title: t("toast.restoreFailed"), variant: "destructive" }),
  });

  const bulkAction = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: "block" | "unblock" | "archive" | "unarchive" }) =>
      apiRequest("POST", "/api/candidates/bulk-action", { ids, action }).then(r => r.json()),
    onSuccess: (data) => {
      const key =
        data.action === "block" ? "toast.bulkBlocked"
        : data.action === "unblock" ? "toast.bulkUnblocked"
        : data.action === "unarchive" ? "toast.bulkUnarchived"
        : "toast.bulkArchived";
      toast({ title: t(key, { count: data.affected, n: formatNumber(data.affected) }) });
      setSelectedIds(new Set());
      setBulkConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/archived-reason-stats"] });
    },
    onError: () => {
      toast({ title: t("toast.bulkActionFailed"), variant: "destructive" });
      setBulkConfirmAction(null);
    },
  });

  const smpReissueMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest("POST", "/api/candidates/activation-tokens/reissue", { ids }).then(r => r.json()),
    onSuccess: (data: { reissued?: number; skipped?: number }) => {
      const n = data.reissued ?? 0;
      const s = data.skipped ?? 0;
      const title = t("smpToast.reissued", { n: formatNumber(n), count: n });
      toast({
        title,
        description: s > 0 ? `${formatNumber(s)} skipped (already activated, blocked, or invalid).` : undefined,
        variant: n === 0 && s > 0 ? "destructive" : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
    },
    onError: () => toast({ title: t("toast.bulkActionFailed"), variant: "destructive" }),
  });

  // Task #254 — one-click re-engagement SMS for inactive_one_year rows.
  // Server endpoint mirrors the reissue shape (POST { ids } → { sent,
  // skipped, failed }). Toast surfaces the success count + a short
  // description of skipped/failed counts, matching smpReissueMutation
  // so the two row-level actions feel symmetrical.
  const reEngagementSmsMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest("POST", "/api/candidates/re-engagement-sms", { ids }).then(r => r.json()),
    onSuccess: (data: { sent?: number; skipped?: number; failed?: number }) => {
      const sent = data.sent ?? 0;
      const skipped = data.skipped ?? 0;
      const failed = data.failed ?? 0;
      const title = t("smpToast.reengagementSent", { n: formatNumber(sent), count: sent });
      const descParts: string[] = [];
      if (skipped > 0) descParts.push(t("smpToast.reengagementSkipped", { n: formatNumber(skipped) }));
      if (failed > 0)  descParts.push(t("smpToast.reengagementFailed",  { n: formatNumber(failed)  }));
      toast({
        title,
        description: descParts.length > 0 ? descParts.join(" · ") : undefined,
        variant: sent === 0 && (skipped > 0 || failed > 0) ? "destructive" : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
    },
    onError: () => toast({ title: t("toast.bulkActionFailed"), variant: "destructive" }),
  });

  const smpOnboardingMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest("POST", "/api/candidates/send-to-onboarding", { ids }).then(r => r.json()),
    onSuccess: (data: { onboarded?: number; skipped?: number; skippedReasons?: { id: string; reason: string }[] }) => {
      const n = data.onboarded ?? 0;
      const s = data.skipped ?? 0;
      const reasons = data.skippedReasons ?? [];
      const title = t("smpToast.onboarded", { n: formatNumber(n), count: n });
      const desc = s > 0
        ? `${formatNumber(s)} skipped` + (reasons.length > 0 ? ` (${reasons.slice(0, 3).map(r => r.reason).join(", ")}${reasons.length > 3 ? "…" : ""})` : "")
        : undefined;
      toast({ title, description: desc, variant: n === 0 && s > 0 ? "destructive" : undefined });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
    },
    onError: () => toast({ title: t("toast.bulkActionFailed"), variant: "destructive" }),
  });

  const reclassifyMutation = useMutation({
    // Task #107 step 14 — locked to SMP → Individual; reverse direction is
    // handled implicitly through the SMP bulk upload (smp-commit auto-flips
    // matching NIDs). Reason is required server-side for the audit trail.
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/candidates/${id}/reclassify-as-individual`, { reason }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: t("smpToast.reclassified") });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/archived-reason-stats"] });
    },
    onError: (err: any) => {
      const msg = err?.message?.includes("blocker") || err?.message?.includes("pipeline")
        ? t("smpToast.blockedByPipeline")
        : t("toast.bulkActionFailed");
      toast({ title: msg, variant: "destructive" });
    },
  });

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const bulkUpload = useMutation({
    mutationFn: async (candidates: Record<string, string>[]) => {
      const hasSmpRows = candidates.some(r => (r.source || "").toLowerCase() === "smp");

      // ── SMP rows: use smp-commit endpoint (validated + clean confirmed) ──────
      if (hasSmpRows && smpValidationResults) {
        const nonSmpRows = candidates.filter(r => (r.source || "").toLowerCase() !== "smp");

        // Build results with per-row confirmed flag for CLEAN rows and the
        // chosen resolution for PHONE_CONFLICT rows (server enforces both).
        const resultsWithConfirmation = smpValidationResults.map((r, idx) => ({
          ...r,
          confirmed: r.status === "clean" ? smpConfirmedClean.has(idx) : undefined,
          resolution: r.status === "phone_conflict"
            ? (smpConflictResolutions.get(idx) ?? "skip")
            : undefined,
        }));

        // Commit SMP batch via dedicated endpoint
        const smpRes = await apiRequest("POST", "/api/candidates/smp-commit", {
          results: resultsWithConfirmation,
        }).then(r => r.json());

        // If there are also non-SMP rows, bulk-insert those normally
        if (nonSmpRows.length > 0) {
          const mapped = nonSmpRows.map(c => ({
            fullNameEn: c.fullNameEn || "Unknown",
            phone: c.phone || undefined,
            email: c.email || undefined,
            nationalId: c.nationalId || undefined,
            city: c.city || undefined,
            nationality: c.nationality === "saudi" ? "saudi" : c.nationality === "non_saudi" ? "non_saudi" : undefined,
            gender: c.gender || undefined,
            dateOfBirth: c.dateOfBirth || undefined,
            classification: "individual" as const,
          }));
          const indivRes = await apiRequest("POST", "/api/candidates/bulk", { candidates: mapped }).then(r => r.json());
          return {
            mode: "mixed",
            smp: smpRes,
            individual: indivRes,
          };
        }

        return { mode: "smp", smp: smpRes };
      }

      // ── Non-SMP only: use generic bulk endpoint ────────────────────────────
      const mapped = candidates.map(c => ({
        fullNameEn: c.fullNameEn || "Unknown",
        phone: c.phone || undefined,
        email: c.email || undefined,
        nationalId: c.nationalId || undefined,
        city: c.city || undefined,
        nationality: c.nationality === "saudi" ? "saudi" : c.nationality === "non_saudi" ? "non_saudi" : undefined,
        gender: c.gender || undefined,
        dateOfBirth: c.dateOfBirth || undefined,
        classification: (c as any).classification === "smp" || c.source === "smp" ? "smp" as const : "individual" as const,
      }));
      const res = await apiRequest("POST", "/api/candidates/bulk", { candidates: mapped }).then(r => r.json());
      return { mode: "individual", individual: res };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/archived-reason-stats"] });

      if (data.mode === "smp" || data.mode === "mixed") {
        const smp = data.smp;
        const indiv = data.individual;
        let description = smp.message ?? t("upload.toast.smpDescDefault", {
          created: formatNumber(smp.created ?? 0),
          attached: formatNumber(smp.attached ?? 0),
        });
        if (data.mode === "mixed" && indiv) {
          description += " " + t("upload.toast.mixedAppend", {
            imported: formatNumber(indiv.inserted ?? 0),
            skippedSuffix: indiv.skipped > 0
              ? t("upload.toast.skippedSuffix", { skipped: formatNumber(indiv.skipped) })
              : "",
          });
        }
        toast({
          title: data.mode === "mixed" ? t("upload.toast.batchComplete") : t("upload.toast.smpCommitted"),
          description,
          ...(data.mode === "mixed" && indiv?.skipped > 0 ? { variant: "default" } : {}),
        });
        setUploadOpen(false);
        setUploadFile(null);
        setUploadPreview(null);
        setUploadError(null);
        setSmpValidationResults(null);
        setSmpConfirmedClean(new Set()); setSmpConflictResolutions(new Map());
      } else {
        const indiv = data.individual;
        if (indiv.skipped > 0) {
          const dupDetails = indiv.duplicates?.map((d: any) => t("upload.toast.dupRow", { row: formatNumber(d.row), reason: d.reason })).join("\n") ?? "";
          setUploadError(t("upload.toast.partialError", {
            imported: formatNumber(indiv.inserted),
            skipped: formatNumber(indiv.skipped),
            details: dupDetails,
          }));
          toast({
            title: t("upload.toast.partial"),
            description: t("upload.toast.partialDesc", {
              imported: formatNumber(indiv.inserted),
              skipped: formatNumber(indiv.skipped),
            }),
            variant: "destructive",
          });
        } else {
          toast({
            title: t("upload.toast.complete"),
            description: t("upload.toast.completeDesc", { imported: formatNumber(indiv.inserted) }),
          });
          setUploadOpen(false);
          setUploadFile(null);
          setUploadPreview(null);
          setUploadError(null);
          setSmpValidationResults(null);
          setSmpConfirmedClean(new Set()); setSmpConflictResolutions(new Map());
        }
      }
    },
    onError: (err: any) => {
      setUploadError(err.message || "Upload failed");
    },
  });

  const candidates: CandidateWithWorkforce[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const PAGE_SIZE = 100;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const visibleIds = candidates.map(c => c.id);
  const visibleSelectedCount = visibleIds.reduce((n, id) => n + (selectedIds.has(id) ? 1 : 0), 0);
  const allVisibleSelected = candidates.length > 0 && visibleSelectedCount === candidates.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allOnPage = candidates.length > 0 && candidates.every(c => next.has(c.id));
      if (allOnPage) {
        for (const c of candidates) next.delete(c.id);
      } else {
        for (const c of candidates) next.add(c.id);
      }
      return next;
    });
  }, [candidates]);

  const candidateCacheRef = useRef<Map<string, CandidateWithWorkforce>>(new Map());
  useEffect(() => {
    for (const c of candidates) candidateCacheRef.current.set(c.id, c);
  }, [candidates]);

  // Task #253 — KPI tiles now read the same five-bucket derivation
  // the row badges and the status filter chips use, so the headline
  // numbers can never disagree with the table totals an admin sees
  // when they click a filter chip.
  const stats = statsData as
    | {
        total: number;
        completed: number;
        notActivated: number;
        hired: number;
        blocked: number;
        archived: number;
        avgRating: number;
      }
    | undefined;

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  // Task #195 — single-line `<input>` strips newlines on paste, which
  // would collapse a pasted column of IDs into one continuous string.
  // Intercept the paste, normalise CRLF/LF/tab to commas (which the
  // shared parser already splits on) and inject the cleaned string at
  // the caret position. Pastes without those separators fall through
  // to the browser's default behaviour.
  const handleSearchPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text || !/[\n\r\t]/.test(text)) return;
    e.preventDefault();
    const normalized = text
      .replace(/\r\n?/g, "\n")
      .replace(/[\n\t]+/g, ", ")
      .replace(/\s*,\s*,+\s*/g, ", ");
    const input = e.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = input.value.slice(0, start) + normalized + input.value.slice(end);
    setSearch(next);
    setPage(1);
  }, []);

  const handleCopyMissingIds = useCallback(async () => {
    if (!searchMeta || searchMeta.missingIds.length === 0) return;
    try {
      await navigator.clipboard.writeText(searchMeta.missingIds.join("\n"));
      toast({
        title: t("multiSearch.copied", { n: formatNumber(searchMeta.missingIds.length) }),
      });
    } catch {
      toast({ title: t("multiSearch.copyFailed"), variant: "destructive" });
    }
  }, [searchMeta, toast, t]);

  const handleDownloadMissingIds = useCallback(() => {
    if (!searchMeta || searchMeta.missingIds.length === 0) return;
    const csv = "id\n" + searchMeta.missingIds.map((id) => `"${id.replace(/"/g, '""')}"`).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `missing_ids_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [searchMeta]);

  function handleColumnSort(field: SortField) {
    if (sortBy === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3 ms-1 opacity-40" />;
    return sortOrder === "asc"
      ? <ArrowUp className="h-3 w-3 ms-1 text-primary" />
      : <ArrowDown className="h-3 w-3 ms-1 text-primary" />;
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadError(null);
    setUploadPreview(null);
    setSmpValidationResults(null);
    setSmpConfirmedClean(new Set()); setSmpConflictResolutions(new Map());
    try {
      const rows = await parseFileToRows(file);
      if (rows.length === 0) {
        setUploadError(t("upload.noDataRows"));
        return;
      }
      if (rows.length > 1000) {
        setUploadError(t("upload.tooManyRows", { n: formatNumber(rows.length), max: formatNumber(1000) }));
        return;
      }
      // Task #107: this dialog is SMP-only since the template was trimmed to
      // fullNameEn + nationalId + phone (no `source` column). Stamp every
      // row as SMP so the downstream validate/commit and bucket-rendering
      // logic — which all gate on `r.source === "smp"` — routes correctly.
      const stamped = rows.map(r => ({ ...r, source: "smp" }));
      setUploadPreview(stamped);
    } catch (err: any) {
      setUploadError(err.message || t("upload.parseFail"));
    }
  }

  async function handleSmpValidate() {
    if (!uploadPreview) return;
    const smpRows = uploadPreview.filter(r => (r.source || "").toLowerCase() === "smp");
    if (smpRows.length === 0) {
      toast({ title: t("upload.noSmpRows"), description: t("upload.noSmpRowsDesc"), variant: "destructive" });
      return;
    }
    setSmpValidating(true);
    setSmpValidationResults(null);
    setSmpConfirmedClean(new Set()); setSmpConflictResolutions(new Map());
    try {
      const res = await apiRequest("POST", "/api/candidates/smp-validate", { candidates: smpRows });
      const data = await res.json();
      setSmpValidationResults(data.results);
    } catch (err: any) {
      toast({ title: t("upload.validationFailed"), description: err.message || t("upload.validationFailedDesc"), variant: "destructive" });
    } finally {
      setSmpValidating(false);
    }
  }

  async function handleExport(filterIds?: string[]) {
    if (exporting) return;
    setExporting(true);
    try {
      // Task #195 — export reflects the current filtered view
      // (including a multi-ID paste in the search box) instead of
      // dumping the whole talent pool.
      // When `filterIds` is provided (bulk-export from the selection
      // bar), we hit the same endpoint and then narrow the rows down
      // to the selected candidate UUIDs (the first column of every
      // row in the export payload is the candidate id). This keeps
      // the workbook format — headers, column widths, sheet name —
      // identical to "Export All" so downstream consumers don't
      // need to special-case the selection-export file.
      const exportParams = new URLSearchParams(queryParams);
      exportParams.delete("page");
      exportParams.delete("limit");
      const res = await fetch(`/api/candidates/export?${exportParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Export request failed");
      const data = await res.json();
      const headers: string[] = data.headers || [];
      let rows: any[][] = data.rows || [];
      if (filterIds && filterIds.length > 0) {
        const wanted = new Set(filterIds);
        rows = rows.filter((r) => wanted.has(r[0]));
      }
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws["!cols"] = headers.map(() => ({ wch: 20 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Candidates");
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = filterIds && filterIds.length > 0
        ? `candidates_export_selected_${rows.length}_${dateStr}.xlsx`
        : `candidates_export_${dateStr}.xlsx`;
      XLSX.writeFile(wb, filename);
      if (filterIds && filterIds.length > 0) {
        const missing = filterIds.length - rows.length;
        toast({
          title: t("toast.exported", { count: rows.length, n: formatNumber(rows.length) }),
          description: missing > 0
            ? (i18n.language === "ar"
                ? `تم تخطي ${formatNumber(missing)} لعدم تطابقها مع الفلاتر الحالية`
                : `${formatNumber(missing)} skipped — not in the current filtered view`)
            : undefined,
        });
      }
    } catch {
      toast({ title: t("toast.exportFailed"), description: t("toast.exportFailedDesc"), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">{t("title")}</h1>
            <p className="text-muted-foreground mt-1">
              {t("subtitle")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-9 border-border bg-background"
              onClick={handleExport}
              disabled={exporting}
              data-testid="button-export"
            >
              <Download className="me-2 h-4 w-4" />
              {exporting ? t("exporting") : t("exportAll")}
            </Button>
            <Button
              className="h-9 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs"
              onClick={() => { setUploadOpen(true); setUploadFile(null); setUploadPreview(null); setUploadError(null); }}
              data-testid="button-upload-candidates"
            >
              <Upload className="me-2 h-4 w-4" />
              {t("bulkUpload")}
            </Button>
          </div>
        </div>

        {/* Task #253 — KPI tiles for the five derived display buckets
            (Completed, Not Activated, Hired, Blocked, Archived). Each
            tile mirrors the corresponding status filter chip's count
            because both flow through the same DISPLAY_STATUS_SQL CASE
            on the server. The "Total" tile reports
            "not manually archived" — the same set the table renders
            when the status filter is "All" — so the headline matches
            the table footer's total. The Info tooltips spell out
            exactly what each bucket counts so the apparent
            "Archived ≥ Total" case (caused by manually-archived rows
            being excluded from Total but included in Archived) does
            not surprise admins. */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {([
            { key: "total",         label: t("stats.total"),        value: stats?.total,        color: "text-white",       border: "border-s-4 border-s-primary", testId: "stat-total-profiles", desc: t("stats.totalDesc") },
            { key: "completed",     label: t("stats.completed"),    value: stats?.completed,    color: "text-green-500",   border: "",                            testId: "stat-completed",      desc: t("stats.completedDesc") },
            { key: "not_activated", label: t("stats.not_activated"),value: stats?.notActivated, color: "text-amber-400",   border: "",                            testId: "stat-not-activated",  desc: t("stats.not_activatedDesc") },
            { key: "hired",         label: t("stats.hired"),        value: stats?.hired,        color: "text-blue-500",    border: "",                            testId: "stat-hired",          desc: t("stats.hiredDesc") },
            { key: "blocked",       label: t("stats.blocked"),      value: stats?.blocked,      color: "text-red-500",     border: "",                            testId: "stat-blocked",        desc: t("stats.blockedDesc") },
            { key: "archived",      label: t("stats.archived"),     value: stats?.archived,     color: "text-slate-400",   border: "",                            testId: "stat-archived",       desc: t("stats.archivedDesc") },
          ] as const).map((tile) => (
            <Card key={tile.key} className={`bg-card border-border shadow-sm ${tile.border}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider inline-flex items-center gap-1.5">
                  <span>{tile.label}</span>
                  <Tooltip delayDuration={150}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-primary transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
                        aria-label={t("stats.infoAriaLabel", { label: tile.label })}
                        data-testid={`button-stat-info-${tile.key}`}
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      align="start"
                      sideOffset={6}
                      collisionPadding={12}
                      className="!z-[9999] w-64 max-w-[calc(100vw-1.5rem)] rounded-md border border-border bg-popover px-3 py-2 text-[11px] text-muted-foreground shadow-lg leading-relaxed normal-case"
                      data-testid={`tooltip-stat-${tile.key}`}
                    >
                      {tile.desc}
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-4xl font-bold font-display ${tile.color}`} data-testid={tile.testId}>
                  {tile.value != null ? formatNumber(tile.value) : "—"}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder={t("search.ph")}
              className={`ps-10 h-10 bg-muted/30 border-border focus-visible:ring-primary/20 ${
                liveParsedSearch.isMulti ? "pe-44" : ""
              }`}
              value={search}
              onChange={handleSearchChange}
              onPaste={handleSearchPaste}
              data-testid="input-search-candidates"
              spellCheck={false}
              autoComplete="off"
            />
            {liveParsedSearch.isMulti && (
              <div
                className={`pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-medium whitespace-nowrap ${
                  liveParsedSearch.truncated
                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    : "bg-primary/15 text-primary border border-primary/30"
                }`}
                data-testid="badge-search-token-count"
                title={liveParsedSearch.truncated
                  ? t("multiSearch.pillTruncatedTitle", { n: formatNumber(MAX_SEARCH_TOKENS) })
                  : undefined}
              >
                <Hash className="h-3 w-3" />
                {liveParsedSearch.truncated
                  ? t("multiSearch.pillTruncated", { n: formatNumber(MAX_SEARCH_TOKENS) })
                  : t("multiSearch.pill", { n: formatNumber(liveParsedSearch.tokens.length) })}
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="h-10 w-36 border-border bg-background" data-testid="select-status-filter">
                <Filter className="me-2 h-4 w-4" />
                <SelectValue placeholder={t("statusFilter.all")} />
              </SelectTrigger>
              {/* Task #252 — five derived display statuses (plus "All").
                  These map 1:1 to the five badges shown in the table.
                  Server translates the value into a WHERE on the
                  shared `DISPLAY_STATUS_SQL` CASE expression so what
                  the user picks here matches the badges they see. */}
              <SelectContent>
                <SelectItem value="all">{t("statusFilter.all")}</SelectItem>
                <SelectItem value="completed">{t("statusFilter.completed")}</SelectItem>
                <SelectItem value="not_activated">{t("statusFilter.not_activated")}</SelectItem>
                <SelectItem value="hired">{t("statusFilter.hired")}</SelectItem>
                <SelectItem value="blocked">{t("statusFilter.blocked")}</SelectItem>
                <SelectItem value="archived">{t("statusFilter.archived")}</SelectItem>
              </SelectContent>
            </Select>
            {/* Task #254 — Archived sub-bucket dropdown. Only rendered
                when the parent Status filter is set to Archived so the
                control bar stays uncluttered for the common case. The
                value is round-tripped to the URL via the effect above. */}
            {status === "archived" && (
              <Select
                value={archivedReason}
                onValueChange={(v) => {
                  setArchivedReason(v as ArchivedReason | "all");
                  setPage(1);
                }}
              >
                <SelectTrigger
                  className="h-10 w-44 border-border bg-background"
                  data-testid="select-archived-reason-filter"
                >
                  <SelectValue placeholder={t("archivedReasonFilter.all")} />
                </SelectTrigger>
                <SelectContent>
                  {/* Task #261 — render the per-reason headcount inline
                      ("Missed activation (240)") so admins can triage at
                      a glance without flipping the filter four times.
                      Counts respect the other active filters (search,
                      classification, doc toggles) so the four numbers
                      always sum to the table's archived headcount. The
                      "All" option intentionally has no count: it adds up
                      the four below it and would just be visual noise.
                      "—" is shown while the first response is in flight. */}
                  <SelectItem value="all">{t("archivedReasonFilter.all")}</SelectItem>
                  {(["inactive_one_year", "incomplete_profile", "missed_activation", "manually_archived"] as const).map((reason) => {
                    const cnt = archivedReasonStats?.[reason];
                    return (
                      <SelectItem
                        key={reason}
                        value={reason}
                        data-testid={`option-archived-reason-${reason}`}
                      >
                        <span>{t(`archivedReasonFilter.${reason}` as any)}</span>
                        <span
                          className="ms-2 text-xs text-muted-foreground tabular-nums"
                          data-testid={`count-archived-reason-${reason}`}
                        >
                          ({cnt != null ? formatNumber(cnt) : "—"})
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
            {/* Task #264 — surface the four per-reason counts as
                one-tap chips so admins can pick a reason without
                drilling through the dropdown. Reuses the same
                `archivedReasonStats` query, so no extra round-trip.
                Clicking the active chip clears the reason back to
                "all". */}
            {status === "archived" && ARCHIVED_REASON_CHIPS.map(({ reason, labelKey }) => {
              const cnt = archivedReasonStats?.[reason];
              const active = archivedReason === reason;
              return (
                <Button
                  key={reason}
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className={`h-10 gap-1.5 ${active ? "bg-primary hover:bg-primary/90 text-primary-foreground" : "border-border"}`}
                  onClick={() => {
                    // Set status explicitly too — the task brief says
                    // a chip should set both status="archived" and the
                    // reason. Today the chips only render when status
                    // is already archived, so this is a no-op in
                    // practice, but stating it explicitly future-proofs
                    // the handler if the chips are ever surfaced
                    // elsewhere (and matches the spec literally).
                    setStatus("archived");
                    setArchivedReason(active ? "all" : reason);
                    setPage(1);
                  }}
                  aria-pressed={active}
                  data-testid={`chip-archived-reason-${reason}`}
                >
                  <span>{t(labelKey)}</span>
                  <span
                    className="tabular-nums opacity-80"
                    data-testid={`chip-count-archived-reason-${reason}`}
                  >
                    · {cnt != null ? formatNumber(cnt) : "—"}
                  </span>
                </Button>
              );
            })}
            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1); }}>
              <SelectTrigger className="h-10 w-40 border-border bg-background" data-testid="select-source-filter">
                <SelectValue placeholder={t("sourceFilter.all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("sourceFilter.all")}</SelectItem>
                <SelectItem value="individual">{t("sourceFilter.individual")}</SelectItem>
                <SelectItem value="smp">{t("sourceFilter.smp")}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={formerEmployeeFilter ? "default" : "outline"}
              size="sm"
              className={`h-10 gap-1.5 ${formerEmployeeFilter ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "border-border"}`}
              onClick={() => { setFormerEmployeeFilter(!formerEmployeeFilter); setPage(1); }}
              data-testid="filter-former-employees"
            >
              <UserCheck className="h-3.5 w-3.5" />
              {t("formerEmployees")}
            </Button>
            {/* Task #209 — recruiter toggles for events that require a
                licensed driver or a vaccination report. Both flags are
                persisted to the URL so a filtered view is shareable. */}
            <Button
              variant={hasDriversLicenseFilter ? "default" : "outline"}
              size="sm"
              className={`h-10 gap-1.5 ${hasDriversLicenseFilter ? "bg-sky-600 hover:bg-sky-700 text-white" : "border-border"}`}
              onClick={() => { setHasDriversLicenseFilter(!hasDriversLicenseFilter); setPage(1); }}
              title={t("documentFilter.hasDriversLicenseTitle")}
              aria-pressed={hasDriversLicenseFilter}
              data-testid="filter-has-drivers-license"
            >
              <Car className="h-3.5 w-3.5" />
              {t("documentFilter.hasDriversLicense")}
            </Button>
            <Button
              variant={hasVaccinationReportFilter ? "default" : "outline"}
              size="sm"
              className={`h-10 gap-1.5 ${hasVaccinationReportFilter ? "bg-sky-600 hover:bg-sky-700 text-white" : "border-border"}`}
              onClick={() => { setHasVaccinationReportFilter(!hasVaccinationReportFilter); setPage(1); }}
              title={t("documentFilter.hasVaccinationReportTitle")}
              aria-pressed={hasVaccinationReportFilter}
              data-testid="filter-has-vaccination-report"
            >
              <Syringe className="h-3.5 w-3.5" />
              {t("documentFilter.hasVaccinationReport")}
            </Button>
          </div>
        </div>

        {/* Task #195 — multi-ID search outcome banners. Renders only when
            the user has pasted 2+ identifiers. Three states:
              · some IDs missing → amber panel with Copy + Download
              · all IDs matched   → green confirmation strip
              · only free-text dropped → soft hint                                     */}
        {parsedSearch.isMulti && searchMeta && searchMeta.missingIds.length > 0 && (
          <Card className="bg-amber-500/5 border-amber-500/30" data-testid="panel-missing-ids">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-amber-100" data-testid="text-missing-title">
                      {t("multiSearch.missingTitle", { n: formatNumber(searchMeta.missingIds.length) })}
                    </h3>
                    <p className="text-xs text-amber-100/70 mt-1">
                      {t("multiSearch.missingDesc")}
                      {searchMeta.droppedFreeText > 0 && (
                        <> {t("multiSearch.droppedFreeText", { n: formatNumber(searchMeta.droppedFreeText) })}</>
                      )}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pe-1">
                      {searchMeta.missingIds.map((id, idx) => (
                        <span
                          key={`${id}-${idx}`}
                          className="inline-flex items-center px-2 py-0.5 text-xs font-mono bg-amber-500/10 text-amber-50 border border-amber-500/20 rounded"
                          dir="ltr"
                          data-testid={`missing-id-${idx}`}
                        >
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 self-end sm:self-start">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-amber-500/40 bg-transparent text-amber-100 hover:bg-amber-500/10 hover:text-amber-50"
                    onClick={handleCopyMissingIds}
                    data-testid="button-copy-missing-ids"
                  >
                    <Copy className="me-1.5 h-3 w-3" />
                    {t("multiSearch.copy")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-amber-500/40 bg-transparent text-amber-100 hover:bg-amber-500/10 hover:text-amber-50"
                    onClick={handleDownloadMissingIds}
                    data-testid="button-download-missing-ids"
                  >
                    <Download className="me-1.5 h-3 w-3" />
                    {t("multiSearch.download")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {parsedSearch.isMulti && searchMeta && searchMeta.missingIds.length === 0 && (
          <div
            className="flex items-center gap-2 text-xs px-3 py-2 rounded-sm bg-emerald-500/5 border border-emerald-500/30 text-emerald-300"
            data-testid="status-all-matched"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            <span>
              {t("multiSearch.allMatched", { n: formatNumber(searchMeta.tokenCount) })}
              {searchMeta.droppedFreeText > 0 && (
                <> · {t("multiSearch.droppedFreeText", { n: formatNumber(searchMeta.droppedFreeText) })}</>
              )}
            </span>
          </div>
        )}

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-base font-display text-white">
              {t("list.title")}
              {isFetching && <RefreshCw className="inline ms-2 h-3 w-3 animate-spin text-muted-foreground" />}
            </CardTitle>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 border-border bg-background gap-1.5" data-testid="button-toggle-columns">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    {t("list.columns")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">{t("list.toggleColumns")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {ALL_COLUMNS.map(({ key, label }) => (
                    <DropdownMenuCheckboxItem
                      key={key}
                      checked={visibleColumns.has(key)}
                      onCheckedChange={() => toggleColumn(key)}
                      onSelect={(e) => e.preventDefault()}
                      data-testid={`toggle-col-${key}`}
                    >
                      {t(`col.${key}` as any, label)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-xs text-muted-foreground">
                {t("list.pageOf", { page: formatNumber(page), total: formatNumber(totalPages || 1), count: formatNumber(total) })}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : candidates.length === 0 ? (
              (() => {
                const anyFilterActive =
                  (status !== "all") ||
                  (sourceFilter !== "all") ||
                  formerEmployeeFilter ||
                  hasDriversLicenseFilter ||
                  hasVaccinationReportFilter;
                return (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground font-medium">{t("list.empty")}</p>
                    <p className="text-muted-foreground/60 text-sm mt-1">
                      {search
                        ? (parsedSearch.isMulti
                            ? t("list.emptyHintMultiSearch")
                            : t("list.emptyHintSearch"))
                        : (anyFilterActive
                            ? t("list.emptyHintFiltered")
                            : t("list.emptyHintUpload"))}
                    </p>
                    {!search && anyFilterActive && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        data-testid="button-show-all-candidates"
                        onClick={() => {
                          setStatus("all");
                          setSourceFilter("all");
                          setFormerEmployeeFilter(false);
                          setHasDriversLicenseFilter(false);
                          setHasVaccinationReportFilter(false);
                          setPage(1);
                        }}
                      >
                        {t("list.showAll")}
                      </Button>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-10 px-2">
                        <button
                          onClick={toggleSelectAll}
                          className="text-muted-foreground hover:text-white transition-colors"
                          data-testid="checkbox-select-all"
                        >
                          {visibleSelectedCount === 0 ? (
                            <Square className="h-4 w-4" />
                          ) : allVisibleSelected ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <MinusSquare className="h-4 w-4 text-primary" />
                          )}
                        </button>
                      </TableHead>
                      {col("id") && <TableHead className="w-[110px] text-muted-foreground">{t("col.id")}</TableHead>}
                      {col("candidate") && (
                        <TableHead
                          className="text-muted-foreground cursor-pointer select-none"
                          onClick={() => handleColumnSort("fullNameEn")}
                          data-testid="sort-candidate"
                        >
                          <span className="flex items-center">{t("col.candidate")} <SortIcon field="fullNameEn" /></span>
                        </TableHead>
                      )}
                      {col("classification") && (
                        <TableHead
                          className="text-muted-foreground cursor-pointer select-none"
                          onClick={() => handleColumnSort("classification")}
                          data-testid="sort-classification"
                        >
                          <span className="flex items-center">{t("col.classification")} <SortIcon field="classification" /></span>
                        </TableHead>
                      )}
                      {col("status") && <TableHead className="text-muted-foreground"><StatusInfoHeader /></TableHead>}
                      {col("phone") && (
                        <TableHead
                          className="text-muted-foreground cursor-pointer select-none"
                          onClick={() => handleColumnSort("phone")}
                          data-testid="sort-phone"
                        >
                          <span className="flex items-center">{t("col.phone")} <SortIcon field="phone" /></span>
                        </TableHead>
                      )}
                      {col("email") && (
                        <TableHead
                          className="text-muted-foreground cursor-pointer select-none"
                          onClick={() => handleColumnSort("email")}
                          data-testid="sort-email"
                        >
                          <span className="flex items-center">{t("col.email")} <SortIcon field="email" /></span>
                        </TableHead>
                      )}
                      {col("city") && (
                        <TableHead
                          className="text-muted-foreground cursor-pointer select-none"
                          onClick={() => handleColumnSort("city")}
                          data-testid="sort-city"
                        >
                          <span className="flex items-center">{t("col.city")} <SortIcon field="city" /></span>
                        </TableHead>
                      )}
                      {col("iban") && <TableHead className="text-muted-foreground whitespace-nowrap">{t("col.iban")}</TableHead>}
                      {col("bank") && <TableHead className="text-muted-foreground whitespace-nowrap">{t("col.bank")}</TableHead>}
                      {col("emergency") && <TableHead className="text-muted-foreground whitespace-nowrap">{t("col.emergency")}</TableHead>}
                      <TableHead className="text-end text-muted-foreground">{t("col.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((candidate) => {
                      const displayStatus = readDisplayStatus(candidate);
                      // Task #254 — paired sub-bucket reason for the
                      // Archived badge (null for any other display
                      // status). Read once per row so the chip,
                      // tooltip, and row-menu actions all agree.
                      const archivedReasonValue = displayStatus === "archived"
                        ? readArchivedReason(candidate)
                        : null;
                      return (
                        <TableRow
                          key={candidate.id}
                          className={`border-border hover:bg-muted/20 cursor-pointer ${selectedIds.has(candidate.id) ? "bg-primary/5" : ""}`}
                          data-testid={`row-candidate-${candidate.id}`}
                          onClick={() => setProfileCandidate(candidate)}
                        >
                          <TableCell className="px-2" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => toggleSelect(candidate.id)}
                              className="text-muted-foreground hover:text-white transition-colors"
                              data-testid={`checkbox-select-${candidate.id}`}
                            >
                              {selectedIds.has(candidate.id) ? (
                                <CheckSquare className="h-4 w-4 text-primary" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                            </button>
                          </TableCell>
                          {col("id") && (
                            <TableCell className="font-mono text-xs text-muted-foreground" dir="ltr">
                              {candidate.nationalId ?? "—"}
                            </TableCell>
                          )}
                          {col("candidate") && (
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9 border border-border">
                                  {(candidate as any).photoUrl && <AvatarImage src={(candidate as any).photoUrl} alt={candidate.fullNameEn} className="object-cover" />}
                                  <AvatarFallback className="text-xs">
                                    {candidate.fullNameEn.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="font-medium text-white text-sm"><bdi>{candidate.fullNameEn}</bdi></p>
                                  {(candidate.hasDriversLicense || candidate.hasVaccinationReport) && (
                                    <div className="flex items-center gap-1 mt-0.5">
                                      {candidate.hasDriversLicense && (
                                        <span
                                          className="inline-flex items-center justify-center h-4 w-4 rounded-sm bg-emerald-500/15 border border-emerald-500/25 text-emerald-300"
                                          title={t("rowBadge.hasDriversLicense")}
                                          aria-label={t("rowBadge.hasDriversLicense")}
                                          data-testid={`icon-drivers-license-${candidate.id}`}
                                        >
                                          <Car className="h-2.5 w-2.5" />
                                        </span>
                                      )}
                                      {candidate.hasVaccinationReport && (
                                        <span
                                          className="inline-flex items-center justify-center h-4 w-4 rounded-sm bg-emerald-500/15 border border-emerald-500/25 text-emerald-300"
                                          title={t("rowBadge.hasVaccinationReport")}
                                          aria-label={t("rowBadge.hasVaccinationReport")}
                                          data-testid={`icon-vaccination-report-${candidate.id}`}
                                        >
                                          <Syringe className="h-2.5 w-2.5" />
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          )}
                          {col("classification") && (
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`font-medium text-xs border-0 ${
                                  (candidate as any).classification === "smp"
                                    ? "bg-violet-500/10 text-violet-400"
                                    : "bg-blue-500/10 text-blue-400"
                                }`}
                                data-testid={`classification-${candidate.id}`}
                              >
                                {(candidate as any).classification === "smp" ? t("classification.smp") : t("classification.individual")}
                              </Badge>
                            </TableCell>
                          )}
                          {col("status") && (
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className={`font-medium border-0 text-xs ${statusStyles[displayStatus] ?? "bg-muted text-muted-foreground"}`}
                                  data-testid={`status-${candidate.id}`}
                                >
                                  {t(`statusLabel.${displayStatus}` as any, displayStatus.replace("_", " "))}
                                </Badge>
                                {/* Task #254 — sub-bucket reason chip,
                                    rendered immediately after the
                                    Archived badge so the admin can
                                    tell at a glance *why* the row
                                    landed in Archived. Tooltip carries
                                    the long-form explanation; the chip
                                    text itself stays terse. */}
                                {archivedReasonValue && (
                                  <Tooltip delayDuration={150}>
                                    <TooltipTrigger asChild>
                                      <span
                                        className="inline-flex items-center text-[10px] font-medium text-slate-200 bg-slate-500/15 border border-slate-500/30 px-1.5 py-0.5 rounded-sm cursor-default"
                                        data-testid={`chip-archived-reason-${candidate.id}`}
                                      >
                                        {t(`archivedReason.${archivedReasonValue}` as any)}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      align="start"
                                      sideOffset={6}
                                      collisionPadding={12}
                                      className="!z-[9999] max-w-xs rounded-md border border-border bg-popover px-3 py-2 text-[11px] text-muted-foreground shadow-lg leading-relaxed"
                                    >
                                      {t(`archivedReasonDesc.${archivedReasonValue}` as any)}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                {candidate.completedStints > 0 && displayStatus !== "hired" && (() => {
                                  const seasons = candidate.workforceSeasonCount || candidate.completedStints;
                                  return (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.5 rounded-sm"
                                      title={t("rowBadge.formerTitle", { count: seasons, n: formatNumber(seasons) })}
                                      data-testid={`badge-former-employee-${candidate.id}`}
                                    >
                                      <UserCheck className="h-2.5 w-2.5" />
                                      {t("rowBadge.formerEmployee", { count: seasons, n: formatNumber(seasons) })}
                                    </span>
                                  );
                                })()}
                                {candidate.unpaidSettlements > 0 && (
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 rounded-sm"
                                    title={t("rowBadge.unpaidSettlementTitle", { count: candidate.unpaidSettlements, n: formatNumber(candidate.unpaidSettlements) })}
                                    data-testid={`badge-unpaid-settlement-${candidate.id}`}
                                  >
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                    {t("rowBadge.unpaidSettlement")}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                          )}
                          {col("phone") && (
                            <TableCell>
                              <span className="text-sm text-muted-foreground font-mono" dir="ltr">
                                {candidate.phone || "—"}
                              </span>
                            </TableCell>
                          )}
                          {col("email") && (
                            <TableCell>
                              <span className="text-sm text-muted-foreground truncate max-w-[180px] block" dir="ltr">
                                {candidate.email || "—"}
                              </span>
                            </TableCell>
                          )}
                          {col("city") && (
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {candidate.city ? t(`profileSetup:cities.${candidate.city}` as any, candidate.city) : "—"}
                              </span>
                            </TableCell>
                          )}
                          {col("iban") && (
                            <TableCell>
                              <span className="text-xs text-muted-foreground font-mono whitespace-nowrap" dir="ltr">
                                {(candidate as any).ibanNumber || "—"}
                              </span>
                            </TableCell>
                          )}
                          {col("bank") && (
                            <TableCell>
                              <span className="text-sm text-muted-foreground whitespace-nowrap">
                                {(candidate as any).ibanBankName || "—"}
                              </span>
                            </TableCell>
                          )}
                          {col("emergency") && (
                            <TableCell>
                              {(candidate as any).emergencyContactPhone || (candidate as any).emergencyContactName ? (
                                <div className="flex flex-col leading-tight">
                                  {(candidate as any).emergencyContactName && (
                                    <span className="text-sm text-white truncate max-w-[160px]"><bdi>{(candidate as any).emergencyContactName}</bdi></span>
                                  )}
                                  {(candidate as any).emergencyContactPhone && (
                                    <span className="text-xs text-muted-foreground font-mono" dir="ltr">{(candidate as any).emergencyContactPhone}</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="text-end" onClick={e => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" data-testid={`button-actions-${candidate.id}`}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuItem
                                  onClick={() => setProfileCandidate(candidate)}
                                  data-testid={`menu-view-profile-${candidate.id}`}
                                >
                                  <UserCheck className="me-2 h-4 w-4" />
                                  {t("rowMenu.viewProfile")}
                                </DropdownMenuItem>
                                {(candidate as any).classification === "smp" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    {candidate.status === "awaiting_activation" && (
                                      <DropdownMenuItem
                                        onClick={() => smpReissueMutation.mutate([candidate.id])}
                                        data-testid={`menu-resend-activation-${candidate.id}`}
                                      >
                                        <Send className="me-2 h-4 w-4" />
                                        {t("rowMenu.resendActivation")}
                                      </DropdownMenuItem>
                                    )}
                                    {candidate.status !== "awaiting_activation" && (
                                      <DropdownMenuItem
                                        onClick={() => smpOnboardingMutation.mutate([candidate.id])}
                                        data-testid={`menu-send-onboarding-${candidate.id}`}
                                      >
                                        <UserPlus className="me-2 h-4 w-4" />
                                        {t("rowMenu.sendToOnboarding")}
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      onClick={() => setReclassifyConfirm({ id: candidate.id, name: candidate.fullNameEn })}
                                      data-testid={`menu-reclassify-individual-${candidate.id}`}
                                    >
                                      <Repeat className="me-2 h-4 w-4" />
                                      {t("rowMenu.reclassifyToIndividual")}
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {/* Task #107: individual → SMP is intentionally
                                    NOT a row action. The canonical path is the
                                    SMP bulk upload — `smp-commit` auto-flips
                                    matching NIDs and staples the company. A
                                    button here would let admins shortcut the
                                    company-stapling requirement. */}
                                {/* Task #254 — recovery actions exposed only
                                    on Archived rows whose sub-bucket reason
                                    has a 1-click remedy. The two paths are
                                    deliberately distinct:
                                      · missed_activation → reissue activation
                                        token (works for both SMP and any
                                        un-activated row with a phone)
                                      · inactive_one_year → re-engagement SMS
                                        (no token, just a portal nudge)
                                    Other reasons (incomplete_profile,
                                    manually_archived) intentionally have no
                                    row action — they need admin follow-up,
                                    not a one-click send. */}
                                {(archivedReasonValue === "missed_activation"
                                  || archivedReasonValue === "inactive_one_year") && (
                                  <DropdownMenuSeparator />
                                )}
                                {archivedReasonValue === "missed_activation" && (
                                  <DropdownMenuItem
                                    onClick={() => smpReissueMutation.mutate([candidate.id])}
                                    data-testid={`menu-resend-activation-archived-${candidate.id}`}
                                  >
                                    <Send className="me-2 h-4 w-4" />
                                    {t("rowMenu.resendActivation")}
                                  </DropdownMenuItem>
                                )}
                                {archivedReasonValue === "inactive_one_year" && (
                                  <DropdownMenuItem
                                    onClick={() => reEngagementSmsMutation.mutate([candidate.id])}
                                    data-testid={`menu-send-reengagement-${candidate.id}`}
                                  >
                                    <Send className="me-2 h-4 w-4" />
                                    {t("rowMenu.sendReengagement")}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (candidate.status === "blocked") {
                                      updateStatus.mutate({ id: candidate.id, status: "available" });
                                    } else {
                                      setBlockCandidate(candidate);
                                    }
                                  }}
                                  className={candidate.status === "blocked" ? "text-green-500" : "text-red-500"}
                                  data-testid={`menu-block-${candidate.id}`}
                                >
                                  <ShieldAlert className="me-2 h-4 w-4" />
                                  {candidate.status === "blocked" ? t("rowMenu.unblock") : t("rowMenu.block")}
                                </DropdownMenuItem>
                                {status === "archived" ? (
                                  <DropdownMenuItem
                                    onClick={() => restoreMutation.mutate(candidate.id)}
                                    className="text-green-500"
                                    data-testid={`menu-restore-${candidate.id}`}
                                  >
                                    <ArchiveRestore className="me-2 h-4 w-4" />
                                    {t("rowMenu.restore")}
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => setArchiveCandidate(candidate)}
                                    className="text-amber-500"
                                    data-testid={`menu-archive-${candidate.id}`}
                                  >
                                    <Archive className="me-2 h-4 w-4" />
                                    {t("rowMenu.archive")}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {t("list.showing", { from: formatNumber(((page - 1) * PAGE_SIZE) + 1), to: formatNumber(Math.min(page * PAGE_SIZE, total)), total: formatNumber(total) })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPage(1); }}
                  disabled={page === 1}
                  data-testid="button-first-page"
                  title={t("list.firstPage", { defaultValue: i18n.language === "ar" ? "الأولى" : "First" })}
                >
                  {i18n.language === "ar" ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPage(p => Math.max(1, p - 1)); }}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  {i18n.language === "ar" ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </Button>
                <span className="flex items-center text-xs text-muted-foreground px-2" dir="ltr">
                  {formatNumber(page)} / {formatNumber(totalPages)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPage(p => Math.min(totalPages, p + 1)); }}
                  disabled={page === totalPages}
                  data-testid="button-next-page"
                >
                  {i18n.language === "ar" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPage(totalPages); }}
                  disabled={page === totalPages}
                  data-testid="button-last-page"
                  title={t("list.lastPage", { defaultValue: i18n.language === "ar" ? "الأخيرة" : "Last" })}
                >
                  {i18n.language === "ar" ? <ChevronsLeft className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </Card>

        {selectedIds.size > 0 && (() => {
          const MAX_BULK = 500;
          const overLimit = selectedIds.size > MAX_BULK;
          const selectedCands = [...selectedIds]
            .map(id => candidateCacheRef.current.get(id))
            .filter((c): c is CandidateWithWorkforce => !!c);
          const allSmp = selectedCands.length > 0 && selectedCands.length === selectedIds.size && selectedCands.every(c => (c as any).classification === "smp");
          const awaitingActIds = selectedCands.filter(c => (c as any).classification === "smp" && c.status === "awaiting_activation").map(c => c.id);
          const onboardableIds = selectedCands.filter(c => (c as any).classification === "smp" && c.status !== "awaiting_activation").map(c => c.id);
          return (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-lg shadow-2xl px-5 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-4 duration-200 flex-wrap max-w-[95vw]" data-testid="bulk-action-bar">
            <span className="text-sm font-medium text-white">
              {t("bulkBar.selected", { n: formatNumber(selectedIds.size) })}
            </span>
            {overLimit && (
              <span className="text-xs text-amber-400 font-medium" data-testid="bulk-over-limit">
                {i18n.language === "ar"
                  ? `الحد الأقصى ${formatNumber(MAX_BULK)} لكل عملية`
                  : `Max ${formatNumber(MAX_BULK)} per action`}
              </span>
            )}
            <div className="h-5 w-px bg-border" />
            <Button
              size="sm"
              variant="outline"
              className="border-border text-muted-foreground hover:text-red-400 hover:border-red-400/50"
              onClick={() => setBulkConfirmAction("block")}
              disabled={overLimit}
              data-testid="bulk-block"
            >
              <Ban className="h-3.5 w-3.5 me-1.5" />
              {t("bulkBar.block")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-border text-muted-foreground hover:text-green-400 hover:border-green-400/50"
              onClick={() => setBulkConfirmAction("unblock")}
              disabled={overLimit}
              data-testid="bulk-unblock"
            >
              <Unlock className="h-3.5 w-3.5 me-1.5" />
              {t("bulkBar.unblock")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-border text-muted-foreground hover:text-orange-400 hover:border-orange-400/50"
              onClick={() => {
                if (selectedIds.size === 0) {
                  toast({ title: t("toast.bulkActionFailed"), variant: "destructive" });
                  return;
                }
                // Reuses the same code path as the top-bar "Export All"
                // so the workbook (headers, columns, sheet name, file
                // naming) is identical — just narrowed to the selected
                // candidate IDs.
                void handleExport([...selectedIds]);
              }}
              disabled={exporting}
              data-testid="bulk-export"
            >
              <Download className="h-3.5 w-3.5 me-1.5" />
              {t("bulkBar.export")}
            </Button>
            {status === "archived" ? (
              <Button
                size="sm"
                variant="outline"
                className="border-emerald-600 text-emerald-500 hover:bg-emerald-600/10"
                onClick={() => setBulkConfirmAction("unarchive")}
                disabled={overLimit}
                data-testid="bulk-unarchive"
              >
                <ArchiveRestore className="h-3.5 w-3.5 me-1.5" />
                {t("bulkBar.unarchive")}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="border-amber-600 text-amber-500 hover:bg-amber-600/10"
                onClick={() => setBulkConfirmAction("archive")}
                disabled={overLimit}
                data-testid="bulk-archive"
              >
                <Archive className="h-3.5 w-3.5 me-1.5" />
                {t("bulkBar.archive")}
              </Button>
            )}
            {allSmp && awaitingActIds.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="border-blue-600 text-blue-400 hover:bg-blue-600/10"
                onClick={() => smpReissueMutation.mutate(awaitingActIds)}
                disabled={smpReissueMutation.isPending || awaitingActIds.length > MAX_BULK}
                data-testid="bulk-resend-activation"
              >
                <Send className="h-3.5 w-3.5 me-1.5" />
                {t("bulkBar.resendActivation")}
              </Button>
            )}
            {allSmp && onboardableIds.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="border-emerald-600 text-emerald-400 hover:bg-emerald-600/10"
                onClick={() => smpOnboardingMutation.mutate(onboardableIds)}
                disabled={smpOnboardingMutation.isPending || onboardableIds.length > MAX_BULK}
                data-testid="bulk-send-onboarding"
              >
                <UserPlus className="h-3.5 w-3.5 me-1.5" />
                {t("bulkBar.sendToOnboarding")}
              </Button>
            )}
            <div className="h-5 w-px bg-border" />
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-white"
              onClick={() => setSelectedIds(new Set())}
              data-testid="bulk-deselect"
            >
              <X className="h-3.5 w-3.5 me-1.5" />
              {t("bulkBar.clear")}
            </Button>
          </div>
          );
        })()}
      </div>

      <AlertDialog open={!!bulkConfirmAction} onOpenChange={(o) => !o && setBulkConfirmAction(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-display">
              {bulkConfirmAction === "archive"
                ? t("bulkConfirm.titleArchive", { n: formatNumber(selectedIds.size) })
                : bulkConfirmAction === "unarchive"
                ? t("bulkConfirm.titleUnarchive", { n: formatNumber(selectedIds.size) })
                : bulkConfirmAction === "block"
                ? t("bulkConfirm.titleBlock", { n: formatNumber(selectedIds.size) })
                : t("bulkConfirm.titleUnblock", { n: formatNumber(selectedIds.size) })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {bulkConfirmAction === "archive"
                ? t("bulkConfirm.descArchive", { n: formatNumber(selectedIds.size) })
                : bulkConfirmAction === "unarchive"
                ? t("bulkConfirm.descUnarchive", { n: formatNumber(selectedIds.size) })
                : bulkConfirmAction === "block"
                ? t("bulkConfirm.descBlock", { n: formatNumber(selectedIds.size) })
                : t("bulkConfirm.descUnblock", { n: formatNumber(selectedIds.size) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border" data-testid="bulk-confirm-cancel">{t("bulkConfirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={
                bulkConfirmAction === "archive" ? "bg-amber-600 hover:bg-amber-700"
                : bulkConfirmAction === "block" ? "bg-red-600 hover:bg-red-700"
                : "bg-green-600 hover:bg-green-700"
              }
              onClick={() => bulkConfirmAction && bulkAction.mutate({ ids: [...selectedIds], action: bulkConfirmAction })}
              disabled={bulkAction.isPending}
              data-testid="bulk-confirm-action"
            >
              {bulkAction.isPending ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              {bulkConfirmAction === "archive" ? t("bulkConfirm.btnArchive")
                : bulkConfirmAction === "unarchive" ? t("bulkConfirm.btnUnarchive")
                : bulkConfirmAction === "block" ? t("bulkConfirm.btnBlock")
                : t("bulkConfirm.btnUnblock")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReclassifyConfirmDialog
        state={reclassifyConfirm}
        pending={reclassifyMutation.isPending}
        onCancel={() => setReclassifyConfirm(null)}
        onConfirm={(reason) => {
          if (!reclassifyConfirm) return;
          reclassifyMutation.mutate(
            { id: reclassifyConfirm.id, reason },
            { onSettled: () => setReclassifyConfirm(null) },
          );
        }}
      />

      <Dialog open={uploadOpen} onOpenChange={(v) => {
        setUploadOpen(v);
        if (!v) {
          setUploadFile(null);
          setUploadPreview(null);
          setUploadError(null);
          setSmpValidationResults(null);
          setSmpConfirmedClean(new Set()); setSmpConflictResolutions(new Map());
        }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("upload.title")}</DialogTitle>
            <DialogDescription>
              {t("upload.desc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 justify-start gap-2 h-10 border-dashed"
                onClick={() => downloadTemplate("xlsx")}
                data-testid="button-download-template-xlsx"
              >
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                {t("upload.tplXlsx")}
              </Button>
              <Button
                variant="outline"
                className="flex-1 justify-start gap-2 h-10 border-dashed"
                onClick={() => downloadTemplate("csv")}
                data-testid="button-download-template-csv"
              >
                <FileDown className="h-4 w-4 text-muted-foreground" />
                {t("upload.tplCsv")}
              </Button>
            </div>

            <div className="border border-dashed border-border rounded-sm p-6 text-center">
              {!uploadFile ? (
                <label className="cursor-pointer block">
                  <FileUp className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-1">{t("upload.drop")}</p>
                  <p className="text-xs text-muted-foreground/60">{t("upload.dropHint")}</p>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={handleFileSelect}
                    data-testid="input-upload-file"
                  />
                </label>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium text-white"><bdi>{uploadFile.name}</bdi></span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => { setUploadFile(null); setUploadPreview(null); setUploadError(null); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {uploadPreview && (
                    <p className="text-xs text-muted-foreground">
                      {t("upload.rowsDetected", { count: uploadPreview.length, n: formatNumber(uploadPreview.length) })}
                    </p>
                  )}
                </div>
              )}
            </div>

            {uploadPreview && uploadPreview.length > 0 && (
              <div className="border border-border rounded-sm overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 text-xs text-muted-foreground font-medium">
                  {t("upload.preview")}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {Object.keys(uploadPreview[0]).slice(0, 5).map(h => (
                          <th key={h} className="text-start px-2 py-1.5 text-muted-foreground font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uploadPreview.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-b border-border/50">
                          {Object.values(row).slice(0, 5).map((val, j) => (
                            <td key={j} className="px-2 py-1.5 text-white">{val || "—"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SMP Validation Results */}
            {uploadPreview && uploadPreview.some(r => (r.source || "").toLowerCase() === "smp") && (
              <div className="border border-amber-500/30 rounded-md p-3 bg-amber-500/5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-amber-400 flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {t("upload.smpHeader", { n: formatNumber(uploadPreview.filter(r => (r.source || "").toLowerCase() === "smp").length) })}
                  </p>
                  {!smpValidationResults && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-500/40 text-amber-400 text-xs h-7"
                      onClick={handleSmpValidate}
                      disabled={smpValidating}
                      data-testid="button-smp-validate"
                    >
                      {smpValidating ? <Loader2 className="h-3 w-3 animate-spin me-1" /> : null}
                      {t("upload.validateBtn")}
                    </Button>
                  )}
                </div>
                {!smpValidationResults && !smpValidating && (
                  <p className="text-xs text-muted-foreground">{t("upload.validateHint")}</p>
                )}
                {smpValidationResults && (
                  <div className="space-y-2 mt-2">
                    {/* NEW bucket */}
                    {smpValidationResults.filter(r => r.status === "new").length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-emerald-400 mb-1">
                          {t("upload.newHeader", { n: formatNumber(smpValidationResults.filter(r => r.status === "new").length) })}
                        </p>
                        <div className="space-y-1">
                          {smpValidationResults.filter(r => r.status === "new").map((result, i) => (
                            <div key={i} className="bg-emerald-500/10 border border-emerald-500/30 rounded p-2" data-testid={`smp-new-row-${i}`}>
                              <p className="text-xs text-emerald-300 font-medium">
                                <bdi>{result.row.fullNameEn || result.row.name || "—"}</bdi>{result.row.nationalId ? ` ${t("upload.idLabel", { id: result.row.nationalId })}` : ""}
                              </p>
                              {result.row.phone && <p className="text-xs text-muted-foreground">{t("upload.phoneLabel", { phone: result.row.phone })}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* PHONE_CONFLICT bucket */}
                    {smpValidationResults.filter(r => r.status === "phone_conflict").map((result, i) => {
                      const idx = smpValidationResults.indexOf(result);
                      const resolution = smpConflictResolutions.get(idx) ?? "skip";
                      const setRes = (v: "reclassify" | "transfer" | "skip") => {
                        setSmpConflictResolutions(prev => {
                          const next = new Map(prev);
                          next.set(idx, v);
                          return next;
                        });
                      };
                      return (
                        <div key={`pc-${i}`} className="bg-amber-500/10 border border-amber-500/30 rounded p-2 space-y-2" data-testid={`smp-phone-conflict-row-${i}`}>
                          <div>
                            <p className="text-xs font-semibold text-amber-400">
                              {String(t("upload.phoneConflict.header", {
                                defaultValue: "Phone {{phone}} already belongs to {{name}}",
                                phone: result.row.phone || "",
                                name: result.conflictCandidate?.fullNameEn || "",
                              } as any))}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {String(t("upload.phoneConflict.body", {
                                defaultValue: "Uploaded as {{newName}}{{idSuffix}}. Existing holder is {{existingType}} ({{existingStatus}}).",
                                newName: result.row.fullNameEn || result.row.name || "—",
                                idSuffix: result.row.nationalId ? ` · ${result.row.nationalId}` : "",
                                existingType: result.conflictCandidate?.classification === "smp"
                                  ? String(t("classification.smp", { defaultValue: "SMP" } as any))
                                  : String(t("classification.individual", { defaultValue: "Individual" } as any)),
                                existingStatus: result.conflictCandidate?.status || "—",
                              } as any))}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              size="sm"
                              variant={resolution === "reclassify" ? "default" : "outline"}
                              className={`text-xs h-6 ${resolution === "reclassify" ? "bg-blue-600 text-white" : "border-blue-500/40 text-blue-400"}`}
                              onClick={() => setRes("reclassify")}
                              data-testid={`button-pc-reclassify-${i}`}
                            >
                              {String(t("upload.phoneConflict.reclassify", { defaultValue: "Reclassify existing as SMP" } as any))}
                            </Button>
                            <Button
                              size="sm"
                              variant={resolution === "transfer" ? "default" : "outline"}
                              className={`text-xs h-6 ${resolution === "transfer" ? "bg-amber-600 text-white" : "border-amber-500/40 text-amber-400"}`}
                              onClick={() => setRes("transfer")}
                              data-testid={`button-pc-transfer-${i}`}
                            >
                              {String(t("upload.phoneConflict.transfer", { defaultValue: "Transfer phone to new SMP" } as any))}
                            </Button>
                            <Button
                              size="sm"
                              variant={resolution === "skip" ? "default" : "outline"}
                              className={`text-xs h-6 ${resolution === "skip" ? "bg-muted text-white" : "border-border text-muted-foreground"}`}
                              onClick={() => setRes("skip")}
                              data-testid={`button-pc-skip-${i}`}
                            >
                              {String(t("upload.phoneConflict.skip", { defaultValue: "Skip row" } as any))}
                            </Button>
                          </div>
                          {resolution === "transfer" && (
                            <p className="text-[11px] text-amber-400/80">
                              {String(t("upload.phoneConflict.transferWarn", {
                                defaultValue: "{{name}} will lose this phone number. Any pending activation links sent to it will be invalidated.",
                                name: result.conflictCandidate?.fullNameEn || "",
                              } as any))}
                            </p>
                          )}
                        </div>
                      );
                    })}

                    {/* CLEAN bucket */}
                    {smpValidationResults.filter(r => r.status === "clean").map((result, i) => {
                      const idx = smpValidationResults.indexOf(result);
                      const confirmed = smpConfirmedClean.has(idx);
                      return (
                        <div key={i} className="bg-blue-500/10 border border-blue-500/30 rounded p-2 flex items-start justify-between gap-2" data-testid={`smp-clean-row-${i}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-blue-400">{t("upload.cleanHeader")}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {t("upload.cleanDesc", { name: result.candidate?.fullNameEn, id: result.candidate?.nationalId || "—" })}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant={confirmed ? "default" : "outline"}
                            className={`text-xs h-6 shrink-0 ${confirmed ? "bg-blue-600 text-white" : "border-blue-500/40 text-blue-400"}`}
                            onClick={() => {
                              setSmpConfirmedClean(prev => {
                                const next = new Set(prev);
                                if (next.has(idx)) next.delete(idx); else next.add(idx);
                                return next;
                              });
                            }}
                            data-testid={`button-smp-confirm-clean-${i}`}
                          >
                            {confirmed ? t("upload.confirmed") : t("upload.confirm")}
                          </Button>
                        </div>
                      );
                    })}

                    {/* BLOCKED bucket */}
                    {smpValidationResults.filter(r => r.status === "blocked").map((result, i) => (
                      <div key={i} className="bg-red-500/10 border border-red-500/30 rounded p-2" data-testid={`smp-blocked-row-${i}`}>
                        <p className="text-xs font-semibold text-red-400">{t("upload.blockedHeader", { name: result.candidate?.fullNameEn, id: result.candidate?.nationalId || "—" })}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{result.blockedReason}</p>
                        <p className="text-xs text-red-400/60 mt-1">{t("upload.blockedHint")}</p>
                      </div>
                    ))}

                    {smpValidationResults.filter(r => r.status === "blocked").length === 0 && (
                      <p className="text-xs text-emerald-400 mt-1">{t("upload.noBlocked")}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {uploadError && (
              <p className="text-sm text-red-400">{uploadError}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setUploadOpen(false)}>
                {t("upload.cancel")}
              </Button>
              <Button
                className="bg-primary text-primary-foreground"
                disabled={
                  !uploadPreview ||
                  uploadPreview.length === 0 ||
                  bulkUpload.isPending ||
                  (uploadPreview.some(r => (r.source || "").toLowerCase() === "smp") && (
                    !smpValidationResults ||
                    smpValidationResults.some(r => r.status === "blocked") ||
                    smpValidationResults.filter(r => r.status === "clean").some((_, i) => {
                      const idx = smpValidationResults.indexOf(smpValidationResults.filter(r => r.status === "clean")[i]);
                      return !smpConfirmedClean.has(idx);
                    })
                  ))
                }
                onClick={() => uploadPreview && bulkUpload.mutate(uploadPreview)}
                data-testid="button-confirm-upload"
              >
                {bulkUpload.isPending ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    {t("upload.uploading")}
                  </>
                ) : (
                  <>
                    <Upload className="me-2 h-4 w-4" />
                    {t("upload.uploadCount", { count: uploadPreview?.length ?? 0, n: formatNumber(uploadPreview?.length ?? 0) })}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CandidateProfileSheet
        candidate={profileCandidate}
        onClose={() => setProfileCandidate(null)}
        onSaved={(updated) => {
          setProfileCandidate(updated);
          queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
        }}
      />

      <AlertDialog open={!!blockCandidate} onOpenChange={(o) => !o && setBlockCandidate(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-display">{t("block.title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("block.desc")}<span className="text-white font-medium"><bdi>{blockCandidate?.fullNameEn}</bdi></span>{t("block.descSuffix")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">{t("block.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (blockCandidate) {
                  updateStatus.mutate({ id: blockCandidate.id, status: "blocked" });
                  setBlockCandidate(null);
                }
              }}
              data-testid="confirm-block"
            >
              {t("block.btn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!archiveCandidate} onOpenChange={(o) => !o && setArchiveCandidate(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-display">{t("archive.title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("archive.desc")}<span className="text-white font-medium"><bdi>{archiveCandidate?.fullNameEn}</bdi></span>{t("archive.descSuffix")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">{t("archive.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                if (archiveCandidate) {
                  archiveMutation.mutate(archiveCandidate.id);
                  setArchiveCandidate(null);
                }
              }}
              data-testid="confirm-archive-candidate"
            >
              {t("archive.btn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
