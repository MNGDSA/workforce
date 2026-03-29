import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import DashboardLayout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  CreditCard,
  Printer,
  History,
  Palette,
  Eye,
} from "lucide-react";
import { IdCardPreview, DEFAULT_FIELDS, SAMPLE_EMPLOYEE, type CardEmployeeData } from "@/lib/card-renderer";
import type { IdCardTemplate, IdCardPrintLog } from "@shared/schema";

type FieldConfig = { key: string; label: string; enabled: boolean };

function TemplateDesigner({
  open,
  onOpenChange,
  editTemplate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editTemplate?: IdCardTemplate | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [name, setName] = useState(editTemplate?.name || "");
  const [backgroundColor, setBackgroundColor] = useState(editTemplate?.backgroundColor || "#0f5a3a");
  const [textColor, setTextColor] = useState(editTemplate?.textColor || "#ffffff");
  const [logoUrl, setLogoUrl] = useState(editTemplate?.logoUrl || "");
  const [eventId, setEventId] = useState(editTemplate?.eventId || "");
  const [fields, setFields] = useState<FieldConfig[]>(() => {
    const f = editTemplate?.fields as FieldConfig[] | undefined;
    return Array.isArray(f) && f.length > 0 ? f : [...DEFAULT_FIELDS];
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
    queryFn: () => apiRequest("GET", "/api/events").then(r => r.json()),
  });

  const previewTemplate = {
    name,
    backgroundColor,
    textColor,
    logoUrl,
    fields,
    layoutConfig: {},
  };

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/id-card-templates", {
        name,
        backgroundColor,
        textColor,
        logoUrl: logoUrl || null,
        eventId: eventId || null,
        fields,
        layoutConfig: {},
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/id-card-templates"] });
      toast({ title: "Template created" });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/id-card-templates/${editTemplate!.id}`, {
        name,
        backgroundColor,
        textColor,
        logoUrl: logoUrl || null,
        eventId: eventId || null,
        fields,
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/id-card-templates"] });
      toast({ title: "Template updated" });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleField = (key: string) => {
    setFields(prev => prev.map(f => f.key === key ? { ...f, enabled: !f.enabled } : f));
  };

  const moveField = (idx: number, dir: -1 | 1) => {
    const next = [...fields];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setFields(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="template-designer-title">
            {editTemplate ? "Edit Template" : "Create ID Card Template"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input
                data-testid="input-template-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Ramadan 1447 Card"
              />
            </div>

            <div>
              <Label>Event (optional)</Label>
              <select
                data-testid="select-template-event"
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={eventId}
                onChange={e => setEventId(e.target.value)}
              >
                <option value="">All Events (Global)</option>
                {events.map((ev: any) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Background Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={e => setBackgroundColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border"
                  />
                  <Input
                    data-testid="input-bg-color"
                    value={backgroundColor}
                    onChange={e => setBackgroundColor(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
              <div>
                <Label>Text Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={textColor}
                    onChange={e => setTextColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border"
                  />
                  <Input
                    data-testid="input-text-color"
                    value={textColor}
                    onChange={e => setTextColor(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label>Logo URL (optional)</Label>
              <Input
                data-testid="input-logo-url"
                value={logoUrl}
                onChange={e => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
              />
            </div>

            <div>
              <Label className="mb-2 block">Card Fields</Label>
              <div className="space-y-1.5 border rounded-md p-3">
                {fields.map((f, idx) => (
                  <div
                    key={f.key}
                    className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <Switch
                        data-testid={`toggle-field-${f.key}`}
                        checked={f.enabled}
                        onCheckedChange={() => toggleField(f.key)}
                      />
                      <span className="text-sm">{f.label}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => moveField(idx, -1)}
                        disabled={idx === 0}
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => moveField(idx, 1)}
                        disabled={idx === fields.length - 1}
                      >
                        ↓
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Live Preview</Label>
            <div className="flex items-center justify-center p-6 bg-muted/30 rounded-lg min-h-[300px]">
              <IdCardPreview template={previewTemplate} employee={SAMPLE_EMPLOYEE} scale={1.2} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            data-testid="button-save-template"
            onClick={() => editTemplate ? updateMut.mutate() : createMut.mutate()}
            disabled={!name || createMut.isPending || updateMut.isPending}
          >
            {editTemplate ? "Update Template" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrintLogTable() {
  const { data: logs = [] } = useQuery<IdCardPrintLog[]>({
    queryKey: ["/api/id-card-print-logs"],
    queryFn: () => apiRequest("GET", "/api/id-card-print-logs?limit=100").then(r => r.json()),
  });

  const { data: workforceData = [] } = useQuery<any[]>({
    queryKey: ["/api/workforce"],
    queryFn: () => apiRequest("GET", "/api/workforce").then(r => r.json()),
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest("GET", "/api/users").then(r => r.json()),
  });

  const empMap = new Map(workforceData.map((e: any) => [e.id, e]));
  const userMap = new Map(users.map((u: any) => [u.id, u]));

  if (logs.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <History className="mx-auto h-10 w-10 mb-3 opacity-40" />
        <p>No print history yet</p>
        <p className="text-sm mt-1">Print logs will appear here once ID cards are printed</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left p-3 font-medium">Employee</th>
            <th className="text-left p-3 font-medium">Printed By</th>
            <th className="text-left p-3 font-medium">Date</th>
            <th className="text-left p-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const emp = empMap.get(log.employeeId || "");
            const user = userMap.get(log.printedBy || "");
            return (
              <tr key={log.id} className="border-t hover:bg-muted/30" data-testid={`print-log-${log.id}`}>
                <td className="p-3">
                  {emp ? (emp.fullNameEn || emp.employeeNumber) : (log.employeeId || "—")}
                </td>
                <td className="p-3">
                  {user ? (user.fullName || user.username) : (log.printedBy || "System")}
                </td>
                <td className="p-3">
                  {log.printedAt ? new Date(log.printedAt).toLocaleString() : "—"}
                </td>
                <td className="p-3">
                  <Badge variant={log.status === "completed" ? "default" : "destructive"} className="text-xs">
                    {log.status}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PrinterPluginManager() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: plugins = [] } = useQuery<any[]>({
    queryKey: ["/api/printer-plugins"],
    queryFn: () => apiRequest("GET", "/api/printer-plugins").then(r => r.json()),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [pluginName, setPluginName] = useState("");
  const [pluginType, setPluginType] = useState("zebra_browser_print");
  const [pluginDesc, setPluginDesc] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/printer-plugins", {
        name: pluginName,
        type: pluginType,
        description: pluginDesc || null,
        pluginConfig: getDefaultConfig(pluginType),
        isActive: false,
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/printer-plugins"] });
      toast({ title: "Printer plugin added" });
      setShowAdd(false);
      setPluginName("");
      setPluginDesc("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/printer-plugins/${id}/activate`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/printer-plugins"] });
      toast({ title: "Printer plugin activated" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/printer-plugins/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/printer-plugins"] });
      toast({ title: "Printer plugin removed" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configure printer plugins for direct card printing. Without a plugin, cards print via browser dialog.
        </p>
        <Button
          data-testid="button-add-printer-plugin"
          size="sm"
          onClick={() => setShowAdd(true)}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Plugin
        </Button>
      </div>

      {plugins.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 border rounded-lg">
          <Printer className="mx-auto h-10 w-10 mb-3 opacity-40" />
          <p>No printer plugins configured</p>
          <p className="text-sm mt-1">Cards will print using the browser print dialog (fallback)</p>
        </div>
      ) : (
        <div className="space-y-2">
          {plugins.map((p: any) => (
            <div
              key={p.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30"
              data-testid={`printer-plugin-${p.id}`}
            >
              <div className="flex items-center gap-3">
                <Printer className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="font-medium text-sm">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.type} {p.description ? `— ${p.description}` : ""}</div>
                </div>
                {p.isActive && <Badge className="text-xs bg-green-600">Active</Badge>}
              </div>
              <div className="flex gap-2">
                {!p.isActive && (
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`activate-plugin-${p.id}`}
                    onClick={() => activateMut.mutate(p.id)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Activate
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => deleteMut.mutate(p.id)}
                  data-testid={`delete-plugin-${p.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Printer Plugin</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Plugin Name</Label>
              <Input
                data-testid="input-plugin-name"
                value={pluginName}
                onChange={e => setPluginName(e.target.value)}
                placeholder="e.g. Office Zebra Printer"
              />
            </div>
            <div>
              <Label>Printer Type</Label>
              <select
                data-testid="select-plugin-type"
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={pluginType}
                onChange={e => setPluginType(e.target.value)}
              >
                <option value="zebra_browser_print">Zebra Browser Print SDK</option>
                <option value="browser_fallback">Browser Print Dialog (Fallback)</option>
              </select>
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input
                data-testid="input-plugin-desc"
                value={pluginDesc}
                onChange={e => setPluginDesc(e.target.value)}
                placeholder="e.g. Zebra ZC300 in HR Office"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              data-testid="button-save-plugin"
              onClick={() => createMut.mutate()}
              disabled={!pluginName || createMut.isPending}
            >
              Add Plugin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getDefaultConfig(type: string) {
  if (type === "zebra_browser_print") {
    return {
      sdkUrl: "https://localhost:9100",
      printerName: "",
      cardWidth: 1012,
      cardHeight: 636,
    };
  }
  return {};
}

export default function IdCardsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showDesigner, setShowDesigner] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<IdCardTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<IdCardTemplate | null>(null);

  const { data: templates = [] } = useQuery<IdCardTemplate[]>({
    queryKey: ["/api/id-card-templates"],
    queryFn: () => apiRequest("GET", "/api/id-card-templates").then(r => r.json()),
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/id-card-templates/${id}/activate`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/id-card-templates"] });
      toast({ title: "Template activated" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/id-card-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/id-card-templates"] });
      toast({ title: "Template deleted" });
    },
  });

  const handleEdit = (t: IdCardTemplate) => {
    setEditingTemplate(t);
    setShowDesigner(true);
  };

  const handleNew = () => {
    setEditingTemplate(null);
    setShowDesigner(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">ID Cards</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Design card templates, manage printers, and track print history
            </p>
          </div>
          <Button data-testid="button-new-template" onClick={handleNew}>
            <Plus className="h-4 w-4 mr-2" /> New Template
          </Button>
        </div>

        <Tabs defaultValue="templates" className="space-y-4">
          <TabsList>
            <TabsTrigger value="templates" data-testid="tab-templates">
              <Palette className="h-4 w-4 mr-1.5" /> Templates
            </TabsTrigger>
            <TabsTrigger value="printers" data-testid="tab-printers">
              <Printer className="h-4 w-4 mr-1.5" /> Printers
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">
              <History className="h-4 w-4 mr-1.5" /> Print History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="templates">
            {templates.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <CreditCard className="h-12 w-12 text-muted-foreground/40 mb-4" />
                  <h3 className="text-lg font-semibold mb-1">No ID Card Templates</h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Create your first template to start printing employee ID cards
                  </p>
                  <Button data-testid="button-create-first-template" onClick={handleNew}>
                    <Plus className="h-4 w-4 mr-2" /> Create Template
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {templates.map(t => (
                  <Card key={t.id} className="overflow-hidden" data-testid={`template-card-${t.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{t.name}</CardTitle>
                        <div className="flex items-center gap-1">
                          {t.isActive && <Badge className="text-xs bg-green-600">Active</Badge>}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div
                        className="flex justify-center p-3 bg-muted/30 rounded-lg cursor-pointer"
                        onClick={() => setPreviewTemplate(t)}
                      >
                        <IdCardPreview template={t} employee={SAMPLE_EMPLOYEE} scale={0.75} />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setPreviewTemplate(t)}
                          data-testid={`preview-template-${t.id}`}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleEdit(t)}
                          data-testid={`edit-template-${t.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                        {!t.isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => activateMut.mutate(t.id)}
                            data-testid={`activate-template-${t.id}`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {!t.isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => deleteMut.mutate(t.id)}
                            data-testid={`delete-template-${t.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="printers">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Printer Plugins</CardTitle>
              </CardHeader>
              <CardContent>
                <PrinterPluginManager />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Print Audit Log</CardTitle>
              </CardHeader>
              <CardContent>
                <PrintLogTable />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {showDesigner && (
        <TemplateDesigner
          open={showDesigner}
          onOpenChange={(v) => {
            setShowDesigner(v);
            if (!v) setEditingTemplate(null);
          }}
          editTemplate={editingTemplate}
        />
      )}

      {previewTemplate && (
        <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Card Preview — {previewTemplate.name}</DialogTitle>
            </DialogHeader>
            <div className="flex justify-center p-6 bg-muted/30 rounded-lg">
              <IdCardPreview template={previewTemplate} employee={SAMPLE_EMPLOYEE} scale={1.4} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
