import { useState, useMemo, useEffect } from "react";
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
  Building2,
  Plus,
  Pencil,
  ChevronRight,
  Loader2,
  Power,
  PowerOff,
  Layers,
  CornerDownRight,
  Search,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/lib/format";

type Department = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
};

type Position = {
  id: string;
  departmentId: string;
  parentPositionId: string | null;
  title: string;
  code: string;
  description: string | null;
  gradeLevel: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  departmentName?: string;
};

type PositionNode = Position & { children: PositionNode[] };

function buildTree(positions: Position[]): PositionNode[] {
  const map = new Map<string, PositionNode>();
  const roots: PositionNode[] = [];

  for (const p of positions) {
    map.set(p.id, { ...p, children: [] });
  }

  for (const p of positions) {
    const node = map.get(p.id)!;
    if (p.parentPositionId && map.has(p.parentPositionId)) {
      map.get(p.parentPositionId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function PositionTreeNode({
  node,
  depth,
  onEdit,
  onToggle,
  onAddChild,
  togglePending,
}: {
  node: PositionNode;
  depth: number;
  onEdit: (p: Position) => void;
  onToggle: (id: string) => void;
  onAddChild: (parentId: string) => void;
  togglePending: boolean;
}) {
  const { t, i18n } = useTranslation(["departments"]);
  const isRtl = i18n.dir() === "rtl";
  return (
    <>
      <div
        className={`group flex items-center gap-2 py-2 px-3 rounded-sm transition-colors hover:bg-muted/30 ${
          !node.isActive ? "opacity-50" : ""
        }`}
        style={isRtl ? { paddingRight: `${12 + depth * 20}px` } : { paddingLeft: `${12 + depth * 20}px` }}
        data-testid={`position-row-${node.id}`}
      >
        {depth > 0 && <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 rtl:rotate-180" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate"><bdi>{node.title}</bdi></span>
            <span className="text-[10px] font-mono text-muted-foreground" dir="ltr">{node.code}</span>
            {node.gradeLevel !== null && (
              <span className="text-[10px] text-primary/70 bg-primary/10 px-1.5 rounded">
                {t("departments:common.grade", { n: formatNumber(node.gradeLevel, i18n.language) })}
              </span>
            )}
            {!node.isActive && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-0 bg-red-500/10 text-red-400">
                {t("departments:common.inactive")}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-white"
            onClick={() => onAddChild(node.id)}
            title={t("departments:posForm.addChildTitle")}
            data-testid={`button-add-child-${node.id}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-white"
            onClick={() => onEdit(node)}
            title={t("departments:posForm.editTitle")}
            data-testid={`button-edit-position-${node.id}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={`h-7 w-7 p-0 ${node.isActive ? "text-amber-400 hover:text-amber-300" : "text-green-400 hover:text-green-300"}`}
            onClick={() => onToggle(node.id)}
            disabled={togglePending}
            title={node.isActive ? t("departments:posForm.deactivateTitle") : t("departments:posForm.activateTitle")}
            data-testid={`button-toggle-position-${node.id}`}
          >
            {node.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      {node.children.map((child) => (
        <PositionTreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          onEdit={onEdit}
          onToggle={onToggle}
          onAddChild={onAddChild}
          togglePending={togglePending}
        />
      ))}
    </>
  );
}

function DepartmentForm({
  open,
  onOpenChange,
  department,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  department: Department | null;
}) {
  const { t } = useTranslation(["departments"]);
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!department;

  const [name, setName] = useState(department?.name ?? "");
  const [code, setCode] = useState(department?.code ?? "");
  const [description, setDescription] = useState(department?.description ?? "");
  const [sortOrder, setSortOrder] = useState(department?.sortOrder?.toString() ?? "0");

  useEffect(() => {
    if (open) {
      setName(department?.name ?? "");
      setCode(department?.code ?? "");
      setDescription(department?.description ?? "");
      setSortOrder(department?.sortOrder?.toString() ?? "0");
    }
  }, [open, department]);

  const mutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      isEdit
        ? apiRequest("PATCH", `/api/departments/${department!.id}`, data).then(r => r.json())
        : apiRequest("POST", "/api/departments", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/departments"] });
      onOpenChange(false);
      toast({ title: isEdit ? t("departments:deptForm.updatedToast") : t("departments:deptForm.createdToast") });
    },
    onError: (e: Error) => toast({ title: t("departments:deptForm.errorToast"), description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!name.trim() || !code.trim()) {
      toast({ title: t("departments:deptForm.required"), variant: "destructive" });
      return;
    }
    mutation.mutate({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      description: description.trim() || null,
      sortOrder: parseInt(sortOrder) || 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-zinc-950 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle className="font-display">{isEdit ? t("departments:deptForm.edit") : t("departments:deptForm.new")}</DialogTitle>
          <DialogDescription className="sr-only">{isEdit ? t("departments:deptForm.editDesc") : t("departments:deptForm.newDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-white">{t("departments:deptForm.name")} *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("departments:deptForm.namePh")}
              className="bg-muted/30 border-border"
              data-testid="input-dept-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white">{t("departments:deptForm.code")} *</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t("departments:deptForm.codePh")}
                maxLength={20}
                dir="ltr"
                className="bg-muted/30 border-border font-mono uppercase"
                data-testid="input-dept-code"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white">{t("departments:deptForm.sort")}</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                dir="ltr"
                className="bg-muted/30 border-border"
                data-testid="input-dept-sort"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-white">{t("departments:deptForm.description")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("departments:deptForm.descriptionPh")}
              rows={2}
              className="bg-muted/30 border-border resize-none"
              data-testid="input-dept-description"
            />
          </div>
          <Button
            className="w-full bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs h-10"
            onClick={handleSubmit}
            disabled={mutation.isPending}
            data-testid="button-save-dept"
          >
            {mutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {isEdit ? t("departments:deptForm.update") : t("departments:deptForm.create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PositionForm({
  open,
  onOpenChange,
  position,
  departmentId,
  parentPositionId,
  existingPositions,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  position: Position | null;
  departmentId: string;
  parentPositionId: string | null;
  existingPositions: Position[];
}) {
  const { t } = useTranslation(["departments"]);
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!position;

  const [title, setTitle] = useState(position?.title ?? "");
  const [code, setCode] = useState(position?.code ?? "");
  const [description, setDescription] = useState(position?.description ?? "");
  const [gradeLevel, setGradeLevel] = useState(position?.gradeLevel?.toString() ?? "");
  const [sortOrder, setSortOrder] = useState(position?.sortOrder?.toString() ?? "0");
  const [parentId, setParentId] = useState(position?.parentPositionId ?? parentPositionId ?? "none");

  useEffect(() => {
    if (open) {
      setTitle(position?.title ?? "");
      setCode(position?.code ?? "");
      setDescription(position?.description ?? "");
      setGradeLevel(position?.gradeLevel?.toString() ?? "");
      setSortOrder(position?.sortOrder?.toString() ?? "0");
      setParentId(position?.parentPositionId ?? parentPositionId ?? "none");
    }
  }, [open, position, parentPositionId]);

  const parentOptions = existingPositions.filter(
    (p) => p.id !== position?.id && p.isActive
  );

  const mutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      isEdit
        ? apiRequest("PATCH", `/api/positions/${position!.id}`, data).then(r => r.json())
        : apiRequest("POST", "/api/positions", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/positions"] });
      onOpenChange(false);
      toast({ title: isEdit ? t("departments:posForm.updatedToast") : t("departments:posForm.createdToast") });
    },
    onError: (e: Error) => toast({ title: t("departments:posForm.errorToast"), description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!title.trim() || !code.trim()) {
      toast({ title: t("departments:posForm.required"), variant: "destructive" });
      return;
    }
    mutation.mutate({
      departmentId,
      title: title.trim(),
      code: code.trim().toUpperCase(),
      description: description.trim() || null,
      gradeLevel: gradeLevel ? parseInt(gradeLevel) : null,
      sortOrder: parseInt(sortOrder) || 0,
      parentPositionId: parentId === "none" ? null : parentId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-zinc-950 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle className="font-display">{isEdit ? t("departments:posForm.edit") : t("departments:posForm.new")}</DialogTitle>
          <DialogDescription className="sr-only">{isEdit ? t("departments:posForm.editDesc") : t("departments:posForm.newDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-white">{t("departments:posForm.title")} *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("departments:posForm.titlePh")}
              className="bg-muted/30 border-border"
              data-testid="input-pos-title"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white">{t("departments:posForm.code")} *</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t("departments:posForm.codePh")}
                maxLength={20}
                dir="ltr"
                className="bg-muted/30 border-border font-mono uppercase"
                data-testid="input-pos-code"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white">{t("departments:posForm.grade")}</Label>
              <Input
                type="number"
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                placeholder="—"
                dir="ltr"
                className="bg-muted/30 border-border"
                data-testid="input-pos-grade"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white">{t("departments:posForm.sort")}</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                dir="ltr"
                className="bg-muted/30 border-border"
                data-testid="input-pos-sort"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-white">{t("departments:posForm.reportsTo")}</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger className="bg-muted/30 border-border" data-testid="select-pos-parent">
                <SelectValue placeholder={t("departments:posForm.noneRoot")} />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800">
                <SelectItem value="none">{t("departments:posForm.noneRoot")}</SelectItem>
                {parentOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <bdi>{p.title}</bdi> (<span dir="ltr">{p.code}</span>)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-white">{t("departments:posForm.description")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("departments:posForm.descriptionPh")}
              rows={2}
              className="bg-muted/30 border-border resize-none"
              data-testid="input-pos-description"
            />
          </div>
          <Button
            className="w-full bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs h-10"
            onClick={handleSubmit}
            disabled={mutation.isPending}
            data-testid="button-save-position"
          >
            {mutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {isEdit ? t("departments:posForm.update") : t("departments:posForm.create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DepartmentsPage() {
  const { t } = useTranslation(["departments"]);
  const qc = useQueryClient();
  const { toast } = useToast();

  const [showInactive, setShowInactive] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [deptFormOpen, setDeptFormOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [posFormOpen, setPosFormOpen] = useState(false);
  const [editingPos, setEditingPos] = useState<Position | null>(null);
  const [addChildParentId, setAddChildParentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: allDepartments = [], isLoading: deptsLoading } = useQuery<Department[]>({
    queryKey: ["/api/departments", showInactive],
    queryFn: () => apiRequest("GET", `/api/departments?includeInactive=${showInactive}`).then(r => r.json()),
  });

  const selectedDept = allDepartments.find((d) => d.id === selectedDeptId);

  const { data: deptPositions = [], isLoading: posLoading } = useQuery<Position[]>({
    queryKey: ["/api/positions", selectedDeptId, showInactive],
    queryFn: () =>
      apiRequest("GET", `/api/positions?departmentId=${selectedDeptId}&includeInactive=${showInactive}`).then(r => r.json()),
    enabled: !!selectedDeptId,
  });

  const positionTree = useMemo(() => buildTree(deptPositions), [deptPositions]);

  const activePositions = useMemo(
    () => deptPositions.filter((p) => p.isActive),
    [deptPositions]
  );
  const inactivePositions = useMemo(
    () => deptPositions.filter((p) => !p.isActive),
    [deptPositions]
  );

  const activeTree = useMemo(() => buildTree(activePositions), [activePositions]);
  const inactiveTree = useMemo(() => buildTree(inactivePositions), [inactivePositions]);

  const toggleDeptMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/departments/${id}/toggle-active`).then(r => {
        if (!r.ok) return r.json().then((d: any) => { throw new Error(d.message); });
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/departments"] });
      toast({ title: t("departments:toggle.deptUpdated") });
    },
    onError: (e: Error) => toast({ title: t("departments:toggle.cannotToggle"), description: e.message, variant: "destructive" }),
  });

  const togglePosMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/positions/${id}/toggle-active`).then(r => {
        if (!r.ok) return r.json().then((d: any) => { throw new Error(d.message); });
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/positions"] });
      toast({ title: t("departments:toggle.posUpdated") });
    },
    onError: (e: Error) => toast({ title: t("departments:toggle.cannotToggle"), description: e.message, variant: "destructive" }),
  });

  const filteredDepts = useMemo(() => {
    let list = allDepartments;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.code.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
    });
  }, [allDepartments, searchQuery]);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight" data-testid="text-page-title">
              {t("departments:page.title")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("departments:page.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={showInactive}
                onCheckedChange={setShowInactive}
                data-testid="switch-show-inactive"
              />
              <Label className="text-xs text-muted-foreground">{t("departments:page.showInactive")}</Label>
            </div>
            <Button
              className="bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs h-10"
              onClick={() => { setEditingDept(null); setDeptFormOpen(true); }}
              data-testid="button-add-department"
            >
              <Plus className="me-2 h-4 w-4" /> {t("departments:page.newDepartment")}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4">
            <Card className="bg-card border-border">
              <div className="p-3 border-b border-border">
                <div className="relative">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("departments:list.search")}
                    className="ps-9 bg-muted/30 border-border h-9 text-sm"
                    data-testid="input-search-departments"
                  />
                </div>
              </div>
              <CardContent className="p-0">
                {deptsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredDepts.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    <Building2 className="h-8 w-8 mx-auto mb-3 opacity-30" />
                    {allDepartments.length === 0
                      ? t("departments:list.emptyAll")
                      : t("departments:list.emptySearch")}
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredDepts.map((dept) => (
                      <button
                        key={dept.id}
                        onClick={() => setSelectedDeptId(dept.id)}
                        className={`w-full text-start px-4 py-3 flex items-center gap-3 transition-colors group ${
                          selectedDeptId === dept.id
                            ? "bg-primary/10 border-s-2 border-primary"
                            : "hover:bg-muted/30 border-s-2 border-transparent"
                        } ${!dept.isActive ? "opacity-50" : ""}`}
                        data-testid={`dept-item-${dept.id}`}
                      >
                        <Building2 className={`h-4 w-4 flex-shrink-0 ${selectedDeptId === dept.id ? "text-primary" : "text-muted-foreground"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white truncate"><bdi>{dept.name}</bdi></span>
                            <span className="text-[10px] font-mono text-muted-foreground" dir="ltr">{dept.code}</span>
                          </div>
                          {!dept.isActive && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-0 bg-red-500/10 text-red-400 mt-0.5">
                              {t("departments:common.inactive")}
                            </Badge>
                          )}
                        </div>
                        <ChevronRight className={`h-4 w-4 flex-shrink-0 transition-colors rtl:rotate-180 ${
                          selectedDeptId === dept.id ? "text-primary" : "text-muted-foreground/30 group-hover:text-muted-foreground"
                        }`} />
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-8">
            {!selectedDept ? (
              <Card className="bg-card border-border">
                <CardContent className="py-20 text-center text-muted-foreground">
                  <Layers className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-medium text-white/60">{t("departments:panel.selectTitle")}</p>
                  <p className="text-sm mt-1">{t("departments:panel.selectHint")}</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-card border-border">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-display font-bold text-white" data-testid="text-selected-dept">
                        <bdi>{selectedDept.name}</bdi>
                      </h2>
                      <span className="text-xs font-mono text-muted-foreground" dir="ltr">{selectedDept.code}</span>
                      {!selectedDept.isActive && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-0 bg-red-500/10 text-red-400">
                          {t("departments:common.inactive")}
                        </Badge>
                      )}
                    </div>
                    {selectedDept.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{selectedDept.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-muted-foreground hover:text-white"
                      onClick={() => {
                        setEditingDept(selectedDept);
                        setDeptFormOpen(true);
                      }}
                      data-testid="button-edit-dept"
                    >
                      <Pencil className="h-3.5 w-3.5 me-1" /> {t("departments:panel.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={`h-8 text-xs ${selectedDept.isActive ? "text-amber-400 hover:text-amber-300" : "text-green-400 hover:text-green-300"}`}
                      onClick={() => toggleDeptMutation.mutate(selectedDept.id)}
                      disabled={toggleDeptMutation.isPending}
                      data-testid="button-toggle-dept"
                    >
                      {selectedDept.isActive ? (
                        <><PowerOff className="h-3.5 w-3.5 me-1" /> {t("departments:panel.deactivate")}</>
                      ) : (
                        <><Power className="h-3.5 w-3.5 me-1" /> {t("departments:panel.activate")}</>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      className="bg-primary text-primary-foreground font-bold uppercase tracking-wide text-[10px] h-8"
                      onClick={() => {
                        setEditingPos(null);
                        setAddChildParentId(null);
                        setPosFormOpen(true);
                      }}
                      data-testid="button-add-position"
                    >
                      <Plus className="h-3.5 w-3.5 me-1" /> {t("departments:panel.addPosition")}
                    </Button>
                  </div>
                </div>

                <CardContent className="p-0">
                  {posLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : deptPositions.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                      <Layers className="h-8 w-8 mx-auto mb-3 opacity-30" />
                      {t("departments:panel.noPositions")}
                    </div>
                  ) : (
                    <div className="divide-y divide-border/50">
                      {activeTree.map((node) => (
                        <PositionTreeNode
                          key={node.id}
                          node={node}
                          depth={0}
                          onEdit={(p) => {
                            setEditingPos(p);
                            setAddChildParentId(null);
                            setPosFormOpen(true);
                          }}
                          onToggle={(id) => togglePosMutation.mutate(id)}
                          onAddChild={(parentId) => {
                            setEditingPos(null);
                            setAddChildParentId(parentId);
                            setPosFormOpen(true);
                          }}
                          togglePending={togglePosMutation.isPending}
                        />
                      ))}

                      {showInactive && inactiveTree.length > 0 && (
                        <>
                          <div className="px-3 py-2 bg-muted/10">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                              {t("departments:panel.inactiveHeading")}
                            </span>
                          </div>
                          {inactiveTree.map((node) => (
                            <PositionTreeNode
                              key={node.id}
                              node={node}
                              depth={0}
                              onEdit={(p) => {
                                setEditingPos(p);
                                setAddChildParentId(null);
                                setPosFormOpen(true);
                              }}
                              onToggle={(id) => togglePosMutation.mutate(id)}
                              onAddChild={(parentId) => {
                                setEditingPos(null);
                                setAddChildParentId(parentId);
                                setPosFormOpen(true);
                              }}
                              togglePending={togglePosMutation.isPending}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <DepartmentForm
        open={deptFormOpen}
        onOpenChange={setDeptFormOpen}
        department={editingDept}
      />

      {selectedDeptId && (
        <PositionForm
          open={posFormOpen}
          onOpenChange={setPosFormOpen}
          position={editingPos}
          departmentId={selectedDeptId}
          parentPositionId={addChildParentId}
          existingPositions={deptPositions}
        />
      )}
    </DashboardLayout>
  );
}
