import * as XLSX from "xlsx";
import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useRef } from "react";
import {
  Search,
  Plus,
  Loader2,
  ChevronRight,
  Trash2,
  Users,
  Building2,
  FileText,
  Download,
  Eye,
  Phone,
  Mail,
  MapPin,
  X,
  FolderOpen,
  FilePlus,
  Banknote,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { KSA_REGIONS } from "@shared/schema";
import type { SMPCompany, SMPDocument } from "@shared/schema";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/lib/format";

type WorkerRow = {
  id: string;
  employeeNumber: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  nationalId: string | null;
  phone: string | null;
  photoUrl: string | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  salary: string | null;
  candidateId: string;
};

function formatGregDate(input: string | Date, locale: string) {
  const d = typeof input === "string" ? new Date(input) : input;
  const tag = locale.startsWith("ar") ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB";
  return d.toLocaleDateString(tag, { day: "numeric", month: "short", year: "numeric" });
}

function CreateCompanyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation(["smpContracts"]);
  const { toast } = useToast();
  const qc = useQueryClient();

  const emptyForm = {
    name: "",
    crNumber: "",
    contactPerson: "",
    contactPhone: "",
    contactEmail: "",
    bankName: "",
    bankIban: "",
    region: "",
    notes: "",
  };

  const [form, setForm] = useState(emptyForm);

  function reset() { setForm(emptyForm); }

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest("POST", "/api/smp-companies", data).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/smp-companies"] });
      toast({ title: t("smpContracts:create.successTitle") });
      reset();
      onOpenChange(false);
    },
    onError: () => toast({ title: t("smpContracts:create.errorTitle"), description: t("smpContracts:create.errorDesc"), variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast({ title: t("smpContracts:create.nameRequired"), variant: "destructive" });
    mutation.mutate(form);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-white font-display text-xl">{t("smpContracts:create.title")}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {t("smpContracts:create.desc")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-white text-sm">{t("smpContracts:create.name")} <span className="text-red-400">*</span></Label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={t("smpContracts:create.namePh")}
              className="bg-muted/30 border-border"
              data-testid="input-smp-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-white text-sm">{t("smpContracts:create.cr")}</Label>
              <Input
                value={form.crNumber}
                onChange={e => setForm(f => ({ ...f, crNumber: e.target.value }))}
                placeholder={t("smpContracts:create.crPh")}
                dir="ltr"
                className="bg-muted/30 border-border font-mono text-xs"
                data-testid="input-smp-cr"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white text-sm">{t("smpContracts:create.region")}</Label>
              <Select value={form.region} onValueChange={v => setForm(f => ({ ...f, region: v }))}>
                <SelectTrigger className="bg-muted/30 border-border text-white" data-testid="select-smp-region">
                  <SelectValue placeholder={t("smpContracts:create.regionPh")} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {KSA_REGIONS.map(r => <SelectItem key={r} value={r} className="text-white"><bdi>{r}</bdi></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{t("smpContracts:create.contactInfo")}</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-white text-sm">{t("smpContracts:create.contactPerson")}</Label>
                <Input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} placeholder={t("smpContracts:create.contactPersonPh")} className="bg-muted/30 border-border" data-testid="input-smp-contact-person" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-white text-sm">{t("smpContracts:create.contactPhone")}</Label>
                <Input value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder={t("smpContracts:create.contactPhonePh")} dir="ltr" className="bg-muted/30 border-border" data-testid="input-smp-contact-phone" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white text-sm">{t("smpContracts:create.contactEmail")}</Label>
              <Input type="email" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder={t("smpContracts:create.contactEmailPh")} dir="ltr" className="bg-muted/30 border-border" data-testid="input-smp-contact-email" />
            </div>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{t("smpContracts:create.bankInfo")}</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-white text-sm">{t("smpContracts:create.bankName")}</Label>
                <Input value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} placeholder={t("smpContracts:create.bankNamePh")} className="bg-muted/30 border-border" data-testid="input-smp-bank-name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-white text-sm">{t("smpContracts:create.bankIban")}</Label>
                <Input value={form.bankIban} onChange={e => setForm(f => ({ ...f, bankIban: e.target.value.toUpperCase() }))} placeholder={t("smpContracts:create.bankIbanPh")} dir="ltr" className="bg-muted/30 border-border font-mono text-xs" data-testid="input-smp-bank-iban" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-white text-sm">{t("smpContracts:create.notes")}</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder={t("smpContracts:create.notesPh")} className="bg-muted/30 border-border resize-none" rows={2} data-testid="textarea-smp-notes" />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => { reset(); onOpenChange(false); }} className="text-muted-foreground">{t("smpContracts:create.cancel")}</Button>
            <Button type="submit" disabled={mutation.isPending} className="bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs" data-testid="button-submit-smp">
              {mutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Plus className="me-2 h-4 w-4" />}
              {t("smpContracts:create.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DocumentVault({ company, events }: { company: SMPCompany; events: { id: string; name: string }[] }) {
  const { t, i18n } = useTranslation(["smpContracts"]);
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<SMPDocument | null>(null);
  const [description, setDescription] = useState("");
  const [eventId, setEventId] = useState("");

  const { data: docs = [], isLoading } = useQuery<SMPDocument[]>({
    queryKey: ["/api/smp-companies", company.id, "documents"],
    queryFn: () => apiRequest("GET", `/api/smp-companies/${company.id}/documents`).then(r => r.json()),
  });

  const createDocMutation = useMutation({
    mutationFn: (data: { fileUrl: string; fileName: string; description?: string; eventId?: string }) =>
      apiRequest("POST", `/api/smp-companies/${company.id}/documents`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/smp-companies", company.id, "documents"] });
    },
    onError: () => toast({ title: t("smpContracts:docs.saveFail"), variant: "destructive" }),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => apiRequest("DELETE", `/api/smp-companies/${company.id}/documents/${docId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/smp-companies", company.id, "documents"] });
    },
    onError: () => toast({ title: t("smpContracts:docs.deleteFail"), variant: "destructive" }),
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
        const { url } = await res.json();
        await createDocMutation.mutateAsync({
          fileUrl: url,
          fileName: file.name,
          description: description.trim() || undefined,
          eventId: (eventId && eventId !== "_none") ? eventId : undefined,
        });
      }
      toast({ title: t("smpContracts:docs.uploadedToast", { count: files.length, replace: { count: formatNumber(files.length, i18n.language) } }) });
      setDescription("");
      setEventId("");
    } catch (err: any) {
      toast({ title: t("smpContracts:docs.uploadFail"), description: err?.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url);

  return (
    <div className="space-y-4">
      <div className="space-y-2 border border-border rounded-sm p-3 bg-muted/5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{t("smpContracts:docs.uploadHeader")}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <Input
              placeholder={t("smpContracts:docs.descriptionPh")}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="bg-muted/30 border-border text-sm"
              data-testid="input-doc-description"
            />
          </div>
          <div className="col-span-2">
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger className="bg-muted/30 border-border text-white text-sm" data-testid="select-doc-event">
                <SelectValue placeholder={t("smpContracts:docs.eventPh")} />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="_none" className="text-muted-foreground">{t("smpContracts:docs.noEvent")}</SelectItem>
                {events.map(ev => <SelectItem key={ev.id} value={ev.id} className="text-white"><bdi>{ev.name}</bdi></SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-border text-xs gap-1.5 w-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          data-testid="button-upload-docs"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus className="h-3.5 w-3.5" />}
          {uploading ? t("smpContracts:docs.uploading") : t("smpContracts:docs.chooseUpload")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <div className="space-y-1.5">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
        ) : docs.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-border rounded-sm">
            <FolderOpen className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">{t("smpContracts:docs.noDocs")}</p>
          </div>
        ) : (
          docs.map((doc) => {
            const ev = events.find(e => e.id === doc.eventId);
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 px-3 py-2 rounded-sm bg-muted/10 border border-border hover:bg-muted/20 transition-colors"
                data-testid={`row-doc-${doc.id}`}
              >
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate"><bdi>{doc.fileName}</bdi></p>
                  <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span dir="ltr">{formatGregDate(doc.uploadedAt, i18n.language)}</span>
                    {doc.description && <span className="text-zinc-400">· <bdi>{doc.description}</bdi></span>}
                    {ev && <Badge className="text-[9px] bg-blue-900/30 text-blue-400 border-0"><bdi>{ev.name}</bdi></Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-white" onClick={() => setPreviewDoc(doc)} data-testid={`button-preview-doc-${doc.id}`}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <a href={doc.fileUrl} download={doc.fileName} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-white" data-testid={`button-download-doc-${doc.id}`}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-400" onClick={() => deleteDocMutation.mutate(doc.id)} disabled={deleteDocMutation.isPending} data-testid={`button-remove-doc-${doc.id}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {previewDoc && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewDoc(null)}>
          <div className="bg-card border border-border rounded-lg max-w-3xl w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-medium text-white"><bdi>{previewDoc.fileName}</bdi></span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setPreviewDoc(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4">
              {isImage(previewDoc.fileUrl) ? (
                <img src={previewDoc.fileUrl} alt={previewDoc.fileName} className="max-w-full rounded" />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-sm">{t("smpContracts:docs.previewUnavailable")}</p>
                  <a href={previewDoc.fileUrl} download={previewDoc.fileName} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="border-border mt-3 gap-2"><Download className="h-3.5 w-3.5" />{t("smpContracts:docs.downloadFile")}</Button>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function WorkersList({ companyId }: { companyId: string }) {
  const { t, i18n } = useTranslation(["smpContracts"]);
  const { data: workers = [], isLoading } = useQuery<WorkerRow[]>({
    queryKey: ["/api/smp-companies", companyId, "workers"],
    queryFn: () => apiRequest("GET", `/api/smp-companies/${companyId}/workers`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const active = workers.filter(w => w.isActive);
  const inactive = workers.filter(w => !w.isActive);

  function exportToExcel() {
    const x = (k: string) => t(`smpContracts:workers.xlsx.${k}`);
    const rows = workers.map(w => ({
      [x("employeeNo")]: w.employeeNumber,
      [x("fullName")]: w.fullNameEn ?? "",
      [x("nationalId")]: w.nationalId ?? "",
      [x("phone")]: w.phone ?? "",
      [x("startDate")]: w.startDate,
      [x("endDate")]: w.endDate ?? "",
      [x("status")]: w.isActive ? x("active") : x("terminated"),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, x("sheet"));
    XLSX.writeFile(wb, `smp-workers-${companyId}.xlsx`);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-white">{t("smpContracts:workers.header")}</span>
          <Badge className="text-[10px] bg-primary/15 text-primary border-0">{formatNumber(workers.length, i18n.language)}</Badge>
        </div>
        {workers.length > 0 && (
          <Button size="sm" variant="outline" className="border-border text-xs gap-1.5 h-7" onClick={exportToExcel} data-testid="button-export-workers">
            <Download className="h-3.5 w-3.5" />{t("smpContracts:workers.export")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : workers.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border rounded-sm">
          <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">{t("smpContracts:workers.empty")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {active.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                {t("smpContracts:workers.active", { count: active.length, replace: { count: formatNumber(active.length, i18n.language) } })}
              </p>
              {active.map(w => <WorkerCard key={w.id} worker={w} />)}
            </>
          )}
          {inactive.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mt-3">
                {t("smpContracts:workers.terminated", { count: inactive.length, replace: { count: formatNumber(inactive.length, i18n.language) } })}
              </p>
              {inactive.map(w => <WorkerCard key={w.id} worker={w} />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WorkerCard({ worker }: { worker: WorkerRow }) {
  const { t } = useTranslation(["smpContracts"]);
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-sm border transition-colors ${worker.isActive ? "bg-muted/10 border-border hover:bg-muted/20" : "bg-muted/5 border-border/50 opacity-60"}`}
      data-testid={`row-worker-${worker.id}`}
    >
      <Avatar className="h-8 w-8 border border-border shrink-0">
        <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
          {(worker.fullNameEn ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white truncate"><bdi>{worker.fullNameEn ?? t("smpContracts:workers.unknown")}</bdi></p>
          {worker.isActive
            ? <Badge className="text-[9px] bg-emerald-900/40 text-emerald-400 border-0 shrink-0">{t("smpContracts:workers.activeBadge")}</Badge>
            : <Badge className="text-[9px] bg-zinc-800 text-zinc-400 border-0 shrink-0">{t("smpContracts:workers.terminatedBadge")}</Badge>}
        </div>
        <p className="text-[11px] text-muted-foreground font-mono" dir="ltr">#{worker.employeeNumber}{worker.nationalId ? ` · ${worker.nationalId}` : ""}</p>
      </div>
      <div className="text-[11px] text-muted-foreground text-end shrink-0">
        <p dir="ltr">{worker.startDate}</p>
        {worker.endDate && <p className="text-red-400/70" dir="ltr">{worker.endDate}</p>}
      </div>
    </div>
  );
}

function CompanySheet({
  company,
  open,
  onOpenChange,
  events,
}: {
  company: SMPCompany | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  events: { id: string; name: string }[];
}) {
  const { t, i18n } = useTranslation(["smpContracts"]);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<SMPCompany>>({});
  const [activeTab, setActiveTab] = useState<"info" | "docs" | "workers">("info");

  const updateMutation = useMutation({
    mutationFn: (data: Partial<SMPCompany>) =>
      apiRequest("PATCH", `/api/smp-companies/${company!.id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/smp-companies"] });
      setEditMode(false);
      toast({ title: t("smpContracts:sheet.saveSuccess") });
    },
    onError: () => toast({ title: t("smpContracts:create.errorTitle"), description: t("smpContracts:sheet.saveError"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/smp-companies/${company!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/smp-companies"] });
      onOpenChange(false);
      toast({ title: t("smpContracts:sheet.deleteSuccess") });
    },
    onError: () => toast({ title: t("smpContracts:create.errorTitle"), description: t("smpContracts:sheet.deleteError"), variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/smp-companies/${company!.id}`, { isActive: !company!.isActive }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/smp-companies"] });
      toast({ title: company!.isActive ? t("smpContracts:sheet.deactivated") : t("smpContracts:sheet.activated") });
    },
    onError: () => toast({ title: t("smpContracts:create.errorTitle"), description: t("smpContracts:sheet.toggleError"), variant: "destructive" }),
  });

  if (!company) return null;

  function startEdit() {
    setEditForm({
      name: company!.name,
      crNumber: company!.crNumber ?? "",
      contactPerson: company!.contactPerson ?? "",
      contactPhone: company!.contactPhone ?? "",
      contactEmail: company!.contactEmail ?? "",
      bankName: company!.bankName ?? "",
      bankIban: company!.bankIban ?? "",
      region: company!.region ?? "",
      notes: company!.notes ?? "",
    });
    setEditMode(true);
  }

  const tabClass = (tab: string) =>
    `px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
      activeTab === tab
        ? "text-primary border-b-2 border-primary"
        : "text-muted-foreground hover:text-white border-b-2 border-transparent"
    }`;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) { setEditMode(false); setActiveTab("info"); } onOpenChange(v); }}>
      <SheetContent side={i18n.language.startsWith("ar") ? "left" : "right"} className="w-full sm:max-w-2xl bg-card border-border flex flex-col p-0 overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-sm bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <SheetTitle className="font-display text-xl font-bold text-white leading-tight"><bdi>{company.name}</bdi></SheetTitle>
                <div className="text-muted-foreground mt-1 flex items-center gap-2 flex-wrap text-xs">
                  {company.crNumber && (
                    <span className="font-mono bg-muted/20 px-1.5 py-0.5 rounded text-[11px]" dir="ltr">{t("smpContracts:card.crPrefix")} {company.crNumber}</span>
                  )}
                  {company.region && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> <bdi>{company.region}</bdi></span>}
                  <Badge className={`text-[10px] border-0 ${company.isActive ? "bg-emerald-900/40 text-emerald-400" : "bg-zinc-800 text-zinc-400"}`}>
                    {company.isActive ? t("smpContracts:sheet.active") : t("smpContracts:sheet.inactive")}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className={`h-8 w-8 ${company.isActive ? "text-emerald-400 hover:text-emerald-300" : "text-zinc-500 hover:text-zinc-300"}`}
                onClick={() => toggleActiveMutation.mutate()}
                disabled={toggleActiveMutation.isPending}
                title={company.isActive ? t("smpContracts:sheet.deactivate") : t("smpContracts:sheet.activate")}
                data-testid="button-toggle-active"
              >
                {company.isActive ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
              </Button>
              <Button size="sm" variant="outline" className="border-border text-xs" onClick={editMode ? () => setEditMode(false) : startEdit} data-testid="button-edit-company">
                {editMode ? t("smpContracts:sheet.cancel") : t("smpContracts:sheet.edit")}
              </Button>
            </div>
          </div>
          <div className="flex border-b border-border mt-2 -mb-4">
            <button className={tabClass("info")} onClick={() => setActiveTab("info")} data-testid="tab-info">{t("smpContracts:sheet.tabInfo")}</button>
            <button className={tabClass("docs")} onClick={() => setActiveTab("docs")} data-testid="tab-docs">{t("smpContracts:sheet.tabDocs")}</button>
            <button className={tabClass("workers")} onClick={() => setActiveTab("workers")} data-testid="tab-workers">{t("smpContracts:sheet.tabWorkers")}</button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {activeTab === "info" && (
            editMode ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-white text-sm">{t("smpContracts:create.name")} *</Label>
                    <Input value={editForm.name ?? ""} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="bg-muted/30 border-border" data-testid="input-edit-name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white text-sm">{t("smpContracts:create.cr")}</Label>
                    <Input value={editForm.crNumber ?? ""} onChange={e => setEditForm(f => ({ ...f, crNumber: e.target.value }))} dir="ltr" className="bg-muted/30 border-border font-mono text-xs" data-testid="input-edit-cr" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white text-sm">{t("smpContracts:create.region")}</Label>
                    <Select value={editForm.region ?? ""} onValueChange={v => setEditForm(f => ({ ...f, region: v }))}>
                      <SelectTrigger className="bg-muted/30 border-border text-white" data-testid="select-edit-region">
                        <SelectValue placeholder={t("smpContracts:create.regionPh")} />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {KSA_REGIONS.map(r => <SelectItem key={r} value={r} className="text-white"><bdi>{r}</bdi></SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white text-sm">{t("smpContracts:create.contactPerson")}</Label>
                    <Input value={editForm.contactPerson ?? ""} onChange={e => setEditForm(f => ({ ...f, contactPerson: e.target.value }))} className="bg-muted/30 border-border" data-testid="input-edit-contact-person" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white text-sm">{t("smpContracts:create.contactPhone")}</Label>
                    <Input value={editForm.contactPhone ?? ""} onChange={e => setEditForm(f => ({ ...f, contactPhone: e.target.value }))} dir="ltr" className="bg-muted/30 border-border" data-testid="input-edit-contact-phone" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-white text-sm">{t("smpContracts:create.contactEmail")}</Label>
                    <Input type="email" value={editForm.contactEmail ?? ""} onChange={e => setEditForm(f => ({ ...f, contactEmail: e.target.value }))} dir="ltr" className="bg-muted/30 border-border" data-testid="input-edit-contact-email" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white text-sm">{t("smpContracts:create.bankName")}</Label>
                    <Input value={editForm.bankName ?? ""} onChange={e => setEditForm(f => ({ ...f, bankName: e.target.value }))} className="bg-muted/30 border-border" data-testid="input-edit-bank-name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white text-sm">{t("smpContracts:create.bankIban")}</Label>
                    <Input value={editForm.bankIban ?? ""} onChange={e => setEditForm(f => ({ ...f, bankIban: e.target.value.toUpperCase() }))} dir="ltr" className="bg-muted/30 border-border font-mono text-xs" data-testid="input-edit-bank-iban" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-white text-sm">{t("smpContracts:create.notes")}</Label>
                    <Textarea value={editForm.notes ?? ""} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="bg-muted/30 border-border resize-none" rows={3} data-testid="textarea-edit-notes" />
                  </div>
                </div>
                <div className="flex gap-2 justify-between pt-2">
                  <Button variant="outline" className="border-red-900/60 text-red-400 hover:bg-red-950/40 text-xs gap-1.5" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} data-testid="button-delete-company">
                    <Trash2 className="h-3.5 w-3.5" />{t("smpContracts:sheet.delete")}
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" className="border-border text-xs" onClick={() => setEditMode(false)}>{t("smpContracts:sheet.cancel")}</Button>
                    <Button className="bg-primary text-primary-foreground text-xs font-bold" onClick={() => updateMutation.mutate(editForm)} disabled={updateMutation.isPending || !editForm.name?.trim()} data-testid="button-save-company">
                      {updateMutation.isPending && <Loader2 className="h-3.5 w-3.5 me-1 animate-spin" />}{t("smpContracts:sheet.save")}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {company.contactPerson && <InfoRow icon={<Users className="h-4 w-4" />} label={t("smpContracts:sheet.labelContactPerson")} value={company.contactPerson} />}
                  {company.contactPhone && <InfoRow icon={<Phone className="h-4 w-4" />} label={t("smpContracts:sheet.labelPhone")} value={company.contactPhone} ltr />}
                  {company.contactEmail && <InfoRow icon={<Mail className="h-4 w-4" />} label={t("smpContracts:sheet.labelEmail")} value={company.contactEmail} ltr />}
                  {company.region && <InfoRow icon={<MapPin className="h-4 w-4" />} label={t("smpContracts:sheet.labelRegion")} value={company.region} />}
                  {company.bankName && <InfoRow icon={<Banknote className="h-4 w-4" />} label={t("smpContracts:sheet.labelBank")} value={company.bankName} />}
                  {company.bankIban && <InfoRow icon={<Banknote className="h-4 w-4" />} label={t("smpContracts:sheet.labelIban")} value={company.bankIban} ltr />}
                </div>
                {company.notes && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t("smpContracts:sheet.notes")}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap"><bdi>{company.notes}</bdi></p>
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground pt-2 border-t border-border">
                  {t("smpContracts:sheet.createdOn", { date: formatGregDate(company.createdAt, i18n.language) })}
                </div>
              </div>
            )
          )}
          {activeTab === "docs" && <DocumentVault company={company} events={events} />}
          {activeTab === "workers" && <WorkersList companyId={company.id} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({ icon, label, value, ltr }: { icon: React.ReactNode; label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-sm bg-muted/10 border border-border">
      <span className="text-primary mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</p>
        <p className="text-sm text-white truncate" {...(ltr ? { dir: "ltr" } : {})}><bdi>{value}</bdi></p>
      </div>
    </div>
  );
}

export default function SMPCompaniesPage() {
  const { t, i18n } = useTranslation(["smpContracts"]);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<SMPCompany | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: companies = [], isLoading } = useQuery<SMPCompany[]>({
    queryKey: ["/api/smp-companies"],
    queryFn: () => apiRequest("GET", "/api/smp-companies").then((r) => r.json()),
  });

  const { data: events = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/events"],
    queryFn: () => apiRequest("GET", "/api/events").then(r => r.json()),
  });

  const { data: workforceStats } = useQuery<{ total: number; active: number; terminated: number; smpWorkers: number }>({
    queryKey: ["/api/workforce/stats"],
    queryFn: () => apiRequest("GET", "/api/workforce/stats").then(r => r.json()),
  });

  const filtered = companies.filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.crNumber ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (c.contactPerson ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = companies.filter(c => c.isActive).length;
  const regionCount = new Set(companies.map(c => c.region).filter(Boolean)).size;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">{t("smpContracts:page.title")}</h1>
            <p className="text-muted-foreground mt-1">{t("smpContracts:page.subtitle")}</p>
          </div>
          <Button className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs" data-testid="button-create-smp" onClick={() => setCreateOpen(true)}>
            <Plus className="me-2 h-4 w-4" />{t("smpContracts:page.addBtn")}
          </Button>
        </div>

        <CreateCompanyDialog open={createOpen} onOpenChange={setCreateOpen} />
        <CompanySheet
          company={selectedCompany ? (companies.find(c => c.id === selectedCompany.id) ?? selectedCompany) : null}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          events={events}
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border shadow-sm border-s-4 border-s-amber-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("smpContracts:stats.total")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-companies">{formatNumber(companies.length, i18n.language)}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm border-s-4 border-s-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("smpContracts:stats.active")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-active-companies">{formatNumber(activeCount, i18n.language)}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm border-s-4 border-s-blue-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("smpContracts:stats.smpWorkers")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-smp-workers">
                {formatNumber(workforceStats?.smpWorkers ?? 0, i18n.language)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm border-s-4 border-s-zinc-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("smpContracts:stats.regions")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-regions">
                {formatNumber(regionCount, i18n.language)}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder={t("smpContracts:search.placeholder")}
              className="ps-10 h-12 bg-muted/30 border-border focus-visible:ring-primary/20 text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-smp"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-sm">
            <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium">
              {search ? t("smpContracts:search.noMatch") : t("smpContracts:search.noCompanies")}
            </p>
            {!search && (
              <p className="text-muted-foreground/60 text-sm mt-1">{t("smpContracts:search.noCompaniesHelp")}</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                onClick={() => { setSelectedCompany(company); setSheetOpen(true); }}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function CompanyCard({ company, onClick }: { company: SMPCompany; onClick: () => void }) {
  const { t } = useTranslation(["smpContracts"]);
  return (
    <div
      className="bg-card border border-border rounded-sm p-4 hover:border-primary/40 cursor-pointer transition-all group"
      onClick={onClick}
      data-testid={`card-smp-${company.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-sm bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate group-hover:text-primary transition-colors"><bdi>{company.name}</bdi></p>
            {company.crNumber && <p className="text-[11px] text-muted-foreground font-mono" dir="ltr">{t("smpContracts:card.crPrefix")} {company.crNumber}</p>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge className={`text-[10px] border-0 ${company.isActive ? "bg-emerald-900/40 text-emerald-400" : "bg-zinc-800 text-zinc-400"}`}>
            {company.isActive ? t("smpContracts:card.active") : t("smpContracts:card.inactive")}
          </Badge>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 rtl:rotate-180" />
        </div>
      </div>

      <div className="mt-3 space-y-1">
        {company.contactPerson && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate"><bdi>{company.contactPerson}</bdi></span>
          </div>
        )}
        {company.contactPhone && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span dir="ltr">{company.contactPhone}</span>
          </div>
        )}
        {company.region && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span><bdi>{company.region}</bdi></span>
          </div>
        )}
        {company.bankName && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Banknote className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate"><bdi>{company.bankName}</bdi></span>
          </div>
        )}
      </div>
    </div>
  );
}
