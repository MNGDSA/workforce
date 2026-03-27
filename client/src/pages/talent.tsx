import DashboardLayout from "@/components/layout";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useCallback, useRef } from "react";
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
import { KSA_REGIONS } from "@shared/schema";

const statusStyles: Record<string, string> = {
  active: "bg-green-500/10 text-green-500",
  inactive: "bg-gray-500/10 text-gray-400",
  dormant: "bg-amber-500/10 text-amber-400",
  archived: "bg-slate-500/10 text-slate-400",
  blocked: "bg-red-500/10 text-red-500",
  hired: "bg-blue-500/10 text-blue-400",
  rejected: "bg-red-500/10 text-red-400",
  pending_review: "bg-amber-500/10 text-amber-400",
};

function getDisplayStatus(candidate: Candidate): string {
  if ((candidate as any).archivedAt) return "archived";
  if (candidate.status === "blocked" || candidate.status === "hired") return candidate.status;
  if (!candidate.profileCompleted) return "inactive";
  const lastLogin = (candidate as any).lastLoginAt;
  const createdAt = (candidate as any).createdAt;
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  if (lastLogin && new Date(lastLogin) < oneYearAgo) return "dormant";
  if (!lastLogin && createdAt && new Date(createdAt) < oneYearAgo) return "dormant";
  return candidate.status;
}

type SortField = "createdAt" | "fullNameEn" | "city" | "source" | "phone" | "email";

type ColumnKey = "id" | "candidate" | "classification" | "status" | "phone" | "email" | "city";

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "candidate", label: "Candidate" },
  { key: "classification", label: "Classification" },
  { key: "status", label: "Status" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "city", label: "City" },
];

const DEFAULT_VISIBLE: ColumnKey[] = ["id", "candidate", "classification", "status", "phone", "email", "city"];

const BULK_TEMPLATE_HEADERS = [
  "fullNameEn", "fullNameAr", "phone", "email", "nationalId",
  "city", "nationality", "gender", "dateOfBirth", "source"
];

const TEMPLATE_SAMPLE_ROWS = [
  ["John Doe", "جون دو", "0501234567", "john@example.com", "1234567890", "Makkah", "saudi", "male", "1990-01-15", "individual"],
  ["Jane Smith", "جين سميث", "0559876543", "jane@example.com", "0987654321", "Jeddah", "non_saudi", "female", "1992-06-20", "smp"],
];

function downloadTemplate(format: "csv" | "xlsx") {
  if (format === "xlsx") {
    const ws = XLSX.utils.aoa_to_sheet([BULK_TEMPLATE_HEADERS, ...TEMPLATE_SAMPLE_ROWS]);
    ws["!cols"] = BULK_TEMPLATE_HEADERS.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Candidates");
    XLSX.writeFile(wb, "candidate_upload_template.xlsx");
  } else {
    const csv = BULK_TEMPLATE_HEADERS.join(",") + "\n" +
      TEMPLATE_SAMPLE_ROWS.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "candidate_upload_template.csv";
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

function idLabel(val: string | null | undefined): string {
  if (!val) return "National / Iqama ID";
  if (val.startsWith("1")) return "National ID";
  if (val.startsWith("2")) return "Iqama ID";
  return "National / Iqama ID";
}

function StatusInfoHeader() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(true);
  }
  function hide() {
    timerRef.current = setTimeout(() => setVisible(false), 150);
  }

  return (
    <span className="inline-flex items-center gap-1">
      Status
      <span className="relative inline-flex items-center">
        <button
          type="button"
          className="text-muted-foreground hover:text-primary transition-colors focus:outline-none"
          onMouseEnter={show}
          onMouseLeave={hide}
          onClick={() => setVisible((v) => !v)}
          aria-label="Status definitions"
        >
          <Info className="h-2.5 w-2.5" />
        </button>
        {visible && (
          <span
            className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 w-72 rounded-sm bg-popover border border-border px-3.5 py-3 text-[11px] text-muted-foreground shadow-lg leading-relaxed space-y-1.5"
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            <span className="block"><span className="font-semibold text-green-400">Active</span> — Profile completed, account is live and ready.</span>
            <span className="block"><span className="font-semibold text-gray-400">Inactive</span> — Account created but profile not yet completed (e.g. bulk-uploaded SMP staff who haven't activated via OTP).</span>
            <span className="block"><span className="font-semibold text-blue-400">Hired</span> — Candidate converted to an active employee.</span>
            <span className="block"><span className="font-semibold text-red-400">Blocked</span> — Manually blocked by an admin. Cannot apply or be processed.</span>
            <span className="block"><span className="font-semibold text-amber-400">Dormant</span> — Was active but hasn't logged in for over 1 year.</span>
            <span className="absolute left-1/2 -translate-x-1/2 bottom-full h-0 w-0 border-x-4 border-x-transparent border-b-4 border-b-border" />
          </span>
        )}
      </span>
    </span>
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
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/candidates/${candidate!.id}`, data).then(r => r.json()),
    onSuccess: (updated) => {
      onSaved(updated);
      setEditing(false);
      toast({ title: "Profile updated" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
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
      emergencyContactName: c.emergencyContactName ?? "",
      emergencyContactPhone: c.emergencyContactPhone ?? "",
    });
    setEditing(true);
  }

  function handleSave() {
    if (form.ibanNumber && !/^SA\d{22}$/.test(form.ibanNumber)) {
      toast({ title: "Invalid IBAN", description: "IBAN must be SA followed by 22 digits (24 characters total)", variant: "destructive" });
      return;
    }
    const isNonSaudi = form.nationalityText !== "Saudi Arabian";
    saveMutation.mutate({
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
  const displaySt = getDisplayStatus(c);

  const nidValue = editing ? form.nationalId : (c.nationalId ?? "");
  const nidLabelText = idLabel(nidValue);

  return (
    <Sheet open={!!candidate} onOpenChange={(o) => { if (!o) { setEditing(false); onClose(); } }}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-card border-border overflow-y-auto p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 border-2 border-border">
              {(c as any).photoUrl && <AvatarImage src={(c as any).photoUrl} alt={c.fullNameEn} className="object-cover" />}
              <AvatarFallback className="bg-primary/10 text-primary font-display text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <SheetTitle className="font-display text-xl font-bold text-white truncate">{c.fullNameEn}</SheetTitle>
              <SheetDescription className="text-muted-foreground text-sm flex items-center gap-2 mt-0.5">
                {c.nationalId && <span>{c.nationalId}</span>}
                <Badge className={`text-[10px] px-1.5 py-0 ${statusStyles[displaySt] || statusStyles.active}`}>{displaySt}</Badge>
                {c.source === "smp" && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-400">SMP</Badge>}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="px-6 py-5 space-y-6">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contact</h4>
            <div className="space-y-2.5">
              {c.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-white" data-testid="profile-phone">{c.phone}</span>
                </div>
              )}
              {c.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-white" data-testid="profile-email">{c.email}</span>
                </div>
              )}
              {c.whatsapp && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-green-500 shrink-0" />
                  <span className="text-white">WhatsApp: {c.whatsapp}</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Location</h4>
            {editing ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">City</p>
                  <select value={form.city} onChange={e => setField("city", e.target.value)} className="w-full h-9 bg-muted/30 border border-border rounded-sm px-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none" data-testid="edit-city">
                    <option value="" className="bg-card text-muted-foreground">Select...</option>
                    {KSA_CITIES.map(c => <option key={c} value={c} className="bg-card text-white">{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Region</p>
                  <select value={form.region} onChange={e => setField("region", e.target.value)} className="w-full h-9 bg-muted/30 border border-border rounded-sm px-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none" data-testid="edit-region">
                    <option value="" className="bg-card text-muted-foreground">Select...</option>
                    {KSA_REGIONS.map(r => <option key={r} value={r} className="bg-card text-white">{r}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-white">{[c.city, c.region].filter(Boolean).join(", ") || "—"}</span>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Personal</h4>
            {editing ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Gender</p>
                  <select value={form.gender} onChange={e => setField("gender", e.target.value)} className="w-full h-9 bg-muted/30 border border-border rounded-sm px-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none capitalize" data-testid="edit-gender">
                    <option value="" className="bg-card text-muted-foreground">Select...</option>
                    {GENDER_OPTIONS.map(g => <option key={g} value={g} className="bg-card text-white capitalize">{g}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Date of Birth</p>
                  <DatePickerField value={form.dateOfBirth} onChange={v => setField("dateOfBirth", v)} className="h-9 bg-muted/30 border-border text-sm" data-testid="edit-dob" />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Nationality</p>
                  <select value={form.nationalityText} onChange={e => setField("nationalityText", e.target.value)} className="w-full h-9 bg-muted/30 border border-border rounded-sm px-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none" data-testid="edit-nationality">
                    <option value="" className="bg-card text-muted-foreground">Select...</option>
                    {NATIONALITY_OPTIONS.map(n => <option key={n} value={n} className="bg-card text-white">{n}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Marital Status</p>
                  <select value={form.maritalStatus} onChange={e => setField("maritalStatus", e.target.value)} className="w-full h-9 bg-muted/30 border border-border rounded-sm px-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none capitalize" data-testid="edit-marital">
                    <option value="" className="bg-card text-muted-foreground">Select...</option>
                    {MARITAL_OPTIONS.map(m => <option key={m} value={m} className="bg-card text-white capitalize">{m}</option>)}
                  </select>
                </div>
                <div className="space-y-1 col-span-2">
                  <p className="text-[11px] text-muted-foreground">{nidLabelText}</p>
                  <Input value={form.nationalId} onChange={e => setField("nationalId", e.target.value)} placeholder="10-digit ID number" maxLength={10} className="h-9 bg-muted/30 border-border text-sm font-mono" data-testid="edit-national-id" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {c.gender && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">Gender</p>
                    <p className="text-sm text-white capitalize">{c.gender}</p>
                  </div>
                )}
                {c.dateOfBirth && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">Date of Birth</p>
                    <p className="text-sm text-white">{c.dateOfBirth}</p>
                  </div>
                )}
                {((c as any).nationalityText || c.nationality) && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">Nationality</p>
                    <p className="text-sm text-white capitalize">{(c as any).nationalityText || c.nationality?.replace("_", " ")}</p>
                  </div>
                )}
                {c.maritalStatus && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">Marital Status</p>
                    <p className="text-sm text-white capitalize">{c.maritalStatus}</p>
                  </div>
                )}
                {c.nationalId && (
                  <div className="col-span-2">
                    <p className="text-[11px] text-muted-foreground">{nidLabelText}</p>
                    <p className="text-sm text-white font-mono">{c.nationalId}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Education</h4>
            {editing ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Education Level</p>
                  <select value={form.educationLevel} onChange={e => setField("educationLevel", e.target.value)} className="w-full h-9 bg-muted/30 border border-border rounded-sm px-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none" data-testid="edit-education">
                    <option value="" className="bg-card text-muted-foreground">Select...</option>
                    {EDU_OPTIONS.map(e => <option key={e} value={e} className="bg-card text-white">{e}</option>)}
                  </select>
                </div>
                {form.educationLevel === "University and higher" && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">Major / Field of Study</p>
                    <Input value={form.major} onChange={e => setField("major", e.target.value)} placeholder="e.g. Business Administration" className="h-9 bg-muted/30 border-border text-sm" data-testid="edit-major" />
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {c.educationLevel && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">Level</p>
                    <p className="text-sm text-white">{c.educationLevel}</p>
                  </div>
                )}
                {c.major && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">Major</p>
                    <p className="text-sm text-white">{c.major}</p>
                  </div>
                )}
                {!c.educationLevel && !c.major && <p className="text-sm text-muted-foreground col-span-2">—</p>}
              </div>
            )}
            {c.skills && c.skills.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] text-muted-foreground mb-1.5">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.skills.map((s, i) => (
                    <Badge key={i} variant="outline" className="text-[11px] px-2 py-0.5 border-border text-white/80">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
            {c.languages && c.languages.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] text-muted-foreground mb-1.5">Languages</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.languages.map((l, i) => (
                    <Badge key={i} variant="outline" className="text-[11px] px-2 py-0.5 border-primary/30 text-primary">{l}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">IBAN</h4>
            {editing ? (
              <div className="space-y-1">
                <Input value={form.ibanNumber} onChange={e => setField("ibanNumber", e.target.value.toUpperCase())} placeholder="SA0000000000000000000000" maxLength={24} className="h-9 bg-muted/30 border-border text-sm font-mono" data-testid="edit-iban" />
                {form.ibanNumber && !form.ibanNumber.match(/^SA\d{22}$/) && (
                  <p className="text-[11px] text-amber-400">IBAN must be SA followed by 22 digits (24 chars total)</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-white font-mono">{c.ibanNumber || "—"}</p>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Emergency Contact</h4>
            {editing ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Name</p>
                  <Input value={form.emergencyContactName} onChange={e => setField("emergencyContactName", e.target.value)} placeholder="Full name" className="h-9 bg-muted/30 border-border text-sm" data-testid="edit-emergency-name" />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Phone</p>
                  <Input value={form.emergencyContactPhone} onChange={e => setField("emergencyContactPhone", e.target.value)} placeholder="05xxxxxxxx" className="h-9 bg-muted/30 border-border text-sm" data-testid="edit-emergency-phone" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground">Name</p>
                  <p className="text-sm text-white">{c.emergencyContactName || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Phone</p>
                  <p className="text-sm text-white">{c.emergencyContactPhone || "—"}</p>
                </div>
              </div>
            )}
          </div>

          {c.hasChronicDiseases && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Health Notes
              </h4>
              <p className="text-sm text-amber-200/80">{c.chronicDiseases || "Chronic condition noted"}</p>
            </div>
          )}

          {c.notes && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Notes</h4>
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
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Changes
              </Button>
              <Button size="sm" variant="outline" className="border-border" onClick={() => setEditing(false)}>
                Cancel
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
                Edit
              </Button>
              <Button size="sm" variant="outline" className="border-border" onClick={onClose}>
                Close
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function TalentPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(new Set(DEFAULT_VISIBLE));
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<Record<string, string>[] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [profileCandidate, setProfileCandidate] = useState<Candidate | null>(null);
  const [exporting, setExporting] = useState(false);
  const [blockCandidate, setBlockCandidate] = useState<Candidate | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<Candidate | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmAction, setBulkConfirmAction] = useState<"block" | "unblock" | "archive" | null>(null);

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

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: "100",
    sortBy,
    sortOrder,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(status && status !== "all" && status !== "dormant" && status !== "inactive" && status !== "archived" ? { status } : {}),
    ...(status === "dormant" ? { dormant: "true" } : {}),
    ...(status === "inactive" ? { inactive: "true" } : {}),
    ...(status === "archived" ? { archived: "true" } : {}),
    ...(sourceFilter && sourceFilter !== "all" ? { source: sourceFilter } : {}),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["/api/candidates", page, debouncedSearch, status, sourceFilter, sortBy, sortOrder],
    queryFn: () => apiRequest("GET", `/api/candidates?${queryParams.toString()}`).then(r => r.json()),
  });

  const { data: statsData } = useQuery({
    queryKey: ["/api/candidates/stats"],
    queryFn: () => apiRequest("GET", "/api/candidates/stats").then(r => r.json()),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/candidates/${id}`, { status }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/stats"] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/candidates/${id}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/stats"] });
      toast({ title: "Candidate archived" });
    },
    onError: () => toast({ title: "Failed to archive candidate", variant: "destructive" }),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/candidates/${id}/unarchive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/stats"] });
      toast({ title: "Candidate restored" });
    },
    onError: () => toast({ title: "Failed to restore candidate", variant: "destructive" }),
  });

  const bulkAction = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: "block" | "unblock" | "archive" }) =>
      apiRequest("POST", "/api/candidates/bulk-action", { ids, action }).then(r => r.json()),
    onSuccess: (data) => {
      const labels: Record<string, string> = { block: "blocked", unblock: "unblocked", archive: "archived" };
      toast({ title: `${data.affected} candidate(s) ${labels[data.action]}` });
      setSelectedIds(new Set());
      setBulkConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/stats"] });
    },
    onError: () => {
      toast({ title: "Bulk action failed", variant: "destructive" });
      setBulkConfirmAction(null);
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
    mutationFn: (candidates: Record<string, string>[]) => {
      const mapped = candidates.map(c => ({
        fullNameEn: c.fullNameEn || c.fullNameEn || "Unknown",
        fullNameAr: c.fullNameAr || undefined,
        phone: c.phone || undefined,
        email: c.email || undefined,
        nationalId: c.nationalId || undefined,
        city: c.city || undefined,
        nationality: c.nationality === "saudi" ? "saudi" : c.nationality === "non_saudi" ? "non_saudi" : undefined,
        gender: c.gender || undefined,
        dateOfBirth: c.dateOfBirth || undefined,
        source: c.source === "smp" ? "smp" : "individual",
      }));
      return apiRequest("POST", "/api/candidates/bulk", { candidates: mapped }).then(r => r.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/stats"] });
      if (data.skipped > 0) {
        const dupDetails = data.duplicates?.map((d: any) => `Row ${d.row}: ${d.reason}`).join("\n") ?? "";
        setUploadError(`${data.inserted} imported, ${data.skipped} skipped (duplicates):\n${dupDetails}`);
        toast({ title: "Upload Partial", description: `${data.inserted} imported, ${data.skipped} duplicates skipped.`, variant: "destructive" });
      } else {
        toast({ title: "Upload Complete", description: `${data.inserted} candidates imported successfully.` });
        setUploadOpen(false);
        setUploadFile(null);
        setUploadPreview(null);
        setUploadError(null);
      }
    },
    onError: (err: any) => {
      setUploadError(err.message || "Upload failed");
    },
  });

  const candidates: Candidate[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const PAGE_SIZE = 100;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === candidates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(candidates.map(c => c.id)));
    }
  }, [candidates, selectedIds.size]);

  const stats = statsData as { total: number; active: number; hired: number; blocked: number; avgRating: number } | undefined;

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
    setSelectedIds(new Set());
  }, []);

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
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortOrder === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadError(null);
    setUploadPreview(null);
    try {
      const rows = await parseFileToRows(file);
      if (rows.length === 0) {
        setUploadError("No data rows found in file");
        return;
      }
      if (rows.length > 1000) {
        setUploadError(`File contains ${rows.length.toLocaleString()} rows. Maximum allowed is 1,000.`);
        return;
      }
      setUploadPreview(rows);
    } catch (err: any) {
      setUploadError(err.message || "Could not parse file. Please use the template.");
    }
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch("/api/candidates/export", { credentials: "include" });
      if (!res.ok) throw new Error("Export request failed");
      const data = await res.json();
      const rows: any[][] = data.rows || [];
      const headers: string[] = data.headers || [];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws["!cols"] = headers.map(() => ({ wch: 20 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Candidates");
      XLSX.writeFile(wb, `candidates_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      toast({ title: "Export failed", description: "Could not export candidates.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Talent</h1>
            <p className="text-muted-foreground mt-1">
              Manage and search your candidate database.
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
              <Download className="mr-2 h-4 w-4" />
              {exporting ? "Exporting…" : "Export All"}
            </Button>
            <Button
              className="h-9 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs"
              onClick={() => { setUploadOpen(true); setUploadFile(null); setUploadPreview(null); setUploadError(null); }}
              data-testid="button-upload-candidates"
            >
              <Upload className="mr-2 h-4 w-4" />
              Bulk Upload
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Profiles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-profiles">
                {stats ? stats.total.toLocaleString() : "—"}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-green-500" data-testid="stat-active">
                {stats ? stats.active.toLocaleString() : "—"}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Hired</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-blue-500" data-testid="stat-hired">
                {stats ? stats.hired.toLocaleString() : "—"}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Blocked</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-red-500" data-testid="stat-blocked">
                {stats ? stats.blocked.toLocaleString() : "—"}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by ID, name, phone, email"
              className="pl-10 h-10 bg-muted/30 border-border focus-visible:ring-primary/20"
              value={search}
              onChange={handleSearchChange}
              data-testid="input-search-candidates"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); setSelectedIds(new Set()); }}>
              <SelectTrigger className="h-10 w-36 border-border bg-background" data-testid="select-status-filter">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="hired">Hired</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="dormant">Dormant</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1); setSelectedIds(new Set()); }}>
              <SelectTrigger className="h-10 w-40 border-border bg-background" data-testid="select-source-filter">
                <SelectValue placeholder="Classification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classifications</SelectItem>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="smp">SMP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-base font-display text-white">
              Candidate List
              {isFetching && <RefreshCw className="inline ml-2 h-3 w-3 animate-spin text-muted-foreground" />}
            </CardTitle>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 border-border bg-background gap-1.5" data-testid="button-toggle-columns">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Toggle columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {ALL_COLUMNS.map(({ key, label }) => (
                    <DropdownMenuCheckboxItem
                      key={key}
                      checked={visibleColumns.has(key)}
                      onCheckedChange={() => toggleColumn(key)}
                      onSelect={(e) => e.preventDefault()}
                      data-testid={`toggle-col-${key}`}
                    >
                      {label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages || 1} · {total.toLocaleString()} records
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : candidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">No candidates found</p>
                <p className="text-muted-foreground/60 text-sm mt-1">
                  {search ? "Try a different search term" : "Upload your candidate database to get started"}
                </p>
              </div>
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
                          {selectedIds.size === 0 ? (
                            <Square className="h-4 w-4" />
                          ) : selectedIds.size === candidates.length ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <MinusSquare className="h-4 w-4 text-primary" />
                          )}
                        </button>
                      </TableHead>
                      {col("id") && <TableHead className="w-[110px] text-muted-foreground">ID</TableHead>}
                      {col("candidate") && (
                        <TableHead
                          className="text-muted-foreground cursor-pointer select-none"
                          onClick={() => handleColumnSort("fullNameEn")}
                          data-testid="sort-candidate"
                        >
                          <span className="flex items-center">Candidate <SortIcon field="fullNameEn" /></span>
                        </TableHead>
                      )}
                      {col("classification") && (
                        <TableHead
                          className="text-muted-foreground cursor-pointer select-none"
                          onClick={() => handleColumnSort("source")}
                          data-testid="sort-classification"
                        >
                          <span className="flex items-center">Classification <SortIcon field="source" /></span>
                        </TableHead>
                      )}
                      {col("status") && <TableHead className="text-muted-foreground"><StatusInfoHeader /></TableHead>}
                      {col("phone") && (
                        <TableHead
                          className="text-muted-foreground cursor-pointer select-none"
                          onClick={() => handleColumnSort("phone")}
                          data-testid="sort-phone"
                        >
                          <span className="flex items-center">Phone <SortIcon field="phone" /></span>
                        </TableHead>
                      )}
                      {col("email") && (
                        <TableHead
                          className="text-muted-foreground cursor-pointer select-none"
                          onClick={() => handleColumnSort("email")}
                          data-testid="sort-email"
                        >
                          <span className="flex items-center">Email <SortIcon field="email" /></span>
                        </TableHead>
                      )}
                      {col("city") && (
                        <TableHead
                          className="text-muted-foreground cursor-pointer select-none"
                          onClick={() => handleColumnSort("city")}
                          data-testid="sort-city"
                        >
                          <span className="flex items-center">City <SortIcon field="city" /></span>
                        </TableHead>
                      )}
                      <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((candidate) => {
                      const displayStatus = getDisplayStatus(candidate);
                      return (
                        <TableRow key={candidate.id} className={`border-border hover:bg-muted/20 ${selectedIds.has(candidate.id) ? "bg-primary/5" : ""}`} data-testid={`row-candidate-${candidate.id}`}>
                          <TableCell className="px-2">
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
                            <TableCell className="font-mono text-xs text-muted-foreground">
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
                                <div>
                                  <p className="font-medium text-white text-sm">{candidate.fullNameEn}</p>
                                  {candidate.fullNameAr && (
                                    <p className="text-xs text-muted-foreground" dir="rtl">{candidate.fullNameAr}</p>
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
                                  (candidate as any).source === "smp"
                                    ? "bg-violet-500/10 text-violet-400"
                                    : "bg-blue-500/10 text-blue-400"
                                }`}
                                data-testid={`classification-${candidate.id}`}
                              >
                                {(candidate as any).source === "smp" ? "SMP" : "Individual"}
                              </Badge>
                            </TableCell>
                          )}
                          {col("status") && (
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`font-medium border-0 text-xs ${statusStyles[displayStatus] ?? "bg-muted text-muted-foreground"}`}
                                data-testid={`status-${candidate.id}`}
                              >
                                {displayStatus.replace("_", " ")}
                              </Badge>
                            </TableCell>
                          )}
                          {col("phone") && (
                            <TableCell>
                              <span className="text-sm text-muted-foreground font-mono">
                                {candidate.phone || "—"}
                              </span>
                            </TableCell>
                          )}
                          {col("email") && (
                            <TableCell>
                              <span className="text-sm text-muted-foreground truncate max-w-[180px] block">
                                {candidate.email || "—"}
                              </span>
                            </TableCell>
                          )}
                          {col("city") && (
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {candidate.city || "—"}
                              </span>
                            </TableCell>
                          )}
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" data-testid={`button-actions-${candidate.id}`}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  onClick={() => setProfileCandidate(candidate)}
                                  data-testid={`menu-view-profile-${candidate.id}`}
                                >
                                  <UserCheck className="mr-2 h-4 w-4" />
                                  View Profile
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (candidate.status === "blocked") {
                                      updateStatus.mutate({ id: candidate.id, status: "active" });
                                    } else {
                                      setBlockCandidate(candidate);
                                    }
                                  }}
                                  className={candidate.status === "blocked" ? "text-green-500" : "text-red-500"}
                                  data-testid={`menu-block-${candidate.id}`}
                                >
                                  <ShieldAlert className="mr-2 h-4 w-4" />
                                  {candidate.status === "blocked" ? "Unblock" : "Block"}
                                </DropdownMenuItem>
                                {status === "archived" ? (
                                  <DropdownMenuItem
                                    onClick={() => restoreMutation.mutate(candidate.id)}
                                    className="text-green-500"
                                    data-testid={`menu-restore-${candidate.id}`}
                                  >
                                    <ArchiveRestore className="mr-2 h-4 w-4" />
                                    Restore
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => setArchiveCandidate(candidate)}
                                    className="text-amber-500"
                                    data-testid={`menu-archive-${candidate.id}`}
                                  >
                                    <Archive className="mr-2 h-4 w-4" />
                                    Archive
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
                Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()} candidates
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPage(p => Math.max(1, p - 1)); setSelectedIds(new Set()); }}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="flex items-center text-xs text-muted-foreground px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPage(p => Math.min(totalPages, p + 1)); setSelectedIds(new Set()); }}
                  disabled={page === totalPages}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>

        {selectedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-lg shadow-2xl px-5 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-4 duration-200" data-testid="bulk-action-bar">
            <span className="text-sm font-medium text-white">
              {selectedIds.size} selected
            </span>
            <div className="h-5 w-px bg-border" />
            <Button
              size="sm"
              variant="outline"
              className="border-border text-muted-foreground hover:text-red-400 hover:border-red-400/50"
              onClick={() => setBulkConfirmAction("block")}
              data-testid="bulk-block"
            >
              <Ban className="h-3.5 w-3.5 mr-1.5" />
              Block
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-border text-muted-foreground hover:text-green-400 hover:border-green-400/50"
              onClick={() => setBulkConfirmAction("unblock")}
              data-testid="bulk-unblock"
            >
              <Unlock className="h-3.5 w-3.5 mr-1.5" />
              Unblock
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-border text-muted-foreground hover:text-orange-400 hover:border-orange-400/50"
              onClick={() => {
                const selected = candidates.filter(c => selectedIds.has(c.id));
                const ws = XLSX.utils.json_to_sheet(selected.map(c => ({
                  ID: c.nationalId ?? "—",
                  Name: c.fullNameEn,
                  Phone: c.phone,
                  Email: c.email,
                  City: c.city,
                  Region: c.region,
                  Status: c.status,
                  Source: (c as any).source,
                })));
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Selected Candidates");
                XLSX.writeFile(wb, `selected-candidates-${selectedIds.size}.xlsx`);
                toast({ title: `Exported ${selectedIds.size} candidate(s)` });
              }}
              data-testid="bulk-export"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-600 text-amber-500 hover:bg-amber-600/10"
              onClick={() => setBulkConfirmAction("archive")}
              data-testid="bulk-archive"
            >
              <Archive className="h-3.5 w-3.5 mr-1.5" />
              Archive
            </Button>
            <div className="h-5 w-px bg-border" />
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-white"
              onClick={() => setSelectedIds(new Set())}
              data-testid="bulk-deselect"
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Clear
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={!!bulkConfirmAction} onOpenChange={(o) => !o && setBulkConfirmAction(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-display">
              {bulkConfirmAction === "archive" ? "Archive" : bulkConfirmAction === "block" ? "Block" : "Unblock"} {selectedIds.size} candidate(s)?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {bulkConfirmAction === "archive"
                ? `This will archive ${selectedIds.size} candidate(s). They will be hidden from active listings but all their records (applications, interviews, onboarding) will be preserved. Archived candidates can be restored later.`
                : bulkConfirmAction === "block"
                ? `This will block ${selectedIds.size} candidate(s) from applying or being processed.`
                : `This will unblock ${selectedIds.size} candidate(s), restoring their active status.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border" data-testid="bulk-confirm-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={bulkConfirmAction === "archive" ? "bg-amber-600 hover:bg-amber-700" : bulkConfirmAction === "block" ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}
              onClick={() => bulkConfirmAction && bulkAction.mutate({ ids: [...selectedIds], action: bulkConfirmAction })}
              disabled={bulkAction.isPending}
              data-testid="bulk-confirm-action"
            >
              {bulkAction.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {bulkConfirmAction === "archive" ? "Archive" : bulkConfirmAction === "block" ? "Block" : "Unblock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Upload Candidates</DialogTitle>
            <DialogDescription>
              Upload an Excel or CSV file to add candidates to the talent pool. Download the template to match the required format.
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
                Download Excel Template
              </Button>
              <Button
                variant="outline"
                className="flex-1 justify-start gap-2 h-10 border-dashed"
                onClick={() => downloadTemplate("csv")}
                data-testid="button-download-template-csv"
              >
                <FileDown className="h-4 w-4 text-muted-foreground" />
                Download CSV Template
              </Button>
            </div>

            <div className="border border-dashed border-border rounded-sm p-6 text-center">
              {!uploadFile ? (
                <label className="cursor-pointer block">
                  <FileUp className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-1">Click to select an Excel or CSV file</p>
                  <p className="text-xs text-muted-foreground/60">Supports .xlsx and .csv · Maximum 1,000 rows</p>
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
                      <span className="text-sm font-medium text-white">{uploadFile.name}</span>
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
                      {uploadPreview.length.toLocaleString()} rows detected
                    </p>
                  )}
                </div>
              )}
            </div>

            {uploadPreview && uploadPreview.length > 0 && (
              <div className="border border-border rounded-sm overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 text-xs text-muted-foreground font-medium">
                  Preview (first 3 rows)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {Object.keys(uploadPreview[0]).slice(0, 5).map(h => (
                          <th key={h} className="text-left px-2 py-1.5 text-muted-foreground font-medium">{h}</th>
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

            {uploadError && (
              <p className="text-sm text-red-400">{uploadError}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setUploadOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-primary text-primary-foreground"
                disabled={!uploadPreview || uploadPreview.length === 0 || bulkUpload.isPending}
                onClick={() => uploadPreview && bulkUpload.mutate(uploadPreview)}
                data-testid="button-confirm-upload"
              >
                {bulkUpload.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload {uploadPreview?.length?.toLocaleString() ?? 0} Candidates
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
            <AlertDialogTitle className="text-white font-display">Block Candidate</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to block <span className="text-white font-medium">{blockCandidate?.fullNameEn}</span>? They will no longer appear in active candidate lists or be eligible for job applications.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
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
              Block Candidate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!archiveCandidate} onOpenChange={(o) => !o && setArchiveCandidate(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-display">Archive Candidate</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will archive <span className="text-white font-medium">{archiveCandidate?.fullNameEn}</span>. They will be hidden from active listings but all their records (applications, interviews, onboarding) will be preserved. You can restore them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
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
              Archive Candidate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
