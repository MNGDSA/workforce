import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  MinusSquare,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/layout";

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

const statusConfig = {
  assigned:     { label: "Assigned",     className: "bg-blue-500/10 text-blue-400 border-blue-500/30",      icon: PackageCheck },
  returned:     { label: "Returned",     className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  not_returned: { label: "Not Returned", className: "bg-red-500/10 text-red-400 border-red-500/30",          icon: PackageX },
};

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TH = "text-xs font-medium uppercase tracking-wider text-muted-foreground";

export default function AssetsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

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

  // ─── Mutations ─────────────────────────────────────────────────────────────
  const createAsset = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/assets", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/assets"] }); setAssetDialog({ open: false }); toast({ title: "Asset created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const updateAsset = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => apiRequest("PATCH", `/api/assets/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/assets"] }); setAssetDialog({ open: false }); toast({ title: "Asset updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteAsset = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/assets/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/assets"] }); setDeleteAssetId(null); toast({ title: "Asset deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const assignAsset = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/employee-assets", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/employee-assets"] }); setAssignDialog(false); toast({ title: "Asset assigned" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const updateAssignment = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => apiRequest("PATCH", `/api/employee-assets/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/employee-assets"] }); toast({ title: "Assignment updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteAssignment = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/employee-assets/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/employee-assets"] }); setDeleteAssignId(null); toast({ title: "Assignment removed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bulkStatusMut = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: "returned" | "not_returned" }) =>
      apiRequest("POST", "/api/employee-assets/bulk-status", { ids, status }).then(r => r.json()),
    onSuccess: (data, { ids, status }) => {
      qc.invalidateQueries({ queryKey: ["/api/employee-assets"] });
      setSelectedIds(new Set());
      setBulkDialog(null);
      const count = data?.updated ?? ids.length;
      toast({ title: `${count} assignment(s) marked as ${status === "returned" ? "Returned" : "Not Returned"}` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bulkAssignMut = useMutation({
    mutationFn: (data: { assetId: string; workforceIds: string[]; assignedAt: string; notes?: string }) =>
      apiRequest("POST", "/api/employee-assets/bulk-assign", data).then(r => r.json()),
    onSuccess: (data: { created: number; skipped: number }) => {
      qc.invalidateQueries({ queryKey: ["/api/employee-assets"] });
      const assetName = assetList.find(a => a.id === bulkAssetId)?.name ?? "Asset";
      setBulkConfirmOpen(false);
      setBulkAssignOpen(false);
      setBulkSelectedIds(new Set());
      setBulkAssetId("");
      setBulkAssignNotes("");
      setBulkEmpSearch("");
      setBulkEventFilter("all");
      setBulkDeptFilter("all");
      setBulkTypeFilter("all");
      toast({
        title: `Assigned "${assetName}" to ${data.created} employee${data.created !== 1 ? "s" : ""}${data.skipped > 0 ? ` (${data.skipped} skipped — already assigned)` : ""}`,
      });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
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
        (asset?.name ?? "").toLowerCase().includes(q)
      );
    }), [assignments, statusFilter, assignSearch, workforceMap, assetMap]);

  const filteredEmployees = useMemo(() =>
    workforce.filter(w => {
      if (!empSearch) return true;
      const q = empSearch.toLowerCase();
      return (
        (w.fullNameEn ?? "").toLowerCase().includes(q) ||
        w.employeeNumber.toLowerCase().includes(q)
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
    setConfirmReturn({ id: ea.id, assetName: asset?.name ?? "Asset", empName: emp?.fullNameEn ?? `#${emp?.employeeNumber}` });
  }
  function requestLost(ea: EmployeeAsset) {
    const asset = assetMap.get(ea.assetId);
    const emp = workforceMap.get(ea.workforceId);
    setConfirmLost({ id: ea.id, assetName: asset?.name ?? "Asset", empName: emp?.fullNameEn ?? `#${emp?.employeeNumber}`, price: asset?.price ?? "0" });
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
    // Derive count/value from the exact IDs being submitted, not just the current filter view
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

  const statCards = [
    { label: "Catalog Items",   value: String(assetList.filter(a => a.isActive).length),  icon: Package,       iconColor: "text-primary",    accentClass: "border-l-primary" },
    { label: "Assigned",        value: String(assignments.filter(a => a.status === "assigned").length), icon: PackageCheck, iconColor: "text-blue-400",   accentClass: "border-l-blue-400" },
    { label: "Asset Value Out", value: `SAR ${totalValue.toLocaleString("en", { minimumFractionDigits: 2 })}`, icon: UserCheck, iconColor: "text-amber-400",  accentClass: "border-l-amber-400" },
    { label: "Not Returned",    value: `SAR ${notReturnedValue.toLocaleString("en", { minimumFractionDigits: 2 })}`, icon: AlertTriangle, iconColor: "text-red-400", accentClass: "border-l-red-400" },
  ];

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
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Asset Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Track equipment issued to employees</p>
          </div>
        </div>
        <Button onClick={openNewAsset} className="gap-2 rounded-sm font-semibold" data-testid="button-new-asset">
          <Plus className="h-4 w-4" />
          New Asset
        </Button>
      </div>

      {/* ─── Stat Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(c => (
          <Card key={c.label} className={cn("bg-card border-border shadow-sm border-l-4", c.accentClass)}>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <c.icon className={cn("h-4 w-4 shrink-0", c.iconColor)} />
                {c.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-5">
              <div
                className="text-2xl font-bold text-foreground"
                data-testid={`stat-${c.label.toLowerCase().replace(/ /g, "-")}`}
              >
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
            Asset Catalog
          </TabsTrigger>
          <TabsTrigger value="assignments" className="rounded-sm data-[state=active]:bg-card data-[state=active]:text-foreground" data-testid="tab-assignments">
            Assignments
          </TabsTrigger>
        </TabsList>

        {/* ── Catalog Tab ───────────────────────────────────────────────── */}
        <TabsContent value="catalog" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by name or category…"
                value={catalogSearch}
                onChange={e => setCatalogSearch(e.target.value)}
                className="pl-9 rounded-sm"
                data-testid="input-catalog-search"
              />
            </div>
          </div>

          <Card className="bg-card border-border shadow-sm overflow-hidden rounded-sm">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className={`${TH} pl-5`}>Asset Name</TableHead>
                  <TableHead className={TH}>Category</TableHead>
                  <TableHead className={`${TH} text-right`}>Price (SAR)</TableHead>
                  <TableHead className={TH}>Status</TableHead>
                  <TableHead className={`${TH} pr-5 text-right`}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingAssets ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-14 text-muted-foreground">
                      Loading assets…
                    </TableCell>
                  </TableRow>
                ) : filteredAssets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-14">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Package className="h-8 w-8 opacity-30" />
                        <span className="text-sm">No assets in catalog yet</span>
                        <Button variant="outline" size="sm" className="rounded-sm mt-1" onClick={openNewAsset}>Add first asset</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredAssets.map(asset => (
                  <TableRow key={asset.id} data-testid={`row-asset-${asset.id}`} className="border-border/30 hover:bg-muted/[0.08] transition-colors">
                    <TableCell className="pl-5">
                      <div className="font-medium text-foreground">{asset.name}</div>
                      {asset.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{asset.description}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {asset.category ?? <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-foreground">
                      {parseFloat(asset.price).toLocaleString("en", { minimumFractionDigits: 2 })}
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
                        {asset.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-5 text-right">
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search employee or asset…"
                value={assignSearch}
                onChange={e => setAssignSearch(e.target.value)}
                className="pl-9 rounded-sm"
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
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                  <SelectItem value="not_returned">Not Returned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 ml-auto">
              <Button
                variant="outline"
                onClick={() => { setBulkAssetId(""); setBulkAssignDate(localDate()); setBulkAssignNotes(""); setBulkEmpSearch(""); setBulkEventFilter("all"); setBulkDeptFilter("all"); setBulkTypeFilter("all"); setBulkSelectedIds(new Set()); setBulkAssignOpen(true); }}
                className="gap-2 rounded-sm font-semibold"
                data-testid="button-bulk-assign"
              >
                <Users className="h-4 w-4" />
                Bulk Assign
              </Button>
              <Button
                onClick={() => { setAssignForm({ workforceId: "", assetId: "", assignedAt: localDate(), notes: "" }); setEmpSearch(""); setAssignDialog(true); }}
                className="gap-2 rounded-sm font-semibold"
                data-testid="button-assign-asset"
              >
                <Plus className="h-4 w-4" />
                Assign Asset
              </Button>
            </div>
          </div>

          <Card className="bg-card border-border shadow-sm overflow-hidden rounded-sm">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="pl-4 w-10">
                    <button
                      onClick={toggleAll}
                      className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="checkbox-select-all"
                      title={allSelected ? "Deselect all" : "Select all assigned"}
                    >
                      {allSelected
                        ? <SquareCheck className="h-4 w-4 text-primary" />
                        : <Square className="h-4 w-4" />}
                    </button>
                  </TableHead>
                  <TableHead className={`${TH}`}>Employee</TableHead>
                  <TableHead className={TH}>Type</TableHead>
                  <TableHead className={TH}>Asset</TableHead>
                  <TableHead className={`${TH} text-right`}>Price (SAR)</TableHead>
                  <TableHead className={TH}>Assigned</TableHead>
                  <TableHead className={TH}>Returned</TableHead>
                  <TableHead className={TH}>Status</TableHead>
                  <TableHead className={`${TH} pr-5 text-right`}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingAssign ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-14 text-muted-foreground">Loading…</TableCell>
                  </TableRow>
                ) : filteredAssignments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-14">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <PackageCheck className="h-8 w-8 opacity-30" />
                        <span className="text-sm">No assignments found</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredAssignments.map(ea => {
                  const emp = workforceMap.get(ea.workforceId);
                  const asset = assetMap.get(ea.assetId);
                  const sc = statusConfig[ea.status];
                  const StatusIcon = sc.icon;
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
                      <TableCell className="pl-4 w-10">
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
                        <div className="font-medium text-foreground">{emp?.fullNameEn ?? "—"}</div>
                        <div className="text-xs text-muted-foreground font-mono">{emp?.employeeNumber ?? ""}</div>
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
                          {emp?.employmentType === "smp" ? "SMP" : "Individual"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground">{asset?.name ?? "—"}</div>
                        {asset?.category && <div className="text-xs text-muted-foreground">{asset.category}</div>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-foreground">
                        {parseFloat(asset?.price ?? "0").toLocaleString("en", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">{ea.assignedAt}</TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">{ea.returnedAt ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[11px] font-medium inline-flex items-center gap-1", sc.className)}>
                          <StatusIcon className="h-3 w-3" />
                          {sc.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {ea.status === "assigned" && (
                            <>
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 px-2 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-sm"
                                onClick={() => requestReturn(ea)}
                                data-testid={`button-return-${ea.id}`}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Return
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-sm"
                                onClick={() => requestLost(ea)}
                                data-testid={`button-not-returned-${ea.id}`}
                              >
                                <PackageX className="h-3 w-3 mr-1" />
                                Lost
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
            <DialogTitle>{assetDialog.editing ? "Edit Asset" : "New Asset"}</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              {assetDialog.editing ? "Update the details for this catalog asset." : "Add a new asset to the catalog. Assign it to employees from the Assignments tab."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="asset-name">Asset Name <span className="text-red-400">*</span></Label>
              <Input
                id="asset-name"
                placeholder="e.g. Walkie Talkie"
                value={assetForm.name}
                onChange={e => setAssetForm(f => ({ ...f, name: e.target.value }))}
                className="rounded-sm"
                data-testid="input-asset-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="asset-category">Category</Label>
                <Select value={assetForm.category} onValueChange={v => setAssetForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger id="asset-category" className="rounded-sm" data-testid="select-asset-category">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-price">
                  Price (SAR)
                  {!assetDialog.editing && <span className="text-red-400"> *</span>}
                </Label>
                {assetDialog.editing ? (
                  <div className="flex items-center gap-2 h-9 px-3 rounded-sm border border-border/50 bg-muted/30 text-sm text-muted-foreground" data-testid="display-asset-price">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    <span className="font-mono font-semibold text-foreground">{parseFloat(assetForm.price || "0").toLocaleString("en", { minimumFractionDigits: 2 })}</span>
                    <span className="text-xs text-muted-foreground/60 ml-auto">Locked</span>
                  </div>
                ) : (
                  <Input
                    id="asset-price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={assetForm.price}
                    onChange={e => setAssetForm(f => ({ ...f, price: e.target.value }))}
                    className="rounded-sm"
                    data-testid="input-asset-price"
                  />
                )}
              </div>
            </div>
            {assetDialog.editing && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Lock className="h-3 w-3 shrink-0" />
                Asset price is locked after creation and cannot be changed.
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="asset-desc">Description</Label>
              <Textarea
                id="asset-desc"
                placeholder="Optional notes about this asset…"
                value={assetForm.description}
                onChange={e => setAssetForm(f => ({ ...f, description: e.target.value }))}
                className="rounded-sm resize-none h-20"
                data-testid="input-asset-description"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Catalog Status</Label>
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
                  Active
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
                  Inactive
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" className="rounded-sm" onClick={() => setAssetDialog({ open: false })}>Cancel</Button>
            <Button
              className="rounded-sm"
              onClick={submitAsset}
              disabled={!assetForm.name.trim() || (!assetDialog.editing && !assetForm.price) || isPending}
              data-testid="button-save-asset"
            >
              {isPending ? "Saving…" : assetDialog.editing ? "Save Changes" : "Create Asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Assign Asset Dialog ─────────────────────────────────────────────── */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="bg-card border-border text-foreground max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle>Assign Asset to Employee</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Select an employee and an asset from the catalog. You can mark it returned or lost later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Employee <span className="text-red-400">*</span></Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by name or employee #…"
                  value={empSearch}
                  onChange={e => { setEmpSearch(e.target.value); if (assignForm.workforceId) setAssignForm(f => ({ ...f, workforceId: "" })); }}
                  className="pl-9 rounded-sm"
                  data-testid="input-emp-search"
                />
              </div>
              {empSearch && !assignForm.workforceId && (
                <div className="border border-border rounded-sm bg-popover shadow-md max-h-44 overflow-y-auto divide-y divide-border/50">
                  {filteredEmployees.length === 0
                    ? <div className="px-3 py-3 text-sm text-muted-foreground">No employees found</div>
                    : filteredEmployees.map(w => (
                      <button
                        key={w.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted/40 transition-colors flex items-center gap-2"
                        onClick={() => { setAssignForm(f => ({ ...f, workforceId: w.id })); setEmpSearch(w.fullNameEn ?? w.employeeNumber); }}
                        data-testid={`emp-option-${w.id}`}
                      >
                        <span className="font-medium text-foreground">{w.fullNameEn ?? "—"}</span>
                        <span className="text-muted-foreground font-mono text-xs">#{w.employeeNumber}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "ml-auto text-[10px] font-medium",
                            w.employmentType === "smp"
                              ? "bg-violet-500/10 text-violet-400 border-violet-500/30"
                              : "bg-primary/10 text-primary border-primary/30"
                          )}
                        >
                          {w.employmentType === "smp" ? "SMP" : "Individual"}
                        </Badge>
                      </button>
                    ))
                  }
                </div>
              )}
              {assignForm.workforceId && (
                <p className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Employee selected — clear the search to pick a different one
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Asset <span className="text-red-400">*</span></Label>
              <Select value={assignForm.assetId} onValueChange={v => setAssignForm(f => ({ ...f, assetId: v }))}>
                <SelectTrigger className="rounded-sm" data-testid="select-assign-asset">
                  <SelectValue placeholder="Select an asset…" />
                </SelectTrigger>
                <SelectContent>
                  {assetList.filter(a => a.isActive).map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-medium">{a.name}</span>
                      <span className="ml-2 text-muted-foreground text-xs">SAR {parseFloat(a.price).toLocaleString("en", { minimumFractionDigits: 2 })}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assigned-at">Assignment Date <span className="text-red-400">*</span></Label>
              <Input
                id="assigned-at"
                type="date"
                value={assignForm.assignedAt}
                onChange={e => setAssignForm(f => ({ ...f, assignedAt: e.target.value }))}
                className="rounded-sm"
                data-testid="input-assigned-date"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assign-notes">Notes</Label>
              <Textarea
                id="assign-notes"
                placeholder="Optional notes…"
                value={assignForm.notes}
                onChange={e => setAssignForm(f => ({ ...f, notes: e.target.value }))}
                className="rounded-sm resize-none h-16"
                data-testid="input-assign-notes"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" className="rounded-sm" onClick={() => setAssignDialog(false)}>Cancel</Button>
            <Button
              className="rounded-sm"
              onClick={submitAssign}
              disabled={!assignForm.workforceId || !assignForm.assetId || !assignForm.assignedAt || isAssigning}
              data-testid="button-save-assign"
            >
              {isAssigning ? "Assigning…" : "Assign Asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Assign Dialog ──────────────────────────────────────────────── */}
      <Dialog open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-3xl rounded-sm max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Bulk Assign Asset</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Select an asset, filter employees, then assign to all selected at once.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1 flex-1 overflow-hidden flex flex-col">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Asset <span className="text-red-400">*</span></Label>
                <Select value={bulkAssetId} onValueChange={setBulkAssetId}>
                  <SelectTrigger className="rounded-sm" data-testid="select-bulk-asset">
                    <SelectValue placeholder="Select an asset…" />
                  </SelectTrigger>
                  <SelectContent>
                    {assetList.filter(a => a.isActive).map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="font-medium">{a.name}</span>
                        <span className="ml-2 text-muted-foreground text-xs">SAR {parseFloat(a.price).toLocaleString("en", { minimumFractionDigits: 2 })}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Assignment Date <span className="text-red-400">*</span></Label>
                <Input
                  type="date"
                  value={bulkAssignDate}
                  onChange={e => setBulkAssignDate(e.target.value)}
                  className="rounded-sm"
                  data-testid="input-bulk-assign-date"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input
                  placeholder="Optional notes…"
                  value={bulkAssignNotes}
                  onChange={e => setBulkAssignNotes(e.target.value)}
                  className="rounded-sm"
                  data-testid="input-bulk-assign-notes"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search name, ID #, national ID, phone…"
                  value={bulkEmpSearch}
                  onChange={e => setBulkEmpSearch(e.target.value)}
                  className="pl-9 rounded-sm h-9"
                  data-testid="input-bulk-emp-search"
                />
              </div>
              <Select value={bulkEventFilter} onValueChange={v => { setBulkEventFilter(v); setBulkSelectedIds(new Set()); }}>
                <SelectTrigger className="h-9 w-40 rounded-sm" data-testid="select-bulk-event">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  {events.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={bulkDeptFilter} onValueChange={v => { setBulkDeptFilter(v); setBulkSelectedIds(new Set()); }}>
                <SelectTrigger className="h-9 w-40 rounded-sm" data-testid="select-bulk-dept">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {deptOptions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={bulkTypeFilter} onValueChange={v => { setBulkTypeFilter(v); setBulkSelectedIds(new Set()); }}>
                <SelectTrigger className="h-9 w-36 rounded-sm" data-testid="select-bulk-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="smp">SMP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border border-border rounded-sm overflow-hidden flex-1 overflow-y-auto min-h-0" style={{ maxHeight: "340px" }}>
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="w-10 pl-3">
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
                    <TableHead className={TH}>Emp #</TableHead>
                    <TableHead className={TH}>Name</TableHead>
                    <TableHead className={TH}>National ID</TableHead>
                    <TableHead className={TH}>Event</TableHead>
                    <TableHead className={TH}>Dept / Position</TableHead>
                    <TableHead className={TH}>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulkFilteredEmployees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No active employees match the current filters
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
                      <TableCell className="pl-3">
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
                      <TableCell className="font-mono text-xs text-muted-foreground">{w.employeeNumber}</TableCell>
                      <TableCell className="font-medium text-sm">{w.fullNameEn ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{w.nationalId ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{w.eventName ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{w.departmentName ? `${w.departmentName}${w.positionTitle ? ` / ${w.positionTitle}` : ""}` : w.positionTitle ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px]", w.employmentType === "smp" ? "bg-violet-500/10 text-violet-400 border-violet-500/30" : "bg-primary/10 text-primary border-primary/30")}>
                          {w.employmentType === "smp" ? "SMP" : "Individual"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {bulkFilteredEmployees.length} employee{bulkFilteredEmployees.length !== 1 ? "s" : ""} shown
                {bulkSelectedIds.size > 0 && <> · <span className="text-primary font-semibold">{bulkSelectedIds.size} selected</span></>}
              </span>
              {bulkSomeSelected && !bulkAllSelected && (
                <Button
                  variant="link"
                  size="sm"
                  className="text-xs h-auto p-0"
                  onClick={() => setBulkSelectedIds(new Set(bulkFilteredEmployees.map(w => w.id)))}
                  data-testid="button-select-all-filtered"
                >
                  Select all {bulkFilteredEmployees.length} matching
                </Button>
              )}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" className="rounded-sm" onClick={() => setBulkAssignOpen(false)}>Cancel</Button>
            <Button
              className="rounded-sm"
              disabled={!bulkAssetId || !bulkAssignDate || bulkSelectedIds.size === 0}
              onClick={() => setBulkConfirmOpen(true)}
              data-testid="button-bulk-assign-submit"
            >
              Assign to {bulkSelectedIds.size} Employee{bulkSelectedIds.size !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Assign Confirmation ────────────────────────────────────────── */}
      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent className="bg-card border-border text-foreground rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Bulk Assignment</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground space-y-2">
              <span className="block">
                Assign <span className="text-foreground font-semibold">"{assetList.find(a => a.id === bulkAssetId)?.name ?? "Asset"}"</span> to{" "}
                <span className="text-foreground font-semibold">{bulkSelectedIds.size} employee{bulkSelectedIds.size !== 1 ? "s" : ""}</span> on{" "}
                <span className="text-foreground font-semibold">{bulkAssignDate}</span>?
              </span>
              <span className="block text-sm">
                Employees who already have this asset assigned will be skipped. This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm">Cancel</AlertDialogCancel>
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
              {bulkAssignMut.isPending ? "Assigning…" : `Yes, Assign`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Asset Confirm ────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteAssetId} onOpenChange={o => !o && setDeleteAssetId(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Asset?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This removes the asset from the catalog. Existing assignment records are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-sm bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => deleteAssetId && deleteAsset.mutate(deleteAssetId)}
            >
              Delete Asset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Assignment Confirm ───────────────────────────────────────── */}
      <AlertDialog open={!!deleteAssignId} onOpenChange={o => !o && setDeleteAssignId(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Assignment?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This permanently removes the asset assignment record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-sm bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => deleteAssignId && deleteAssignment.mutate(deleteAssignId)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Return Confirmation ──────────────────────────────────────────────── */}
      <AlertDialog open={!!confirmReturn} onOpenChange={o => !o && setConfirmReturn(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Asset Return</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Mark <span className="font-semibold text-foreground">"{confirmReturn?.assetName}"</span> as returned
              by <span className="font-semibold text-foreground">{confirmReturn?.empName}</span>?
              This will record today as the return date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-sm bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={doMarkReturned}
              data-testid="button-confirm-return"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Confirm Return
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Lost / Not Returned Confirmation ────────────────────────────────── */}
      <AlertDialog open={!!confirmLost} onOpenChange={o => !o && setConfirmLost(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Asset as Lost?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Mark <span className="font-semibold text-foreground">"{confirmLost?.assetName}"</span> as not returned
              by <span className="font-semibold text-foreground">{confirmLost?.empName}</span>?
              {confirmLost?.price && parseFloat(confirmLost.price) > 0 && (
                <> This asset is valued at <span className="font-semibold text-red-400">SAR {parseFloat(confirmLost.price).toLocaleString("en", { minimumFractionDigits: 2 })}</span> and may be deducted from their settlement.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-sm bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={doMarkLost}
              data-testid="button-confirm-lost"
            >
              <PackageX className="h-4 w-4 mr-2" />
              Mark as Lost
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Bulk Status Confirmation ─────────────────────────────────────────── */}
      <AlertDialog open={!!bulkDialog} onOpenChange={o => !o && setBulkDialog(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkDialog?.status === "returned" ? "Mark All as Returned?" : "Mark All as Lost?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              You are about to update <span className="font-semibold text-foreground">{bulkDialog?.count} assignment(s)</span> with
              a total asset value of <span className="font-semibold text-foreground">SAR {(bulkDialog?.totalValue ?? 0).toLocaleString("en", { minimumFractionDigits: 2 })}</span>.
              {bulkDialog?.status === "not_returned" && (
                <> Assets marked as not returned may be deducted from employee settlements.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm">Cancel</AlertDialogCancel>
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
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing…</>
                : bulkDialog?.status === "returned"
                  ? <><RotateCcw className="h-4 w-4 mr-2" /> Confirm — Mark Returned</>
                  : <><PackageX className="h-4 w-4 mr-2" /> Confirm — Mark Lost</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </DashboardLayout>

    {/* ─── Floating Bulk Action Bar ─────────────────────────────────────────── */}
    {someSelected && createPortal(
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-card border border-border shadow-2xl rounded-lg px-5 py-3 animate-in slide-in-from-bottom-4">
        <span className="text-sm font-medium text-foreground">
          <span className="text-primary font-bold">{selectedIds.size}</span> assignment{selectedIds.size !== 1 ? "s" : ""} selected
        </span>
        <div className="w-px h-4 bg-border" />
        <Button
          size="sm"
          variant="outline"
          className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 rounded-sm h-8"
          onClick={() => openBulkDialog("returned")}
          data-testid="button-bulk-mark-returned"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Mark Returned
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-red-500/40 text-red-400 hover:bg-red-500/10 rounded-sm h-8"
          onClick={() => openBulkDialog("not_returned")}
          data-testid="button-bulk-mark-lost"
        >
          <PackageX className="h-3.5 w-3.5 mr-1.5" />
          Mark Lost
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => setSelectedIds(new Set())}
          data-testid="button-clear-selection"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>,
      document.body
    )}
    </>
  );
}
