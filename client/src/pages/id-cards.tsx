import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
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
  Loader2,
  Search,
  PlugZap,
  Upload,
  Move,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/format";
import {
  AVAILABLE_FIELDS,
  CARD_LAYOUTS,
  PLUGIN_TYPES,
  SAMPLE_EMPLOYEE,
  CANVAS_W,
  CANVAS_H,
  renderIdCardHTML,
  defaultFieldPlacements,
  type IdCardTemplateConfig,
  type CardLayout,
  type FieldPlacement,
} from "@/lib/id-card-renderer";

type IdCardTemplate = {
  id: string;
  name: string;
  eventId: string | null;
  layoutConfig: Record<string, unknown>;
  logoUrl: string | null;
  backgroundImageUrl: string | null;
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

function DraggableField({
  fp,
  label,
  sampleValue,
  scale,
  selected,
  canvasW: cw,
  canvasH: ch,
  onSelect,
  onDragEnd,
  onResize,
  photoLabel,
}: {
  fp: FieldPlacement;
  label: string;
  sampleValue: string;
  scale: number;
  selected: boolean;
  canvasW: number;
  canvasH: number;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  photoLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const startRef = useRef({ mx: 0, my: 0, ox: 0, oy: 0, ow: 0, oh: 0 });

  const clampX = useCallback((x: number, w: number) => Math.max(0, Math.min(x, cw - w)), [cw]);
  const clampY = useCallback((y: number, h: number) => Math.max(0, Math.min(y, ch - h)), [ch]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect();
      setDragging(true);
      startRef.current = { mx: e.clientX, my: e.clientY, ox: fp.x, oy: fp.y, ow: fp.w, oh: fp.h };
    },
    [fp.x, fp.y, fp.w, fp.h, onSelect],
  );

  const handleResizeDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect();
      setResizing(true);
      startRef.current = { mx: e.clientX, my: e.clientY, ox: fp.x, oy: fp.y, ow: fp.w, oh: fp.h };
    },
    [fp.x, fp.y, fp.w, fp.h, onSelect],
  );

  useEffect(() => {
    if (!dragging && !resizing) return;

    const handleMove = (e: MouseEvent) => {
      const dx = (e.clientX - startRef.current.mx) / scale;
      const dy = (e.clientY - startRef.current.my) / scale;

      if (dragging) {
        const newX = clampX(startRef.current.ox + dx, fp.w);
        const newY = clampY(startRef.current.oy + dy, fp.h);
        if (ref.current) {
          ref.current.style.left = `${newX * scale}px`;
          ref.current.style.top = `${newY * scale}px`;
        }
      }
      if (resizing) {
        const maxW = cw - startRef.current.ox;
        const maxH = ch - startRef.current.oy;
        const newW = Math.min(maxW, Math.max(30, startRef.current.ow + dx));
        const newH = Math.min(maxH, Math.max(14, startRef.current.oh + dy));
        if (ref.current) {
          ref.current.style.width = `${newW * scale}px`;
          ref.current.style.height = `${newH * scale}px`;
        }
      }
    };

    const handleUp = (e: MouseEvent) => {
      const dx = (e.clientX - startRef.current.mx) / scale;
      const dy = (e.clientY - startRef.current.my) / scale;

      if (dragging) {
        const newX = clampX(Math.round(startRef.current.ox + dx), fp.w);
        const newY = clampY(Math.round(startRef.current.oy + dy), fp.h);
        onDragEnd(newX, newY);
      }
      if (resizing) {
        const maxW = cw - startRef.current.ox;
        const maxH = ch - startRef.current.oy;
        const newW = Math.min(maxW, Math.max(30, Math.round(startRef.current.ow + dx)));
        const newH = Math.min(maxH, Math.max(14, Math.round(startRef.current.oh + dy)));
        onResize(newW, newH);
      }
      setDragging(false);
      setResizing(false);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, resizing, scale, onDragEnd, onResize, clampX, clampY, fp.w, fp.h, cw, ch]);

  if (!fp.visible) return null;

  const isPhoto = fp.key === "photo";
  const x = fp.x * scale;
  const y = fp.y * scale;
  const w = fp.w * scale;
  const h = fp.h * scale;

  return (
    <div
      ref={ref}
      data-testid={`draggable-field-${fp.key}`}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        cursor: "move",
        zIndex: selected ? 20 : 10,
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {isPhoto ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 4 * scale,
            background: "rgba(255,255,255,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12 * scale,
            fontWeight: 700,
            color: "rgba(255,255,255,0.6)",
            border: selected ? "2px dashed #16a34a" : "1px dashed rgba(255,255,255,0.3)",
          }}
        >
          {sampleValue || photoLabel}
        </div>
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            fontSize: fp.fontSize * scale,
            fontWeight: fp.fontWeight,
            color: fp.fontColor,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            justifyContent: fp.textAlign === "center" ? "center" : fp.textAlign === "right" ? "flex-end" : "flex-start",
            textAlign: fp.textAlign || "left",
            lineHeight: 1.2,
            border: selected ? "2px dashed #16a34a" : "1px dashed rgba(255,255,255,0.15)",
            borderRadius: 2,
            padding: `0 ${2 * scale}px`,
            background: selected ? "rgba(22,163,58,0.1)" : "transparent",
          }}
        >
          {sampleValue || label}
        </div>
      )}

      {selected && (
        <div
          style={{
            position: "absolute",
            right: -3,
            bottom: -3,
            width: 8,
            height: 8,
            background: "#16a34a",
            cursor: "se-resize",
            borderRadius: 2,
          }}
          onMouseDown={handleResizeDown}
        />
      )}
    </div>
  );
}

function TemplateDesigner() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { t } = useTranslation(["idCards"]);
  const [editId, setEditId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: "",
    eventId: "",
    logoUrl: "",
    backgroundImageUrl: "" as string,
    fields: ["fullName", "photo", "employeeNumber"] as string[],
    layout: "horizontal" as CardLayout,
    fieldPlacements: defaultFieldPlacements("horizontal") as FieldPlacement[],
  });

  const { data: templates = [] } = useQuery<IdCardTemplate[]>({
    queryKey: ["/api/id-card-templates"],
    queryFn: () => apiRequest("GET", "/api/id-card-templates").then((r) => r.json()),
  });

  const { data: events = [] } = useQuery<EventType[]>({
    queryKey: ["/api/events"],
    queryFn: () => apiRequest("GET", "/api/events").then((r) => r.json()),
  });

  const errToast = (e: Error) => toast({ title: t("idCards:common.errGeneric"), description: e.message, variant: "destructive" });

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      editId
        ? apiRequest("PATCH", `/api/id-card-templates/${editId}`, data).then((r) => r.json())
        : apiRequest("POST", "/api/id-card-templates", data).then((r) => r.json()),
    onSuccess: async (created: { id: string }) => {
      if (pendingBgFile && !editId && created?.id) {
        await uploadBackgroundFile(created.id, pendingBgFile);
        setPendingBgFile(null);
      }
      toast({ title: editId ? t("idCards:designer.toast.updated") : t("idCards:designer.toast.created") });
      qc.invalidateQueries({ queryKey: ["/api/id-card-templates"] });
      resetForm();
    },
    onError: errToast,
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/id-card-templates/${id}/activate`).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: t("idCards:designer.toast.activated") });
      qc.invalidateQueries({ queryKey: ["/api/id-card-templates"] });
    },
    onError: errToast,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/id-card-templates/${id}`),
    onSuccess: () => {
      toast({ title: t("idCards:designer.toast.deleted") });
      qc.invalidateQueries({ queryKey: ["/api/id-card-templates"] });
      setDeleteId(null);
    },
    onError: errToast,
  });

  function resetForm() {
    setForm({
      name: "",
      eventId: "",
      logoUrl: "",
      backgroundImageUrl: "",
      fields: ["fullName", "photo", "employeeNumber"],
      layout: "horizontal",
      fieldPlacements: defaultFieldPlacements("horizontal"),
    });
    setEditId(null);
    setFormOpen(false);
    setSelectedFieldKey(null);
  }

  function openEdit(tpl: IdCardTemplate) {
    const lc = (tpl.layoutConfig ?? {}) as Record<string, unknown>;
    const layout = (lc.layout as CardLayout) ?? "horizontal";
    const savedPlacements = (lc.fieldPlacements as FieldPlacement[] | undefined);
    const activeFields = tpl.fields ?? ["fullName", "photo", "employeeNumber"];

    const placements = (savedPlacements && savedPlacements.length > 0
      ? savedPlacements
      : defaultFieldPlacements(layout)
    ).map((fp) => ({ ...fp, visible: activeFields.includes(fp.key) }));

    setForm({
      name: tpl.name,
      eventId: tpl.eventId ?? "",
      logoUrl: tpl.logoUrl ?? "",
      backgroundImageUrl: tpl.backgroundImageUrl ?? "",
      fields: activeFields,
      layout,
      fieldPlacements: placements,
    });
    setEditId(tpl.id);
    setFormOpen(true);
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast({ title: t("idCards:designer.toast.nameRequired"), variant: "destructive" });
      return;
    }
    const bgUrl = form.backgroundImageUrl && !form.backgroundImageUrl.startsWith("blob:")
      ? form.backgroundImageUrl
      : null;
    saveMutation.mutate({
      name: form.name.trim(),
      eventId: form.eventId || null,
      logoUrl: form.logoUrl || null,
      backgroundImageUrl: bgUrl,
      fields: form.fields,
      backgroundColor: "#1a1a2e",
      textColor: "#ffffff",
      accentColor: "#16a34a",
      layoutConfig: {
        layout: form.layout,
        fieldPlacements: form.fieldPlacements,
      },
    });
  }

  function toggleField(key: string) {
    setForm((f) => {
      const newFields = f.fields.includes(key)
        ? f.fields.filter((k) => k !== key)
        : [...f.fields, key];
      const newPlacements = f.fieldPlacements.map((fp) =>
        fp.key === key ? { ...fp, visible: newFields.includes(key) } : fp,
      );
      return { ...f, fields: newFields, fieldPlacements: newPlacements };
    });
  }

  function updatePlacement(key: string, updates: Partial<FieldPlacement>) {
    setForm((f) => ({
      ...f,
      fieldPlacements: f.fieldPlacements.map((fp) =>
        fp.key === key ? { ...fp, ...updates } : fp,
      ),
    }));
  }

  function handleLayoutChange(newLayout: CardLayout) {
    setForm((f) => ({
      ...f,
      layout: newLayout,
      fieldPlacements: defaultFieldPlacements(newLayout).map((dfp) => {
        const existing = f.fieldPlacements.find((fp) => fp.key === dfp.key);
        return existing
          ? { ...dfp, visible: f.fields.includes(dfp.key), fontColor: existing.fontColor, fontSize: existing.fontSize, fontWeight: existing.fontWeight }
          : { ...dfp, visible: f.fields.includes(dfp.key) };
      }),
    }));
  }

  const [pendingBgFile, setPendingBgFile] = useState<File | null>(null);

  async function handleBackgroundUpload(file: File) {
    if (!editId) {
      const localUrl = URL.createObjectURL(file);
      setForm((f) => ({ ...f, backgroundImageUrl: localUrl }));
      setPendingBgFile(file);
      return;
    }

    await uploadBackgroundFile(editId, file);
  }

  async function uploadBackgroundFile(templateId: string, file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/id-card-templates/${templateId}/background`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const updated = await res.json();
      setForm((f) => ({ ...f, backgroundImageUrl: updated.backgroundImageUrl ?? "" }));
      qc.invalidateQueries({ queryKey: ["/api/id-card-templates"] });
      toast({ title: t("idCards:designer.toast.bgUploaded") });
    } catch {
      toast({ title: t("idCards:designer.toast.uploadFail"), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const canvasLayout = form.layout;
  const canvasW = canvasLayout === "vertical" ? CANVAS_H : CANVAS_W;
  const canvasH = canvasLayout === "vertical" ? CANVAS_W : CANVAS_H;
  const previewScale = 2.1;

  const previewConfig: IdCardTemplateConfig = {
    name: form.name || t("idCards:designer.untitled"),
    logoUrl: form.logoUrl || null,
    backgroundImageUrl: form.backgroundImageUrl || null,
    fields: form.fields,
    fieldPlacements: form.fieldPlacements,
    backgroundColor: "#1a1a2e",
    textColor: "#ffffff",
    accentColor: "#16a34a",
    layout: form.layout,
  };

  const currentFields = form.fields;
  const currentPlacements = form.fieldPlacements;
  const currentAvailableFields = AVAILABLE_FIELDS;
  const currentBgUrl = form.backgroundImageUrl;

  const selectedPlacement = selectedFieldKey
    ? currentPlacements.find((fp) => fp.key === selectedFieldKey)
    : null;

  const fieldLabel = (key: string) =>
    t(`idCards:field.${key}` as any, AVAILABLE_FIELDS.find((f) => f.key === key)?.label ?? key);
  const layoutLabel = (key: string) =>
    t(`idCards:layout.${key}` as any, CARD_LAYOUTS.find((l) => l.key === key)?.label ?? key);
  const layoutDesc = (key: string) =>
    t(`idCards:layout.${key}Desc` as any, CARD_LAYOUTS.find((l) => l.key === key)?.description ?? "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            {t("idCards:designer.heading")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("idCards:designer.sub")}
          </p>
        </div>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground gap-1.5"
          onClick={() => { resetForm(); setFormOpen(true); }}
          data-testid="button-create-template"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("idCards:designer.btnNew")}
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-border rounded-md bg-muted/10 space-y-3">
          <CreditCard className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">{t("idCards:designer.empty")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => {
            const lc = (tpl.layoutConfig ?? {}) as Record<string, unknown>;
            const layout = (lc.layout as CardLayout) ?? "horizontal";
            const config: IdCardTemplateConfig = {
              name: tpl.name,
              logoUrl: tpl.logoUrl,
              backgroundImageUrl: tpl.backgroundImageUrl,
              fields: tpl.fields,
              fieldPlacements: (lc.fieldPlacements as FieldPlacement[]) ?? undefined,
              backgroundColor: tpl.backgroundColor,
              textColor: tpl.textColor,
              accentColor: tpl.accentColor,
              layout,
            };
            return (
              <Card
                key={tpl.id}
                className={`bg-card border-border ${tpl.isActive ? "ring-1 ring-primary" : ""}`}
                data-testid={`card-template-${tpl.id}`}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white"><bdi>{tpl.name}</bdi></span>
                      {tpl.isActive && (
                        <Badge className="bg-primary/15 text-primary border-primary/20 text-xs">
                          {t("idCards:designer.active")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div
                    className="flex justify-center"
                    dangerouslySetInnerHTML={{ __html: renderIdCardHTML(config, SAMPLE_EMPLOYEE, 0.65) }}
                  />
                  <div className="flex items-center gap-1.5 pt-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => openEdit(tpl)}>
                      <Eye className="h-3 w-3 me-1" /> {t("idCards:designer.btnEdit")}
                    </Button>
                    {!tpl.isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-primary flex-1"
                        onClick={() => activateMutation.mutate(tpl.id)}
                        disabled={activateMutation.isPending}
                        data-testid={`button-activate-template-${tpl.id}`}
                      >
                        <CheckCircle2 className="h-3 w-3 me-1" /> {t("idCards:designer.btnActivate")}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-red-400"
                      onClick={() => setDeleteId(tpl.id)}
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
        <DialogContent className="max-w-5xl bg-zinc-950 border-zinc-800 text-white max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              {editId ? t("idCards:designer.dialogTitleEdit") : t("idCards:designer.dialogTitleNew")}
            </DialogTitle>
            <DialogDescription className="sr-only">{t("idCards:designer.dialogDesc")}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 mt-4">
              <div className="space-y-4 pe-1">
                <div className="space-y-2">
                  <Label className="text-white">{t("idCards:designer.lblName")} *</Label>
                  <Input
                    data-testid="input-template-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={t("idCards:designer.phName")}
                    className="bg-zinc-900 border-zinc-700 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white">{t("idCards:designer.lblEvent")}</Label>
                  <Select value={form.eventId} onValueChange={(v) => setForm((f) => ({ ...f, eventId: v === "none" ? "" : v }))}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white" data-testid="select-template-event">
                      <SelectValue placeholder={t("idCards:designer.phEvent")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("idCards:designer.optAllEvents")}</SelectItem>
                      {events.map((e) => (
                        <SelectItem key={e.id} value={e.id}><bdi>{e.name}</bdi></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-white text-xs uppercase tracking-wider">{t("idCards:designer.lblLayout")}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {CARD_LAYOUTS.map((l) => (
                      <button
                        key={l.key}
                        type="button"
                        className={`p-2 rounded-md border text-start transition-colors ${
                          form.layout === l.key
                            ? "border-primary bg-primary/10 text-white"
                            : "border-zinc-800 hover:border-zinc-600 text-zinc-400"
                        }`}
                        onClick={() => handleLayoutChange(l.key)}
                        data-testid={`button-layout-${l.key}`}
                      >
                        <div className="text-xs font-medium">{layoutLabel(l.key)}</div>
                        <div className="text-[10px] opacity-70 mt-0.5">{layoutDesc(l.key)}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <Separator className="bg-zinc-800" />

                <div className="space-y-2">
                  <Label className="text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" /> {t("idCards:designer.lblBackground")}
                  </Label>
                  <p className="text-[11px] text-zinc-500">{t("idCards:designer.bgHint")}</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-zinc-700 gap-1.5 flex-1"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      data-testid="button-upload-background"
                    >
                      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {currentBgUrl ? t("idCards:designer.btnChange") : t("idCards:designer.btnUpload")}
                    </Button>
                    {currentBgUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 h-8 px-2"
                        onClick={() => {
                          setForm((f) => ({ ...f, backgroundImageUrl: "" }));
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleBackgroundUpload(file);
                      e.target.value = "";
                    }}
                  />
                  {currentBgUrl && (
                    <div className="text-xs text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {t("idCards:designer.bgLoaded")}
                    </div>
                  )}
                </div>

                <Separator className="bg-zinc-800" />

                <div className="space-y-2">
                  <Label className="text-white text-xs uppercase tracking-wider">
                    {t("idCards:designer.lblFields")}
                  </Label>
                  <div className="space-y-1">
                    {currentAvailableFields.map((f) => (
                      <label
                        key={f.key}
                        className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                          selectedFieldKey === f.key
                            ? "border-primary bg-primary/5"
                            : "border-zinc-800 hover:border-zinc-700"
                        }`}
                        onClick={(e) => {
                          e.preventDefault();
                          setSelectedFieldKey(f.key);
                        }}
                      >
                        <Checkbox
                          checked={currentFields.includes(f.key)}
                          onCheckedChange={() => toggleField(f.key)}
                          data-testid={`checkbox-field-${f.key}`}
                        />
                        <span className="text-sm text-zinc-300 flex-1">{fieldLabel(f.key)}</span>
                        {currentFields.includes(f.key) && (
                          <Move className="h-3 w-3 text-zinc-600" />
                        )}
                      </label>
                    ))}
                  </div>
                </div>

                {selectedPlacement && selectedPlacement.key !== "photo" && selectedPlacement.key !== "qrCode" && (
                  <>
                    <Separator className="bg-zinc-800" />
                    <div className="space-y-3">
                      <Label className="text-white text-xs uppercase tracking-wider">
                        {t("idCards:designer.fieldHeading", { replace: { name: fieldLabel(selectedPlacement.key) } })}
                      </Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-zinc-400 text-xs">{t("idCards:designer.lblFontSize")}</Label>
                          <Input
                            type="number"
                            min={6}
                            max={28}
                            value={selectedPlacement.fontSize}
                            onChange={(e) =>
                              updatePlacement(selectedPlacement.key, { fontSize: Number(e.target.value) || 10 })
                            }
                            className="bg-zinc-900 border-zinc-700 text-white h-8 text-xs"
                            dir="ltr"
                            data-testid="input-field-font-size"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-zinc-400 text-xs">{t("idCards:designer.lblFontWeight")}</Label>
                          <Select
                            value={String(selectedPlacement.fontWeight)}
                            onValueChange={(v) => updatePlacement(selectedPlacement.key, { fontWeight: Number(v) })}
                          >
                            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="400">{t("idCards:designer.weight.normal")}</SelectItem>
                              <SelectItem value="500">{t("idCards:designer.weight.medium")}</SelectItem>
                              <SelectItem value="600">{t("idCards:designer.weight.semibold")}</SelectItem>
                              <SelectItem value="700">{t("idCards:designer.weight.bold")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-zinc-400 text-xs">{t("idCards:designer.lblFontColor")}</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={selectedPlacement.fontColor}
                            onChange={(e) => updatePlacement(selectedPlacement.key, { fontColor: e.target.value })}
                            className="h-7 w-7 rounded cursor-pointer border-0"
                            data-testid="input-field-color"
                          />
                          <Input
                            value={selectedPlacement.fontColor}
                            onChange={(e) => updatePlacement(selectedPlacement.key, { fontColor: e.target.value })}
                            className="bg-zinc-900 border-zinc-700 text-white text-xs font-mono h-8 flex-1"
                            dir="ltr"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-zinc-400 text-xs">{t("idCards:designer.lblTextAlign")}</Label>
                        <div className="flex gap-1">
                          {(["left", "center", "right"] as const).map((align) => (
                            <button
                              key={align}
                              type="button"
                              className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                                (selectedPlacement.textAlign || "left") === align
                                  ? "border-primary bg-primary/15 text-white"
                                  : "border-zinc-700 text-zinc-400 hover:text-white"
                              }`}
                              onClick={() => updatePlacement(selectedPlacement.key, { textAlign: align })}
                              data-testid={`button-align-${align}`}
                            >
                              {t(`idCards:designer.align.${align}`)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-zinc-400 text-xs">{t("idCards:designer.lblX")}</Label>
                          <Input
                            type="number"
                            min={0}
                            max={canvasW - selectedPlacement.w}
                            value={selectedPlacement.x}
                            onChange={(e) => updatePlacement(selectedPlacement.key, { x: Math.max(0, Math.min(canvasW - selectedPlacement.w, Number(e.target.value) || 0)) })}
                            className="bg-zinc-900 border-zinc-700 text-white h-7 text-xs"
                            dir="ltr"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-zinc-400 text-xs">{t("idCards:designer.lblY")}</Label>
                          <Input
                            type="number"
                            min={0}
                            max={canvasH - selectedPlacement.h}
                            value={selectedPlacement.y}
                            onChange={(e) => updatePlacement(selectedPlacement.key, { y: Math.max(0, Math.min(canvasH - selectedPlacement.h, Number(e.target.value) || 0)) })}
                            className="bg-zinc-900 border-zinc-700 text-white h-7 text-xs"
                            dir="ltr"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-zinc-400 text-xs">{t("idCards:designer.lblWidth")}</Label>
                          <Input
                            type="number"
                            value={selectedPlacement.w}
                            onChange={(e) => updatePlacement(selectedPlacement.key, { w: Math.max(30, Math.min(canvasW - selectedPlacement.x, Number(e.target.value) || 30)) })}
                            className="bg-zinc-900 border-zinc-700 text-white h-7 text-xs"
                            dir="ltr"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-zinc-400 text-xs">{t("idCards:designer.lblHeight")}</Label>
                          <Input
                            type="number"
                            value={selectedPlacement.h}
                            onChange={(e) => updatePlacement(selectedPlacement.key, { h: Math.max(14, Math.min(canvasH - selectedPlacement.y, Number(e.target.value) || 14)) })}
                            className="bg-zinc-900 border-zinc-700 text-white h-7 text-xs"
                            dir="ltr"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-3">
                <Label className="text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" /> {t("idCards:designer.previewLabel")}
                </Label>
                <p className="text-[11px] text-zinc-500">{t("idCards:designer.previewHint")}</p>

                <div
                  className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex items-center justify-center"
                  onClick={() => setSelectedFieldKey(null)}
                >
                  <div
                    style={{
                      position: "relative",
                      width: canvasW * previewScale,
                      height: canvasH * previewScale,
                      borderRadius: 6 * previewScale,
                      overflow: "hidden",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                      fontFamily: "'Inter', system-ui, sans-serif",
                      ...(currentBgUrl
                        ? {
                            backgroundImage: `url('${currentBgUrl}')`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }
                        : {
                            background: "#1a1a2e",
                          }),
                    }}
                    data-testid="template-canvas"
                  >
                    {currentPlacements.map((fp) => {
                      const sampleVal = fp.key === "photo"
                        ? (SAMPLE_EMPLOYEE.fullName?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() ?? "")
                        : (SAMPLE_EMPLOYEE as unknown as Record<string, unknown>)[fp.key] as string || "";
                      return (
                        <DraggableField
                          key={fp.key}
                          fp={fp}
                          label={fieldLabel(fp.key)}
                          sampleValue={sampleVal}
                          scale={previewScale}
                          selected={selectedFieldKey === fp.key}
                          canvasW={canvasW}
                          canvasH={canvasH}
                          onSelect={() => setSelectedFieldKey(fp.key)}
                          onDragEnd={(x, y) => updatePlacement(fp.key, { x, y })}
                          onResize={(w, h) => updatePlacement(fp.key, { w, h })}
                          photoLabel={t("idCards:designer.phPhoto")}
                        />
                      );
                    })}
                  </div>
                </div>

                <p className="text-xs text-zinc-500 text-center" dir="ltr">
                  {t("idCards:designer.cardSize")}
                </p>

                <Separator className="bg-zinc-800" />

                <div className="space-y-2">
                  <Label className="text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" /> {t("idCards:designer.printPreview")}
                  </Label>
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex items-center justify-center">
                    <div dangerouslySetInnerHTML={{ __html: renderIdCardHTML(previewConfig, SAMPLE_EMPLOYEE, 1.0) }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 flex justify-end gap-2 pt-4 border-t border-zinc-800 mt-4">
            <Button variant="outline" className="border-zinc-700" onClick={resetForm}>
              {t("idCards:common.cancel")}
            </Button>
            <Button
              className="bg-primary text-primary-foreground"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              data-testid="button-save-template"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : null}
              {editId ? t("idCards:designer.btnUpdate") : t("idCards:designer.btnCreate")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent className="bg-zinc-950 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{t("idCards:designer.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {t("idCards:designer.deleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 text-zinc-300">{t("idCards:common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("idCards:designer.btnDelete")}
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
  const { t, i18n } = useTranslation(["idCards"]);
  const lang = i18n.language;
  const [formOpen, setFormOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "zebra_browser_print", config: {} as Record<string, string> });

  const { data: plugins = [] } = useQuery<PrinterPluginType[]>({
    queryKey: ["/api/printer-plugins"],
    queryFn: () => apiRequest("GET", "/api/printer-plugins").then((r) => r.json()),
  });

  const errToast = (e: Error) => toast({ title: t("idCards:common.errGeneric"), description: e.message, variant: "destructive" });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/printer-plugins", data).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: t("idCards:printer.toast.added") });
      qc.invalidateQueries({ queryKey: ["/api/printer-plugins"] });
      setFormOpen(false);
      setForm({ name: "", type: "zebra_browser_print", config: {} });
    },
    onError: errToast,
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/printer-plugins/${id}/activate`).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: t("idCards:printer.toast.activated") });
      qc.invalidateQueries({ queryKey: ["/api/printer-plugins"] });
    },
    onError: errToast,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/printer-plugins/${id}`),
    onSuccess: () => {
      toast({ title: t("idCards:printer.toast.removed") });
      qc.invalidateQueries({ queryKey: ["/api/printer-plugins"] });
      setDeleteId(null);
    },
    onError: errToast,
  });

  const selectedPluginType = PLUGIN_TYPES.find((pt) => pt.value === form.type);

  function handleCreate() {
    if (!form.name.trim()) {
      toast({ title: t("idCards:printer.toast.nameRequired"), variant: "destructive" });
      return;
    }
    const finalConfig: Record<string, string> = {};
    if (selectedPluginType) {
      for (const field of selectedPluginType.configFields) {
        const val = form.config[field.key] || "";
        if (val) finalConfig[field.key] = val;
      }
    }
    createMutation.mutate({ name: form.name.trim(), type: form.type, config: finalConfig });
  }

  function handleTypeChange(newType: string) {
    const pt = PLUGIN_TYPES.find((p) => p.value === newType);
    const defaultCfg: Record<string, string> = {};
    if (pt) {
      for (const field of pt.configFields) {
        defaultCfg[field.key] = (pt.defaultConfig as Record<string, string>)[field.key] || "";
      }
    }
    setForm((f) => ({ ...f, type: newType, config: defaultCfg }));
  }

  const pluginTypeLabel = (val: string) =>
    t(`idCards:pluginType.${val}` as any, PLUGIN_TYPES.find((pt) => pt.value === val)?.label ?? val);
  const pluginDesc = (val: string) =>
    t(`idCards:pluginDesc.${val}` as any, PLUGIN_TYPES.find((pt) => pt.value === val)?.description ?? "");
  const pluginFieldLabel = (key: string, fallback: string, isZebraEndpoint: boolean) => {
    if (key === "endpoint" && isZebraEndpoint) return t("idCards:pluginField.endpointZebra", fallback);
    return t(`idCards:pluginField.${key}` as any, fallback);
  };
  const pluginFieldPh = (key: string, fallback: string) =>
    t(`idCards:pluginPh.${key}` as any, fallback);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <PlugZap className="h-4 w-4 text-primary" />
            {t("idCards:printer.heading")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("idCards:printer.sub")}
          </p>
        </div>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground gap-1.5"
          onClick={() => setFormOpen(true)}
          data-testid="button-add-printer-plugin"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("idCards:printer.btnAdd")}
        </Button>
      </div>

      <div className="bg-blue-950/20 border border-blue-800/30 rounded-lg p-4 text-sm text-blue-300 space-y-1">
        <p className="font-medium">{t("idCards:printer.howTitle")}</p>
        <p className="text-xs text-blue-400">{t("idCards:printer.howBody")}</p>
      </div>

      {plugins.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-border rounded-md bg-muted/10 space-y-3">
          <Printer className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">{t("idCards:printer.empty")}</p>
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
                      <span className="text-sm font-medium text-white"><bdi>{p.name}</bdi></span>
                      <Badge variant="outline" className="text-xs text-zinc-400">
                        {pluginTypeLabel(p.type)}
                      </Badge>
                      {p.isActive && (
                        <Badge className="bg-primary/15 text-primary border-primary/20 text-xs">
                          {t("idCards:printer.active")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {t("idCards:printer.added", { replace: { date: formatDateTime(p.createdAt, lang) } })}
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
                      {t("idCards:printer.btnActivate")}
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
              {t("idCards:printer.dialogTitle")}
            </DialogTitle>
            <DialogDescription className="sr-only">{t("idCards:printer.dialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-white">{t("idCards:printer.lblName")}</Label>
              <Input
                data-testid="input-printer-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("idCards:printer.phName")}
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white">{t("idCards:printer.lblType")}</Label>
              <Select value={form.type} onValueChange={handleTypeChange}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white" data-testid="select-printer-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLUGIN_TYPES.map((pt) => (
                    <SelectItem key={pt.value} value={pt.value}>{pluginTypeLabel(pt.value)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPluginType && (
                <p className="text-[11px] text-zinc-500">{pluginDesc(selectedPluginType.value)}</p>
              )}
            </div>

            {selectedPluginType && selectedPluginType.configFields.length > 0 && (
              <>
                <Separator className="bg-zinc-800" />
                <div className="space-y-3">
                  <Label className="text-white text-xs uppercase tracking-wider">{t("idCards:printer.lblConn")}</Label>
                  {selectedPluginType.configFields.map((field) => {
                    const isZebraEndpoint = selectedPluginType.value === "zebra_browser_print";
                    const fLabel = pluginFieldLabel(field.key, field.label, isZebraEndpoint);
                    const fPh = pluginFieldPh(field.key, field.placeholder);
                    return (
                      <div key={field.key} className="space-y-1">
                        <Label className="text-zinc-400 text-xs">{fLabel}</Label>
                        {(field.type as string) === "select" && "options" in field ? (
                          <Select
                            value={form.config[field.key] || ""}
                            onValueChange={(v) => setForm((f) => ({ ...f, config: { ...f.config, [field.key]: v } }))}
                          >
                            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white h-8 text-xs">
                              <SelectValue placeholder={fPh} />
                            </SelectTrigger>
                            <SelectContent>
                              {(field as { options: { value: string; label: string }[] }).options.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={form.config[field.key] || ""}
                            onChange={(e) => setForm((f) => ({ ...f, config: { ...f.config, [field.key]: e.target.value } }))}
                            placeholder={fPh}
                            className="bg-zinc-900 border-zinc-700 text-white h-8 text-xs"
                            dir={field.key === "endpoint" ? "ltr" : undefined}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" className="border-zinc-700" onClick={() => setFormOpen(false)}>
                {t("idCards:common.cancel")}
              </Button>
              <Button
                className="bg-primary text-primary-foreground"
                onClick={handleCreate}
                disabled={createMutation.isPending}
                data-testid="button-create-printer"
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : null}
                {t("idCards:printer.btnCreate")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent className="bg-zinc-950 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{t("idCards:printer.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {t("idCards:printer.deleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 text-zinc-300">{t("idCards:common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {t("idCards:printer.btnDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PrintAuditLog() {
  const { t, i18n } = useTranslation(["idCards"]);
  const lang = i18n.language;
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

  const statusLabel = (s: string) => t(`idCards:printStatus.${s}` as any, s);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            {t("idCards:log.heading")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("idCards:log.sub")}
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-search-print-logs"
            placeholder={t("idCards:log.searchPh")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9 bg-muted/30 border-border h-8 text-sm"
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
            {search ? t("idCards:log.emptyMatch") : t("idCards:log.empty")}
          </p>
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">{t("idCards:log.th.employee")}</TableHead>
                  <TableHead className="text-muted-foreground">{t("idCards:log.th.empNo")}</TableHead>
                  <TableHead className="text-muted-foreground">{t("idCards:log.th.template")}</TableHead>
                  <TableHead className="text-muted-foreground">{t("idCards:log.th.printedBy")}</TableHead>
                  <TableHead className="text-muted-foreground">{t("idCards:log.th.status")}</TableHead>
                  <TableHead className="text-muted-foreground">{t("idCards:log.th.date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => (
                  <TableRow key={log.id} className="border-border" data-testid={`print-log-${log.id}`}>
                    <TableCell className="text-white text-sm"><bdi>{log.employeeName ?? "—"}</bdi></TableCell>
                    <TableCell className="text-zinc-400 text-xs font-mono" dir="ltr">{log.employeeNumber ?? "—"}</TableCell>
                    <TableCell className="text-zinc-400 text-sm"><bdi>{log.templateName ?? "—"}</bdi></TableCell>
                    <TableCell className="text-zinc-400 text-sm"><bdi>{log.printedByName ?? t("idCards:log.system")}</bdi></TableCell>
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
                        {statusLabel(log.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-400 text-xs" dir="ltr">{formatDateTime(log.printedAt, lang)}</TableCell>
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
  const { t } = useTranslation(["idCards"]);
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-white flex items-center gap-3" data-testid="text-page-title">
            <CreditCard className="h-7 w-7 text-primary" />
            {t("idCards:title")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("idCards:subtitle")}
          </p>
        </div>

        <Tabs defaultValue="templates" className="space-y-4">
          <TabsList className="bg-muted/30 border border-border">
            <TabsTrigger value="templates" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5" data-testid="tab-templates">
              <Palette className="h-3.5 w-3.5" />
              {t("idCards:tab.templates")}
            </TabsTrigger>
            <TabsTrigger value="printers" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5" data-testid="tab-printers">
              <Printer className="h-3.5 w-3.5" />
              {t("idCards:tab.printers")}
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5" data-testid="tab-history">
              <History className="h-3.5 w-3.5" />
              {t("idCards:tab.history")}
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
