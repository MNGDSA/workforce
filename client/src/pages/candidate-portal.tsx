import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { saPhoneSchema } from "@shared/phone";
import { sanitizeHumanName } from "@shared/name-sanitizer";
import { sanitizeSaMobileInput, normalizeSaMobileOnBlur, isValidSaMobile } from "@/lib/phone-input";
import { createPortal } from "react-dom";
import { printContract } from "@/lib/print-contract";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  LogOut,
  Briefcase,
  MapPin,
  CheckCircle2,
  UploadCloud,
  Bell,
  FileText,
  PenTool,
  Loader2,
  CalendarDays,
  Banknote,
  AlertCircle,
  X,
  ImageIcon,
  CreditCard,
  Landmark,
  User,
  ChevronDown,
  Save,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  Download,
  BadgeCheck,
  Hash,
  Clock,
  Building2,
  History,
  Package,
  Calendar,
  AlertTriangle,
  Shield,
  Camera,
  UserCheck,
  Printer,
  Plus,
  Send,
  MessageCircle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { NATIONALITY_OPTIONS_LIST } from "@/components/profile-setup-gate";
import { nationalityLabel } from "@/lib/i18n/nationalities";
import { useTranslation, Trans } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { toProxiedFileUrl } from "@/lib/file-url";
import { useToast } from "@/hooks/use-toast";
import { resolveSaudiBank, validateSaudiIban } from "@/lib/saudi-banks";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";

// ─── Photo Crop Helper ───────────────────────────────────────────────────────

function createCroppedImage(imageSrc: string, crop: Area, minSize = 400): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const outputSize = Math.max(minSize, crop.width, crop.height);
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, outputSize, outputSize);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("Failed to create image")); return; }
        resolve(new File([blob], "profile-photo.jpg", { type: "image/jpeg" }));
      }, "image/jpeg", 0.92);
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageSrc;
  });
}

interface QualityCheck {
  // `code`/`tipReason` are sent by the server (rekognition.ts) so the
  // client can render translated copy via portal:photoCrop.checks.
  // `name`/`tip` remain as a defensive English fallback if a future
  // server adds a check the client doesn't know about yet.
  code?: string;
  tipReason?: string;
  name: string;
  passed: boolean;
  tip?: string;
}

interface QualityResult {
  passed: boolean;
  checks: QualityCheck[];
  qualityCheckSkipped?: boolean;
}

function PhotoCropDialog({ open, imageSrc, onCrop, onClose, onRetry }: {
  open: boolean;
  imageSrc: string | null;
  onCrop: (file: File) => Promise<{ ok: boolean; qualityResult?: QualityResult; error?: string }>;
  onClose: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation(["portal", "common"]);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [qualityChecks, setQualityChecks] = useState<QualityCheck[] | null>(null);

  if (!open || !imageSrc) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70" data-testid="photo-crop-overlay">
      <div className="bg-card border border-border rounded-lg w-[90vw] max-w-md overflow-hidden max-h-[90vh] overflow-y-auto" data-testid="photo-crop-dialog">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">{t("portal:photoCrop.title")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{t("portal:photoCrop.hint")}</p>
          </div>
          <button onClick={() => { setQualityChecks(null); onClose(); }} className="text-muted-foreground hover:text-white" data-testid="button-crop-close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative w-full" style={{ height: 320 }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, area) => setCroppedArea(area)}
            cropShape="rect"
            showGrid={false}
          />
        </div>

        {qualityChecks && (
          <div className="mx-4 mt-3 p-3 rounded-lg border border-red-800/50 bg-red-950/30" data-testid="quality-checklist">
            <p className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" />
              {t("portal:photoCrop.qualityFailed")}
            </p>
            <div className="space-y-1.5">
              {qualityChecks.map((check, i) => {
                // Prefer translated copy via the stable `code` / `tipReason`
                // the server now sends. Fall back to the English `name`/`tip`
                // if the server adds a check this client doesn't yet have a
                // translation for.
                const labelKey = check.code ? `portal:photoCrop.checks.labels.${check.code}` : "";
                const tipKey   = check.tipReason ? `portal:photoCrop.checks.tips.${check.tipReason}` : "";
                const label = check.code ? t(labelKey, { defaultValue: check.name }) : check.name;
                const tipText = check.tipReason ? t(tipKey, { defaultValue: check.tip ?? "" }) : check.tip;
                return (
                  <div key={i} className="flex items-start gap-2" data-testid={`quality-check-${i}`}>
                    {check.passed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <X className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <span className={`text-xs font-medium ${check.passed ? "text-emerald-400" : "text-red-400"}`}>{label}</span>
                      {!check.passed && tipText && (
                        <p className="text-[11px] text-zinc-500 mt-0.5">{tipText}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 w-full border-red-800/50 text-red-400 hover:bg-red-950/50 gap-1.5"
              data-testid="button-try-different-photo"
              onClick={() => { setQualityChecks(null); onRetry(); }}
            >
              <Camera className="h-3.5 w-3.5" />
              {t("portal:photoCrop.tryDifferent")}
            </Button>
          </div>
        )}

        <div className="p-4 flex items-center gap-3">
          <label className="text-xs text-muted-foreground shrink-0">{t("portal:photoCrop.zoom")}</label>
          <input
            type="range" min={1} max={3} step={0.05}
            value={zoom} onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-emerald-600"
            data-testid="input-crop-zoom"
          />
          <Button
            size="sm"
            disabled={!croppedArea || processing}
            data-testid="button-crop-save"
            onClick={async () => {
              if (!croppedArea) return;
              setProcessing(true);
              setQualityChecks(null);
              try {
                const file = await createCroppedImage(imageSrc, croppedArea);
                const result = await onCrop(file);
                if (!result.ok && result.qualityResult?.checks) {
                  setQualityChecks(result.qualityResult.checks);
                }
              } catch { }
              setProcessing(false);
            }}
          >
            {processing ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">{t("portal:photoCrop.checking")}</span>
              </span>
            ) : t("portal:photoCrop.save")}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type JobPosting = {
  id: string;
  title: string;
  type: string;
  location?: string;
  region?: string;
  salaryMin?: number;
  salaryMax?: number;
  deadline?: string;
  description?: string;
  status: string;
};

type WorkforceRecord = {
  id: string;
  employeeNumber: string;
  employmentType: "individual" | "smp";
  salary: string | null;
  startDate: string;
  endDate: string | null;
  terminationReason: string | null;
  terminationCategory: string | null;
  offboardingCompletedAt: string | null;
  isActive: boolean;
  eventName: string | null;
  jobTitle: string | null;
  createdAt?: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  end_of_season: "End of Season",
  resignation: "Resignation",
  performance: "Performance",
  disciplinary: "Disciplinary",
  contract_expiry: "Contract Expiry",
  other: "Other",
};

// ─── Portal Mode Detection ────────────────────────────────────────────────────

type PortalMode = "candidate" | "employee_individual" | "employee_smp";

function resolvePortalMode(
  candidate: Record<string, unknown> | null | undefined,
  activeRecord: WorkforceRecord | null | undefined,
): PortalMode {
  if (activeRecord && activeRecord.isActive) {
    return activeRecord.employmentType === "smp" ? "employee_smp" : "employee_individual";
  }
  return "candidate";
}

// ─── Nav items per mode ───────────────────────────────────────────────────────

type NavKey = "dashboard" | "jobs" | "documents" | "contract" | "payslips" | "shift" | "excuses" | "assets" | "history";

function getNavItems(mode: PortalMode, hasWorkHistory: boolean): NavKey[] {
  switch (mode) {
    case "employee_individual":
      return ["dashboard", "shift", "excuses", "contract", "payslips", "history", "assets"];
    case "employee_smp":
      return ["dashboard", "shift", "excuses", "history"];
    case "candidate":
    default:
      return hasWorkHistory ? ["dashboard", "jobs", "history"] : ["jobs"];
  }
}

const NAV_LABELS: Record<NavKey, string> = {
  dashboard: "Dashboard",
  jobs: "Job Opportunities",
  documents: "Documents",
  contract: "My Contract",
  payslips: "Payslips",
  shift: "My Shift",
  excuses: "Excuses",
  assets: "Assets",
  history: "Work History",
};
// Source-of-truth English fallback retained for tests; runtime nav labels use t("portal:nav.<key>") below.

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Snapchat-pollution defence (April 2026 incident) — the apply form is
// the only public, unauthenticated write path into the candidate table.
// One Snapchat campaign produced 1,708 polluted rows in a single day —
// names like "𝚃𝚄𝚁𝙺𝚈 ابراهيم الحارثي 🍂" and emoji-only "Bandar 🌷" —
// because the schema was just `.min(2)`. We now sanitise here AND on the
// server (shared/schema.ts → fullNameEnSchema), so the same rule applies
// no matter which path triggers the insert.
const applySchema = z.object({
  fullNameEn: z
    .string()
    .min(1, "Full name is required")
    .transform((v, ctx) => {
      const r = sanitizeHumanName(v);
      if (!r.ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            r.reason === "too_short"
              ? "Full name is too short"
              : r.reason === "too_long"
                ? "Full name is too long"
                : r.reason === "no_letters"
                  ? "Full name must contain letters, not only emoji or symbols"
                  : "Full name is required",
        });
        return z.NEVER;
      }
      return r.canonical;
    }),
  phone: saPhoneSchema,
  nationalId: z.string().min(5, "National ID or Iqama number is required"),
});
type ApplyForm = z.infer<typeof applySchema>;

function ApplyDialog({
  job,
  open,
  onOpenChange,
  onSuccess,
}: {
  job: JobPosting | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: (jobId: string) => void;
}) {
  const { t } = useTranslation(["portal", "common"]);
  const { toast } = useToast();
  const form = useForm<ApplyForm>({
    resolver: zodResolver(applySchema),
    defaultValues: { fullNameEn: "", phone: "", nationalId: "" },
  });

  const apply = useMutation({
    mutationFn: async (data: ApplyForm) => {
      const candidate = await apiRequest("POST", "/api/candidates", {
        fullNameEn: data.fullNameEn,
        phone: data.phone,
        nationalId: data.nationalId,
      }).then((r) => r.json());

      await apiRequest("POST", "/api/applications", {
        candidateId: candidate.id,
        jobId: job!.id,
        status: "new",
      });

      return job!.id;
    },
    onSuccess: (jobId) => {
      toast({ title: t("portal:apply.submitted"), description: t("portal:apply.submittedDesc", { title: job?.title ?? "" }) });
      onSuccess(jobId);
      form.reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: t("portal:apply.failed"), description: t("portal:apply.failedDesc"), variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            {t("portal:apply.title")}
          </DialogTitle>
          {job && (
            <DialogDescription className="text-muted-foreground">
              <bdi>{job.title}</bdi> · {job.region ?? job.location ?? t("portal:apply.ksa")}
            </DialogDescription>
          )}
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => apply.mutate(d))} className="space-y-4 pt-1">
            {/* Snapchat-pollution defence — explicit autocomplete hints
                so the in-app browser maps each visible field to the
                correct profile attribute instead of pasting the user's
                Snapchat *display name* into "Full Name" and the *same
                phone* into both phone slots. inputMode + name + type
                cooperate with the autofill heuristic on iOS/Android. */}
            <FormField control={form.control} name="fullNameEn" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("portal:apply.fullName")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("portal:apply.fullNamePlaceholder")}
                    className="bg-muted/30 border-border"
                    dir="ltr"
                    autoComplete="name"
                    autoCapitalize="words"
                    spellCheck={false}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="nationalId" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("portal:apply.nationalId")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("portal:apply.nationalIdPlaceholder")}
                    className="bg-muted/30 border-border"
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="off"
                    spellCheck={false}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("portal:apply.phone")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("portal:apply.phonePlaceholder")}
                    className="bg-muted/30 border-border"
                    dir="ltr"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" className="border-border" onClick={() => onOpenChange(false)}>
                {t("portal:common.cancel")}
              </Button>
              <Button type="submit" className="bg-primary text-primary-foreground font-bold min-w-[120px]" disabled={apply.isPending}>
                {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("portal:apply.submit")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function salaryLabel(job: JobPosting, t: (k: string, opts?: Record<string, unknown>) => string) {
  if (job.salaryMin && job.salaryMax) return t("portal:salary.rangeMo", { min: formatNumber(job.salaryMin), max: formatNumber(job.salaryMax) });
  if (job.salaryMin) return t("portal:salary.fromMo", { min: formatNumber(job.salaryMin) });
  return null;
}

function typeLabel(type: string, t: (k: string) => string) {
  const known = ["seasonal_full_time", "seasonal_part_time", "full_time", "part_time"];
  return known.includes(type) ? t(`portal:jobType.${type}`) : type;
}

function getApplicationBadge(_deadline: string | undefined, status: string, t: (k: string) => string) {
  // Three-state badge driven purely by application status — no deadline override.
  //   hired/offered                       → Hired
  //   rejected/withdrawn/closed           → Not Open
  //   anything else (new/reviewing/…)     → Under Review
  if (status === "hired" || status === "offered") {
    return { label: t("portal:appBadge.hired"), className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 border" };
  }
  if (status === "rejected" || status === "withdrawn" || status === "closed") {
    return { label: t("portal:appBadge.notOpen"), className: "bg-muted/60 text-muted-foreground border-border border" };
  }
  return { label: t("portal:appBadge.underReview"), className: "bg-amber-500/15 text-amber-400 border-amber-500/30 border" };
}

// ─── Profile Completion Card ──────────────────────────────────────────────────

type DocKey = "resume" | "nationalId" | "photo" | "iban";

const ALL_DOC_ITEMS: {
  key: DocKey;
  i18nKey: string;
  maxMb: number;
  accept: string;
  icon: React.ReactNode;
  smpOnly?: boolean;
  individualOnly?: boolean;
}[] = [
  { key: "photo",      i18nKey: "photo",      maxMb: 3, accept: ".jpg,.jpeg,.png",      icon: <ImageIcon className="h-4 w-4" /> },
  { key: "nationalId", i18nKey: "nationalId", maxMb: 5, accept: ".pdf,.jpg,.jpeg,.png", icon: <CreditCard className="h-4 w-4" /> },
  { key: "iban",       i18nKey: "iban",       maxMb: 5, accept: ".pdf,.jpg,.jpeg,.png", icon: <Landmark className="h-4 w-4" />, individualOnly: true },
  { key: "resume",     i18nKey: "resume",     maxMb: 5, accept: ".pdf,.doc,.docx",      icon: <FileText className="h-4 w-4" />, individualOnly: true },
];

function ProfileCompletionCard({
  toast,
  candidateId,
  isSmp = false,
}: {
  toast: ReturnType<typeof useToast>["toast"];
  candidateId: string;
  isSmp?: boolean;
}) {
  const { t } = useTranslation(["portal", "common"]);
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["/api/candidates/profile", candidateId],
    queryFn: () => apiRequest("GET", `/api/candidates/${candidateId}`).then((r) => r.json()),
    enabled: !!candidateId,
  });

  const DOC_ITEMS = isSmp
    ? ALL_DOC_ITEMS.filter(d => !d.individualOnly)
    : ALL_DOC_ITEMS;

  const dbFlags: Record<DocKey, boolean> = {
    resume: !!profile?.hasResume,
    nationalId: !!profile?.hasNationalId,
    photo: !!profile?.hasPhoto,
    iban: !!profile?.hasIban,
  };

  const [justUploaded, setJustUploaded] = useState<Record<DocKey, string | null>>({ resume: null, nationalId: null, photo: null, iban: null });
  const [uploading, setUploading] = useState<Record<DocKey, boolean>>({ resume: false, nationalId: false, photo: false, iban: false });
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [showCropDialog, setShowCropDialog] = useState(false);
  const inputRefs = {
    resume:     useRef<HTMLInputElement>(null),
    nationalId: useRef<HTMLInputElement>(null),
    photo:      useRef<HTMLInputElement>(null),
    iban:       useRef<HTMLInputElement>(null),
  };

  const docUrlMap: Record<DocKey, string | null> = {
    resume: toProxiedFileUrl(profile?.resumeUrl),
    photo: profile?.photoUrl || null,
    nationalId: toProxiedFileUrl(profile?.nationalIdFileUrl),
    iban: toProxiedFileUrl(profile?.ibanFileUrl),
  };

  const isDone = (key: DocKey) => dbFlags[key] || !!justUploaded[key];
  const doneCount = DOC_ITEMS.filter(({ key }) => isDone(key)).length;
  const pct = Math.round((doneCount / DOC_ITEMS.length) * 100);

  const handleDownload = useCallback((key: DocKey) => {
    const url = docUrlMap[key];
    if (url) window.open(url, "_blank");
  }, [profile]);

  const handleClick = useCallback((key: DocKey) => {
    inputRefs[key].current?.click();
  }, []);

  const [photoPendingReview, setPhotoPendingReview] = useState(false);

  const { data: pendingPhotoRequestsInCard = [] } = useQuery<{ id: string; status: string }[]>({
    queryKey: ["/api/photo-change-requests", candidateId, "pending"],
    queryFn: () => apiRequest("GET", `/api/photo-change-requests?candidateId=${candidateId}&status=pending`).then(r => r.json()),
    enabled: !!candidateId,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (pendingPhotoRequestsInCard.length === 0 && photoPendingReview) {
      setPhotoPendingReview(false);
    }
  }, [pendingPhotoRequestsInCard, photoPendingReview]);

  const hasPendingPhotoChange = pendingPhotoRequestsInCard.length > 0 || photoPendingReview;

  const uploadFile = useCallback(async (key: DocKey, file: File): Promise<{ ok: boolean; qualityResult?: QualityResult; error?: string }> => {
    setUploading((p) => ({ ...p, [key]: true }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("docType", key);
      const res = await fetch(`/api/candidates/${candidateId}/documents`, {
        method: "POST",
        body: formData,
      });
      if (res.status === 422 && key === "photo") {
        const body = await res.json().catch(() => ({ message: "Photo quality check failed" }));
        return { ok: false, qualityResult: body.qualityResult, error: body.message };
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      const body = await res.json();
      if (key === "photo" && body.pendingReview) {
        setPhotoPendingReview(true);
        queryClient.invalidateQueries({ queryKey: ["/api/photo-change-requests", candidateId, "pending"] });
        toast({ title: t("portal:docs.photoSubmitted"), description: t("portal:docs.photoSubmittedDesc") });
      } else {
        setJustUploaded((p) => ({ ...p, [key]: file.name }));
        queryClient.invalidateQueries({ queryKey: ["/api/candidates/profile", candidateId] });
        const title = key === "photo" ? t("portal:docs.photoVerified") : t("portal:docs.fileUploaded");
        toast({ title, description: t("portal:docs.fileSaved", { name: file.name }) });
      }
      return { ok: true };
    } catch (err: any) {
      toast({ title: t("portal:docs.uploadFailed"), description: err?.message || t("portal:docs.tryAgain"), variant: "destructive" });
      return { ok: false, error: err?.message };
    } finally {
      setUploading((p) => ({ ...p, [key]: false }));
      if (inputRefs[key].current) inputRefs[key].current!.value = "";
    }
  }, [toast, candidateId, queryClient]);

  const handleFile = useCallback(async (key: DocKey, file: File | null) => {
    if (!file) return;
    const maxMb = key === "photo" ? 3 : 5;
    if (file.size > maxMb * 1024 * 1024) {
      toast({ title: t("portal:docs.fileTooLarge"), description: t("portal:docs.maxSize", { n: formatNumber(maxMb) }), variant: "destructive" });
      return;
    }
    if (key === "photo") {
      const reader = new FileReader();
      reader.onload = () => {
        setCropImageSrc(reader.result as string);
        setShowCropDialog(true);
      };
      reader.readAsDataURL(file);
      if (inputRefs[key].current) inputRefs[key].current!.value = "";
      return;
    }
    await uploadFile(key, file);
  }, [toast, uploadFile]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-display text-white">
          {t("portal:docs.requiredDocs")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("portal:docs.overallStrength")}</span>
            <span className={`font-bold ${pct === 100 ? "text-emerald-500" : "text-primary"}`}>{formatNumber(pct)}%</span>
          </div>
          <Progress value={pct} className="h-2" />
          {pct === 100 && (
            <p className="text-xs text-emerald-500 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> {t("portal:docs.complete")}
            </p>
          )}
        </div>

        <div className="space-y-2">
          {DOC_ITEMS.map(({ key, i18nKey, maxMb, accept, icon }) => {
            const label = t(`portal:docs.items.${i18nKey}`);
            const hint = t(`portal:docs.items.${i18nKey}Hint`, { n: formatNumber(maxMb) });
            const busy = uploading[key];
            const done = isDone(key);
            const uploadedName = justUploaded[key];
            const hasFileUrl = !!docUrlMap[key];
            const isPendingPhotoReview = key === "photo" && hasPendingPhotoChange;

            return (
              <div key={key}>
                <input
                  ref={inputRefs[key]}
                  type="file"
                  accept={accept}
                  className="hidden"
                  data-testid={`input-file-${key}`}
                  onChange={(e) => handleFile(key, e.target.files?.[0] ?? null)}
                />
                <div
                  className={`flex items-center gap-3 p-2.5 rounded-md transition-all select-none
                    ${isPendingPhotoReview ? "bg-amber-500/10 border border-amber-500/25 cursor-default" : ""}
                    ${!isPendingPhotoReview && done ? `bg-emerald-500/10 border border-emerald-500/25 ${hasFileUrl ? "cursor-pointer hover:bg-emerald-500/15" : "cursor-default"}` : ""}
                    ${!isPendingPhotoReview && !done && busy ? "bg-muted/20 border border-border opacity-70 cursor-wait" : ""}
                    ${!isPendingPhotoReview && !done && !busy ? "bg-muted/20 border border-border hover:border-primary/40 hover:bg-primary/5 group cursor-pointer" : ""}
                  `}
                  onClick={() => {
                    if (isPendingPhotoReview) return;
                    if (done && hasFileUrl) { handleDownload(key); }
                    else if (!done && !busy) { handleClick(key); }
                  }}
                  data-testid={`row-doc-${key}`}
                >
                  <div className={`shrink-0 rounded-full p-1.5
                    ${isPendingPhotoReview ? "bg-amber-500/20 text-amber-500" : done ? "bg-emerald-500/20 text-emerald-500" : busy ? "bg-muted text-muted-foreground" : "bg-muted/30 text-muted-foreground group-hover:text-primary group-hover:bg-primary/10"}`}>
                    {isPendingPhotoReview ? <Clock className="h-3.5 w-3.5" /> : busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? <CheckCircle2 className="h-3.5 w-3.5" /> : icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-tight ${isPendingPhotoReview ? "text-amber-400" : done ? "text-emerald-400" : "text-white"}`}>{label}</p>
                    {isPendingPhotoReview
                      ? <p className="text-[11px] text-amber-600 truncate flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5 inline-block" /> {t("portal:docs.newPhotoPending")}
                        </p>
                      : done
                        ? <p className="text-[11px] text-emerald-600 truncate flex items-center gap-1">
                            {hasFileUrl && <Download className="h-2.5 w-2.5 inline-block" />}
                            {uploadedName || (hasFileUrl ? t("portal:docs.clickToView") : t("portal:docs.uploaded"))}
                          </p>
                        : <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
                  </div>
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
                  {done && !isPendingPhotoReview && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleClick(key); }}
                      className="shrink-0 text-muted-foreground hover:text-primary transition-colors rounded-full p-1"
                      title={t("portal:docs.reupload")}
                      data-testid={`button-reupload-${key}`}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!done && !busy && !isPendingPhotoReview && (
                    <UploadCloud className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
      <PhotoCropDialog
        open={showCropDialog}
        imageSrc={cropImageSrc}
        onClose={() => { setShowCropDialog(false); setCropImageSrc(null); }}
        onCrop={async (croppedFile) => {
          const result = await uploadFile("photo", croppedFile);
          if (result.ok) {
            setShowCropDialog(false);
            setCropImageSrc(null);
          }
          return result;
        }}
        onRetry={() => {
          inputRefs.photo.current?.click();
        }}
      />
    </Card>
  );
}

// ─── My Shift Section (Employee Portal) ──────────────────────────────────────

type MyShiftData = {
  assignment: { id: string; templateId: string; startDate: string; endDate: string | null } | null;
  template: {
    id: string; name: string;
    sundayShiftId: string | null; mondayShiftId: string | null; tuesdayShiftId: string | null;
    wednesdayShiftId: string | null; thursdayShiftId: string | null; fridayShiftId: string | null;
    saturdayShiftId: string | null;
  } | null;
  shifts: Record<string, { id: string; name: string; startTime: string; endTime: string; color: string }>;
  attendance: Array<{ id: string; date: string; status: string; clockIn: string | null; clockOut: string | null; minutesWorked: number | null; minutesScheduled: number | null }>;
};

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const STATUS_COLORS: Record<string, string> = {
  present: "text-emerald-400",
  absent: "text-red-400",
  late: "text-yellow-400",
  excused: "text-blue-400",
};

function MyShiftSection({ workforceId }: { workforceId: string }) {
  const { t } = useTranslation(["portal", "common"]);
  const { data, isLoading } = useQuery<MyShiftData>({
    queryKey: ["/api/portal/my-shift", workforceId],
    queryFn: () => apiRequest("GET", `/api/portal/my-shift/${workforceId}`).then(r => r.json()),
  });

  const statusLabel = (s: string) => STATUS_COLORS[s] ? t(`portal:attendanceStatus.${s}`) : s;
  const statusColor = (s: string) => STATUS_COLORS[s] ?? "text-zinc-400";

  if (isLoading) return (
    <div className="flex items-center justify-center py-12 gap-2 text-zinc-500">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">{t("portal:shift.loading")}</span>
    </div>
  );

  if (!data?.assignment || !data?.template) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-10 text-center">
          <Calendar className="h-8 w-8 text-zinc-500 mx-auto mb-2" />
          <p className="text-zinc-400 text-sm">{t("portal:shift.noShift")}</p>
        </CardContent>
      </Card>
    );
  }

  const tmpl = data.template;
  const shiftMap = data.shifts;
  const dayShiftIds: Record<string, string | null> = {
    sunday: tmpl.sundayShiftId, monday: tmpl.mondayShiftId, tuesday: tmpl.tuesdayShiftId,
    wednesday: tmpl.wednesdayShiftId, thursday: tmpl.thursdayShiftId, friday: tmpl.fridayShiftId,
    saturday: tmpl.saturdayShiftId,
  };

  const today = new Date().getDay();
  const todayStr = new Date().toISOString().split("T")[0];
  const todayShiftId = dayShiftIds[DAY_KEYS[today]];
  const todayShift = todayShiftId ? shiftMap[todayShiftId] : null;
  const todayAtt = data.attendance.find(a => a.date === todayStr);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-display font-bold text-white">{t("portal:shift.title")}</h3>

      <Card className="bg-card border-border" data-testid="card-today-shift">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-400">{t("portal:shift.today")}</CardTitle>
        </CardHeader>
        <CardContent>
          {todayShift ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium"><bdi>{todayShift.name}</bdi></p>
                <p className="text-zinc-400 text-sm" dir="ltr">{todayShift.startTime} – {todayShift.endTime}</p>
              </div>
              <div className="text-end">
                {todayAtt ? (
                  <div className="space-y-1">
                    <span className={`text-sm font-semibold ${statusColor(todayAtt.status)}`} data-testid="text-today-status">{statusLabel(todayAtt.status)}</span>
                    <div className="text-xs text-zinc-400">
                      {todayAtt.clockIn ? t("portal:shift.in", { t: todayAtt.clockIn }) : t("portal:shift.notIn")}
                      {todayAtt.clockOut ? ` · ${t("portal:shift.out", { t: todayAtt.clockOut })}` : todayAtt.clockIn ? ` · ${t("portal:shift.notOut")}` : ""}
                    </div>
                    {todayAtt.minutesWorked != null && (
                      <div className="text-xs text-zinc-500">{t("portal:shift.minutes", { worked: formatNumber(todayAtt.minutesWorked), scheduled: todayAtt.minutesScheduled != null ? formatNumber(todayAtt.minutesScheduled) : "—" })}</div>
                    )}
                  </div>
                ) : (
                  <span className="text-zinc-500 text-xs" data-testid="text-today-pending">{t("portal:shift.awaiting")}</span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">{t("portal:shift.dayOff")}</p>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-400">{t("portal:shift.schedule", { name: tmpl.name })}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1">
            {DAY_KEYS.map((day, idx) => {
              const shiftId = dayShiftIds[day];
              const shift = shiftId ? shiftMap[shiftId] : null;
              const isToday = idx === today;
              const dayDate = new Date();
              dayDate.setDate(dayDate.getDate() + (idx - today));
              const dayStr = dayDate.toISOString().split("T")[0];
              const dayAtt = data.attendance.find(a => a.date === dayStr);
              const shortDayKey = ["sunShort","monShort","tueShort","wedShort","thuShort","friShort","satShort"][idx];
              return (
                <div key={day} className={`rounded p-2 text-center ${isToday ? "bg-primary/15 border border-primary/30" : "bg-muted/20"}`} data-testid={`day-shift-${day}`}>
                  <div className={`text-[10px] font-bold uppercase ${isToday ? "text-primary" : "text-zinc-500"}`}>{t(`portal:days.${shortDayKey}`)}</div>
                  {shift ? (
                    <>
                      <div className="text-xs text-white font-medium mt-1"><bdi>{shift.name}</bdi></div>
                      <div className="text-[10px] text-zinc-400 mt-0.5" dir="ltr">{shift.startTime} – {shift.endTime}</div>
                      {dayAtt && (
                        <div className={`text-[9px] mt-0.5 font-semibold ${statusColor(dayAtt.status)}`}>
                          {dayAtt.minutesWorked != null ? t("portal:shift.minutesShort", { n: formatNumber(dayAtt.minutesWorked) }) : statusLabel(dayAtt.status)}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-[10px] text-zinc-600 mt-1">{t("portal:shift.off")}</div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-400">{t("portal:shift.recent")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.attendance.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-4">{t("portal:shift.noRecords")}</p>
          ) : (
            <div className="space-y-1.5">
              {data.attendance.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14).map(rec => {
                const dateObj = new Date(rec.date + "T00:00:00");
                const dayKey = DAY_KEYS[dateObj.getDay()];
                return (
                  <div key={rec.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-muted/10" data-testid={`attendance-row-${rec.date}`}>
                    <div>
                      <span className="text-white font-medium" dir="ltr">{formatDate(rec.date)}</span>
                      <span className="text-zinc-500 text-xs ms-2">{t(`portal:days.${dayKey}`)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {rec.clockIn && <span className="text-zinc-400 text-xs" dir="ltr">{rec.clockIn}–{rec.clockOut ?? "?"}</span>}
                      {rec.minutesWorked != null && <span className="text-zinc-400 text-xs">{formatNumber(rec.minutesWorked)}/{rec.minutesScheduled != null ? formatNumber(rec.minutesScheduled) : "—"}{t("portal:shift.minutesShort", { n: "" }).replace(/\s*$/,"")}</span>}
                      <span className={`text-xs font-semibold ${statusColor(rec.status)}`}>{statusLabel(rec.status)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Excuse Requests Section (Employee Portal) ──────────────────────────────

type ExcuseRequest = {
  id: string;
  workforceId: string;
  date: string;
  reason: string;
  attachmentUrl: string | null;
  submittedAt: string;
  hadClockIn: boolean;
  effectiveClockOut: string | null;
  status: "pending" | "approved" | "rejected";
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
};

const EXCUSE_STATUS_STYLES: Record<string, { color: string; bg: string }> = {
  pending: { color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" },
  approved: { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  rejected: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
};

function ExcuseRequestSection({ workforceId }: { workforceId: string }) {
  const { t } = useTranslation(["portal", "common"]);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [excuseDate, setExcuseDate] = useState(() => new Date().toISOString().split("T")[0]);

  const { data: excuses = [], isLoading } = useQuery<ExcuseRequest[]>({
    queryKey: ["/api/excuse-requests", workforceId],
    queryFn: () => apiRequest("GET", `/api/excuse-requests?workforceId=${workforceId}`).then(r => r.json()),
  });

  const submitMut = useMutation({
    mutationFn: (data: { workforceId: string; date: string; reason: string }) =>
      apiRequest("POST", "/api/excuse-requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/excuse-requests", workforceId] });
      setShowForm(false);
      setReason("");
      setExcuseDate(new Date().toISOString().split("T")[0]);
      toast({ title: t("portal:excuse.submitted") });
    },
    onError: async (err: any) => {
      let msg = t("portal:excuse.failed");
      try { const body = await err.json?.(); if (body?.message) msg = body.message; } catch {}
      toast({ title: msg, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!reason.trim()) return;
    submitMut.mutate({ workforceId, date: excuseDate, reason: reason.trim() });
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-12 gap-2 text-zinc-500">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">{t("portal:excuse.loading")}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-display font-bold text-white">{t("portal:excuse.title")}</h3>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setShowForm(!showForm)}
          data-testid="button-new-excuse"
        >
          {showForm ? <XCircle className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? t("portal:excuse.cancel") : t("portal:excuse.newRequest")}
        </Button>
      </div>

      {showForm && (
        <Card className="bg-card border-border" data-testid="card-excuse-form">
          <CardContent className="pt-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{t("portal:excuse.date")}</label>
              <Input
                type="date"
                value={excuseDate}
                onChange={e => setExcuseDate(e.target.value)}
                className="mt-1 bg-muted/30 border-border"
                data-testid="input-excuse-date"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{t("portal:excuse.reason")}</label>
              <Textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={t("portal:excuse.reasonPlaceholder")}
                className="mt-1 bg-muted/30 border-border min-h-[80px]"
                data-testid="input-excuse-reason"
              />
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!reason.trim() || submitMut.isPending}
              className="w-full gap-1.5"
              data-testid="button-submit-excuse"
            >
              {submitMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t("portal:excuse.submit")}
            </Button>
          </CardContent>
        </Card>
      )}

      {excuses.length === 0 && !showForm ? (
        <Card className="bg-card border-border">
          <CardContent className="py-10 text-center">
            <MessageCircle className="h-8 w-8 text-zinc-500 mx-auto mb-2" />
            <p className="text-zinc-400 text-sm">{t("portal:excuse.empty")}</p>
            <p className="text-zinc-500 text-xs mt-1">{t("portal:excuse.emptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {excuses.map(excuse => {
            const st = EXCUSE_STATUS_STYLES[excuse.status] ?? EXCUSE_STATUS_STYLES.pending;
            return (
              <Card key={excuse.id} className="bg-card border-border" data-testid={`card-excuse-${excuse.id}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white" dir="ltr">{formatDate(excuse.date)}</span>
                      <Badge variant="outline" className={`text-[10px] ${st.bg} ${st.color}`} data-testid={`badge-excuse-status-${excuse.id}`}>
                        {t(`portal:excuse.status.${excuse.status}`)}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-zinc-500">
                      {excuse.hadClockIn ? t("portal:excuse.partial") : t("portal:excuse.full")}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-300">{excuse.reason}</p>
                  {excuse.hadClockIn && excuse.effectiveClockOut && (
                    <p className="text-xs text-amber-400 mt-1">{t("portal:excuse.effectiveOut", { t: excuse.effectiveClockOut })}</p>
                  )}
                  {excuse.reviewNotes && (
                    <p className="text-xs text-zinc-500 mt-2 border-t border-border pt-2">
                      {t("portal:excuse.hrNotes", { notes: excuse.reviewNotes })}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Placeholder Card ─────────────────────────────────────────────────────────

function PlaceholderCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  const { t } = useTranslation(["portal", "common"]);
  return (
    <Card className="bg-card border-border">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
        <div className="h-12 w-12 rounded-full bg-muted/20 flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
        <div>
          <p className="font-medium text-white">{title}</p>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground text-xs mt-1">
          {t("portal:common.comingSoon")}
        </Badge>
      </CardContent>
    </Card>
  );
}

// ─── Work History Section ─────────────────────────────────────────────────────

type ContractHistoryItem = {
  id: string;
  status: string;
  signedAt: string | null;
  createdAt: string;
  snapshotArticles: any[];
  snapshotVariables: Record<string, string>;
  generatedPdfUrl: string | null;
  onboardingId: string | null;
  templateId: string;
  onboardingStatus: string | null;
  onboardingConvertedAt: string | null;
  eventName: string | null;
  jobTitle: string | null;
};

function PayslipsSection({ candidateId }: { candidateId: string }) {
  const { t } = useTranslation(["portal", "common"]);
  const { data: payslips = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/payslips", candidateId],
    queryFn: () => apiRequest("GET", `/api/payslips/${candidateId}`).then(r => r.json()),
    enabled: !!candidateId,
  });

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (payslips.length === 0) return (
    <Card className="bg-card border-border">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <Banknote className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">{t("portal:payslips.empty")}</p>
        <p className="text-xs text-muted-foreground/60 mt-1">{t("portal:payslips.emptyHint")}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-display font-bold text-white">{t("portal:payslips.title")}</h3>
      <div className="space-y-3">
        {payslips.map((slip: any, i: number) => (
          <Card key={i} className="bg-card border-border" data-testid={`payslip-card-${i}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-white"><bdi>{slip.payRunName ?? t("portal:payslips.payment")}</bdi></p>
                  <p className="text-xs text-muted-foreground"><bdi>{slip.eventName ?? ""}</bdi> · <span dir="ltr">{slip.payRunLine?.effectiveDateFrom} → {slip.payRunLine?.effectiveDateTo}</span></p>
                </div>
                <Badge className={`text-xs border-0 ${slip.paymentMethod === "cash" ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                  {slip.paymentMethod === "cash" ? t("portal:payslips.cash") : t("portal:payslips.bankTransfer")}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="text-muted-foreground uppercase tracking-wider mb-1">{t("portal:payslips.grossEarned")}</p>
                  <p className="text-emerald-400 font-medium">{t("portal:payslips.currency", { n: formatNumber(parseFloat(slip.payRunLine?.grossEarned ?? 0)) })}</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wider mb-1">{t("portal:payslips.deductions")}</p>
                  <p className="text-red-400 font-medium">−{t("portal:payslips.currency", { n: formatNumber(parseFloat(slip.payRunLine?.totalDeductions ?? 0)) })}</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wider mb-1">{t("portal:payslips.netPaid")}</p>
                  <p className="text-white font-bold">{t("portal:payslips.currency", { n: formatNumber(parseFloat(slip.amount ?? 0)) })}</p>
                </div>
              </div>
              {slip.ibanUsed && (
                <p className="text-[10px] text-muted-foreground mt-2 font-mono" dir="ltr">{t("portal:payslips.iban", { iban: slip.ibanUsed })}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">{t("portal:payslips.paid", { date: slip.depositDate ? formatDate(slip.depositDate) : formatDate(slip.createdAt) })}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function WorkHistorySection({ candidateId }: { candidateId: string }) {
  const { t } = useTranslation(["portal", "common"]);
  const { data: allRecords = [], isLoading } = useQuery<WorkforceRecord[]>({
    queryKey: ["/api/workforce/all-by-candidate", candidateId],
    queryFn: () => apiRequest("GET", `/api/workforce/all-by-candidate/${candidateId}`).then(r => r.json()),
    enabled: !!candidateId,
  });

  const { data: contractHistory = [] } = useQuery<ContractHistoryItem[]>({
    queryKey: ["/api/candidates/contract-history", candidateId],
    queryFn: () => apiRequest("GET", `/api/candidates/${candidateId}/contract-history`).then(r => r.json()),
    enabled: !!candidateId,
  });

  const [viewingContract, setViewingContract] = useState<ContractHistoryItem | null>(null);

  const contractMatchMap = useMemo(() => {
    const map = new Map<string, ContractHistoryItem>();
    if (contractHistory.length === 0 || allRecords.length === 0) return map;
    const used = new Set<string>();
    const sorted = [...allRecords].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    for (const rec of sorted) {
      const recCreated = new Date(rec.createdAt ?? rec.startDate).getTime();
      let best: ContractHistoryItem | undefined;
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
  }, [contractHistory, allRecords]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (allRecords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-md">
        <History className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground">{t("portal:history.empty")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {allRecords.map((rec) => {
          const start = new Date(rec.startDate);
          const end = rec.endDate ? new Date(rec.endDate) : (rec.isActive ? new Date() : null);
          const durationDays = end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))) : null;
          const categoryLabel = rec.terminationCategory
            ? (["end_of_season","resignation","performance","disciplinary","contract_expiry","other"].includes(rec.terminationCategory)
                ? t(`portal:termCategory.${rec.terminationCategory}`)
                : rec.terminationCategory)
            : null;
          const linkedContract = contractMatchMap.get(rec.id);

          return (
            <Card key={rec.id} className="bg-card border-border" data-testid={`card-work-history-${rec.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-white font-mono text-sm" dir="ltr">{rec.employeeNumber}</span>
                      <Badge
                        className={`text-[10px] h-5 border-0 ${
                          rec.employmentType === "smp"
                            ? "bg-amber-500/15 text-amber-400"
                            : "bg-blue-500/15 text-blue-400"
                        }`}
                        data-testid={`badge-employment-type-${rec.id}`}
                      >
                        {rec.employmentType === "smp" ? t("portal:history.smpContract") : t("portal:history.individual")}
                      </Badge>
                      <Badge
                        className={`text-[10px] h-5 border-0 ${
                          rec.isActive
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-muted/40 text-muted-foreground"
                        }`}
                      >
                        {rec.isActive ? t("portal:history.active") : categoryLabel ?? t("portal:history.ended")}
                      </Badge>
                    </div>
                    {rec.jobTitle && (
                      <p className="text-sm text-white"><bdi>{rec.jobTitle}</bdi></p>
                    )}
                    {rec.eventName && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Building2 className="h-3 w-3" /> <bdi>{rec.eventName}</bdi>
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1" dir="ltr">
                        <Calendar className="h-3 w-3" />
                        {formatDate(start)}
                        {rec.endDate && (
                          <> → {formatDate(rec.endDate)}</>
                        )}
                      </span>
                      {durationDays !== null && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t("portal:history.duration", { count: durationDays, n: formatNumber(durationDays) })}
                        </span>
                      )}
                      {rec.salary && rec.employmentType !== "smp" && (
                        <span className="flex items-center gap-1">
                          <Banknote className="h-3 w-3" />
                          {t("portal:history.salaryMo", { n: formatNumber(Number(rec.salary)) })}
                        </span>
                      )}
                    </div>
                    {linkedContract && (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => setViewingContract(linkedContract)}
                          className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                          data-testid={`button-view-contract-${rec.id}`}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          {t("portal:history.viewContract")}
                          {linkedContract.signedAt && (
                            <span className="text-muted-foreground ms-1">
                              ({t("portal:history.signedOn", { date: formatDate(linkedContract.signedAt) })})
                            </span>
                          )}
                        </button>
                      </div>
                    )}
                    {!rec.isActive && rec.offboardingCompletedAt && (
                      <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        {t("portal:history.offboardingCompleted", { date: formatDate(rec.offboardingCompletedAt) })}
                      </p>
                    )}
                    {!rec.isActive && rec.terminationReason && (
                      <p className="text-xs text-muted-foreground mt-1 italic">{t("portal:history.reason", { reason: rec.terminationReason })}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {viewingContract && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70" onClick={() => setViewingContract(null)}>
          <div className="bg-card border border-border rounded-lg w-[90vw] max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} data-testid="contract-history-viewer">
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-semibold text-white">{t("portal:history.contractTitle")}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {viewingContract.jobTitle && <bdi>{viewingContract.jobTitle}</bdi>}
                  {viewingContract.jobTitle && viewingContract.eventName && " — "}
                  {viewingContract.eventName && <bdi>{viewingContract.eventName}</bdi>}
                  {viewingContract.signedAt && (
                    <span className="ms-2 text-emerald-400">
                      {t("portal:history.signedOn", { date: formatDate(viewingContract.signedAt) })}
                    </span>
                  )}
                </p>
              </div>
              <button onClick={() => setViewingContract(null)} className="text-muted-foreground hover:text-white" data-testid="button-close-contract-viewer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {(() => {
                const articles = Array.isArray(viewingContract.snapshotArticles) ? viewingContract.snapshotArticles : [];
                const vars: Record<string, string> = viewingContract.snapshotVariables ?? {};
                const replaceVars = (s: string) =>
                  Object.entries(vars).reduce(
                    (acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v ?? "")),
                    s ?? ""
                  );
                const signedAt = viewingContract.signedAt;
                const employeeName = vars.fullName || displayName;
                return (
                  <div
                    className="contract-print-area bg-white text-black rounded-lg p-8 space-y-6"
                    style={{ fontFamily: "'Cairo', system-ui, -apple-system, 'Segoe UI', sans-serif" }}
                    data-testid="contract-history-print-area"
                  >
                    {articles.map((article: any, idx: number) => (
                      <div key={idx}>
                        <h3 className="font-bold text-sm mb-1">
                          {t("portal:contract.article", { n: formatNumber(idx + 1), title: String(article.title || "").replace(/\{\{title\}\}\s*:?\s*/g, "").trim() })}
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
                          <p className="text-sm font-bold">{t("portal:contract.firstParty")}</p>
                          <p className="text-xs text-gray-600"><bdi>{vars.companyName || ""}</bdi></p>
                          <div className="border-b border-gray-400 mt-8 pt-6"></div>
                          <p className="text-xs text-gray-500">{t("portal:contract.authorizedSig")}</p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm font-bold">{t("portal:contract.secondParty")}</p>
                          <p className="text-xs text-gray-600"><bdi>{employeeName}</bdi></p>
                          {signedAt ? (
                            <div className="mt-4 pt-2 text-center">
                              <div className="inline-block border-2 border-emerald-600 rounded-md px-4 py-2">
                                <p className="text-xs font-bold text-emerald-700">{t("portal:contract.digitallySignedBadge")}</p>
                                <p className="text-[10px] text-gray-500 mt-0.5" dir="ltr">{formatDate(signedAt)}</p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="border-b border-gray-400 mt-8 pt-6"></div>
                              <p className="text-xs text-gray-500">{t("portal:contract.employeeSig")}</p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3 shrink-0 no-print">
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-700 gap-1.5"
                onClick={() => printContract(t("portal:history.contractTitle"))}
                data-testid="button-print-contract"
              >
                <Printer className="h-3.5 w-3.5" />
                {t("portal:history.printDownload")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setViewingContract(null)}
                className="border-zinc-700"
                data-testid="button-close-contract-history"
              >
                {t("common:actions.close")}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Termination Banner ───────────────────────────────────────────────────────

function TerminationBanner({ record }: { record: WorkforceRecord }) {
  const { t } = useTranslation(["portal", "common"]);
  const reason = record.terminationReason ? t("portal:termination.reasonSep", { reason: record.terminationReason }) : "";
  const text = record.endDate
    ? t("portal:termination.endedOn", { date: formatDate(record.endDate), reason })
    : t("portal:termination.endedOnUnknown", { reason });
  return (
    <div className="bg-red-950/30 border border-red-800/40 rounded-lg p-4 flex items-start gap-3" data-testid="termination-banner">
      <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-red-300">{t("portal:termination.ended")}</p>
        <p className="text-xs text-red-400/80 mt-0.5">{text}</p>
        <p className="text-xs text-muted-foreground mt-1">{t("portal:termination.preserved")}</p>
      </div>
    </div>
  );
}

// ─── Contract section (read-only or signable) ─────────────────────────────────

function ContractSection({
  candidateId,
  candidateName,
  readOnly = false,
  onboardingId,
}: {
  candidateId: string;
  candidateName?: string;
  readOnly?: boolean;
  onboardingId?: string;
}) {
  const { t } = useTranslation(["portal", "common"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [contractPreviewOpen, setContractPreviewOpen] = useState(false);
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);

  const contractQueryParams = onboardingId
    ? `onboardingId=${onboardingId}`
    : `candidateId=${candidateId}`;

  const { data: myContracts = [] } = useQuery<{ id: string; status: string; signedAt: string | null; templateId: string; snapshotArticles: any[]; snapshotVariables: Record<string, string> }[]>({
    queryKey: ["/api/candidate-contracts/mine", candidateId, onboardingId],
    queryFn: () => apiRequest("GET", `/api/candidate-contracts?${contractQueryParams}`).then(r => r.json()),
    enabled: !!candidateId,
  });

  const pendingContract = myContracts.find(c => c.status !== "signed");
  const signedContract = myContracts.find(c => c.status === "signed");
  const activeContract = pendingContract || (!readOnly || onboardingId ? signedContract : undefined);
  const contractIsSigned = activeContract?.status === "signed";

  const { data: contractPreview } = useQuery<{ contract: any; template: any; articles: any[]; variables: Record<string, string> }>({
    queryKey: ["/api/candidate-contracts/preview", activeContract?.id],
    queryFn: () => apiRequest("GET", `/api/candidate-contracts/${activeContract!.id}/preview`).then(r => r.json()),
    enabled: !!activeContract?.id,
  });

  const displayName = candidateName || "Employee";

  const signContractMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/candidate-contracts/${activeContract!.id}/sign`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidate-contracts/mine", candidateId, onboardingId] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/mine", candidateId] });
      toast({ title: t("portal:contract.signedSuccess") });
      setIsSignModalOpen(false);
    },
    onError: (e: any) => toast({ title: t("portal:contract.signError"), description: e?.message, variant: "destructive" }),
  });

  if (!activeContract) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/10 border border-border">
        <FileText className="h-8 w-8 text-muted-foreground" />
        <div>
          <div className="text-sm font-medium text-zinc-400">{t("portal:contract.noContract")}</div>
          <div className="text-xs text-muted-foreground">{t("portal:contract.noContractDesc")}</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`rounded-lg border overflow-hidden ${contractIsSigned ? "border-emerald-700/50 bg-emerald-950/10" : "border-yellow-700/50 bg-yellow-950/10"}`}>
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${contractIsSigned ? "bg-emerald-900/40" : "bg-yellow-900/40"}`}>
              {contractIsSigned ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <PenTool className="h-5 w-5 text-yellow-500" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white flex items-center gap-2 flex-wrap" data-testid="text-contract-title">
                {t("portal:contract.title")}
                <Badge className={`text-[10px] h-5 border-0 ${contractIsSigned ? "bg-emerald-500/15 text-emerald-400" : "bg-yellow-500/15 text-yellow-400"}`}>
                  {contractIsSigned ? t("portal:contract.signed") : t("portal:contract.awaiting")}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {contractIsSigned && activeContract.signedAt
                  ? t("portal:contract.signedOn", { date: formatDate(activeContract.signedAt) })
                  : readOnly ? t("portal:contract.readOnly") : t("portal:contract.pleaseReview")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 ps-[52px]">
            <Button
              size="sm"
              variant="outline"
              className="border-border text-xs gap-1.5"
              onClick={() => setContractPreviewOpen(true)}
              data-testid="button-preview-contract"
            >
              <Eye className="h-3 w-3" />
              {contractIsSigned ? t("portal:contract.view") : t("portal:contract.preview")}
            </Button>
            {!contractIsSigned && !readOnly && (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground text-xs font-bold gap-1.5"
                onClick={() => setIsSignModalOpen(true)}
                data-testid="button-sign-contract"
              >
                <PenTool className="h-3 w-3" />
                {t("portal:contract.signNow")}
              </Button>
            )}
          </div>
        </div>
        {contractIsSigned && activeContract.signedAt && (
          <div className="px-4 pb-3 border-t border-emerald-800/30 pt-3 flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            {t("portal:contract.digitallySigned")}
          </div>
        )}
      </div>

      {/* Contract history for read-only / former view */}
      {myContracts.length > 1 && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-2">{t("portal:contract.history", { count: myContracts.length, n: formatNumber(myContracts.length) })}</p>
          <div className="space-y-1.5">
            {myContracts.slice(1).map(c => (
              <div key={c.id} className="flex items-center justify-between text-xs text-muted-foreground bg-muted/10 border border-border rounded px-3 py-2">
                <span>{t("portal:contract.title")} · {c.status}</span>
                {c.signedAt && <span dir="ltr">{formatDate(c.signedAt)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={contractPreviewOpen} onOpenChange={setContractPreviewOpen}>
        <DialogContent className="sm:max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              {t("portal:contract.title")}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {contractIsSigned ? t("portal:contract.yourSigned") : t("portal:contract.reviewBeforeSign")}
            </DialogDescription>
          </DialogHeader>
          {contractPreview && (
            <>
              <div className="contract-print-area mt-4 bg-white text-black rounded-lg p-8 space-y-6" style={{ fontFamily: "'Cairo', system-ui, -apple-system, 'Segoe UI', sans-serif" }} data-testid="contract-preview-content">
                {contractPreview.template?.logoUrl && (
                  <div className={`flex ${contractPreview.template?.logoAlignment === "left" ? "justify-start" : contractPreview.template?.logoAlignment === "right" ? "justify-end" : "justify-center"}`}>
                    <img src={contractPreview.template.logoUrl} alt="Company Logo" className="h-16 object-contain" />
                  </div>
                )}
                {contractPreview.template?.headerText && (
                  <p className="text-center text-xl font-bold border-b pb-4">{contractPreview.template.headerText}</p>
                )}
                {contractPreview.template?.preamble && (() => {
                  let preambleText = contractPreview.template.preamble;
                  if (contractPreview.variables) {
                    Object.entries(contractPreview.variables).forEach(([key, val]) => {
                      preambleText = preambleText.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(val));
                    });
                  }
                  return <div className="text-sm whitespace-pre-wrap leading-relaxed">{preambleText}</div>;
                })()}
                {Array.isArray(contractPreview.articles) && contractPreview.articles.map((article: any, idx: number) => {
                  let body = article.body || "";
                  if (contractPreview.variables) {
                    Object.entries(contractPreview.variables).forEach(([key, val]) => {
                      body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(val));
                    });
                  }
                  return (
                    <div key={idx}>
                      <h3 className="font-bold text-sm mb-1">{t("portal:contract.article", { n: formatNumber(idx + 1), title: String(article.title || "").trim() })}</h3>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{body}</p>
                      {Array.isArray(article.subArticles) && article.subArticles.map((sub: any, subIdx: number) => {
                        let subBody = sub.body || "";
                        if (contractPreview.variables) {
                          Object.entries(contractPreview.variables).forEach(([key, val]) => {
                            subBody = subBody.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(val));
                          });
                        }
                        return (
                          <div key={subIdx} className="ms-6 mt-2">
                            <h4 className="font-bold text-sm mb-0.5">{idx + 1}.{subIdx + 1} {sub.title}</h4>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{subBody}</p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {contractPreview.template?.footerText && (() => {
                  let footerText = contractPreview.template.footerText;
                  if (contractPreview.variables) {
                    Object.entries(contractPreview.variables).forEach(([key, val]) => {
                      footerText = footerText.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(val));
                    });
                  }
                  return <div className="border-t pt-4 mt-6"><p className="text-sm whitespace-pre-wrap leading-relaxed">{footerText}</p></div>;
                })()}
                <div className="border-t pt-6 mt-8">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <p className="text-sm font-bold">{t("portal:contract.firstParty")}</p>
                      <p className="text-xs text-gray-600"><bdi>{contractPreview.template?.companyName || ""}</bdi></p>
                      <div className="border-b border-gray-400 mt-8 pt-6"></div>
                      <p className="text-xs text-gray-500">{t("portal:contract.authorizedSig")}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-bold">{t("portal:contract.secondParty")}</p>
                      <p className="text-xs text-gray-600"><bdi>{contractPreview.variables?.fullName || displayName}</bdi></p>
                      {contractIsSigned && activeContract?.signedAt ? (
                        <div className="mt-4 pt-2 text-center">
                          <div className="inline-block border-2 border-emerald-600 rounded-md px-4 py-2">
                            <p className="text-xs font-bold text-emerald-700">{t("portal:contract.digitallySignedBadge")}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5" dir="ltr">
                              {formatDate(activeContract.signedAt)}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="border-b border-gray-400 mt-8 pt-6"></div>
                          <p className="text-xs text-gray-500">{t("portal:contract.employeeSig")}</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {contractPreview.template?.documentFooter && (
                  <div className="contract-page-footer" dangerouslySetInnerHTML={{ __html: (contractPreview.template.documentFooter || '').replace(/\n/g, '<br/>') }} />
                )}
              </div>
              <div className="flex justify-end gap-3 mt-4 no-print">
                <Button
                  variant="outline"
                  className="border-border gap-2"
                  onClick={() => printContract(t("portal:contract.title"))}
                  data-testid="button-print-contract-candidate"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t("portal:contract.printPdf")}
                </Button>
                <Button variant="outline" onClick={() => setContractPreviewOpen(false)} className="border-border">{t("common:actions.close")}</Button>
                {!contractIsSigned && !readOnly && (
                  <Button
                    onClick={() => { setContractPreviewOpen(false); setIsSignModalOpen(true); }}
                    className="bg-primary text-primary-foreground font-bold"
                    data-testid="button-proceed-to-sign"
                  >
                    <PenTool className="h-3.5 w-3.5 me-1.5" />
                    {t("portal:contract.proceedSign")}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Sign Modal */}
      <Dialog open={isSignModalOpen} onOpenChange={setIsSignModalOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <PenTool className="h-5 w-5 text-primary" />
              {t("portal:contract.signTitle")}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("portal:contract.signDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <p className="text-sm text-yellow-400 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {t("portal:contract.ensureRead")}
              </p>
            </div>
            <div className="bg-muted/20 rounded-lg p-3 text-sm text-muted-foreground space-y-1">
              <p><strong className="text-white">{t("portal:contract.dateLabel")}</strong> <span dir="ltr">{formatDate(new Date())}</span></p>
              <p><strong className="text-white">{t("portal:contract.methodLabel")}</strong> {t("portal:contract.method")}</p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsSignModalOpen(false)} className="border-border">{t("common:cancel")}</Button>
            <Button
              onClick={() => signContractMutation.mutate()}
              disabled={signContractMutation.isPending}
              className="bg-primary text-primary-foreground font-bold gap-2"
              data-testid="button-confirm-sign"
            >
              {signContractMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("portal:contract.agreeSign")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Portal ──────────────────────────────────────────────────────────────

export default function CandidatePortal() {
  const { t, i18n } = useTranslation(["portal", "common"]);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [applyOpen, setApplyOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [activeNav, setActiveNav] = useState<NavKey>("dashboard");
  const [profileOpen, setProfileOpen] = useState(false);
  const [photoChangeOpen, setPhotoChangeOpen] = useState(false);
  const photoChangeInputRef = useRef<HTMLInputElement>(null);
  const [photoChangeCropSrc, setPhotoChangeCropSrc] = useState<string | null>(null);
  const [photoChangeUploading, setPhotoChangeUploading] = useState(false);

  // Always start the portal at the very top — some browsers (especially
  // after the document direction flips to RTL) restore a stale scroll
  // position that lands the candidate halfway down the page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  const storedCandidate = (() => {
    try { return JSON.parse(localStorage.getItem("workforce_candidate") || "{}"); } catch { return {}; }
  })();
  const candidateId: string | undefined = storedCandidate.id;

  const { data: candidateProfile } = useQuery<Record<string, unknown>>({
    queryKey: ["/api/candidates/profile", candidateId],
    queryFn: () => apiRequest("GET", `/api/candidates/${candidateId}`).then((r) => r.json()),
    enabled: !!candidateId,
  });

  const { data: activeWorkforceRecord } = useQuery<WorkforceRecord | null>({
    queryKey: ["/api/workforce/by-candidate", candidateId],
    queryFn: () => apiRequest("GET", `/api/workforce/by-candidate/${candidateId}`).then(r => r.json()),
    enabled: !!candidateId,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  const { data: allWorkforceRecords = [] } = useQuery<WorkforceRecord[]>({
    queryKey: ["/api/workforce/all-by-candidate", candidateId],
    queryFn: () => apiRequest("GET", `/api/workforce/all-by-candidate/${candidateId}`).then(r => r.json()),
    enabled: !!candidateId,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  const portalMode = resolvePortalMode(candidateProfile, activeWorkforceRecord);
  const hasWorkHistory = allWorkforceRecords.length > 0;
  const isSmp = portalMode === "employee_smp"
    || (candidateProfile as any)?.classification === "smp";
  // SMP-classified candidates (pre-onboarding or activated) should not see the
  // individual job-application surface or the contract widget — those belong
  // to the individual track.
  const navItemsRaw = getNavItems(portalMode, hasWorkHistory);
  const navItems = isSmp
    ? navItemsRaw.filter((n) => n !== "jobs" && n !== "contract")
    : navItemsRaw;
  const isEmployee = portalMode === "employee_individual" || portalMode === "employee_smp";
  const mostRecentRecord = allWorkforceRecords[0] ?? null;

  useEffect(() => {
    if (!navItems.includes(activeNav)) {
      setActiveNav(navItems[0] ?? "jobs");
    }
  }, [portalMode, hasWorkHistory]);

  const { data: pendingPhotoRequests = [] } = useQuery<{ id: string; status: string; newPhotoUrl: string }[]>({
    queryKey: ["/api/photo-change-requests", candidateId, "pending"],
    queryFn: () => apiRequest("GET", `/api/photo-change-requests?candidateId=${candidateId}&status=pending`).then(r => r.json()),
    enabled: !!candidateId && isEmployee,
    refetchInterval: isEmployee && !!candidateId ? 30_000 : false,
    refetchOnWindowFocus: true,
  });
  const hasPendingPhotoChange = pendingPhotoRequests.length > 0;

  const { data: myOnboardingRecords = [] } = useQuery<{ id: string; status: string; candidateId: string; hasSignedContract: boolean; contractSignedAt: string | null }[]>({
    queryKey: ["/api/onboarding/mine", candidateId],
    queryFn: () => apiRequest("GET", `/api/onboarding?candidateId=${candidateId}`).then(r => r.json()),
    enabled: !!candidateId,
  });
  const sortedOnboarding = [...myOnboardingRecords].sort((a, b) =>
    new Date(b.contractSignedAt ?? 0).getTime() - new Date(a.contractSignedAt ?? 0).getTime()
  );
  const activeOnboarding = sortedOnboarding.find(o => o.status !== "converted" && o.status !== "rejected" && o.status !== "terminated");
  const currentOnboarding = activeOnboarding
    || (isEmployee ? sortedOnboarding.find(o => o.status === "converted") : undefined);
  const canSignContract = isEmployee || !!activeOnboarding;

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<JobPosting[]>({
    queryKey: ["/api/jobs", "active"],
    queryFn: () => apiRequest("GET", "/api/jobs?status=active").then(r => r.json()),
    enabled: portalMode === "candidate" && !isSmp,
  });

  const { data: myApplications = [], refetch: refetchApplications } = useQuery<{ jobId: string; status: string }[]>({
    queryKey: ["/api/applications/mine", candidateId],
    queryFn: () => apiRequest("GET", `/api/applications?candidateId=${candidateId}`).then(r => r.json()),
    enabled: !!candidateId && portalMode === "candidate" && !isSmp,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: myInterviews = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/interviews/mine", candidateId],
    queryFn: () => apiRequest("GET", `/api/interviews?candidateId=${candidateId}`).then(r => r.json()),
    enabled: !!candidateId && portalMode === "candidate" && !isSmp,
  });

  const appliedIds = new Set(myApplications.map(a => a.jobId));
  const appStatusByJob = Object.fromEntries(myApplications.map(a => [a.jobId, a.status]));
  const appliedJobs = jobs.filter(j => appliedIds.has(j.id));

  // ── Profile form state ──────────────────────────────────────────────────
  const [profileSkills,   setProfileSkills]   = useState("");
  const [profileLangs,    setProfileLangs]    = useState("");
  const [profileEduLevel, setProfileEduLevel] = useState("");
  const [profileMajor,    setProfileMajor]    = useState("");
  const [profileRegion,   setProfileRegion]   = useState("");
  const [profilePhone,    setProfilePhone]    = useState("");
  const [ibanValue,      setIbanValue]       = useState("");
  const [pwCurrent,  setPwCurrent]  = useState("");
  const [pwNew,      setPwNew]      = useState("");
  const [pwConfirm,  setPwConfirm]  = useState("");
  const [showPwCur,  setShowPwCur]  = useState(false);
  const [showPwNew,  setShowPwNew]  = useState(false);

  const EDU_OPTIONS = ["High School and below", "University and higher"] as const;
  const detectedBank = resolveSaudiBank(ibanValue);

  function normalizeTags(raw: string): string[] {
    return raw.split(/[،,;|/\t\r\n]+/).map(s => s.trim()).filter(Boolean);
  }
  function normalizeDisplay(raw: string): string {
    return normalizeTags(raw).join(", ");
  }

  const saveProfile = useMutation({
    mutationFn: async (data: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/candidates/${candidateId}`, data).then(r => r.json()),
    onSuccess: (updated) => {
      const existing = (() => { try { return JSON.parse(localStorage.getItem("workforce_candidate") || "{}"); } catch { return {}; } })();
      localStorage.setItem("workforce_candidate", JSON.stringify({ ...existing, ...updated }));
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/profile", candidateId] });
      toast({ title: t("portal:profile.updated"), description: t("portal:profile.updatedDesc") });
      setProfileOpen(false);
    },
    onError: (err: any) => toast({
      title: t("portal:profile.saveFailed"),
      description: err?.message || t("common:tryAgain"),
      variant: "destructive",
    }),
  });

  const changePassword = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/auth/change-password", {
        candidateId,
        currentPassword: pwCurrent,
        newPassword: pwNew,
      }).then(async (r) => {
        if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
        return r.json();
      }),
    onSuccess: () => {
      toast({ title: t("portal:password.changed"), description: t("portal:password.changedDesc") });
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
    },
    onError: (err: Error) => toast({ title: t("portal:password.failed"), description: err.message, variant: "destructive" }),
  });

  const handleProfileOpen = (open: boolean) => {
    if (open && candidateProfile) {
      setProfileSkills(Array.isArray(candidateProfile.skills) ? (candidateProfile.skills as string[]).join(", ") : "");
      setProfileLangs(Array.isArray(candidateProfile.languages) ? (candidateProfile.languages as string[]).join(", ") : "");
      setProfileEduLevel(String(candidateProfile.educationLevel ?? ""));
      setProfileMajor(String(candidateProfile.major ?? ""));
      setProfileRegion(String(candidateProfile.region ?? ""));
      setProfilePhone(String(candidateProfile.phone ?? storedCandidate.phone ?? ""));
      setIbanValue(String(candidateProfile.ibanNumber ?? ""));
    }
    if (!open) { setPwCurrent(""); setPwNew(""); setPwConfirm(""); }
    setProfileOpen(open);
  };

  const handleAvatarClick = () => {
    if (isEmployee) {
      setPhotoChangeOpen(true);
    } else {
      handleProfileOpen(true);
    }
  };

  const handlePhotoChangeFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoChangeCropSrc(reader.result as string);
      setPhotoChangeOpen(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handlePhotoChangeUpload = async (croppedFile: File): Promise<{ ok: boolean; qualityResult?: QualityResult; error?: string }> => {
    setPhotoChangeUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", croppedFile);
      formData.append("docType", "photo");
      const res = await fetch(`/api/candidates/${candidateId}/documents`, {
        method: "POST",
        body: formData,
      });
      if (res.status === 422) {
        const body = await res.json().catch(() => ({ message: "Photo quality check failed" }));
        return { ok: false, qualityResult: body.qualityResult, error: body.message };
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      const body = await res.json();
      if (body.pendingReview) {
        queryClient.invalidateQueries({ queryKey: ["/api/photo-change-requests", candidateId, "pending"] });
        toast({
          title: t("portal:photoChange.submitted"),
          description: t("portal:photoChange.submittedDesc"),
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/candidates/profile", candidateId] });
        toast({ title: t("portal:photoChange.uploaded") });
      }
      setPhotoChangeCropSrc(null);
      return { ok: true };
    } catch (err: any) {
      toast({ title: t("portal:docs.uploadFailed"), description: err.message, variant: "destructive" });
      return { ok: false, error: err?.message };
    } finally {
      setPhotoChangeUploading(false);
    }
  };

  function handleProfileSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw: Record<string, unknown> = {};
    fd.forEach((v, k) => { if (String(v).trim()) raw[k] = String(v).trim(); });
    const fn = String(raw.firstName ?? "").trim();
    const ln = String(raw.lastName  ?? "").trim();
    if (fn || ln) raw.fullNameEn = `${fn} ${ln}`.trim();
    delete raw.firstName; delete raw.lastName;
    raw.skills         = normalizeTags(profileSkills);
    raw.languages      = normalizeTags(profileLangs);
    raw.educationLevel = profileEduLevel || undefined;
    raw.major          = profileEduLevel === "University and higher" ? (profileMajor || undefined) : null;
    raw.region         = profileRegion || undefined;

    if (!profileRegion) {
      toast({ title: t("portal:profile.regionRequired"), description: t("portal:profile.regionRequiredDesc"), variant: "destructive" });
      return;
    }

    if (!isSmp) {
      const result = validateSaudiIban(ibanValue);
      if (!result.ok) {
        if (result.reason === "empty") {
          toast({ title: t("portal:profile.ibanRequired"), description: t("portal:profile.ibanRequiredDesc"), variant: "destructive" });
        } else if (result.reason === "missing_prefix") {
          toast({ title: t("portal:profile.ibanInvalid"), description: t("portal:profile.ibanInvalidPrefixDesc"), variant: "destructive" });
        } else if (result.reason === "wrong_length") {
          toast({ title: t("portal:profile.ibanInvalid"), description: t("portal:profile.ibanInvalidLengthDesc", { count: result.length ?? 0 }), variant: "destructive" });
        } else if (result.reason === "bad_checksum") {
          toast({ title: t("portal:profile.ibanInvalid"), description: t("portal:profile.ibanInvalidChecksumDesc"), variant: "destructive" });
        } else {
          toast({ title: t("portal:profile.ibanInvalid"), description: t("portal:profile.ibanInvalidCharsDesc"), variant: "destructive" });
        }
        return;
      }
      raw.ibanNumber   = result.canonical;
      raw.ibanBankName = result.bank?.ibanBankName ?? detectedBank?.ibanBankName ?? null;
      raw.ibanBankCode = result.bank?.ibanBankCode ?? detectedBank?.ibanBankCode ?? null;
    }
    saveProfile.mutate(raw);
  }

  const passwordRules = [
    { test: (p: string) => p.length >= 8,           label: t("portal:password.rules.len") },
    { test: (p: string) => /[A-Z]/.test(p),         label: t("portal:password.rules.upper") },
    { test: (p: string) => /[a-z]/.test(p),         label: t("portal:password.rules.lower") },
    { test: (p: string) => /[0-9]/.test(p),         label: t("portal:password.rules.number") },
    { test: (p: string) => /[^A-Za-z0-9]/.test(p),  label: t("portal:password.rules.special") },
  ];
  const allPasswordRulesMet = passwordRules.every(r => r.test(pwNew));

  function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (!allPasswordRulesMet) {
      toast({ title: t("portal:password.weak"), description: t("portal:password.weakDesc"), variant: "destructive" });
      return;
    }
    if (pwNew !== pwConfirm) {
      toast({ title: t("portal:password.mismatch"), description: t("portal:password.mismatchDesc"), variant: "destructive" });
      return;
    }
    changePassword.mutate();
  }

  const displayName: string = String(candidateProfile?.fullNameEn ?? storedCandidate.fullNameEn ?? "Candidate");
  const displayInitials = displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase() || "CA";

  const handleApplySuccess = (_jobId: string) => {
    refetchApplications();
  };

  // ── Portal mode label ────────────────────────────────────────────────────
  const portalTitle = isEmployee
    ? (isSmp ? t("portal:title.employeeSmp") : t("portal:title.employee"))
    : t("portal:title.candidate");

  const portalSubtitle = isEmployee
    ? (isSmp ? t("portal:subtitle.employeeSmp") : t("portal:subtitle.employee"))
    : hasWorkHistory
    ? t("portal:subtitle.candidateReturning")
    : t("portal:subtitle.candidateNew");

  // ── Content for current mode/tab ─────────────────────────────────────────

  function renderMainContent() {
    switch (activeNav) {
      case "documents":
        return (
          <div>
            <h3 className="text-lg font-display font-bold text-white mb-4">{t("portal:myDocs.title")}</h3>
            <ProfileCompletionCard toast={toast} candidateId={candidateId!} isSmp={false} />
          </div>
        );

      case "shift":
        return activeWorkforceRecord ? <MyShiftSection workforceId={activeWorkforceRecord.id} /> : <PlaceholderCard icon={<Calendar className="h-6 w-6" />} title={t("portal:shiftPlaceholder.title")} description={t("portal:shiftPlaceholder.desc")} />;

      case "excuses":
        return activeWorkforceRecord ? <ExcuseRequestSection workforceId={activeWorkforceRecord.id} /> : <PlaceholderCard icon={<MessageCircle className="h-6 w-6" />} title={t("portal:excusePlaceholder.title")} description={t("portal:excusePlaceholder.desc")} />;

      case "payslips":
        return candidateId ? <PayslipsSection candidateId={candidateId} /> : <PlaceholderCard icon={<Banknote className="h-6 w-6" />} title={t("portal:payslipsPlaceholder.title")} description={t("portal:payslipsPlaceholder.desc")} />;

      case "assets":
        if (portalMode === "employee_individual") {
          return <PlaceholderCard icon={<Package className="h-6 w-6" />} title={t("portal:assetsPlaceholder.title")} description={t("portal:assetsPlaceholder.desc")} />;
        }
        return null;

      case "history":
        return (
          <div>
            <h3 className="text-lg font-display font-bold text-white mb-4">{t("portal:nav.history")}</h3>
            <WorkHistorySection candidateId={candidateId!} />
          </div>
        );

      case "contract":
        return (
          <div>
            <h3 className="text-lg font-display font-bold text-white mb-4">{t("portal:nav.contract")}</h3>
            <ContractSection
              candidateId={candidateId!}
              candidateName={displayName}
              readOnly={!canSignContract}
              onboardingId={currentOnboarding?.id}
            />
          </div>
        );

      case "jobs": {
        const isRtl = i18n.language?.startsWith("ar");
        const dirAttr = isRtl ? "rtl" : undefined;
        return (
          <Tabs defaultValue="open">
            <div className="flex items-center justify-between mb-4" dir={dirAttr}>
              <h3 className="text-xl font-display font-bold text-white">
                {t("portal:jobs.title")}
              </h3>
              <TabsList className="bg-muted/20" dir={dirAttr}>
                <TabsTrigger value="open">{t("portal:jobs.openTab")}</TabsTrigger>
                <TabsTrigger value="applied">{appliedIds.size > 0 ? t("portal:jobs.appliedCount", { n: formatNumber(appliedIds.size) }) : t("portal:jobs.appliedTab")}</TabsTrigger>
              </TabsList>
            </div>
            {hasWorkHistory && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-center gap-2" data-testid="jobs-former-employee-message">
                <UserCheck className="h-4 w-4 shrink-0" />
                <span>{t("portal:jobs.formerMessage")}</span>
              </div>
            )}
            <TabsContent value="open" className="space-y-4">
              {jobsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-md">
                  <Briefcase className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground font-medium">{t("portal:jobs.noOpen")}</p>
                  <p className="text-muted-foreground/60 text-sm mt-1">{t("portal:jobs.checkBack")}</p>
                </div>
              ) : (
                jobs.map(job => {
                  const applied = appliedIds.has(job.id);
                  const salary = salaryLabel(job, t);
                  const regionRaw = job.region ?? job.location;
                  const regionLabel = regionRaw
                    ? (i18n.exists(`portal:regions.${regionRaw}`) ? t(`portal:regions.${regionRaw}`) : regionRaw)
                    : null;
                  return (
                    <Card
                      key={job.id}
                      className="bg-card border-border hover:border-primary/40 transition-all group cursor-pointer"
                      onClick={() => setLocation(`/jobs/${job.id}`)}
                      data-testid={`card-job-${job.id}`}
                    >
                      <CardContent className="p-5">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4" dir={dirAttr}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap" dir={dirAttr}>
                              <h4 className="font-bold text-white text-base group-hover:text-primary transition-colors"><bdi>{job.title}</bdi></h4>
                              <Badge variant="outline" className="border-border text-muted-foreground text-xs font-normal">{typeLabel(job.type, t)}</Badge>
                              {applied && (
                                <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 text-xs font-medium gap-1" dir={dirAttr}>
                                  <CheckCircle2 className="h-3 w-3" /> {t("portal:badge.applied")}
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground" dir={dirAttr}>
                              {regionLabel && (
                                <span className="flex items-center gap-1" dir={dirAttr}><MapPin className="h-3.5 w-3.5" />{regionLabel}</span>
                              )}
                              {salary && (
                                <span className="flex items-center gap-1 text-white font-medium" dir={dirAttr}><Banknote className="h-3.5 w-3.5 text-muted-foreground" />{salary}</span>
                              )}
                              {job.deadline && (
                                <span className="flex items-center gap-1 text-xs" dir={dirAttr}><CalendarDays className="h-3.5 w-3.5" />{t("portal:jobs.deadline", { date: formatDate(job.deadline, i18n.language) })}</span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0" onClick={e => e.stopPropagation()}>
                            {!applied && (
                              <Button
                                className="bg-primary text-primary-foreground font-bold hover:bg-primary/90"
                                onClick={() => setLocation(`/jobs/${job.id}`)}
                                data-testid={`button-apply-${job.id}`}
                              >
                                {t("portal:jobs.applyNow")}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>
            <TabsContent value="applied" className="space-y-4">
              {appliedJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-md">
                  <AlertCircle className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground font-medium">{t("portal:jobs.noApplied")}</p>
                </div>
              ) : (
                appliedJobs.map(job => (
                  <Card
                    key={job.id}
                    className="bg-card border-border hover:border-primary/40 transition-all cursor-pointer group"
                    onClick={() => setLocation(`/jobs/${job.id}`)}
                    data-testid={`card-applied-${job.id}`}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="font-bold text-white text-base group-hover:text-primary transition-colors"><bdi>{job.title}</bdi></div>
                          <div className="text-sm text-muted-foreground flex items-center gap-3 mt-1">
                            {(job.region ?? job.location) && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.region ?? job.location}</span>}
                            <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{typeLabel(job.type, t)}</span>
                          </div>
                        </div>
                        {(() => {
                          const badge = getApplicationBadge(job.deadline, appStatusByJob[job.id] ?? "new", t);
                          return <Badge className={`${badge.className} font-medium shrink-0`}>{badge.label}</Badge>;
                        })()}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        );
      }

      case "dashboard":
      default: {
        const completedRecords = allWorkforceRecords.filter(r => !r.isActive);
        const isFormerEmployee = !isEmployee && completedRecords.length > 0;
        const lastCompleted = completedRecords[0] ?? null;
        const feDurationDays = lastCompleted ? Math.max(0, Math.round(
          ((lastCompleted.endDate ? new Date(lastCompleted.endDate).getTime() : Date.now()) - new Date(lastCompleted.startDate).getTime()) / (1000 * 60 * 60 * 24)
        )) : 0;

        return (
          <div className="space-y-6">
            {isFormerEmployee && lastCompleted && (
              <Card className="bg-emerald-950/30 border border-emerald-700/30" data-testid="welcome-back-card">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="h-10 w-10 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                      <UserCheck className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-emerald-300 font-display">{t("portal:dashboard.welcomeBack")}</h3>
                      <p className="text-xs text-emerald-400/70 mt-0.5">{t("portal:dashboard.welcomeBackHint")}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("portal:dashboard.employeeId")}</p>
                      <p className="text-sm font-bold text-white font-mono mt-0.5" dir="ltr">{lastCompleted.employeeNumber}</p>
                    </div>
                    {lastCompleted.jobTitle && (
                      <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("portal:dashboard.lastPosition")}</p>
                        <p className="text-sm font-bold text-white mt-0.5"><bdi>{lastCompleted.jobTitle}</bdi></p>
                      </div>
                    )}
                    {lastCompleted.eventName && (
                      <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("portal:dashboard.lastEvent")}</p>
                        <p className="text-sm font-bold text-white mt-0.5"><bdi>{lastCompleted.eventName}</bdi></p>
                      </div>
                    )}
                    <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("portal:dashboard.durationLabel")}</p>
                      <p className="text-sm font-bold text-white mt-0.5">{t("portal:dashboard.duration", { count: feDurationDays, n: formatNumber(feDurationDays) })}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {!isEmployee && hasWorkHistory && !isFormerEmployee && mostRecentRecord && (
              <TerminationBanner record={mostRecentRecord} />
            )}

            {/* Employee info card (individual active) */}
            {portalMode === "employee_individual" && activeWorkforceRecord && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg font-display text-white flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-primary" />
                    {t("portal:dashboard.employmentDetails")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t("portal:dashboard.employeeNumber")}</p>
                      <p className="text-lg font-bold text-white font-mono" dir="ltr">{activeWorkforceRecord.employeeNumber}</p>
                    </div>
                    <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t("portal:dashboard.status")}</p>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        <p className="text-lg font-bold text-emerald-400">{t("portal:dashboard.active")}</p>
                      </div>
                    </div>
                    <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t("portal:dashboard.monthlySalary")}</p>
                      <p className="text-lg font-bold text-white"><bdi>{activeWorkforceRecord.salary ? formatCurrency(Number(activeWorkforceRecord.salary), "SAR", i18n.language) : "—"}</bdi></p>
                    </div>
                    <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t("portal:dashboard.startDate")}</p>
                      <p className="text-lg font-bold text-white"><bdi>{formatDate(activeWorkforceRecord.startDate, i18n.language)}</bdi></p>
                    </div>
                    {activeWorkforceRecord.jobTitle && (
                      <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t("portal:dashboard.position")}</p>
                        <p className="text-lg font-bold text-white"><bdi>{activeWorkforceRecord.jobTitle}</bdi></p>
                      </div>
                    )}
                    {activeWorkforceRecord.eventName && (
                      <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t("portal:dashboard.assignedEvent")}</p>
                        <p className="text-lg font-bold text-white"><bdi>{activeWorkforceRecord.eventName}</bdi></p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* SMP employee info card */}
            {portalMode === "employee_smp" && activeWorkforceRecord && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg font-display text-white flex items-center gap-2">
                    <Shield className="h-5 w-5 text-amber-400" />
                    {t("portal:dashboard.smpDetails")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t("portal:dashboard.employeeNumber")}</p>
                      <p className="text-lg font-bold text-white font-mono" dir="ltr">{activeWorkforceRecord.employeeNumber}</p>
                    </div>
                    <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t("portal:dashboard.contractType")}</p>
                      <Badge className="bg-amber-500/15 text-amber-400 border-0">{t("portal:dashboard.smpContract")}</Badge>
                    </div>
                    <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t("portal:dashboard.startDate")}</p>
                      <p className="text-lg font-bold text-white"><bdi>{formatDate(activeWorkforceRecord.startDate, i18n.language)}</bdi></p>
                    </div>
                    {activeWorkforceRecord.eventName && (
                      <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t("portal:dashboard.assignedEvent")}</p>
                        <p className="text-lg font-bold text-white"><bdi>{activeWorkforceRecord.eventName}</bdi></p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Candidate dashboard — stats and profile strength are in the sidebar */}
            {portalMode === "candidate" && (
              <div className="space-y-4">
                {jobs.length > 0 && (
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-display text-white flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-primary" />
                        {t("portal:dashboard.openPositionsTitle")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      <Trans
                        i18nKey="portal:dashboard.openPositions"
                        count={jobs.length}
                        values={{ n: formatNumber(jobs.length) }}
                        components={{
                          1: <span className="text-white font-bold" />,
                          2: <button type="button" className="text-primary hover:underline bg-transparent border-0 p-0 cursor-pointer font-medium" onClick={() => setActiveNav("jobs")} />,
                        }}
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        );
      }
    }
  }

  return (
    <div className="min-h-screen bg-background font-sans text-foreground flex flex-col">
      {/* Navbar */}
      <header className="h-16 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50 px-4 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/workforce-logo.svg" alt="Workforce" className="h-8 w-8" />
          <span className="font-display font-bold text-xl tracking-tight text-white hidden sm:inline-block">
            {t("common:app.name")}
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-5 text-sm font-medium">
          {navItems.map(key => {
            const active = activeNav === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveNav(key)}
                className={`transition-colors cursor-pointer bg-transparent border-0 p-0 font-medium text-sm ${active ? "text-primary" : "text-muted-foreground hover:text-white"}`}
                data-testid={`nav-${key}`}
              >
                {t(`portal:nav.${key}`, NAV_LABELS[key])}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-white relative">
            <Bell className="h-5 w-5" />
          </Button>
          <div className="ps-4 border-s border-border/50">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex items-center gap-2 rounded-lg hover:bg-muted/50 p-1.5 transition-colors" data-testid="button-profile-menu">
                  <Avatar className="h-8 w-8 border border-border">
                    {!!candidateProfile?.photoUrl && <AvatarImage src={String(candidateProfile!.photoUrl)} alt={String(candidateProfile!.fullNameEn ?? "")} className="object-cover" />}
                    <AvatarFallback className="bg-primary/20 text-primary font-bold text-xs">{displayInitials}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-white hidden sm:block max-w-[120px] truncate">{displayName}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-card border-border">
                <DropdownMenuItem
                  className="cursor-pointer text-white focus:bg-muted/60 gap-2"
                  onClick={() => handleProfileOpen(true)}
                  data-testid="menu-item-profile"
                >
                  <User className="h-4 w-4 text-primary" />
                  {t("portal:menu.profile")}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive gap-2"
                  onClick={() => { localStorage.removeItem("workforce_candidate"); setLocation("/auth"); }}
                  data-testid="menu-item-signout"
                >
                  <LogOut className="h-4 w-4" />
                  {t("portal:menu.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full space-y-6 animate-in fade-in duration-500">

        {/* Page header */}
        <div className="flex flex-col md:flex-row gap-4 md:items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight" data-testid="text-portal-title">
              {portalTitle}
            </h1>
            <p className="text-muted-foreground mt-1">{portalSubtitle}</p>
          </div>
          {isEmployee && (
            <Badge
              className={`text-sm px-3 py-1 ${isSmp ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"}`}
              data-testid="badge-portal-mode"
            >
              <BadgeCheck className="h-4 w-4 me-1.5" />
              {isSmp ? t("portal:badge.smpContract") : t("portal:badge.activeEmployee")}
            </Badge>
          )}
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left sidebar: Profile card */}
          <div className="space-y-6">
            <Card className="bg-card border-border overflow-hidden">
              <div className={`h-20 bg-gradient-to-r ${isEmployee ? (isSmp ? "from-amber-600/20 to-amber-600/5" : "from-emerald-600/20 to-emerald-600/5") : "from-primary/20 to-primary/5"}`} />
              <CardContent className="pt-0 -mt-10 text-center relative z-10">
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  className="group relative inline-block"
                  data-testid="button-avatar-edit"
                >
                  <Avatar className="h-20 w-20 border-4 border-card mx-auto group-hover:opacity-80 transition-opacity">
                    {!!candidateProfile?.photoUrl && <AvatarImage src={String(candidateProfile!.photoUrl)} alt={String(candidateProfile!.fullNameEn ?? "")} className="object-cover" />}
                    <AvatarFallback className="text-xl bg-primary/20 text-primary font-bold">{displayInitials}</AvatarFallback>
                  </Avatar>
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-full">
                    {isEmployee ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <Camera className="h-5 w-5 text-white" />
                        <span className="text-[9px] text-white font-medium leading-tight">{t("portal:badge.changePhoto")}</span>
                      </div>
                    ) : (
                      <User className="h-6 w-6 text-white" />
                    )}
                  </span>
                  {hasPendingPhotoChange && (
                    <span className="absolute -top-1 -end-1 flex items-center justify-center h-5 w-5 rounded-full bg-amber-500 border-2 border-card z-10" title={t("portal:badge.photoPending")} data-testid="badge-photo-pending">
                      <Clock className="h-3 w-3 text-white" />
                    </span>
                  )}
                  {photoChangeUploading && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full z-10">
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    </span>
                  )}
                </button>
                <div className="mt-3">
                  <h3 className="font-bold text-lg text-white">{displayName}</h3>
                  <p className="text-muted-foreground text-sm">
                    {isEmployee
                      ? (activeWorkforceRecord?.jobTitle ?? (isSmp ? t("portal:badge.smpWorker") : t("portal:badge.employee")))
                      : String(candidateProfile?.currentRole ?? t("portal:badge.jobSeeker"))}
                  </p>
                  {isEmployee && (
                    <Badge className={`mt-2 text-xs gap-1 ${isSmp ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"}`}>
                      <BadgeCheck className="h-3 w-3" />
                      {isSmp ? t("portal:badge.smpContract") : t("portal:badge.activeEmployee")}
                    </Badge>
                  )}
                  {!isEmployee && hasWorkHistory && (() => {
                    const lastCompleted = allWorkforceRecords.find(r => !r.isActive);
                    return (
                      <div className="mt-2 space-y-1 flex flex-col items-center">
                        <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs gap-1" data-testid="badge-former-employee">
                          <UserCheck className="h-3 w-3" /> {t("portal:badge.formerEmployee")}
                        </Badge>
                        {lastCompleted && (
                          <span className="text-[10px] text-muted-foreground font-mono" data-testid="text-last-employee-number">
                            <bdi>{t("portal:badge.lastId", { id: lastCompleted.employeeNumber })}</bdi>
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {(isEmployee && activeWorkforceRecord) && (
                  <div className="mt-6 border-t border-border pt-5 space-y-3 text-start">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Hash className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t("portal:profileCard.employeeId")}</p>
                        <p className="text-sm font-bold text-white font-mono" data-testid="text-employee-number" dir="ltr">{activeWorkforceRecord.employeeNumber}</p>
                      </div>
                    </div>
                    {!isSmp && activeWorkforceRecord.salary && (
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
                          <Banknote className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t("portal:profileCard.monthlySalary")}</p>
                          <p className="text-sm font-bold text-white" data-testid="text-employee-salary"><bdi>{formatCurrency(Number(activeWorkforceRecord.salary), "SAR", i18n.language)}</bdi></p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                        <Clock className="h-4 w-4 text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t("portal:profileCard.startDate")}</p>
                        <p className="text-sm font-bold text-white" data-testid="text-employee-start-date">
                          <bdi>{formatDate(activeWorkforceRecord.startDate, i18n.language)}</bdi>
                        </p>
                      </div>
                    </div>
                    {activeWorkforceRecord.eventName && (
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0">
                          <Building2 className="h-4 w-4 text-violet-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t("portal:profileCard.event")}</p>
                          <p className="text-sm font-bold text-white" data-testid="text-employee-event">{activeWorkforceRecord.eventName}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {portalMode === "candidate" && (
                  <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5">
                    <div>
                      <div className="text-2xl font-bold text-white"><bdi>{formatNumber(appliedIds.size)}</bdi></div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("portal:candidate.appliedStat")}</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-white"><bdi>{formatNumber(myInterviews.length)}</bdi></div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("portal:candidate.interviewsStat")}</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Documents card — only show for candidate or active SMP employee, not for former SMP */}
            {(portalMode === "candidate" || portalMode === "employee_smp") && (
              <ProfileCompletionCard toast={toast} candidateId={candidateId!} isSmp={isSmp} />
            )}

            {/* Contract widget shown ONLY for candidates (pre-conversion).
                After conversion to employee, the contract lives in the dedicated "My Contract" tab. */}
            {portalMode === "candidate" && !isSmp && (
              <Card className="bg-card border-border">
                <CardContent className="p-5">
                  <ContractSection candidateId={candidateId!} candidateName={displayName} readOnly={!canSignContract} onboardingId={currentOnboarding?.id} />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: main content */}
          <div className="lg:col-span-2 space-y-6">
            {renderMainContent()}
          </div>
        </div>
      </main>

      {/* Apply Dialog */}
      <ApplyDialog
        job={selectedJob}
        open={applyOpen}
        onOpenChange={setApplyOpen}
        onSuccess={handleApplySuccess}
      />

      {isEmployee && createPortal(
        <Dialog open={photoChangeOpen} onOpenChange={setPhotoChangeOpen}>
          <DialogContent className="bg-card border-border text-foreground max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display text-lg font-bold text-white flex items-center gap-2">
                <Camera className="h-5 w-5 text-primary" />
                {t("portal:photoChange.title")}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm">
                {hasPendingPhotoChange ? t("portal:photoChange.descPending") : t("portal:photoChange.desc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border-2 border-border">
                  {!!candidateProfile?.photoUrl && <AvatarImage src={String(candidateProfile!.photoUrl)} className="object-cover" />}
                  <AvatarFallback className="text-lg bg-primary/20 text-primary font-bold">{displayInitials}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm text-white font-medium">{t("portal:photoChange.currentPhoto")}</p>
                  {hasPendingPhotoChange && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Clock className="h-3 w-3 text-amber-400" />
                      <span className="text-xs text-amber-400">{t("portal:photoChange.pending")}</span>
                    </div>
                  )}
                </div>
              </div>
              <input
                ref={photoChangeInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChangeFileSelect}
                data-testid="input-photo-change-file"
              />
              <Button
                className="w-full gap-2"
                onClick={() => photoChangeInputRef.current?.click()}
                disabled={photoChangeUploading}
                data-testid="button-select-new-photo"
              >
                {photoChangeUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                {t("portal:photoChange.selectNew")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>,
        document.body
      )}

      <PhotoCropDialog
        open={!!photoChangeCropSrc}
        imageSrc={photoChangeCropSrc}
        onClose={() => setPhotoChangeCropSrc(null)}
        onCrop={handlePhotoChangeUpload}
        onRetry={() => photoChangeInputRef.current?.click()}
      />

      {/* ─── Profile Editor Sheet ──────────────────────────────────────────── */}
      <Sheet open={profileOpen} onOpenChange={handleProfileOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg bg-card border-border overflow-y-auto">
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              {t("portal:profile.title")}
            </SheetTitle>
            <SheetDescription className="text-muted-foreground text-sm">
              {isSmp ? t("portal:profile.descSmp") : t("portal:profile.desc")}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleProfileSave} className="py-6 space-y-6">

            {/* ── Personal ──────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">{t("portal:profile.personal")}</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-white">{t("portal:profile.firstName")}</label>
                    <Input
                      name="firstName"
                      defaultValue={(candidateProfile?.fullNameEn ?? storedCandidate.fullNameEn ?? "").toString().split(" ")[0]}
                      placeholder={t("portal:profile.firstNamePlaceholder")}
                      className="bg-background border-border"
                      data-testid="input-firstName"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-white">{t("portal:profile.lastName")}</label>
                    <Input
                      name="lastName"
                      defaultValue={(candidateProfile?.fullNameEn ?? storedCandidate.fullNameEn ?? "").toString().split(" ").slice(1).join(" ")}
                      placeholder={t("portal:profile.lastNamePlaceholder")}
                      className="bg-background border-border"
                      data-testid="input-lastName"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white">{t("portal:profile.nationality")}</label>
                  <div className="relative">
                    <select
                      name="nationalityText"
                      defaultValue={String(candidateProfile?.nationalityText ?? candidateProfile?.nationality ?? "")}
                      dir={i18n.language?.startsWith("ar") ? "rtl" : "ltr"}
                      className={`w-full h-10 bg-background border border-border rounded-md text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none ${i18n.language?.startsWith("ar") ? "pr-3 pl-9" : "pl-3 pr-9"}`}
                      data-testid="select-nationality"
                    >
                      {NATIONALITY_OPTIONS_LIST.map((n, i) =>
                        n === "---" ? (
                          <option key={`sep-${i}`} disabled className="bg-card text-muted-foreground">{"─".repeat(20)}</option>
                        ) : (
                          <option key={n} value={n} className="bg-card text-white">{nationalityLabel(n, i18n.language)}</option>
                        )
                      )}
                    </select>
                    <ChevronDown className={`pointer-events-none absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${i18n.language?.startsWith("ar") ? "left-3" : "right-3"}`} />
                  </div>
                </div>
              </div>
            </div>

            <Separator className="bg-border" />

            {/* ── Contact ───────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">{t("portal:profile.contact")}</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white">{t("portal:profile.phone")}</label>
                  <Input
                    name="phone"
                    value={profilePhone}
                    onChange={e => setProfilePhone(sanitizeSaMobileInput(e.target.value))}
                    onBlur={e => setProfilePhone(normalizeSaMobileOnBlur(e.target.value))}
                    placeholder="05XXXXXXXX"
                    inputMode="tel"
                    maxLength={10}
                    className="bg-background border-border"
                    data-testid="input-phone"
                    dir="ltr"
                  />
                  {profilePhone.length > 0 && !isValidSaMobile(profilePhone) && (
                    <p className="text-[11px] text-amber-400" data-testid="text-profile-phone-validation-hint">
                      {String(t("common:errors.invalidPhone", { defaultValue: "Please enter a valid Saudi mobile (05XXXXXXXX)." } as any))}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white">{t("portal:profile.email")}</label>
                  <Input
                    name="email"
                    type="email"
                    defaultValue={String(candidateProfile?.email ?? "")}
                    placeholder={t("portal:profile.emailPlaceholder")}
                    className="bg-background border-border"
                    data-testid="input-email"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white">{t("portal:profile.city")}</label>
                  <Input
                    name="city"
                    defaultValue={String(candidateProfile?.city ?? "")}
                    placeholder={t("portal:profile.cityPlaceholder")}
                    className="bg-background border-border"
                    data-testid="input-city"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white">{t("portal:profile.region")} <span className="text-red-400">*</span></label>
                  <Select value={profileRegion} onValueChange={setProfileRegion} dir={i18n.language?.startsWith("ar") ? "rtl" : "ltr"}>
                    <SelectTrigger className="bg-background border-border" data-testid="select-region">
                      <SelectValue placeholder={t("portal:profile.selectRegion")} />
                    </SelectTrigger>
                    <SelectContent>
                      {["Riyadh", "Makkah", "Madinah", "Eastern Province", "Asir", "Tabuk", "Hail", "Northern Borders", "Jazan", "Najran", "Al Bahah", "Al Jawf", "Qassim"].map(r => (
                        <SelectItem key={r} value={r}>{t(`portal:profile.regions.${r}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* IBAN — hidden for SMP */}
            {!isSmp && (
              <>
                <Separator className="bg-border" />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">{t("portal:profile.bankDetails")}</p>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-white">{t("portal:profile.iban")} <span className="text-red-400">*</span></label>
                    <Input
                      value={ibanValue}
                      onChange={e => {
                        const cleaned = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 24);
                        const grouped = cleaned.replace(/(.{4})/g, "$1 ").trim();
                        setIbanValue(grouped);
                      }}
                      placeholder={t("portal:profile.ibanPlaceholder")}
                      maxLength={29}
                      className="bg-background border-border font-mono uppercase"
                      data-testid="input-iban"
                      dir="ltr"
                      inputMode="text"
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground">{t("portal:profile.ibanHint")}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-muted-foreground">{t("portal:profile.bankName")}</label>
                      <Input
                        value={detectedBank?.ibanBankName ?? ""}
                        readOnly
                        placeholder={t("portal:profile.bankNamePlaceholder")}
                        className="bg-muted/10 border-border text-muted-foreground cursor-not-allowed"
                        data-testid="input-bank-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-muted-foreground">{t("portal:profile.bankCode")}</label>
                      <Input
                        value={detectedBank?.ibanBankCode ?? ""}
                        readOnly
                        placeholder={t("portal:profile.bankCodePlaceholder")}
                        className="bg-muted/10 border-border text-muted-foreground cursor-not-allowed font-mono"
                        data-testid="input-bank-code"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            <Separator className="bg-border" />

            {/* ── Professional — hidden for SMP ─────────────────────── */}
            {!isSmp && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">{t("portal:profile.professional")}</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-white">{t("portal:profile.currentRole")}</label>
                      <Input
                        name="currentRole"
                        defaultValue={String(candidateProfile?.currentRole ?? "")}
                        placeholder={t("portal:profile.currentRolePlaceholder")}
                        className="bg-background border-border"
                        data-testid="input-currentRole"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-white">{t("portal:profile.currentEmployer")}</label>
                      <Input
                        name="currentEmployer"
                        defaultValue={String(candidateProfile?.currentEmployer ?? "")}
                        placeholder={t("portal:profile.currentEmployerPlaceholder")}
                        className="bg-background border-border"
                        data-testid="input-currentEmployer"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-white">{t("portal:profile.educationLevel")}</label>
                    <Select value={profileEduLevel} onValueChange={setProfileEduLevel} dir={i18n.language?.startsWith("ar") ? "rtl" : "ltr"}>
                      <SelectTrigger className="bg-background border-border" data-testid="select-educationLevel">
                        <SelectValue placeholder={t("portal:profile.selectEducation")} />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="High School and below">{t("portal:profile.education.highSchool")}</SelectItem>
                        <SelectItem value="University and higher">{t("portal:profile.education.university")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {profileEduLevel === "University and higher" && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-white">{t("portal:profile.major")}</label>
                      <Input
                        value={profileMajor}
                        onChange={e => setProfileMajor(e.target.value)}
                        placeholder={t("portal:profile.majorPlaceholder")}
                        className="bg-background border-border"
                        data-testid="input-major"
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-white">
                      {t("portal:profile.skills")} <span className="text-muted-foreground font-normal ms-1 text-xs">{t("portal:profile.separateCommas")}</span>
                    </label>
                    <Textarea
                      value={profileSkills}
                      onChange={e => setProfileSkills(e.target.value)}
                      onBlur={() => setProfileSkills(normalizeDisplay(profileSkills))}
                      placeholder={t("portal:profile.skillsPlaceholder")}
                      className="bg-background border-border resize-none"
                      rows={2}
                      data-testid="input-skills"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-white">
                      {t("portal:profile.languages")} <span className="text-muted-foreground font-normal ms-1 text-xs">{t("portal:profile.separateCommas")}</span>
                    </label>
                    <Textarea
                      value={profileLangs}
                      onChange={e => setProfileLangs(e.target.value)}
                      onBlur={() => setProfileLangs(normalizeDisplay(profileLangs))}
                      placeholder={t("portal:profile.languagesPlaceholder")}
                      className="bg-background border-border resize-none"
                      rows={2}
                      data-testid="input-languages"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                disabled={saveProfile.isPending}
                className="flex-1 bg-primary text-primary-foreground font-bold"
                data-testid="button-save-profile"
              >
                {saveProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <Save className="h-4 w-4 me-2" />}
                {t("portal:profile.save")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setProfileOpen(false)} className="border-border">
                {t("portal:profile.cancel")}
              </Button>
            </div>
          </form>

          <Separator className="bg-border" />

          {/* ── Change Password ───────────────────────────────────────── */}
          <form onSubmit={handlePasswordSave} className="py-6 space-y-3 pb-10">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
              <Lock className="h-3.5 w-3.5" />
              {t("portal:password.title")}
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-white">{t("portal:password.current")}</label>
              <div className="relative">
                <Input
                  type={showPwCur ? "text" : "password"}
                  value={pwCurrent}
                  onChange={e => setPwCurrent(e.target.value)}
                  placeholder={t("portal:password.currentPlaceholder")}
                  className="bg-background border-border pe-10"
                  data-testid="input-pw-current"
                />
                <button type="button" className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white" onClick={() => setShowPwCur(!showPwCur)}>
                  {showPwCur ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-white">{t("portal:password.new")}</label>
              <div className="relative">
                <Input
                  type={showPwNew ? "text" : "password"}
                  value={pwNew}
                  onChange={e => setPwNew(e.target.value)}
                  placeholder={t("portal:password.newPlaceholder")}
                  className="bg-background border-border pe-10"
                  data-testid="input-pw-new"
                />
                <button type="button" className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white" onClick={() => setShowPwNew(!showPwNew)}>
                  {showPwNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {pwNew.length > 0 && (
                <div className="mt-2 space-y-1 text-xs" data-testid="password-strength-rules">
                  {passwordRules.map((rule, i) => (
                    <div key={i} className={`flex items-center gap-1.5 ${rule.test(pwNew) ? "text-emerald-400" : "text-muted-foreground"}`}>
                      <CheckCircle2 className={`h-3 w-3 ${rule.test(pwNew) ? "text-emerald-400" : "text-zinc-600"}`} />
                      {rule.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-white">{t("portal:password.confirm")}</label>
              <Input
                type="password"
                value={pwConfirm}
                onChange={e => setPwConfirm(e.target.value)}
                placeholder={t("portal:password.confirmPlaceholder")}
                className="bg-background border-border"
                data-testid="input-pw-confirm"
              />
            </div>
            <Button
              type="submit"
              disabled={changePassword.isPending || !pwCurrent || !pwNew || !pwConfirm || !allPasswordRulesMet || pwNew !== pwConfirm}
              variant="outline"
              className="w-full border-border"
              data-testid="button-change-password"
            >
              {changePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <Lock className="h-4 w-4 me-2" />}
              {t("portal:password.update")}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
