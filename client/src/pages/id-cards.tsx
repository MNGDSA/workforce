import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  CreditCard,
  Plus,
  Palette,
  Eye,
  Trash2,
  CheckCircle2,
  Printer,
  History,
  Settings,
  Loader2,
  Search,
  PlugZap,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AVAILABLE_FIELDS,
  CARD_LAYOUTS,
  SAMPLE_EMPLOYEE,
  renderIdCardHTML,
  type IdCardTemplateConfig,
  type CardLayout,
} from "@/lib/id-card-renderer";

type IdCardTemplate = {
  id: string;
  name: string;
  eventId: string | null;
  layoutConfig: Record<string, unknown>;
  logoUrl: string | null;
  fields: string[];
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type PrinterPluginType = {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
};

type PrintLog = {
  id: string;
  employeeId: string;
  templateId: string | null;
  printedBy: string | null;
  printerPluginId: string | null;
  status: string;
  printedAt: string;
  employeeNumber: string | null;
  employeeName: string | null;
  templateName: string | null;
  printedByName: string | null;
};

type EventType = {
  id: string;
  name: string;
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-SA", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function TemplateDesigner() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    eventId: "",
    logoUrl: "",
    fields: ["fullName", "photo", "employeeNumber"] as string[],
    backgroundColor: "#1a1a2e",
    textColor: "#ffffff",
    accentColor: "#16a34a",
    layout: "horizontal" as CardLayout,
    nameFontSize: 14,
    showBorder: false,
  });

  const { data: templates = [] } = useQuery<IdCardTemplate[]>({
    queryKey: ["/api/id-card-templates"],
    queryFn: () => apiRequest("GET", "/api/id-card-templates").then((r) => r.json()),
  });

  const { data: events = [] } = useQuery<EventType[]>({
    queryKey: ["/api/events"],
    queryFn: () => apiRequest("GET", "/api/events").then((r) => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      editId
        ? apiRequest("PATCH", `/api/id-card-templates/${editId}`, data).then((r) => r.json())
        : apiRequest("POST", "/api/id-card-templates", data).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: editId ? "Template Updated" : "Template Created" });
      qc.invalidateQueries({ queryKey: ["/api/id-card-templates"] });
      resetForm();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/id-card-templates/${id}/activate`).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Template Activated" });
      qc.invalidateQueries({ queryKey: ["/api/id-card-templates"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/id-card-templates/${id}`),
    onSuccess: () => {
      toast({ title: "Template Deleted" });
      qc.invalidateQueries({ queryKey: ["/api/id-card-templates"] });
      setDeleteId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setForm({
      name: "",
      eventId: "",
      logoUrl: "",
      fields: ["fullName", "photo", "employeeNumber"],
      backgroundColor: "#1a1a2e",
      textColor: "#ffffff",
      accentColor: "#16a34a",
      layout: "horizontal",
      nameFontSize: 14,
      showBorder: false,
    });
    setEditId(null);
    setFormOpen(false);
  }

  function openEdit(t: IdCardTemplate) {
    const lc = (t.layoutConfig ?? {}) as Record<string, unknown>;
    setForm({
      name: t.name,
      eventId: t.eventId ?? "",
      logoUrl: t.logoUrl ?? "",
      fields: t.fields ?? ["fullName", "photo", "employeeNumber"],
      backgroundColor: t.backgroundColor,
      textColor: t.textColor,
      accentColor: t.accentColor,
      layout: (lc.layout as CardLayout) ?? "horizontal",
      nameFontSize: (lc.nameFontSize as number) ?? 14,
      showBorder: (lc.showBorder as boolean) ?? false,
    });
    setEditId(t.id);
    setFormOpen(true);
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "Template name is required", variant: "destructive" });
      return;
    }
    saveMutation.mutate({
      name: form.name.trim(),
      eventId: form.eventId || null,
      logoUrl: form.logoUrl || null,
      fields: form.fields,
      backgroundColor: form.backgroundColor,
      textColor: form.textColor,
      accentColor: form.accentColor,
      layoutConfig: {
        layout: form.layout,
        nameFontSize: form.nameFontSize,
        showBorder: form.showBorder,
      },
    });
  }

  function toggleField(key: string) {
    setForm((f) => ({
      ...f,
      fields: f.fields.includes(key) ? f.fields.filter((k) => k !== key) : [...f.fields, key],
    }));
  }

  const previewConfig: IdCardTemplateConfig = {
    name: form.name || "Untitled",
    logoUrl: form.logoUrl || null,
    fields: form.fields,
    backgroundColor: form.backgroundColor,
    textColor: form.textColor,
    accentColor: form.accentColor,
    layout: form.layout,
    nameFontSize: form.nameFontSize,
    showBorder: form.showBorder,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            Card Templates
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Design ID card templates for your employees. Only one template can be active per event.
          </p>
        </div>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground gap-1.5"
          onClick={() => { resetForm(); setFormOpen(true); }}
          data-testid="button-create-template"
        >
          <Plus className="h-3.5 w-3.5" />
          New Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-border rounded-md bg-muted/10 space-y-3">
          <CreditCard className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">No templates yet. Create your first ID card template.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => {
            const lc = (t.layoutConfig ?? {}) as Record<string, unknown>;
            const config: IdCardTemplateConfig = {
              name: t.name,
              logoUrl: t.logoUrl,
              fields: t.fields,
              backgroundColor: t.backgroundColor,
              textColor: t.textColor,
              accentColor: t.accentColor,
              layout: (lc.layout as CardLayout) ?? "horizontal",
              nameFontSize: (lc.nameFontSize as number) ?? 14,
              showBorder: (lc.showBorder as boolean) ?? false,
            };
            return (
              <Card
                key={t.id}
                className={`bg-card border-border ${t.isActive ? "ring-1 ring-primary" : ""}`}
                data-testid={`card-template-${t.id}`}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{t.name}</span>
                      {t.isActive && (
                        <Badge className="bg-primary/15 text-primary border-primary/20 text-xs">Active</Badge>
                      )}
                    </div>
                  </div>
                  <div
                    className="flex justify-center"
                    dangerouslySetInnerHTML={{ __html: renderIdCardHTML(config, SAMPLE_EMPLOYEE, 0.65) }}
                  />
                  <div className="flex items-center gap-1.5 pt-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => openEdit(t)}>
                      <Eye className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    {!t.isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-primary flex-1"
                        onClick={() => activateMutation.mutate(t.id)}
                        disabled={activateMutation.isPending}
                        data-testid={`button-activate-template-${t.id}`}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Activate
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-red-400"
                      onClick={() => setDeleteId(t.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(v) => { if (!v) resetForm(); }}>
        <DialogContent className="max-w-4xl bg-zinc-950 border-zinc-800 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              {editId ? "Edit Template" : "New ID Card Template"}
            </DialogTitle>
            <DialogDescription className="sr-only">Design your ID card template</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-white">Template Name *</Label>
                <Input
                  data-testid="input-template-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Default Employee Card"
                  className="bg-zinc-900 border-zinc-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-white">Event (optional)</Label>
                <Select value={form.eventId} onValueChange={(v) => setForm((f) => ({ ...f, eventId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white" data-testid="select-template-event">
                    <SelectValue placeholder="All events (global)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">All events (global)</SelectItem>
                    {events.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-white">Company Logo URL</Label>
                <Input
                  data-testid="input-template-logo"
                  value={form.logoUrl}
                  onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                  placeholder="https://example.com/logo.png"
                  className="bg-zinc-900 border-zinc-700 text-white"
                />
              </div>

              <Separator className="bg-zinc-800" />

              <div className="space-y-2">
                <Label className="text-white text-xs uppercase tracking-wider">Fields to Display</Label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_FIELDS.map((f) => (
                    <label
                      key={f.key}
                      className="flex items-center gap-2 p-2 rounded-md border border-zinc-800 hover:border-zinc-600 cursor-pointer"
                    >
                      <Checkbox
                        checked={form.fields.includes(f.key)}
                        onCheckedChange={() => toggleField(f.key)}
                        data-testid={`checkbox-field-${f.key}`}
                      />
                      <span className="text-sm text-zinc-300">{f.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Separator className="bg-zinc-800" />

              <div className="space-y-2">
                <Label className="text-white text-xs uppercase tracking-wider">Card Layout</Label>
                <div className="grid grid-cols-3 gap-2">
                  {CARD_LAYOUTS.map((l) => (
                    <button
                      key={l.key}
                      type="button"
                      className={`p-2 rounded-md border text-left transition-colors ${
                        form.layout === l.key
                          ? "border-primary bg-primary/10 text-white"
                          : "border-zinc-800 hover:border-zinc-600 text-zinc-400"
                      }`}
                      onClick={() => setForm((f) => ({ ...f, layout: l.key }))}
                      data-testid={`button-layout-${l.key}`}
                    >
                      <div className="text-xs font-medium">{l.label}</div>
                      <div className="text-[10px] opacity-70 mt-0.5">{l.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white text-xs">Name Font Size: {form.nameFontSize}px</Label>
                  <input
                    type="range"
                    min={10}
                    max={22}
                    value={form.nameFontSize}
                    onChange={(e) => setForm((f) => ({ ...f, nameFontSize: Number(e.target.value) }))}
                    className="w-full accent-primary"
                    data-testid="slider-name-font-size"
                  />
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <Checkbox
                    checked={form.showBorder}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, showBorder: !!v }))}
                    data-testid="checkbox-show-border"
                  />
                  <Label className="text-zinc-300 text-sm cursor-pointer">Show card border</Label>
                </div>
              </div>

              <Separator className="bg-zinc-800" />

              <div className="space-y-2">
                <Label className="text-white text-xs uppercase tracking-wider">Colors</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-zinc-400 text-xs">Background</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.backgroundColor}
                        onChange={(e) => setForm((f) => ({ ...f, backgroundColor: e.target.value }))}
                        className="h-8 w-8 rounded cursor-pointer border-0"
                        data-testid="color-background"
                      />
                      <Input
                        value={form.backgroundColor}
                        onChange={(e) => setForm((f) => ({ ...f, backgroundColor: e.target.value }))}
                        className="bg-zinc-900 border-zinc-700 text-white text-xs font-mono h-8"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-400 text-xs">Text</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.textColor}
                        onChange={(e) => setForm((f) => ({ ...f, textColor: e.target.value }))}
                        className="h-8 w-8 rounded cursor-pointer border-0"
                        data-testid="color-text"
                      />
                      <Input
                        value={form.textColor}
                        onChange={(e) => setForm((f) => ({ ...f, textColor: e.target.value }))}
                        className="bg-zinc-900 border-zinc-700 text-white text-xs font-mono h-8"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-400 text-xs">Accent</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.accentColor}
                        onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))}
                        className="h-8 w-8 rounded cursor-pointer border-0"
                        data-testid="color-accent"
                      />
                      <Input
                        value={form.accentColor}
                        onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))}
                        className="bg-zinc-900 border-zinc-700 text-white text-xs font-mono h-8"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" className="border-zinc-700" onClick={resetForm}>
                  Cancel
                </Button>
                <Button
                  className="bg-primary text-primary-foreground"
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-template"
                >
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {editId ? "Update Template" : "Create Template"}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" /> Live Preview (CR-80 Card)
              </Label>
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6 flex items-center justify-center min-h-[200px]">
                <div dangerouslySetInnerHTML={{ __html: renderIdCardHTML(previewConfig, SAMPLE_EMPLOYEE, 1.3) }} />
              </div>
              <p className="text-xs text-zinc-500 text-center">
                Standard CR-80 size: 85.6mm × 54mm (3.375" × 2.125")
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent className="bg-zinc-950 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Template?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This will permanently delete this ID card template. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 text-zinc-300">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PrinterPluginManager() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "zebra_browser_print", config: "{}" });

  const { data: plugins = [] } = useQuery<PrinterPluginType[]>({
    queryKey: ["/api/printer-plugins"],
    queryFn: () => apiRequest("GET", "/api/printer-plugins").then((r) => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/printer-plugins", data).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Printer Plugin Added" });
      qc.invalidateQueries({ queryKey: ["/api/printer-plugins"] });
      setFormOpen(false);
      setForm({ name: "", type: "zebra_browser_print", config: "{}" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/printer-plugins/${id}/activate`).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Plugin Activated" });
      qc.invalidateQueries({ queryKey: ["/api/printer-plugins"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/printer-plugins/${id}`),
    onSuccess: () => {
      toast({ title: "Plugin Removed" });
      qc.invalidateQueries({ queryKey: ["/api/printer-plugins"] });
      setDeleteId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function handleCreate() {
    if (!form.name.trim()) {
      toast({ title: "Plugin name is required", variant: "destructive" });
      return;
    }
    let parsedConfig = {};
    try {
      parsedConfig = JSON.parse(form.config);
    } catch {
      toast({ title: "Invalid JSON config", variant: "destructive" });
      return;
    }
    createMutation.mutate({ name: form.name.trim(), type: form.type, config: parsedConfig });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <PlugZap className="h-4 w-4 text-primary" />
            Printer Plugins
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure printer plugins for direct card printing. Zebra Browser Print SDK is supported.
          </p>
        </div>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground gap-1.5"
          onClick={() => setFormOpen(true)}
          data-testid="button-add-printer-plugin"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Plugin
        </Button>
      </div>

      <div className="bg-blue-950/20 border border-blue-800/30 rounded-lg p-4 text-sm text-blue-300 space-y-1">
        <p className="font-medium">How Printer Plugins Work</p>
        <p className="text-xs text-blue-400">
          When a printer plugin is active, ID cards are sent directly to the printer via its SDK.
          If no plugin is active, cards are rendered as a printable PDF using the browser's print dialog (fallback mode).
        </p>
      </div>

      {plugins.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-border rounded-md bg-muted/10 space-y-3">
          <Printer className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">No printer plugins installed. Using browser print fallback.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {plugins.map((p) => (
            <Card key={p.id} className={`bg-card border-border ${p.isActive ? "ring-1 ring-primary" : ""}`}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-md bg-zinc-800 flex items-center justify-center">
                    <Printer className="h-5 w-5 text-zinc-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{p.name}</span>
                      <Badge variant="outline" className="text-xs text-zinc-400">{p.type}</Badge>
                      {p.isActive && (
                        <Badge className="bg-primary/15 text-primary border-primary/20 text-xs">Active</Badge>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Added {formatDate(p.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!p.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-zinc-700 text-primary"
                      onClick={() => activateMutation.mutate(p.id)}
                      disabled={activateMutation.isPending}
                      data-testid={`button-activate-printer-${p.id}`}
                    >
                      Activate
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-red-400"
                    onClick={() => setDeleteId(p.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" />
              Add Printer Plugin
            </DialogTitle>
            <DialogDescription className="sr-only">Add a new printer plugin</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-white">Plugin Name</Label>
              <Input
                data-testid="input-printer-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Zebra ZC300"
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white" data-testid="select-printer-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zebra_browser_print">Zebra Browser Print SDK</SelectItem>
                  <SelectItem value="browser_fallback">Browser Print (Fallback)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" className="border-zinc-700" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-primary text-primary-foreground"
                onClick={handleCreate}
                disabled={createMutation.isPending}
                data-testid="button-create-printer"
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Add Plugin
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent className="bg-zinc-950 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Plugin?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This will remove this printer plugin. You can always add it back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 text-zinc-300">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PrintAuditLog() {
  const [search, setSearch] = useState("");

  const { data: logs = [], isLoading } = useQuery<PrintLog[]>({
    queryKey: ["/api/id-card-print-logs"],
    queryFn: () => apiRequest("GET", "/api/id-card-print-logs").then((r) => r.json()),
  });

  const filtered = search.trim()
    ? logs.filter(
        (l) =>
          (l.employeeName ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (l.employeeNumber ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (l.printedByName ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Print History
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track every ID card print job — who printed, which employee, and when.
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-search-print-logs"
            placeholder="Search by employee or user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted/30 border-border h-8 text-sm"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-border rounded-md bg-muted/10 space-y-3">
          <History className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">
            {search ? "No matching print records." : "No print records yet."}
          </p>
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Employee</TableHead>
                  <TableHead className="text-muted-foreground">Emp #</TableHead>
                  <TableHead className="text-muted-foreground">Template</TableHead>
                  <TableHead className="text-muted-foreground">Printed By</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => (
                  <TableRow key={log.id} className="border-border" data-testid={`print-log-${log.id}`}>
                    <TableCell className="text-white text-sm">{log.employeeName ?? "—"}</TableCell>
                    <TableCell className="text-zinc-400 text-xs font-mono">{log.employeeNumber ?? "—"}</TableCell>
                    <TableCell className="text-zinc-400 text-sm">{log.templateName ?? "—"}</TableCell>
                    <TableCell className="text-zinc-400 text-sm">{log.printedByName ?? "System"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          log.status === "success"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs"
                            : log.status === "failed"
                            ? "bg-red-500/10 text-red-400 border-red-500/30 text-xs"
                            : "bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs"
                        }
                      >
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-400 text-xs">{formatDate(log.printedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function IdCardsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-white flex items-center gap-3" data-testid="text-page-title">
            <CreditCard className="h-7 w-7 text-primary" />
            ID Cards
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Design, print, and manage employee identification cards
          </p>
        </div>

        <Tabs defaultValue="templates" className="space-y-4">
          <TabsList className="bg-muted/30 border border-border">
            <TabsTrigger value="templates" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5" data-testid="tab-templates">
              <Palette className="h-3.5 w-3.5" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="printers" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5" data-testid="tab-printers">
              <Printer className="h-3.5 w-3.5" />
              Printers
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5" data-testid="tab-history">
              <History className="h-3.5 w-3.5" />
              Print History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="templates">
            <TemplateDesigner />
          </TabsContent>
          <TabsContent value="printers">
            <PrinterPluginManager />
          </TabsContent>
          <TabsContent value="history">
            <PrintAuditLog />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
