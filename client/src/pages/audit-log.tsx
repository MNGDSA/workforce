import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { formatNumber, formatDate as fmtDateLocale } from "@/lib/format";
import DashboardLayout from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ScrollText,
  Search,
  UserCircle2,
  Users,
  ClipboardCheck,
  CalendarClock,
  Package,
  CalendarDays,
  Loader2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
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

interface AuditLogsCursorResponse {
  data: AuditLog[];
  total: number;
  nextCursor: string | null;
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
  const { toast } = useToast();
  const timeAgo = useTimeAgo();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState<null | "csv" | "xlsx">(null);

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
      let timer: ReturnType<typeof setTimeout>;
      return (val: string) => {
        clearTimeout(timer);
        timer = setTimeout(() => setDebouncedSearch(val), 350);
      };
    })(),
    []
  );

  const handleSearch = (v: string) => {
    setSearch(v);
    debounceSearch(v);
  };

  const handleFilter = (v: string) => {
    setEntityFilter(v);
  };

  const buildParams = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (entityFilter !== "all") p.set("entityType", entityFilter);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p;
  }, [debouncedSearch, entityFilter]);

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery<AuditLogsCursorResponse>({
    queryKey: ["/api/audit-logs", "cursor", debouncedSearch, entityFilter],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = buildParams({ mode: "cursor", limit: String(PAGE_LIMIT) });
      if (pageParam) params.set("cursor", pageParam as string);
      const res = await apiRequest("GET", `/api/audit-logs?${params}`);
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });

  const logs: AuditLog[] = useMemo(
    () => (data?.pages ?? []).flatMap(p => p.data),
    [data],
  );
  const total = data?.pages?.[0]?.total ?? 0;
  const loaded = logs.length;

  // Reset expanded rows when filters change so virtualizer measurements stay clean.
  useEffect(() => {
    setExpandedIds(new Set());
  }, [debouncedSearch, entityFilter]);

  // ─── Virtualizer ────────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const log = logs[index];
      if (log && expandedIds.has(log.id)) return 240;
      return 88;
    },
    overscan: 8,
    getItemKey: (index) => logs[index]?.id ?? index,
  });

  // Re-measure when expansion state changes
  useEffect(() => {
    virtualizer.measure();
  }, [expandedIds, virtualizer]);

  // ─── Sentinel-based infinite loading ───────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    if (!hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
            break;
          }
        }
      },
      { root: scrollRef.current, rootMargin: "200px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, logs.length]);

  // ─── Export ────────────────────────────────────────────────────────────────
  const handleExport = async (format: "csv" | "xlsx") => {
    if (isExporting) return;
    setIsExporting(format);
    try {
      const params = buildParams({ format, export: "true" });
      const res = await apiRequest("GET", `/api/audit-logs?${params}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      a.download = `audit-log-${ts}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast({
        title: t("audit:exportFailed"),
        variant: "destructive",
      });
    } finally {
      setIsExporting(null);
    }
  };

  const items = virtualizer.getVirtualItems();

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6 h-full">
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
            <span className="text-sm text-muted-foreground" data-testid="audit-loaded-count">
              <bdi>{t("audit:showingOf", { loaded: formatNumber(loaded, i18n.language), total: formatNumber(total, i18n.language) })}</bdi>
            </span>
          )}
        </div>

        {/* Filters + Export */}
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
          <div className="flex gap-2 flex-wrap items-center">
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border"
                  disabled={isExporting !== null || total === 0}
                  data-testid="button-audit-export"
                >
                  {isExporting !== null ? (
                    <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 me-1.5" />
                  )}
                  {isExporting !== null ? t("audit:exporting") : t("audit:export")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  data-testid="menu-export-xlsx"
                  onSelect={() => handleExport("xlsx")}
                  disabled={isExporting !== null}
                >
                  <FileSpreadsheet className="h-4 w-4 me-2" />
                  {t("audit:exportExcel")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid="menu-export-csv"
                  onSelect={() => handleExport("csv")}
                  disabled={isExporting !== null}
                >
                  <FileText className="h-4 w-4 me-2" />
                  {t("audit:exportCsv")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Log Feed */}
        <div className="rounded-lg border border-border overflow-hidden bg-card flex-1 min-h-0 flex flex-col">
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
            <div
              ref={scrollRef}
              className="flex-1 overflow-auto"
              data-testid="audit-scroll-container"
              style={{ minHeight: 400 }}
            >
              <div
                style={{
                  height: virtualizer.getTotalSize(),
                  width: "100%",
                  position: "relative",
                }}
              >
                {items.map(virtualRow => {
                  const log = logs[virtualRow.index];
                  if (!log) return null;
                  const i = virtualRow.index;
                  const EntityIcon = ENTITY_ICONS[log.entityType ?? ""] ?? UserCircle2;
                  const actionLabel = t(`audit:actions.${log.action}`, log.action);
                  const actionColor = ACTION_COLORS[log.action] ?? "bg-muted/30 text-muted-foreground border-border";
                  const expandable = hasMetadata(log.metadata);
                  const isExpanded = expandedIds.has(log.id);
                  return (
                    <div
                      key={virtualRow.key}
                      ref={virtualizer.measureElement}
                      data-index={virtualRow.index}
                      data-testid={`audit-row-${i}`}
                      className="absolute left-0 right-0 border-b border-border/40"
                      style={{
                        top: 0,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div
                        className={`flex items-start gap-4 px-4 py-3.5 transition-colors ${
                          expandable ? "cursor-pointer hover:bg-muted/[0.08]" : "hover:bg-muted/[0.06]"
                        }`}
                        onClick={() => expandable && toggleExpand(log.id)}
                        role={expandable ? "button" : undefined}
                        aria-expanded={expandable ? isExpanded : undefined}
                      >
                        <div className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                          <span className="text-xs font-bold text-primary">{getInitials(log.actorName)}</span>
                        </div>

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

              {/* Sentinel + status */}
              <div
                ref={sentinelRef}
                className="flex items-center justify-center py-4 text-xs text-muted-foreground"
                data-testid="audit-sentinel"
              >
                {isFetchingNextPage ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("audit:loadingMore")}
                  </span>
                ) : hasNextPage ? (
                  <span className="opacity-0">.</span>
                ) : (
                  <span>{t("audit:endOfList")}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
