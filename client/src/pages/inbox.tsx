import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Inbox as InboxIcon,
  Search,
  CheckCircle2,
  XCircle,
  FileText,
  UserCheck,
  ClipboardList,
  Calendar,
  Package,
  Flag,
  Monitor,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  Filter,
  Clock,
  ListFilter,
  ArrowDownUp,
  RefreshCw,
  Clipboard,
  Eye,
  History,
  MapPin,
  Camera,
  ShieldCheck,
  ShieldAlert,
  User,
} from "lucide-react";
import { useLocation } from "wouter";

type InboxItem = {
  id: string;
  type: string;
  priority: string;
  status: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  assignedTo: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
};

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  document_review: { label: "Document Review", icon: FileText, color: "text-blue-400" },
  document_reupload: { label: "Document Reupload", icon: RefreshCw, color: "text-blue-300" },
  application_review: { label: "Application Review", icon: ClipboardList, color: "text-indigo-400" },
  onboarding_action: { label: "Onboarding", icon: UserCheck, color: "text-emerald-400" },
  contract_action: { label: "Contract", icon: FileText, color: "text-amber-400" },
  offboarding_action: { label: "Offboarding", icon: UserCheck, color: "text-rose-400" },
  schedule_conflict: { label: "Schedule Conflict", icon: Calendar, color: "text-orange-400" },
  asset_return: { label: "Asset Return", icon: Package, color: "text-cyan-400" },
  candidate_flag: { label: "Candidate Flag", icon: Flag, color: "text-red-400" },
  event_alert: { label: "Event Alert", icon: Calendar, color: "text-violet-400" },
  attendance_verification: { label: "Attendance", icon: Eye, color: "text-teal-400" },
  general_request: { label: "General Request", icon: Clipboard, color: "text-slate-300" },
  system: { label: "System", icon: Monitor, color: "text-gray-400" },
};

const PRIORITY_META: Record<string, { label: string; color: string; dotColor: string }> = {
  low: { label: "Low", color: "bg-slate-500/10 text-slate-400 border-slate-500/30", dotColor: "bg-slate-400" },
  medium: { label: "Medium", color: "bg-blue-500/10 text-blue-400 border-blue-500/30", dotColor: "bg-blue-400" },
  high: { label: "High", color: "bg-amber-500/10 text-amber-400 border-amber-500/30", dotColor: "bg-amber-400" },
  urgent: { label: "Urgent", color: "bg-red-500/10 text-red-400 border-red-500/30", dotColor: "bg-red-400" },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-primary/10 text-primary border-primary/30" },
  resolved: { label: "Resolved", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  dismissed: { label: "Dismissed", color: "bg-muted text-muted-foreground border-border" },
};

type TabValue = "all" | "pending" | "resolved" | "dismissed" | "history";

const TABS: { value: TabValue; label: string; icon: React.ElementType }[] = [
  { value: "all", label: "All", icon: ListFilter },
  { value: "pending", label: "Pending", icon: Clock },
  { value: "resolved", label: "Resolved", icon: CheckCircle2 },
  { value: "dismissed", label: "Dismissed", icon: XCircle },
  { value: "history", label: "History", icon: History },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-SA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function InboxPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<TabValue>("pending");
  const [typeFilter, setTypeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const limit = 20;

  const statusForApi = tab === "all" || tab === "history" ? undefined : tab;

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("limit", String(limit));
  if (statusForApi) queryParams.set("status", statusForApi);
  if (typeFilter !== "all") queryParams.set("type", typeFilter);
  if (priorityFilter !== "all") queryParams.set("priority", priorityFilter);
  if (search.trim()) queryParams.set("search", search.trim());
  queryParams.set("sortBy", sortBy);
  queryParams.set("sortOrder", sortOrder);

  const { data: rawData, isLoading } = useQuery<{ data: InboxItem[]; total: number }>({
    queryKey: ["/api/inbox", page, tab, typeFilter, priorityFilter, search, sortBy, sortOrder],
    queryFn: () => apiRequest("GET", `/api/inbox?${queryParams.toString()}`).then(r => r.json()),
  });

  const data = tab === "history" && rawData
    ? { data: rawData.data.filter(i => i.status !== "pending"), total: rawData.data.filter(i => i.status !== "pending").length }
    : rawData;

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/inbox/count"],
    queryFn: () => apiRequest("GET", "/api/inbox/count").then(r => r.json()),
    refetchInterval: 30_000,
  });

  const invalidateInbox = () => {
    qc.invalidateQueries({ queryKey: ["/api/inbox"] });
    qc.invalidateQueries({ queryKey: ["/api/inbox/count"] });
  };

  const resolveMut = useMutation({
    mutationFn: (params: { id: string; notes?: string }) => apiRequest("PATCH", `/api/inbox/${params.id}/resolve`, { notes: params.notes }),
    onSuccess: () => { invalidateInbox(); setExpandedId(null); setActionNotes(""); toast({ title: "Item resolved" }); },
    onError: () => toast({ title: "Failed to resolve item", variant: "destructive" }),
  });

  const dismissMut = useMutation({
    mutationFn: (params: { id: string; notes?: string }) => apiRequest("PATCH", `/api/inbox/${params.id}/dismiss`, { notes: params.notes }),
    onSuccess: () => { invalidateInbox(); setExpandedId(null); setActionNotes(""); toast({ title: "Item dismissed" }); },
    onError: () => toast({ title: "Failed to dismiss item", variant: "destructive" }),
  });

  const approveAttendanceMut = useMutation({
    mutationFn: (params: { entityId: string; notes?: string }) =>
      apiRequest("POST", `/api/attendance-mobile/submissions/${params.entityId}/approve`, { notes: params.notes }),
    onSuccess: () => { invalidateInbox(); setExpandedId(null); setActionNotes(""); toast({ title: "Attendance approved & verified" }); },
    onError: () => toast({ title: "Failed to approve attendance", variant: "destructive" }),
  });

  const rejectAttendanceMut = useMutation({
    mutationFn: (params: { entityId: string; notes?: string }) =>
      apiRequest("POST", `/api/attendance-mobile/submissions/${params.entityId}/reject`, { notes: params.notes }),
    onSuccess: () => { invalidateInbox(); setExpandedId(null); setActionNotes(""); toast({ title: "Attendance rejected" }); },
    onError: () => toast({ title: "Failed to reject attendance", variant: "destructive" }),
  });

  const bulkResolveMut = useMutation({
    mutationFn: (ids: string[]) => apiRequest("POST", "/api/inbox/bulk-resolve", { ids }),
    onSuccess: () => { invalidateInbox(); setSelected(new Set()); toast({ title: "Items resolved" }); },
    onError: () => toast({ title: "Failed to resolve items", variant: "destructive" }),
  });

  const bulkDismissMut = useMutation({
    mutationFn: (ids: string[]) => apiRequest("POST", "/api/inbox/bulk-dismiss", { ids }),
    onSuccess: () => { invalidateInbox(); setSelected(new Set()); toast({ title: "Items dismissed" }); },
    onError: () => toast({ title: "Failed to dismiss items", variant: "destructive" }),
  });

  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);
  const pendingCount = countData?.count ?? 0;

  const pendingItems = items.filter(i => i.status === "pending");

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === pendingItems.length && pendingItems.length > 0) setSelected(new Set());
    else setSelected(new Set(pendingItems.map(i => i.id)));
  };

  const switchTab = (newTab: TabValue) => {
    setTab(newTab);
    setPage(1);
    setSelected(new Set());
    setExpandedId(null);
    setActionNotes("");
  };

  const hasPendingInView = pendingItems.length > 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground" data-testid="text-inbox-title">HR Inbox</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Centralized action queue for HR tasks requiring attention
            </p>
          </div>
          {pendingCount > 0 && (
            <Badge variant="destructive" className="text-sm px-3 py-1" data-testid="badge-inbox-open-count">
              {pendingCount} pending
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 border-b border-border">
          {TABS.map(t => {
            const TabIcon = t.icon;
            return (
              <button
                key={t.value}
                data-testid={`tab-${t.value}`}
                onClick={() => switchTab(t.value)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.value
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <TabIcon className="h-4 w-4" />
                {t.label}
                {t.value === "pending" && pendingCount > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="input-inbox-search"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search inbox items..."
              className="pl-10 bg-muted/30 border-border h-9 rounded-sm"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); setSelected(new Set()); }}>
              <SelectTrigger className="h-9 w-[160px] rounded-sm text-xs" data-testid="select-inbox-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(TYPE_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={v => { setPriorityFilter(v); setPage(1); setSelected(new Set()); }}>
              <SelectTrigger className="h-9 w-[120px] rounded-sm text-xs" data-testid="select-inbox-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={`${sortBy}-${sortOrder}`} onValueChange={v => {
              const [sb, so] = v.split("-");
              setSortBy(sb);
              setSortOrder(so);
              setPage(1);
            }}>
              <SelectTrigger className="h-9 w-[150px] rounded-sm text-xs" data-testid="select-inbox-sort">
                <ArrowDownUp className="h-3 w-3 mr-1 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt-desc">Newest first</SelectItem>
                <SelectItem value="createdAt-asc">Oldest first</SelectItem>
                <SelectItem value="priority-desc">Priority (high→low)</SelectItem>
                <SelectItem value="priority-asc">Priority (low→high)</SelectItem>
                <SelectItem value="type-asc">Type (A→Z)</SelectItem>
                <SelectItem value="type-desc">Type (Z→A)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {selected.size > 0 && hasPendingInView && (
          <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 border border-border rounded-sm">
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => bulkResolveMut.mutate([...selected])}
              disabled={bulkResolveMut.isPending}
              data-testid="button-bulk-resolve"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Resolve All
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => bulkDismissMut.mutate([...selected])}
              disabled={bulkDismissMut.isPending}
              data-testid="button-bulk-dismiss"
            >
              <XCircle className="h-3.5 w-3.5" /> Dismiss All
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <InboxIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold text-foreground" data-testid="text-inbox-empty">
              {tab === "pending" ? "All clear" : tab === "all" ? "No items" : tab === "history" ? "No history" : `No ${tab} items`}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {tab === "pending" ? "No pending items require your attention." : "No inbox items match your current filters."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {hasPendingInView && (
              <div className="flex items-center gap-3 px-4 py-1">
                <Checkbox
                  checked={selected.size === pendingItems.length && pendingItems.length > 0}
                  onCheckedChange={toggleAll}
                  data-testid="checkbox-select-all"
                />
                <span className="text-xs text-muted-foreground">
                  {total} item{total !== 1 ? "s" : ""} total
                </span>
              </div>
            )}

            {items.map(item => {
              const typeMeta = TYPE_META[item.type] ?? TYPE_META.system;
              const priorityMeta = PRIORITY_META[item.priority] ?? PRIORITY_META.medium;
              const statusMeta = STATUS_META[item.status] ?? STATUS_META.pending;
              const Icon = typeMeta.icon;
              const isPending = item.status === "pending";
              const isExpanded = expandedId === item.id;

              return (
                <Card
                  key={item.id}
                  data-testid={`card-inbox-item-${item.id}`}
                  className={`border-border transition-colors ${!isPending ? "opacity-60" : ""} ${isExpanded ? "ring-1 ring-primary/30" : ""}`}
                >
                  <div
                    className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => { setExpandedId(isExpanded ? null : item.id); setActionNotes(""); }}
                    data-testid={`row-inbox-${item.id}`}
                  >
                    <div className="flex items-center gap-3 pt-0.5">
                      {isPending && (
                        <Checkbox
                          checked={selected.has(item.id)}
                          onCheckedChange={() => toggleSelect(item.id)}
                          onClick={e => e.stopPropagation()}
                          data-testid={`checkbox-inbox-${item.id}`}
                        />
                      )}
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/50">
                        <Icon className={`h-4 w-4 ${typeMeta.color}`} />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground truncate">{item.title}</span>
                        <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0 ${priorityMeta.color}`}>
                          <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${priorityMeta.dotColor}`} />
                          {priorityMeta.label}
                        </Badge>
                        <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0 ${statusMeta.color}`}>
                          {statusMeta.label}
                        </Badge>
                      </div>

                      {item.body && !isExpanded && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5" data-testid={`text-inbox-summary-${item.id}`}>
                          {item.body.length > 120 ? item.body.slice(0, 120) + "…" : item.body}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                        <span>{typeMeta.label}</span>
                        <span>·</span>
                        <span>{timeAgo(item.createdAt)}</span>
                        {item.resolvedAt && (
                          <>
                            <span>·</span>
                            <span>{item.status === "resolved" ? "Resolved" : "Dismissed"} {timeAgo(item.resolvedAt)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border px-4 py-4 bg-muted/10 space-y-4" data-testid={`detail-inbox-${item.id}`}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</span>
                          <p className="mt-1 text-foreground">{typeMeta.label}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</span>
                          <div className="mt-1">
                            <Badge variant="outline" className={`text-xs ${priorityMeta.color}`}>
                              <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${priorityMeta.dotColor}`} />
                              {priorityMeta.label}
                            </Badge>
                          </div>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Created</span>
                          <p className="mt-1 text-foreground">{formatDate(item.createdAt)}</p>
                        </div>
                        {item.entityType && (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reference</span>
                            <p className="mt-1 text-foreground">{item.entityType}{item.entityId ? ` #${item.entityId}` : ""}</p>
                          </div>
                        )}
                      </div>

                      {item.type === "attendance_verification" && item.metadata && (
                        <div className="space-y-4" data-testid={`attendance-review-${item.id}`}>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <Camera className="h-3.5 w-3.5" /> Submitted Photo
                              </span>
                              {item.metadata.submittedPhotoUrl ? (
                                <div className="relative rounded-md overflow-hidden border border-border bg-muted/20 aspect-[3/4] max-w-[200px]">
                                  <img
                                    src={item.metadata.submittedPhotoUrl}
                                    alt="Submitted selfie"
                                    className="w-full h-full object-cover"
                                    data-testid={`img-submitted-photo-${item.id}`}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center justify-center rounded-md border border-dashed border-border bg-muted/10 aspect-[3/4] max-w-[200px]">
                                  <span className="text-xs text-muted-foreground">No photo</span>
                                </div>
                              )}
                            </div>
                            <div className="space-y-2">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5" /> Reference Photo
                              </span>
                              {item.metadata.referencePhotoUrl ? (
                                <div className="relative rounded-md overflow-hidden border border-border bg-muted/20 aspect-[3/4] max-w-[200px]">
                                  <img
                                    src={item.metadata.referencePhotoUrl}
                                    alt="Reference photo"
                                    className="w-full h-full object-cover"
                                    data-testid={`img-reference-photo-${item.id}`}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center justify-center rounded-md border border-dashed border-border bg-muted/10 aspect-[3/4] max-w-[200px]">
                                  <span className="text-xs text-muted-foreground">No reference photo</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Confidence</span>
                              <p className={`text-lg font-bold mt-0.5 ${
                                (item.metadata.confidence ?? 0) >= 95 ? "text-emerald-400" :
                                (item.metadata.confidence ?? 0) >= 70 ? "text-amber-400" : "text-red-400"
                              }`} data-testid={`text-confidence-${item.id}`}>
                                {item.metadata.confidence ?? 0}%
                              </p>
                            </div>
                            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">GPS Check</span>
                              <div className="flex items-center gap-1.5 mt-1" data-testid={`text-gps-status-${item.id}`}>
                                {item.metadata.gpsInside ? (
                                  <>
                                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                                    <span className="text-sm font-medium text-emerald-400">Inside</span>
                                  </>
                                ) : (
                                  <>
                                    <ShieldAlert className="h-4 w-4 text-red-400" />
                                    <span className="text-sm font-medium text-red-400">Outside</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Employee</span>
                              <p className="text-sm font-medium text-foreground mt-0.5 truncate" data-testid={`text-employee-name-${item.id}`}>
                                {item.metadata.candidateName ?? "Unknown"}
                              </p>
                            </div>
                            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Employee #</span>
                              <p className="text-sm font-medium text-foreground mt-0.5" data-testid={`text-employee-number-${item.id}`}>
                                {item.metadata.employeeNumber ?? "—"}
                              </p>
                            </div>
                          </div>

                          {(item.metadata.gpsLat || item.metadata.gpsLng) && (
                            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> GPS Coordinates
                              </span>
                              <p className="text-sm text-foreground mt-0.5 font-mono" data-testid={`text-gps-coords-${item.id}`}>
                                {Number(item.metadata.gpsLat).toFixed(6)}, {Number(item.metadata.gpsLng).toFixed(6)}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {item.body && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Details</span>
                          <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">{item.body}</p>
                        </div>
                      )}

                      {item.resolutionNotes && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Resolution Notes</span>
                          <p className="mt-1 text-sm text-foreground whitespace-pre-wrap bg-muted/30 rounded-sm px-3 py-2">{item.resolutionNotes}</p>
                        </div>
                      )}

                      {isPending && (
                        <div className="space-y-3 pt-2 border-t border-border/50">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes (optional)</label>
                            <Textarea
                              data-testid={`textarea-notes-${item.id}`}
                              value={actionNotes}
                              onChange={e => setActionNotes(e.target.value)}
                              placeholder="Add resolution notes..."
                              className="mt-1 bg-muted/30 border-border text-sm min-h-[60px]"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            {item.type === "attendance_verification" && item.entityId ? (
                              <>
                                <Button
                                  size="sm"
                                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                                  onClick={() => approveAttendanceMut.mutate({ entityId: item.entityId!, notes: actionNotes || undefined })}
                                  disabled={approveAttendanceMut.isPending}
                                  data-testid={`button-approve-attendance-${item.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4" /> Approve Attendance
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 border-red-600/50 text-red-400 hover:bg-red-600/10"
                                  onClick={() => rejectAttendanceMut.mutate({ entityId: item.entityId!, notes: actionNotes || undefined })}
                                  disabled={rejectAttendanceMut.isPending}
                                  data-testid={`button-reject-attendance-${item.id}`}
                                >
                                  <XCircle className="h-4 w-4" /> Reject Attendance
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={() => resolveMut.mutate({ id: item.id, notes: actionNotes || undefined })}
                                  disabled={resolveMut.isPending}
                                  data-testid={`button-resolve-${item.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4" /> Resolve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5"
                                  onClick={() => dismissMut.mutate({ id: item.id, notes: actionNotes || undefined })}
                                  disabled={dismissMut.isPending}
                                  data-testid={`button-dismiss-${item.id}`}
                                >
                                  <XCircle className="h-4 w-4" /> Dismiss
                                </Button>
                              </>
                            )}
                            {item.actionUrl && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1.5 ml-auto"
                                onClick={() => setLocation(item.actionUrl!)}
                                data-testid={`button-inbox-goto-${item.id}`}
                              >
                                <ArrowUpRight className="h-4 w-4" /> Go to item
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {!isPending && item.actionUrl && (
                        <div className="pt-2 border-t border-border/50">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5"
                            onClick={() => setLocation(item.actionUrl!)}
                            data-testid={`button-inbox-goto-${item.id}`}
                          >
                            <ArrowUpRight className="h-4 w-4" /> View related item
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                data-testid="button-inbox-prev"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                data-testid="button-inbox-next"
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
