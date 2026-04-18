import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatNumber, formatDate as fmtDateLocale } from "@/lib/format";
import DashboardLayout from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ScrollText,
  Search,
  ChevronLeft,
  ChevronRight,
  UserCircle2,
  Users,
  ClipboardCheck,
  CalendarClock,
  Package,
  CalendarDays,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface AuditLog {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  employeeNumber: string | null;
  subjectName: string | null;
  description: string;
  metadata: Record<string, any> | null;
  createdAt: string;
}

interface AuditLogsResponse {
  data: AuditLog[];
  total: number;
}

const ENTITY_FILTER_VALUES = ["all", "onboarding", "workforce", "attendance", "assets", "schedule"] as const;

const ENTITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  onboarding: ClipboardCheck,
  workforce:  Users,
  attendance: CalendarClock,
  assets:     Package,
  schedule:   CalendarDays,
};

const ACTION_COLORS: Record<string, string> = {
  "onboarding.admit":         "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "workforce.converted":      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "workforce.bulk_converted": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "workforce.updated":        "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "workforce.bulk_updated":   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "workforce.terminated":     "bg-red-500/15 text-red-400 border-red-500/30",
  "workforce.reinstated":     "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "attendance.corrected":     "bg-sky-500/15 text-sky-400 border-sky-500/30",
  "assets.assigned":          "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "assets.returned":          "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "assets.updated":           "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "schedule.assigned":        "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
};

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
}

function formatTimestamp(iso: string, locale: string): string {
  return fmtDateLocale(new Date(iso), locale, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function useTimeAgo() {
  const { t } = useTranslation("audit");
  return (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return t("justNow");
    const mins = Math.floor(secs / 60);
    if (mins < 60) return t("minutesAgo", { count: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t("hoursAgo", { count: hrs });
    const days = Math.floor(hrs / 24);
    return t("daysAgo", { count: days });
  };
}

const PAGE_LIMIT = 50;

export default function AuditLogPage() {
  const { t, i18n } = useTranslation(["audit", "common"]);
  const timeAgo = useTimeAgo();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasMetadata = (m: Record<string, any> | null | undefined): boolean => {
    if (!m) return false;
    if (typeof m !== "object") return false;
    return Object.keys(m).length > 0;
  };

  const debounceSearch = useCallback(
    (() => {
      let t: ReturnType<typeof setTimeout>;
      return (val: string) => {
        clearTimeout(t);
        t = setTimeout(() => setDebouncedSearch(val), 350);
      };
    })(),
    []
  );

  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(1);
    debounceSearch(v);
  };

  const handleFilter = (v: string) => {
    setEntityFilter(v);
    setPage(1);
  };

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(PAGE_LIMIT),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(entityFilter !== "all" ? { entityType: entityFilter } : {}),
  });

  const { data, isLoading, isFetching } = useQuery<AuditLogsResponse>({
    queryKey: ["/api/audit-logs", page, debouncedSearch, entityFilter],
    queryFn: () => apiRequest("GET", `/api/audit-logs?${queryParams}`).then(r => r.json()) as Promise<AuditLogsResponse>,
    staleTime: 30_000,
  });

  const logs = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_LIMIT);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <ScrollText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground tracking-tight">{t("audit:title")}</h1>
              <p className="text-sm text-muted-foreground">{t("audit:subtitle")}</p>
            </div>
          </div>
          {total > 0 && (
            <span className="text-sm text-muted-foreground" data-testid="audit-total-count">
              <bdi>{t("audit:events", { count: total })}</bdi>
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="input-audit-search"
              placeholder={t("audit:searchPlaceholder")}
              className="ps-9 bg-card border-border"
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {ENTITY_FILTER_VALUES.map(value => (
              <Button
                key={value}
                variant={entityFilter === value ? "default" : "outline"}
                size="sm"
                data-testid={`filter-audit-${value}`}
                onClick={() => handleFilter(value)}
                className={entityFilter === value ? "" : "border-border text-muted-foreground hover:text-foreground"}
              >
                {t(`audit:filters.${value}`)}
              </Button>
            ))}
          </div>
        </div>

        {/* Log Feed */}
        <div className="rounded-lg border border-border overflow-hidden bg-card">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{t("audit:loading")}</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <ScrollText className="h-10 w-10 opacity-30" />
              <p className="text-sm">{t("audit:noEvents")}</p>
              {(debouncedSearch || entityFilter !== "all") && (
                <Button variant="ghost" size="sm" onClick={() => { handleSearch(""); handleFilter("all"); }}>
                  {t("audit:clearFilters")}
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {logs.map((log: AuditLog, i: number) => {
                const EntityIcon = ENTITY_ICONS[log.entityType ?? ""] ?? UserCircle2;
                const actionLabel = t(`audit:actions.${log.action}`, log.action);
                const actionColor = ACTION_COLORS[log.action] ?? "bg-muted/30 text-muted-foreground border-border";
                const expandable = hasMetadata(log.metadata);
                const isExpanded = expandedIds.has(log.id);
                return (
                  <div key={log.id} data-testid={`audit-row-${i}`}>
                    <div
                      className={`flex items-start gap-4 px-4 py-3.5 transition-colors ${
                        expandable ? "cursor-pointer hover:bg-muted/[0.08]" : "hover:bg-muted/[0.06]"
                      }`}
                      onClick={() => expandable && toggleExpand(log.id)}
                      role={expandable ? "button" : undefined}
                      aria-expanded={expandable ? isExpanded : undefined}
                    >
                      {/* Actor Avatar */}
                      <div className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">{getInitials(log.actorName)}</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <span className="font-medium text-sm text-foreground" data-testid={`audit-actor-${i}`}>
                            <bdi>{log.actorName ?? t("audit:system")}</bdi>
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[11px] px-1.5 py-0 border ${actionColor}`}
                            data-testid={`audit-action-${i}`}
                          >
                            {actionLabel}
                          </Badge>
                          {log.entityType && (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <EntityIcon className="h-3 w-3" />
                              {log.entityType}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground leading-snug" data-testid={`audit-desc-${i}`}>
                          {log.description}
                        </p>
                        {(log.employeeNumber || log.subjectName) && (
                          <div className="flex gap-2 mt-1 flex-wrap">
                            {log.employeeNumber && (
                              <span className="text-[11px] bg-muted/40 border border-border/50 rounded px-1.5 py-0.5 font-mono text-muted-foreground" dir="ltr">
                                #{log.employeeNumber}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Timestamp + chevron */}
                      <div className="shrink-0 text-end flex items-start gap-2" data-testid={`audit-time-${i}`}>
                        <div>
                          <span className="text-[11px] text-muted-foreground">{timeAgo(log.createdAt)}</span>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5"><bdi>{formatTimestamp(log.createdAt, i18n.language)}</bdi></p>
                        </div>
                        {expandable && (
                          <ChevronDown
                            className={`h-4 w-4 mt-0.5 text-muted-foreground/60 transition-transform ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                            data-testid={`audit-expand-${i}`}
                          />
                        )}
                      </div>
                    </div>

                    {/* Expanded metadata */}
                    {expandable && isExpanded && (
                      <div
                        className="px-4 pb-4 ps-16 -mt-1"
                        data-testid={`audit-metadata-${i}`}
                      >
                        <div className="rounded-md border border-border/60 bg-muted/30 p-3">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5">
                            {t("audit:details")}
                          </div>
                          <pre className="text-[12px] font-mono text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
{JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              <bdi>{t("audit:page", { page: formatNumber(page, i18n.language), total: formatNumber(totalPages, i18n.language), count: formatNumber(total, i18n.language) })}</bdi>
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                data-testid="button-audit-prev"
                className="border-border"
              >
                <ChevronLeft className="h-4 w-4 me-1 rtl:rotate-180" />
                {t("audit:previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                data-testid="button-audit-next"
                className="border-border"
              >
                {t("audit:next")}
                <ChevronRight className="h-4 w-4 ms-1 rtl:rotate-180" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
