import { useState, useCallback, useMemo, useEffect, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  MarkerType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import {
  Building2,
  Users,
  ChevronDown,
  ChevronRight,
  User,
  CreditCard,
  Phone,
  Search,
  Network,
  Loader2,
  AlertCircle,
  X,
  Printer,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/lib/format";

interface OrgEmployee {
  id: string;
  fullName: string;
  candidateId: string;
  employeeNumber: string;
  fullNameEn: string;
  nationalId: string | null;
  phone: string | null;
  photoUrl: string | null;
}

interface OrgPosition {
  id: string;
  title: string;
  code: string;
  gradeLevel: number | null;
  parentPositionId: string | null;
  employeeCount: number;
  employees: OrgEmployee[];
}

interface OrgDepartment {
  id: string;
  name: string;
  code: string;
  totalEmployees: number;
  positions: OrgPosition[];
}

interface OrgChartData {
  departments: OrgDepartment[];
  unassigned: OrgEmployee[];
  totalEmployees: number;
}

// Task #281 — People (Reports To) view types. The endpoint serialises a
// manager hierarchy with each manager carrying a `directReportEmployees`
// array of workforce rows that report into them, and a `directReportManagers`
// array for the manager-of-manager chain.
interface PeopleEmployee {
  id: string;
  candidateId: string;
  employeeNumber: string;
  fullNameEn: string | null;
  phone: string | null;
  photoUrl: string | null;
  positionTitle: string | null;
}

interface PeopleManager {
  id: string;
  fullNameEn: string;
  fullNameAr: string | null;
  email: string | null;
  phone: string | null;
  departmentId: string | null;
  departmentName: string | null;
  positionId: string | null;
  positionTitle: string | null;
  directReportManagers: PeopleManager[];
  directReportEmployees: PeopleEmployee[];
  reportCount: number;
}

interface PeopleChartData {
  view: "people";
  rootManagers: PeopleManager[];
  unmanagedEmployees: PeopleEmployee[];
  totalManagers: number;
  totalEmployees: number;
}

interface ManagerNodeData extends Record<string, unknown> {
  label: string;
  managerId: string;
  departmentName: string | null;
  positionTitle: string | null;
  reportCount: number;
  selected: boolean;
}

interface UnmanagedNodeData extends Record<string, unknown> {
  label: string;
  count: number;
  selected: boolean;
}

type ManagerNode = Node<ManagerNodeData, "manager">;
type UnmanagedNode = Node<UnmanagedNodeData, "unmanaged">;

interface DeptNodeData extends Record<string, unknown> {
  label: string;
  deptId: string;
  totalEmployees: number;
  expanded: boolean;
}

interface PosNodeData extends Record<string, unknown> {
  label: string;
  posId: string;
  code: string;
  gradeLevel: number | null;
  employeeCount: number;
  hasChildren: boolean;
  childrenExpanded: boolean;
  selected: boolean;
}

interface UnassignedNodeData extends Record<string, unknown> {
  label: string;
  count: number;
}

type DeptNode = Node<DeptNodeData, "department">;
type PosNode = Node<PosNodeData, "position">;
type UnassignedNode = Node<UnassignedNodeData, "unassigned">;

const NODE_WIDTH = 260;
const DEPT_NODE_HEIGHT = 80;
const POS_NODE_HEIGHT = 64;
const NODE_GAP_X = 40;
const NODE_GAP_Y = 60;

function DepartmentNodeComponent({ data }: NodeProps<DeptNode>) {
  return (
    <div
      className="group cursor-pointer select-none"
      data-testid={`node-dept-${data.deptId}`}
    >
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
      <div className={cn(
        "relative w-[260px] rounded-sm border transition-all duration-300 overflow-hidden",
        "bg-gradient-to-br from-[hsl(155,45%,12%)] to-[hsl(220,15%,11%)]",
        data.expanded
          ? "border-[hsl(155,45%,45%)] shadow-[0_0_30px_rgba(52,168,120,0.15)]"
          : "border-[hsl(220,15%,22%)] hover:border-[hsl(155,45%,35%)] hover:shadow-[0_0_20px_rgba(52,168,120,0.1)]",
      )}>
        <div className="absolute inset-y-0 start-0 w-1 bg-[hsl(155,45%,45%)]" />
        <div className="px-4 py-3.5 ps-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex-shrink-0 w-8 h-8 rounded-sm bg-[hsl(155,45%,45%)]/15 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-[hsl(155,45%,55%)]" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-bold text-sm text-white truncate leading-tight">{data.label}</h3>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ms-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-semibold bg-[hsl(155,45%,45%)]/15 text-[hsl(155,45%,55%)] border border-[hsl(155,45%,45%)]/20">
                <Users className="w-3 h-3" />
                {data.totalEmployees}
              </span>
              <div className="text-[hsl(215,15%,50%)] transition-transform duration-200">
                {data.expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PositionNodeComponent({ data }: NodeProps<PosNode>) {
  return (
    <div data-testid={`node-pos-${data.posId}`} className="select-none cursor-pointer">
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
      <div className={cn(
        "w-[260px] rounded-sm border transition-all duration-200",
        data.selected
          ? "border-[hsl(155,45%,45%)] shadow-[0_0_20px_rgba(52,168,120,0.2)] bg-[hsl(220,15%,13%)]"
          : data.employeeCount === 0
            ? "border-dashed border-[hsl(220,15%,22%)] bg-[hsl(220,15%,11%)]/80"
            : "border-[hsl(220,15%,22%)] bg-[hsl(220,15%,12%)] hover:border-[hsl(155,45%,35%)]/60",
      )}>
        <div className="px-3.5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn(
              "flex-shrink-0 w-7 h-7 rounded-sm flex items-center justify-center",
              data.employeeCount > 0 ? "bg-[hsl(155,45%,45%)]/10" : "bg-[hsl(220,10%,20%)]"
            )}>
              <Users className={cn("w-3.5 h-3.5", data.employeeCount > 0 ? "text-[hsl(155,45%,55%)]" : "text-[hsl(215,15%,40%)]")} />
            </div>
            <div className="min-w-0">
              <p className={cn("text-sm font-semibold truncate leading-tight", data.employeeCount > 0 ? "text-white" : "text-[hsl(215,15%,50%)]")}>{data.label}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {data.gradeLevel !== null && data.gradeLevel !== undefined && (
                  <span className="text-[10px] px-1.5 py-px rounded-sm bg-[hsl(190,80%,50%)]/10 text-[hsl(190,80%,60%)] font-bold border border-[hsl(190,80%,50%)]/15">G{data.gradeLevel}</span>
                )}
                <span className="text-[10px] text-[hsl(215,15%,45%)] font-mono">{data.code}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 ms-2">
            <span className={cn(
              "inline-flex items-center justify-center min-w-[26px] h-[22px] px-1.5 rounded-sm text-xs font-bold",
              data.employeeCount > 0
                ? "bg-[hsl(155,45%,45%)]/15 text-[hsl(155,45%,55%)] border border-[hsl(155,45%,45%)]/20"
                : "bg-[hsl(220,10%,18%)] text-[hsl(215,15%,40%)] border border-[hsl(220,15%,20%)]"
            )}>
              {data.employeeCount}
            </span>
            {data.hasChildren && (
              <div className={cn("text-[hsl(215,15%,45%)]", data.childrenExpanded && "text-[hsl(155,45%,50%)]")}>
                {data.childrenExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UnassignedNodeComponent({ data }: NodeProps<UnassignedNode>) {
  return (
    <div data-testid="node-unassigned" className="select-none cursor-pointer">
      <div className="w-[260px] rounded-sm border border-dashed border-[hsl(40,70%,45%)]/40 bg-[hsl(40,20%,10%)] transition-all hover:border-[hsl(40,70%,50%)]/60">
        <div className="px-3.5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-sm bg-[hsl(40,70%,45%)]/10 flex items-center justify-center">
              <AlertCircle className="w-3.5 h-3.5 text-[hsl(40,70%,55%)]" />
            </div>
            <p className="text-sm font-semibold text-[hsl(40,70%,65%)]">{data.label}</p>
          </div>
          <span className="inline-flex items-center justify-center min-w-[26px] h-[22px] px-1.5 rounded-sm text-xs font-bold bg-[hsl(40,70%,45%)]/15 text-[hsl(40,70%,55%)] border border-[hsl(40,70%,45%)]/20">
            {data.count}
          </span>
        </div>
      </div>
    </div>
  );
}

function EmployeeDrawer({
  position,
  employees,
  onClose,
}: {
  position: { title: string; code: string; gradeLevel: number | null } | null;
  employees: OrgEmployee[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation(["orgChart"]);
  const lng = i18n.language;
  const [search, setSearch] = useState("");
  const filtered = search
    ? employees.filter(e =>
        e.fullName.toLowerCase().includes(search.toLowerCase()) ||
        (e.nationalId && e.nationalId.includes(search)) ||
        e.employeeNumber.includes(search) ||
        (e.phone && e.phone.includes(search))
      )
    : employees;

  if (!position) return null;

  return (
    <div
      className="absolute top-0 end-0 h-full w-[340px] bg-[hsl(220,15%,9%)] border-s border-[hsl(220,15%,18%)] z-50 flex flex-col shadow-2xl"
      data-testid="employee-drawer"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(220,15%,18%)]">
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-bold text-sm text-white truncate"><bdi>{position.title}</bdi></h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-[hsl(215,15%,45%)] font-mono" dir="ltr">{position.code}</span>
            {position.gradeLevel !== null && position.gradeLevel !== undefined && (
              <span className="text-[10px] px-1.5 py-px rounded-sm bg-[hsl(190,80%,50%)]/10 text-[hsl(190,80%,60%)] font-bold border border-[hsl(190,80%,50%)]/15" dir="ltr">G{formatNumber(position.gradeLevel, lng)}</span>
            )}
            <span className="text-[10px] text-[hsl(155,45%,55%)] font-semibold">{t("orgChart:drawer.employeesCount", { n: formatNumber(employees.length, lng) })}</span>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-sm hover:bg-[hsl(220,15%,15%)] text-[hsl(215,15%,50%)] hover:text-white transition-colors" data-testid="btn-close-drawer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {employees.length > 20 && (
        <div className="px-4 pt-3">
          <div className="relative">
            <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(215,15%,45%)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("orgChart:drawer.searchPh")}
              className="h-8 text-xs ps-8 bg-[hsl(220,15%,12%)] border-[hsl(220,15%,20%)] focus-visible:ring-[hsl(155,45%,45%)]"
              data-testid="input-search-employees"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {filtered.map((emp) => (
          <div
            key={emp.id}
            className="px-4 py-2 flex items-start gap-3 hover:bg-[hsl(220,15%,13%)] transition-colors"
            data-testid={`emp-row-${emp.employeeNumber}`}
          >
            <div className="w-8 h-8 rounded-full bg-[hsl(220,10%,20%)] flex-shrink-0 flex items-center justify-center overflow-hidden border border-[hsl(220,15%,25%)]">
              {emp.photoUrl ? (
                <img src={emp.photoUrl} alt="" className="w-full h-full object-cover rounded-full" />
              ) : (
                <User className="w-4 h-4 text-[hsl(215,15%,50%)]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate leading-tight"><bdi>{emp.fullName}</bdi></p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                <span className="text-[10px] text-[hsl(215,15%,50%)] font-mono" dir="ltr">#{emp.employeeNumber}</span>
                {emp.nationalId && (
                  <span className="text-[10px] text-[hsl(215,15%,40%)] flex items-center gap-0.5" dir="ltr">
                    <CreditCard className="w-2.5 h-2.5" />{emp.nationalId}
                  </span>
                )}
                {emp.phone && (
                  <span className="text-[10px] text-[hsl(215,15%,40%)] flex items-center gap-0.5" dir="ltr">
                    <Phone className="w-2.5 h-2.5" />{emp.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && search && (
          <p className="text-xs text-[hsl(215,15%,45%)] text-center py-6">{t("orgChart:drawer.noMatch")}</p>
        )}
      </div>
    </div>
  );
}

// Task #281 — Manager and Unmanaged-employees nodes for the People view.
// Shape mirrors the existing position/unassigned cards so the look-and-feel
// stays consistent across both segmented modes.
function ManagerNodeComponent({ data }: NodeProps<ManagerNode>) {
  return (
    <div data-testid={`node-mgr-${data.managerId}`} className="select-none cursor-pointer">
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
      <div className={cn(
        "w-[260px] rounded-sm border transition-all duration-200",
        data.selected
          ? "border-[hsl(155,45%,45%)] shadow-[0_0_20px_rgba(52,168,120,0.2)] bg-[hsl(220,15%,13%)]"
          : data.reportCount === 0
            ? "border-dashed border-[hsl(220,15%,22%)] bg-[hsl(220,15%,11%)]/80"
            : "border-[hsl(220,15%,22%)] bg-[hsl(220,15%,12%)] hover:border-[hsl(155,45%,35%)]/60",
      )}>
        <div className="px-3.5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn(
              "flex-shrink-0 w-7 h-7 rounded-sm flex items-center justify-center",
              data.reportCount > 0 ? "bg-[hsl(155,45%,45%)]/10" : "bg-[hsl(220,10%,20%)]"
            )}>
              <User className={cn("w-3.5 h-3.5", data.reportCount > 0 ? "text-[hsl(155,45%,55%)]" : "text-[hsl(215,15%,40%)]")} />
            </div>
            <div className="min-w-0">
              <p className={cn("text-sm font-semibold truncate leading-tight", data.reportCount > 0 ? "text-white" : "text-[hsl(215,15%,50%)]")}>
                <bdi>{data.label}</bdi>
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {data.positionTitle && (
                  <span className="text-[10px] text-[hsl(215,15%,55%)] truncate"><bdi>{data.positionTitle}</bdi></span>
                )}
                {data.departmentName && (
                  <span className="text-[10px] text-[hsl(215,15%,40%)] truncate"><bdi>{data.departmentName}</bdi></span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 ms-2">
            <span className={cn(
              "inline-flex items-center justify-center min-w-[26px] h-[22px] px-1.5 rounded-sm text-xs font-bold",
              data.reportCount > 0
                ? "bg-[hsl(155,45%,45%)]/15 text-[hsl(155,45%,55%)] border border-[hsl(155,45%,45%)]/20"
                : "bg-[hsl(220,10%,18%)] text-[hsl(215,15%,40%)] border border-[hsl(220,15%,20%)]"
            )}>
              {data.reportCount}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function UnmanagedNodeComponent({ data }: NodeProps<UnmanagedNode>) {
  return (
    <div data-testid="node-unmanaged" className="select-none cursor-pointer">
      <div className={cn(
        "w-[260px] rounded-sm border transition-all",
        data.selected
          ? "border-[hsl(40,70%,55%)] shadow-[0_0_20px_rgba(220,170,60,0.2)] bg-[hsl(40,20%,12%)]"
          : "border-dashed border-[hsl(40,70%,45%)]/40 bg-[hsl(40,20%,10%)] hover:border-[hsl(40,70%,50%)]/60",
      )}>
        <div className="px-3.5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-sm bg-[hsl(40,70%,45%)]/10 flex items-center justify-center">
              <AlertCircle className="w-3.5 h-3.5 text-[hsl(40,70%,55%)]" />
            </div>
            <p className="text-sm font-semibold text-[hsl(40,70%,65%)]">{data.label}</p>
          </div>
          <span className="inline-flex items-center justify-center min-w-[26px] h-[22px] px-1.5 rounded-sm text-xs font-bold bg-[hsl(40,70%,45%)]/15 text-[hsl(40,70%,55%)] border border-[hsl(40,70%,45%)]/20">
            {data.count}
          </span>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = {
  department: memo(DepartmentNodeComponent),
  position: memo(PositionNodeComponent),
  unassigned: memo(UnassignedNodeComponent),
  manager: memo(ManagerNodeComponent),
  unmanaged: memo(UnmanagedNodeComponent),
};

function buildLayout(
  data: OrgChartData,
  expandedDepts: Set<string>,
  expandedPositions: Set<string>,
  selectedPosId: string | null,
  unassignedLabel: string,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: NODE_GAP_X, ranksep: NODE_GAP_Y, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  const depts = data.departments;

  depts.forEach((dept) => {
    const deptNodeId = `dept-${dept.id}`;
    const isDeptExpanded = expandedDepts.has(dept.id);

    g.setNode(deptNodeId, { width: NODE_WIDTH, height: DEPT_NODE_HEIGHT });

    const deptData: DeptNodeData = {
      label: dept.name,
      deptId: dept.id,
      totalEmployees: dept.totalEmployees,
      expanded: isDeptExpanded,
    };

    nodes.push({
      id: deptNodeId,
      type: "department",
      position: { x: 0, y: 0 },
      data: deptData,
    });

    if (isDeptExpanded) {
      const rootPositions = dept.positions.filter(
        p => !p.parentPositionId || !dept.positions.find(pp => pp.id === p.parentPositionId)
      );

      function addPositionNode(pos: OrgPosition, parentNodeId: string) {
        const posNodeId = `pos-${pos.id}`;
        const children = dept.positions.filter(p => p.parentPositionId === pos.id);
        const isPosExpanded = expandedPositions.has(pos.id);

        g.setNode(posNodeId, { width: NODE_WIDTH, height: POS_NODE_HEIGHT });
        g.setEdge(parentNodeId, posNodeId);

        const posData: PosNodeData = {
          label: pos.title,
          posId: pos.id,
          code: pos.code,
          gradeLevel: pos.gradeLevel,
          employeeCount: pos.employeeCount,
          hasChildren: children.length > 0,
          childrenExpanded: isPosExpanded,
          selected: selectedPosId === pos.id,
        };

        nodes.push({
          id: posNodeId,
          type: "position",
          position: { x: 0, y: 0 },
          data: posData,
        });

        edges.push({
          id: `e-${parentNodeId}-${posNodeId}`,
          source: parentNodeId,
          target: posNodeId,
          type: "smoothstep",
          style: { stroke: "hsl(155, 45%, 35%)", strokeWidth: 1.5, opacity: 0.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(155, 45%, 35%)", width: 12, height: 12 },
        });

        if (isPosExpanded && children.length > 0) {
          children.forEach(child => addPositionNode(child, posNodeId));
        }
      }

      rootPositions.forEach(pos => addPositionNode(pos, deptNodeId));
    }
  });

  if (data.unassigned.length > 0) {
    const unId = "unassigned";
    g.setNode(unId, { width: NODE_WIDTH, height: POS_NODE_HEIGHT });

    const unData: UnassignedNodeData = { label: unassignedLabel, count: data.unassigned.length };
    nodes.push({
      id: unId,
      type: "unassigned",
      position: { x: 0, y: 0 },
      data: unData,
    });
  }

  dagre.layout(g);

  nodes.forEach(node => {
    const n = g.node(node.id);
    if (n) {
      node.position = { x: n.x - (n.width || NODE_WIDTH) / 2, y: n.y - (n.height || POS_NODE_HEIGHT) / 2 };
    }
  });

  return { nodes, edges };
}

// Task #281 — People layout. Walks the manager hierarchy returned by
// `/api/org-chart?view=people` into a top-down tree and emits dagre nodes
// for every manager, plus a single "Unmanaged" node holding orphaned
// employees. Manager-of-manager edges are drawn as smoothstep arrows like
// position parent→child edges. The edge style is intentionally identical
// so the two views feel like the same canvas.
function buildPeopleLayout(
  data: PeopleChartData,
  selectedManagerId: string | null,
  unmanagedLabel: string,
  preferAr: boolean,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: NODE_GAP_X, ranksep: NODE_GAP_Y, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  const visited = new Set<string>();
  function addManagerNode(m: PeopleManager, parentNodeId: string | null) {
    if (visited.has(m.id)) return; // defensive against cycles
    visited.add(m.id);
    const nodeId = `mgr-${m.id}`;
    g.setNode(nodeId, { width: NODE_WIDTH, height: POS_NODE_HEIGHT });
    if (parentNodeId) g.setEdge(parentNodeId, nodeId);

    const label = preferAr ? (m.fullNameAr || m.fullNameEn) : m.fullNameEn;
    nodes.push({
      id: nodeId,
      type: "manager",
      position: { x: 0, y: 0 },
      data: {
        label,
        managerId: m.id,
        departmentName: m.departmentName,
        positionTitle: m.positionTitle,
        reportCount: m.reportCount,
        selected: selectedManagerId === m.id,
      } satisfies ManagerNodeData,
    });

    if (parentNodeId) {
      edges.push({
        id: `e-${parentNodeId}-${nodeId}`,
        source: parentNodeId,
        target: nodeId,
        type: "smoothstep",
        style: { stroke: "hsl(155, 45%, 35%)", strokeWidth: 1.5, opacity: 0.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(155, 45%, 35%)", width: 12, height: 12 },
      });
    }

    for (const child of m.directReportManagers) addManagerNode(child, nodeId);
  }

  for (const root of data.rootManagers) addManagerNode(root, null);

  if (data.unmanagedEmployees.length > 0) {
    const unId = "unmanaged";
    g.setNode(unId, { width: NODE_WIDTH, height: POS_NODE_HEIGHT });
    nodes.push({
      id: unId,
      type: "unmanaged",
      position: { x: 0, y: 0 },
      data: {
        label: unmanagedLabel,
        count: data.unmanagedEmployees.length,
        selected: selectedManagerId === "__unmanaged__",
      } satisfies UnmanagedNodeData,
    });
  }

  dagre.layout(g);

  nodes.forEach(node => {
    const n = g.node(node.id);
    if (n) {
      node.position = { x: n.x - (n.width || NODE_WIDTH) / 2, y: n.y - (n.height || POS_NODE_HEIGHT) / 2 };
    }
  });

  return { nodes, edges };
}

/* ── Print-to-PDF ──────────────────────────────────────────────────────
   Renders the FULL org chart (everything expanded) as a static HTML/SVG
   document inside a hidden iframe and triggers the browser's native
   print dialog, where the user can pick "Save as PDF". The page CSS is
   sized so the entire structure fits on a single A3 landscape sheet
   regardless of the chart size — admins can then zoom into the PDF
   without losing fidelity (the text is rendered as real text, not a
   raster image). No new dependencies; uses pure HTML + inline SVG +
   window.print(). Arabic renders correctly because the print document
   re-loads the same Cairo web font we use in the app. */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface PrintLabels {
  documentTitle: string;
  generated: string;
  departments: string;
  positions: string;
  employees: string;
  legendDepartment: string;
  legendPosition: string;
  legendUnassigned: string;
  unassignedLabel: string;
  employeesShort: string;
}

function buildPrintHtml(
  data: OrgChartData,
  labels: PrintLabels,
  dir: "rtl" | "ltr",
  generatedAt: string,
): string | null {
  // Force every department + position expanded so the printed copy
  // shows the entire hierarchy.
  const allDeptIds = new Set(data.departments.map(d => d.id));
  const allPosIds = new Set(
    data.departments.flatMap(d => d.positions.map(p => p.id)),
  );
  const { nodes, edges } = buildLayout(
    data,
    allDeptIds,
    allPosIds,
    null,
    labels.unassignedLabel,
  );

  if (nodes.length === 0) return null;

  // Compute bounding box of all nodes.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const nodeHeights: Record<string, number> = {};
  for (const n of nodes) {
    const h = n.type === "department" ? DEPT_NODE_HEIGHT : POS_NODE_HEIGHT;
    nodeHeights[n.id] = h;
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + NODE_WIDTH);
    maxY = Math.max(maxY, n.position.y + h);
  }
  // Pad the bounds so node borders / shadows aren't clipped.
  const PAD = 24;
  const contentW = (maxX - minX) + PAD * 2;
  const contentH = (maxY - minY) + PAD * 2;

  // Render each node as an absolutely-positioned div (translated so the
  // top-left of the bounding box becomes (PAD, PAD) inside the canvas).
  const nodeHtml = nodes.map(node => {
    const left = node.position.x - minX + PAD;
    const top = node.position.y - minY + PAD;
    const h = nodeHeights[node.id];
    const d = node.data as Record<string, unknown>;
    const baseStyle = `left:${left}px;top:${top}px;width:${NODE_WIDTH}px;height:${h}px`;

    if (node.type === "department") {
      const label = String(d.label ?? "");
      const total = Number(d.totalEmployees ?? 0);
      return `<div class="node node-dept" style="${baseStyle}">
        <div class="dept-stripe"></div>
        <div class="node-inner">
          <div class="node-title"><bdi>${escapeHtml(label)}</bdi></div>
          <div class="node-meta">${total} ${escapeHtml(labels.employees)}</div>
        </div>
      </div>`;
    }
    if (node.type === "position") {
      const label = String(d.label ?? "");
      const code = String(d.code ?? "");
      const grade = d.gradeLevel;
      const count = Number(d.employeeCount ?? 0);
      const gradeBadge = (grade !== null && grade !== undefined)
        ? `<span class="badge badge-grade" dir="ltr">G${escapeHtml(String(grade))}</span>`
        : "";
      const codeBadge = code
        ? `<span class="badge badge-code" dir="ltr">${escapeHtml(code)}</span>`
        : "";
      const empty = count === 0 ? " node-pos-empty" : "";
      return `<div class="node node-pos${empty}" style="${baseStyle}">
        <div class="node-inner">
          <div class="node-title"><bdi>${escapeHtml(label)}</bdi></div>
          <div class="node-meta">${gradeBadge}${codeBadge}<span class="badge badge-count">${count} ${escapeHtml(labels.employeesShort)}</span></div>
        </div>
      </div>`;
    }
    if (node.type === "unassigned") {
      const label = String(d.label ?? "");
      const count = Number(d.count ?? 0);
      return `<div class="node node-un" style="${baseStyle}">
        <div class="node-inner">
          <div class="node-title"><bdi>${escapeHtml(label)}</bdi></div>
          <div class="node-meta"><span class="badge badge-count badge-un">${count}</span></div>
        </div>
      </div>`;
    }
    return "";
  }).join("");

  // Render edges as orthogonal SVG paths (source bottom -> mid -> target top).
  const edgeSvg = edges.map(edge => {
    const src = nodes.find(n => n.id === edge.source);
    const tgt = nodes.find(n => n.id === edge.target);
    if (!src || !tgt) return "";
    const srcH = nodeHeights[src.id];
    const x1 = src.position.x - minX + PAD + NODE_WIDTH / 2;
    const y1 = src.position.y - minY + PAD + srcH;
    const x2 = tgt.position.x - minX + PAD + NODE_WIDTH / 2;
    const y2 = tgt.position.y - minY + PAD;
    const midY = (y1 + y2) / 2;
    return `<path d="M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}" />`;
  }).join("");

  const totalDepts = data.departments.length;
  const totalPositions = data.departments.reduce(
    (s, dept) => s + dept.positions.length, 0,
  );
  const totalEmployees = data.totalEmployees;

  // Print page sizing:
  //   A3 landscape = 420mm × 297mm.
  //   With 10mm margins on all sides (set via @page) the printable area is
  //   400mm × 277mm. We let CSS scale the chart wrapper to fit that area
  //   while preserving aspect ratio — entire structure on one page,
  //   admins can zoom in their PDF viewer.
  // (We keep the wrapper laid out in pixels — same coordinate system
  //  dagre produced — and rely on `transform: scale()` to fit the page.)
  return `<!DOCTYPE html>
<html lang="${dir === "rtl" ? "ar" : "en"}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(labels.documentTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page { size: A3 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: 'Cairo', system-ui, -apple-system, sans-serif;
      background: #ffffff;
      color: #0f1419;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8mm;
      padding: 4mm;
    }
    .page-header {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #d4d8dd;
      padding-bottom: 4mm;
    }
    .page-title {
      font-size: 18pt;
      font-weight: 800;
      margin: 0;
      letter-spacing: -0.01em;
    }
    .page-stats {
      display: flex;
      gap: 14px;
      font-size: 9pt;
      color: #4b5563;
    }
    .page-stats strong { color: #0f1419; font-weight: 700; }
    .legend {
      display: flex;
      gap: 14px;
      font-size: 8pt;
      color: #4b5563;
      align-items: center;
    }
    .legend-item { display: inline-flex; align-items: center; gap: 5px; }
    .legend-dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
    .dot-dept { background: #2c8a5f; }
    .dot-pos { background: #0f1419; }
    .dot-un { background: #c79a3a; }

    .chart-wrapper {
      /* We compute the scale at print time via CSS calc using the
         intrinsic content size and a fixed printable area. Width and
         height are explicitly sized here so the transform's scale
         math is predictable. The transform-origin keeps the chart
         anchored to the start of the wrapper. */
      width: ${contentW}px;
      height: ${contentH}px;
      position: relative;
      transform-origin: top left;
    }
    /* On screen, just show at native size with a scrollable area so the
       user can sanity-check before printing. */
    @media screen {
      body { padding: 16px; }
      .chart-wrapper {
        border: 1px solid #e2e6ea;
        border-radius: 4px;
        background: #fafbfc;
      }
    }
    /* On print, compute scale-to-fit. We use a wrapper with explicit
       pixel dimensions and apply the scale via JS after load — avoids
       any browser inconsistency with calc inside transform. */
    @media print {
      .page { padding: 0; gap: 4mm; }
      .page-header { border-bottom-color: #9ca3af; }
    }

    .edges {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: visible;
    }
    .edges path {
      stroke: #6b7280;
      stroke-width: 1.5;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .node {
      position: absolute;
      border-radius: 4px;
      overflow: hidden;
      background: #ffffff;
    }
    .node-inner {
      padding: 8px 12px;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 4px;
    }
    .node-title {
      font-size: 11pt;
      font-weight: 700;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .node-meta {
      font-size: 8pt;
      color: #4b5563;
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
    }

    .node-dept {
      border: 1.5px solid #2c8a5f;
      background: #f0f8f3;
    }
    .node-dept .dept-stripe {
      position: absolute;
      top: 0;
      bottom: 0;
      inset-inline-start: 0;
      width: 4px;
      background: #2c8a5f;
    }
    .node-dept .node-inner { padding-inline-start: 14px; }
    .node-dept .node-title { color: #0f1419; }

    .node-pos {
      border: 1px solid #cbd5dc;
      background: #ffffff;
    }
    .node-pos-empty {
      border-style: dashed;
      background: #fafbfc;
    }
    .node-pos-empty .node-title { color: #6b7280; font-weight: 600; }

    .node-un {
      border: 1px dashed #c79a3a;
      background: #fdf6e6;
    }
    .node-un .node-title { color: #8a6914; }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 7.5pt;
      font-weight: 700;
      line-height: 1.4;
      white-space: nowrap;
    }
    .badge-grade { background: #e0f2fb; color: #0c5d8a; border: 1px solid #b8e0f1; }
    .badge-code { background: transparent; color: #6b7280; font-family: ui-monospace, 'SF Mono', monospace; padding: 1px 0; font-weight: 600; font-size: 7pt; }
    .badge-count { background: #e7f3ec; color: #1f6e44; border: 1px solid #b9dfc8; }
    .node-pos-empty .badge-count { background: #f1f3f5; color: #6b7280; border-color: #d4d8dd; }
    .badge-un { background: #f5e7c4; color: #8a6914; border: 1px solid #e1c98a; }

    .page-footer {
      width: 100%;
      display: flex;
      justify-content: space-between;
      font-size: 8pt;
      color: #6b7280;
      padding-top: 4mm;
      border-top: 1px solid #e2e6ea;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">${escapeHtml(labels.documentTitle)}</h1>
      <div class="page-stats">
        <span><strong>${totalDepts}</strong> ${escapeHtml(labels.departments)}</span>
        <span><strong>${totalPositions}</strong> ${escapeHtml(labels.positions)}</span>
        <span><strong>${totalEmployees}</strong> ${escapeHtml(labels.employees)}</span>
      </div>
    </div>

    <div class="legend">
      <span class="legend-item"><span class="legend-dot dot-dept"></span>${escapeHtml(labels.legendDepartment)}</span>
      <span class="legend-item"><span class="legend-dot dot-pos"></span>${escapeHtml(labels.legendPosition)}</span>
      <span class="legend-item"><span class="legend-dot dot-un"></span>${escapeHtml(labels.legendUnassigned)}</span>
    </div>

    <div class="chart-wrapper" id="chart-wrapper">
      <svg class="edges" viewBox="0 0 ${contentW} ${contentH}" preserveAspectRatio="xMidYMid meet">
        ${edgeSvg}
      </svg>
      ${nodeHtml}
    </div>

    <div class="page-footer">
      <span>${escapeHtml(labels.generated)} ${escapeHtml(generatedAt)}</span>
      <span>${escapeHtml(labels.documentTitle)}</span>
    </div>
  </div>

  <script>
    // Scale the chart to fit the printable area. We measure the
    // available width inside .page (which expands to the page width
    // minus @page margin) and the available height (page height minus
    // header / legend / footer / gaps). Then apply a uniform scale so
    // the whole structure fits on a single page regardless of size.
    function fitChart() {
      var wrapper = document.getElementById('chart-wrapper');
      if (!wrapper) return;
      var page = wrapper.parentElement;
      if (!page) return;
      // Reset before measuring so the wrapper's natural size is used.
      wrapper.style.transform = '';
      // Available width = page content width.
      var pageRect = page.getBoundingClientRect();
      var availW = pageRect.width;
      // Available height = page content height - other children's heights - gaps.
      var usedH = 0;
      var gap = 0;
      var styles = window.getComputedStyle(page);
      gap = parseFloat(styles.rowGap || styles.gap || '0') || 0;
      var children = page.children;
      for (var i = 0; i < children.length; i++) {
        if (children[i] !== wrapper) {
          usedH += children[i].getBoundingClientRect().height;
        }
      }
      var availH = pageRect.height - usedH - gap * (children.length - 1);
      var natW = ${contentW};
      var natH = ${contentH};
      // Allow upscaling only modestly so a tiny chart isn't blurred up
      // (it would still be vector — but huge text looks odd). Cap at 3x.
      var scale = Math.min(availW / natW, availH / natH, 3);
      if (!isFinite(scale) || scale <= 0) scale = 1;
      // Center the scaled wrapper within the available width by adjusting
      // its margin (transform doesn't reflow, so we have to compensate).
      wrapper.style.transform = 'scale(' + scale + ')';
      wrapper.style.height = (natH * scale) + 'px';
      wrapper.style.width = (natW * scale) + 'px';
      // Re-set the transform origin so scaling is from top-left of the
      // (now-shrunk) box, keeping the layout predictable.
      wrapper.style.transformOrigin = 'top ${dir === "rtl" ? "right" : "left"}';
    }
    // Fit once fonts are ready (Cairo affects measured heights).
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitChart);
    } else {
      window.addEventListener('load', fitChart);
    }
    window.addEventListener('beforeprint', fitChart);
    window.addEventListener('resize', fitChart);
  </script>
</body>
</html>`;
}

interface ExportOptions {
  data: OrgChartData;
  labels: PrintLabels;
  dir: "rtl" | "ltr";
  onPopupBlocked?: () => void;
}

function exportOrgChartToPdf({ data, labels, dir, onPopupBlocked }: ExportOptions): void {
  // Latin digits + Gregorian calendar — never Arabic-Indic digits.
  const generatedAt = new Date().toLocaleString(dir === "rtl" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US");
  const html = buildPrintHtml(data, labels, dir, generatedAt);
  if (!html) return;

  // Use a hidden iframe rather than window.open(): bypasses popup
  // blockers, doesn't disturb the user's tab, and we can reliably
  // remove it after the print dialog closes.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  document.body.appendChild(iframe);

  const cleanup = () => {
    // Defer one tick so Safari has time to resolve print, then remove.
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 0);
  };

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    cleanup();
    onPopupBlocked?.();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  // Wait for the iframe's window to be ready, fonts loaded, and the
  // chart auto-scaled by the inline script. Then trigger print.
  const trigger = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore — some browsers throw if user dismisses */
    }
    // Most browsers fire `afterprint`; fall back to a timeout cleanup.
    let cleaned = false;
    const onAfter = () => {
      if (cleaned) return;
      cleaned = true;
      cleanup();
    };
    win.addEventListener("afterprint", onAfter);
    window.setTimeout(onAfter, 60_000);
  };

  // Fonts inside the iframe are what govern measured height; the inline
  // script in the print HTML already waits for `document.fonts.ready`,
  // so we only need to wait for the iframe to finish initial parsing.
  if (iframe.contentWindow && iframe.contentDocument?.readyState === "complete") {
    // Give the inline script a tick to run fitChart() once fonts resolve.
    window.setTimeout(trigger, 250);
  } else {
    iframe.addEventListener("load", () => window.setTimeout(trigger, 250), { once: true });
  }
}

function OrgChartCanvas() {
  const { t, i18n } = useTranslation(["orgChart"]);
  const lng = i18n.language;
  const preferAr = (lng || "").toLowerCase().startsWith("ar");
  // Task #281 — Segmented control toggles between the legacy department→
  // position→employee tree and the new manager-of-manager Reports To tree.
  // We hold both queries side-by-side so flipping the view is instant after
  // the first load (cached for staleTime).
  const [view, setView] = useState<"positions" | "people">("positions");
  const { data, isLoading, isError } = useQuery<OrgChartData>({
    queryKey: ["/api/org-chart"],
    queryFn: () => apiRequest("GET", "/api/org-chart").then(r => r.json()),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: view === "positions",
  });
  const {
    data: peopleData,
    isLoading: peopleLoading,
    isError: peopleError,
  } = useQuery<PeopleChartData>({
    queryKey: ["/api/org-chart", "people"],
    queryFn: () => apiRequest("GET", "/api/org-chart?view=people").then(r => r.json()),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: view === "people",
  });

  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set());
  const [selectedPosId, setSelectedPosId] = useState<string | null>(null);
  // Task #281 — selected manager id (or "__unmanaged__" sentinel for the
  // unmanaged-employees pseudo-node). Stored separately from `selectedPosId`
  // so each view has its own selection slot. Note: the segmented-control
  // handlers explicitly clear the *other* side's selection when toggling
  // (so a stale drawer can't appear under the new view).
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);

  const toggleDept = useCallback((deptId: string) => {
    setExpandedDepts(prev => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  }, []);

  const togglePosition = useCallback((posId: string) => {
    setExpandedPositions(prev => {
      const next = new Set(prev);
      if (next.has(posId)) next.delete(posId);
      else next.add(posId);
      return next;
    });
  }, []);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.type === "department" && node.id.startsWith("dept-")) {
      toggleDept(node.id.slice(5));
      setSelectedPosId(null);
    } else if (node.type === "position" && node.id.startsWith("pos-")) {
      const posId = node.id.slice(4);
      const posData = node.data as Record<string, unknown>;
      if (posData.hasChildren) {
        togglePosition(posId);
      }
      if (typeof posData.employeeCount === "number" && posData.employeeCount > 0) {
        setSelectedPosId(prev => prev === posId ? null : posId);
      }
    } else if (node.type === "unassigned") {
      setSelectedPosId(prev => prev === "__unassigned__" ? null : "__unassigned__");
    } else if (node.type === "manager" && node.id.startsWith("mgr-")) {
      // Task #281 — clicking a manager card opens the drawer with their
      // direct-report employees. Repeat clicks toggle.
      const mgrId = node.id.slice(4);
      setSelectedManagerId(prev => prev === mgrId ? null : mgrId);
    } else if (node.type === "unmanaged") {
      setSelectedManagerId(prev => prev === "__unmanaged__" ? null : "__unmanaged__");
    }
  }, [toggleDept, togglePosition]);

  const selectedPosition = useMemo(() => {
    if (!data || !selectedPosId) return null;
    if (selectedPosId === "__unassigned__") {
      return { position: { title: t("orgChart:unassignedTitle"), code: "N/A", gradeLevel: null }, employees: data.unassigned };
    }
    for (const dept of data.departments) {
      const pos = dept.positions.find(p => p.id === selectedPosId);
      if (pos) return { position: { title: pos.title, code: pos.code, gradeLevel: pos.gradeLevel }, employees: pos.employees };
    }
    return null;
  }, [data, selectedPosId, t]);

  // Task #281 — recursive lookup of a manager node by id within the
  // people-view tree. Used to resolve drawer contents when a manager card
  // is clicked.
  const findManagerById = useCallback((roots: PeopleManager[], id: string): PeopleManager | null => {
    for (const m of roots) {
      if (m.id === id) return m;
      const child = findManagerById(m.directReportManagers, id);
      if (child) return child;
    }
    return null;
  }, []);

  // Adapt PeopleEmployee[] → OrgEmployee[] so the existing EmployeeDrawer
  // renders direct reports without a parallel component. National-id is
  // omitted (people view doesn't ship it down to keep payload small).
  const adaptPeopleEmployees = useCallback((rows: PeopleEmployee[]): OrgEmployee[] => {
    return rows.map(e => ({
      id: e.id,
      fullName: e.fullNameEn || "",
      candidateId: e.candidateId,
      employeeNumber: e.employeeNumber,
      fullNameEn: e.fullNameEn || "",
      nationalId: null,
      phone: e.phone,
      photoUrl: e.photoUrl,
    }));
  }, []);

  const selectedManagerDrawer = useMemo(() => {
    if (view !== "people" || !peopleData || !selectedManagerId) return null;
    if (selectedManagerId === "__unmanaged__") {
      return {
        position: {
          title: t("orgChart:peopleView.unmanagedTitle"),
          code: "N/A",
          gradeLevel: null,
        },
        employees: adaptPeopleEmployees(peopleData.unmanagedEmployees),
      };
    }
    const m = findManagerById(peopleData.rootManagers, selectedManagerId);
    if (!m) return null;
    const label = preferAr ? (m.fullNameAr || m.fullNameEn) : m.fullNameEn;
    return {
      position: {
        title: label,
        code: m.positionTitle ?? (m.departmentName ?? ""),
        gradeLevel: null,
      },
      employees: adaptPeopleEmployees(m.directReportEmployees),
    };
  }, [view, peopleData, selectedManagerId, findManagerById, adaptPeopleEmployees, preferAr, t]);

  const unassignedLabel = t("orgChart:unassigned");
  const unmanagedLabel = t("orgChart:peopleView.unmanagedNode");

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(() => {
    if (view === "people") {
      if (!peopleData) return { nodes: [], edges: [] };
      return buildPeopleLayout(peopleData, selectedManagerId, unmanagedLabel, preferAr);
    }
    if (!data) return { nodes: [], edges: [] };
    return buildLayout(data, expandedDepts, expandedPositions, selectedPosId, unassignedLabel);
  }, [view, data, peopleData, expandedDepts, expandedPositions, selectedPosId, selectedManagerId, unassignedLabel, unmanagedLabel, preferAr]);

  const handlePrint = useCallback(() => {
    if (!data || data.departments.length === 0) return;
    exportOrgChartToPdf({
      data,
      dir: i18n.dir(lng) === "rtl" ? "rtl" : "ltr",
      labels: {
        documentTitle: t("orgChart:print.documentTitle"),
        generated: t("orgChart:print.footerGenerated"),
        departments: t("orgChart:print.footerDepartments"),
        positions: t("orgChart:print.footerPositions"),
        employees: t("orgChart:print.footerEmployees"),
        legendDepartment: t("orgChart:print.legendDepartment"),
        legendPosition: t("orgChart:print.legendPosition"),
        legendUnassigned: t("orgChart:print.legendUnassigned"),
        unassignedLabel,
        employeesShort: t("orgChart:print.footerEmployees"),
      },
      onPopupBlocked: () => {
        // eslint-disable-next-line no-alert -- intentional fallback when print iframe can't open
        window.alert(t("orgChart:print.popupBlocked"));
      },
    });
  }, [data, i18n, lng, t, unassignedLabel]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  useEffect(() => {
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [layoutNodes, layoutEdges, setNodes, setEdges]);

  const totalEmployees = data?.totalEmployees ?? 0;
  const totalDepts = data?.departments.length ?? 0;
  const totalPositions = data ? data.departments.reduce((s, d) => s + d.positions.length, 0) : 0;
  // Task #281 — people-view stat counters used by the right-hand legend
  // chips when the segmented control is on People.
  const peopleTotalManagers = peopleData?.totalManagers ?? 0;
  const peopleTotalEmployees = peopleData?.totalEmployees ?? 0;
  const peopleUnmanagedCount = peopleData?.unmanagedEmployees.length ?? 0;

  const showLoading = view === "positions" ? isLoading : peopleLoading;
  const showError = view === "positions" ? (isError || !data) : (peopleError || !peopleData);

  if (showLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[hsl(220,15%,8%)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[hsl(155,45%,45%)]" />
          <p className="text-sm text-[hsl(215,15%,55%)] font-medium">{t("orgChart:loading")}</p>
        </div>
      </div>
    );
  }

  if (showError) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[hsl(220,15%,8%)]">
        <div className="flex flex-col items-center gap-3">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <p className="text-sm text-[hsl(215,15%,55%)]">{t("orgChart:loadFailed")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative" data-testid="org-chart-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll
        className="org-chart-flow"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="hsl(220, 15%, 14%)"
        />
        <Controls
          showInteractive={false}
          className="org-chart-controls"
        />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === "department") return "hsl(155, 45%, 40%)";
            if (node.type === "unassigned") return "hsl(40, 70%, 45%)";
            if (node.type === "manager") return "hsl(155, 45%, 45%)";
            if (node.type === "unmanaged") return "hsl(40, 70%, 45%)";
            return "hsl(220, 15%, 30%)";
          }}
          maskColor="rgba(0,0,0,0.7)"
          className="org-chart-minimap"
          pannable
          zoomable
        />
        <Panel position="top-left" className="!m-0">
          <div className="bg-[hsl(220,15%,10%)]/90 backdrop-blur-md border border-[hsl(220,15%,20%)] rounded-sm p-3 shadow-2xl">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-7 h-7 rounded-sm bg-[hsl(155,45%,45%)]/15 flex items-center justify-center">
                <Network className="w-4 h-4 text-[hsl(155,45%,55%)]" />
              </div>
              <h2 className="font-display font-bold text-sm text-white tracking-tight flex-1">{t("orgChart:title")}</h2>
              <button
                type="button"
                onClick={handlePrint}
                disabled={view !== "positions" || !data || data.departments.length === 0}
                title={t("orgChart:print.aria")}
                aria-label={t("orgChart:print.aria")}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm text-[11px] font-semibold bg-[hsl(155,45%,45%)]/15 text-[hsl(155,45%,55%)] border border-[hsl(155,45%,45%)]/25 hover:bg-[hsl(155,45%,45%)]/25 hover:text-white hover:border-[hsl(155,45%,45%)]/45 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[hsl(155,45%,45%)]/15 disabled:hover:text-[hsl(155,45%,55%)]"
                data-testid="btn-print-org-chart"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{t("orgChart:print.button")}</span>
              </button>
            </div>
            {/* Task #281 — segmented control switches between Positions
                (legacy) and People (manager hierarchy). Built as plain
                buttons rather than a Radix Tabs to avoid pulling extra
                imports for two pills. */}
            <div className="flex items-center gap-1 mb-2 p-0.5 rounded-sm bg-[hsl(220,15%,8%)] border border-[hsl(220,15%,18%)]">
              <button
                type="button"
                onClick={() => { setView("positions"); setSelectedManagerId(null); }}
                className={cn(
                  "flex-1 px-2.5 py-1 rounded-sm text-[11px] font-semibold transition-colors",
                  view === "positions"
                    ? "bg-[hsl(155,45%,45%)]/20 text-[hsl(155,45%,65%)] border border-[hsl(155,45%,45%)]/30"
                    : "text-[hsl(215,15%,55%)] hover:text-white border border-transparent",
                )}
                data-testid="btn-view-positions"
              >
                <Building2 className="w-3 h-3 inline-block me-1 -mt-0.5" />
                {t("orgChart:viewToggle.positions")}
              </button>
              <button
                type="button"
                onClick={() => { setView("people"); setSelectedPosId(null); }}
                className={cn(
                  "flex-1 px-2.5 py-1 rounded-sm text-[11px] font-semibold transition-colors",
                  view === "people"
                    ? "bg-[hsl(155,45%,45%)]/20 text-[hsl(155,45%,65%)] border border-[hsl(155,45%,45%)]/30"
                    : "text-[hsl(215,15%,55%)] hover:text-white border border-transparent",
                )}
                data-testid="btn-view-people"
              >
                <User className="w-3 h-3 inline-block me-1 -mt-0.5" />
                {t("orgChart:viewToggle.people")}
              </button>
            </div>
            {view === "positions" ? (
              <div className="flex items-center gap-4 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[hsl(155,45%,45%)]" />
                  <span className="text-[hsl(215,15%,60%)]"><span className="font-bold text-white">{formatNumber(totalDepts, lng)}</span> {t("orgChart:stats.departments")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[hsl(190,80%,50%)]" />
                  <span className="text-[hsl(215,15%,60%)]"><span className="font-bold text-white">{formatNumber(totalPositions, lng)}</span> {t("orgChart:stats.positions")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-white" />
                  <span className="text-[hsl(215,15%,60%)]"><span className="font-bold text-white">{formatNumber(totalEmployees, lng)}</span> {t("orgChart:stats.employees")}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[hsl(155,45%,45%)]" />
                  <span className="text-[hsl(215,15%,60%)]"><span className="font-bold text-white">{formatNumber(peopleTotalManagers, lng)}</span> {t("orgChart:peopleView.statManagers")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-white" />
                  <span className="text-[hsl(215,15%,60%)]"><span className="font-bold text-white">{formatNumber(peopleTotalEmployees, lng)}</span> {t("orgChart:peopleView.statEmployees")}</span>
                </div>
                {peopleUnmanagedCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[hsl(40,70%,55%)]" />
                    <span className="text-[hsl(215,15%,60%)]"><span className="font-bold text-white">{formatNumber(peopleUnmanagedCount, lng)}</span> {t("orgChart:peopleView.statUnmanaged")}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Panel>

        {view === "positions" && data && data.departments.length === 0 && (
          <Panel position="top-center" className="!mt-24">
            <div className="bg-[hsl(220,15%,12%)] border border-[hsl(220,15%,20%)] rounded-sm p-8 text-center max-w-sm">
              <Building2 className="w-12 h-12 text-[hsl(215,15%,30%)] mx-auto mb-3" />
              <h3 className="font-display font-bold text-white text-lg mb-1">{t("orgChart:empty.title")}</h3>
              <p className="text-sm text-[hsl(215,15%,55%)]">{t("orgChart:empty.subtitle")}</p>
            </div>
          </Panel>
        )}

        {view === "people" && peopleData && peopleData.rootManagers.length === 0 && peopleData.unmanagedEmployees.length === 0 && (
          <Panel position="top-center" className="!mt-24">
            <div className="bg-[hsl(220,15%,12%)] border border-[hsl(220,15%,20%)] rounded-sm p-8 text-center max-w-sm">
              <User className="w-12 h-12 text-[hsl(215,15%,30%)] mx-auto mb-3" />
              <h3 className="font-display font-bold text-white text-lg mb-1">{t("orgChart:peopleView.emptyTitle")}</h3>
              <p className="text-sm text-[hsl(215,15%,55%)]">{t("orgChart:peopleView.emptySubtitle")}</p>
            </div>
          </Panel>
        )}
      </ReactFlow>

      {view === "positions" && selectedPosition && (
        <EmployeeDrawer
          position={selectedPosition.position}
          employees={selectedPosition.employees}
          onClose={() => setSelectedPosId(null)}
        />
      )}

      {view === "people" && selectedManagerDrawer && (
        <EmployeeDrawer
          position={selectedManagerDrawer.position}
          employees={selectedManagerDrawer.employees}
          onClose={() => setSelectedManagerId(null)}
        />
      )}
    </div>
  );
}

export default function OrgChartPage() {
  const { t } = useTranslation(["orgChart"]);
  return (
    <Layout>
      {/* Height accounts for the layout's sticky header (h-16 = 4rem) plus
          <main>'s vertical padding (p-6 = 3rem total mobile, lg:p-8 = 4rem
          total desktop). Without subtracting both, the React Flow canvas
          extends below the viewport and the bottom-anchored Controls /
          MiniMap get clipped. */}
      <div className="h-[calc(100vh-7rem)] lg:h-[calc(100vh-8rem)] w-full overflow-hidden" data-testid="page-org-chart">
        <OrgChartCanvas />
      </div>
    </Layout>
  );
}
