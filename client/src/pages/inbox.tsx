import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/lib/format";

const SECURITY_KEYWORDS = /emulator detected|mock.*location|fake.*location|spoofing|root|magisk|rooted|tamper|clock tampering/gi;

function highlightSecurityFlags(text: string): React.ReactNode {
  if (!SECURITY_KEYWORDS.test(text)) return text;
  SECURITY_KEYWORDS.lastIndex = 0;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SECURITY_KEYWORDS.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <span key={match.index} className="text-red-500 font-semibold">{match[0]}</span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Inbox as InboxIcon, Search, CheckCircle2, XCircle, FileText, UserCheck,
  ClipboardList, Calendar, Package, Flag, Monitor, Loader2, ChevronLeft,
  ChevronRight, ChevronDown, ChevronUp, ArrowUpRight, Filter, Clock,
  ListFilter, ArrowDownUp, RefreshCw, Clipboard, Eye, History, MapPin,
  Camera, ShieldCheck, ShieldAlert, User, AlertTriangle, ImageIcon,
  MessageCircle,
} from "lucide-react";
import { createPortal } from "react-dom";
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

const TYPE_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  document_review: { icon: FileText, color: "text-blue-400" },
  document_reupload: { icon: RefreshCw, color: "text-blue-300" },
  application_review: { icon: ClipboardList, color: "text-indigo-400" },
  onboarding_action: { icon: UserCheck, color: "text-emerald-400" },
  contract_action: { icon: FileText, color: "text-amber-400" },
  offboarding_action: { icon: UserCheck, color: "text-rose-400" },
  schedule_conflict: { icon: Calendar, color: "text-orange-400" },
  asset_return: { icon: Package, color: "text-cyan-400" },
  candidate_flag: { icon: Flag, color: "text-red-400" },
  event_alert: { icon: Calendar, color: "text-violet-400" },
  attendance_verification: { icon: Eye, color: "text-teal-400" },
  photo_change_request: { icon: ImageIcon, color: "text-purple-400" },
  excuse_request: { icon: MessageCircle, color: "text-yellow-400" },
  general_request: { icon: Clipboard, color: "text-slate-300" },
  system: { icon: Monitor, color: "text-gray-400" },
};

const PRIORITY_META: Record<string, { color: string; dotColor: string }> = {
  low: { color: "bg-slate-500/10 text-slate-400 border-slate-500/30", dotColor: "bg-slate-400" },
  medium: { color: "bg-blue-500/10 text-blue-400 border-blue-500/30", dotColor: "bg-blue-400" },
  high: { color: "bg-amber-500/10 text-amber-400 border-amber-500/30", dotColor: "bg-amber-400" },
  urgent: { color: "bg-red-500/10 text-red-400 border-red-500/30", dotColor: "bg-red-400" },
};

const STATUS_META: Record<string, { color: string }> = {
  pending: { color: "bg-primary/10 text-primary border-primary/30" },
  resolved: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  dismissed: { color: "bg-muted text-muted-foreground border-border" },
};

type TabValue = "all" | "pending" | "resolved" | "dismissed" | "history";

const TAB_ICONS: Record<TabValue, React.ElementType> = {
  all: ListFilter,
  pending: Clock,
  resolved: CheckCircle2,
  dismissed: XCircle,
  history: History,
};

const TAB_VALUES: TabValue[] = ["all", "pending", "resolved", "dismissed", "history"];

function useTimeAgo() {
  const { t } = useTranslation(["inbox"]);
  const { i18n } = useTranslation();
  return (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("inbox:time.justNow");
    if (mins < 60) return t("inbox:time.min", { n: formatNumber(mins, i18n.language) });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t("inbox:time.hr", { n: formatNumber(hrs, i18n.language) });
    const days = Math.floor(hrs / 24);
    if (days < 30) return t("inbox:time.day", { n: formatNumber(days, i18n.language) });
    return t("inbox:time.mo", { n: formatNumber(Math.floor(days / 30), i18n.language) });
  };
}

function formatDate(iso: string, locale: string) {
  const tag = locale.startsWith("ar") ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB";
  return new Date(iso).toLocaleDateString(tag, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); // i18n-numerals: allow (tag pins -u-nu-latn above)
}

export default function InboxPage() {
  const { t, i18n } = useTranslation(["inbox"]);
  const timeAgo = useTimeAgo();
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
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: "approve" | "reject" | null;
    entityId: string | null;
    inboxItemId: string | null;
  }>({ open: false, action: null, entityId: null, inboxItemId: null });
  const [confirmNotes, setConfirmNotes] = useState("");
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
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
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
    onSuccess: () => { invalidateInbox(); setExpandedId(null); setActionNotes(""); toast({ title: t("inbox:toast.resolved") }); },
    onError: () => toast({ title: t("inbox:toast.resolveFail"), variant: "destructive" }),
  });

  const dismissMut = useMutation({
    mutationFn: (params: { id: string; notes?: string }) => apiRequest("PATCH", `/api/inbox/${params.id}/dismiss`, { notes: params.notes }),
    onSuccess: () => { invalidateInbox(); setExpandedId(null); setActionNotes(""); toast({ title: t("inbox:toast.dismissed") }); },
    onError: () => toast({ title: t("inbox:toast.dismissFail"), variant: "destructive" }),
  });

  const approveAttendanceMut = useMutation({
    mutationFn: (params: { entityId: string; notes: string }) =>
      apiRequest("POST", `/api/attendance-mobile/submissions/${params.entityId}/approve`, { notes: params.notes }),
    onSuccess: () => {
      invalidateInbox(); setExpandedId(null); setActionNotes("");
      setConfirmDialog({ open: false, action: null, entityId: null, inboxItemId: null }); setConfirmNotes("");
      toast({ title: t("inbox:toast.attApproved") });
    },
    onError: () => toast({ title: t("inbox:toast.attApproveFail"), variant: "destructive" }),
  });

  const rejectAttendanceMut = useMutation({
    mutationFn: (params: { entityId: string; notes: string }) =>
      apiRequest("POST", `/api/attendance-mobile/submissions/${params.entityId}/reject`, { notes: params.notes }),
    onSuccess: () => {
      invalidateInbox(); setExpandedId(null); setActionNotes("");
      setConfirmDialog({ open: false, action: null, entityId: null, inboxItemId: null }); setConfirmNotes("");
      toast({ title: t("inbox:toast.attRejected") });
    },
    onError: () => toast({ title: t("inbox:toast.attRejectFail"), variant: "destructive" }),
  });

  const approvePhotoChangeMut = useMutation({
    mutationFn: (params: { changeRequestId: string; notes: string }) =>
      apiRequest("POST", `/api/photo-change-requests/${params.changeRequestId}/approve`, { notes: params.notes }),
    onSuccess: () => {
      invalidateInbox(); setExpandedId(null); setActionNotes("");
      setConfirmDialog({ open: false, action: null, entityId: null, inboxItemId: null }); setConfirmNotes("");
      toast({ title: t("inbox:toast.photoApproved") });
    },
    onError: () => toast({ title: t("inbox:toast.photoApproveFail"), variant: "destructive" }),
  });

  const rejectPhotoChangeMut = useMutation({
    mutationFn: (params: { changeRequestId: string; notes: string }) =>
      apiRequest("POST", `/api/photo-change-requests/${params.changeRequestId}/reject`, { notes: params.notes }),
    onSuccess: () => {
      invalidateInbox(); setExpandedId(null); setActionNotes("");
      setConfirmDialog({ open: false, action: null, entityId: null, inboxItemId: null }); setConfirmNotes("");
      toast({ title: t("inbox:toast.photoRejected") });
    },
    onError: () => toast({ title: t("inbox:toast.photoRejectFail"), variant: "destructive" }),
  });

  const approveExcuseMut = useMutation({
    mutationFn: (params: { excuseId: string; notes: string }) =>
      apiRequest("PATCH", `/api/excuse-requests/${params.excuseId}/approve`, { notes: params.notes }),
    onSuccess: () => {
      invalidateInbox(); setExpandedId(null); setActionNotes("");
      setConfirmDialog({ open: false, action: null, entityId: null, inboxItemId: null }); setConfirmNotes("");
      toast({ title: t("inbox:toast.excuseApproved") });
    },
    onError: () => toast({ title: t("inbox:toast.excuseApproveFail"), variant: "destructive" }),
  });

  const rejectExcuseMut = useMutation({
    mutationFn: (params: { excuseId: string; notes: string }) =>
      apiRequest("PATCH", `/api/excuse-requests/${params.excuseId}/reject`, { notes: params.notes }),
    onSuccess: () => {
      invalidateInbox(); setExpandedId(null); setActionNotes("");
      setConfirmDialog({ open: false, action: null, entityId: null, inboxItemId: null }); setConfirmNotes("");
      toast({ title: t("inbox:toast.excuseRejected") });
    },
    onError: () => toast({ title: t("inbox:toast.excuseRejectFail"), variant: "destructive" }),
  });

  const openConfirmDialog = (action: "approve" | "reject", entityId: string, inboxItemId: string) => {
    setConfirmNotes("");
    setConfirmDialog({ open: true, action, entityId, inboxItemId });
  };

  const executeConfirmAction = () => {
    if (!confirmDialog.entityId || !confirmDialog.action || !confirmNotes.trim()) return;
    const inboxItem = rawData?.data?.find((i: InboxItem) => i.id === confirmDialog.inboxItemId);
    const isPhotoChange = inboxItem?.type === "photo_change_request";
    const isExcuseRequest = inboxItem?.type === "excuse_request";
    if (isPhotoChange) {
      const changeRequestId = inboxItem?.metadata?.changeRequestId;
      if (!changeRequestId) return;
      if (confirmDialog.action === "approve") {
        approvePhotoChangeMut.mutate({ changeRequestId, notes: confirmNotes.trim() });
      } else {
        rejectPhotoChangeMut.mutate({ changeRequestId, notes: confirmNotes.trim() });
      }
    } else if (isExcuseRequest) {
      const excuseId = inboxItem?.metadata?.excuseRequestId ?? inboxItem?.entityId;
      if (!excuseId) return;
      if (confirmDialog.action === "approve") {
        approveExcuseMut.mutate({ excuseId, notes: confirmNotes.trim() });
      } else {
        rejectExcuseMut.mutate({ excuseId, notes: confirmNotes.trim() });
      }
    } else {
      if (confirmDialog.action === "approve") {
        approveAttendanceMut.mutate({ entityId: confirmDialog.entityId, notes: confirmNotes.trim() });
      } else {
        rejectAttendanceMut.mutate({ entityId: confirmDialog.entityId, notes: confirmNotes.trim() });
      }
    }
  };

  const bulkResolveMut = useMutation({
    mutationFn: (ids: string[]) => apiRequest("POST", "/api/inbox/bulk-resolve", { ids }),
    onSuccess: () => { invalidateInbox(); setSelected(new Set()); toast({ title: t("inbox:toast.bulkResolved") }); },
    onError: () => toast({ title: t("inbox:toast.bulkResolveFail"), variant: "destructive" }),
  });

  const bulkDismissMut = useMutation({
    mutationFn: (ids: string[]) => apiRequest("POST", "/api/inbox/bulk-dismiss", { ids }),
    onSuccess: () => { invalidateInbox(); setSelected(new Set()); toast({ title: t("inbox:toast.bulkDismissed") }); },
    onError: () => toast({ title: t("inbox:toast.bulkDismissFail"), variant: "destructive" }),
  });

  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);
  const pendingCount = countData?.count ?? 0;

  const BULK_PROTECTED_TYPES = ["photo_change_request", "attendance_verification", "excuse_request"];

  const pendingItems = items.filter(i => i.status === "pending");
  const bulkSelectableItems = pendingItems.filter(i => !BULK_PROTECTED_TYPES.includes(i.type));

  const toggleSelect = (id: string) => {
    const item = items.find(i => i.id === id);
    if (item && BULK_PROTECTED_TYPES.includes(item.type)) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === bulkSelectableItems.length && bulkSelectableItems.length > 0) setSelected(new Set());
    else setSelected(new Set(bulkSelectableItems.map(i => i.id)));
  };

  const switchTab = (newTab: TabValue) => {
    setTab(newTab);
    setPage(1);
    setSelected(new Set());
    setExpandedId(null);
    setActionNotes("");
  };

  const hasPendingInView = pendingItems.length > 0;
  const hasBulkSelectableInView = bulkSelectableItems.length > 0;

  const typeLabel = (k: string) => t(`inbox:type.${k}`, { defaultValue: k });
  const priorityLabel = (k: string) => t(`inbox:priority.${k}`, { defaultValue: k });
  const statusLabel = (k: string) => t(`inbox:status.${k}`, { defaultValue: k });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground" data-testid="text-inbox-title">{t("inbox:title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("inbox:subtitle")}</p>
          </div>
          {pendingCount > 0 && (
            <Badge variant="destructive" className="text-sm px-3 py-1" data-testid="badge-inbox-open-count">
              {t("inbox:pendingBadge", { count: pendingCount, replace: { count: formatNumber(pendingCount, i18n.language) } })}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 border-b border-border">
          {TAB_VALUES.map(v => {
            const TabIcon = TAB_ICONS[v];
            return (
              <button
                key={v}
                data-testid={`tab-${v}`}
                onClick={() => switchTab(v)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === v
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <TabIcon className="h-4 w-4" />
                {t(`inbox:tabs.${v}`)}
                {v === "pending" && pendingCount > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">
                    {formatNumber(pendingCount, i18n.language)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="input-inbox-search"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder={t("inbox:search")}
              className="ps-10 bg-muted/30 border-border h-9 rounded-sm"
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
                <SelectItem value="all">{t("inbox:filters.allTypes")}</SelectItem>
                {Object.keys(TYPE_ICONS).map(k => (
                  <SelectItem key={k} value={k}>{typeLabel(k)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={v => { setPriorityFilter(v); setPage(1); setSelected(new Set()); }}>
              <SelectTrigger className="h-9 w-[120px] rounded-sm text-xs" data-testid="select-inbox-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("inbox:filters.allPriority")}</SelectItem>
                <SelectItem value="urgent">{t("inbox:filters.urgent")}</SelectItem>
                <SelectItem value="high">{t("inbox:filters.high")}</SelectItem>
                <SelectItem value="medium">{t("inbox:filters.medium")}</SelectItem>
                <SelectItem value="low">{t("inbox:filters.low")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={`${sortBy}-${sortOrder}`} onValueChange={v => {
              const [sb, so] = v.split("-");
              setSortBy(sb);
              setSortOrder(so);
              setPage(1);
            }}>
              <SelectTrigger className="h-9 w-[150px] rounded-sm text-xs" data-testid="select-inbox-sort">
                <ArrowDownUp className="h-3 w-3 me-1 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt-desc">{t("inbox:filters.newest")}</SelectItem>
                <SelectItem value="createdAt-asc">{t("inbox:filters.oldest")}</SelectItem>
                <SelectItem value="priority-desc">{t("inbox:filters.prHighLow")}</SelectItem>
                <SelectItem value="priority-asc">{t("inbox:filters.prLowHigh")}</SelectItem>
                <SelectItem value="type-asc">{t("inbox:filters.typeAZ")}</SelectItem>
                <SelectItem value="type-desc">{t("inbox:filters.typeZA")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 border border-border rounded-sm">
            <span className="text-sm text-muted-foreground">{t("inbox:bulk.selected", { count: selected.size, replace: { count: formatNumber(selected.size, i18n.language) } })}</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => bulkResolveMut.mutate([...selected])}
              disabled={bulkResolveMut.isPending}
              data-testid="button-bulk-resolve"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> {t("inbox:bulk.resolveAll")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => bulkDismissMut.mutate([...selected])}
              disabled={bulkDismissMut.isPending}
              data-testid="button-bulk-dismiss"
            >
              <XCircle className="h-3.5 w-3.5" /> {t("inbox:bulk.dismissAll")}
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
              {tab === "pending" ? t("inbox:empty.allClear")
                : tab === "all" ? t("inbox:empty.noItems")
                : tab === "history" ? t("inbox:empty.noHistory")
                : t("inbox:empty.noOf", { tab: t(`inbox:tabs.${tab}`) })}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {tab === "pending" ? t("inbox:empty.pendingDesc") : t("inbox:empty.filteredDesc")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {hasPendingInView && (
              <div className="flex items-center gap-3 px-4 py-1">
                {hasBulkSelectableInView ? (
                  <Checkbox
                    checked={selected.size === bulkSelectableItems.length && bulkSelectableItems.length > 0}
                    onCheckedChange={toggleAll}
                    data-testid="checkbox-select-all"
                  />
                ) : (
                  <div className="h-4 w-4" />
                )}
                <span className="text-xs text-muted-foreground">
                  {t("inbox:list.totalItems", { count: total, replace: { count: formatNumber(total, i18n.language) } })}
                  {bulkSelectableItems.length < pendingItems.length && (
                    <span className="ms-2 text-amber-500">{t("inbox:list.needIndividual", {
                      count: pendingItems.length - bulkSelectableItems.length,
                      replace: { count: formatNumber(pendingItems.length - bulkSelectableItems.length, i18n.language) },
                    })}</span>
                  )}
                </span>
              </div>
            )}

            {items.map(item => {
              const meta = TYPE_ICONS[item.type] ?? TYPE_ICONS.system;
              const priorityMeta = PRIORITY_META[item.priority] ?? PRIORITY_META.medium;
              const statusMeta = STATUS_META[item.status] ?? STATUS_META.pending;
              const Icon = meta.icon;
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
                      {isPending && !BULK_PROTECTED_TYPES.includes(item.type) && (
                        <Checkbox
                          checked={selected.has(item.id)}
                          onCheckedChange={() => toggleSelect(item.id)}
                          onClick={e => e.stopPropagation()}
                          data-testid={`checkbox-inbox-${item.id}`}
                        />
                      )}
                      {isPending && BULK_PROTECTED_TYPES.includes(item.type) && (
                        <div
                          className="h-4 w-4 flex items-center justify-center shrink-0"
                          title={t("inbox:list.individualTooltip")}
                          onClick={e => e.stopPropagation()}
                        >
                          <ShieldAlert className="h-3.5 w-3.5 text-amber-500/60" />
                        </div>
                      )}
                      {!isPending && <div className="h-4 w-4 shrink-0" />}
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/50">
                        <Icon className={`h-4 w-4 ${meta.color}`} />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate"><bdi>{item.title}</bdi></span>
                        <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0 ${meta.color} border-current/30`}>
                          <Icon className="h-2.5 w-2.5 me-1" />
                          {typeLabel(item.type)}
                        </Badge>
                        <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0 ${priorityMeta.color}`}>
                          <span className={`inline-block h-1.5 w-1.5 rounded-full me-1 ${priorityMeta.dotColor}`} />
                          {priorityLabel(item.priority)}
                        </Badge>
                        <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0 ${statusMeta.color}`}>
                          {statusLabel(item.status)}
                        </Badge>
                      </div>

                      {item.body && !isExpanded && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5" data-testid={`text-inbox-summary-${item.id}`}>
                          <bdi>{highlightSecurityFlags(item.body.length > 120 ? item.body.slice(0, 120) + "…" : item.body)}</bdi>
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                        <span>{timeAgo(item.createdAt)}</span>
                        {item.resolvedAt && (
                          <>
                            <span>·</span>
                            <span>
                              {item.status === "resolved"
                                ? t("inbox:row.resolvedAgo", { when: timeAgo(item.resolvedAt) })
                                : t("inbox:row.dismissedAgo", { when: timeAgo(item.resolvedAt) })}
                            </span>
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
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.type")}</span>
                          <p className="mt-1 text-foreground">{typeLabel(item.type)}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.priority")}</span>
                          <div className="mt-1">
                            <Badge variant="outline" className={`text-xs ${priorityMeta.color}`}>
                              <span className={`inline-block h-1.5 w-1.5 rounded-full me-1 ${priorityMeta.dotColor}`} />
                              {priorityLabel(item.priority)}
                            </Badge>
                          </div>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.created")}</span>
                          <p className="mt-1 text-foreground" dir="ltr">{formatDate(item.createdAt, i18n.language)}</p>
                        </div>
                        {item.entityType && (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.reference")}</span>
                            <p className="mt-1 text-foreground" dir="ltr"><bdi>{item.entityType}</bdi>{item.entityId ? ` #${item.entityId}` : ""}</p>
                          </div>
                        )}
                      </div>

                      {item.type === "attendance_verification" && item.metadata && (
                        <div className="space-y-4" data-testid={`attendance-review-${item.id}`}>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <Camera className="h-3.5 w-3.5" /> {t("inbox:detail.submittedPhoto")}
                              </span>
                              {item.metadata.submittedPhotoUrl ? (
                                <div className="relative rounded-md overflow-hidden border border-border bg-muted/20 aspect-[3/4] max-w-[200px]">
                                  <img
                                    src={item.metadata.submittedPhotoUrl}
                                    alt={t("inbox:detail.submittedPhoto")}
                                    className="w-full h-full object-cover"
                                    data-testid={`img-submitted-photo-${item.id}`}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center justify-center rounded-md border border-dashed border-border bg-muted/10 aspect-[3/4] max-w-[200px]">
                                  <span className="text-xs text-muted-foreground">{t("inbox:detail.noPhoto")}</span>
                                </div>
                              )}
                            </div>
                            <div className="space-y-2">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5" /> {t("inbox:detail.referencePhoto")}
                              </span>
                              {item.metadata.referencePhotoUrl ? (
                                <div className="relative rounded-md overflow-hidden border border-border bg-muted/20 aspect-[3/4] max-w-[200px]">
                                  <img
                                    src={item.metadata.referencePhotoUrl}
                                    alt={t("inbox:detail.referencePhoto")}
                                    className="w-full h-full object-cover"
                                    data-testid={`img-reference-photo-${item.id}`}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center justify-center rounded-md border border-dashed border-border bg-muted/10 aspect-[3/4] max-w-[200px]">
                                  <span className="text-xs text-muted-foreground">{t("inbox:detail.noReferencePhoto")}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.confidence")}</span>
                              <p className={`text-lg font-bold mt-0.5 ${
                                (item.metadata.confidence ?? 0) >= 95 ? "text-emerald-400" :
                                (item.metadata.confidence ?? 0) >= 70 ? "text-amber-400" : "text-red-400"
                              }`} data-testid={`text-confidence-${item.id}`} dir="ltr">
                                {formatNumber(item.metadata.confidence ?? 0, i18n.language)}%
                              </p>
                            </div>
                            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.gpsCheck")}</span>
                              <div className="flex items-center gap-1.5 mt-1" data-testid={`text-gps-status-${item.id}`}>
                                {item.metadata.gpsInside ? (
                                  <>
                                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                                    <span className="text-sm font-medium text-emerald-400">{t("inbox:detail.inside")}</span>
                                  </>
                                ) : (
                                  <>
                                    <ShieldAlert className="h-4 w-4 text-red-400" />
                                    <span className="text-sm font-medium text-red-400">{t("inbox:detail.outside")}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.employee")}</span>
                              <p className="text-sm font-medium text-foreground mt-0.5 truncate" data-testid={`text-employee-name-${item.id}`}>
                                <bdi>{item.metadata.candidateName ?? t("inbox:detail.unknown")}</bdi>
                              </p>
                            </div>
                            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.employeeNo")}</span>
                              <p className="text-sm font-medium text-foreground mt-0.5" data-testid={`text-employee-number-${item.id}`} dir="ltr">
                                {item.metadata.employeeNumber ?? "—"}
                              </p>
                            </div>
                          </div>

                          {(item.metadata.gpsLat || item.metadata.gpsLng) && (
                            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {t("inbox:detail.gpsCoords")}
                              </span>
                              <p className="text-sm text-foreground mt-0.5 font-mono" data-testid={`text-gps-coords-${item.id}`} dir="ltr">
                                {Number(item.metadata.gpsLat).toFixed(6)}, {Number(item.metadata.gpsLng).toFixed(6)}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {item.type === "photo_change_request" && item.metadata && (
                        <div className="space-y-4" data-testid={`photo-review-${item.id}`}>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5" /> {t("inbox:detail.currentPhoto")}
                              </span>
                              {item.metadata.previousPhotoUrl ? (
                                <div className="relative rounded-md overflow-hidden border border-border bg-muted/20 aspect-square max-w-[200px]">
                                  <img
                                    src={item.metadata.previousPhotoUrl}
                                    alt={t("inbox:detail.currentPhoto")}
                                    className="w-full h-full object-cover"
                                    data-testid={`img-current-photo-${item.id}`}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center justify-center rounded-md border border-dashed border-border bg-muted/10 aspect-square max-w-[200px]">
                                  <span className="text-xs text-muted-foreground">{t("inbox:detail.noCurrentPhoto")}</span>
                                </div>
                              )}
                            </div>
                            <div className="space-y-2">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <ImageIcon className="h-3.5 w-3.5" /> {t("inbox:detail.newPhoto")}
                              </span>
                              {item.metadata.newPhotoUrl ? (
                                <div className="relative rounded-md overflow-hidden border-2 border-primary/50 bg-muted/20 aspect-square max-w-[200px]">
                                  <img
                                    src={item.metadata.newPhotoUrl}
                                    alt={t("inbox:detail.newPhoto")}
                                    className="w-full h-full object-cover"
                                    data-testid={`img-new-photo-${item.id}`}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center justify-center rounded-md border border-dashed border-border bg-muted/10 aspect-square max-w-[200px]">
                                  <span className="text-xs text-muted-foreground">{t("inbox:detail.noNewPhoto")}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.employee")}</span>
                              <p className="text-sm font-medium text-foreground mt-0.5 truncate" data-testid={`text-photo-employee-${item.id}`}>
                                <bdi>{item.metadata.candidateName ?? t("inbox:detail.unknown")}</bdi>
                              </p>
                            </div>
                            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.employeeNo")}</span>
                              <p className="text-sm font-medium text-foreground mt-0.5" data-testid={`text-photo-empnum-${item.id}`} dir="ltr">
                                {item.metadata.employeeNumber ?? "—"}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {item.type === "excuse_request" && item.metadata && (
                        <div className="space-y-4" data-testid={`excuse-review-${item.id}`}>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.employee")}</span>
                              <p className="text-sm font-medium text-foreground mt-0.5 truncate" data-testid={`text-excuse-employee-${item.id}`}>
                                <bdi>{item.metadata.employeeName ?? t("inbox:detail.unknown")}</bdi>
                              </p>
                            </div>
                            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.employeeNo")}</span>
                              <p className="text-sm font-medium text-foreground mt-0.5" data-testid={`text-excuse-empnum-${item.id}`} dir="ltr">
                                {item.metadata.employeeNumber ?? "—"}
                              </p>
                            </div>
                            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.date")}</span>
                              <p className="text-sm font-medium text-foreground mt-0.5" data-testid={`text-excuse-date-${item.id}`} dir="ltr">
                                {item.metadata.date ?? "—"}
                              </p>
                            </div>
                            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.excuseType")}</span>
                              <p className="text-sm font-medium mt-0.5" data-testid={`text-excuse-type-${item.id}`}>
                                {item.metadata.hadClockIn ? (
                                  <span className="text-amber-400">{t("inbox:detail.partial")}</span>
                                ) : (
                                  <span className="text-blue-400">{t("inbox:detail.fullDay")}</span>
                                )}
                              </p>
                            </div>
                          </div>
                          {item.metadata.hadClockIn && item.metadata.effectiveClockOut && (
                            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                              <span className="text-[10px] font-medium text-amber-400 uppercase tracking-wider">{t("inbox:detail.effectiveClockOut")}</span>
                              <p className="text-sm font-medium text-amber-300 mt-0.5" dir="ltr">{item.metadata.effectiveClockOut}</p>
                            </div>
                          )}
                          {item.body && (
                            <div>
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.reason")}</span>
                              <p className="mt-1 text-sm text-foreground whitespace-pre-wrap bg-muted/20 rounded-sm px-3 py-2"><bdi>{item.body}</bdi></p>
                            </div>
                          )}
                        </div>
                      )}

                      {item.body && item.type !== "photo_change_request" && item.type !== "excuse_request" && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.details")}</span>
                          <p className="mt-1 text-sm text-foreground whitespace-pre-wrap"><bdi>{highlightSecurityFlags(item.body)}</bdi></p>
                        </div>
                      )}

                      {item.resolutionNotes && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.resolutionNotes")}</span>
                          <p className="mt-1 text-sm text-foreground whitespace-pre-wrap bg-muted/30 rounded-sm px-3 py-2"><bdi>{item.resolutionNotes}</bdi></p>
                        </div>
                      )}

                      {isPending && (
                        <div className="space-y-3 pt-2 border-t border-border/50">
                          {item.type !== "attendance_verification" && item.type !== "photo_change_request" && item.type !== "excuse_request" && (
                            <div>
                              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("inbox:detail.notesOptional")}</label>
                              <Textarea
                                data-testid={`textarea-notes-${item.id}`}
                                value={actionNotes}
                                onChange={e => setActionNotes(e.target.value)}
                                placeholder={t("inbox:detail.addNotesPh")}
                                className="mt-1 bg-muted/30 border-border text-sm min-h-[60px]"
                              />
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            {item.type === "attendance_verification" && item.entityId ? (
                              <>
                                <Button
                                  size="sm"
                                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                                  onClick={() => openConfirmDialog("approve", item.entityId!, item.id)}
                                  disabled={approveAttendanceMut.isPending}
                                  data-testid={`button-approve-attendance-${item.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4" /> {t("inbox:detail.approveAttendance")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 border-red-600/50 text-red-400 hover:bg-red-600/10"
                                  onClick={() => openConfirmDialog("reject", item.entityId!, item.id)}
                                  disabled={rejectAttendanceMut.isPending}
                                  data-testid={`button-reject-attendance-${item.id}`}
                                >
                                  <XCircle className="h-4 w-4" /> {t("inbox:detail.rejectAttendance")}
                                </Button>
                              </>
                            ) : item.type === "photo_change_request" && item.metadata?.changeRequestId ? (
                              <>
                                <Button
                                  size="sm"
                                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                                  onClick={() => openConfirmDialog("approve", item.metadata!.changeRequestId, item.id)}
                                  disabled={approvePhotoChangeMut.isPending}
                                  data-testid={`button-approve-photo-${item.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4" /> {t("inbox:detail.approvePhoto")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 border-red-600/50 text-red-400 hover:bg-red-600/10"
                                  onClick={() => openConfirmDialog("reject", item.metadata!.changeRequestId, item.id)}
                                  disabled={rejectPhotoChangeMut.isPending}
                                  data-testid={`button-reject-photo-${item.id}`}
                                >
                                  <XCircle className="h-4 w-4" /> {t("inbox:detail.rejectPhoto")}
                                </Button>
                              </>
                            ) : item.type === "excuse_request" && item.entityId ? (
                              <>
                                <Button
                                  size="sm"
                                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                                  onClick={() => openConfirmDialog("approve", item.metadata?.excuseRequestId ?? item.entityId!, item.id)}
                                  disabled={approveExcuseMut.isPending}
                                  data-testid={`button-approve-excuse-${item.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4" /> {t("inbox:detail.approveExcuse")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 border-red-600/50 text-red-400 hover:bg-red-600/10"
                                  onClick={() => openConfirmDialog("reject", item.metadata?.excuseRequestId ?? item.entityId!, item.id)}
                                  disabled={rejectExcuseMut.isPending}
                                  data-testid={`button-reject-excuse-${item.id}`}
                                >
                                  <XCircle className="h-4 w-4" /> {t("inbox:detail.rejectExcuse")}
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
                                  <CheckCircle2 className="h-4 w-4" /> {t("inbox:detail.resolve")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5"
                                  onClick={() => dismissMut.mutate({ id: item.id, notes: actionNotes || undefined })}
                                  disabled={dismissMut.isPending}
                                  data-testid={`button-dismiss-${item.id}`}
                                >
                                  <XCircle className="h-4 w-4" /> {t("inbox:detail.dismiss")}
                                </Button>
                              </>
                            )}
                            {item.actionUrl && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1.5 ms-auto"
                                onClick={() => setLocation(item.actionUrl!)}
                                data-testid={`button-inbox-goto-${item.id}`}
                              >
                                <ArrowUpRight className="h-4 w-4" /> {t("inbox:detail.goTo")}
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
                            <ArrowUpRight className="h-4 w-4" /> {t("inbox:detail.viewRelated")}
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
              {t("inbox:pager.label", { page: formatNumber(page, i18n.language), total: formatNumber(totalPages, i18n.language) })}
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
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t("inbox:pager.prev")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                data-testid="button-inbox-next"
              >
                {t("inbox:pager.next")} <ChevronRight className="h-4 w-4 rtl:rotate-180" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {confirmDialog.open && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" data-testid="dialog-confirm-attendance">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDialog({ open: false, action: null, entityId: null, inboxItemId: null })} />
          <div className="relative bg-card border border-border rounded-md shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                confirmDialog.action === "approve" ? "bg-emerald-500/10" : "bg-red-500/10"
              }`}>
                {confirmDialog.action === "approve" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                )}
              </div>
              {(() => {
                const confirmItem = rawData?.data?.find((i: InboxItem) => i.id === confirmDialog.inboxItemId);
                const isPhoto = confirmItem?.type === "photo_change_request";
                const isExcuse = confirmItem?.type === "excuse_request";
                const kind = isPhoto ? "photo" : isExcuse ? "excuse" : "default";
                const titleKey = `${confirmDialog.action}_${kind}_title`;
                const descKey = `${confirmDialog.action}_${kind}_desc`;
                return (
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{t(`inbox:confirm.${titleKey}`)}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{t(`inbox:confirm.${descKey}`)}</p>
                  </div>
                );
              })()}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("inbox:confirm.notesRequiredLabel")} <span className="text-red-400">*</span>
              </label>
              <Textarea
                data-testid="textarea-confirm-notes"
                value={confirmNotes}
                onChange={e => setConfirmNotes(e.target.value)}
                placeholder={(() => {
                  const confirmItem = rawData?.data?.find((i: InboxItem) => i.id === confirmDialog.inboxItemId);
                  const isPhoto = confirmItem?.type === "photo_change_request";
                  const isExcuse = confirmItem?.type === "excuse_request";
                  const kind = isPhoto ? "photo" : isExcuse ? "excuse" : "default";
                  return t(`inbox:confirm.ph_${confirmDialog.action}_${kind}`);
                })()}
                className="mt-1.5 bg-muted/30 border-border text-sm min-h-[80px]"
                autoFocus
              />
              {confirmNotes.trim().length === 0 && (
                <p className="text-xs text-red-400 mt-1">{t("inbox:confirm.notesRequiredHint")}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDialog({ open: false, action: null, entityId: null, inboxItemId: null })}
                data-testid="button-confirm-cancel"
              >
                {t("inbox:confirm.cancel")}
              </Button>
              <Button
                size="sm"
                disabled={!confirmNotes.trim() || approveAttendanceMut.isPending || rejectAttendanceMut.isPending || approvePhotoChangeMut.isPending || rejectPhotoChangeMut.isPending}
                className={confirmDialog.action === "approve"
                  ? "gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                  : "gap-1.5 bg-red-600 hover:bg-red-700"
                }
                onClick={executeConfirmAction}
                data-testid="button-confirm-action"
              >
                {(approveAttendanceMut.isPending || rejectAttendanceMut.isPending || approvePhotoChangeMut.isPending || rejectPhotoChangeMut.isPending) && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                {confirmDialog.action === "approve" ? t("inbox:confirm.confirmApproval") : t("inbox:confirm.confirmRejection")}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </DashboardLayout>
  );
}
