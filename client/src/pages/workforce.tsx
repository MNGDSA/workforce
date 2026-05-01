import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { sanitizeSaMobileInput, normalizeSaMobileOnBlur, isValidSaMobile } from "@/lib/phone-input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout";
import { resolveSaudiBank, validateSaudiIban } from "@/lib/saudi-banks";
import { validateIbanHolderName } from "@/lib/iban-holder-name";
import { nationalityLabel } from "@/lib/i18n/nationalities";
import { printContract } from "@/lib/print-contract";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Users,
  UserX,
  Briefcase,
  Clock,
  Hash,
  DollarSign,
  Phone,
  CreditCard,
  Calendar,
  History,
  Eye,
  Loader2,
  AlertTriangle,
  XCircle,
  ChevronRight,
  ChevronLeft,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
  FileText,
  Printer,
  Upload,
  CheckCircle2,
  X,
  AlertCircle,
  Mail,
  MapPin,
  GraduationCap,
  Heart,
  Globe,
  User,
  Building,
  Building2,
  ShieldAlert,
  Languages,
  Pencil,
  Save,
  LogOut,
  Radio,
  Banknote,
  Landmark,
  Coins,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  renderIdCardHTML,
  sendPrintJob,
  type IdCardTemplateConfig,
  type EmployeeCardData,
  type PrinterPluginConfig,
} from "@/lib/id-card-renderer";
import { useTranslation } from "react-i18next";
import { formatNumber, formatDate as formatDateI18n } from "@/lib/format";

type Employee = {
  id: string;
  employeeNumber: string;
  candidateId: string;
  jobId: string | null;
  eventId: string | null;
  salary: string | null;
  startDate: string;
  endDate: string | null;
  terminationReason: string | null;
  terminationCategory: string | null;
  isActive: boolean;
  offboardingStatus: string | null;
  supervisorId: string | null;
  performanceScore: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  paymentMethodSetBy?: string | null;
  paymentMethodSetAt?: string | null;
  fullNameEn: string | null;
  nationalId: string | null;
  phone: string | null;
  photoUrl: string | null;
  candidateStatus: string | null;
  eventName: string | null;
  jobTitle: string | null;
  iban?: string | null;
  ibanBankName?: string | null;
  ibanBankCode?: string | null;
  employmentType?: string | null;
  smpCompanyId?: string | null;
  smpCompanyName?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  nationalityText?: string | null;
  maritalStatus?: string | null;
  city?: string | null;
  region?: string | null;
  iqamaNumber?: string | null;
  educationLevel?: string | null;
  university?: string | null;
  major?: string | null;
  skills?: string[] | null;
  languages?: string[] | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  ibanAccountFirstName?: string | null;
  ibanAccountLastName?: string | null;
  positionId?: string | null;
  positionTitle?: string | null;
  positionIsActive?: boolean | null;
  paymentMethod?: string | null;
  paymentMethodReason?: string | null;
};

type WorkHistory = {
  id: string;
  employeeNumber: string;
  salary: string | null;
  startDate: string;
  endDate: string | null;
  terminationReason: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  eventName: string | null;
  jobTitle: string | null;
};

type SortField = "employeeNumber" | "fullNameEn" | "nationalId" | "salary" | "startDate" | "endDate" | "phone";
type SortDir = "asc" | "desc";

function useStatusBadge() {
  const { t } = useTranslation("workforce");
  return (isActive: boolean, offboardingStatus?: string | null) => {
    if (offboardingStatus === "in_progress") {
      return { label: t("status.inOffboarding"), className: "bg-amber-500/10 text-amber-400 border-amber-500/30" };
    }
    return isActive
      ? { label: t("status.active"), className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" }
      : { label: t("status.terminated"), className: "bg-red-500/10 text-red-400 border-red-500/30" };
  };
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return formatDateI18n(iso, "en", { month: "short", day: "numeric", year: "numeric" });
}

// Task #192 — exports now take a translator so the column headers and
// the Active/Terminated status string match the user's chosen language.
// Previously the CSV/Excel were hardcoded English even when the rest of
// the back-office was running in Arabic, which made the report unusable
// for Arabic-speaking admins.
type ExportT = (key: string, opts?: any) => string;

function exportToCSV(employees: Employee[], t: ExportT) {
  // Task #187 — replaced the dummy free-text "Job Title" column with the
  // canonical Position assignment so exports match what the dialog shows.
  const headers = [
    t("export.col.employeeNumber"),
    t("export.col.fullName"),
    t("export.col.nationalId"),
    t("export.col.phone"),
    t("export.col.position"),
    t("export.col.event"),
    t("export.col.salary"),
    t("export.col.iban"),
    t("export.col.bankName"),
    t("export.col.bankCode"),
    t("export.col.startDate"),
    t("export.col.endDate"),
    t("export.col.status"),
    t("export.col.terminationReason"),
  ];
  const rows = employees.map(e => [
    e.employeeNumber,
    e.fullNameEn ?? "",
    e.nationalId ?? "",
    e.phone ?? "",
    e.positionTitle ?? "",
    e.eventName ?? "",
    e.salary ? Number(e.salary).toString() : "",
    e.iban ?? "",
    e.ibanBankName ?? "",
    e.ibanBankCode ?? "",
    e.startDate ?? "",
    e.endDate ?? "",
    e.isActive ? t("status.active") : t("status.terminated"),
    e.terminationReason ?? "",
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${(c ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `employees_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportToExcel(employees: Employee[], t: ExportT) {
  const XLSX = await import("xlsx");
  // Use the same translation keys as the CSV path so a workbook opened in
  // Excel matches the on-screen language and the CSV report column-for-column.
  const data = employees.map(e => ({
    [t("export.col.employeeNumber")]: e.employeeNumber,
    [t("export.col.fullName")]: e.fullNameEn ?? "",
    [t("export.col.nationalId")]: e.nationalId ?? "",
    [t("export.col.phone")]: e.phone ?? "",
    // Task #187 — see exportToCSV note above.
    [t("export.col.position")]: e.positionTitle ?? "",
    [t("export.col.event")]: e.eventName ?? "",
    [t("export.col.salary")]: e.salary ? Number(e.salary) : "",
    [t("export.col.iban")]: e.iban ?? "",
    [t("export.col.bankName")]: e.ibanBankName ?? "",
    [t("export.col.bankCode")]: e.ibanBankCode ?? "",
    [t("export.col.startDate")]: e.startDate ?? "",
    [t("export.col.endDate")]: e.endDate ?? "",
    [t("export.col.status")]: e.isActive ? t("status.active") : t("status.terminated"),
    [t("export.col.terminationReason")]: e.terminationReason ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  XLSX.writeFile(wb, `employees_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function SortableHeader({ label, field, sortField, sortDir, onSort }: {
  label: string; field: SortField; sortField: SortField | null; sortDir: SortDir; onSort: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <button
      className="flex items-center gap-1 hover:text-white transition-colors text-start"
      onClick={() => onSort(field)}
      data-testid={`sort-${field}`}
    >
      {label}
      {active ? (
        sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

type ScheduleTemplateWithDays = { id: string; name: string; mondayShiftId?: string | null; tuesdayShiftId?: string | null; wednesdayShiftId?: string | null; thursdayShiftId?: string | null; fridayShiftId?: string | null; saturdayShiftId?: string | null; sundayShiftId?: string | null };
type ShiftBasic = { id: string; name: string; color: string; startTime: string; endTime: string };

function ActiveAssignmentCard({
  activeAssignment,
  scheduleTemplates,
  allShifts,
  endAssignmentMutation,
  formatDate,
}: {
  activeAssignment: { id: string; templateId: string; startDate: string };
  scheduleTemplates: ScheduleTemplateWithDays[];
  allShifts: ShiftBasic[];
  endAssignmentMutation: { isPending: boolean; mutate: (id: string) => void };
  formatDate: (d: string) => string;
}) {
  const { t } = useTranslation("workforce");
  const template = scheduleTemplates.find(t => t.id === activeAssignment.templateId);
  const DAY_KEYS = ["sundayShiftId", "mondayShiftId", "tuesdayShiftId", "wednesdayShiftId", "thursdayShiftId", "fridayShiftId", "saturdayShiftId"] as const;
  const todayKey = DAY_KEYS[new Date().getDay()] as keyof ScheduleTemplateWithDays;
  const todayShiftId = template ? (template[todayKey] as string | null | undefined) : undefined;
  const todayShift = todayShiftId ? allShifts.find(s => s.id === todayShiftId) : undefined;
  return (
    <div className="border border-emerald-800/50 bg-emerald-950/10 rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-white text-sm"><bdi>{template?.name ?? t("dialog.schedule.unknownTemplate")}</bdi></p>
          <p className="text-xs text-zinc-400 mt-0.5">{t("dialog.schedule.since", { date: formatDate(activeAssignment.startDate) })}</p>
          {todayShift ? (
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: todayShift.color }} />
              <span className="text-xs text-zinc-300">
                {t("dialog.schedule.todayShift")}: <span className="font-medium text-white"><bdi>{todayShift.name}</bdi></span>
                <span className="text-zinc-500 ms-1" dir="ltr">({todayShift.startTime}–{todayShift.endTime})</span>
              </span>
            </div>
          ) : template ? (
            <p className="text-xs text-zinc-500 mt-1">{t("dialog.schedule.todayDayOff")}</p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-red-400 hover:text-red-300"
          disabled={endAssignmentMutation.isPending}
          onClick={() => endAssignmentMutation.mutate(activeAssignment.id)}
          data-testid="button-end-schedule-assignment"
        >
          {endAssignmentMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("dialog.schedule.remove")}
        </Button>
      </div>
    </div>
  );
}

function EmployeeDetailDialog({
  employee,
  open,
  onOpenChange,
  onUpdated,
  onPrintCard,
  onEmployeeRefreshed,
}: {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpdated: () => void;
  onPrintCard?: (emp: Employee) => void;
  onEmployeeRefreshed?: (emp: Employee) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { t, i18n } = useTranslation("workforce");
  const statusBadge = useStatusBadge();
  const [tab, setTab] = useState<"details" | "history" | "schedule">("details");
  const [editSalary, setEditSalary] = useState(false);
  const [salaryValue, setSalaryValue] = useState("");
  const [notesValue, setNotesValue] = useState("");
  const [editNotes, setEditNotes] = useState(false);
  const [editEvent, setEditEvent] = useState(false);
  const [eventValue, setEventValue] = useState("");
  const [editPosition, setEditPosition] = useState(false);
  const [positionValue, setPositionValue] = useState("");
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [terminateForm, setTerminateForm] = useState({ endDate: "", reason: "", category: "" });
  const [reinstateOpen, setReinstateOpen] = useState(false);
  const [reinstateForm, setReinstateForm] = useState({ startDate: "", eventId: "", salary: "", smpCompanyId: "" });
  const [assignScheduleOpen, setAssignScheduleOpen] = useState(false);
  const [scheduleTemplateId, setScheduleTemplateId] = useState("");
  const [scheduleStartDate, setScheduleStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [scheduleEndDate, setScheduleEndDate] = useState("");

  const [editPersonal, setEditPersonal] = useState(false);
  const [personalForm, setPersonalForm] = useState<Record<string, string>>({});
  const [editFinancial, setEditFinancial] = useState(false);
  const [financialForm, setFinancialForm] = useState<Record<string, string>>({});
  const [editEmergency, setEditEmergency] = useState(false);
  const [emergencyForm, setEmergencyForm] = useState<Record<string, string>>({});
  const [editEducation, setEditEducation] = useState(false);
  const [educationForm, setEducationForm] = useState<Record<string, string>>({});

  // Task #187 — inline header editing.
  // `editName` toggles a 1-line input next to the displayed name; the
  // submit hits PATCH /api/candidates/:id (NOT the workforce PATCH —
  // workforce records carry a *snapshot* of the name only, the actual
  // record lives on the candidate row keyed by `candidateId`).
  // `photoFileRef` triggers an admin-only direct photo replace that
  // skips the inbox queue but still runs the same Rekognition pipeline
  // candidates use on the portal — see /api/admin/candidates/:id/photo.
  const [editName, setEditName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const photoFileRef = useRef<HTMLInputElement | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  // Click on the avatar opens a lightbox with the full-size image so admins
  // can actually see what got uploaded; the lightbox carries its own
  // "Change Photo" action so the edit affordance is preserved without
  // forcing the avatar itself to be a dual-purpose target.
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  // The component stays mounted across employee selections (parent passes a
  // new `employee` prop; we only return null when there's none). Without an
  // explicit reset, transient per-employee UI state from employee A leaks
  // into employee B's view — e.g. the inline name editor stays open
  // showing A's name (which then overwrites B's name on save), the photo
  // lightbox re-opens over B's avatar, or a half-filled section editor
  // (salary/notes/personal/etc.) stays expanded with A's draft values. Tie
  // every piece of transient selection-scoped state to the current
  // employee id and the parent open flag so it auto-resets on either
  // change.
  useEffect(() => {
    setPhotoPreviewOpen(false);
    setEditName(false);
    setNameValue("");
    setEditSalary(false);
    setSalaryValue("");
    setEditNotes(false);
    setNotesValue("");
    setEditEvent(false);
    setEventValue("");
    setEditPosition(false);
    setPositionValue("");
    setEditPersonal(false);
    setPersonalForm({});
    setEditFinancial(false);
    setFinancialForm({});
    setEditEmergency(false);
    setEmergencyForm({});
    setEditEducation(false);
    setEducationForm({});
    setPhotoUploading(false);
    if (photoFileRef.current) photoFileRef.current.value = "";
  }, [employee?.id, open]);

  const { data: history = [], isLoading: historyLoading } = useQuery<WorkHistory[]>({
    queryKey: ["/api/workforce/history", employee?.nationalId],
    queryFn: () => apiRequest("GET", `/api/workforce/history/${employee!.nationalId}`).then(r => r.json()),
    enabled: open && !!employee?.nationalId && tab === "history",
  });

  const { data: contractHistory = [] } = useQuery<any[]>({
    queryKey: ["/api/candidates/contract-history", employee?.candidateId],
    queryFn: () => apiRequest("GET", `/api/candidates/${employee!.candidateId}/contract-history`).then(r => r.json()),
    enabled: open && !!employee?.candidateId && tab === "history",
  });

  const [viewingAdminContract, setViewingAdminContract] = useState<any | null>(null);

  useEffect(() => {
    if (!open) setViewingAdminContract(null);
  }, [open]);

  const adminContractMap = useMemo(() => {
    const map = new Map<string, any>();
    if (contractHistory.length === 0 || history.length === 0) return map;
    const used = new Set<string>();
    const sorted = [...history].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    for (const rec of sorted) {
      const recCreated = new Date(rec.createdAt ?? rec.startDate).getTime();
      let best: any = undefined;
      let bestScore = -1;
      for (const c of contractHistory) {
        if (c.onboardingStatus !== "converted" || used.has(c.id)) continue;
        const convertedAt = c.onboardingConvertedAt ? new Date(c.onboardingConvertedAt).getTime() : 0;
        const timeDiff = Math.abs(convertedAt - recCreated);
        if (timeDiff > 7 * 24 * 60 * 60 * 1000) continue;
        let score = 1000 - Math.min(timeDiff / (24 * 60 * 60 * 1000), 7);
        if (c.eventName && rec.eventName && c.eventName === rec.eventName) score += 500;
        if (c.jobTitle && rec.jobTitle && c.jobTitle === rec.jobTitle) score += 300;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (best) { map.set(rec.id, best); used.add(best.id); }
    }
    return map;
  }, [contractHistory, history]);

  const { data: eventsList = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/events"],
    queryFn: () => apiRequest("GET", "/api/events").then(r => r.json()),
    enabled: open,
  });

  const { data: positionsList = [] } = useQuery<{ id: string; title: string; departmentId: string; departmentName?: string | null; isActive: boolean }[]>({
    queryKey: ["/api/positions"],
    queryFn: () => apiRequest("GET", "/api/positions").then(r => r.json()),
    enabled: open,
  });

  const { data: scheduleTemplates = [] } = useQuery<ScheduleTemplateWithDays[]>({
    queryKey: ["/api/schedule-templates"],
    queryFn: () => apiRequest("GET", "/api/schedule-templates").then(r => r.json()),
    enabled: open && tab === "schedule",
  });

  const { data: allShifts = [] } = useQuery<ShiftBasic[]>({
    queryKey: ["/api/shifts"],
    queryFn: () => apiRequest("GET", "/api/shifts").then(r => r.json()),
    enabled: open && tab === "schedule",
  });

  const { data: activeAssignment, refetch: refetchAssignment } = useQuery<{
    id: string; templateId: string; startDate: string; endDate: string | null; notes: string | null;
  } | null>({
    queryKey: ["/api/schedule-assignments/employee", employee?.id, "active"],
    queryFn: () => apiRequest("GET", `/api/schedule-assignments/employee/${employee!.id}/active`).then(r => r.json()),
    enabled: open && !!employee?.id && tab === "schedule",
  });

  const { data: assignmentHistory = [] } = useQuery<{ id: string; templateId: string; startDate: string; endDate: string | null }[]>({
    queryKey: ["/api/schedule-assignments/employee", employee?.id],
    queryFn: () => apiRequest("GET", `/api/schedule-assignments/employee/${employee!.id}`).then(r => r.json()),
    enabled: open && !!employee?.id && tab === "schedule",
  });

  const assignScheduleMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/schedule-assignments", {
      workforceId: employee!.id,
      templateId: scheduleTemplateId,
      startDate: scheduleStartDate,
      endDate: scheduleEndDate || null,
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/schedule-assignments/employee", employee?.id] });
      refetchAssignment();
      setAssignScheduleOpen(false);
      toast({ title: t("toast.scheduleAssigned") });
    },
    onError: (e: Error) => toast({ title: t("toast.error"), description: e.message, variant: "destructive" }),
  });

  const endAssignmentMutation = useMutation({
    mutationFn: (assignId: string) => apiRequest("POST", `/api/schedule-assignments/${assignId}/end`, {
      endDate: new Date().toISOString().slice(0, 10),
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/schedule-assignments/employee", employee?.id] });
      refetchAssignment();
      toast({ title: t("toast.scheduleEnded") });
    },
    onError: (e: Error) => toast({ title: t("toast.error"), description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiRequest("PATCH", `/api/workforce/${employee!.id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      setEditSalary(false);
      setEditNotes(false);
      setEditPosition(false);
      onUpdated();
      toast({ title: t("toast.employeeUpdated") });
    },
    onError: (e: Error) => toast({ title: t("toast.error"), description: e.message, variant: "destructive" }),
  });

  // Task #187 — name edits go to the candidate row (not workforce). The
  // server's `fullNameEnSchema` will trim and case-validate; we surface
  // any 4xx as a generic toast since the constraints are documented in
  // the i18n placeholder/help text.
  const nameMutation = useMutation({
    mutationFn: async (newName: string) => {
      const res = await fetch(`/api/candidates/${employee!.candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullNameEn: newName }),
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try { message = JSON.parse(text).message ?? message; } catch {}
        throw new Error(message || `${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      setEditName(false);
      onUpdated();
      toast({ title: t("toast.nameUpdated") });
    },
    onError: (e: Error) => toast({ title: t("toast.error"), description: e.message, variant: "destructive" }),
  });

  // Task #187 — admin direct photo replace. Mirrors the candidate
  // portal upload contract (multipart `file` field) so backend errors
  // (Rekognition 422 / service-down 503 / format 400) come back with
  // the same shape the portal handles.
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
      const res = await fetch(`/api/admin/candidates/${employee!.candidateId}/photo`, {
        method: "POST",
        body: fd,
        credentials: "include",
        headers: { "Accept-Language": i18n.language || "ar" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err: any = new Error(body.message || `Upload failed (${res.status})`);
        err.status = res.status;
        err.qualityResult = body.qualityResult;
        throw err;
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      onUpdated();
      toast({ title: t("toast.photoReplaced") });
      setPhotoUploading(false);
      if (photoFileRef.current) photoFileRef.current.value = "";
    },
    onError: (e: any) => {
      // Rekognition reject envelope includes per-check tips; surface the
      // top-level message for the admin and rely on the candidate's
      // detail view if they want the granular check breakdown.
      toast({ title: t("toast.photoReplaceFailed"), description: e.message, variant: "destructive" });
      setPhotoUploading(false);
      if (photoFileRef.current) photoFileRef.current.value = "";
    },
  });

  const profileMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiRequest("PATCH", `/api/workforce/${employee!.id}/candidate-profile`, data).then(r => r.json()),
    onSuccess: (updatedEmployee: Employee) => {
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      setEditPersonal(false);
      setEditFinancial(false);
      setEditEmergency(false);
      setEditEducation(false);
      if (onEmployeeRefreshed) onEmployeeRefreshed(updatedEmployee);
      toast({ title: t("toast.profileUpdated") });
    },
    onError: (e: Error) => toast({ title: t("toast.error"), description: e.message, variant: "destructive" }),
  });

  const terminateMutation = useMutation({
    mutationFn: (data: { endDate: string; terminationReason?: string; terminationCategory?: string }) =>
      apiRequest("POST", `/api/workforce/${employee!.id}/terminate`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      qc.invalidateQueries({ queryKey: ["/api/offboarding"] });
      qc.invalidateQueries({ queryKey: ["/api/offboarding/stats"] });
      setTerminateOpen(false);
      setTerminateForm({ endDate: "", reason: "", category: "" });
      onOpenChange(false);
      onUpdated();
      toast({ title: t("toast.sentToOffboarding") });
    },
    onError: (e: Error) => toast({ title: t("toast.error"), description: e.message, variant: "destructive" }),
  });

  const { data: smpCompanies = [] } = useQuery<{ id: string; name: string; isActive: boolean }[]>({
    queryKey: ["/api/smp-companies"],
    queryFn: () => apiRequest("GET", "/api/smp-companies").then(r => r.json()),
    select: (data: { id: string; name: string; isActive: boolean }[]) => data.filter(c => c.isActive),
    enabled: open,
  });

  const reinstateMutation = useMutation({
    mutationFn: (data: { nationalId: string; startDate: string; eventId?: string; salary?: string; smpCompanyId?: string; employmentType?: string }) =>
      apiRequest("POST", "/api/workforce/reinstate", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      setReinstateOpen(false);
      setReinstateForm({ startDate: "", eventId: "", salary: "", smpCompanyId: "" });
      onOpenChange(false);
      onUpdated();
      toast({ title: t("toast.reinstated") });
    },
    onError: (e: Error) => toast({ title: t("toast.error"), description: e.message, variant: "destructive" }),
  });

  if (!employee) return null;

  const st = statusBadge(employee.isActive, employee.offboardingStatus);
  const initials = (employee.fullNameEn ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800 text-white max-h-[90vh] overflow-y-auto">
          {viewingAdminContract && (
            <div data-testid="admin-contract-history-viewer">
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setViewingAdminContract(null)}
                  className="text-zinc-400 hover:text-white transition-colors"
                  data-testid="button-back-from-contract"
                >
                  {/* RTL: chevron should point right (toward where you came from) */}
                  <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
                </button>
                <div>
                  <h3 className="text-base font-semibold text-white">{t("dialog.employmentContract")}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {viewingAdminContract.jobTitle && <span><bdi>{viewingAdminContract.jobTitle}</bdi></span>}
                    {viewingAdminContract.jobTitle && viewingAdminContract.eventName && " — "}
                    {viewingAdminContract.eventName && <span><bdi>{viewingAdminContract.eventName}</bdi></span>}
                    {viewingAdminContract.signedAt && (
                      <span className="ms-2 text-emerald-400">
                        {t("dialog.signed", { date: formatDateI18n(viewingAdminContract.signedAt, "en", { day: "numeric", month: "long", year: "numeric" }) })}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {/* Mirror the signing-time contract template (same .contract-print-area
                  wrapper + Cairo fonts) so the in-dialog preview AND the
                  Print/Download output look identical to what the candidate
                  signed — no more plain-text fallback PDF. */}
              {(() => {
                const articles = Array.isArray(viewingAdminContract.snapshotArticles) ? viewingAdminContract.snapshotArticles : [];
                const vars: Record<string, string> = viewingAdminContract.snapshotVariables ?? {};
                const replaceVars = (s: string) =>
                  Object.entries(vars).reduce(
                    (acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v ?? "")),
                    s ?? ""
                  );
                const signedAt = viewingAdminContract.signedAt;
                const employeeName = vars.fullName || employee.fullNameEn || t("onboarding:contract.defaultName");
                return (
                  <div
                    className="contract-print-area mt-2 bg-white text-black rounded-lg p-8 space-y-6"
                    style={{ fontFamily: "'Cairo', system-ui, -apple-system, 'Segoe UI', sans-serif" }}
                    data-testid="admin-contract-print-area"
                  >
                    {articles.map((article: any, idx: number) => (
                      <div key={idx}>
                        <h3 className="font-bold text-sm mb-1">
                          {t("onboarding:contract.articlePrefix", { n: formatNumber(idx + 1), title: String(article.title || "").replace(/\{\{title\}\}\s*:?\s*/g, "").trim() })}
                        </h3>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{replaceVars(article.body || "")}</p>
                        {Array.isArray(article.subArticles) && article.subArticles.map((sub: any, subIdx: number) => (
                          <div key={subIdx} className="ms-6 mt-2">
                            <h4 className="font-bold text-sm mb-0.5">
                              {formatNumber(idx + 1)}.{formatNumber(subIdx + 1)} {sub.title}
                            </h4>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{replaceVars(sub.body || "")}</p>
                          </div>
                        ))}
                      </div>
                    ))}
                    <div className="border-t pt-6 mt-8">
                      <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-2">
                          <p className="text-sm font-bold">{t("onboarding:contract.firstParty")}</p>
                          <p className="text-xs text-gray-600"><bdi>{vars.companyName || t("onboarding:contract.defaultCompany")}</bdi></p>
                          <div className="border-b border-gray-400 mt-8 pt-6"></div>
                          <p className="text-xs text-gray-500">{t("onboarding:contract.authorizedSignature")}</p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm font-bold">{t("onboarding:contract.secondParty")}</p>
                          <p className="text-xs text-gray-600"><bdi>{employeeName}</bdi></p>
                          {signedAt ? (
                            <div className="mt-4 pt-2 text-center">
                              <div className="inline-block border-2 border-emerald-600 rounded-md px-4 py-2">
                                <p className="text-xs font-bold text-emerald-700">{t("onboarding:contract.digitallySigned")}</p>
                                <p className="text-[10px] text-gray-500 mt-0.5" dir="ltr">
                                  {t("onboarding:contract.digitallySignedAt", {
                                    date: formatDateI18n(signedAt, i18n.language, { day: "numeric", month: "long", year: "numeric" }),
                                    time: new Intl.DateTimeFormat("en-GB", { numberingSystem: "latn", hour: "2-digit", minute: "2-digit" }).format(new Date(signedAt)),
                                  })}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="border-b border-gray-400 mt-8 pt-6"></div>
                              <p className="text-xs text-gray-500">{t("onboarding:contract.employeeSignature")}</p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="mt-6 text-center">
                        <p className="text-xs text-gray-500" dir="ltr">
                          {t("onboarding:contract.dateLabel", {
                            date: signedAt
                              ? formatDateI18n(signedAt, i18n.language, { day: "numeric", month: "long", year: "numeric" })
                              : t("onboarding:contract.dateBlank"),
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div className="flex justify-end mt-4 no-print">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-zinc-700 gap-1.5"
                  onClick={() => printContract(t("dialog.employmentContract"))}
                  data-testid="button-print-admin-contract"
                >
                  <Printer className="h-3.5 w-3.5" />
                  {t("dialog.printDownload")}
                </Button>
              </div>
            </div>
          )}
          {!viewingAdminContract && (
          <>
          <DialogHeader>
            {/* pe-10 reserves space at the inline-end edge so the inline
                name-edit Cancel button never sits behind the sheet's
                top-corner close X (which is top-left in RTL, top-right
                in LTR). */}
            <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-3 pe-10">
              {/* Task #187 — Avatar is now a click-to-preview target.
                  Clicking it opens a lightbox at the natural image
                  size (capped to 80vh / 90vw). The lightbox carries
                  the "Change Photo" action so the edit affordance is
                  preserved. If there is no photo yet, the click falls
                  through to the file picker so admins can upload the
                  first one without an empty preview step.
                  The hidden file input is gated by `workforce:update`
                  on the server; only image/jpeg + image/png are
                  accepted. We disable the trigger while a request is
                  in-flight so admins don't queue duplicate uploads. */}
              <div className="relative group shrink-0">
                <Avatar className="h-10 w-10 border border-zinc-700">
                  <AvatarImage src={employee.photoUrl ?? undefined} />
                  <AvatarFallback className="bg-zinc-800 text-zinc-300 text-sm font-bold">{initials}</AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  className="absolute inset-0 rounded-full bg-black/0 hover:bg-black/60 transition-colors flex items-center justify-center text-white opacity-0 group-hover:opacity-100 disabled:cursor-not-allowed"
                  disabled={photoUploading}
                  onClick={() => {
                    if (employee.photoUrl) setPhotoPreviewOpen(true);
                    else photoFileRef.current?.click();
                  }}
                  title={employee.photoUrl ? t("dialog.photo.viewPhoto") : t("dialog.photo.changePhoto")}
                  aria-label={employee.photoUrl ? t("dialog.photo.viewPhoto") : t("dialog.photo.changePhoto")}
                  data-testid="button-view-photo"
                >
                  {photoUploading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Pencil className="h-3.5 w-3.5" />}
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
                    {/* Inline name editor — pressing Enter saves, Escape
                        cancels. Constrained to 120 chars to align with
                        the database column + Excel export width. */}
                    <Input
                      autoFocus
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && nameValue.trim().length > 0) nameMutation.mutate(nameValue.trim());
                        if (e.key === "Escape") { setEditName(false); setNameValue(""); }
                      }}
                      placeholder={t("dialog.name.placeholder")}
                      maxLength={120}
                      className="h-8 bg-zinc-900 border-zinc-700 text-white text-sm flex-1 min-w-0"
                      data-testid="input-edit-name"
                    />
                    <Button
                      size="sm"
                      className="h-8 bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white shrink-0"
                      disabled={nameMutation.isPending || nameValue.trim().length === 0}
                      onClick={() => nameMutation.mutate(nameValue.trim())}
                      data-testid="button-save-name"
                    >
                      {nameMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t("dialog.actions.save")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-zinc-700 shrink-0"
                      onClick={() => { setEditName(false); setNameValue(""); }}
                      data-testid="button-cancel-name"
                    >
                      {t("dialog.actions.cancel")}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <bdi className="truncate">{employee.fullNameEn ?? t("dialog.unknownEmployee")}</bdi>
                      <Badge variant="outline" className={`text-[10px] font-mono ${st.className}`}>{st.label}</Badge>
                      <button
                        type="button"
                        className="text-zinc-500 hover:text-white transition-colors p-1 -m-1"
                        onClick={() => { setNameValue(employee.fullNameEn ?? ""); setEditName(true); }}
                        title={t("dialog.name.edit")}
                        aria-label={t("dialog.name.edit")}
                        data-testid="button-edit-name"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                    {/* Task #187 — Employee number is locked. We surface
                        a tooltip on the badge so an admin who clicks
                        expecting an editor sees *why* it can't change. */}
                    <div className="text-xs text-zinc-500 font-mono font-normal" dir="ltr" title={t("dialog.empNumberLocked")}>{employee.employeeNumber}</div>
                  </>
                )}
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">{t("dialog.infoSheetSr")}</DialogDescription>
          </DialogHeader>

          <div className="flex rounded-md overflow-hidden border border-zinc-800 bg-zinc-900/50 mt-2">
            <button
              onClick={() => setTab("details")}
              className={`flex-1 text-xs font-semibold py-2.5 transition-colors flex items-center justify-center gap-1.5 ${
                tab === "details" ? "bg-[hsl(155,45%,45%)] text-white" : "text-zinc-400 hover:text-white"
              }`}
              data-testid="tab-employee-details"
            >
              <Eye className="h-3.5 w-3.5" /> {t("dialog.details")}
            </button>
            <button
              onClick={() => setTab("history")}
              className={`flex-1 text-xs font-semibold py-2.5 transition-colors flex items-center justify-center gap-1.5 ${
                tab === "history" ? "bg-[hsl(155,45%,45%)] text-white" : "text-zinc-400 hover:text-white"
              }`}
              data-testid="tab-employee-history"
            >
              <History className="h-3.5 w-3.5" /> {t("dialog.workHistory")}
            </button>
            <button
              onClick={() => setTab("schedule")}
              className={`flex-1 text-xs font-semibold py-2.5 transition-colors flex items-center justify-center gap-1.5 ${
                tab === "schedule" ? "bg-[hsl(155,45%,45%)] text-white" : "text-zinc-400 hover:text-white"
              }`}
              data-testid="tab-employee-schedule"
            >
              <Clock className="h-3.5 w-3.5" /> {t("dialog.schedule.tab")}
            </button>
          </div>

          {tab === "details" && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <InfoRow icon={<Hash className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.empNumber")} value={employee.employeeNumber} mono />
                <InfoRow icon={<CreditCard className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.nationalId")} value={employee.nationalId ?? "—"} mono />
                <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.phone")} value={employee.phone ?? "—"} />
                {/* Task #187 — the dummy free-text "Job Title" InfoRow used
                    to live here; the canonical Position picker (next
                    sibling) is now the single source of truth. */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 text-xs flex items-center gap-1"><Building2 className="h-3 w-3" /> {t("dialog.infoLabels.position")}</span>
                    {employee.isActive && !editPosition && (
                      <Button variant="ghost" size="sm" className="h-5 text-[11px] text-primary px-1" onClick={() => { setEditPosition(true); setPositionValue(employee.positionId ?? ""); }}>
                        {employee.positionId ? t("dialog.actions.change") : t("dialog.actions.assign")}
                      </Button>
                    )}
                  </div>
                  {editPosition ? (
                    <div className="flex gap-2">
                      <Select value={positionValue} onValueChange={setPositionValue}>
                        <SelectTrigger data-testid="select-employee-position" className="bg-zinc-900 border-zinc-700 text-white h-8 text-sm flex-1">
                          <SelectValue placeholder={t("dialog.position.selectPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                          <SelectItem value="__none__" className="text-zinc-400 focus:bg-zinc-800 italic">{t("dialog.position.notAssigned")}</SelectItem>
                          {positionsList.filter(p => p.isActive).map(pos => (
                            <SelectItem key={pos.id} value={pos.id} className="text-white focus:bg-zinc-800">{pos.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="h-8 bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate({ positionId: positionValue === "__none__" ? null : positionValue }, { onSuccess: () => setEditPosition(false) })}>
                        {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t("dialog.actions.save")}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 border-zinc-700" onClick={() => setEditPosition(false)}>{t("dialog.actions.cancel")}</Button>
                    </div>
                  ) : (
                    <p className="text-white text-sm" data-testid="text-employee-position">
                      {employee.positionTitle ? (
                        <>
                          <bdi>{employee.positionTitle}</bdi>
                          {employee.positionIsActive === false && <span className="text-amber-400 text-xs ms-1">{t("columns.inactiveSuffix")}</span>}
                        </>
                      ) : (
                        <span className="text-zinc-500 text-xs italic">{t("dialog.position.notAssigned")}</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> {t("dialog.infoLabels.event")}</span>
                    {employee.isActive && !editEvent && (
                      <Button variant="ghost" size="sm" className="h-5 text-[11px] text-primary px-1" onClick={() => { setEditEvent(true); setEventValue(employee.eventId ?? ""); }}>
                        {employee.eventId ? t("dialog.actions.change") : t("dialog.actions.assign")}
                      </Button>
                    )}
                  </div>
                  {editEvent ? (
                    <div className="flex gap-2">
                      <Select value={eventValue} onValueChange={setEventValue}>
                        <SelectTrigger data-testid="select-employee-event" className="bg-zinc-900 border-zinc-700 text-white h-8 text-sm flex-1">
                          <SelectValue placeholder={t("dialog.event.selectPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                          {eventsList.map(ev => (
                            <SelectItem key={ev.id} value={ev.id} className="text-white focus:bg-zinc-800"><bdi>{ev.name}</bdi></SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="h-8 bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white" disabled={updateMutation.isPending || !eventValue} onClick={() => updateMutation.mutate({ eventId: eventValue }, { onSuccess: () => setEditEvent(false) })}>
                        {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t("dialog.actions.save")}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 border-zinc-700" onClick={() => setEditEvent(false)}>{t("dialog.actions.cancel")}</Button>
                    </div>
                  ) : (
                    <p className="text-white text-sm" data-testid="text-employee-event">
                      {employee.eventName ? <bdi>{employee.eventName}</bdi> : <span className="text-amber-400 text-xs italic">{t("dialog.event.noneWarning")}</span>}
                    </p>
                  )}
                </div>
                <InfoRow icon={<Clock className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.startDate")} value={formatDate(employee.startDate)} />
                {!employee.isActive && (
                  <>
                    <InfoRow icon={<XCircle className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.endDate")} value={formatDate(employee.endDate)} />
                    <InfoRow icon={<AlertTriangle className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.terminationReason")} value={employee.terminationReason ?? "—"} />
                  </>
                )}
              </div>

              <Separator className="bg-zinc-800" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" /> {t("dialog.salary.label")}
                  </Label>
                  {employee.isActive && !editSalary && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={() => { setEditSalary(true); setSalaryValue(employee.salary ?? ""); }}>
                      {t("dialog.actions.edit")}
                    </Button>
                  )}
                </div>
                {editSalary ? (
                  <div className="flex gap-2">
                    <Input
                      data-testid="input-edit-salary"
                      type="number"
                      value={salaryValue}
                      onChange={e => setSalaryValue(e.target.value)}
                      className="bg-zinc-900 border-zinc-700 text-white flex-1"
                      placeholder={t("dialog.salary.placeholder")}
                      dir="ltr"
                    />
                    <Button
                      size="sm"
                      className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
                      disabled={updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ salary: salaryValue || undefined })}
                    >
                      {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t("dialog.actions.save")}
                    </Button>
                    <Button size="sm" variant="outline" className="border-zinc-700" onClick={() => setEditSalary(false)}>{t("dialog.actions.cancel")}</Button>
                  </div>
                ) : (
                  <p className="text-white font-medium text-lg" data-testid="text-employee-salary">
                    {employee.salary ? t("dialog.salary.amount", { n: formatNumber(Number(employee.salary)) }) : t("dialog.salary.notSet")}
                  </p>
                )}
              </div>

              <Separator className="bg-zinc-800" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("dialog.notes.label")}</Label>
                  {employee.isActive && !editNotes && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={() => { setEditNotes(true); setNotesValue(employee.notes ?? ""); }}>
                      {t("dialog.actions.edit")}
                    </Button>
                  )}
                </div>
                {editNotes ? (
                  <div className="space-y-2">
                    <Textarea
                      data-testid="textarea-edit-notes"
                      value={notesValue}
                      onChange={e => setNotesValue(e.target.value)}
                      className="bg-zinc-900 border-zinc-700 text-white resize-none"
                      rows={3}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" className="border-zinc-700" onClick={() => setEditNotes(false)}>{t("dialog.actions.cancel")}</Button>
                      <Button
                        size="sm"
                        className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
                        disabled={updateMutation.isPending}
                        onClick={() => updateMutation.mutate({ notes: notesValue || undefined })}
                      >
                        {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t("dialog.actions.save")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-zinc-300 text-sm">{employee.notes || t("dialog.notes.empty")}</p>
                )}
              </div>

              <Separator className="bg-zinc-800" />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" /> {t("dialog.personal.title")}
                  </Label>
                  {!editPersonal ? (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-zinc-500 hover:text-zinc-300" data-testid="button-edit-personal"
                      onClick={() => {
                        setPersonalForm({
                          email: employee.email || "",
                          phone: employee.phone || "",
                          dateOfBirth: employee.dateOfBirth || "",
                          gender: employee.gender || "",
                          nationalityText: employee.nationalityText || "",
                          maritalStatus: employee.maritalStatus || "",
                          iqamaNumber: employee.iqamaNumber || "",
                          city: employee.city || "",
                          region: employee.region || "",
                        });
                        setEditPersonal(true);
                      }}
                    ><Pencil className="h-3 w-3 me-1" /> {t("dialog.actions.edit")}</Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-zinc-500" onClick={() => setEditPersonal(false)} data-testid="button-cancel-personal"><X className="h-3 w-3" /></Button>
                      <Button size="sm" className="h-6 px-2 text-xs bg-emerald-700 hover:bg-emerald-600" data-testid="button-save-personal"
                        disabled={profileMutation.isPending}
                        onClick={() => profileMutation.mutate(personalForm)}
                      ><Save className="h-3 w-3 me-1" /> {t("dialog.actions.save")}</Button>
                    </div>
                  )}
                </div>
                {editPersonal ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-zinc-500 text-xs">{t("dialog.infoLabels.email")}</label><Input className="mt-1 h-8 text-sm bg-zinc-900 border-zinc-700" value={personalForm.email} onChange={e => setPersonalForm(f => ({ ...f, email: e.target.value }))} data-testid="input-personal-email" dir="ltr" /></div>
                    <div>
                      <label className="text-zinc-500 text-xs">{t("dialog.infoLabels.phone")}</label>
                      <Input
                        className="mt-1 h-8 text-sm bg-zinc-900 border-zinc-700"
                        value={personalForm.phone}
                        onChange={e => setPersonalForm(f => ({ ...f, phone: sanitizeSaMobileInput(e.target.value) }))}
                        onBlur={e => setPersonalForm(f => ({ ...f, phone: normalizeSaMobileOnBlur(e.target.value) }))}
                        placeholder="05XXXXXXXX"
                        inputMode="tel"
                        maxLength={10}
                        data-testid="input-personal-phone"
                        dir="ltr"
                      />
                      {personalForm.phone.length > 0 && !isValidSaMobile(personalForm.phone) && (
                        <p className="mt-1 text-[11px] text-amber-400" data-testid="text-personal-phone-validation-hint">
                          {String(t("common:errors.invalidPhone", { defaultValue: "Please enter a valid Saudi mobile (05XXXXXXXX)." } as any))}
                        </p>
                      )}
                    </div>
                    <div><label className="text-zinc-500 text-xs">{t("dialog.infoLabels.dateOfBirth")}</label><Input type="date" className="mt-1 h-8 text-sm bg-zinc-900 border-zinc-700" value={personalForm.dateOfBirth} onChange={e => setPersonalForm(f => ({ ...f, dateOfBirth: e.target.value }))} data-testid="input-personal-dob" /></div>
                    <div>
                      <label className="text-zinc-500 text-xs">{t("dialog.infoLabels.gender")}</label>
                      <Select value={personalForm.gender} onValueChange={v => setPersonalForm(f => ({ ...f, gender: v }))}>
                        <SelectTrigger className="mt-1 h-8 text-sm bg-zinc-900 border-zinc-700" data-testid="select-personal-gender"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="male">{t("dialog.gender.male")}</SelectItem><SelectItem value="female">{t("dialog.gender.female")}</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div><label className="text-zinc-500 text-xs">{t("dialog.infoLabels.nationality")}</label><Input className="mt-1 h-8 text-sm bg-zinc-900 border-zinc-700" value={personalForm.nationalityText} onChange={e => setPersonalForm(f => ({ ...f, nationalityText: e.target.value }))} data-testid="input-personal-nationality" /></div>
                    <div>
                      <label className="text-zinc-500 text-xs">{t("dialog.infoLabels.maritalStatus")}</label>
                      <Select value={personalForm.maritalStatus} onValueChange={v => setPersonalForm(f => ({ ...f, maritalStatus: v }))}>
                        <SelectTrigger className="mt-1 h-8 text-sm bg-zinc-900 border-zinc-700" data-testid="select-personal-marital"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="single">{t("dialog.marital.single")}</SelectItem><SelectItem value="married">{t("dialog.marital.married")}</SelectItem><SelectItem value="divorced">{t("dialog.marital.divorced")}</SelectItem><SelectItem value="widowed">{t("dialog.marital.widowed")}</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div><label className="text-zinc-500 text-xs">{t("dialog.infoLabels.iqama")}</label><Input className="mt-1 h-8 text-sm bg-zinc-900 border-zinc-700 font-mono" value={personalForm.iqamaNumber} onChange={e => setPersonalForm(f => ({ ...f, iqamaNumber: e.target.value }))} data-testid="input-personal-iqama" dir="ltr" /></div>
                    <div><label className="text-zinc-500 text-xs">{t("dialog.infoLabels.location")}</label><Input className="mt-1 h-8 text-sm bg-zinc-900 border-zinc-700" value={personalForm.city} onChange={e => setPersonalForm(f => ({ ...f, city: e.target.value }))} data-testid="input-personal-city" /></div>
                    <div><label className="text-zinc-500 text-xs">{t("dialog.infoLabels.location")}</label><Input className="mt-1 h-8 text-sm bg-zinc-900 border-zinc-700" value={personalForm.region} onChange={e => setPersonalForm(f => ({ ...f, region: e.target.value }))} data-testid="input-personal-region" /></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {employee.email && <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.email")} value={employee.email} />}
                    {employee.phone && <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.phone")} value={employee.phone} />}
                    {employee.dateOfBirth && <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.dateOfBirth")} value={formatDate(employee.dateOfBirth)} />}
                    {employee.gender && <InfoRow icon={<User className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.gender")} value={t(`dialog.gender.${employee.gender}` as any, { defaultValue: employee.gender })} />}
                    {employee.nationalityText && <InfoRow icon={<Globe className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.nationality")} value={nationalityLabel(employee.nationalityText, i18n.language)} />}
                    {employee.maritalStatus && <InfoRow icon={<Heart className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.maritalStatus")} value={t(`dialog.marital.${employee.maritalStatus.toLowerCase()}` as any, { defaultValue: employee.maritalStatus })} />}
                    {employee.iqamaNumber && <InfoRow icon={<CreditCard className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.iqama")} value={employee.iqamaNumber} mono />}
                    {(employee.city || employee.region) && <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.location")} value={[employee.city, employee.region].filter(Boolean).join(", ")} />}
                  </div>
                )}
              </div>

              <Separator className="bg-zinc-800" />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <GraduationCap className="h-3.5 w-3.5" /> {t("dialog.education.title")}
                  </Label>
                  {!editEducation ? (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-zinc-500 hover:text-zinc-300" data-testid="button-edit-education"
                      onClick={() => {
                        setEducationForm({
                          educationLevel: employee.educationLevel || "",
                          university: employee.university || "",
                          major: employee.major || "",
                        });
                        setEditEducation(true);
                      }}
                    ><Pencil className="h-3 w-3 me-1" /> {t("dialog.actions.edit")}</Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-zinc-500" onClick={() => setEditEducation(false)} data-testid="button-cancel-education"><X className="h-3 w-3" /></Button>
                      <Button size="sm" className="h-6 px-2 text-xs bg-emerald-700 hover:bg-emerald-600" data-testid="button-save-education"
                        disabled={profileMutation.isPending}
                        onClick={() => profileMutation.mutate(educationForm)}
                      ><Save className="h-3 w-3 me-1" /> {t("dialog.actions.save")}</Button>
                    </div>
                  )}
                </div>
                {editEducation ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-zinc-500 text-xs">{t("dialog.education.level")}</label>
                      <Select value={educationForm.educationLevel} onValueChange={v => setEducationForm(f => ({ ...f, educationLevel: v }))}>
                        <SelectTrigger className="mt-1 h-8 text-sm bg-zinc-900 border-zinc-700" data-testid="select-education-level"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="High School">{t("dialog.education.levels.High School")}</SelectItem>
                          <SelectItem value="Diploma">{t("dialog.education.levels.Diploma")}</SelectItem>
                          <SelectItem value="Bachelor">{t("dialog.education.levels.Bachelor")}</SelectItem>
                          <SelectItem value="Master">{t("dialog.education.levels.Master")}</SelectItem>
                          <SelectItem value="PhD">{t("dialog.education.levels.PhD")}</SelectItem>
                          <SelectItem value="Other">{t("dialog.education.levels.Other")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><label className="text-zinc-500 text-xs">{t("dialog.infoLabels.university")}</label><Input className="mt-1 h-8 text-sm bg-zinc-900 border-zinc-700" value={educationForm.university} onChange={e => setEducationForm(f => ({ ...f, university: e.target.value }))} data-testid="input-education-university" /></div>
                    <div><label className="text-zinc-500 text-xs">{t("dialog.infoLabels.major")}</label><Input className="mt-1 h-8 text-sm bg-zinc-900 border-zinc-700" value={educationForm.major} onChange={e => setEducationForm(f => ({ ...f, major: e.target.value }))} data-testid="input-education-major" /></div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      {employee.educationLevel && <InfoRow icon={<GraduationCap className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.education")} value={t(`dialog.education.levels.${employee.educationLevel}` as any, { defaultValue: employee.educationLevel })} />}
                      {employee.university && <InfoRow icon={<Building className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.university")} value={employee.university} />}
                      {employee.major && <InfoRow icon={<GraduationCap className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.major")} value={employee.major} />}
                    </div>
                    {employee.skills && employee.skills.length > 0 && (
                      <div className="mt-3">
                        <span className="text-zinc-500 text-xs">{t("dialog.infoLabels.skills")}</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {employee.skills.map((s: string, i: number) => (
                            <span key={i} className="bg-zinc-800 text-zinc-300 text-xs px-2 py-0.5 rounded">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {employee.languages && employee.languages.length > 0 && (
                      <div className="mt-3">
                        <span className="text-zinc-500 text-xs">{t("dialog.infoLabels.languages")}</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {employee.languages.map((l: string, i: number) => (
                            <span key={i} className="bg-zinc-800 text-zinc-300 text-xs px-2 py-0.5 rounded">{l}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {!employee.educationLevel && !employee.skills?.length && !employee.languages?.length && (
                      <p className="text-zinc-500 text-sm">{t("dialog.education.empty")}</p>
                    )}
                  </>
                )}
              </div>

              <Separator className="bg-zinc-800" />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" /> {t("dialog.financial.title")}
                  </Label>
                  {!editFinancial ? (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-zinc-500 hover:text-zinc-300" data-testid="button-edit-financial"
                      onClick={() => {
                        setFinancialForm({
                          ibanNumber: employee.iban || "",
                          ibanBankName: employee.ibanBankName || "",
                          ibanBankCode: employee.ibanBankCode || "",
                          ibanAccountFirstName: employee.ibanAccountFirstName || "",
                          ibanAccountLastName: employee.ibanAccountLastName || "",
                        });
                        setEditFinancial(true);
                      }}
                    ><Pencil className="h-3 w-3 me-1" /> {t("dialog.actions.edit")}</Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-zinc-500" onClick={() => setEditFinancial(false)} data-testid="button-cancel-financial"><X className="h-3 w-3" /></Button>
                      <Button size="sm" className="h-6 px-2 text-xs bg-emerald-700 hover:bg-emerald-600" data-testid="button-save-financial"
                        disabled={profileMutation.isPending}
                        onClick={() => {
                          const rawIban = (financialForm.ibanNumber ?? "").replace(/\s+/g, "");
                          let canonicalIban = "";
                          if (rawIban.length > 0) {
                            const result = validateSaudiIban(financialForm.ibanNumber ?? "");
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
                            canonicalIban = result.canonical;
                          }
                          // Task #137 — Block Arabic in account holder names before save.
                          let canonicalFirst = financialForm.ibanAccountFirstName ?? "";
                          let canonicalLast  = financialForm.ibanAccountLastName  ?? "";
                          for (const [field, value] of [
                            ["ibanAccountFirstName", canonicalFirst],
                            ["ibanAccountLastName",  canonicalLast],
                          ] as const) {
                            if (!value || value.trim() === "") continue;
                            const r = validateIbanHolderName(value);
                            if (!r.ok) {
                              const desc = r.reason === "too_long"
                                ? t("toast.invalidIbanHolderNameTooLongDesc")
                                : t("toast.invalidIbanHolderNameDesc");
                              toast({ title: t("toast.invalidIbanHolderName"), description: desc, variant: "destructive" });
                              return;
                            }
                            if (field === "ibanAccountFirstName") canonicalFirst = r.canonical;
                            else canonicalLast = r.canonical;
                          }
                          profileMutation.mutate({
                            ...financialForm,
                            ibanNumber: canonicalIban,
                            ibanAccountFirstName: canonicalFirst,
                            ibanAccountLastName: canonicalLast,
                          });
                        }}
                      ><Save className="h-3 w-3 me-1" /> {t("dialog.actions.save")}</Button>
                    </div>
                  )}
                </div>
                {editFinancial ? (
                  (() => {
                    const detected = resolveSaudiBank(financialForm.ibanNumber ?? "");
                    return (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-zinc-500 text-xs">{t("dialog.financial.iban")}</label>
                          <Input className="h-8 text-sm bg-zinc-900 border-zinc-700 font-mono uppercase" dir="ltr" value={financialForm.ibanNumber} onChange={e => {
                            const cleaned = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 24);
                            const grouped = cleaned.replace(/(.{4})/g, "$1 ").trim();
                            const bank = resolveSaudiBank(cleaned);
                            setFinancialForm(f => ({
                              ...f,
                              ibanNumber: grouped,
                              ibanBankName: bank?.ibanBankName ?? "",
                              ibanBankCode: bank?.ibanBankCode ?? "",
                            }));
                          }} maxLength={29} placeholder={t("dialog.financial.ibanPlaceholder")} data-testid="input-financial-iban" />
                          <p className="text-[10px] text-zinc-600">{t("dialog.financial.ibanHint")}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-zinc-500 text-xs">{t("dialog.financial.bankName")}</label>
                            <Input className="h-8 text-sm bg-zinc-900/50 border-zinc-700 text-zinc-400 cursor-not-allowed text-left" dir="ltr" value={detected?.ibanBankName ?? financialForm.ibanBankName ?? ""} readOnly placeholder={t("dialog.financial.bankNamePlaceholder")} data-testid="input-financial-bankName" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-zinc-500 text-xs">{t("dialog.financial.bankCode")}</label>
                            <Input className="h-8 text-sm bg-zinc-900/50 border-zinc-700 font-mono text-zinc-400 cursor-not-allowed text-left" dir="ltr" value={detected?.ibanBankCode ?? financialForm.ibanBankCode ?? ""} readOnly placeholder={t("dialog.financial.bankCodePlaceholder")} data-testid="input-financial-bankCode" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-zinc-500 text-xs">{t("dialog.financial.accountFirst")}</label>
                            <Input className="h-8 text-sm bg-zinc-900 border-zinc-700" value={financialForm.ibanAccountFirstName} onChange={e => setFinancialForm(f => ({ ...f, ibanAccountFirstName: e.target.value }))} data-testid="input-financial-firstName" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-zinc-500 text-xs">{t("dialog.financial.accountLast")}</label>
                            <Input className="h-8 text-sm bg-zinc-900 border-zinc-700" value={financialForm.ibanAccountLastName} onChange={e => setFinancialForm(f => ({ ...f, ibanAccountLastName: e.target.value }))} data-testid="input-financial-lastName" />
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="space-y-3">
                    {employee.iban ? (
                      <InfoRow icon={<CreditCard className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.iban")} value={<span dir="ltr">{employee.iban}</span>} mono />
                    ) : null}
                    {(employee.ibanBankName || employee.ibanBankCode) ? (
                      <div className="grid grid-cols-2 gap-3">
                        {employee.ibanBankName ? <InfoRow icon={<Building className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.bankName")} value={employee.ibanBankName} ltr /> : null}
                        {employee.ibanBankCode ? <InfoRow icon={<Hash className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.bankCode")} value={employee.ibanBankCode} mono ltr /> : null}
                      </div>
                    ) : null}
                    {employee.ibanAccountFirstName ? (
                      <InfoRow icon={<User className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.accountHolder")} value={<bdi>{`${employee.ibanAccountFirstName} ${employee.ibanAccountLastName ?? ""}`.trim()}</bdi>} ltr />
                    ) : null}
                    {!employee.iban && !employee.ibanBankName && <p className="text-zinc-500 text-sm">{t("dialog.financial.empty")}</p>}
                  </div>
                )}
              </div>

              <Separator className="bg-zinc-800" />
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <Banknote className="h-3.5 w-3.5" /> {t("dialog.payment.title")}
                </Label>
                <PaymentMethodToggle employee={employee} onEmployeeRefreshed={onEmployeeRefreshed} />
              </div>

              <Separator className="bg-zinc-800" />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5" /> {t("dialog.emergency.title")}
                  </Label>
                  {!editEmergency ? (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-zinc-500 hover:text-zinc-300" data-testid="button-edit-emergency"
                      onClick={() => {
                        setEmergencyForm({
                          emergencyContactName: employee.emergencyContactName || "",
                          emergencyContactPhone: employee.emergencyContactPhone || "",
                        });
                        setEditEmergency(true);
                      }}
                    ><Pencil className="h-3 w-3 me-1" /> {t("dialog.actions.edit")}</Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-zinc-500" onClick={() => setEditEmergency(false)} data-testid="button-cancel-emergency"><X className="h-3 w-3" /></Button>
                      <Button size="sm" className="h-6 px-2 text-xs bg-emerald-700 hover:bg-emerald-600" data-testid="button-save-emergency"
                        disabled={profileMutation.isPending}
                        onClick={() => profileMutation.mutate(emergencyForm)}
                      ><Save className="h-3 w-3 me-1" /> {t("dialog.actions.save")}</Button>
                    </div>
                  )}
                </div>
                {editEmergency ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-zinc-500 text-xs">{t("dialog.infoLabels.contactName")}</label><Input className="mt-1 h-8 text-sm bg-zinc-900 border-zinc-700" value={emergencyForm.emergencyContactName} onChange={e => setEmergencyForm(f => ({ ...f, emergencyContactName: e.target.value }))} data-testid="input-emergency-name" /></div>
                    <div><label className="text-zinc-500 text-xs">{t("dialog.infoLabels.contactPhone")}</label><Input className="mt-1 h-8 text-sm bg-zinc-900 border-zinc-700" value={emergencyForm.emergencyContactPhone} onChange={e => setEmergencyForm(f => ({ ...f, emergencyContactPhone: e.target.value }))} data-testid="input-emergency-phone" dir="ltr" /></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {employee.emergencyContactName ? <InfoRow icon={<User className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.contactName")} value={<bdi>{employee.emergencyContactName}</bdi>} /> : null}
                    {employee.emergencyContactPhone ? <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label={t("dialog.infoLabels.contactPhone")} value={<span dir="ltr">{employee.emergencyContactPhone}</span>} /> : null}
                    {!employee.emergencyContactName && !employee.emergencyContactPhone && <p className="text-zinc-500 text-sm col-span-2">{t("dialog.emergency.empty")}</p>}
                  </div>
                )}
              </div>

              <>
                <Separator className="bg-zinc-800" />
                <div className="flex justify-end gap-2 flex-wrap">
                  {employee.isActive && (
                    <Button
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => {
                        if (employee && onPrintCard) {
                          onPrintCard(employee);
                        }
                      }}
                      data-testid="button-print-id-card"
                    >
                      <Printer className="h-4 w-4" /> {t("dialog.footer.printIdCard")}
                    </Button>
                  )}
                  {employee.isActive && !employee.offboardingStatus ? (
                    <Button
                      variant="outline"
                      className="border-red-800 text-red-400 hover:bg-red-950/30 hover:text-red-300 gap-1.5"
                      onClick={() => setTerminateOpen(true)}
                      data-testid="button-terminate-employee"
                    >
                      <UserX className="h-4 w-4" /> {t("dialog.footer.terminate")}
                    </Button>
                  ) : employee.offboardingStatus === "in_progress" ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 py-1.5 px-3 text-sm">
                        {t("dialog.footer.inOffboardingBadge")}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-amber-800 text-amber-400 hover:bg-amber-950/30 hover:text-amber-300 gap-1.5"
                        onClick={() => { onOpenChange(false); setLocation("/offboarding"); }}
                        data-testid="button-view-offboarding"
                      >
                        <LogOut className="h-4 w-4" /> {t("dialog.footer.viewInOffboarding")}
                      </Button>
                    </div>
                  ) : !employee.isActive ? (
                    <Button
                      variant="outline"
                      className="border-emerald-800 text-emerald-400 hover:bg-emerald-950/30 hover:text-emerald-300 gap-1.5"
                      onClick={() => {
                        setReinstateForm({ startDate: "", eventId: "", salary: employee.salary ?? "", smpCompanyId: employee.smpCompanyId ?? "" });
                        setReinstateOpen(true);
                      }}
                      data-testid="button-reinstate-employee"
                    >
                      <CheckCircle2 className="h-4 w-4" /> {t("dialog.footer.reinstate")}
                    </Button>
                  ) : null}
                </div>
              </>
            </div>
          )}

          {tab === "history" && (
            <div className="mt-2">
              {historyLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{t("dialog.history.empty")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                    {t("dialog.history.records", { n: formatNumber(history.length) })}
                  </p>
                  {history.map((h, idx) => {
                    const linkedContract = adminContractMap.get(h.id);
                    return (
                    <div
                      key={h.id}
                      className={`border rounded-lg p-4 space-y-2 ${
                        h.isActive ? "border-emerald-800/50 bg-emerald-950/10" : "border-zinc-800 bg-zinc-900/30"
                      }`}
                      data-testid={`history-record-${idx}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-zinc-400" dir="ltr">{h.employeeNumber}</code>
                          <Badge variant="outline" className={h.isActive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]" : "bg-red-500/10 text-red-400 border-red-500/30 text-[10px]"}>
                            {h.isActive ? t("status.active") : t("status.terminated")}
                          </Badge>
                        </div>
                        {h.salary && <span className="text-sm text-zinc-300 font-medium">{t("dialog.salary.amount", { n: formatNumber(Number(h.salary)) })}</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-zinc-500 text-xs">{t("dialog.history.event")}</span>
                          <p className="text-zinc-200"><bdi>{h.eventName ?? "—"}</bdi></p>
                        </div>
                        <div>
                          <span className="text-zinc-500 text-xs">{t("dialog.history.jobTitle")}</span>
                          <p className="text-zinc-200"><bdi>{h.jobTitle ?? "—"}</bdi></p>
                        </div>
                        <div>
                          <span className="text-zinc-500 text-xs">{t("dialog.history.start")}</span>
                          <p className="text-zinc-200">{formatDate(h.startDate)}</p>
                        </div>
                        <div>
                          <span className="text-zinc-500 text-xs">{t("dialog.history.end")}</span>
                          <p className="text-zinc-200">{formatDate(h.endDate)}</p>
                        </div>
                      </div>
                      {linkedContract && (
                        <button
                          onClick={() => setViewingAdminContract(linkedContract)}
                          className="inline-flex items-center gap-1.5 text-xs text-[hsl(155,45%,45%)] hover:text-[hsl(155,45%,55%)] transition-colors mt-1"
                          data-testid={`button-view-contract-history-${idx}`}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          {t("dialog.history.viewContract")}
                          {linkedContract.signedAt && (
                            <span className="text-zinc-500 ms-1">
                              {t("dialog.history.signedSuffix", { date: formatDateI18n(linkedContract.signedAt, "en", { day: "numeric", month: "short", year: "numeric" }) })}
                            </span>
                          )}
                        </button>
                      )}
                      {h.terminationReason && (
                        <div className="text-xs text-red-400/80 flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3" /> {h.terminationReason}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "schedule" && (
            <div className="space-y-4 mt-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">{t("dialog.schedule.current")}</p>
                {employee.isActive && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-zinc-700"
                    onClick={() => setAssignScheduleOpen(true)}
                    data-testid="button-assign-schedule-employee"
                  >
                    <Clock className="h-3.5 w-3.5 me-1" />
                    {activeAssignment ? t("dialog.schedule.reassign") : t("dialog.schedule.assign")}
                  </Button>
                )}
              </div>
              {activeAssignment ? (
                <ActiveAssignmentCard
                  activeAssignment={activeAssignment}
                  scheduleTemplates={scheduleTemplates}
                  allShifts={allShifts}
                  endAssignmentMutation={endAssignmentMutation}
                  formatDate={formatDate}
                />
              ) : (
                <div className="border border-zinc-800 rounded-lg p-4 text-center text-zinc-500 text-sm">
                  {t("dialog.schedule.noneAssigned")}
                </div>
              )}

              {assignmentHistory.length > 1 && (
                <>
                  <Separator className="bg-zinc-800" />
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">{t("dialog.schedule.history")}</p>
                  <div className="space-y-2">
                    {assignmentHistory.filter(a => a.endDate != null || a.id !== activeAssignment?.id).map(a => (
                      <div key={a.id} className="flex items-center justify-between text-xs border border-zinc-800 rounded p-3">
                        <span className="text-zinc-300">
                          <bdi>{scheduleTemplates.find(tt => tt.id === a.templateId)?.name ?? a.templateId}</bdi>
                        </span>
                        <span className="text-zinc-500" dir="ltr">
                          {formatDate(a.startDate)} – {a.endDate ? formatDate(a.endDate) : t("dialog.schedule.active")}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

      <Dialog open={assignScheduleOpen} onOpenChange={setAssignScheduleOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>{activeAssignment ? t("assignDialog.titleReassign") : t("assignDialog.titleAssign")}</DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              {activeAssignment ? t("assignDialog.descReassign") : t("assignDialog.descAssign")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("assignDialog.template")}</Label>
              <Select value={scheduleTemplateId} onValueChange={setScheduleTemplateId}>
                <SelectTrigger data-testid="select-schedule-template" className="bg-zinc-900 border-zinc-700 text-white">
                  <SelectValue placeholder={t("assignDialog.selectTemplate")} />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {scheduleTemplates.map(tpl => (
                    <SelectItem key={tpl.id} value={tpl.id}><bdi>{tpl.name}</bdi></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("assignDialog.startDate")}</Label>
              <Input
                data-testid="input-schedule-start-date"
                type="date"
                value={scheduleStartDate}
                onChange={e => setScheduleStartDate(e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("assignDialog.endDate")} <span className="text-zinc-600 text-xs font-normal normal-case">{t("assignDialog.optional")}</span></Label>
              <Input
                data-testid="input-schedule-end-date"
                type="date"
                value={scheduleEndDate}
                min={scheduleStartDate}
                onChange={e => setScheduleEndDate(e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" className="border-zinc-700" onClick={() => setAssignScheduleOpen(false)}>{t("assignDialog.cancel")}</Button>
            <Button
              data-testid="button-confirm-assign-schedule"
              className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
              disabled={!scheduleTemplateId || assignScheduleMutation.isPending}
              onClick={() => assignScheduleMutation.mutate()}
            >
              {assignScheduleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : null}
              {t("assignDialog.assign")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={terminateOpen} onOpenChange={setTerminateOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-2 text-red-400">
              <UserX className="h-5 w-5" />
              {t("terminate.title")}
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              {t("terminate.description", { name: employee.fullNameEn ?? t("dialog.unknownEmployee"), number: employee.employeeNumber })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="bg-amber-950/20 border border-amber-800/40 rounded-lg p-3 text-sm text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              {t("terminate.warning")}
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-sm">{t("terminate.endDate")} <span className="text-red-400">*</span></Label>
              <DatePickerField
                data-testid="input-terminate-enddate"
                value={terminateForm.endDate}
                onChange={v => setTerminateForm(f => ({ ...f, endDate: v }))}
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-sm">{t("terminate.category")} <span className="text-red-400">*</span></Label>
              <select
                data-testid="select-terminate-category"
                value={terminateForm.category}
                onChange={e => setTerminateForm(f => ({ ...f, category: e.target.value }))}
                className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 py-2 text-sm"
              >
                <option value="">{t("terminate.selectCategory")}</option>
                <option value="end_of_season">{t("terminate.categories.end_of_season")}</option>
                <option value="resignation">{t("terminate.categories.resignation")}</option>
                <option value="performance">{t("terminate.categories.performance")}</option>
                <option value="disciplinary">{t("terminate.categories.disciplinary")}</option>
                <option value="contract_expiry">{t("terminate.categories.contract_expiry")}</option>
                <option value="other">{t("terminate.categories.other")}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-sm">{t("terminate.notes")}</Label>
              <Textarea
                data-testid="textarea-terminate-reason"
                value={terminateForm.reason}
                onChange={e => setTerminateForm(f => ({ ...f, reason: e.target.value }))}
                className="bg-zinc-900 border-zinc-700 text-white resize-none"
                rows={2}
                placeholder={t("terminate.notesPlaceholder")}
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setTerminateOpen(false)}>{t("terminate.cancel")}</Button>
              <Button
                data-testid="button-confirm-terminate"
                disabled={!terminateForm.endDate || !terminateForm.category || terminateMutation.isPending}
                onClick={() => terminateMutation.mutate({
                  endDate: terminateForm.endDate,
                  terminationReason: terminateForm.reason || undefined,
                  terminationCategory: terminateForm.category || undefined,
                })}
                className="bg-red-600 hover:bg-red-700 text-white gap-2"
              >
                {terminateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserX className="h-4 w-4" /> {t("terminate.submit")}</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reinstateOpen} onOpenChange={setReinstateOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              {t("reinstate.title")}
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              {t("reinstate.description", { name: employee.fullNameEn ?? t("dialog.unknownEmployee"), number: employee.employeeNumber })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-sm">{t("reinstate.startDate")} <span className="text-red-400">*</span></Label>
              <DatePickerField
                data-testid="input-reinstate-startdate"
                value={reinstateForm.startDate}
                onChange={v => setReinstateForm(f => ({ ...f, startDate: v }))}
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-sm">{t("reinstate.event")}</Label>
              <Select value={reinstateForm.eventId} onValueChange={v => setReinstateForm(f => ({ ...f, eventId: v }))}>
                <SelectTrigger data-testid="select-reinstate-event" className="bg-zinc-900 border-zinc-700 text-white">
                  <SelectValue placeholder={t("reinstate.selectEvent")} />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                  {eventsList.map(ev => (
                    <SelectItem key={ev.id} value={ev.id} className="text-white focus:bg-zinc-800"><bdi>{ev.name}</bdi></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {employee.employmentType === "smp" && (
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-sm">{t("reinstate.smpCompany")} <span className="text-red-400">*</span></Label>
                <select
                  data-testid="select-reinstate-smp-company"
                  value={reinstateForm.smpCompanyId}
                  onChange={e => setReinstateForm(f => ({ ...f, smpCompanyId: e.target.value }))}
                  className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
                >
                  <option value="" className="bg-zinc-900 text-zinc-400">{t("reinstate.selectSmp")}</option>
                  {smpCompanies.map(c => (
                    <option key={c.id} value={c.id} className="bg-zinc-900 text-white">{c.name}</option>
                  ))}
                </select>
                <p className="text-[11px] text-red-400/70">{t("reinstate.smpRequired")}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-sm">{t("reinstate.salary")}</Label>
              <Input
                data-testid="input-reinstate-salary"
                type="number"
                dir="ltr"
                placeholder={t("reinstate.salaryPlaceholder")}
                value={reinstateForm.salary}
                onChange={e => setReinstateForm(f => ({ ...f, salary: e.target.value }))}
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setReinstateOpen(false)}>{t("reinstate.cancel")}</Button>
              <Button
                data-testid="button-confirm-reinstate"
                disabled={
                  !reinstateForm.startDate ||
                  (employee.employmentType === "smp" && !reinstateForm.smpCompanyId) ||
                  reinstateMutation.isPending
                }
                onClick={() => {
                  if (!employee.nationalId) return;
                  reinstateMutation.mutate({
                    nationalId: employee.nationalId,
                    startDate: reinstateForm.startDate,
                    eventId: reinstateForm.eventId || undefined,
                    salary: reinstateForm.salary || undefined,
                    smpCompanyId: reinstateForm.smpCompanyId || undefined,
                    employmentType: employee.employmentType ?? undefined,
                  });
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                {reinstateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> {t("reinstate.submit")}</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
          </>
          )}
        </DialogContent>
      </Dialog>

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
          className="max-w-[90vw] sm:max-w-2xl bg-zinc-950 border-zinc-800 p-4"
          data-testid="dialog-photo-preview"
        >
          <DialogHeader>
            <DialogTitle className="text-white text-base font-display pe-10">
              {t("dialog.photo.previewTitle")}
            </DialogTitle>
            <DialogDescription className="sr-only">{t("dialog.photo.previewTitle")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center bg-black/40 rounded-md overflow-hidden">
            {employee.photoUrl ? (
              <img
                src={employee.photoUrl}
                alt={employee.fullNameEn ?? ""}
                className="max-h-[70vh] max-w-full object-contain"
                data-testid="img-photo-preview"
              />
            ) : (
              <div className="h-40 w-full flex items-center justify-center text-zinc-500 text-sm">—</div>
            )}
          </div>
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              variant="outline"
              className="border-zinc-700 gap-2"
              disabled={photoUploading}
              onClick={() => photoFileRef.current?.click()}
              data-testid="button-change-photo-from-preview"
            >
              {photoUploading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Pencil className="h-3.5 w-3.5" />}
              {t("dialog.photo.changePhoto")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Task #189 — payment-method history row shape returned by
// GET /api/workforce/:id/payment-method-history. Older rows logged
// before the structured-metadata switch may carry a null `metadata`
// or omit `from`; the UI tolerates both and falls back to the
// human-readable `description` when needed.
type PaymentMethodHistoryRow = {
  id: string;
  actorName: string | null;
  createdAt: string;
  metadata: { from?: string | null; to?: string | null; reason?: string | null } | null;
  description: string;
};

// Task #274 — shape of the 409 payload returned by the PATCH route when
// the employee still has unpaid pay-run lines. Used by PaymentMethodToggle
// to render an inline list of blocking runs instead of a generic toast.
type PaymentMethodFlipBlocked = {
  error: string;
  code: "OPEN_PAY_RUN_LINES";
  openLines: Array<{
    payRunId: string;
    payRunName: string;
    payRunStatus: string;
    tranche1Status: string | null;
    tranche2Status: string | null;
    paymentMethod: string;
  }>;
};

// apiRequest throws `${status}: ${text}`; pull the JSON body back out
// when the server returned a structured 409 so the UI can render it
// inline. Returns null if the message wasn't a structured flip-block.
function parseFlipBlocked(message: string): PaymentMethodFlipBlocked | null {
  if (!message.startsWith("409:")) return null;
  const jsonStart = message.indexOf("{");
  if (jsonStart === -1) return null;
  try {
    const parsed = JSON.parse(message.slice(jsonStart));
    if (parsed && parsed.code === "OPEN_PAY_RUN_LINES" && Array.isArray(parsed.openLines)) {
      return parsed as PaymentMethodFlipBlocked;
    }
  } catch {
    // Not JSON — fall through and let the caller show the raw message.
  }
  return null;
}

function PaymentMethodToggle({
  employee,
  onEmployeeRefreshed,
}: {
  employee: Employee;
  onEmployeeRefreshed?: (emp: Employee) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { t, i18n } = useTranslation("workforce");
  // `pendingSwitch` drives the inline confirmation panels: when set to
  // "cash" we render the WPS-impact warning and reason input; when set
  // to "bank_transfer" we render a small confirm/cancel pair (no
  // reason). The Cash button no longer fires the request directly —
  // both directions now require an explicit confirmation step so a
  // misplaced click cannot silently flip a payee.
  const [pendingSwitch, setPendingSwitch] = useState<"cash" | "bank_transfer" | null>(null);
  const [reason, setReason] = useState("");
  // Transient "just saved" check — separate from `toggleMut.isPending`
  // so it can outlive the mutation's own lifecycle (~2s after success).
  const [justSavedAt, setJustSavedAt] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Task #274 — when the server returns 409 with an OPEN_PAY_RUN_LINES
  // payload we surface it as an inline panel listing each blocking run
  // instead of a one-line toast. Cleared on dismiss / employee swap /
  // next successful save.
  const [flipBlocked, setFlipBlocked] = useState<PaymentMethodFlipBlocked | null>(null);

  // Reset transient UI when the parent swaps to a different employee
  // so a half-open confirm panel from employee A doesn't leak into
  // employee B's profile.
  useEffect(() => {
    setPendingSwitch(null);
    setReason("");
    setJustSavedAt(null);
    setHistoryOpen(false);
    setFlipBlocked(null);
  }, [employee.id]);

  // Auto-clear the green check after 2s. Keying on the timestamp lets
  // back-to-back saves restart the countdown cleanly.
  useEffect(() => {
    if (!justSavedAt) return;
    const tid = setTimeout(() => setJustSavedAt(null), 2000);
    return () => clearTimeout(tid);
  }, [justSavedAt]);

  const toggleMut = useMutation({
    mutationFn: (data: { paymentMethod: string; reason: string }) =>
      apiRequest("PATCH", `/api/workforce/${employee.id}/payment-method`, data).then(r => r.json()),
    onSuccess: (updated: Employee) => {
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      qc.invalidateQueries({ queryKey: ["/api/workforce/payment-method-history", employee.id] });
      // Push the freshly-saved record back to the parent dialog so the
      // active/inactive button colours and reason line refresh without
      // reopening the profile. Mirrors the pattern profileMutation
      // already uses elsewhere in EmployeeDetailDialog.
      if (onEmployeeRefreshed) onEmployeeRefreshed(updated);
      toast({ title: t("toast.paymentUpdated") });
      setPendingSwitch(null);
      setReason("");
      setFlipBlocked(null);
      setJustSavedAt(Date.now());
    },
    onError: (e: any) => {
      // Task #274 — surface the structured flip-block payload inline
      // in the panel instead of a generic destructive toast. Other
      // errors (400, 5xx) still fall through to the toast path.
      const blocked = parseFlipBlocked(String(e?.message ?? ""));
      if (blocked) {
        setFlipBlocked(blocked);
        return;
      }
      toast({ title: t("toast.error"), description: e.message, variant: "destructive" });
    },
  });

  const { data: history = [], isLoading: historyLoading } = useQuery<PaymentMethodHistoryRow[]>({
    queryKey: ["/api/workforce/payment-method-history", employee.id],
    queryFn: () => apiRequest("GET", `/api/workforce/${employee.id}/payment-method-history?limit=10`).then(r => r.json()),
    enabled: !!employee.id,
  });

  const current = employee.paymentMethod ?? "bank_transfer";
  // Prefer the audit-log derived "set by/at" because it carries the
  // setter's display name as a snapshot (no extra user fetch needed).
  // Fall back to the raw column timestamp for the rare case where the
  // record was seeded before any audit entry exists.
  const lastChange = history[0];
  // Fall back to the localized "Unknown user" label when the audit row
  // exists (so we have a real timestamp) but the actor name didn't get
  // captured. Avoids silently dropping the entire "Set by …" line just
  // because the snapshot column was null on an older entry.
  const setAt = lastChange?.createdAt ?? employee.paymentMethodSetAt ?? null;
  const setByName = setAt
    ? (lastChange?.actorName ?? t("dialog.payment.unknownActor"))
    : null;

  const methodLabel = (m?: string | null) =>
    m === "cash" ? t("dialog.payment.cash") : t("dialog.payment.bankTransfer");

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <button
          onClick={() => { if (current !== "bank_transfer") { setFlipBlocked(null); setPendingSwitch("bank_transfer"); } }}
          disabled={toggleMut.isPending}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-sm border text-xs font-medium transition-colors ${
            current === "bank_transfer"
              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
              : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-300"
          }`}
          data-testid="button-payment-method-bank"
        >
          <Landmark className="h-3.5 w-3.5" /> {t("dialog.payment.bankTransfer")}
        </button>
        <button
          onClick={() => { if (current !== "cash") { setFlipBlocked(null); setPendingSwitch("cash"); } }}
          disabled={toggleMut.isPending}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-sm border text-xs font-medium transition-colors ${
            current === "cash"
              ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
              : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-300"
          }`}
          data-testid="button-payment-method-cash"
        >
          <Coins className="h-3.5 w-3.5" /> {t("dialog.payment.cash")}
        </button>
        {justSavedAt && (
          <span className="flex items-center gap-1 text-emerald-400 text-[11px] font-medium" data-testid="text-payment-saved">
            <CheckCircle2 className="h-3.5 w-3.5" /> {t("dialog.payment.saved")}
          </span>
        )}
      </div>

      {pendingSwitch === "cash" && (
        <div className="space-y-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-sm">
          <div className="flex items-start gap-2 text-amber-300 text-[11px]" data-testid="text-cash-wps-warning">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <p>{t("dialog.payment.cashWpsWarning")}</p>
          </div>
          <label className="text-zinc-400 text-xs block">{t("dialog.payment.cashReasonLabel")}</label>
          <Input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={t("dialog.payment.cashReasonPlaceholder")}
            className="h-7 text-xs bg-zinc-900 border-zinc-700"
            data-testid="input-cash-reason"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-6 text-xs bg-amber-600 hover:bg-amber-700"
              disabled={!reason.trim() || toggleMut.isPending}
              onClick={() => toggleMut.mutate({ paymentMethod: "cash", reason })}
              data-testid="button-confirm-cash"
            >
              {toggleMut.isPending ? t("dialog.payment.saving") : t("dialog.payment.confirmCash")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs text-zinc-500"
              onClick={() => { setPendingSwitch(null); setReason(""); }}
              data-testid="button-cancel-cash"
            >
              {t("dialog.actions.cancel")}
            </Button>
          </div>
        </div>
      )}

      {pendingSwitch === "bank_transfer" && (
        <div className="space-y-2 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-sm">
          <p className="text-emerald-300 text-[11px]" data-testid="text-bank-confirm-prompt">
            {t("dialog.payment.bankConfirmPrompt")}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-6 text-xs bg-emerald-600 hover:bg-emerald-700"
              disabled={toggleMut.isPending}
              onClick={() => toggleMut.mutate({ paymentMethod: "bank_transfer", reason: "" })}
              data-testid="button-confirm-bank"
            >
              {toggleMut.isPending ? t("dialog.payment.saving") : t("dialog.payment.confirmBank")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs text-zinc-500"
              onClick={() => setPendingSwitch(null)}
              data-testid="button-cancel-bank"
            >
              {t("dialog.actions.cancel")}
            </Button>
          </div>
        </div>
      )}

      {flipBlocked && (
        <div
          className="space-y-2 p-3 bg-red-500/5 border border-red-500/30 rounded-sm"
          data-testid="panel-payment-flip-blocked"
        >
          <div className="flex items-start gap-2 text-red-300 text-[11px]">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold" data-testid="text-flip-blocked-title">
                {t("dialog.payment.flipBlockedTitle")}
              </p>
              <p data-testid="text-flip-blocked-body">
                {t("dialog.payment.flipBlockedBody", { n: flipBlocked.openLines.length, count: flipBlocked.openLines.length })}
              </p>
            </div>
          </div>
          <ul className="space-y-1 ps-5 list-disc text-[10px] text-red-200/80">
            {flipBlocked.openLines.map((line) => (
              <li key={line.payRunId} data-testid={`row-flip-blocked-${line.payRunId}`}>
                {t("dialog.payment.flipBlockedRun", { name: line.payRunName, status: line.payRunStatus })}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs text-zinc-400"
              onClick={() => setFlipBlocked(null)}
              data-testid="button-dismiss-flip-blocked"
            >
              {t("dialog.payment.flipBlockedDismiss")}
            </Button>
          </div>
        </div>
      )}

      {employee.paymentMethodReason && !pendingSwitch && (
        <p className="text-[10px] text-zinc-500" data-testid="text-payment-reason-line">
          {t("dialog.payment.reasonLine", { reason: employee.paymentMethodReason })}
        </p>
      )}

      {setByName && setAt && !pendingSwitch && (
        <p className="text-[10px] text-zinc-500" data-testid="text-payment-set-by">
          {t("dialog.payment.setByLine", {
            name: setByName,
            date: formatDateI18n(setAt, i18n.language, {
              day: "numeric", month: "short", year: "numeric",
              hour: "2-digit", minute: "2-digit", hour12: false,
            }),
          })}
        </p>
      )}

      {history.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setHistoryOpen(o => !o)}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            data-testid="button-toggle-payment-history"
          >
            {historyOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {t("dialog.payment.historyToggle", { n: history.length })}
          </button>
          {historyOpen && (
            <div className="mt-2 space-y-1.5 border-s border-zinc-800 ps-3" data-testid="list-payment-history">
              {historyLoading && <p className="text-[10px] text-zinc-600">{t("dialog.payment.historyLoading")}</p>}
              {history.map(row => {
                const fromLabel = methodLabel(row.metadata?.from);
                const toLabel = methodLabel(row.metadata?.to);
                const reasonText = row.metadata?.reason ?? null;
                return (
                  <div
                    key={row.id}
                    className="text-[10px] text-zinc-500 leading-relaxed"
                    data-testid={`row-payment-history-${row.id}`}
                  >
                    <div className="text-zinc-400">
                      <span className="text-zinc-300">{row.actorName ?? t("dialog.payment.unknownActor")}</span>
                      <span className="mx-1">·</span>
                      <span dir="ltr">{formatDateI18n(row.createdAt, i18n.language, {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit", hour12: false,
                      })}</span>
                    </div>
                    <div>
                      {row.metadata?.from && row.metadata?.to ? (
                        <span>{fromLabel} → {toLabel}</span>
                      ) : (
                        <span>{row.description}</span>
                      )}
                      {reasonText && <span className="text-zinc-600"> · {reasonText}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value, mono, ltr }: { icon: React.ReactNode; label: string; value: React.ReactNode; mono?: boolean; ltr?: boolean }) {
  return (
    <div className="bg-zinc-900/50 rounded-md p-3 border border-zinc-800/50">
      <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] uppercase tracking-wider font-semibold mb-1">
        {icon} {label}
      </div>
      <p
        className={`text-white text-sm font-medium ${mono ? "font-mono" : ""} ${ltr ? "text-left" : ""}`}
        {...(ltr ? { dir: "ltr" as const } : {})}
      >
        {value}
      </p>
    </div>
  );
}

function employeeToCardData(emp: Employee): EmployeeCardData {
  return {
    fullName: emp.fullNameEn ?? "Unknown",
    photoUrl: emp.photoUrl,
    employeeNumber: emp.employeeNumber,
    nationalId: emp.nationalId,
    // Task #187 — ID cards now show the canonical Position assignment
    // instead of the dummy free-text job title that the dialog no
    // longer surfaces. Falls back to the employee's event when no
    // position is assigned, matching the dialog's empty-state copy.
    position: emp.positionTitle ?? emp.jobTitle ?? null,
    eventName: emp.eventName,
    phone: emp.phone,
  };
}

export default function WorkforcePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { t: tt } = useTranslation("workforce");
  const statusBadge = useStatusBadge();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "terminated">("active");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [printingIds, setPrintingIds] = useState<Set<string>>(new Set());
  const [printProgress, setPrintProgress] = useState<{ total: number; done: number } | null>(null);
  const [pickupSmsDialog, setPickupSmsDialog] = useState<{ open: boolean; employeeIds: string[] }>({ open: false, employeeIds: [] });
  const [pickupSmsSending, setPickupSmsSending] = useState(false);
  const { data: pickupSmsStatus, isError: pickupStatusError } = useQuery<{ active: boolean }>({
    queryKey: ["/api/id-card-pickup-sms/status"],
    queryFn: () => apiRequest("GET", "/api/id-card-pickup-sms/status").then(r => r.json()),
    enabled: pickupSmsDialog.open,
    staleTime: 0,
    retry: 1,
  });
  // Default to "no plugin" until the status query resolves so Send is never
  // enabled in a no-plugin tenant during the loading window.
  const pickupPluginActive = pickupSmsStatus?.active ?? false;
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [bulkUpdateFile, setBulkUpdateFile] = useState<File | null>(null);
  const [bulkUpdateLoading, setBulkUpdateLoading] = useState(false);
  const [bulkUpdateResult, setBulkUpdateResult] = useState<{
    updated: number; skipped: number; total: number;
    errors: { employeeNumber: string; reason: string }[];
  } | null>(null);

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/workforce", search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter === "active") params.set("isActive", "true");
      if (statusFilter === "terminated") params.set("isActive", "false");
      return apiRequest("GET", `/api/workforce?${params}`).then(r => r.json());
    },
    refetchInterval: 15000,
  });

  // Task #192 — stats now include `inOffboarding` so active + inOffboarding
  // + terminated reconciles to total. Previously `active` quietly included
  // workers in offboarding, which made the workforce page disagree with
  // the per-event headcount and the offboarding queue counts.
  const { data: stats } = useQuery<{ total: number; active: number; inOffboarding: number; terminated: number }>({
    queryKey: ["/api/workforce/stats"],
    queryFn: () => apiRequest("GET", "/api/workforce/stats").then(r => r.json()),
    refetchInterval: 15000,
  });

  const { data: allEventsForBulk = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/events"],
    queryFn: () => apiRequest("GET", "/api/events").then(r => r.json()),
  });

  const { data: allSmpCompaniesForBulk = [] } = useQuery<{ id: string; name: string; isActive: boolean }[]>({
    queryKey: ["/api/smp-companies"],
    queryFn: () => apiRequest("GET", "/api/smp-companies").then(r => r.json()),
  });

  // Task #187 — Position is now an editable column on the bulk update
  // template (mirrors the Event / SMP catalog pattern). The reference
  // sheet ships the same active list the dialog dropdown shows so the
  // titles match exactly and the server-side resolver accepts them.
  const { data: allPositionsForBulk = [] } = useQuery<{ id: string; title: string; departmentName?: string | null; isActive: boolean }[]>({
    queryKey: ["/api/positions"],
    queryFn: () => apiRequest("GET", "/api/positions").then(r => r.json()),
  });

  async function downloadBulkTemplate() {
    const XLSX = await import("xlsx");
    const source = employees.length > 0 ? employees : [];
    const rows = source.map(e => ({
      "Employee #": e.employeeNumber,
      "Full Name": e.fullNameEn ?? "",
      "National ID/Iqama (read-only)": e.nationalId ?? "",
      "Phone (read-only)": e.phone ?? "",
      "Salary (SAR)": e.salary ? Number(e.salary) : "",
      "Start Date": e.startDate ?? "",
      "Event": e.eventName ?? "",
      // Task #187 — Position writes through to workforce.positionId. Pre
      // -fill with the current title so admins editing other columns
      // don't accidentally clear the assignment by leaving the cell blank.
      "Position": e.positionTitle ?? "",
      "SMP Company Name": e.employmentType === "smp" ? (e.smpCompanyName ?? "") : "",
      "Notes": "",
    }));
    if (rows.length === 0) {
      rows.push({ "Employee #": "C000001", "Full Name": "Example Name", "National ID/Iqama (read-only)": "1000000000", "Phone (read-only)": "0500000000", "Salary (SAR)": 4000, "Start Date": "2026-01-01", "Event": "", "Position": "", "SMP Company Name": "", "Notes": "" });
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    // Set column widths — Position column (8th, 26ch) sits between
    // Event and SMP Company Name to mirror the dialog's field order.
    ws["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 26 }, { wch: 28 }, { wch: 32 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    // Add Events reference sheet
    if (allEventsForBulk.length > 0) {
      const evSheet = XLSX.utils.json_to_sheet(allEventsForBulk.map(ev => ({ "Event Name": ev.name })));
      XLSX.utils.book_append_sheet(wb, evSheet, "Events (Reference)");
    }
    // Add Positions reference sheet — same active filter the dialog
    // dropdown uses, so anything an admin types into the Position cell
    // can be copy/pasted from this sheet.
    const activePositionsForBulk = allPositionsForBulk.filter(p => p.isActive);
    if (activePositionsForBulk.length > 0) {
      const posSheet = XLSX.utils.json_to_sheet(activePositionsForBulk.map(p => ({
        "Position Title": p.title,
        "Department": p.departmentName ?? "",
      })));
      XLSX.utils.book_append_sheet(wb, posSheet, "Positions (Reference)");
    }
    // Add SMP Companies reference sheet
    if (allSmpCompaniesForBulk.length > 0) {
      const smpSheet = XLSX.utils.json_to_sheet(allSmpCompaniesForBulk.map(c => ({ "Company Name": c.name, "Active": c.isActive ? "Yes" : "No" })));
      XLSX.utils.book_append_sheet(wb, smpSheet, "SMP Companies (Reference)");
    }
    XLSX.writeFile(wb, `workforce_bulk_update_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: tt("toast.templateDownloaded"), description: tt("toast.templateDownloadedDesc") });
  }

  async function handleBulkUpdateSubmit() {
    if (!bulkUpdateFile) return;
    setBulkUpdateLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", bulkUpdateFile);
      const res = await fetch("/api/workforce/bulk-update", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Upload failed");
      setBulkUpdateResult(data);
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      qc.invalidateQueries({ queryKey: ["/api/workforce/stats"] });
    } catch (e: any) {
      toast({ title: tt("toast.uploadFailed"), description: e.message, variant: "destructive" });
    } finally {
      setBulkUpdateLoading(false);
    }
  }

  const employeeIds = useMemo(() => employees.map(e => e.id), [employees]);
  const { data: lastPrintDates = {} } = useQuery<Record<string, string | null>>({
    queryKey: ["/api/workforce/last-printed-bulk", employeeIds],
    queryFn: () =>
      employeeIds.length > 0
        ? apiRequest("POST", "/api/workforce/last-printed-bulk", { employeeIds }).then(r => r.json())
        : Promise.resolve({}),
    enabled: employeeIds.length > 0,
    refetchInterval: 30000,
  });

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }, [sortField]);

  const sortedEmployees = useMemo(() => {
    if (!sortField) return employees;
    return [...employees].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      switch (sortField) {
        case "employeeNumber": aVal = a.employeeNumber; bVal = b.employeeNumber; break;
        case "fullNameEn": aVal = (a.fullNameEn ?? "").toLowerCase(); bVal = (b.fullNameEn ?? "").toLowerCase(); break;
        case "nationalId": aVal = a.nationalId ?? ""; bVal = b.nationalId ?? ""; break;
        case "phone": aVal = a.phone ?? ""; bVal = b.phone ?? ""; break;
        case "salary": aVal = Number(a.salary ?? 0); bVal = Number(b.salary ?? 0); break;
        case "startDate": aVal = a.startDate ?? ""; bVal = b.startDate ?? ""; break;
        case "endDate": aVal = a.endDate ?? ""; bVal = b.endDate ?? ""; break;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [employees, sortField, sortDir]);

  const allSelected = sortedEmployees.length > 0 && selectedIds.size === sortedEmployees.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedEmployees.map(e => e.id)));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const selectedEmployees = sortedEmployees.filter(e => selectedIds.has(e.id));
  const showTerminated = statusFilter === "terminated" || statusFilter === "all";

  function handleExportCSV() {
    const data = selectedIds.size > 0 ? selectedEmployees : sortedEmployees;
    exportToCSV(data, tt);
    toast({ title: tt("toast.exportedCsv", { count: data.length, n: formatNumber(data.length) }) });
  }

  async function handleExportExcel() {
    const data = selectedIds.size > 0 ? selectedEmployees : sortedEmployees;
    await exportToExcel(data, tt);
    toast({ title: tt("toast.exportedExcel", { count: data.length, n: formatNumber(data.length) }) });
  }

  async function handlePrintIdCards(emps: Employee[]) {
    if (emps.length === 0) return;
    const ids = new Set(emps.map((e) => e.id));
    setPrintingIds(ids);
    setPrintProgress({ total: emps.length, done: 0 });
    try {
      const eventId = emps[0]?.eventId;
      const templateUrl = eventId
        ? `/api/id-card-templates/active?eventId=${encodeURIComponent(eventId)}`
        : "/api/id-card-templates/active";
      let templateRes: Record<string, unknown> | null = null;
      try {
        templateRes = await apiRequest("GET", templateUrl).then((r) => r.json());
      } catch {
        templateRes = null;
      }
      const lc = (templateRes?.layoutConfig as Record<string, unknown>) ?? {};
      const templateConfig: IdCardTemplateConfig = templateRes
        ? {
            name: templateRes.name as string,
            logoUrl: templateRes.logoUrl as string | null,
            backgroundImageUrl: templateRes.backgroundImageUrl as string | null,
            fields: templateRes.fields as string[],
            fieldPlacements: (lc.fieldPlacements as IdCardTemplateConfig["fieldPlacements"]) ?? undefined,
            backgroundColor: templateRes.backgroundColor as string,
            textColor: templateRes.textColor as string,
            accentColor: templateRes.accentColor as string,
            layout: lc.layout as "horizontal" | "vertical" | "compact" | undefined,
          }
        : {
            name: "Default",
            logoUrl: null,
            backgroundImageUrl: null,
            fields: ["fullName", "photo", "employeeNumber", "nationalId", "position"],
            backgroundColor: "#1a1a2e",
            textColor: "#ffffff",
            accentColor: "#16a34a",
          };

      let activePlugin: PrinterPluginConfig | null = null;
      try {
        const plugins: PrinterPluginConfig[] = await apiRequest("GET", "/api/printer-plugins").then(r => r.json());
        activePlugin = plugins.find(p => p.isActive) ?? null;
      } catch {
        activePlugin = null;
      }

      const cardData = emps.map(employeeToCardData);
      const results = await sendPrintJob(templateConfig, cardData, activePlugin);
      setPrintProgress({ total: emps.length, done: emps.length });

      const statuses = results.map((r, i) => ({
        employeeId: emps[i].id,
        status: r.status,
        error: r.error,
      }));

      try {
        await apiRequest("POST", "/api/id-card-print-jobs", {
          employeeIds: emps.map(e => e.id),
          templateId: templateRes?.id ?? null,
          printerPluginId: activePlugin?.id ?? null,
          statuses,
        });
      } catch {
        // Log failure is non-critical
      }

      const successCount = results.filter(r => r.status === "success").length;
      const pendingCount = results.filter(r => r.status === "pending").length;
      const failCount = results.filter(r => r.status === "failed").length;

      if (failCount === results.length) {
        toast({ title: tt("toast.printFailed"), description: tt("toast.printAllFailed"), variant: "destructive" });
      } else if (failCount > 0) {
        toast({ title: tt("toast.printPartial", { done: formatNumber(successCount + pendingCount), total: formatNumber(results.length) }), description: tt("toast.printPartialDesc", { n: formatNumber(failCount) }) });
      } else {
        toast({ title: tt("toast.printingCount", { count: emps.length, n: formatNumber(emps.length) }) });
      }

      qc.invalidateQueries({ queryKey: ["/api/workforce/last-printed-bulk"] });

      // Task #207 — prompt admin to send pickup SMS for eligible (success/pending) employees
      const eligibleIds = statuses.filter(s => s.status !== "failed").map(s => s.employeeId);
      if (eligibleIds.length > 0) {
        setPickupSmsDialog({ open: true, employeeIds: eligibleIds });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({ title: tt("toast.printFailed"), description: message, variant: "destructive" });
    } finally {
      setPrintingIds(new Set());
      setPrintProgress(null);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight" data-testid="text-page-title">{tt("page.title")}</h1>
            <p className="text-muted-foreground mt-1">{tt("page.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              className="h-11 border-border text-foreground font-bold uppercase tracking-wide text-xs gap-2"
              data-testid="button-broadcast"
              onClick={() => setLocation("/broadcast")}
            >
              <Radio className="h-4 w-4" />
              {tt("page.broadcast")}
            </Button>
            <Button
              variant="outline"
              className="h-11 border-border text-foreground font-bold uppercase tracking-wide text-xs gap-2"
              data-testid="button-bulk-update"
              onClick={() => { setBulkUpdateOpen(true); setBulkUpdateFile(null); setBulkUpdateResult(null); }}
            >
              <Upload className="h-4 w-4" />
              {tt("page.massUpdate")}
            </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs self-start sm:self-auto gap-2"
                data-testid="button-export"
              >
                <Download className="h-4 w-4" />
                {selectedIds.size > 0 ? tt("page.exportWithCount", { n: formatNumber(selectedIds.size) }) : tt("page.export")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleExportExcel} className="gap-2" data-testid="menu-export-excel">
                <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                {tt("page.exportExcel")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCSV} className="gap-2" data-testid="menu-export-csv">
                <FileText className="h-4 w-4 text-blue-400" />
                {tt("page.exportCsv")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handlePrintIdCards(selectedIds.size > 0 ? selectedEmployees : sortedEmployees)}
                className="gap-2"
                data-testid="menu-print-id-cards"
              >
                <Printer className="h-4 w-4 text-amber-400" />
                {selectedIds.size > 0 ? tt("page.printIdCardsWithCount", { n: formatNumber(selectedIds.size) }) : tt("page.printIdCards")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card border-border shadow-sm border-s-4 border-s-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{tt("stats.total")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-employees">{formatNumber(stats?.total ?? 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">{tt("stats.totalDesc")}</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{tt("stats.active")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-emerald-400" data-testid="stat-active-employees">{formatNumber(stats?.active ?? 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">{tt("stats.activeDesc")}</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{tt("stats.inOffboarding")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-amber-400" data-testid="stat-offboarding-employees">{formatNumber(stats?.inOffboarding ?? 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">{tt("stats.inOffboardingDesc")}</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{tt("stats.terminated")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-red-400" data-testid="stat-terminated-employees">{formatNumber(stats?.terminated ?? 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">{tt("stats.terminatedDesc")}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder={tt("filter.searchPlaceholder")}
              className="ps-10 h-12 bg-muted/30 border-border focus-visible:ring-primary/20 text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-employees"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setSelectedIds(new Set()); }}>
            <SelectTrigger className="w-full md:w-[180px] h-12 bg-background border-border" data-testid="select-status-filter">
              <SelectValue placeholder={tt("filter.activeOnly")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tt("filter.all")}</SelectItem>
              <SelectItem value="active">{tt("filter.activeOnly")}</SelectItem>
              <SelectItem value="terminated">{tt("filter.terminatedOnly")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-sm px-4 py-2.5">
            <span className="text-sm font-medium text-primary">{tt("selectionBar.selected", { count: selectedIds.size, n: formatNumber(selectedIds.size) })}</span>
            <span className="text-zinc-600">|</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-primary hover:text-white gap-1.5"
              onClick={() => handlePrintIdCards(selectedEmployees)}
              disabled={printingIds.size > 0}
              data-testid="button-bulk-print-id-cards"
            >
              {printingIds.size > 0 ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Printer className="h-3.5 w-3.5" />
              )}
              {printProgress
                ? tt("selectionBar.printingProgress", { done: formatNumber(printProgress.done), total: formatNumber(printProgress.total) })
                : tt("page.printIdCardsWithCount", { n: formatNumber(selectedIds.size) })}
            </Button>
            <span className="text-zinc-600">|</span>
            <Button variant="ghost" size="sm" className="text-xs text-zinc-400 hover:text-white" onClick={() => setSelectedIds(new Set())}>
              {tt("selectionBar.clearSelection")}
            </Button>
          </div>
        )}

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-display text-white">
              {tt("list.title")}
              <span className="ms-2 text-sm font-normal text-muted-foreground">{tt("list.count", { n: formatNumber(sortedEmployees.length) })}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : sortedEmployees.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Users className="h-12 w-12 text-muted-foreground/20 mb-4" />
                <p className="text-muted-foreground">{tt("list.empty")}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">{tt("list.emptyHint")}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-[50px] ps-4">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={toggleAll}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead className="w-[100px] text-muted-foreground">
                      <SortableHeader label={tt("columns.empNumber")} field="employeeNumber" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="text-muted-foreground">
                      <SortableHeader label={tt("columns.employee")} field="fullNameEn" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">
                      <SortableHeader label={tt("columns.nationalId")} field="nationalId" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">
                      <SortableHeader label={tt("columns.phone")} field="phone" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="text-muted-foreground hidden xl:table-cell">{tt("columns.jobEvent")}</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell text-end">
                      <SortableHeader label={tt("columns.salary")} field="salary" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="text-muted-foreground hidden xl:table-cell">{tt("columns.lastPrinted")}</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">
                      <SortableHeader label={tt("columns.startDate")} field="startDate" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </TableHead>
                    {showTerminated && (
                      <TableHead className="text-muted-foreground hidden md:table-cell">
                        <SortableHeader label={tt("columns.endDate")} field="endDate" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                      </TableHead>
                    )}
                    <TableHead className="text-muted-foreground">{tt("columns.status")}</TableHead>
                    <TableHead className="text-end text-muted-foreground pe-4">{tt("columns.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedEmployees.map((emp) => {
                    const st = statusBadge(emp.isActive, emp.offboardingStatus);
                    const initials = (emp.fullNameEn ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                    const checked = selectedIds.has(emp.id);
                    return (
                      <TableRow
                        key={emp.id}
                        className={`border-border hover:bg-muted/20 cursor-pointer ${checked ? "bg-primary/5" : ""}`}
                        data-testid={`row-employee-${emp.employeeNumber}`}
                      >
                        <TableCell className="ps-4" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleOne(emp.id)}
                            data-testid={`checkbox-${emp.id}`}
                          />
                        </TableCell>
                        <TableCell
                          className="font-mono text-xs text-primary font-semibold"
                          onClick={() => setSelectedEmployee(emp)}
                          data-testid={`text-empnum-${emp.id}`}
                        >
                          <span dir="ltr">{emp.employeeNumber}</span>
                        </TableCell>
                        <TableCell className="py-3" onClick={() => setSelectedEmployee(emp)}>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 border border-zinc-700">
                              <AvatarImage src={emp.photoUrl ?? undefined} />
                              <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xs">{initials}</AvatarFallback>
                            </Avatar>
                            <div className="font-medium text-white text-sm"><bdi>{emp.fullNameEn ?? "—"}</bdi></div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell font-mono text-xs text-zinc-400" onClick={() => setSelectedEmployee(emp)} dir="ltr">
                          {emp.nationalId ?? "—"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-zinc-400" onClick={() => setSelectedEmployee(emp)} dir="ltr">
                          {emp.phone ?? "—"}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell" onClick={() => setSelectedEmployee(emp)}>
                          {/* Task #187 — Position is the primary line; the
                              dummy free-text job title sub-line was removed
                              along with the dialog InfoRow. */}
                          <div className="space-y-0.5">
                            <div className="text-sm text-white">
                              {emp.positionTitle ? (
                                <>
                                  <bdi>{emp.positionTitle}</bdi>
                                  {emp.positionIsActive === false && <span className="text-amber-400 text-xs ms-1">{tt("columns.inactiveSuffix")}</span>}
                                </>
                              ) : (
                                <span className="text-zinc-500">—</span>
                              )}
                            </div>
                            {emp.eventName && <div className="text-xs text-primary/70"><bdi>{emp.eventName}</bdi></div>}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-end text-sm text-white font-medium" onClick={() => setSelectedEmployee(emp)}>
                          {emp.salary ? formatNumber(Number(emp.salary)) : "—"}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-xs text-zinc-400" onClick={() => setSelectedEmployee(emp)} data-testid={`text-last-printed-${emp.id}`}>
                          {lastPrintDates[emp.id] ? <span dir="ltr">{formatDate(lastPrintDates[emp.id])}</span> : <span className="text-zinc-600">{tt("columns.never")}</span>}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-zinc-400" onClick={() => setSelectedEmployee(emp)} dir="ltr">
                          {formatDate(emp.startDate)}
                        </TableCell>
                        {showTerminated && (
                          <TableCell className="hidden md:table-cell text-sm text-zinc-400" onClick={() => setSelectedEmployee(emp)} dir="ltr">
                            {emp.endDate ? formatDate(emp.endDate) : "—"}
                          </TableCell>
                        )}
                        <TableCell onClick={() => setSelectedEmployee(emp)}>
                          <Badge variant="outline" className={`text-[10px] font-medium border ${st.className}`} data-testid={`badge-status-${emp.id}`}>
                            {st.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-end pe-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              onClick={(e) => { e.stopPropagation(); handlePrintIdCards([emp]); }}
                              disabled={printingIds.has(emp.id)}
                              data-testid={`button-print-id-${emp.id}`}
                              title={tt("row.printIdCardTitle")}
                            >
                              {printingIds.has(emp.id) ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Printer className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-white"
                              onClick={() => setSelectedEmployee(emp)}
                              data-testid={`button-view-${emp.id}`}
                            >
                              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <EmployeeDetailDialog
        employee={selectedEmployee}
        open={!!selectedEmployee}
        onOpenChange={(o) => !o && setSelectedEmployee(null)}
        onUpdated={() => {
          qc.invalidateQueries({ queryKey: ["/api/workforce"] });
          setSelectedEmployee(null);
        }}
        onPrintCard={(emp) => handlePrintIdCards([emp])}
        onEmployeeRefreshed={(emp) => setSelectedEmployee(emp)}
      />

      {/* ── Bulk Mass Update Dialog ─────────────────────────────────────────── */}
      <Dialog open={bulkUpdateOpen} onOpenChange={o => { if (!o) { setBulkUpdateOpen(false); setBulkUpdateResult(null); setBulkUpdateFile(null); } }}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              {tt("bulkUpdate.title")}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              {tt("bulkUpdate.description")}
            </DialogDescription>
          </DialogHeader>

          {!bulkUpdateResult ? (
            <div className="space-y-5 mt-1">
              {/* Step 1 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold">1</span>
                  {tt("bulkUpdate.step1")}
                </div>
                <div
                  className="bg-muted/30 border border-border/50 rounded-md p-3 text-sm text-muted-foreground [&_b]:text-foreground [&_b]:font-medium"
                  dangerouslySetInnerHTML={{ __html: tt("bulkUpdate.step1Desc") }}
                />
                <Button variant="outline" className="w-full gap-2 border-primary/40 text-primary hover:bg-primary/10" onClick={downloadBulkTemplate} data-testid="button-download-template">
                  <FileSpreadsheet className="h-4 w-4" />
                  {tt("bulkUpdate.downloadButton")}
                </Button>
              </div>

              {/* Step 2 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold">2</span>
                  {tt("bulkUpdate.step2")}
                </div>
                <label
                  htmlFor="bulk-update-file"
                  className="flex flex-col items-center justify-center gap-2 w-full h-28 border-2 border-dashed border-border/60 rounded-md cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors text-muted-foreground text-sm"
                  data-testid="label-bulk-upload"
                >
                  {bulkUpdateFile ? (
                    <>
                      <FileSpreadsheet className="h-6 w-6 text-emerald-400" />
                      <span className="font-medium text-foreground"><bdi>{bulkUpdateFile.name}</bdi></span>
                      <span className="text-xs">{tt("bulkUpdate.fileSize", { kb: formatNumber(Number((bulkUpdateFile.size / 1024).toFixed(1))) })}</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6" />
                      <span>{tt("bulkUpdate.uploadHint")}</span>
                      <span className="text-xs">{tt("bulkUpdate.uploadFormats")}</span>
                    </>
                  )}
                </label>
                <input
                  id="bulk-update-file"
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  data-testid="input-bulk-update-file"
                  onChange={e => setBulkUpdateFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" className="border-border" onClick={() => setBulkUpdateOpen(false)}>{tt("bulkUpdate.cancel")}</Button>
                <Button
                  data-testid="button-submit-bulk-update"
                  disabled={!bulkUpdateFile || bulkUpdateLoading}
                  onClick={handleBulkUpdateSubmit}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                >
                  {bulkUpdateLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> {tt("bulkUpdate.processing")}</> : <><Upload className="h-4 w-4" /> {tt("bulkUpdate.apply")}</>}
                </Button>
              </div>
            </div>
          ) : (
            /* Results */
            <div className="space-y-4 mt-1">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-950/30 border border-emerald-700/40 rounded-md p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{formatNumber(bulkUpdateResult.updated)}</p>
                  <p className="text-xs text-emerald-300/70 mt-0.5">{tt("bulkUpdate.updated")}</p>
                </div>
                <div className="bg-muted/20 border border-border/40 rounded-md p-3 text-center">
                  <p className="text-2xl font-bold text-muted-foreground">{formatNumber(bulkUpdateResult.skipped)}</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">{tt("bulkUpdate.skipped")}</p>
                </div>
                <div className={`rounded-md p-3 text-center border ${bulkUpdateResult.errors.length > 0 ? "bg-red-950/30 border-red-700/40" : "bg-muted/20 border-border/40"}`}>
                  <p className={`text-2xl font-bold ${bulkUpdateResult.errors.length > 0 ? "text-red-400" : "text-muted-foreground"}`}>{formatNumber(bulkUpdateResult.errors.length)}</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">{tt("bulkUpdate.errors")}</p>
                </div>
              </div>

              {bulkUpdateResult.errors.length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  <p className="text-xs font-semibold uppercase tracking-wider text-red-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> {tt("bulkUpdate.rowsWithErrors")}</p>
                  {bulkUpdateResult.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm bg-red-950/20 border border-red-800/30 rounded p-2">
                      <span className="font-mono text-xs text-red-300 shrink-0 mt-0.5" dir="ltr">{e.employeeNumber}</span>
                      <span className="text-red-200/80">{e.reason}</span>
                    </div>
                  ))}
                </div>
              )}

              {bulkUpdateResult.updated > 0 && (
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  {tt("bulkUpdate.summary", { count: bulkUpdateResult.updated, n: formatNumber(bulkUpdateResult.updated), total: formatNumber(bulkUpdateResult.total) })}
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" className="border-border" onClick={() => { setBulkUpdateResult(null); setBulkUpdateFile(null); }}>
                  {tt("bulkUpdate.uploadAnother")}
                </Button>
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => setBulkUpdateOpen(false)}>
                  {tt("bulkUpdate.done")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pickupSmsDialog.open}
        onOpenChange={(open) => {
          if (!pickupSmsSending) {
            setPickupSmsDialog((prev) => ({ ...prev, open }));
          }
        }}
      >
        <AlertDialogContent data-testid="dialog-pickup-sms">
          <AlertDialogHeader>
            <AlertDialogTitle>{tt("pickupSms.dialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pickupSmsDialog.employeeIds.length === 1
                ? tt("pickupSms.dialogDescOne")
                : tt("pickupSms.dialogDescOther", { n: formatNumber(pickupSmsDialog.employeeIds.length) })}
              <br />
              <span className="text-xs text-muted-foreground">{tt("pickupSms.dialogHint")}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pickupSmsStatus && !pickupPluginActive && (
            <div
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2"
              data-testid="text-pickup-sms-no-plugin"
            >
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{tt("pickupSms.noPluginNote")}</span>
            </div>
          )}
          {pickupStatusError && (
            <div
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2"
              data-testid="text-pickup-sms-status-error"
            >
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{tt("pickupSms.statusErrorNote")}</span>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pickupSmsSending} data-testid="button-pickup-sms-skip">
              {tt("pickupSms.skip")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pickupSmsSending || !pickupPluginActive}
              data-testid="button-pickup-sms-send"
              onClick={async (e) => {
                e.preventDefault();
                const ids = pickupSmsDialog.employeeIds;
                setPickupSmsSending(true);
                try {
                  const res = await apiRequest("POST", "/api/id-card-pickup-sms/send", { employeeIds: ids });
                  const json = await res.json();
                  const sent = Number(json?.sent ?? 0);
                  const skipped = Number(json?.skipped ?? 0);
                  const failed = Number(json?.failed ?? 0);
                  if (sent === 0 && failed > 0) {
                    toast({
                      title: tt("pickupSms.sendFailedToast"),
                      description: tt("pickupSms.sentToastDesc", { skipped: formatNumber(skipped), failed: formatNumber(failed) }),
                      variant: "destructive",
                    });
                  } else {
                    toast({
                      title: tt("pickupSms.sentToast", { count: sent, n: formatNumber(sent) }),
                      description: skipped + failed > 0
                        ? tt("pickupSms.sentToastDesc", { skipped: formatNumber(skipped), failed: formatNumber(failed) })
                        : undefined,
                    });
                  }
                  setPickupSmsDialog({ open: false, employeeIds: [] });
                } catch (err: unknown) {
                  const message = err instanceof Error ? err.message : "Unknown error";
                  const isNoPlugin = /plugin|gateway|notConfigured/i.test(message);
                  toast({
                    title: isNoPlugin ? tt("pickupSms.noActivePluginToast") : tt("pickupSms.sendFailedToast"),
                    description: isNoPlugin ? undefined : message,
                    variant: "destructive",
                  });
                } finally {
                  setPickupSmsSending(false);
                }
              }}
            >
              {pickupSmsSending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {tt("pickupSms.send")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
