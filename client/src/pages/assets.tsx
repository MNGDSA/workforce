import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Package,
  Plus,
  Pencil,
  Trash2,
  Search,
  RotateCcw,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  PackageCheck,
  PackageX,
  Filter,
  Lock,
  SquareCheck,
  Square,
  X,
  Loader2,
  Users,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/layout";
import { formatNumber } from "@/lib/format";

interface Asset {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  price: string;
  isActive: boolean;
  createdAt: string;
}

interface EmployeeAsset {
  id: string;
  assetId: string;
  workforceId: string;
  assignedAt: string;
  returnedAt?: string | null;
  status: "assigned" | "returned" | "not_returned";
  notes?: string | null;
}

interface WorkforceRow {
  id: string;
  employeeNumber: string;
  fullNameEn?: string | null;
  employmentType: string;
  candidateId: string;
  nationalId?: string | null;
  phone?: string | null;
  eventId?: string | null;
  eventName?: string | null;
  positionId?: string | null;
  positionTitle?: string | null;
  departmentName?: string | null;
}

const CATEGORIES = ["Equipment", "Uniform", "Badge", "Device", "Vehicle", "Tools", "Other"];

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TH = "text-xs font-medium uppercase tracking-wider text-muted-foreground";

function fmtMoney(n: number, _lang: string) {
  return formatNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AssetsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { t, i18n } = useTranslation(["assets", "common"]);
  const lang = i18n.language;

  // ─── Catalog state ─────────────────────────────────────────────────────────
  const [catalogSearch, setCatalogSearch] = useState("");
  const [assetDialog, setAssetDialog] = useState<{ open: boolean; editing?: Asset }>({ open: false });
  const [deleteAssetId, setDeleteAssetId] = useState<string | null>(null);
  const [assetForm, setAssetForm] = useState({ name: "", description: "", category: "", price: "", isActive: true });

  // ─── Assignments state ──────────────────────────────────────────────────────
  const [assignSearch, setAssignSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignForm, setAssignForm] = useState({ workforceId: "", assetId: "", assignedAt: localDate(), notes: "" });
  const [empSearch, setEmpSearch] = useState("");
  const [deleteAssignId, setDeleteAssignId] = useState<string | null>(null);

  // ─── Confirmation dialogs ───────────────────────────────────────────────────
  const [confirmReturn, setConfirmReturn] = useState<{ id: string; assetName: string; empName: string } | null>(null);
  const [confirmLost, setConfirmLost] = useState<{ id: string; assetName: string; empName: string; price: string } | null>(null);

  // ─── Bulk selection ─────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDialog, setBulkDialog] = useState<{ status: "returned" | "not_returned"; count: number; totalValue: number } | null>(null);

  // ─── Bulk assign state ────────────────────────────────────────────────────
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkAssetId, setBulkAssetId] = useState("");
  const [bulkAssignDate, setBulkAssignDate] = useState(localDate());
  const [bulkAssignNotes, setBulkAssignNotes] = useState("");
  const [bulkEmpSearch, setBulkEmpSearch] = useState("");
  const [bulkEventFilter, setBulkEventFilter] = useState("all");
  const [bulkDeptFilter, setBulkDeptFilter] = useState("all");
  const [bulkTypeFilter, setBulkTypeFilter] = useState("all");
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  // ─── Queries ───────────────────────────────────────────────────────────────
  const { data: assetList = [], isLoading: loadingAssets } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
    queryFn: () => apiRequest("GET", "/api/assets?includeInactive=true").then(r => r.json()),
  });

  const { data: assignments = [], isLoading: loadingAssign } = useQuery<EmployeeAsset[]>({
    queryKey: ["/api/employee-assets"],
    queryFn: () => apiRequest("GET", "/api/employee-assets").then(r => r.json()),
  });

  const { data: workforce = [] } = useQuery<WorkforceRow[]>({
    queryKey: ["/api/workforce"],
    queryFn: () => apiRequest("GET", "/api/workforce").then(r => r.json()),
  });

  const { data: activeWorkforce = [] } = useQuery<WorkforceRow[]>({
    queryKey: ["/api/workforce", "active"],
    queryFn: () => apiRequest("GET", "/api/workforce?active=true").then(r => r.json()),
    enabled: bulkAssignOpen,
  });
  const { data: events = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/events"],
    queryFn: () => apiRequest("GET", "/api/events").then(r => r.json()),
    enabled: bulkAssignOpen,
  });
  const { data: departments = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/departments"],
    queryFn: () => apiRequest("GET", "/api/departments").then(r => r.json()),
    enabled: bulkAssignOpen,
  });

  const errToast = (e: any) => toast({ title: t("assets:errGeneric"), description: e.message, variant: "destructive" });

  // ─── Mutations ─────────────────────────────────────────────────────────────
  const createAsset = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/assets", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/assets"] }); setAssetDialog({ open: false }); toast({ title: t("assets:assetDialog.toast.created") }); },
    onError: errToast,
  });
  const updateAsset = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => apiRequest("PATCH", `/api/assets/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/assets"] }); setAssetDialog({ open: false }); toast({ title: t("assets:assetDialog.toast.updated") }); },
    onError: errToast,
  });
  const deleteAsset = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/assets/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/assets"] }); setDeleteAssetId(null); toast({ title: t("assets:assetDialog.toast.deleted") }); },
    onError: errToast,
  });
  const assignAsset = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/employee-assets", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/employee-assets"] }); setAssignDialog(false); toast({ title: t("assets:assignDialog.toast.assigned") }); },
    onError: errToast,
  });
  const updateAssignment = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => apiRequest("PATCH", `/api/employee-assets/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/employee-assets"] }); toast({ title: t("assets:assignDialog.toast.updated") }); },
    onError: errToast,
  });
  const deleteAssignment = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/employee-assets/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/employee-assets"] }); setDeleteAssignId(null); toast({ title: t("assets:assignDialog.toast.removed") }); },
    onError: errToast,
  });

  const bulkStatusMut = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: "returned" | "not_returned" }) =>
      apiRequest("POST", "/api/employee-assets/bulk-status", { ids, status }).then(r => r.json()),
    onSuccess: (data, { ids, status }) => {
      qc.invalidateQueries({ queryKey: ["/api/employee-assets"] });
      setSelectedIds(new Set());
      setBulkDialog(null);
      const count = data?.updated ?? ids.length;
      const key = status === "returned" ? "assets:bulkStatus.toastReturned" : "assets:bulkStatus.toastLost";
      toast({ title: t(key, { count, replace: { n: formatNumber(count, lang) } }) });
    },
    onError: errToast,
  });

  const bulkAssignMut = useMutation({
    mutationFn: (data: { assetId: string; workforceIds: string[]; assignedAt: string; notes?: string }) =>
      apiRequest("POST", "/api/employee-assets/bulk-assign", data).then(r => r.json()),
    onSuccess: (data: { created: number; skipped: number }) => {
      qc.invalidateQueries({ queryKey: ["/api/employee-assets"] });
      const assetName = assetList.find(a => a.id === bulkAssetId)?.name ?? t("assets:assignDialog.lblAsset");
      setBulkConfirmOpen(false);
      setBulkAssignOpen(false);
      setBulkSelectedIds(new Set());
      setBulkAssetId("");
      setBulkAssignNotes("");
      setBulkEmpSearch("");
      setBulkEventFilter("all");
      setBulkDeptFilter("all");
      setBulkTypeFilter("all");
      const main = t("assets:bulkAssign.toast.summary", {
        count: data.created,
        replace: { asset: assetName, created: formatNumber(data.created, lang) },
      });
      const skip = data.skipped > 0
        ? t("assets:bulkAssign.toast.skippedSuffix", { replace: { n: formatNumber(data.skipped, lang) } })
        : "";
      toast({ title: `${main}${skip}` });
    },
    onError: errToast,
  });

  // ─── Derived data ──────────────────────────────────────────────────────────
  const filteredAssets = useMemo(() =>
    assetList.filter(a =>
      !catalogSearch ||
      a.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      (a.category ?? "").toLowerCase().includes(catalogSearch.toLowerCase())
    ), [assetList, catalogSearch]);

  const assetMap = useMemo(() => new Map(assetList.map(a => [a.id, a])), [assetList]);
  const workforceMap = useMemo(() => new Map(workforce.map(w => [w.id, w])), [workforce]);

  const filteredAssignments = useMemo(() =>
    assignments.filter(a => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (!assignSearch) return true;
      const emp = workforceMap.get(a.workforceId);
      const asset = assetMap.get(a.assetId);
      const q = assignSearch.toLowerCase();
      return (
        (emp?.fullNameEn ?? "").toLowerCase().includes(q) ||
        (emp?.employeeNumber ?? "").toLowerCase().includes(q) ||
        (emp?.nationalId ?? "").toLowerCase().includes(q) ||
        (emp?.phone ?? "").toLowerCase().includes(q) ||
        (asset?.name ?? "").toLowerCase().includes(q)
      );
    }), [assignments, statusFilter, assignSearch, workforceMap, assetMap]);

  const filteredEmployees = useMemo(() =>
    workforce.filter(w => {
      if (!empSearch) return true;
      const q = empSearch.toLowerCase();
      return (
        (w.fullNameEn ?? "").toLowerCase().includes(q) ||
        w.employeeNumber.toLowerCase().includes(q) ||
        (w.nationalId ?? "").toLowerCase().includes(q) ||
        (w.phone ?? "").toLowerCase().includes(q)
      );
    }).slice(0, 40), [workforce, empSearch]);

  const bulkFilteredEmployees = useMemo(() =>
    activeWorkforce.filter(w => {
      if (bulkEventFilter !== "all" && w.eventId !== bulkEventFilter) return false;
      if (bulkDeptFilter !== "all" && (w.departmentName ?? "") !== bulkDeptFilter) return false;
      if (bulkTypeFilter !== "all" && w.employmentType !== bulkTypeFilter) return false;
      if (bulkEmpSearch) {
        const q = bulkEmpSearch.toLowerCase();
        if (
          !(w.fullNameEn ?? "").toLowerCase().includes(q) &&
          !w.employeeNumber.toLowerCase().includes(q) &&
          !(w.nationalId ?? "").toLowerCase().includes(q) &&
          !(w.phone ?? "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    }), [activeWorkforce, bulkEventFilter, bulkDeptFilter, bulkTypeFilter, bulkEmpSearch]);

  const bulkAllSelected = bulkFilteredEmployees.length > 0 && bulkFilteredEmployees.every(w => bulkSelectedIds.has(w.id));
  const bulkSomeSelected = bulkFilteredEmployees.some(w => bulkSelectedIds.has(w.id));
  const deptOptions = useMemo(() => {
    const names = new Set(activeWorkforce.map(w => w.departmentName).filter(Boolean) as string[]);
    return Array.from(names).sort();
  }, [activeWorkforce]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  function openNewAsset() {
    setAssetForm({ name: "", description: "", category: "", price: "", isActive: true });
    setAssetDialog({ open: true });
  }
  function openEditAsset(a: Asset) {
    setAssetForm({ name: a.name, description: a.description ?? "", category: a.category ?? "", price: a.price, isActive: a.isActive });
    setAssetDialog({ open: true, editing: a });
  }
  function submitAsset() {
    if (assetDialog.editing) {
      const payload = {
        name: assetForm.name.trim(),
        description: assetForm.description.trim() || null,
        category: assetForm.category || null,
        isActive: assetForm.isActive,
      };
      updateAsset.mutate({ id: assetDialog.editing.id, data: payload });
    } else {
      const payload = {
        name: assetForm.name.trim(),
        description: assetForm.description.trim() || null,
        category: assetForm.category || null,
        price: assetForm.price,
        isActive: assetForm.isActive,
      };
      createAsset.mutate(payload);
    }
  }
  function submitAssign() {
    assignAsset.mutate({
      workforceId: assignForm.workforceId,
      assetId: assignForm.assetId,
      assignedAt: assignForm.assignedAt,
      notes: assignForm.notes.trim() || null,
      status: "assigned",
    });
  }

  function requestReturn(ea: EmployeeAsset) {
    const asset = assetMap.get(ea.assetId);
    const emp = workforceMap.get(ea.workforceId);
    setConfirmReturn({ id: ea.id, assetName: asset?.name ?? t("assets:assignDialog.lblAsset"), empName: emp?.fullNameEn ?? `#${emp?.employeeNumber}` });
  }
  function requestLost(ea: EmployeeAsset) {
    const asset = assetMap.get(ea.assetId);
    const emp = workforceMap.get(ea.workforceId);
    setConfirmLost({ id: ea.id, assetName: asset?.name ?? t("assets:assignDialog.lblAsset"), empName: emp?.fullNameEn ?? `#${emp?.employeeNumber}`, price: asset?.price ?? "0" });
  }
  function doMarkReturned() {
    if (!confirmReturn) return;
    updateAssignment.mutate({ id: confirmReturn.id, data: { status: "returned", returnedAt: localDate() } });
    setConfirmReturn(null);
  }
  function doMarkLost() {
    if (!confirmLost) return;
    updateAssignment.mutate({ id: confirmLost.id, data: { status: "not_returned" } });
    setConfirmLost(null);
  }

  // ─── Bulk selection helpers ─────────────────────────────────────────────────
  const selectableIds = useMemo(() => filteredAssignments.filter(ea => ea.status === "assigned").map(ea => ea.id), [filteredAssignments]);
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  function toggleRow(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (allSelected) {
      setSelectedIds(prev => { const next = new Set(prev); selectableIds.forEach(id => next.delete(id)); return next; });
    } else {
      setSelectedIds(prev => new Set([...prev, ...selectableIds]));
    }
  }
  function openBulkDialog(status: "returned" | "not_returned") {
    const allAssignmentsMap = new Map(assignments.map(ea => [ea.id, ea]));
    const selected = Array.from(selectedIds)
      .map(id => allAssignmentsMap.get(id))
      .filter((ea): ea is EmployeeAsset => ea !== undefined);
    const totalValue = selected.reduce((sum, ea) => sum + parseFloat(assetMap.get(ea.assetId)?.price ?? "0"), 0);
    setBulkDialog({ status, count: selected.length, totalValue });
  }

  // ─── Stats ─────────────────────────────────────────────────────────────────
  const totalValue = assignments
    .filter(a => a.status === "assigned")
    .reduce((sum, a) => sum + parseFloat(assetMap.get(a.assetId)?.price ?? "0"), 0);
  const notReturnedValue = assignments
    .filter(a => a.status === "not_returned")
    .reduce((sum, a) => sum + parseFloat(assetMap.get(a.assetId)?.price ?? "0"), 0);

  const isPending = createAsset.isPending || updateAsset.isPending;
  const isAssigning = assignAsset.isPending;

  const sarMoney = (n: number) => `${t("common:sar", { defaultValue: "SAR" })} ${fmtMoney(n, lang)}`;

  const statCards = [
    { label: t("assets:stat.catalogItems"), value: formatNumber(assetList.filter(a => a.isActive).length, lang), icon: Package,       iconColor: "text-primary",    accentClass: "border-l-primary",    testid: "stat-catalog-items" },
    { label: t("assets:stat.assigned"),     value: formatNumber(assignments.filter(a => a.status === "assigned").length, lang), icon: PackageCheck, iconColor: "text-blue-400",   accentClass: "border-l-blue-400",   testid: "stat-assigned" },
    { label: t("assets:stat.valueOut"),     value: sarMoney(totalValue),       icon: UserCheck,     iconColor: "text-amber-400",  accentClass: "border-l-amber-400",  testid: "stat-value-out" },
    { label: t("assets:stat.notReturned"),  value: sarMoney(notReturnedValue), icon: AlertTriangle, iconColor: "text-red-400",    accentClass: "border-l-red-400",    testid: "stat-not-returned" },
  ];

  const STATUS_LABEL: Record<EmployeeAsset["status"], string> = {
    assigned:     t("assets:status.assigned"),
    returned:     t("assets:status.returned"),
    not_returned: t("assets:status.notReturned"),
  };
  const STATUS_CLASS: Record<EmployeeAsset["status"], string> = {
    assigned:     "bg-blue-500/10 text-blue-400 border-blue-500/30",
    returned:     "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    not_returned: "bg-red-500/10 text-red-400 border-red-500/30",
  };
  const STATUS_ICON: Record<EmployeeAsset["status"], typeof PackageCheck> = {
    assigned:     PackageCheck,
    returned:     CheckCircle2,
    not_returned: PackageX,
  };

  return (
    <>
    <DashboardLayout>
    <div className="space-y-6">

      {/* ─── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-sm bg-primary/10 border border-primary/20">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">{t("assets:title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{t("assets:subtitle")}</p>
          </div>
        </div>
        <Button onClick={openNewAsset} className="gap-2 rounded-sm font-semibold" data-testid="button-new-asset">
          <Plus className="h-4 w-4" />
          {t("assets:btnNewAsset")}
        </Button>
      </div>

      {/* ─── Stat Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(c => (
          <Card key={c.testid} className={cn("bg-card border-border shadow-sm border-s-4", c.accentClass)}>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <c.icon className={cn("h-4 w-4 shrink-0", c.iconColor)} />
                {c.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-5">
              <div className="text-2xl font-bold text-foreground" dir="ltr" data-testid={c.testid}>
                {c.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── Tabs ────────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="catalog">
        <TabsList className="rounded-sm bg-muted/40 border border-border/50">
          <TabsTrigger value="catalog" className="rounded-sm data-[state=active]:bg-card data-[state=active]:text-foreground" data-testid="tab-catalog">
            {t("assets:tab.catalog")}
          </TabsTrigger>
          <TabsTrigger value="assignments" className="rounded-sm data-[state=active]:bg-card data-[state=active]:text-foreground" data-testid="tab-assignments">
            {t("assets:tab.assignments")}
          </TabsTrigger>
        </TabsList>

        {/* ── Catalog Tab ───────────────────────────────────────────────── */}
        <TabsContent value="catalog" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t("assets:catalog.searchPh")}
                value={catalogSearch}
                onChange={e => setCatalogSearch(e.target.value)}
                className="ps-9 rounded-sm"
                data-testid="input-catalog-search"
              />
            </div>
          </div>

          <Card className="bg-card border-border shadow-sm overflow-hidden rounded-sm">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className={`${TH} ps-5`}>{t("assets:catalog.th.name")}</TableHead>
                  <TableHead className={TH}>{t("assets:catalog.th.category")}</TableHead>
                  <TableHead className={`${TH} text-end`}>{t("assets:catalog.th.price")}</TableHead>
                  <TableHead className={TH}>{t("assets:catalog.th.status")}</TableHead>
                  <TableHead className={`${TH} pe-5 text-end`}>{t("assets:catalog.th.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingAssets ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-14 text-muted-foreground">
                      {t("assets:catalog.loading")}
                    </TableCell>
                  </TableRow>
                ) : filteredAssets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-14">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Package className="h-8 w-8 opacity-30" />
                        <span className="text-sm">{t("assets:catalog.empty")}</span>
                        <Button variant="outline" size="sm" className="rounded-sm mt-1" onClick={openNewAsset}>{t("assets:catalog.addFirst")}</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredAssets.map(asset => (
                  <TableRow key={asset.id} data-testid={`row-asset-${asset.id}`} className="border-border/30 hover:bg-muted/[0.08] transition-colors">
                    <TableCell className="ps-5">
                      <div className="font-medium text-foreground"><bdi>{asset.name}</bdi></div>
                      {asset.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1"><bdi>{asset.description}</bdi></div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {asset.category ? <bdi>{t(`assets:category.${asset.category}` as any, asset.category)}</bdi> : <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell className="text-end font-mono font-semibold text-foreground" dir="ltr">
                      {fmtMoney(parseFloat(asset.price), lang)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[11px] font-medium",
                          asset.isActive
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-muted/30 text-muted-foreground border-border"
                        )}
                      >
                        {asset.isActive ? t("assets:active") : t("assets:inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="pe-5 text-end">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => openEditAsset(asset)}
                          data-testid={`button-edit-asset-${asset.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteAssetId(asset.id)}
                          data-testid={`button-delete-asset-${asset.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ── Assignments Tab ──────────────────────────────────────────────── */}
        <TabsContent value="assignments" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1 max-w-sm">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t("assets:assignments.searchPh")}
                value={assignSearch}
                onChange={e => setAssignSearch(e.target.value)}
                className="ps-9 rounded-sm"
                data-testid="input-assign-search"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="rounded-sm w-40" data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("assets:assignments.filter.all")}</SelectItem>
                  <SelectItem value="assigned">{t("assets:assignments.filter.assigned")}</SelectItem>
                  <SelectItem value="returned">{t("assets:assignments.filter.returned")}</SelectItem>
                  <SelectItem value="not_returned">{t("assets:assignments.filter.notReturned")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 ms-auto">
              <Button
                variant="outline"
                onClick={() => { setBulkAssetId(""); setBulkAssignDate(localDate()); setBulkAssignNotes(""); setBulkEmpSearch(""); setBulkEventFilter("all"); setBulkDeptFilter("all"); setBulkTypeFilter("all"); setBulkSelectedIds(new Set()); setBulkAssignOpen(true); }}
                className="gap-2 rounded-sm font-semibold"
                data-testid="button-bulk-assign"
              >
                <Users className="h-4 w-4" />
                {t("assets:assignments.btnBulkAssign")}
              </Button>
              <Button
                onClick={() => { setAssignForm({ workforceId: "", assetId: "", assignedAt: localDate(), notes: "" }); setEmpSearch(""); setAssignDialog(true); }}
                className="gap-2 rounded-sm font-semibold"
                data-testid="button-assign-asset"
              >
                <Plus className="h-4 w-4" />
                {t("assets:assignments.btnAssign")}
              </Button>
            </div>
          </div>

          <Card className="bg-card border-border shadow-sm overflow-hidden rounded-sm">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="ps-4 w-10">
                    <button
                      onClick={toggleAll}
                      className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="checkbox-select-all"
                      title={allSelected ? t("assets:assignments.deselectAllTitle") : t("assets:assignments.selectAllTitle")}
                    >
                      {allSelected
                        ? <SquareCheck className="h-4 w-4 text-primary" />
                        : <Square className="h-4 w-4" />}
                    </button>
                  </TableHead>
                  <TableHead className={TH}>{t("assets:assignments.th.employee")}</TableHead>
                  <TableHead className={TH}>{t("assets:assignments.th.type")}</TableHead>
                  <TableHead className={TH}>{t("assets:assignments.th.asset")}</TableHead>
                  <TableHead className={`${TH} text-end`}>{t("assets:assignments.th.price")}</TableHead>
                  <TableHead className={TH}>{t("assets:assignments.th.assigned")}</TableHead>
                  <TableHead className={TH}>{t("assets:assignments.th.returned")}</TableHead>
                  <TableHead className={TH}>{t("assets:assignments.th.status")}</TableHead>
                  <TableHead className={`${TH} pe-5 text-end`}>{t("assets:assignments.th.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingAssign ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-14 text-muted-foreground">{t("assets:assignments.loading")}</TableCell>
                  </TableRow>
                ) : filteredAssignments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-14">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <PackageCheck className="h-8 w-8 opacity-30" />
                        <span className="text-sm">{t("assets:assignments.empty")}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredAssignments.map(ea => {
                  const emp = workforceMap.get(ea.workforceId);
                  const asset = assetMap.get(ea.assetId);
                  const StatusIcon = STATUS_ICON[ea.status];
                  const isSelectable = ea.status === "assigned";
                  const isChecked = selectedIds.has(ea.id);
                  return (
                    <TableRow
                      key={ea.id}
                      data-testid={`row-assignment-${ea.id}`}
                      className={cn(
                        "border-border/30 hover:bg-muted/[0.08] transition-colors",
                        isChecked && "bg-primary/[0.04]"
                      )}
                    >
                      <TableCell className="ps-4 w-10">
                        {isSelectable ? (
                          <button
                            onClick={() => toggleRow(ea.id)}
                            className="flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                            data-testid={`checkbox-row-${ea.id}`}
                          >
                            {isChecked
                              ? <SquareCheck className="h-4 w-4 text-primary" />
                              : <Square className="h-4 w-4" />}
                          </button>
                        ) : (
                          <span className="block w-4 h-4" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground"><bdi>{emp?.fullNameEn ?? "—"}</bdi></div>
                        <div className="text-xs text-muted-foreground font-mono" dir="ltr">{emp?.employeeNumber ?? ""}</div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px] font-medium",
                            emp?.employmentType === "smp"
                              ? "bg-violet-500/10 text-violet-400 border-violet-500/30"
                              : "bg-primary/10 text-primary border-primary/30"
                          )}
                        >
                          {emp?.employmentType === "smp" ? t("assets:type.smp") : t("assets:type.individual")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground"><bdi>{asset?.name ?? "—"}</bdi></div>
                        {asset?.category && <div className="text-xs text-muted-foreground"><bdi>{t(`assets:category.${asset.category}` as any, asset.category)}</bdi></div>}
                      </TableCell>
                      <TableCell className="text-end font-mono text-sm text-foreground" dir="ltr">
                        {fmtMoney(parseFloat(asset?.price ?? "0"), lang)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums" dir="ltr">{ea.assignedAt}</TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums" dir="ltr">{ea.returnedAt ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[11px] font-medium inline-flex items-center gap-1", STATUS_CLASS[ea.status])}>
                          <StatusIcon className="h-3 w-3" />
                          {STATUS_LABEL[ea.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="pe-5 text-end">
                        <div className="flex items-center justify-end gap-1">
                          {ea.status === "assigned" && (
                            <>
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 px-2 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-sm"
                                onClick={() => requestReturn(ea)}
                                data-testid={`button-return-${ea.id}`}
                              >
                                <RotateCcw className="h-3 w-3 me-1" />
                                {t("assets:assignments.btnReturn")}
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-sm"
                                onClick={() => requestLost(ea)}
                                data-testid={`button-not-returned-${ea.id}`}
                              >
                                <PackageX className="h-3 w-3 me-1" />
                                {t("assets:assignments.btnLost")}
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteAssignId(ea.id)}
                            data-testid={`button-delete-assign-${ea.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── New / Edit Asset Dialog ─────────────────────────────────────────── */}
      <Dialog open={assetDialog.open} onOpenChange={o => setAssetDialog({ open: o })}>
        <DialogContent className="bg-card border-border text-foreground max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle>{assetDialog.editing ? t("assets:assetDialog.titleEdit") : t("assets:assetDialog.titleNew")}</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              {assetDialog.editing ? t("assets:assetDialog.descEdit") : t("assets:assetDialog.descNew")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="asset-name">{t("assets:assetDialog.lblName")} <span className="text-red-400">*</span></Label>
              <Input
                id="asset-name"
                placeholder={t("assets:assetDialog.phName")}
                value={assetForm.name}
                onChange={e => setAssetForm(f => ({ ...f, name: e.target.value }))}
                className="rounded-sm"
                data-testid="input-asset-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="asset-category">{t("assets:assetDialog.lblCategory")}</Label>
                <Select value={assetForm.category} onValueChange={v => setAssetForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger id="asset-category" className="rounded-sm" data-testid="select-asset-category">
                    <SelectValue placeholder={t("assets:assetDialog.phCategory")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{t(`assets:category.${c}` as any, c)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-price">
                  {t("assets:assetDialog.lblPrice")}
                  {!assetDialog.editing && <span className="text-red-400"> *</span>}
                </Label>
                {assetDialog.editing ? (
                  <div className="flex items-center gap-2 h-9 px-3 rounded-sm border border-border/50 bg-muted/30 text-sm text-muted-foreground" data-testid="display-asset-price">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    <span className="font-mono font-semibold text-foreground" dir="ltr">{fmtMoney(parseFloat(assetForm.price || "0"), lang)}</span>
                    <span className="text-xs text-muted-foreground/60 ms-auto">{t("assets:assetDialog.locked")}</span>
                  </div>
                ) : (
                  <Input
                    id="asset-price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={t("assets:assetDialog.phPrice")}
                    value={assetForm.price}
                    onChange={e => setAssetForm(f => ({ ...f, price: e.target.value }))}
                    className="rounded-sm"
                    dir="ltr"
                    data-testid="input-asset-price"
                  />
                )}
              </div>
            </div>
            {assetDialog.editing && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Lock className="h-3 w-3 shrink-0" />
                {t("assets:assetDialog.lockedHint")}
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="asset-desc">{t("assets:assetDialog.lblDesc")}</Label>
              <Textarea
                id="asset-desc"
                placeholder={t("assets:assetDialog.phDesc")}
                value={assetForm.description}
                onChange={e => setAssetForm(f => ({ ...f, description: e.target.value }))}
                className="rounded-sm resize-none h-20"
                data-testid="input-asset-description"
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("assets:assetDialog.lblStatus")}</Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAssetForm(f => ({ ...f, isActive: true }))}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-medium rounded-sm border transition-colors",
                    assetForm.isActive
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "border-border text-muted-foreground hover:border-muted-foreground"
                  )}
                  data-testid="button-asset-active"
                >
                  {t("assets:active")}
                </button>
                <button
                  type="button"
                  onClick={() => setAssetForm(f => ({ ...f, isActive: false }))}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-medium rounded-sm border transition-colors",
                    !assetForm.isActive
                      ? "bg-muted border-muted-foreground/40 text-foreground"
                      : "border-border text-muted-foreground hover:border-muted-foreground"
                  )}
                  data-testid="button-asset-inactive"
                >
                  {t("assets:inactive")}
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" className="rounded-sm" onClick={() => setAssetDialog({ open: false })}>{t("common:cancel")}</Button>
            <Button
              className="rounded-sm"
              onClick={submitAsset}
              disabled={!assetForm.name.trim() || (!assetDialog.editing && !assetForm.price) || isPending}
              data-testid="button-save-asset"
            >
              {isPending ? t("assets:assetDialog.saving") : assetDialog.editing ? t("assets:assetDialog.btnSave") : t("assets:assetDialog.btnCreate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Assign Asset Dialog ─────────────────────────────────────────────── */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="bg-card border-border text-foreground max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle>{t("assets:assignDialog.title")}</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              {t("assets:assignDialog.desc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>{t("assets:assignDialog.lblEmployee")} <span className="text-red-400">*</span></Label>
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder={t("assets:assignDialog.phSearch")}
                  value={empSearch}
                  onChange={e => { setEmpSearch(e.target.value); if (assignForm.workforceId) setAssignForm(f => ({ ...f, workforceId: "" })); }}
                  className="ps-9 rounded-sm"
                  data-testid="input-emp-search"
                />
              </div>
              {empSearch && !assignForm.workforceId && (
                <div className="border border-border rounded-sm bg-popover shadow-md max-h-44 overflow-y-auto divide-y divide-border/50">
                  {filteredEmployees.length === 0
                    ? <div className="px-3 py-3 text-sm text-muted-foreground">{t("assets:assignDialog.noEmployees")}</div>
                    : filteredEmployees.map(w => (
                      <button
                        key={w.id}
                        type="button"
                        className="w-full px-3 py-2 text-start text-sm hover:bg-muted/40 transition-colors flex items-center gap-2"
                        onClick={() => { setAssignForm(f => ({ ...f, workforceId: w.id })); setEmpSearch(w.fullNameEn ?? w.employeeNumber); }}
                        data-testid={`emp-option-${w.id}`}
                      >
                        <span className="font-medium text-foreground"><bdi>{w.fullNameEn ?? "—"}</bdi></span>
                        <span className="text-muted-foreground font-mono text-xs" dir="ltr">#{w.employeeNumber}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "ms-auto text-[10px] font-medium",
                            w.employmentType === "smp"
                              ? "bg-violet-500/10 text-violet-400 border-violet-500/30"
                              : "bg-primary/10 text-primary border-primary/30"
                          )}
                        >
                          {w.employmentType === "smp" ? t("assets:type.smp") : t("assets:type.individual")}
                        </Badge>
                      </button>
                    ))
                  }
                </div>
              )}
              {assignForm.workforceId && (
                <p className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t("assets:assignDialog.selectedHint")}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{t("assets:assignDialog.lblAsset")} <span className="text-red-400">*</span></Label>
              <Select value={assignForm.assetId} onValueChange={v => setAssignForm(f => ({ ...f, assetId: v }))}>
                <SelectTrigger className="rounded-sm" data-testid="select-assign-asset">
                  <SelectValue placeholder={t("assets:assignDialog.phAsset")} />
                </SelectTrigger>
                <SelectContent>
                  {assetList.filter(a => a.isActive).map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-medium"><bdi>{a.name}</bdi></span>
                      <span className="ms-2 text-muted-foreground text-xs" dir="ltr">{`SAR ${fmtMoney(parseFloat(a.price), lang)}`}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assigned-at">{t("assets:assignDialog.lblDate")} <span className="text-red-400">*</span></Label>
              <Input
                id="assigned-at"
                type="date"
                value={assignForm.assignedAt}
                onChange={e => setAssignForm(f => ({ ...f, assignedAt: e.target.value }))}
                className="rounded-sm"
                dir="ltr"
                data-testid="input-assigned-date"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assign-notes">{t("assets:assignDialog.lblNotes")}</Label>
              <Textarea
                id="assign-notes"
                placeholder={t("assets:assignDialog.phNotes")}
                value={assignForm.notes}
                onChange={e => setAssignForm(f => ({ ...f, notes: e.target.value }))}
                className="rounded-sm resize-none h-16"
                data-testid="input-assign-notes"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" className="rounded-sm" onClick={() => setAssignDialog(false)}>{t("common:cancel")}</Button>
            <Button
              className="rounded-sm"
              onClick={submitAssign}
              disabled={!assignForm.workforceId || !assignForm.assetId || !assignForm.assignedAt || isAssigning}
              data-testid="button-save-assign"
            >
              {isAssigning ? t("assets:assignDialog.saving") : t("assets:assignDialog.btnSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Assign Dialog ──────────────────────────────────────────────── */}
      <Dialog open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-3xl rounded-sm max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("assets:bulkAssign.title")}</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              {t("assets:bulkAssign.desc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1 flex-1 overflow-hidden flex flex-col">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>{t("assets:bulkAssign.lblAsset")} <span className="text-red-400">*</span></Label>
                <Select value={bulkAssetId} onValueChange={setBulkAssetId}>
                  <SelectTrigger className="rounded-sm" data-testid="select-bulk-asset">
                    <SelectValue placeholder={t("assets:bulkAssign.phAsset")} />
                  </SelectTrigger>
                  <SelectContent>
                    {assetList.filter(a => a.isActive).map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="font-medium"><bdi>{a.name}</bdi></span>
                        <span className="ms-2 text-muted-foreground text-xs" dir="ltr">{`SAR ${fmtMoney(parseFloat(a.price), lang)}`}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("assets:bulkAssign.lblDate")} <span className="text-red-400">*</span></Label>
                <Input
                  type="date"
                  value={bulkAssignDate}
                  onChange={e => setBulkAssignDate(e.target.value)}
                  className="rounded-sm"
                  dir="ltr"
                  data-testid="input-bulk-assign-date"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("assets:bulkAssign.lblNotes")}</Label>
                <Input
                  placeholder={t("assets:bulkAssign.phNotes")}
                  value={bulkAssignNotes}
                  onChange={e => setBulkAssignNotes(e.target.value)}
                  className="rounded-sm"
                  data-testid="input-bulk-assign-notes"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder={t("assets:bulkAssign.phSearch")}
                  value={bulkEmpSearch}
                  onChange={e => setBulkEmpSearch(e.target.value)}
                  className="ps-9 rounded-sm h-9"
                  data-testid="input-bulk-emp-search"
                />
              </div>
              <Select value={bulkEventFilter} onValueChange={v => { setBulkEventFilter(v); setBulkSelectedIds(new Set()); }}>
                <SelectTrigger className="h-9 w-40 rounded-sm" data-testid="select-bulk-event">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("assets:bulkAssign.filter.allEvents")}</SelectItem>
                  {events.map(e => <SelectItem key={e.id} value={e.id}><bdi>{e.name}</bdi></SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={bulkDeptFilter} onValueChange={v => { setBulkDeptFilter(v); setBulkSelectedIds(new Set()); }}>
                <SelectTrigger className="h-9 w-40 rounded-sm" data-testid="select-bulk-dept">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("assets:bulkAssign.filter.allDepts")}</SelectItem>
                  {deptOptions.map(d => <SelectItem key={d} value={d}><bdi>{d}</bdi></SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={bulkTypeFilter} onValueChange={v => { setBulkTypeFilter(v); setBulkSelectedIds(new Set()); }}>
                <SelectTrigger className="h-9 w-36 rounded-sm" data-testid="select-bulk-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("assets:bulkAssign.filter.allTypes")}</SelectItem>
                  <SelectItem value="individual">{t("assets:type.individual")}</SelectItem>
                  <SelectItem value="smp">{t("assets:type.smp")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border border-border rounded-sm overflow-hidden flex-1 overflow-y-auto min-h-0" style={{ maxHeight: "340px" }}>
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="w-10 ps-3">
                      <Checkbox
                        checked={bulkAllSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setBulkSelectedIds(new Set(bulkFilteredEmployees.map(w => w.id)));
                          } else {
                            setBulkSelectedIds(new Set());
                          }
                        }}
                        data-testid="checkbox-bulk-select-all"
                      />
                    </TableHead>
                    <TableHead className={TH}>{t("assets:bulkAssign.th.empNo")}</TableHead>
                    <TableHead className={TH}>{t("assets:bulkAssign.th.name")}</TableHead>
                    <TableHead className={TH}>{t("assets:bulkAssign.th.nationalId")}</TableHead>
                    <TableHead className={TH}>{t("assets:bulkAssign.th.event")}</TableHead>
                    <TableHead className={TH}>{t("assets:bulkAssign.th.deptPosition")}</TableHead>
                    <TableHead className={TH}>{t("assets:bulkAssign.th.type")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulkFilteredEmployees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {t("assets:bulkAssign.noMatch")}
                      </TableCell>
                    </TableRow>
                  ) : bulkFilteredEmployees.map(w => (
                    <TableRow
                      key={w.id}
                      className={cn("border-border/30 cursor-pointer transition-colors", bulkSelectedIds.has(w.id) ? "bg-primary/5" : "hover:bg-muted/30")}
                      onClick={() => {
                        setBulkSelectedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(w.id)) next.delete(w.id); else next.add(w.id);
                          return next;
                        });
                      }}
                    >
                      <TableCell className="ps-3">
                        <Checkbox
                          checked={bulkSelectedIds.has(w.id)}
                          onCheckedChange={(checked) => {
                            setBulkSelectedIds(prev => {
                              const next = new Set(prev);
                              if (checked) next.add(w.id); else next.delete(w.id);
                              return next;
                            });
                          }}
                          data-testid={`checkbox-bulk-emp-${w.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground" dir="ltr">{w.employeeNumber}</TableCell>
                      <TableCell className="font-medium text-sm"><bdi>{w.fullNameEn ?? "—"}</bdi></TableCell>
                      <TableCell className="text-xs text-muted-foreground" dir="ltr">{w.nationalId ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground"><bdi>{w.eventName ?? "—"}</bdi></TableCell>
                      <TableCell className="text-xs text-muted-foreground"><bdi>{w.departmentName ? `${w.departmentName}${w.positionTitle ? ` / ${w.positionTitle}` : ""}` : w.positionTitle ?? "—"}</bdi></TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px]", w.employmentType === "smp" ? "bg-violet-500/10 text-violet-400 border-violet-500/30" : "bg-primary/10 text-primary border-primary/30")}>
                          {w.employmentType === "smp" ? t("assets:type.smp") : t("assets:type.individual")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t("assets:bulkAssign.shown", { count: bulkFilteredEmployees.length, replace: { n: formatNumber(bulkFilteredEmployees.length, lang) } })}
                {bulkSelectedIds.size > 0 && <> · <span className="text-primary font-semibold">{t("assets:bulkAssign.selected", { replace: { n: formatNumber(bulkSelectedIds.size, lang) } })}</span></>}
              </span>
              {bulkSomeSelected && !bulkAllSelected && (
                <Button
                  variant="link"
                  size="sm"
                  className="text-xs h-auto p-0"
                  onClick={() => setBulkSelectedIds(new Set(bulkFilteredEmployees.map(w => w.id)))}
                  data-testid="button-select-all-filtered"
                >
                  {t("assets:bulkAssign.selectAllMatching", { replace: { n: formatNumber(bulkFilteredEmployees.length, lang) } })}
                </Button>
              )}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" className="rounded-sm" onClick={() => setBulkAssignOpen(false)}>{t("common:cancel")}</Button>
            <Button
              className="rounded-sm"
              disabled={!bulkAssetId || !bulkAssignDate || bulkSelectedIds.size === 0}
              onClick={() => setBulkConfirmOpen(true)}
              data-testid="button-bulk-assign-submit"
            >
              {t("assets:bulkAssign.btnSubmit", { count: bulkSelectedIds.size, replace: { n: formatNumber(bulkSelectedIds.size, lang) } })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Assign Confirmation ────────────────────────────────────────── */}
      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent className="bg-card border-border text-foreground rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("assets:bulkAssign.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground space-y-2">
              <span className="block">
                {t("assets:bulkAssign.confirmLine1", {
                  count: bulkSelectedIds.size,
                  replace: {
                    asset: assetList.find(a => a.id === bulkAssetId)?.name ?? t("assets:assignDialog.lblAsset"),
                    n: formatNumber(bulkSelectedIds.size, lang),
                    date: bulkAssignDate,
                  },
                })}
              </span>
              <span className="block text-sm">{t("assets:bulkAssign.confirmNote")}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm">{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-sm bg-primary hover:bg-primary/90"
              disabled={bulkAssignMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                bulkAssignMut.mutate({
                  assetId: bulkAssetId,
                  workforceIds: Array.from(bulkSelectedIds),
                  assignedAt: bulkAssignDate,
                  notes: bulkAssignNotes.trim() || undefined,
                });
              }}
              data-testid="button-bulk-assign-confirm"
            >
              {bulkAssignMut.isPending ? t("assets:bulkAssign.confirmBtnPending") : t("assets:bulkAssign.confirmBtn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Asset Confirm ────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteAssetId} onOpenChange={o => !o && setDeleteAssetId(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("assets:deleteAsset.title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("assets:deleteAsset.desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm">{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-sm bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => deleteAssetId && deleteAsset.mutate(deleteAssetId)}
            >
              {t("assets:deleteAsset.btn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Assignment Confirm ───────────────────────────────────────── */}
      <AlertDialog open={!!deleteAssignId} onOpenChange={o => !o && setDeleteAssignId(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("assets:deleteAssign.title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("assets:deleteAssign.desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm">{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-sm bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => deleteAssignId && deleteAssignment.mutate(deleteAssignId)}
            >
              {t("assets:deleteAssign.btn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Return Confirmation ──────────────────────────────────────────────── */}
      <AlertDialog open={!!confirmReturn} onOpenChange={o => !o && setConfirmReturn(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("assets:confirmReturn.title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("assets:confirmReturn.desc", { replace: { asset: confirmReturn?.assetName ?? "", emp: confirmReturn?.empName ?? "" } })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm">{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-sm bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={doMarkReturned}
              data-testid="button-confirm-return"
            >
              <RotateCcw className="h-4 w-4 me-2" />
              {t("assets:confirmReturn.btn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Lost / Not Returned Confirmation ────────────────────────────────── */}
      <AlertDialog open={!!confirmLost} onOpenChange={o => !o && setConfirmLost(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("assets:confirmLost.title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("assets:confirmLost.desc", { replace: { asset: confirmLost?.assetName ?? "", emp: confirmLost?.empName ?? "" } })}
              {confirmLost?.price && parseFloat(confirmLost.price) > 0 && (
                t("assets:confirmLost.valueNote", { replace: { price: fmtMoney(parseFloat(confirmLost.price), lang) } })
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm">{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-sm bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={doMarkLost}
              data-testid="button-confirm-lost"
            >
              <PackageX className="h-4 w-4 me-2" />
              {t("assets:confirmLost.btn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Bulk Status Confirmation ─────────────────────────────────────────── */}
      <AlertDialog open={!!bulkDialog} onOpenChange={o => !o && setBulkDialog(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkDialog?.status === "returned" ? t("assets:bulkStatus.titleReturned") : t("assets:bulkStatus.titleLost")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("assets:bulkStatus.desc", {
                count: bulkDialog?.count ?? 0,
                replace: {
                  n: formatNumber(bulkDialog?.count ?? 0, lang),
                  value: fmtMoney(bulkDialog?.totalValue ?? 0, lang),
                },
              })}
              {bulkDialog?.status === "not_returned" && t("assets:bulkStatus.lostNote")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm">{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                "rounded-sm",
                bulkDialog?.status === "returned"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              )}
              onClick={() => bulkDialog && bulkStatusMut.mutate({ ids: Array.from(selectedIds), status: bulkDialog.status })}
              disabled={bulkStatusMut.isPending}
              data-testid="button-confirm-bulk"
            >
              {bulkStatusMut.isPending
                ? <><Loader2 className="h-4 w-4 me-2 animate-spin" /> {t("assets:bulkStatus.processing")}</>
                : bulkDialog?.status === "returned"
                  ? <><RotateCcw className="h-4 w-4 me-2" /> {t("assets:bulkStatus.btnReturned")}</>
                  : <><PackageX className="h-4 w-4 me-2" /> {t("assets:bulkStatus.btnLost")}</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </DashboardLayout>

    {/* ─── Floating Bulk Action Bar ─────────────────────────────────────────── */}
    {someSelected && createPortal(
      <div className="fixed bottom-6 start-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-card border border-border shadow-2xl rounded-lg px-5 py-3 animate-in slide-in-from-bottom-4">
        <span className="text-sm font-medium text-foreground">
          {t("assets:floatBar.selected", { count: selectedIds.size, replace: { n: formatNumber(selectedIds.size, lang) } })}
        </span>
        <div className="w-px h-4 bg-border" />
        <Button
          size="sm"
          variant="outline"
          className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 rounded-sm h-8"
          onClick={() => openBulkDialog("returned")}
          data-testid="button-bulk-mark-returned"
        >
          <RotateCcw className="h-3.5 w-3.5 me-1.5" />
          {t("assets:floatBar.btnReturned")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-red-500/40 text-red-400 hover:bg-red-500/10 rounded-sm h-8"
          onClick={() => openBulkDialog("not_returned")}
          data-testid="button-bulk-mark-lost"
        >
          <PackageX className="h-3.5 w-3.5 me-1.5" />
          {t("assets:floatBar.btnLost")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => setSelectedIds(new Set())}
          data-testid="button-clear-selection"
          aria-label={t("assets:floatBar.clear")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>,
      document.body
    )}
    </>
  );
}
