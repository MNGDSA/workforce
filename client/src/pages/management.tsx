// Task #281 — Management directory: lists managers (people who supervise
// workers but do not appear on the workforce list themselves), with create /
// edit / deactivate / reactivate flows and a two-pass Excel importer.
//
// Shape conventions:
// - Drawer mounts via Sheet from the design system (createPortal under the
//   hood), respecting the floating-UI rule from the project goal.
// - All numbers render via formatNumber so Arabic locale stays western 0–9.
// - The list query mirrors GET /api/managers's contract: { data, total }.

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UserCog,
  Plus,
  Pencil,
  Loader2,
  Power,
  PowerOff,
  Search,
  Upload,
  Download,
  Trash2,
  Phone,
  Mail,
} from "lucide-react";
import { apiRequest, isApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/lib/format";

type Manager = {
  id: string;
  fullNameEn: string;
  fullNameAr: string | null;
  email: string | null;
  phone: string;
  whatsapp: string | null;
  jisrEmployeeId: string | null;
  departmentId: string | null;
  positionId: string | null;
  reportsToManagerId: string | null;
  isActive: boolean;
  notes: string | null;
  departmentName: string | null;
  positionTitle: string | null;
  reportsToName: string | null;
  directWorkerCount: number;
  directManagerCount: number;
};

type ManagersResp = { data: Manager[]; total: number };
type Department = { id: string; name: string; isActive: boolean };
type Position = { id: string; title: string; departmentId: string; isActive: boolean };

type FormState = {
  fullNameEn: string;
  fullNameAr: string;
  title: string;
  email: string;
  phone: string;
  whatsapp: string;
  jisrEmployeeId: string;
  departmentId: string | null;
  positionId: string | null;
  reportsToManagerId: string | null;
  notes: string;
  isActive: boolean;
};

const EMPTY: FormState = {
  fullNameEn: "",
  fullNameAr: "",
  title: "",
  email: "",
  phone: "",
  whatsapp: "",
  jisrEmployeeId: "",
  departmentId: null,
  positionId: null,
  reportsToManagerId: null,
  notes: "",
  isActive: true,
};

function nullify(s: string): string | null {
  const t = s.trim();
  return t.length === 0 ? null : t;
}

export default function ManagementPage() {
  const { t, i18n } = useTranslation(["management", "common"]);
  const isAr = i18n.dir() === "rtl";
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [departmentFilter, setDepartmentFilter] = useState<string>("__all__");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const [importOpen, setImportOpen] = useState(false);

  // Reassign-on-deactivate dialog state. Driven by the 409 HAS_REPORTS body
  // returned by DELETE /api/managers/:id.
  const [reassignDialog, setReassignDialog] = useState<
    | null
    | {
        managerId: string;
        managerName: string;
        workerCount: number;
        subManagerCount: number;
      }
  >(null);
  const [reassignMode, setReassignMode] = useState<"reassign" | "orphan">("reassign");
  const [reassignTargetId, setReassignTargetId] = useState<string | null>(null);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set("search", search.trim());
    if (statusFilter !== "all") p.set("status", statusFilter);
    else p.set("status", "all");
    if (departmentFilter !== "__all__") p.set("departmentId", departmentFilter);
    p.set("limit", "200");
    return p.toString();
  }, [search, statusFilter, departmentFilter]);

  const managersQuery = useQuery<ManagersResp>({
    queryKey: ["/api/managers", queryParams],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/managers?${queryParams}`);
      return res.json();
    },
  });

  const deptsQuery = useQuery<Department[]>({
    queryKey: ["/api/departments"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/departments");
      return res.json();
    },
  });

  const positionsQuery = useQuery<Position[]>({
    queryKey: ["/api/positions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/positions");
      return res.json();
    },
  });

  // Used for the "Reports To" picker. Only active managers shown, and we
  // also strip the manager being edited (a manager cannot report to itself).
  const managerOptionsQuery = useQuery<ManagersResp>({
    queryKey: ["/api/managers", "options"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/managers?status=active&limit=200");
      return res.json();
    },
    staleTime: 30_000,
  });

  const managers = managersQuery.data?.data ?? [];
  const departments = deptsQuery.data ?? [];
  const positions = positionsQuery.data ?? [];
  const positionsForDept = useMemo(
    () => positions.filter((p) => !form.departmentId || p.departmentId === form.departmentId),
    [positions, form.departmentId],
  );
  const managerOptions = (managerOptionsQuery.data?.data ?? []).filter(
    (m) => !editingId || m.id !== editingId,
  );

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setDrawerOpen(true);
  }

  function openEdit(m: Manager) {
    setEditingId(m.id);
    setForm({
      fullNameEn: m.fullNameEn,
      fullNameAr: m.fullNameAr ?? "",
      title: "",
      email: m.email ?? "",
      phone: m.phone,
      whatsapp: m.whatsapp ?? "",
      jisrEmployeeId: m.jisrEmployeeId ?? "",
      departmentId: m.departmentId,
      positionId: m.positionId,
      reportsToManagerId: m.reportsToManagerId,
      notes: m.notes ?? "",
      isActive: m.isActive,
    });
    setDrawerOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        fullNameEn: form.fullNameEn.trim(),
        fullNameAr: nullify(form.fullNameAr),
        email: nullify(form.email),
        phone: form.phone.trim(),
        whatsapp: nullify(form.whatsapp),
        jisrEmployeeId: nullify(form.jisrEmployeeId),
        departmentId: form.departmentId,
        positionId: form.positionId,
        reportsToManagerId: form.reportsToManagerId,
        notes: nullify(form.notes),
        isActive: form.isActive,
      };
      if (editingId) {
        const res = await apiRequest("PATCH", `/api/managers/${editingId}`, body);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/managers", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("management:actions.saved") });
      setDrawerOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/managers"] });
    },
    onError: (err: any) => {
      toast({
        title: t("management:errors.generic"),
        description: err?.message ?? "",
        variant: "destructive",
      });
    },
  });

  const deactivateMutation = useMutation({
    // Pass extra opts so the same mutation can resubmit with reassignTo /
    // orphan after the conflict dialog is resolved.
    mutationFn: async (vars: {
      id: string;
      managerName: string;
      reassignTo?: string | null;
      orphan?: boolean;
    }) => {
      const qs = new URLSearchParams();
      if (vars.reassignTo) qs.set("reassignTo", vars.reassignTo);
      if (vars.orphan) qs.set("orphan", "true");
      const url = `/api/managers/${vars.id}${qs.toString() ? `?${qs.toString()}` : ""}`;
      const res = await apiRequest("DELETE", url);
      return res.json();
    },
    onSuccess: () => {
      setReassignDialog(null);
      toast({ title: t("management:actions.deactivated") });
      qc.invalidateQueries({ queryKey: ["/api/managers"] });
    },
    onError: (err: unknown, vars) => {
      // 409 HAS_REPORTS → open the reassign/orphan dialog so the operator
      // can decide how to handle the orphans before retrying.
      if (isApiError(err) && err.status === 409) {
        const body = err.body as { code?: string; workerCount?: number; subManagerCount?: number } | null;
        if (body && body.code === "HAS_REPORTS") {
          setReassignDialog({
            managerId: vars.id,
            managerName: vars.managerName,
            workerCount: body.workerCount ?? 0,
            subManagerCount: body.subManagerCount ?? 0,
          });
          setReassignMode("reassign");
          setReassignTargetId(null);
          return;
        }
      }
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: t("management:errors.generic"), description: msg, variant: "destructive" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/managers/${id}/reactivate`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("management:actions.reactivated") });
      qc.invalidateQueries({ queryKey: ["/api/managers"] });
    },
  });

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4" data-testid="page-management">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
              <UserCog className="w-6 h-6" /> {t("management:title")}
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl mt-1">
              {t("management:subtitle")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setImportOpen(true)}
              data-testid="button-open-import"
            >
              <Upload className="w-4 h-4 me-2" />
              {t("management:importBtn")}
            </Button>
            <Button onClick={openCreate} data-testid="button-add-manager">
              <Plus className="w-4 h-4 me-2" />
              {t("management:addManager")}
            </Button>
          </div>
        </header>

        <Card>
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("management:search")}
                className="ps-9"
                data-testid="input-search"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-[140px]" data-testid="select-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t("management:filterActive")}</SelectItem>
                <SelectItem value="inactive">{t("management:filterInactive")}</SelectItem>
                <SelectItem value="all">{t("management:filterAll")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-department-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("management:filterAll")}</SelectItem>
                {departments.filter((d) => d.isActive).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {managersQuery.isLoading ? (
              <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> {t("management:loading")}
              </div>
            ) : managers.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground" data-testid="text-empty">
                {search.trim() || statusFilter !== "active" || departmentFilter !== "__all__"
                  ? t("management:noResults")
                  : t("management:noManagers")}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-start text-xs uppercase text-muted-foreground border-b border-border">
                      <th className="p-3 text-start">{t("management:columns.name")}</th>
                      <th className="p-3 text-start hidden md:table-cell">{t("management:columns.department")}</th>
                      <th className="p-3 text-start hidden md:table-cell">{t("management:columns.reportsTo")}</th>
                      <th className="p-3 text-start hidden lg:table-cell">{t("management:columns.phone")}</th>
                      <th className="p-3 text-center">{t("management:columns.directReports")}</th>
                      <th className="p-3 text-center">{t("management:columns.workersUnder")}</th>
                      <th className="p-3 text-center">{t("management:columns.status")}</th>
                      <th className="p-3 text-end">{t("management:columns.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managers.map((m) => {
                      const display = isAr ? (m.fullNameAr || m.fullNameEn) : m.fullNameEn;
                      return (
                        <tr
                          key={m.id}
                          className={`border-b border-border/50 hover:bg-muted/30 ${!m.isActive ? "opacity-60" : ""}`}
                          data-testid={`row-manager-${m.id}`}
                        >
                          <td className="p-3">
                            <div className="font-medium text-white"><bdi>{display}</bdi></div>
                            {m.email && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Mail className="w-3 h-3" /> <span dir="ltr">{m.email}</span>
                              </div>
                            )}
                          </td>
                          <td className="p-3 hidden md:table-cell text-muted-foreground">
                            <bdi>{m.departmentName ?? "—"}</bdi>
                          </td>
                          <td className="p-3 hidden md:table-cell text-muted-foreground">
                            <bdi>{m.reportsToName ?? "—"}</bdi>
                          </td>
                          <td className="p-3 hidden lg:table-cell text-muted-foreground" dir="ltr">
                            {m.phone}
                          </td>
                          <td className="p-3 text-center" data-testid={`text-direct-managers-${m.id}`}>
                            {formatNumber(m.directManagerCount, i18n.language)}
                          </td>
                          <td className="p-3 text-center" data-testid={`text-direct-workers-${m.id}`}>
                            {formatNumber(m.directWorkerCount, i18n.language)}
                          </td>
                          <td className="p-3 text-center">
                            <Badge variant={m.isActive ? "default" : "secondary"}>
                              {m.isActive ? t("management:status.active") : t("management:status.inactive")}
                            </Badge>
                          </td>
                          <td className="p-3 text-end">
                            <div className="inline-flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEdit(m)}
                                data-testid={`button-edit-${m.id}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {m.isActive ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={deactivateMutation.isPending}
                                  onClick={() =>
                                    deactivateMutation.mutate({
                                      id: m.id,
                                      managerName: m.fullNameEn,
                                    })
                                  }
                                  data-testid={`button-deactivate-${m.id}`}
                                >
                                  <PowerOff className="w-4 h-4" />
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={reactivateMutation.isPending}
                                  onClick={() => reactivateMutation.mutate(m.id)}
                                  data-testid={`button-reactivate-${m.id}`}
                                >
                                  <Power className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create / Edit drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg w-full">
          <SheetHeader>
            <SheetTitle>
              {editingId ? t("management:drawer.edit") : t("management:drawer.create")}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {editingId ? t("management:drawer.edit") : t("management:drawer.create")}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label>{t("management:form.fullNameEn")}</Label>
              <Input
                value={form.fullNameEn}
                onChange={(e) => setForm({ ...form, fullNameEn: e.target.value })}
                dir="ltr"
                data-testid="input-full-name-en"
              />
            </div>
            <div>
              <Label>{t("management:form.fullNameAr")}</Label>
              <Input
                value={form.fullNameAr}
                onChange={(e) => setForm({ ...form, fullNameAr: e.target.value })}
                dir="rtl"
                data-testid="input-full-name-ar"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("management:form.phone")}</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  dir="ltr"
                  placeholder="+9665XXXXXXXX"
                  data-testid="input-phone"
                />
              </div>
              <div>
                <Label>{t("management:form.email")}</Label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  dir="ltr"
                  type="email"
                  data-testid="input-email"
                />
              </div>
            </div>
            <div>
              <Label>{t("management:form.department")}</Label>
              <Select
                value={form.departmentId ?? "__none__"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    departmentId: v === "__none__" ? null : v,
                    // Clear position if it no longer matches the new department
                    positionId: null,
                  })
                }
              >
                <SelectTrigger data-testid="select-department">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("management:form.noDept")}</SelectItem>
                  {departments.filter((d) => d.isActive).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("management:form.position")}</Label>
              <Select
                value={form.positionId ?? "__none__"}
                onValueChange={(v) => setForm({ ...form, positionId: v === "__none__" ? null : v })}
              >
                <SelectTrigger data-testid="select-position">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("management:form.noPosition")}</SelectItem>
                  {positionsForDept.filter((p) => p.isActive).map((p) => (
                    <SelectItem key={p.id} value={p.id}><bdi>{p.title}</bdi></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("management:form.reportsTo")}</Label>
              <Select
                value={form.reportsToManagerId ?? "__none__"}
                onValueChange={(v) =>
                  setForm({ ...form, reportsToManagerId: v === "__none__" ? null : v })
                }
              >
                <SelectTrigger data-testid="select-reports-to">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("management:form.noManager")}</SelectItem>
                  {managerOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <bdi>{isAr ? (m.fullNameAr || m.fullNameEn) : m.fullNameEn}</bdi>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("management:form.isActive")}</Label>
              <div className="mt-1">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(c) => setForm({ ...form, isActive: c })}
                  data-testid="switch-is-active"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} data-testid="button-cancel">
                {t("management:drawer.cancel")}
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || form.fullNameEn.trim().length === 0 || form.phone.trim().length === 0}
                data-testid="button-save"
              >
                {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                {t("management:drawer.save")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />

      {/* Reassign-on-deactivate dialog. Opens automatically when DELETE
          /api/managers/:id returns 409 HAS_REPORTS — see deactivateMutation
          onError handler. Confirming resubmits the same mutation with
          `reassignTo` or `orphan` query params. */}
      <Dialog
        open={!!reassignDialog}
        onOpenChange={(o) => {
          if (!o) setReassignDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("management:reassign.title")}</DialogTitle>
            <DialogDescription>
              {reassignDialog
                ? t("management:reassign.description", {
                    name: reassignDialog.managerName,
                    workers: formatNumber(reassignDialog.workerCount),
                    subManagers: formatNumber(reassignDialog.subManagerCount),
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <RadioGroup
              value={reassignMode}
              onValueChange={(v) => setReassignMode(v as "reassign" | "orphan")}
              className="space-y-2"
            >
              <label className="flex items-start gap-2 cursor-pointer">
                <RadioGroupItem
                  value="reassign"
                  id="reassign-opt-reassign"
                  data-testid="radio-reassign-target"
                />
                <div className="flex-1">
                  <div className="text-sm">{t("management:reassign.optionReassign")}</div>
                  {reassignMode === "reassign" && (
                    <Select
                      value={reassignTargetId ?? ""}
                      onValueChange={(v) => setReassignTargetId(v || null)}
                    >
                      <SelectTrigger
                        className="mt-2"
                        data-testid="select-reassign-target"
                      >
                        <SelectValue placeholder={t("management:reassign.pickTarget")} />
                      </SelectTrigger>
                      <SelectContent>
                        {managerOptions
                          .filter((m) => m.id !== reassignDialog?.managerId)
                          .map((m) => (
                            <SelectItem
                              key={m.id}
                              value={m.id}
                              data-testid={`option-reassign-${m.id}`}
                            >
                              {m.fullNameEn}
                              {m.departmentName ? ` · ${m.departmentName}` : ""}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <RadioGroupItem
                  value="orphan"
                  id="reassign-opt-orphan"
                  data-testid="radio-reassign-orphan"
                />
                <div className="flex-1 text-sm">
                  {t("management:reassign.optionOrphan")}
                </div>
              </label>
            </RadioGroup>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setReassignDialog(null)}
                data-testid="button-reassign-cancel"
              >
                {t("common:actions.cancel")}
              </Button>
              <Button
                disabled={
                  deactivateMutation.isPending ||
                  (reassignMode === "reassign" && !reassignTargetId)
                }
                onClick={() => {
                  if (!reassignDialog) return;
                  deactivateMutation.mutate({
                    id: reassignDialog.managerId,
                    managerName: reassignDialog.managerName,
                    reassignTo:
                      reassignMode === "reassign" ? reassignTargetId : undefined,
                    orphan: reassignMode === "orphan" ? true : undefined,
                  });
                }}
                data-testid="button-reassign-confirm"
              >
                {deactivateMutation.isPending && (
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                )}
                {t("management:reassign.confirm")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation(["management", "common"]);
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Array<{ row: number; message: string }>>([]);

  // Reset on close so the next open is fresh.
  useEffect(() => {
    if (!open) {
      setFile(null);
      setErrors([]);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open]);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file");
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/managers/import", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "Upload failed");
      }
      return res.json() as Promise<{
        created: number;
        updated: number;
        skipped: number;
        errors: Array<{ row: number; message: string }>;
      }>;
    },
    onSuccess: (data) => {
      setErrors(data.errors ?? []);
      toast({
        title: t("management:import.successTitle"),
        description: t("management:import.successBody", {
          created: data.created,
          updated: data.updated,
          skipped: data.skipped,
        }),
      });
      qc.invalidateQueries({ queryKey: ["/api/managers"] });
      if ((data.errors ?? []).length === 0) onClose();
    },
    onError: (err: any) => {
      toast({
        title: t("management:import.errorTitle"),
        description: err?.message ?? "",
        variant: "destructive",
      });
    },
  });

  async function downloadTemplate() {
    // Use fetch (not apiRequest) so the binary body streams instead of being
    // JSON-parsed. Cookies must still go.
    const res = await fetch("/api/managers/template", { credentials: "include" });
    if (!res.ok) {
      toast({ title: t("management:errors.generic"), variant: "destructive" });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "managers-import-template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("management:import.title")}</DialogTitle>
          <DialogDescription>{t("management:import.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground">
            {t("management:import.templateHint")}
          </div>
          <Button
            variant="outline"
            onClick={downloadTemplate}
            className="w-full"
            data-testid="button-download-template"
          >
            <Download className="w-4 h-4 me-2" />
            {t("management:downloadTemplate")}
          </Button>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              data-testid="input-file"
            />
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
              {t("management:import.selectFile")}
            </Button>
            <div className="text-xs text-muted-foreground mt-1 truncate" data-testid="text-file-name">
              {file?.name ?? t("management:import.noFile")}
            </div>
          </div>
          {errors.length > 0 && (
            <div className="border border-destructive/40 rounded-md p-2 max-h-40 overflow-y-auto text-xs">
              <div className="font-medium text-destructive mb-1">
                {t("management:import.errors")}
              </div>
              <ul className="space-y-0.5 text-muted-foreground">
                {errors.map((e, idx) => (
                  <li key={idx}>{t("management:import.errorRow", e)}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={onClose}>
              {t("management:drawer.cancel")}
            </Button>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={!file || importMutation.isPending}
              data-testid="button-upload"
            >
              {importMutation.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {importMutation.isPending
                ? t("management:import.uploading")
                : t("management:import.uploadButton")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
