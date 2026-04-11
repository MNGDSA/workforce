import { useState, useRef, useCallback, useEffect } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { resolveSaudiBank } from "@/lib/saudi-banks";
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

function PhotoCropDialog({ open, imageSrc, onCrop, onClose }: {
  open: boolean;
  imageSrc: string | null;
  onCrop: (file: File) => void;
  onClose: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  if (!open || !imageSrc) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70" data-testid="photo-crop-overlay">
      <div className="bg-card border border-border rounded-lg w-[90vw] max-w-md overflow-hidden" data-testid="photo-crop-dialog">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Crop your photo</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Drag to position, scroll to zoom. The square area will be your profile photo.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-white" data-testid="button-crop-close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative w-full" style={{ height: 360 }}>
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
        <div className="p-4 flex items-center gap-3">
          <label className="text-xs text-muted-foreground shrink-0">Zoom</label>
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
              try {
                const file = await createCroppedImage(imageSrc, croppedArea);
                onCrop(file);
              } catch { }
              setProcessing(false);
            }}
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Photo"}
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
  isActive: boolean;
  eventName: string | null;
  jobTitle: string | null;
};

// ─── Portal Mode Detection ────────────────────────────────────────────────────

type PortalMode =
  | "candidate"
  | "employee_individual"
  | "employee_smp"
  | "former_individual"
  | "former_smp";

function resolvePortalMode(
  candidate: Record<string, unknown> | null | undefined,
  activeRecord: WorkforceRecord | null | undefined,
  allRecords: WorkforceRecord[],
): PortalMode {
  if (!candidate) return "candidate";

  if (activeRecord && activeRecord.isActive) {
    return activeRecord.employmentType === "smp" ? "employee_smp" : "employee_individual";
  }

  if (!activeRecord && allRecords.length > 0) {
    const mostRecent = allRecords[0];
    return mostRecent.employmentType === "smp" ? "former_smp" : "former_individual";
  }

  return "candidate";
}

// ─── Nav items per mode ───────────────────────────────────────────────────────

type NavKey = "dashboard" | "jobs" | "documents" | "contract" | "payslips" | "shift" | "assets" | "history";

function getNavItems(mode: PortalMode): NavKey[] {
  switch (mode) {
    case "employee_individual":
      return ["dashboard", "shift", "contract", "payslips", "history", "assets"];
    case "employee_smp":
      return ["dashboard", "shift", "history"];
    case "former_individual":
      return ["dashboard", "history", "payslips", "contract", "jobs"];
    case "former_smp":
      return ["dashboard", "history"];
    case "candidate":
    default:
      return ["jobs"];
  }
}

const NAV_LABELS: Record<NavKey, string> = {
  dashboard: "Dashboard",
  jobs: "Job Opportunities",
  documents: "Documents",
  contract: "My Contract",
  payslips: "Payslips",
  shift: "My Shift",
  assets: "Assets",
  history: "Work History",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const applySchema = z.object({
  fullNameEn: z.string().min(2, "Full name is required"),
  phone: z.string().min(9, "Phone number is required"),
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
      toast({ title: "Application submitted!", description: `You applied for "${job?.title}".` });
      onSuccess(jobId);
      form.reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to submit", description: "Please check your details and try again.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Apply for Position
          </DialogTitle>
          {job && (
            <DialogDescription className="text-muted-foreground">
              {job.title} · {job.region ?? job.location ?? "KSA"}
            </DialogDescription>
          )}
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => apply.mutate(d))} className="space-y-4 pt-1">
            <FormField control={form.control} name="fullNameEn" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Full Name (English)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Mohammed Al-Harbi" className="bg-muted/30 border-border" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="nationalId" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">National ID / Iqama No.</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. 1012345678" className="bg-muted/30 border-border" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Phone Number</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. 0512345678" className="bg-muted/30 border-border" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" className="border-border" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary text-primary-foreground font-bold min-w-[120px]" disabled={apply.isPending}>
                {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Application"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function salaryLabel(job: JobPosting) {
  if (job.salaryMin && job.salaryMax) return `${job.salaryMin.toLocaleString()} – ${job.salaryMax.toLocaleString()} SAR/mo`;
  if (job.salaryMin) return `From ${job.salaryMin.toLocaleString()} SAR/mo`;
  return null;
}

function typeLabel(type: string) {
  return type === "seasonal_full_time" ? "Seasonal Full-Time" : type === "seasonal_part_time" ? "Seasonal Part-Time" : type === "full_time" ? "Full Time" : type === "part_time" ? "Part Time" : type;
}

function getApplicationBadge(deadline: string | undefined, status: string) {
  const isBeforeDeadline = deadline ? new Date() < new Date(deadline) : true;
  if (isBeforeDeadline) {
    return { label: "Under Review", className: "bg-amber-500/15 text-amber-400 border-amber-500/30 border" };
  }
  switch (status) {
    case "hired":
      return { label: "Hired", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 border" };
    case "offered":
      return { label: "Offer Extended", className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30 border" };
    case "shortlisted":
      return { label: "Shortlisted", className: "bg-blue-500/15 text-blue-400 border-blue-500/30 border" };
    case "interviewed":
      return { label: "Interviewed", className: "bg-violet-500/15 text-violet-400 border-violet-500/30 border" };
    case "rejected":
      return { label: "Not Shortlisted", className: "bg-muted/60 text-muted-foreground border-border border" };
    default:
      return { label: "Under Review", className: "bg-amber-500/15 text-amber-400 border-amber-500/30 border" };
  }
}

// ─── Profile Completion Card ──────────────────────────────────────────────────

type DocKey = "resume" | "nationalId" | "photo" | "iban";

const ALL_DOC_ITEMS: {
  key: DocKey;
  label: string;
  hint: string;
  accept: string;
  icon: React.ReactNode;
  smpOnly?: boolean;
  individualOnly?: boolean;
}[] = [
  { key: "photo",      label: "Personal Photo",         hint: "JPG or PNG up to 3 MB",   accept: ".jpg,.jpeg,.png",      icon: <ImageIcon className="h-4 w-4" /> },
  { key: "nationalId", label: "National / Resident ID", hint: "PDF, JPG, PNG up to 5 MB", accept: ".pdf,.jpg,.jpeg,.png", icon: <CreditCard className="h-4 w-4" /> },
  { key: "resume",     label: "Resume / CV",            hint: "PDF, DOC up to 5 MB",  accept: ".pdf,.doc,.docx",        icon: <FileText className="h-4 w-4" />, individualOnly: true },
  { key: "iban",       label: "IBAN Certificate",       hint: "PDF, JPG, PNG up to 5 MB", accept: ".pdf,.jpg,.jpeg,.png", icon: <Landmark className="h-4 w-4" />, individualOnly: true },
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
    resume: profile?.resumeUrl || null,
    photo: profile?.photoUrl || null,
    nationalId: profile?.nationalIdFileUrl || null,
    iban: profile?.ibanFileUrl || null,
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

  const uploadFile = useCallback(async (key: DocKey, file: File) => {
    setUploading((p) => ({ ...p, [key]: true }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("docType", key);
      const res = await fetch(`/api/candidates/${candidateId}/documents`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      const body = await res.json();
      if (key === "photo" && body.pendingReview) {
        setPhotoPendingReview(true);
        toast({ title: "Photo submitted for review", description: "Your new photo has been sent to HR for approval. Your current photo remains active." });
      } else {
        setJustUploaded((p) => ({ ...p, [key]: file.name }));
        queryClient.invalidateQueries({ queryKey: ["/api/candidates/profile", candidateId] });
        queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
        toast({ title: "File uploaded", description: `"${file.name}" saved successfully.` });
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message || "Please try again.", variant: "destructive" });
    } finally {
      setUploading((p) => ({ ...p, [key]: false }));
      if (inputRefs[key].current) inputRefs[key].current!.value = "";
    }
  }, [toast, candidateId, queryClient]);

  const handleFile = useCallback(async (key: DocKey, file: File | null) => {
    if (!file) return;
    const maxMb = key === "photo" ? 3 : 5;
    if (file.size > maxMb * 1024 * 1024) {
      toast({ title: "File too large", description: `Maximum size is ${maxMb} MB.`, variant: "destructive" });
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
          {isSmp ? "Required Documents" : "Profile Completion"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Overall Strength</span>
            <span className={`font-bold ${pct === 100 ? "text-emerald-500" : "text-primary"}`}>{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
          {pct === 100 && (
            <p className="text-xs text-emerald-500 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Documents complete!
            </p>
          )}
        </div>

        <div className="space-y-2">
          {DOC_ITEMS.map(({ key, label, hint, accept, icon }) => {
            const busy = uploading[key];
            const done = isDone(key);
            const uploadedName = justUploaded[key];
            const hasFileUrl = !!docUrlMap[key];
            const isPendingPhotoReview = key === "photo" && photoPendingReview;

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
                          <Clock className="h-2.5 w-2.5 inline-block" /> New photo pending HR review
                        </p>
                      : done
                        ? <p className="text-[11px] text-emerald-600 truncate flex items-center gap-1">
                            {hasFileUrl && <Download className="h-2.5 w-2.5 inline-block" />}
                            {uploadedName || (hasFileUrl ? "Click to view" : "Uploaded")}
                          </p>
                        : <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
                  </div>
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
                  {done && !isPendingPhotoReview && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleClick(key); }}
                      className="shrink-0 text-muted-foreground hover:text-primary transition-colors rounded-full p-1"
                      title="Re-upload"
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
          setShowCropDialog(false);
          setCropImageSrc(null);
          await uploadFile("photo", croppedFile);
        }}
      />
    </Card>
  );
}

// ─── Placeholder Card ─────────────────────────────────────────────────────────

function PlaceholderCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
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
          Coming Soon
        </Badge>
      </CardContent>
    </Card>
  );
}

// ─── Work History Section ─────────────────────────────────────────────────────

function WorkHistorySection({ candidateId }: { candidateId: string }) {
  const { data: allRecords = [], isLoading } = useQuery<WorkforceRecord[]>({
    queryKey: ["/api/workforce/all-by-candidate", candidateId],
    queryFn: () => apiRequest("GET", `/api/workforce/all-by-candidate/${candidateId}`).then(r => r.json()),
    enabled: !!candidateId,
  });

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
        <p className="text-muted-foreground">No work history yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {allRecords.map((rec) => (
        <Card key={rec.id} className="bg-card border-border" data-testid={`card-work-history-${rec.id}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-bold text-white font-mono text-sm">{rec.employeeNumber}</span>
                  <Badge
                    className={`text-[10px] h-5 border-0 ${
                      rec.employmentType === "smp"
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-blue-500/15 text-blue-400"
                    }`}
                    data-testid={`badge-employment-type-${rec.id}`}
                  >
                    {rec.employmentType === "smp" ? "SMP Contract" : "Individual"}
                  </Badge>
                  <Badge
                    className={`text-[10px] h-5 border-0 ${
                      rec.isActive
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {rec.isActive ? "Active" : "Ended"}
                  </Badge>
                </div>
                {rec.jobTitle && (
                  <p className="text-sm text-white">{rec.jobTitle}</p>
                )}
                {rec.eventName && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Building2 className="h-3 w-3" /> {rec.eventName}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(rec.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {rec.endDate && (
                      <> → {new Date(rec.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>
                    )}
                  </span>
                  {rec.salary && rec.employmentType !== "smp" && (
                    <span className="flex items-center gap-1">
                      <Banknote className="h-3 w-3" />
                      {Number(rec.salary).toLocaleString()} SAR/mo
                    </span>
                  )}
                </div>
                {!rec.isActive && rec.terminationReason && (
                  <p className="text-xs text-muted-foreground mt-1 italic">Reason: {rec.terminationReason}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Termination Banner ───────────────────────────────────────────────────────

function TerminationBanner({ record }: { record: WorkforceRecord }) {
  return (
    <div className="bg-red-950/30 border border-red-800/40 rounded-lg p-4 flex items-start gap-3" data-testid="termination-banner">
      <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-red-300">Employment Ended</p>
        <p className="text-xs text-red-400/80 mt-0.5">
          Your employment ended on{" "}
          {record.endDate
            ? new Date(record.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
            : "an unspecified date"}
          {record.terminationReason ? ` — ${record.terminationReason}` : ""}.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Your profile and history remain on file. You may reapply for future positions.
        </p>
      </div>
    </div>
  );
}

// ─── Contract section (read-only or signable) ─────────────────────────────────

function ContractSection({
  candidateId,
  candidateName,
  readOnly = false,
}: {
  candidateId: string;
  candidateName?: string;
  readOnly?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [contractPreviewOpen, setContractPreviewOpen] = useState(false);
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);

  const { data: myContracts = [] } = useQuery<{ id: string; status: string; signedAt: string | null; templateId: string; snapshotArticles: any[]; snapshotVariables: Record<string, string> }[]>({
    queryKey: ["/api/candidate-contracts/mine", candidateId],
    queryFn: () => apiRequest("GET", `/api/candidate-contracts?candidateId=${candidateId}`).then(r => r.json()),
    enabled: !!candidateId,
  });

  const activeContract = myContracts.find(c => c.status !== "signed") || myContracts.find(c => c.status === "signed");
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
      queryClient.invalidateQueries({ queryKey: ["/api/candidate-contracts/mine", candidateId] });
      toast({ title: "Contract signed successfully!" });
      setIsSignModalOpen(false);
    },
    onError: (e: any) => toast({ title: "Error signing contract", description: e?.message, variant: "destructive" }),
  });

  if (!activeContract) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/10 border border-border">
        <FileText className="h-8 w-8 text-muted-foreground" />
        <div>
          <div className="text-sm font-medium text-zinc-400">No Contract Available</div>
          <div className="text-xs text-muted-foreground">Your employment contract will appear here for signing prior to your employment.</div>
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
                Employment Contract
                <Badge className={`text-[10px] h-5 border-0 ${contractIsSigned ? "bg-emerald-500/15 text-emerald-400" : "bg-yellow-500/15 text-yellow-400"}`}>
                  {contractIsSigned ? "Signed" : "Awaiting Your Signature"}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {contractIsSigned && activeContract.signedAt
                  ? `Signed on ${new Date(activeContract.signedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`
                  : readOnly ? "Contract is read-only" : "Please review and sign your employment contract"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pl-[52px]">
            <Button
              size="sm"
              variant="outline"
              className="border-border text-xs gap-1.5"
              onClick={() => setContractPreviewOpen(true)}
              data-testid="button-preview-contract"
            >
              <Eye className="h-3 w-3" />
              {contractIsSigned ? "View" : "Preview"}
            </Button>
            {!contractIsSigned && !readOnly && (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground text-xs font-bold gap-1.5"
                onClick={() => setIsSignModalOpen(true)}
                data-testid="button-sign-contract"
              >
                <PenTool className="h-3 w-3" />
                Sign Now
              </Button>
            )}
          </div>
        </div>
        {contractIsSigned && activeContract.signedAt && (
          <div className="px-4 pb-3 border-t border-emerald-800/30 pt-3 flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            This contract has been digitally signed and recorded.
          </div>
        )}
      </div>

      {/* Contract history for read-only / former view */}
      {myContracts.length > 1 && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-2">Contract History ({myContracts.length} total)</p>
          <div className="space-y-1.5">
            {myContracts.slice(1).map(c => (
              <div key={c.id} className="flex items-center justify-between text-xs text-muted-foreground bg-muted/10 border border-border rounded px-3 py-2">
                <span>Contract · {c.status}</span>
                {c.signedAt && <span>{new Date(c.signedAt).toLocaleDateString("en-GB")}</span>}
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
              Employment Contract
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {contractIsSigned ? "Your signed employment contract" : "Review carefully before signing"}
            </DialogDescription>
          </DialogHeader>
          {contractPreview && (
            <>
              <div className="contract-print-area mt-4 bg-white text-black rounded-lg p-8 space-y-6 font-serif" data-testid="contract-preview-content">
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
                  return <div className="text-sm whitespace-pre-wrap leading-relaxed italic">{preambleText}</div>;
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
                      <h3 className="font-bold text-sm mb-1">Article {idx + 1}: {article.title}</h3>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{body}</p>
                      {Array.isArray(article.subArticles) && article.subArticles.map((sub: any, subIdx: number) => {
                        let subBody = sub.body || "";
                        if (contractPreview.variables) {
                          Object.entries(contractPreview.variables).forEach(([key, val]) => {
                            subBody = subBody.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(val));
                          });
                        }
                        return (
                          <div key={subIdx} className="ml-6 mt-2">
                            <h4 className="font-bold text-sm mb-0.5">{idx + 1}.{subIdx + 1} {sub.title}</h4>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{subBody}</p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {contractPreview.template?.footerText && (() => {
                  let t = contractPreview.template.footerText;
                  if (contractPreview.variables) {
                    Object.entries(contractPreview.variables).forEach(([key, val]) => {
                      t = t.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(val));
                    });
                  }
                  return <div className="border-t pt-4 mt-6"><p className="text-sm whitespace-pre-wrap leading-relaxed italic">{t}</p></div>;
                })()}
                <div className="border-t pt-6 mt-8">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <p className="text-sm font-bold">First Party (Employer)</p>
                      <p className="text-xs text-gray-600">{contractPreview.template?.companyName || "Luxury Carts Company Ltd"}</p>
                      <div className="border-b border-gray-400 mt-8 pt-6"></div>
                      <p className="text-xs text-gray-500">Authorized Signature & Stamp</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-bold">Second Party (Employee)</p>
                      <p className="text-xs text-gray-600">{contractPreview.variables?.fullName || displayName}</p>
                      {contractIsSigned && activeContract?.signedAt ? (
                        <div className="mt-4 pt-2 text-center">
                          <div className="inline-block border-2 border-emerald-600 rounded-md px-4 py-2">
                            <p className="text-xs font-bold text-emerald-700">DIGITALLY SIGNED</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              {new Date(activeContract.signedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="border-b border-gray-400 mt-8 pt-6"></div>
                          <p className="text-xs text-gray-500">Employee Signature</p>
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
                <Button variant="outline" onClick={() => setContractPreviewOpen(false)} className="border-border">Close</Button>
                <Button
                  variant="outline"
                  className="border-border gap-2"
                  onClick={() => printContract('Employment Contract')}
                  data-testid="button-print-contract-candidate"
                >
                  <Download className="h-3.5 w-3.5" />
                  Print / Export PDF
                </Button>
                {!contractIsSigned && !readOnly && (
                  <Button
                    onClick={() => { setContractPreviewOpen(false); setIsSignModalOpen(true); }}
                    className="bg-primary text-primary-foreground font-bold"
                    data-testid="button-proceed-to-sign"
                  >
                    <PenTool className="h-3.5 w-3.5 mr-1.5" />
                    Proceed to Sign
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
              Sign Employment Contract
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              By signing, you agree to all terms. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <p className="text-sm text-yellow-400 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Please ensure you have read and understood all contract terms.
              </p>
            </div>
            <div className="bg-muted/20 rounded-lg p-3 text-sm text-muted-foreground space-y-1">
              <p><strong className="text-white">Date:</strong> {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
              <p><strong className="text-white">Method:</strong> Digital signature (IP-recorded)</p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsSignModalOpen(false)} className="border-border">Cancel</Button>
            <Button
              onClick={() => signContractMutation.mutate()}
              disabled={signContractMutation.isPending}
              className="bg-primary text-primary-foreground font-bold gap-2"
              data-testid="button-confirm-sign"
            >
              {signContractMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              I Agree & Sign
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Portal ──────────────────────────────────────────────────────────────

export default function CandidatePortal() {
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
  });

  const { data: allWorkforceRecords = [] } = useQuery<WorkforceRecord[]>({
    queryKey: ["/api/workforce/all-by-candidate", candidateId],
    queryFn: () => apiRequest("GET", `/api/workforce/all-by-candidate/${candidateId}`).then(r => r.json()),
    enabled: !!candidateId,
  });

  const portalMode = resolvePortalMode(candidateProfile, activeWorkforceRecord, allWorkforceRecords);
  const navItems = getNavItems(portalMode);
  const isSmp = portalMode === "employee_smp" || portalMode === "former_smp";

  useEffect(() => {
    if (!navItems.includes(activeNav)) {
      setActiveNav(navItems[0] ?? "jobs");
    }
  }, [portalMode]);
  const isEmployee = portalMode === "employee_individual" || portalMode === "employee_smp";
  const isFormer = portalMode === "former_individual" || portalMode === "former_smp";
  const mostRecentRecord = allWorkforceRecords[0] ?? null;

  const { data: pendingPhotoRequests = [] } = useQuery<{ id: string; status: string; newPhotoUrl: string }[]>({
    queryKey: ["/api/photo-change-requests", candidateId, "pending"],
    queryFn: () => apiRequest("GET", `/api/photo-change-requests?candidateId=${candidateId}&status=pending`).then(r => r.json()),
    enabled: !!candidateId && isEmployee,
  });
  const hasPendingPhotoChange = pendingPhotoRequests.length > 0;

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<JobPosting[]>({
    queryKey: ["/api/jobs", "active"],
    queryFn: () => apiRequest("GET", "/api/jobs?status=active").then(r => r.json()),
    enabled: portalMode === "candidate" || portalMode === "former_individual",
  });

  const { data: myApplications = [], refetch: refetchApplications } = useQuery<{ jobId: string; status: string }[]>({
    queryKey: ["/api/applications/mine", candidateId],
    queryFn: () => apiRequest("GET", `/api/applications?candidateId=${candidateId}`).then(r => r.json()),
    enabled: !!candidateId && (portalMode === "candidate" || portalMode === "former_individual"),
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: myInterviews = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/interviews/mine", candidateId],
    queryFn: () => apiRequest("GET", `/api/interviews?candidateId=${candidateId}`).then(r => r.json()),
    enabled: !!candidateId && portalMode === "candidate",
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
      toast({ title: "Profile updated", description: "Your information has been saved." });
      setProfileOpen(false);
    },
    onError: () => toast({ title: "Save failed", description: "Please try again.", variant: "destructive" }),
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
      toast({ title: "Password changed", description: "Your new password is active." });
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const handleProfileOpen = (open: boolean) => {
    if (open && candidateProfile) {
      setProfileSkills(Array.isArray(candidateProfile.skills) ? (candidateProfile.skills as string[]).join(", ") : "");
      setProfileLangs(Array.isArray(candidateProfile.languages) ? (candidateProfile.languages as string[]).join(", ") : "");
      setProfileEduLevel(String(candidateProfile.educationLevel ?? ""));
      setProfileMajor(String(candidateProfile.major ?? ""));
      setProfileRegion(String(candidateProfile.region ?? ""));
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

  const handlePhotoChangeUpload = async (croppedFile: File) => {
    setPhotoChangeCropSrc(null);
    setPhotoChangeUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", croppedFile);
      formData.append("docType", "photo");
      const res = await fetch(`/api/candidates/${candidateId}/documents`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      const body = await res.json();
      if (body.pendingReview) {
        queryClient.invalidateQueries({ queryKey: ["/api/photo-change-requests", candidateId, "pending"] });
        toast({
          title: "Photo submitted for review",
          description: "Your new photo has been sent to HR for approval. Your current photo remains active until approved.",
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/candidates/profile", candidateId] });
        toast({ title: "Photo updated" });
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
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
      toast({ title: "Region Required", description: "Please select your region of residence.", variant: "destructive" });
      return;
    }

    if (!isSmp) {
      const iban = ibanValue.trim().toUpperCase();
      if (!iban) {
        toast({ title: "IBAN Required", description: "Please enter your Saudi IBAN number for salary transfers.", variant: "destructive" });
        return;
      }
      if (!/^SA\d{22}$/.test(iban)) {
        toast({ title: "Invalid IBAN", description: "IBAN must be SA followed by 22 digits (24 characters total)", variant: "destructive" });
        return;
      }
      raw.ibanNumber   = iban;
      raw.ibanBankName = detectedBank?.ibanBankName ?? null;
      raw.ibanBankCode = detectedBank?.ibanBankCode ?? null;
    }
    saveProfile.mutate(raw);
  }

  function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (pwNew !== pwConfirm) {
      toast({ title: "Passwords don't match", description: "Please re-enter your new password.", variant: "destructive" });
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
    ? (isSmp ? "Employee Portal (SMP)" : "Employee Portal")
    : isFormer
    ? (isSmp ? "Former Employee (SMP)" : "Former Employee Portal")
    : "Candidate Portal";

  const portalSubtitle = isEmployee
    ? (isSmp ? "Your shift schedule and work history." : "Manage your employment details and profile.")
    : isFormer
    ? "Your employment has ended. Your records remain accessible."
    : "Browse open positions and manage your applications.";

  // ── Content for current mode/tab ─────────────────────────────────────────

  function renderMainContent() {
    switch (activeNav) {
      case "documents":
        return (
          <div>
            <h3 className="text-lg font-display font-bold text-white mb-4">My Documents</h3>
            <ProfileCompletionCard toast={toast} candidateId={candidateId!} isSmp={false} />
          </div>
        );

      case "shift":
        return <PlaceholderCard icon={<Calendar className="h-6 w-6" />} title="My Shift" description="Your shift schedule will appear here once the scheduling module is live." />;

      case "payslips":
        if (portalMode === "employee_individual" || portalMode === "former_individual") {
          return <PlaceholderCard icon={<Banknote className="h-6 w-6" />} title="Payslips" description="Your payslips will appear here once the payroll module is live." />;
        }
        return null;

      case "assets":
        if (portalMode === "employee_individual") {
          return <PlaceholderCard icon={<Package className="h-6 w-6" />} title="Assigned Assets" description="Assets assigned to you will appear here once the asset management module is live." />;
        }
        return null;

      case "history":
        return (
          <div>
            <h3 className="text-lg font-display font-bold text-white mb-4">Work History</h3>
            <WorkHistorySection candidateId={candidateId!} />
          </div>
        );

      case "contract":
        return (
          <div>
            <h3 className="text-lg font-display font-bold text-white mb-4">My Contract</h3>
            <ContractSection
              candidateId={candidateId!}
              candidateName={displayName}
              readOnly={portalMode === "former_individual"}
            />
          </div>
        );

      case "jobs":
        return (
          <Tabs defaultValue="open">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-display font-bold text-white">
                {isFormer ? "Reapply for Positions" : "Job Opportunities"}
              </h3>
              <TabsList className="bg-muted/20">
                <TabsTrigger value="open">Open Positions</TabsTrigger>
                <TabsTrigger value="applied">Applied {appliedIds.size > 0 && `(${appliedIds.size})`}</TabsTrigger>
              </TabsList>
            </div>
            {isFormer && (
              <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-300 flex items-center gap-2">
                <Shield className="h-4 w-4 shrink-0" />
                Your previous employment history is preserved. You are eligible to reapply for future positions.
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
                  <p className="text-muted-foreground font-medium">No open positions right now</p>
                  <p className="text-muted-foreground/60 text-sm mt-1">Check back soon</p>
                </div>
              ) : (
                jobs.map(job => {
                  const applied = appliedIds.has(job.id);
                  const salary = salaryLabel(job);
                  return (
                    <Card
                      key={job.id}
                      className="bg-card border-border hover:border-primary/40 transition-all group cursor-pointer"
                      onClick={() => setLocation(`/jobs/${job.id}`)}
                      data-testid={`card-job-${job.id}`}
                    >
                      <CardContent className="p-5">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <h4 className="font-bold text-white text-base group-hover:text-primary transition-colors">{job.title}</h4>
                              <Badge variant="outline" className="border-border text-muted-foreground text-xs font-normal">{typeLabel(job.type)}</Badge>
                              {applied && (
                                <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 text-xs font-medium gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Applied
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                              {(job.region ?? job.location) && (
                                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.region ?? job.location}</span>
                              )}
                              {salary && (
                                <span className="flex items-center gap-1 text-white font-medium"><Banknote className="h-3.5 w-3.5 text-muted-foreground" />{salary}</span>
                              )}
                              {job.deadline && (
                                <span className="flex items-center gap-1 text-xs"><CalendarDays className="h-3.5 w-3.5" />Deadline: {job.deadline}</span>
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
                                Apply Now
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
                  <p className="text-muted-foreground font-medium">No applications yet</p>
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
                          <div className="font-bold text-white text-base group-hover:text-primary transition-colors">{job.title}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-3 mt-1">
                            {(job.region ?? job.location) && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.region ?? job.location}</span>}
                            <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{typeLabel(job.type)}</span>
                          </div>
                        </div>
                        {(() => {
                          const badge = getApplicationBadge(job.deadline, appStatusByJob[job.id] ?? "new");
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

      case "dashboard":
      default:
        return (
          <div className="space-y-6">
            {/* Former employee banner */}
            {isFormer && mostRecentRecord && (
              <TerminationBanner record={mostRecentRecord} />
            )}

            {/* Employee info card (individual active) */}
            {portalMode === "employee_individual" && activeWorkforceRecord && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg font-display text-white flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-primary" />
                    Employment Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Employee Number</p>
                      <p className="text-lg font-bold text-white font-mono">{activeWorkforceRecord.employeeNumber}</p>
                    </div>
                    <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Status</p>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        <p className="text-lg font-bold text-emerald-400">Active</p>
                      </div>
                    </div>
                    <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Monthly Salary</p>
                      <p className="text-lg font-bold text-white">{activeWorkforceRecord.salary ? `${Number(activeWorkforceRecord.salary).toLocaleString()} SAR` : "—"}</p>
                    </div>
                    <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Start Date</p>
                      <p className="text-lg font-bold text-white">{new Date(activeWorkforceRecord.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                    </div>
                    {activeWorkforceRecord.jobTitle && (
                      <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Position</p>
                        <p className="text-lg font-bold text-white">{activeWorkforceRecord.jobTitle}</p>
                      </div>
                    )}
                    {activeWorkforceRecord.eventName && (
                      <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Assigned Event</p>
                        <p className="text-lg font-bold text-white">{activeWorkforceRecord.eventName}</p>
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
                    SMP Employment Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Employee Number</p>
                      <p className="text-lg font-bold text-white font-mono">{activeWorkforceRecord.employeeNumber}</p>
                    </div>
                    <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Contract Type</p>
                      <Badge className="bg-amber-500/15 text-amber-400 border-0">SMP Contract</Badge>
                    </div>
                    <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Start Date</p>
                      <p className="text-lg font-bold text-white">{new Date(activeWorkforceRecord.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                    </div>
                    {activeWorkforceRecord.eventName && (
                      <div className="bg-muted/10 rounded-lg border border-border p-4 space-y-1">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Assigned Event</p>
                        <p className="text-lg font-bold text-white">{activeWorkforceRecord.eventName}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Candidate dashboard */}
            {portalMode === "candidate" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Card className="bg-card border-border">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-white">{appliedIds.size}</div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Applied</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-card border-border">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-white">{myInterviews.length}</div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Interviews</div>
                    </CardContent>
                  </Card>
                </div>
                <ProfileCompletionCard toast={toast} candidateId={candidateId!} isSmp={false} />
              </div>
            )}

            {/* Former views additional content */}
            {isFormer && (
              <div className="space-y-4">
                <Card className="bg-card border-border">
                  <CardContent className="p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-white mb-1">Your Records</p>
                    <p>All your employment history, {portalMode === "former_individual" ? "contracts, and payslips" : "and work records"} remain on file and accessible below.</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        );
    }
  }

  return (
    <div className="min-h-screen bg-background font-sans text-foreground flex flex-col">
      {/* Navbar */}
      <header className="h-16 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50 px-4 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/workforce-logo.svg" alt="Workforce" className="h-8 w-8" />
          <span className="font-display font-bold text-xl tracking-tight text-white hidden sm:inline-block">
            WORKFORCE
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
                {NAV_LABELS[key]}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-white relative">
            <Bell className="h-5 w-5" />
          </Button>
          <div className="pl-4 border-l border-border/50">
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
                  My Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive gap-2"
                  onClick={() => { localStorage.removeItem("workforce_candidate"); setLocation("/auth"); }}
                  data-testid="menu-item-signout"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
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
              <BadgeCheck className="h-4 w-4 mr-1.5" />
              {isSmp ? "SMP Contract" : "Active Employee"}
            </Badge>
          )}
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left sidebar: Profile card */}
          <div className="space-y-6">
            <Card className="bg-card border-border overflow-hidden">
              <div className={`h-20 bg-gradient-to-r ${isEmployee ? (isSmp ? "from-amber-600/20 to-amber-600/5" : "from-emerald-600/20 to-emerald-600/5") : isFormer ? "from-red-600/20 to-red-600/5" : "from-primary/20 to-primary/5"}`} />
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
                        <span className="text-[9px] text-white font-medium leading-tight">Change Photo</span>
                      </div>
                    ) : (
                      <User className="h-6 w-6 text-white" />
                    )}
                  </span>
                  {hasPendingPhotoChange && (
                    <span className="absolute -top-1 -right-1 flex items-center justify-center h-5 w-5 rounded-full bg-amber-500 border-2 border-card z-10" title="Photo change pending review" data-testid="badge-photo-pending">
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
                      ? (activeWorkforceRecord?.jobTitle ?? (isSmp ? "SMP Worker" : "Employee"))
                      : String(candidateProfile?.currentRole ?? "Job Seeker")}
                  </p>
                  {isEmployee && (
                    <Badge className={`mt-2 text-xs gap-1 ${isSmp ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"}`}>
                      <BadgeCheck className="h-3 w-3" />
                      {isSmp ? "SMP Contract" : "Active Employee"}
                    </Badge>
                  )}
                  {isFormer && (
                    <Badge className="mt-2 bg-red-500/15 text-red-400 border border-red-500/30 text-xs gap-1">
                      <AlertTriangle className="h-3 w-3" /> Former Employee
                    </Badge>
                  )}
                </div>

                {(isEmployee && activeWorkforceRecord) && (
                  <div className="mt-6 border-t border-border pt-5 space-y-3 text-left">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Hash className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Employee ID</p>
                        <p className="text-sm font-bold text-white font-mono" data-testid="text-employee-number">{activeWorkforceRecord.employeeNumber}</p>
                      </div>
                    </div>
                    {!isSmp && activeWorkforceRecord.salary && (
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
                          <Banknote className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Monthly Salary</p>
                          <p className="text-sm font-bold text-white" data-testid="text-employee-salary">{Number(activeWorkforceRecord.salary).toLocaleString()} SAR</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                        <Clock className="h-4 w-4 text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Start Date</p>
                        <p className="text-sm font-bold text-white" data-testid="text-employee-start-date">
                          {new Date(activeWorkforceRecord.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                    </div>
                    {activeWorkforceRecord.eventName && (
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0">
                          <Building2 className="h-4 w-4 text-violet-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Event</p>
                          <p className="text-sm font-bold text-white" data-testid="text-employee-event">{activeWorkforceRecord.eventName}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {portalMode === "candidate" && (
                  <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5">
                    <div>
                      <div className="text-2xl font-bold text-white">{appliedIds.size}</div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">Applied</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-white">{myInterviews.length}</div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">Interviews</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Documents card — only show for candidate or active SMP employee, not for former SMP */}
            {(portalMode === "candidate" || portalMode === "employee_smp") && (
              <ProfileCompletionCard toast={toast} candidateId={candidateId!} isSmp={isSmp} />
            )}

            {/* Contract in sidebar for candidate / individual employee */}
            {(portalMode === "candidate" || portalMode === "employee_individual") && (
              <Card className="bg-card border-border">
                <CardContent className="p-5">
                  <ContractSection candidateId={candidateId!} candidateName={displayName} />
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
                Change Profile Photo
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm">
                {hasPendingPhotoChange
                  ? "You already have a photo change pending HR review. Submitting a new photo will create another request."
                  : "Upload a new profile photo. It will be reviewed by HR before becoming active."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border-2 border-border">
                  {!!candidateProfile?.photoUrl && <AvatarImage src={String(candidateProfile!.photoUrl)} className="object-cover" />}
                  <AvatarFallback className="text-lg bg-primary/20 text-primary font-bold">{displayInitials}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm text-white font-medium">Current Photo</p>
                  {hasPendingPhotoChange && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Clock className="h-3 w-3 text-amber-400" />
                      <span className="text-xs text-amber-400">Change pending review</span>
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
                Select New Photo
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
      />

      {/* ─── Profile Editor Sheet ──────────────────────────────────────────── */}
      <Sheet open={profileOpen} onOpenChange={handleProfileOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg bg-card border-border overflow-y-auto">
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              My Profile
            </SheetTitle>
            <SheetDescription className="text-muted-foreground text-sm">
              {isSmp
                ? "Update your personal information. Photo and ID are required for SMP contracts."
                : "Update your personal and professional information."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleProfileSave} className="py-6 space-y-6">

            {/* ── Personal ──────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Personal</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-white">First Name</label>
                    <Input
                      name="firstName"
                      defaultValue={(candidateProfile?.fullNameEn ?? storedCandidate.fullNameEn ?? "").toString().split(" ")[0]}
                      placeholder="Mohammed"
                      className="bg-background border-border"
                      data-testid="input-firstName"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-white">Last Name</label>
                    <Input
                      name="lastName"
                      defaultValue={(candidateProfile?.fullNameEn ?? storedCandidate.fullNameEn ?? "").toString().split(" ").slice(1).join(" ")}
                      placeholder="Al-Harbi"
                      className="bg-background border-border"
                      data-testid="input-lastName"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white">Nationality</label>
                  <Input
                    name="nationalityText"
                    defaultValue={String(candidateProfile?.nationalityText ?? candidateProfile?.nationality ?? "")}
                    placeholder="e.g. Saudi"
                    className="bg-background border-border"
                    data-testid="input-nationality"
                  />
                </div>
              </div>
            </div>

            <Separator className="bg-border" />

            {/* ── Contact ───────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Contact</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white">Phone</label>
                  <Input
                    name="phone"
                    defaultValue={String(candidateProfile?.phone ?? storedCandidate.phone ?? "")}
                    placeholder="05xxxxxxxx"
                    className="bg-background border-border"
                    data-testid="input-phone"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white">Email</label>
                  <Input
                    name="email"
                    type="email"
                    defaultValue={String(candidateProfile?.email ?? "")}
                    placeholder="your@email.com"
                    className="bg-background border-border"
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white">City of Residence</label>
                  <Input
                    name="city"
                    defaultValue={String(candidateProfile?.city ?? "")}
                    placeholder="e.g. Riyadh"
                    className="bg-background border-border"
                    data-testid="input-city"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white">Region <span className="text-red-400">*</span></label>
                  <Select value={profileRegion} onValueChange={setProfileRegion}>
                    <SelectTrigger className="bg-background border-border" data-testid="select-region">
                      <SelectValue placeholder="Select your region" />
                    </SelectTrigger>
                    <SelectContent>
                      {["Riyadh", "Makkah", "Madinah", "Eastern Province", "Asir", "Tabuk", "Hail", "Northern Borders", "Jazan", "Najran", "Al Bahah", "Al Jawf", "Qassim"].map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
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
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Bank Details</p>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-white">IBAN Number <span className="text-red-400">*</span></label>
                    <Input
                      value={ibanValue}
                      onChange={e => setIbanValue(e.target.value.toUpperCase())}
                      placeholder="SA0000000000000000000000"
                      maxLength={24}
                      className="bg-background border-border font-mono uppercase"
                      data-testid="input-iban"
                    />
                    <p className="text-xs text-muted-foreground">Saudi IBAN: SA followed by 22 digits (24 characters total)</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Bank Name</label>
                      <Input
                        value={detectedBank?.ibanBankName ?? ""}
                        readOnly
                        placeholder="Auto-detected from IBAN"
                        className="bg-muted/10 border-border text-muted-foreground cursor-not-allowed"
                        data-testid="input-bank-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Bank Code</label>
                      <Input
                        value={detectedBank?.ibanBankCode ?? ""}
                        readOnly
                        placeholder="Auto-detected"
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
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Professional</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-white">Current Role</label>
                      <Input
                        name="currentRole"
                        defaultValue={String(candidateProfile?.currentRole ?? "")}
                        placeholder="e.g. Security Guard"
                        className="bg-background border-border"
                        data-testid="input-currentRole"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-white">Current Employer</label>
                      <Input
                        name="currentEmployer"
                        defaultValue={String(candidateProfile?.currentEmployer ?? "")}
                        placeholder="Company name"
                        className="bg-background border-border"
                        data-testid="input-currentEmployer"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-white">Education Level</label>
                    <Select value={profileEduLevel} onValueChange={setProfileEduLevel}>
                      <SelectTrigger className="bg-background border-border" data-testid="select-educationLevel">
                        <SelectValue placeholder="Select education level" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {EDU_OPTIONS.map(opt => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {profileEduLevel === "University and higher" && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-white">Field of Study / Major</label>
                      <Input
                        value={profileMajor}
                        onChange={e => setProfileMajor(e.target.value)}
                        placeholder="e.g. Business Administration"
                        className="bg-background border-border"
                        data-testid="input-major"
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-white">
                      Skills <span className="text-muted-foreground font-normal ml-1 text-xs">separate with commas</span>
                    </label>
                    <Textarea
                      value={profileSkills}
                      onChange={e => setProfileSkills(e.target.value)}
                      onBlur={() => setProfileSkills(normalizeDisplay(profileSkills))}
                      placeholder="First Aid, Crowd Control, Customer Service"
                      className="bg-background border-border resize-none"
                      rows={2}
                      data-testid="input-skills"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-white">
                      Languages <span className="text-muted-foreground font-normal ml-1 text-xs">separate with commas</span>
                    </label>
                    <Textarea
                      value={profileLangs}
                      onChange={e => setProfileLangs(e.target.value)}
                      onBlur={() => setProfileLangs(normalizeDisplay(profileLangs))}
                      placeholder="Arabic, English, Urdu"
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
                {saveProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
              <Button type="button" variant="outline" onClick={() => setProfileOpen(false)} className="border-border">
                Cancel
              </Button>
            </div>
          </form>

          <Separator className="bg-border" />

          {/* ── Change Password ───────────────────────────────────────── */}
          <form onSubmit={handlePasswordSave} className="py-6 space-y-3 pb-10">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
              <Lock className="h-3.5 w-3.5" />
              Change Password
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-white">Current Password</label>
              <div className="relative">
                <Input
                  type={showPwCur ? "text" : "password"}
                  value={pwCurrent}
                  onChange={e => setPwCurrent(e.target.value)}
                  placeholder="Enter current password"
                  className="bg-background border-border pr-10"
                  data-testid="input-pw-current"
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white" onClick={() => setShowPwCur(!showPwCur)}>
                  {showPwCur ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-white">New Password</label>
              <div className="relative">
                <Input
                  type={showPwNew ? "text" : "password"}
                  value={pwNew}
                  onChange={e => setPwNew(e.target.value)}
                  placeholder="Enter new password (min 8 chars)"
                  className="bg-background border-border pr-10"
                  data-testid="input-pw-new"
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white" onClick={() => setShowPwNew(!showPwNew)}>
                  {showPwNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-white">Confirm New Password</label>
              <Input
                type="password"
                value={pwConfirm}
                onChange={e => setPwConfirm(e.target.value)}
                placeholder="Re-enter new password"
                className="bg-background border-border"
                data-testid="input-pw-confirm"
              />
            </div>
            <Button
              type="submit"
              disabled={changePassword.isPending || !pwCurrent || !pwNew || !pwConfirm}
              variant="outline"
              className="w-full border-border"
              data-testid="button-change-password"
            >
              {changePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
              Update Password
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
