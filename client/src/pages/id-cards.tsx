import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  AVAILABLE_FIELDS,
  BACK_AVAILABLE_FIELDS,
  BACK_SAMPLE_DATA,
  CARD_LAYOUTS,
  PLUGIN_TYPES,
  SAMPLE_EMPLOYEE,
  CANVAS_W,
  CANVAS_H,
  renderIdCardHTML,
  renderBackSideHTML,
  defaultFieldPlacements,
  defaultBackFieldPlacements,
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
  backBackgroundImageUrl: string | null;
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
          {sampleValue || "PHOTO"}
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
  const [editId, setEditId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cardSide, setCardSide] = useState<"front" | "back">("front");

  const [form, setForm] = useState({
    name: "",
    eventId: "",
    logoUrl: "",
    backgroundImageUrl: "" as string,
    backBackgroundImageUrl: "" as string,
    fields: ["fullName", "photo", "employeeNumber"] as string[],
    backFields: ["companyName", "companyAddress", "disclaimer"] as string[],
    layout: "horizontal" as CardLayout,
    fieldPlacements: defaultFieldPlacements("horizontal") as FieldPlacement[],
    backFieldPlacements: defaultBackFieldPlacements("horizontal") as FieldPlacement[],
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
    onSuccess: async (created: { id: string }) => {
      if (pendingBgFile && !editId && created?.id) {
        await uploadBackgroundFile(created.id, pendingBgFile, "front");
        setPendingBgFile(null);
      }
      if (pendingBackBgFile && !editId && created?.id) {
        await uploadBackgroundFile(created.id, pendingBackBgFile, "back");
        setPendingBackBgFile(null);
      }
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
      backgroundImageUrl: "",
      backBackgroundImageUrl: "",
      fields: ["fullName", "photo", "employeeNumber"],
      backFields: ["companyName", "companyAddress", "disclaimer"],
      layout: "horizontal",
      fieldPlacements: defaultFieldPlacements("horizontal"),
      backFieldPlacements: defaultBackFieldPlacements("horizontal"),
    });
    setEditId(null);
    setFormOpen(false);
    setSelectedFieldKey(null);
    setCardSide("front");
  }

  function openEdit(t: IdCardTemplate) {
    const lc = (t.layoutConfig ?? {}) as Record<string, unknown>;
    const layout = (lc.layout as CardLayout) ?? "horizontal";
    const savedPlacements = (lc.fieldPlacements as FieldPlacement[] | undefined);
    const activeFields = t.fields ?? ["fullName", "photo", "employeeNumber"];

    const placements = (savedPlacements && savedPlacements.length > 0
      ? savedPlacements
      : defaultFieldPlacements(layout)
    ).map((fp) => ({ ...fp, visible: activeFields.includes(fp.key) }));

    const savedBackPlacements = (lc.backFieldPlacements as FieldPlacement[] | undefined);
    const activeBackFields = (lc.backFields as string[] | undefined) ?? ["companyName", "companyAddress", "disclaimer"];
    const backPlacements = (savedBackPlacements && savedBackPlacements.length > 0
      ? savedBackPlacements
      : defaultBackFieldPlacements(layout)
    ).map((fp) => ({ ...fp, visible: activeBackFields.includes(fp.key) }));

    setForm({
      name: t.name,
      eventId: t.eventId ?? "",
      logoUrl: t.logoUrl ?? "",
      backgroundImageUrl: t.backgroundImageUrl ?? "",
      backBackgroundImageUrl: t.backBackgroundImageUrl ?? "",
      fields: activeFields,
      backFields: activeBackFields,
      layout,
      fieldPlacements: placements,
      backFieldPlacements: backPlacements,
    });
    setEditId(t.id);
    setFormOpen(true);
    setCardSide("front");
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "Template name is required", variant: "destructive" });
      return;
    }
    const bgUrl = form.backgroundImageUrl && !form.backgroundImageUrl.startsWith("blob:")
      ? form.backgroundImageUrl
      : null;
    const backBgUrl = form.backBackgroundImageUrl && !form.backBackgroundImageUrl.startsWith("blob:")
      ? form.backBackgroundImageUrl
      : null;
    saveMutation.mutate({
      name: form.name.trim(),
      eventId: form.eventId || null,
      logoUrl: form.logoUrl || null,
      backgroundImageUrl: bgUrl,
      backBackgroundImageUrl: backBgUrl,
      fields: form.fields,
      backgroundColor: "#1a1a2e",
      textColor: "#ffffff",
      accentColor: "#16a34a",
      layoutConfig: {
        layout: form.layout,
        fieldPlacements: form.fieldPlacements,
        backFields: form.backFields,
        backFieldPlacements: form.backFieldPlacements,
      },
    });
  }

  function toggleField(key: string) {
    if (cardSide === "back") {
      setForm((f) => {
        const newFields = f.backFields.includes(key)
          ? f.backFields.filter((k) => k !== key)
          : [...f.backFields, key];
        const newPlacements = f.backFieldPlacements.map((fp) =>
          fp.key === key ? { ...fp, visible: newFields.includes(key) } : fp,
        );
        return { ...f, backFields: newFields, backFieldPlacements: newPlacements };
      });
    } else {
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
  }

  function updatePlacement(key: string, updates: Partial<FieldPlacement>) {
    if (cardSide === "back") {
      setForm((f) => ({
        ...f,
        backFieldPlacements: f.backFieldPlacements.map((fp) =>
          fp.key === key ? { ...fp, ...updates } : fp,
        ),
      }));
    } else {
      setForm((f) => ({
        ...f,
        fieldPlacements: f.fieldPlacements.map((fp) =>
          fp.key === key ? { ...fp, ...updates } : fp,
        ),
      }));
    }
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
      backFieldPlacements: defaultBackFieldPlacements(newLayout).map((dfp) => {
        const existing = f.backFieldPlacements.find((fp) => fp.key === dfp.key);
        return existing
          ? { ...dfp, visible: f.backFields.includes(dfp.key), fontColor: existing.fontColor, fontSize: existing.fontSize, fontWeight: existing.fontWeight }
          : { ...dfp, visible: f.backFields.includes(dfp.key) };
      }),
    }));
  }

  const [pendingBgFile, setPendingBgFile] = useState<File | null>(null);
  const [pendingBackBgFile, setPendingBackBgFile] = useState<File | null>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);

  async function handleBackgroundUpload(file: File, side: "front" | "back" = "front") {
    if (!editId) {
      const localUrl = URL.createObjectURL(file);
      if (side === "back") {
        setForm((f) => ({ ...f, backBackgroundImageUrl: localUrl }));
        setPendingBackBgFile(file);
      } else {
        setForm((f) => ({ ...f, backgroundImageUrl: localUrl }));
        setPendingBgFile(file);
      }
      return;
    }

    await uploadBackgroundFile(editId, file, side);
  }

  async function uploadBackgroundFile(templateId: string, file: File, side: "front" | "back") {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("side", side);
      const res = await fetch(`/api/id-card-templates/${templateId}/background`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const updated = await res.json();
      if (side === "back") {
        setForm((f) => ({ ...f, backBackgroundImageUrl: updated.backBackgroundImageUrl ?? "" }));
      } else {
        setForm((f) => ({ ...f, backgroundImageUrl: updated.backgroundImageUrl ?? "" }));
      }
      qc.invalidateQueries({ queryKey: ["/api/id-card-templates"] });
      toast({ title: `${side === "back" ? "Back" : "Front"} background uploaded` });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const canvasLayout = form.layout;
  const canvasW = canvasLayout === "vertical" ? CANVAS_H : CANVAS_W;
  const canvasH = canvasLayout === "vertical" ? CANVAS_W : CANVAS_H;
  const previewScale = 2.1;

  const previewConfig: IdCardTemplateConfig = {
    name: form.name || "Untitled",
    logoUrl: form.logoUrl || null,
    backgroundImageUrl: form.backgroundImageUrl || null,
    backBackgroundImageUrl: form.backBackgroundImageUrl || null,
    fields: form.fields,
    backFields: form.backFields,
    fieldPlacements: form.fieldPlacements,
    backFieldPlacements: form.backFieldPlacements,
    backgroundColor: "#1a1a2e",
    textColor: "#ffffff",
    accentColor: "#16a34a",
    layout: form.layout,
  };

  const currentFields = cardSide === "back" ? form.backFields : form.fields;
  const currentPlacements = cardSide === "back" ? form.backFieldPlacements : form.fieldPlacements;
  const currentAvailableFields = cardSide === "back" ? BACK_AVAILABLE_FIELDS : AVAILABLE_FIELDS;
  const currentBgUrl = cardSide === "back" ? form.backBackgroundImageUrl : form.backgroundImageUrl;

  const selectedPlacement = selectedFieldKey
    ? currentPlacements.find((fp) => fp.key === selectedFieldKey)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            Card Templates
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload predesigned templates and position fields on the card.
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
            const layout = (lc.layout as CardLayout) ?? "horizontal";
            const config: IdCardTemplateConfig = {
              name: t.name,
              logoUrl: t.logoUrl,
              backgroundImageUrl: t.backgroundImageUrl,
              backBackgroundImageUrl: t.backBackgroundImageUrl,
              fields: t.fields,
              backFields: (lc.backFields as string[]) ?? undefined,
              fieldPlacements: (lc.fieldPlacements as FieldPlacement[]) ?? undefined,
              backFieldPlacements: (lc.backFieldPlacements as FieldPlacement[]) ?? undefined,
              backgroundColor: t.backgroundColor,
              textColor: t.textColor,
              accentColor: t.accentColor,
              layout,
            };
            const hasBack = !!(config.backFields?.length || config.backBackgroundImageUrl);
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
                      {hasBack && (
                        <Badge variant="outline" className="border-zinc-600 text-zinc-400 text-[10px]">2-sided</Badge>
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
        <DialogContent className="max-w-5xl bg-zinc-950 border-zinc-800 text-white max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              {editId ? "Edit Template" : "New ID Card Template"}
            </DialogTitle>
            <DialogDescription className="sr-only">Design your ID card template</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 mt-4">
              <div className="space-y-4 pr-1">
                <div className="space-y-2">
                  <Label className="text-white">Template Name *</Label>
                  <Input
                    data-testid="input-template-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Ramadan 1447 Card"
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
                  <Label className="text-white text-xs uppercase tracking-wider">Card Layout</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {CARD_LAYOUTS.map((l) => (
                      <button
                        key={l.key}
                        type="button"
                        className={`p-2 rounded-md border text-left transition-colors ${
                          form.layout === l.key
                            ? "border-primary bg-primary/10 text-white"
                            : "border-zinc-800 hover:border-zinc-600 text-zinc-400"
                        }`}
                        onClick={() => handleLayoutChange(l.key)}
                        data-testid={`button-layout-${l.key}`}
                      >
                        <div className="text-xs font-medium">{l.label}</div>
                        <div className="text-[10px] opacity-70 mt-0.5">{l.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <Separator className="bg-zinc-800" />

                <div className="flex gap-1 p-1 bg-zinc-900 rounded-lg border border-zinc-800">
                  <button
                    type="button"
                    className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                      cardSide === "front"
                        ? "bg-primary text-primary-foreground"
                        : "text-zinc-400 hover:text-white"
                    }`}
                    onClick={() => { setCardSide("front"); setSelectedFieldKey(null); }}
                    data-testid="button-card-side-front"
                  >
                    Front Side
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                      cardSide === "back"
                        ? "bg-primary text-primary-foreground"
                        : "text-zinc-400 hover:text-white"
                    }`}
                    onClick={() => { setCardSide("back"); setSelectedFieldKey(null); }}
                    data-testid="button-card-side-back"
                  >
                    Back Side
                  </button>
                </div>

                <div className="space-y-2">
                  <Label className="text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" /> {cardSide === "back" ? "Back" : "Front"} Background
                  </Label>
                  <p className="text-[11px] text-zinc-500">
                    Upload a predesigned card image (PNG/JPG). Fields will overlay on top.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-zinc-700 gap-1.5 flex-1"
                      onClick={() => cardSide === "back" ? backFileInputRef.current?.click() : fileInputRef.current?.click()}
                      disabled={uploading}
                      data-testid="button-upload-background"
                    >
                      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {currentBgUrl ? "Change Image" : "Upload Image"}
                    </Button>
                    {currentBgUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 h-8 px-2"
                        onClick={() => {
                          if (cardSide === "back") {
                            setForm((f) => ({ ...f, backBackgroundImageUrl: "" }));
                          } else {
                            setForm((f) => ({ ...f, backgroundImageUrl: "" }));
                          }
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
                      if (file) handleBackgroundUpload(file, "front");
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={backFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleBackgroundUpload(file, "back");
                      e.target.value = "";
                    }}
                  />
                  {currentBgUrl && (
                    <div className="text-xs text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Background image loaded
                    </div>
                  )}
                </div>

                <Separator className="bg-zinc-800" />

                <div className="space-y-2">
                  <Label className="text-white text-xs uppercase tracking-wider">
                    {cardSide === "back" ? "Back" : "Front"} Fields
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
                        <span className="text-sm text-zinc-300 flex-1">{f.label}</span>
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
                        Field: {[...AVAILABLE_FIELDS, ...BACK_AVAILABLE_FIELDS].find((f) => f.key === selectedPlacement.key)?.label}
                      </Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-zinc-400 text-xs">Font Size</Label>
                          <Input
                            type="number"
                            min={6}
                            max={28}
                            value={selectedPlacement.fontSize}
                            onChange={(e) =>
                              updatePlacement(selectedPlacement.key, { fontSize: Number(e.target.value) || 10 })
                            }
                            className="bg-zinc-900 border-zinc-700 text-white h-8 text-xs"
                            data-testid="input-field-font-size"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-zinc-400 text-xs">Font Weight</Label>
                          <Select
                            value={String(selectedPlacement.fontWeight)}
                            onValueChange={(v) => updatePlacement(selectedPlacement.key, { fontWeight: Number(v) })}
                          >
                            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="400">Normal</SelectItem>
                              <SelectItem value="500">Medium</SelectItem>
                              <SelectItem value="600">Semibold</SelectItem>
                              <SelectItem value="700">Bold</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-zinc-400 text-xs">Font Color</Label>
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
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-zinc-400 text-xs">Text Alignment</Label>
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
                              {align.charAt(0).toUpperCase() + align.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-zinc-400 text-xs">X</Label>
                          <Input
                            type="number"
                            min={0}
                            max={canvasW - selectedPlacement.w}
                            value={selectedPlacement.x}
                            onChange={(e) => updatePlacement(selectedPlacement.key, { x: Math.max(0, Math.min(canvasW - selectedPlacement.w, Number(e.target.value) || 0)) })}
                            className="bg-zinc-900 border-zinc-700 text-white h-7 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-zinc-400 text-xs">Y</Label>
                          <Input
                            type="number"
                            min={0}
                            max={canvasH - selectedPlacement.h}
                            value={selectedPlacement.y}
                            onChange={(e) => updatePlacement(selectedPlacement.key, { y: Math.max(0, Math.min(canvasH - selectedPlacement.h, Number(e.target.value) || 0)) })}
                            className="bg-zinc-900 border-zinc-700 text-white h-7 text-xs"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-zinc-400 text-xs">Width</Label>
                          <Input
                            type="number"
                            value={selectedPlacement.w}
                            onChange={(e) => updatePlacement(selectedPlacement.key, { w: Math.max(30, Math.min(canvasW - selectedPlacement.x, Number(e.target.value) || 30)) })}
                            className="bg-zinc-900 border-zinc-700 text-white h-7 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-zinc-400 text-xs">Height</Label>
                          <Input
                            type="number"
                            value={selectedPlacement.h}
                            onChange={(e) => updatePlacement(selectedPlacement.key, { h: Math.max(14, Math.min(canvasH - selectedPlacement.y, Number(e.target.value) || 14)) })}
                            className="bg-zinc-900 border-zinc-700 text-white h-7 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-3">
                <Label className="text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" /> Interactive Preview — {cardSide === "back" ? "Back" : "Front"}
                </Label>
                <p className="text-[11px] text-zinc-500">
                  Drag fields to reposition them. Click a field to select it and adjust its properties.
                </p>

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
                      const allFields = [...AVAILABLE_FIELDS, ...BACK_AVAILABLE_FIELDS];
                      const fieldDef = allFields.find((f) => f.key === fp.key);
                      let sampleVal = "";
                      if (cardSide === "back") {
                        sampleVal = fp.key === "qrCode" ? "QR" : (BACK_SAMPLE_DATA[fp.key] ?? "");
                      } else {
                        sampleVal = fp.key === "photo"
                          ? (SAMPLE_EMPLOYEE.fullName?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() ?? "")
                          : (SAMPLE_EMPLOYEE as Record<string, unknown>)[fp.key] as string || "";
                      }
                      return (
                        <DraggableField
                          key={fp.key}
                          fp={fp}
                          label={fieldDef?.label ?? fp.key}
                          sampleValue={sampleVal}
                          scale={previewScale}
                          selected={selectedFieldKey === fp.key}
                          canvasW={canvasW}
                          canvasH={canvasH}
                          onSelect={() => setSelectedFieldKey(fp.key)}
                          onDragEnd={(x, y) => updatePlacement(fp.key, { x, y })}
                          onResize={(w, h) => updatePlacement(fp.key, { w, h })}
                        />
                      );
                    })}
                  </div>
                </div>

                <p className="text-xs text-zinc-500 text-center">
                  CR-80 size: 85.6mm x 54mm — {cardSide === "back" ? "Back side" : "Front side"}
                </p>

                <Separator className="bg-zinc-800" />

                <div className="space-y-2">
                  <Label className="text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" /> Print Preview
                  </Label>
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex items-center justify-center gap-6 flex-wrap">
                    <div className="space-y-1 text-center">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Front</p>
                      <div dangerouslySetInnerHTML={{ __html: renderIdCardHTML(previewConfig, SAMPLE_EMPLOYEE, 1.0) }} />
                    </div>
                    <div className="space-y-1 text-center">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Back</p>
                      <div dangerouslySetInnerHTML={{ __html: renderBackSideHTML(previewConfig, 1.0) }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 flex justify-end gap-2 pt-4 border-t border-zinc-800 mt-4">
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
  const [form, setForm] = useState({ name: "", type: "zebra_browser_print", config: {} as Record<string, string> });

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
      setForm({ name: "", type: "zebra_browser_print", config: {} });
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

  const selectedPluginType = PLUGIN_TYPES.find((pt) => pt.value === form.type);

  function handleCreate() {
    if (!form.name.trim()) {
      toast({ title: "Plugin name is required", variant: "destructive" });
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <PlugZap className="h-4 w-4 text-primary" />
            Printer Plugins
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure printer plugins for direct card printing. Zebra and Evolis printers are supported.
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
                      <Badge variant="outline" className="text-xs text-zinc-400">
                        {PLUGIN_TYPES.find((pt) => pt.value === p.type)?.label || p.type}
                      </Badge>
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
                placeholder="e.g. Evolis Primacy 2"
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white">Printer Type</Label>
              <Select value={form.type} onValueChange={handleTypeChange}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white" data-testid="select-printer-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLUGIN_TYPES.map((pt) => (
                    <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPluginType && (
                <p className="text-[11px] text-zinc-500">{selectedPluginType.description}</p>
              )}
            </div>

            {selectedPluginType && selectedPluginType.configFields.length > 0 && (
              <>
                <Separator className="bg-zinc-800" />
                <div className="space-y-3">
                  <Label className="text-white text-xs uppercase tracking-wider">Connection Settings</Label>
                  {selectedPluginType.configFields.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <Label className="text-zinc-400 text-xs">{field.label}</Label>
                      {field.type === "select" && "options" in field ? (
                        <Select
                          value={form.config[field.key] || ""}
                          onValueChange={(v) => setForm((f) => ({ ...f, config: { ...f.config, [field.key]: v } }))}
                        >
                          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white h-8 text-xs">
                            <SelectValue placeholder={field.placeholder} />
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
                          placeholder={field.placeholder}
                          className="bg-zinc-900 border-zinc-700 text-white h-8 text-xs"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

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
