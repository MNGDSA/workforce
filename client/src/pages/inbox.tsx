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
  AlertTriangle,
  Calendar,
  Package,
  Flag,
  Monitor,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Filter,
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
  metadata: Record<string, any> | null;
  createdAt: string;
};

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  document_review: { label: "Document Review", icon: FileText, color: "text-blue-400" },
  application_review: { label: "Application Review", icon: ClipboardList, color: "text-indigo-400" },
  onboarding_action: { label: "Onboarding", icon: UserCheck, color: "text-emerald-400" },
  contract_action: { label: "Contract", icon: FileText, color: "text-amber-400" },
  offboarding_action: { label: "Offboarding", icon: UserCheck, color: "text-rose-400" },
  schedule_conflict: { label: "Schedule Conflict", icon: Calendar, color: "text-orange-400" },
  asset_return: { label: "Asset Return", icon: Package, color: "text-cyan-400" },
  candidate_flag: { label: "Candidate Flag", icon: Flag, color: "text-red-400" },
  event_alert: { label: "Event Alert", icon: Calendar, color: "text-violet-400" },
  system: { label: "System", icon: Monitor, color: "text-gray-400" },
};

const PRIORITY_META: Record<string, { label: string; color: string; dotColor: string }> = {
  low: { label: "Low", color: "bg-slate-500/10 text-slate-400 border-slate-500/30", dotColor: "bg-slate-400" },
  medium: { label: "Medium", color: "bg-blue-500/10 text-blue-400 border-blue-500/30", dotColor: "bg-blue-400" },
  high: { label: "High", color: "bg-amber-500/10 text-amber-400 border-amber-500/30", dotColor: "bg-amber-400" },
  urgent: { label: "Urgent", color: "bg-red-500/10 text-red-400 border-red-500/30", dotColor: "bg-red-400" },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "bg-primary/10 text-primary border-primary/30" },
  resolved: { label: "Resolved", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  dismissed: { label: "Dismissed", color: "bg-muted text-muted-foreground border-border" },
};

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

export default function InboxPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("open");
  const [typeFilter, setTypeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const limit = 20;

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("limit", String(limit));
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (typeFilter !== "all") queryParams.set("type", typeFilter);
  if (priorityFilter !== "all") queryParams.set("priority", priorityFilter);
  if (search.trim()) queryParams.set("search", search.trim());

  const { data, isLoading } = useQuery<{ data: InboxItem[]; total: number }>({
    queryKey: ["/api/inbox", page, statusFilter, typeFilter, priorityFilter, search],
    queryFn: () => apiRequest("GET", `/api/inbox?${queryParams.toString()}`).then(r => r.json()),
  });

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
    mutationFn: (id: string) => apiRequest("PATCH", `/api/inbox/${id}/resolve`),
    onSuccess: () => { invalidateInbox(); toast({ title: "Item resolved" }); },
    onError: () => toast({ title: "Failed to resolve item", variant: "destructive" }),
  });

  const dismissMut = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/inbox/${id}/dismiss`),
    onSuccess: () => { invalidateInbox(); toast({ title: "Item dismissed" }); },
    onError: () => toast({ title: "Failed to dismiss item", variant: "destructive" }),
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
  const openCount = countData?.count ?? 0;

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openItems = items.filter(i => i.status === "open");

  const toggleAll = () => {
    if (selected.size === openItems.length && openItems.length > 0) setSelected(new Set());
    else setSelected(new Set(openItems.map(i => i.id)));
  };

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
          {openCount > 0 && (
            <Badge variant="destructive" className="text-sm px-3 py-1" data-testid="badge-inbox-open-count">
              {openCount} open
            </Badge>
          )}
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
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); setSelected(new Set()); }}>
              <SelectTrigger className="h-9 w-[120px] rounded-sm text-xs" data-testid="select-inbox-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
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
          </div>
        </div>

        {selected.size > 0 && (
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
            <h3 className="text-lg font-semibold text-foreground" data-testid="text-inbox-empty">All clear</h3>
            <p className="text-sm text-muted-foreground mt-1">No inbox items match your current filters.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-3 px-4 py-1">
              <Checkbox
                checked={selected.size === openItems.length && openItems.length > 0}
                onCheckedChange={toggleAll}
                data-testid="checkbox-select-all"
              />
              <span className="text-xs text-muted-foreground">
                {total} item{total !== 1 ? "s" : ""} total
              </span>
            </div>

            {items.map(item => {
              const typeMeta = TYPE_META[item.type] ?? TYPE_META.system;
              const priorityMeta = PRIORITY_META[item.priority] ?? PRIORITY_META.medium;
              const statusMeta = STATUS_META[item.status] ?? STATUS_META.open;
              const Icon = typeMeta.icon;
              const isOpen = item.status === "open";

              return (
                <Card
                  key={item.id}
                  data-testid={`card-inbox-item-${item.id}`}
                  className={`p-4 border-border transition-colors hover:bg-muted/30 ${!isOpen ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex items-center gap-3 pt-0.5">
                      {isOpen && (
                        <Checkbox
                          checked={selected.has(item.id)}
                          onCheckedChange={() => toggleSelect(item.id)}
                          data-testid={`checkbox-inbox-${item.id}`}
                        />
                      )}
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/50`}>
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

                      {item.body && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">{item.body}</p>
                      )}

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
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
                      {item.actionUrl && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => setLocation(item.actionUrl!)}
                          data-testid={`button-inbox-goto-${item.id}`}
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </Button>
                      )}
                      {isOpen && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-emerald-400 hover:text-emerald-300"
                            onClick={() => resolveMut.mutate(item.id)}
                            disabled={resolveMut.isPending}
                            data-testid={`button-resolve-${item.id}`}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => dismissMut.mutate(item.id)}
                            disabled={dismissMut.isPending}
                            data-testid={`button-dismiss-${item.id}`}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
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
