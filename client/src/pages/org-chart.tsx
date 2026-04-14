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
  Search,
  Network,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface OrgEmployee {
  candidateId: string;
  employeeNumber: string;
  fullNameEn: string;
  fullNameAr: string | null;
  nationalId: string | null;
  phone: string | null;
  photoUrl: string | null;
}

interface OrgPosition {
  id: string;
  title: string;
  titleAr: string | null;
  code: string;
  gradeLevel: number | null;
  parentPositionId: string | null;
  employeeCount: number;
  employees: OrgEmployee[];
}

interface OrgDepartment {
  id: string;
  name: string;
  nameAr: string | null;
  code: string;
  totalEmployees: number;
  positions: OrgPosition[];
}

interface OrgChartData {
  departments: OrgDepartment[];
  unassigned: OrgEmployee[];
}

interface DeptNodeData extends Record<string, unknown> {
  label: string;
  nameAr: string | null;
  deptId: string;
  totalEmployees: number;
  expanded: boolean;
}

interface PosNodeData extends Record<string, unknown> {
  label: string;
  titleAr: string | null;
  posId: string;
  code: string;
  gradeLevel: number | null;
  employeeCount: number;
  employees: OrgEmployee[];
  hasChildren: boolean;
  childrenExpanded: boolean;
}

interface UnassignedNodeData extends Record<string, unknown> {
  employees: OrgEmployee[];
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
        <div className="absolute inset-y-0 left-0 w-1 bg-[hsl(155,45%,45%)]" />
        <div className="px-4 py-3.5 pl-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex-shrink-0 w-8 h-8 rounded-sm bg-[hsl(155,45%,45%)]/15 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-[hsl(155,45%,55%)]" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-bold text-sm text-white truncate leading-tight">{data.label}</h3>
                {data.nameAr && (
                  <p className="text-[10px] text-[hsl(215,15%,55%)] truncate mt-0.5 font-medium" dir="rtl">{data.nameAr}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
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
  const [showEmployees, setShowEmployees] = useState(false);
  const [search, setSearch] = useState("");
  const employees = data.employees;
  const filtered = search
    ? employees.filter(e =>
        e.fullNameEn.toLowerCase().includes(search.toLowerCase()) ||
        (e.fullNameAr && e.fullNameAr.includes(search)) ||
        (e.nationalId && e.nationalId.includes(search)) ||
        e.employeeNumber.includes(search)
      )
    : employees;

  return (
    <div data-testid={`node-pos-${data.posId}`} className="select-none">
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
      <div className={cn(
        "w-[260px] rounded-sm border transition-all duration-200",
        data.employeeCount === 0
          ? "border-dashed border-[hsl(220,15%,22%)] bg-[hsl(220,15%,11%)]/80"
          : "border-[hsl(220,15%,22%)] bg-[hsl(220,15%,12%)] hover:border-[hsl(155,45%,35%)]/60",
      )}>
        <div
          className="px-3.5 py-2.5 flex items-center justify-between cursor-pointer"
          onClick={(e) => { e.stopPropagation(); if (data.employeeCount > 0) setShowEmployees(!showEmployees); }}
        >
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
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
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

        {showEmployees && data.employeeCount > 0 && (
          <div className="border-t border-[hsl(220,15%,18%)]">
            {employees.length > 8 && (
              <div className="px-3 pt-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[hsl(215,15%,45%)]" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search..."
                    className="h-7 text-xs pl-7 bg-[hsl(220,15%,10%)] border-[hsl(220,15%,20%)] focus-visible:ring-[hsl(155,45%,45%)]"
                    data-testid={`input-search-pos-${data.posId}`}
                  />
                </div>
              </div>
            )}
            <div className="max-h-[200px] overflow-y-auto py-1.5 scrollbar-thin">
              {filtered.map((emp) => (
                <div
                  key={emp.candidateId}
                  className="px-3 py-1.5 flex items-center gap-2.5 hover:bg-[hsl(220,15%,15%)] transition-colors"
                  data-testid={`emp-row-${emp.employeeNumber}`}
                >
                  <div className="w-6 h-6 rounded-full bg-[hsl(220,10%,20%)] flex-shrink-0 flex items-center justify-center overflow-hidden border border-[hsl(220,15%,25%)]">
                    {emp.photoUrl ? (
                      <img src={emp.photoUrl} alt="" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <User className="w-3 h-3 text-[hsl(215,15%,50%)]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-white truncate leading-tight">{emp.fullNameEn}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-[hsl(215,15%,50%)] font-mono">#{emp.employeeNumber}</span>
                      {emp.nationalId && (
                        <span className="text-[10px] text-[hsl(215,15%,40%)] flex items-center gap-0.5">
                          <CreditCard className="w-2.5 h-2.5" />{emp.nationalId}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && search && (
                <p className="text-xs text-[hsl(215,15%,45%)] text-center py-3">No match</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UnassignedNodeComponent({ data }: NodeProps<UnassignedNode>) {
  const [open, setOpen] = useState(false);
  const employees = data.employees;
  const [search, setSearch] = useState("");
  const filtered = search
    ? employees.filter(e =>
        e.fullNameEn.toLowerCase().includes(search.toLowerCase()) ||
        e.employeeNumber.includes(search)
      )
    : employees;

  return (
    <div data-testid="node-unassigned" className="select-none">
      <div className="w-[260px] rounded-sm border border-dashed border-[hsl(40,70%,45%)]/40 bg-[hsl(40,20%,10%)] transition-all">
        <div className="px-3.5 py-2.5 flex items-center justify-between cursor-pointer" onClick={() => setOpen(!open)}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-sm bg-[hsl(40,70%,45%)]/10 flex items-center justify-center">
              <AlertCircle className="w-3.5 h-3.5 text-[hsl(40,70%,55%)]" />
            </div>
            <p className="text-sm font-semibold text-[hsl(40,70%,65%)]">Unassigned</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center min-w-[26px] h-[22px] px-1.5 rounded-sm text-xs font-bold bg-[hsl(40,70%,45%)]/15 text-[hsl(40,70%,55%)] border border-[hsl(40,70%,45%)]/20">
              {employees.length}
            </span>
            {open ? <ChevronDown className="w-3.5 h-3.5 text-[hsl(40,70%,50%)]" /> : <ChevronRight className="w-3.5 h-3.5 text-[hsl(40,70%,50%)]" />}
          </div>
        </div>
        {open && (
          <div className="border-t border-[hsl(40,30%,15%)]">
            {employees.length > 8 && (
              <div className="px-3 pt-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[hsl(215,15%,45%)]" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="h-7 text-xs pl-7 bg-[hsl(220,15%,10%)] border-[hsl(220,15%,20%)]" />
                </div>
              </div>
            )}
            <div className="max-h-[200px] overflow-y-auto py-1.5">
              {filtered.map((emp) => (
                <div key={emp.candidateId} className="px-3 py-1.5 flex items-center gap-2.5 hover:bg-[hsl(220,15%,15%)]">
                  <div className="w-6 h-6 rounded-full bg-[hsl(220,10%,20%)] flex-shrink-0 flex items-center justify-center overflow-hidden border border-[hsl(220,15%,25%)]">
                    {emp.photoUrl ? <img src={emp.photoUrl} alt="" className="w-full h-full object-cover rounded-full" /> : <User className="w-3 h-3 text-[hsl(215,15%,50%)]" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-white truncate">{emp.fullNameEn}</p>
                    <span className="text-[10px] text-[hsl(215,15%,50%)] font-mono">#{emp.employeeNumber}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = {
  department: memo(DepartmentNodeComponent),
  position: memo(PositionNodeComponent),
  unassigned: memo(UnassignedNodeComponent),
};

function buildLayout(
  data: OrgChartData,
  expandedDepts: Set<string>,
  expandedPositions: Set<string>,
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
      nameAr: dept.nameAr,
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
          titleAr: pos.titleAr,
          posId: pos.id,
          code: pos.code,
          gradeLevel: pos.gradeLevel,
          employeeCount: pos.employeeCount,
          employees: pos.employees,
          hasChildren: children.length > 0,
          childrenExpanded: isPosExpanded,
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

    const unData: UnassignedNodeData = { employees: data.unassigned };
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

function OrgChartCanvas() {
  const { data, isLoading, isError } = useQuery<OrgChartData>({
    queryKey: ["/api/org-chart"],
    queryFn: () => apiRequest("GET", "/api/org-chart").then(r => r.json()),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set());

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
    if (node.type === "department") {
      const deptData = node.data as DeptNodeData;
      toggleDept(deptData.deptId);
    } else if (node.type === "position") {
      const posData = node.data as PosNodeData;
      if (posData.hasChildren) {
        togglePosition(posData.posId);
      }
    }
  }, [toggleDept, togglePosition]);

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    return buildLayout(data, expandedDepts, expandedPositions);
  }, [data, expandedDepts, expandedPositions]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  useEffect(() => {
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [layoutNodes, layoutEdges, setNodes, setEdges]);

  const totalEmployees = data ? data.departments.reduce((s, d) => s + d.totalEmployees, 0) + data.unassigned.length : 0;
  const totalDepts = data?.departments.length ?? 0;
  const totalPositions = data ? data.departments.reduce((s, d) => s + d.positions.length, 0) : 0;

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[hsl(220,15%,8%)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[hsl(155,45%,45%)]" />
          <p className="text-sm text-[hsl(215,15%,55%)] font-medium">Loading organization chart...</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[hsl(220,15%,8%)]">
        <div className="flex flex-col items-center gap-3">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <p className="text-sm text-[hsl(215,15%,55%)]">Failed to load org chart</p>
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
              <h2 className="font-display font-bold text-sm text-white tracking-tight">Organization Chart</h2>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[hsl(155,45%,45%)]" />
                <span className="text-[hsl(215,15%,60%)]"><span className="font-bold text-white">{totalDepts}</span> Departments</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[hsl(190,80%,50%)]" />
                <span className="text-[hsl(215,15%,60%)]"><span className="font-bold text-white">{totalPositions}</span> Positions</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-white" />
                <span className="text-[hsl(215,15%,60%)]"><span className="font-bold text-white">{totalEmployees}</span> Employees</span>
              </div>
            </div>
          </div>
        </Panel>

        {data.departments.length === 0 && (
          <Panel position="top-center" className="!mt-24">
            <div className="bg-[hsl(220,15%,12%)] border border-[hsl(220,15%,20%)] rounded-sm p-8 text-center max-w-sm">
              <Building2 className="w-12 h-12 text-[hsl(215,15%,30%)] mx-auto mb-3" />
              <h3 className="font-display font-bold text-white text-lg mb-1">No departments yet</h3>
              <p className="text-sm text-[hsl(215,15%,55%)]">Create departments and positions in Settings to see your org chart here.</p>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export default function OrgChartPage() {
  return (
    <Layout title="Org Chart">
      <div className="h-[calc(100vh-3.5rem)] w-full overflow-hidden" data-testid="page-org-chart">
        <OrgChartCanvas />
      </div>
    </Layout>
  );
}
