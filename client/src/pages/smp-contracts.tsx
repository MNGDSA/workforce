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
  Upload,
  ChevronRight,
  Trash2,
  CheckCircle2,
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
  AlertCircle,
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
import { useToast } from "@/hooks/use-toast";
import { KSA_REGIONS } from "@shared/schema";
import type { SMPCompany } from "@shared/schema";
import { createPortal } from "react-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

type CompanyDoc = {
  name: string;
  url: string;
  uploadedAt: string;
  size?: number;
};

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

// ─── Create Company Dialog ────────────────────────────────────────────────────

function CreateCompanyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    commercialRegistration: "",
    contactPerson: "",
    contactPhone: "",
    contactEmail: "",
    region: "",
    notes: "",
  });

  function reset() {
    setForm({ name: "", commercialRegistration: "", contactPerson: "", contactPhone: "", contactEmail: "", region: "", notes: "" });
  }

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest("POST", "/api/smp-companies", data).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/smp-companies"] });
      toast({ title: "SMP company created" });
      reset();
      onOpenChange(false);
    },
    onError: () => toast({ title: "Error", description: "Failed to create company.", variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast({ title: "Company name is required", variant: "destructive" });
    mutation.mutate(form);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-white font-display text-xl">Create SMP Company</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Sub-Manpower Provider company — register a company and link its workers via deployment.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-white text-sm">Company Name <span className="text-red-400">*</span></Label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Al-Rashidi Manpower Services"
              className="bg-muted/30 border-border"
              data-testid="input-smp-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-white text-sm">Commercial Registration</Label>
              <Input
                value={form.commercialRegistration}
                onChange={e => setForm(f => ({ ...f, commercialRegistration: e.target.value }))}
                placeholder="e.g. 4030123456"
                className="bg-muted/30 border-border font-mono text-xs"
                data-testid="input-smp-cr"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white text-sm">Region</Label>
              <select
                value={form.region}
                onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                className="w-full h-10 bg-muted/30 border border-border rounded-sm px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
                data-testid="select-smp-region"
              >
                <option value="" className="bg-card text-muted-foreground">Select region…</option>
                {KSA_REGIONS.map(r => <option key={r} value={r} className="bg-card text-white">{r}</option>)}
              </select>
            </div>
          </div>
          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Contact Info</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-white text-sm">Contact Person</Label>
                <Input
                  value={form.contactPerson}
                  onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))}
                  placeholder="e.g. Ahmed Al-Rashidi"
                  className="bg-muted/30 border-border"
                  data-testid="input-smp-contact-person"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-white text-sm">Contact Phone</Label>
                <Input
                  value={form.contactPhone}
                  onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))}
                  placeholder="e.g. 0512345678"
                  className="bg-muted/30 border-border"
                  data-testid="input-smp-contact-phone"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white text-sm">Contact Email</Label>
              <Input
                type="email"
                value={form.contactEmail}
                onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))}
                placeholder="e.g. contact@company.com"
                className="bg-muted/30 border-border"
                data-testid="input-smp-contact-email"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-white text-sm">Notes</Label>
            <Textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Any additional notes or remarks…"
              className="bg-muted/30 border-border resize-none"
              rows={2}
              data-testid="textarea-smp-notes"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => { reset(); onOpenChange(false); }} className="text-muted-foreground">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs"
              data-testid="button-submit-smp"
            >
              {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create Company
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Document Vault ────────────────────────────────────────────────────────────

function DocumentVault({ company }: { company: SMPCompany }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<CompanyDoc | null>(null);

  const docs: CompanyDoc[] = Array.isArray(company.documents) ? (company.documents as CompanyDoc[]) : [];

  const patchDocs = useMutation({
    mutationFn: (documents: CompanyDoc[]) =>
      apiRequest("PATCH", `/api/smp-companies/${company.id}`, { documents }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/smp-companies"] }),
    onError: () => toast({ title: "Error", description: "Failed to update documents.", variant: "destructive" }),
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const newDocs: CompanyDoc[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
        const { url } = await res.json();
        newDocs.push({
          name: file.name,
          url,
          uploadedAt: new Date().toISOString(),
          size: file.size,
        });
      }
      patchDocs.mutate([...docs, ...newDocs]);
      toast({ title: `${newDocs.length} document${newDocs.length !== 1 ? "s" : ""} uploaded` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeDoc(idx: number) {
    patchDocs.mutate(docs.filter((_, i) => i !== idx));
  }

  function formatSize(bytes?: number) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-white">Document Vault</span>
          {docs.length > 0 && (
            <Badge className="text-[10px] bg-primary/15 text-primary border-0">{docs.length}</Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-border text-xs gap-1.5 h-7"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          data-testid="button-upload-docs"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus className="h-3.5 w-3.5" />}
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {docs.length === 0 ? (
        <div
          className="border border-dashed border-border rounded-sm p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          data-testid="dropzone-docs"
        >
          <Upload className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No documents yet. Click to upload contracts, licenses, or other files.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {docs.map((doc, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 px-3 py-2 rounded-sm bg-muted/10 border border-border hover:bg-muted/20 transition-colors"
              data-testid={`row-doc-${idx}`}
            >
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{doc.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(doc.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  {doc.size ? ` · ${formatSize(doc.size)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-white"
                  onClick={() => setPreviewDoc(doc)}
                  data-testid={`button-preview-doc-${idx}`}
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <a href={doc.url} download={doc.name} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-white" data-testid={`button-download-doc-${idx}`}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-red-400"
                  onClick={() => removeDoc(idx)}
                  data-testid={`button-remove-doc-${idx}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview portal */}
      {previewDoc && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewDoc(null)}>
          <div className="bg-card border border-border rounded-lg max-w-3xl w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-medium text-white">{previewDoc.name}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setPreviewDoc(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4">
              {isImage(previewDoc.url) ? (
                <img src={previewDoc.url} alt={previewDoc.name} className="max-w-full rounded" />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-sm">Preview not available for this file type.</p>
                  <a href={previewDoc.url} download={previewDoc.name} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="border-border mt-3 gap-2">
                      <Download className="h-3.5 w-3.5" />
                      Download File
                    </Button>
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

// ─── Workers List ─────────────────────────────────────────────────────────────

function WorkersList({ companyId }: { companyId: string }) {
  const { data: workers = [], isLoading } = useQuery<WorkerRow[]>({
    queryKey: ["/api/smp-companies", companyId, "workers"],
    queryFn: () => apiRequest("GET", `/api/smp-companies/${companyId}/workers`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const active = workers.filter(w => w.isActive);
  const inactive = workers.filter(w => !w.isActive);

  function exportToExcel() {
    const rows = workers.map(w => ({
      "Employee No.": w.employeeNumber,
      "Full Name": w.fullNameEn ?? "",
      "National ID": w.nationalId ?? "",
      "Phone": w.phone ?? "",
      "Start Date": w.startDate,
      "End Date": w.endDate ?? "",
      "Status": w.isActive ? "Active" : "Terminated",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Workers");
    XLSX.writeFile(wb, `smp-workers-${companyId}.xlsx`);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-white">Deployed Workers</span>
          <Badge className="text-[10px] bg-primary/15 text-primary border-0">{workers.length}</Badge>
        </div>
        {workers.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="border-border text-xs gap-1.5 h-7"
            onClick={exportToExcel}
            data-testid="button-export-workers"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : workers.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border rounded-sm">
          <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            No workers deployed yet. When converting SMP candidates to employees, select this company to link them here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {active.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Active ({active.length})</p>
              {active.map(w => (
                <WorkerCard key={w.id} worker={w} />
              ))}
            </>
          )}
          {inactive.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mt-3">Terminated ({inactive.length})</p>
              {inactive.map(w => (
                <WorkerCard key={w.id} worker={w} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WorkerCard({ worker }: { worker: WorkerRow }) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-sm border transition-colors ${
        worker.isActive
          ? "bg-muted/10 border-border hover:bg-muted/20"
          : "bg-muted/5 border-border/50 opacity-60"
      }`}
      data-testid={`row-worker-${worker.id}`}
    >
      <Avatar className="h-8 w-8 border border-border shrink-0">
        <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
          {(worker.fullNameEn ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white truncate">{worker.fullNameEn ?? "Unknown"}</p>
          {worker.isActive
            ? <Badge className="text-[9px] bg-emerald-900/40 text-emerald-400 border-0 shrink-0">Active</Badge>
            : <Badge className="text-[9px] bg-zinc-800 text-zinc-400 border-0 shrink-0">Terminated</Badge>
          }
        </div>
        <p className="text-[11px] text-muted-foreground font-mono">
          #{worker.employeeNumber}
          {worker.nationalId ? ` · ${worker.nationalId}` : ""}
        </p>
      </div>
      <div className="text-[11px] text-muted-foreground text-right shrink-0">
        <p>{worker.startDate}</p>
        {worker.endDate && <p className="text-red-400/70">{worker.endDate}</p>}
      </div>
    </div>
  );
}

// ─── Company Sheet ────────────────────────────────────────────────────────────

function CompanySheet({
  company,
  open,
  onOpenChange,
}: {
  company: SMPCompany | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
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
      toast({ title: "Company updated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update company.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/smp-companies/${company!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/smp-companies"] });
      onOpenChange(false);
      toast({ title: "Company deleted" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete company.", variant: "destructive" }),
  });

  if (!company) return null;

  const docs: CompanyDoc[] = Array.isArray(company.documents) ? (company.documents as CompanyDoc[]) : [];

  function startEdit() {
    setEditForm({
      name: company!.name,
      commercialRegistration: company!.commercialRegistration ?? "",
      contactPerson: company!.contactPerson ?? "",
      contactPhone: company!.contactPhone ?? "",
      contactEmail: company!.contactEmail ?? "",
      region: company!.region ?? "",
      notes: company!.notes ?? "",
    });
    setEditMode(true);
  }

  const tabClass = (t: string) =>
    `px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
      activeTab === t
        ? "text-primary border-b-2 border-primary"
        : "text-muted-foreground hover:text-white border-b-2 border-transparent"
    }`;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) { setEditMode(false); setActiveTab("info"); } onOpenChange(v); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl bg-card border-border flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-sm bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <SheetTitle className="font-display text-xl font-bold text-white leading-tight">
                  {company.name}
                </SheetTitle>
                <div className="text-muted-foreground mt-1 flex items-center gap-2 flex-wrap text-xs">
                  {company.commercialRegistration && (
                    <span className="font-mono bg-muted/20 px-1.5 py-0.5 rounded text-[11px]">CR {company.commercialRegistration}</span>
                  )}
                  {company.region && (
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {company.region}</span>
                  )}
                  <Badge className={`text-[10px] border-0 ${company.isActive ? "bg-emerald-900/40 text-emerald-400" : "bg-zinc-800 text-zinc-400"}`}>
                    {company.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-border text-xs shrink-0"
              onClick={editMode ? () => setEditMode(false) : startEdit}
              data-testid="button-edit-company"
            >
              {editMode ? "Cancel" : "Edit"}
            </Button>
          </div>
          {/* Tabs */}
          <div className="flex border-b border-border mt-2 -mb-4">
            <button className={tabClass("info")} onClick={() => setActiveTab("info")} data-testid="tab-info">Info</button>
            <button className={tabClass("docs")} onClick={() => setActiveTab("docs")} data-testid="tab-docs">
              Documents {docs.length > 0 && `(${docs.length})`}
            </button>
            <button className={tabClass("workers")} onClick={() => setActiveTab("workers")} data-testid="tab-workers">Workers</button>
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {activeTab === "info" && (
            editMode ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-white text-sm">Company Name *</Label>
                    <Input
                      value={editForm.name ?? ""}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="bg-muted/30 border-border"
                      data-testid="input-edit-name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white text-sm">Commercial Registration</Label>
                    <Input
                      value={editForm.commercialRegistration ?? ""}
                      onChange={e => setEditForm(f => ({ ...f, commercialRegistration: e.target.value }))}
                      className="bg-muted/30 border-border font-mono text-xs"
                      data-testid="input-edit-cr"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white text-sm">Region</Label>
                    <select
                      value={editForm.region ?? ""}
                      onChange={e => setEditForm(f => ({ ...f, region: e.target.value }))}
                      className="w-full h-10 bg-muted/30 border border-border rounded-sm px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
                      data-testid="select-edit-region"
                    >
                      <option value="" className="bg-card text-muted-foreground">Select region…</option>
                      {KSA_REGIONS.map(r => <option key={r} value={r} className="bg-card text-white">{r}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white text-sm">Contact Person</Label>
                    <Input
                      value={editForm.contactPerson ?? ""}
                      onChange={e => setEditForm(f => ({ ...f, contactPerson: e.target.value }))}
                      className="bg-muted/30 border-border"
                      data-testid="input-edit-contact-person"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white text-sm">Contact Phone</Label>
                    <Input
                      value={editForm.contactPhone ?? ""}
                      onChange={e => setEditForm(f => ({ ...f, contactPhone: e.target.value }))}
                      className="bg-muted/30 border-border"
                      data-testid="input-edit-contact-phone"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-white text-sm">Contact Email</Label>
                    <Input
                      type="email"
                      value={editForm.contactEmail ?? ""}
                      onChange={e => setEditForm(f => ({ ...f, contactEmail: e.target.value }))}
                      className="bg-muted/30 border-border"
                      data-testid="input-edit-contact-email"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-white text-sm">Notes</Label>
                    <Textarea
                      value={editForm.notes ?? ""}
                      onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                      className="bg-muted/30 border-border resize-none"
                      rows={3}
                      data-testid="textarea-edit-notes"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-between pt-2">
                  <Button
                    variant="outline"
                    className="border-red-900/60 text-red-400 hover:bg-red-950/40 text-xs gap-1.5"
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    data-testid="button-delete-company"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Company
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" className="border-border text-xs" onClick={() => setEditMode(false)}>
                      Cancel
                    </Button>
                    <Button
                      className="bg-primary text-primary-foreground text-xs font-bold"
                      onClick={() => updateMutation.mutate(editForm)}
                      disabled={updateMutation.isPending || !editForm.name?.trim()}
                      data-testid="button-save-company"
                    >
                      {updateMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                      Save Changes
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {company.contactPerson && (
                    <InfoRow icon={<Users className="h-4 w-4" />} label="Contact Person" value={company.contactPerson} />
                  )}
                  {company.contactPhone && (
                    <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={company.contactPhone} />
                  )}
                  {company.contactEmail && (
                    <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={company.contactEmail} />
                  )}
                  {company.region && (
                    <InfoRow icon={<MapPin className="h-4 w-4" />} label="Region" value={company.region} />
                  )}
                </div>
                {company.notes && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Notes</p>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{company.notes}</p>
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground pt-2 border-t border-border">
                  Created {new Date(company.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </div>
              </div>
            )
          )}

          {activeTab === "docs" && <DocumentVault company={company} />}
          {activeTab === "workers" && <WorkersList companyId={company.id} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-sm bg-muted/10 border border-border">
      <span className="text-primary mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</p>
        <p className="text-sm text-white truncate">{value}</p>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SMPCompaniesPage() {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<SMPCompany | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: companies = [], isLoading } = useQuery<SMPCompany[]>({
    queryKey: ["/api/smp-companies"],
    queryFn: () => apiRequest("GET", "/api/smp-companies").then((r) => r.json()),
  });

  const filtered = companies.filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.commercialRegistration ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (c.contactPerson ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = companies.filter(c => c.isActive).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">SMP Companies</h1>
            <p className="text-muted-foreground mt-1">Sub-Manpower Provider companies — manage partners and their deployed workers.</p>
          </div>
          <Button
            className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs"
            data-testid="button-create-smp"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add SMP Company
          </Button>
        </div>

        <CreateCompanyDialog open={createOpen} onOpenChange={setCreateOpen} />
        <CompanySheet
          company={selectedCompany ? (companies.find(c => c.id === selectedCompany.id) ?? selectedCompany) : null}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
        />

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-amber-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Companies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-companies">{companies.length}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-active-companies">{activeCount}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-blue-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Regions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-regions">
                {new Set(companies.map(c => c.region).filter(Boolean)).size}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="flex items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by company name, CR number, or contact person…"
              className="pl-10 h-12 bg-muted/30 border-border focus-visible:ring-primary/20 text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-smp"
            />
          </div>
        </div>

        {/* Company Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-sm">
            <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium">
              {search ? "No companies match your search" : "No SMP companies yet"}
            </p>
            {!search && (
              <p className="text-muted-foreground/60 text-sm mt-1">Click "Add SMP Company" to register your first partner</p>
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
  const docs: CompanyDoc[] = Array.isArray(company.documents) ? (company.documents as CompanyDoc[]) : [];

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
            <p className="text-sm font-semibold text-white truncate group-hover:text-primary transition-colors">{company.name}</p>
            {company.commercialRegistration && (
              <p className="text-[11px] text-muted-foreground font-mono">CR {company.commercialRegistration}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge className={`text-[10px] border-0 ${company.isActive ? "bg-emerald-900/40 text-emerald-400" : "bg-zinc-800 text-zinc-400"}`}>
            {company.isActive ? "Active" : "Inactive"}
          </Badge>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
        </div>
      </div>

      <div className="mt-3 space-y-1">
        {company.contactPerson && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{company.contactPerson}</span>
          </div>
        )}
        {company.contactPhone && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span>{company.contactPhone}</span>
          </div>
        )}
        {company.region && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>{company.region}</span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <FileText className="h-3 w-3" />
          {docs.length} doc{docs.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
