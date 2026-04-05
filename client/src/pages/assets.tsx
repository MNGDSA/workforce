import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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
}

const CATEGORIES = ["Equipment", "Uniform", "Badge", "Device", "Vehicle", "Tools", "Other"];

const statusConfig = {
  assigned:     { label: "Assigned",     color: "bg-blue-500/10 text-blue-400 border-blue-500/20",   icon: PackageCheck },
  returned:     { label: "Returned",     color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: CheckCircle2 },
  not_returned: { label: "Not Returned", color: "bg-red-500/10 text-red-400 border-red-500/20",      icon: PackageX },
};

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AssetsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // ─── Catalog state ────────────────────────────────────────────────────────
  const [catalogSearch, setCatalogSearch] = useState("");
  const [assetDialog, setAssetDialog] = useState<{ open: boolean; editing?: Asset }>({ open: false });
  const [deleteAssetId, setDeleteAssetId] = useState<string | null>(null);
  const [assetForm, setAssetForm] = useState({ name: "", description: "", category: "", price: "", isActive: true });

  // ─── Assignments state ────────────────────────────────────────────────────
  const [assignSearch, setAssignSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignForm, setAssignForm] = useState({ workforceId: "", assetId: "", assignedAt: localDate(), notes: "" });
  const [empSearch, setEmpSearch] = useState("");
  const [deleteAssignId, setDeleteAssignId] = useState<string | null>(null);

  // ─── Queries ─────────────────────────────────────────────────────────────
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

  // ─── Asset mutations ──────────────────────────────────────────────────────
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

  // ─── Assignment mutations ─────────────────────────────────────────────────
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

  // ─── Derived data ─────────────────────────────────────────────────────────
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

  // ─── Handlers ────────────────────────────────────────────────────────────
  function openNewAsset() {
    setAssetForm({ name: "", description: "", category: "", price: "", isActive: true });
    setAssetDialog({ open: true });
  }

  function openEditAsset(a: Asset) {
    setAssetForm({ name: a.name, description: a.description ?? "", category: a.category ?? "", price: a.price, isActive: a.isActive });
    setAssetDialog({ open: true, editing: a });
  }

  function submitAsset() {
    const payload = {
      name: assetForm.name.trim(),
      description: assetForm.description.trim() || null,
      category: assetForm.category || null,
      price: assetForm.price,
      isActive: assetForm.isActive,
    };
    if (assetDialog.editing) {
      updateAsset.mutate({ id: assetDialog.editing.id, data: payload });
    } else {
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

  function markReturned(id: string) {
    updateAssignment.mutate({ id, data: { status: "returned", returnedAt: localDate() } });
  }

  function markNotReturned(id: string) {
    updateAssignment.mutate({ id, data: { status: "not_returned" } });
  }

  // ─── Stats ────────────────────────────────────────────────────────────────
  const totalValue = assignments
    .filter(a => a.status === "assigned")
    .reduce((sum, a) => sum + parseFloat(assetMap.get(a.assetId)?.price ?? "0"), 0);
  const notReturnedValue = assignments
    .filter(a => a.status === "not_returned")
    .reduce((sum, a) => sum + parseFloat(assetMap.get(a.assetId)?.price ?? "0"), 0);

  const isPending = createAsset.isPending || updateAsset.isPending;
  const isAssigning = assignAsset.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-sm bg-primary/10 border border-primary/20">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Asset Management</h1>
            <p className="text-sm text-muted-foreground">Track equipment issued to employees</p>
          </div>
        </div>
        <Button onClick={openNewAsset} className="gap-2 rounded-sm" data-testid="button-new-asset">
          <Plus className="h-4 w-4" />
          New Asset
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Catalog Items",   value: assetList.filter(a => a.isActive).length, icon: Package,       color: "text-primary" },
          { label: "Assigned",        value: assignments.filter(a => a.status === "assigned").length, icon: PackageCheck, color: "text-blue-400" },
          { label: "Asset Value Out", value: `SAR ${totalValue.toLocaleString("en", { minimumFractionDigits: 2 })}`, icon: UserCheck,    color: "text-amber-400" },
          { label: "Not Returned",    value: `SAR ${notReturnedValue.toLocaleString("en", { minimumFractionDigits: 2 })}`, icon: AlertTriangle, color: "text-red-400" },
        ].map(c => (
          <div key={c.label} className="rounded-sm border border-border bg-card p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
              <c.icon className={cn("h-4 w-4", c.color)} />
              {c.label}
            </div>
            <div className="text-xl font-bold text-foreground" data-testid={`stat-${c.label.toLowerCase().replace(/ /g, "-")}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="catalog">
        <TabsList className="rounded-sm">
          <TabsTrigger value="catalog" className="rounded-sm" data-testid="tab-catalog">Asset Catalog</TabsTrigger>
          <TabsTrigger value="assignments" className="rounded-sm" data-testid="tab-assignments">Assignments</TabsTrigger>
        </TabsList>

        {/* ─── Catalog Tab ─────────────────────────────────────────────── */}
        <TabsContent value="catalog" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search assets..."
                value={catalogSearch}
                onChange={e => setCatalogSearch(e.target.value)}
                className="pl-9 rounded-sm"
                data-testid="input-catalog-search"
              />
            </div>
          </div>

          <div className="rounded-sm border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Asset Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Price (SAR)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingAssets ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filteredAssets.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No assets found</TableCell></TableRow>
                ) : filteredAssets.map(asset => (
                  <TableRow key={asset.id} data-testid={`row-asset-${asset.id}`} className="hover:bg-muted/20">
                    <TableCell>
                      <div className="font-medium text-foreground">{asset.name}</div>
                      {asset.description && <div className="text-xs text-muted-foreground mt-0.5">{asset.description}</div>}
                    </TableCell>
                    <TableCell>
                      {asset.category ? (
                        <span className="text-sm text-muted-foreground">{asset.category}</span>
                      ) : (
                        <span className="text-muted-foreground/50 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono font-semibold text-foreground">
                        {parseFloat(asset.price).toLocaleString("en", { minimumFractionDigits: 2 })}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded-sm text-xs", asset.isActive ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/10" : "border-border text-muted-foreground")}>
                        {asset.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditAsset(asset)} data-testid={`button-edit-asset-${asset.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteAssetId(asset.id)} data-testid={`button-delete-asset-${asset.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ─── Assignments Tab ──────────────────────────────────────────── */}
        <TabsContent value="assignments" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by employee or asset..."
                value={assignSearch}
                onChange={e => setAssignSearch(e.target.value)}
                className="pl-9 rounded-sm"
                data-testid="input-assign-search"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
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
            <Button onClick={() => { setAssignForm({ workforceId: "", assetId: "", assignedAt: localDate(), notes: "" }); setEmpSearch(""); setAssignDialog(true); }} className="gap-2 rounded-sm ml-auto" data-testid="button-assign-asset">
              <Plus className="h-4 w-4" />
              Assign Asset
            </Button>
          </div>

          <div className="rounded-sm border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Price (SAR)</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Returned</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingAssign ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filteredAssignments.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No assignments found</TableCell></TableRow>
                ) : filteredAssignments.map(ea => {
                  const emp = workforceMap.get(ea.workforceId);
                  const asset = assetMap.get(ea.assetId);
                  const sc = statusConfig[ea.status];
                  const StatusIcon = sc.icon;
                  return (
                    <TableRow key={ea.id} data-testid={`row-assignment-${ea.id}`} className="hover:bg-muted/20">
                      <TableCell>
                        <div className="font-medium text-foreground">{emp?.fullNameEn ?? "—"}</div>
                        <div className="text-xs text-muted-foreground font-mono">{emp?.employeeNumber ?? ""}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("rounded-sm text-xs", emp?.employmentType === "smp" ? "border-violet-500/20 text-violet-400 bg-violet-500/10" : "border-primary/20 text-primary bg-primary/10")}>
                          {emp?.employmentType === "smp" ? "SMP" : "Individual"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground">{asset?.name ?? "—"}</div>
                        {asset?.category && <div className="text-xs text-muted-foreground">{asset.category}</div>}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{parseFloat(asset?.price ?? "0").toLocaleString("en", { minimumFractionDigits: 2 })}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{ea.assignedAt}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{ea.returnedAt ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("rounded-sm text-xs flex items-center gap-1 w-fit", sc.color)}>
                          <StatusIcon className="h-3 w-3" />
                          {sc.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {ea.status === "assigned" && (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10" onClick={() => markReturned(ea.id)} data-testid={`button-return-${ea.id}`}>
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Return
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => markNotReturned(ea.id)} data-testid={`button-not-returned-${ea.id}`}>
                                <PackageX className="h-3 w-3 mr-1" />
                                Lost
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteAssignId(ea.id)} data-testid={`button-delete-assign-${ea.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Asset Dialog ────────────────────────────────────────────────── */}
      <Dialog open={assetDialog.open} onOpenChange={o => setAssetDialog({ open: o })}>
        <DialogContent className="max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle>{assetDialog.editing ? "Edit Asset" : "New Asset"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="asset-name">Asset Name *</Label>
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
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-price">Price (SAR) *</Label>
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
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-desc">Description</Label>
              <Textarea
                id="asset-desc"
                placeholder="Optional notes about this asset..."
                value={assetForm.description}
                onChange={e => setAssetForm(f => ({ ...f, description: e.target.value }))}
                className="rounded-sm resize-none h-20"
                data-testid="input-asset-description"
              />
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium">Status</Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAssetForm(f => ({ ...f, isActive: true }))}
                  className={cn("px-3 py-1 text-xs rounded-sm border transition-colors", assetForm.isActive ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "border-border text-muted-foreground hover:border-muted-foreground")}
                  data-testid="button-asset-active"
                >Active</button>
                <button
                  type="button"
                  onClick={() => setAssetForm(f => ({ ...f, isActive: false }))}
                  className={cn("px-3 py-1 text-xs rounded-sm border transition-colors", !assetForm.isActive ? "bg-muted border-muted-foreground text-foreground" : "border-border text-muted-foreground hover:border-muted-foreground")}
                  data-testid="button-asset-inactive"
                >Inactive</button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setAssetDialog({ open: false })}>Cancel</Button>
            <Button className="rounded-sm" onClick={submitAsset} disabled={!assetForm.name || !assetForm.price || isPending} data-testid="button-save-asset">
              {isPending ? "Saving..." : assetDialog.editing ? "Save Changes" : "Create Asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Assign Dialog ───────────────────────────────────────────────── */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle>Assign Asset to Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Employee picker */}
            <div className="space-y-1.5">
              <Label>Employee *</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or employee #..."
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                  className="pl-9 rounded-sm"
                  data-testid="input-emp-search"
                />
              </div>
              {empSearch && (
                <div className="border border-border rounded-sm max-h-40 overflow-y-auto divide-y divide-border">
                  {filteredEmployees.length === 0
                    ? <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
                    : filteredEmployees.map(w => (
                      <button
                        key={w.id}
                        type="button"
                        className={cn("w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors", assignForm.workforceId === w.id && "bg-primary/10 text-primary")}
                        onClick={() => { setAssignForm(f => ({ ...f, workforceId: w.id })); setEmpSearch(w.fullNameEn ?? w.employeeNumber); }}
                        data-testid={`emp-option-${w.id}`}
                      >
                        <span className="font-medium">{w.fullNameEn ?? "—"}</span>
                        <span className="ml-2 text-muted-foreground font-mono text-xs">#{w.employeeNumber}</span>
                        <Badge variant="outline" className={cn("ml-2 rounded-sm text-xs", w.employmentType === "smp" ? "border-violet-500/20 text-violet-400" : "border-primary/20 text-primary")}>
                          {w.employmentType === "smp" ? "SMP" : "Individual"}
                        </Badge>
                      </button>
                    ))
                  }
                </div>
              )}
            </div>

            {/* Asset picker */}
            <div className="space-y-1.5">
              <Label>Asset *</Label>
              <Select value={assignForm.assetId} onValueChange={v => setAssignForm(f => ({ ...f, assetId: v }))}>
                <SelectTrigger className="rounded-sm" data-testid="select-assign-asset">
                  <SelectValue placeholder="Select an asset..." />
                </SelectTrigger>
                <SelectContent>
                  {assetList.filter(a => a.isActive).map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} — SAR {parseFloat(a.price).toLocaleString("en", { minimumFractionDigits: 2 })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assigned-at">Assignment Date *</Label>
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
                placeholder="Optional notes..."
                value={assignForm.notes}
                onChange={e => setAssignForm(f => ({ ...f, notes: e.target.value }))}
                className="rounded-sm resize-none h-16"
                data-testid="input-assign-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setAssignDialog(false)}>Cancel</Button>
            <Button
              className="rounded-sm"
              onClick={submitAssign}
              disabled={!assignForm.workforceId || !assignForm.assetId || !assignForm.assignedAt || isAssigning}
              data-testid="button-save-assign"
            >
              {isAssigning ? "Assigning..." : "Assign Asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Asset Confirm ────────────────────────────────────────── */}
      <AlertDialog open={!!deleteAssetId} onOpenChange={o => !o && setDeleteAssetId(null)}>
        <AlertDialogContent className="rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Asset?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the asset from the catalog. Existing assignments will retain their record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-sm bg-destructive hover:bg-destructive/90" onClick={() => deleteAssetId && deleteAsset.mutate(deleteAssetId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Assignment Confirm ───────────────────────────────────── */}
      <AlertDialog open={!!deleteAssignId} onOpenChange={o => !o && setDeleteAssignId(null)}>
        <AlertDialogContent className="rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the asset assignment record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-sm bg-destructive hover:bg-destructive/90" onClick={() => deleteAssignId && deleteAssignment.mutate(deleteAssignId)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
