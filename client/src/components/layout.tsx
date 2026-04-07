import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  CalendarDays,
  Settings,
  LogOut,
  Bell,
  Search,
  Menu,
  CalendarRange,
  Workflow,
  Minimize,
  BookOpen,
  ClipboardList,
  UserSearch,
  ChevronDown,
  Wallet,
  BarChart3,
  UserCheck,
  FileText,
  CreditCard,
  Clock,
  ChevronsLeft,
  ChevronsRight,
  Package,
  ScrollText,
  User,
  CalendarCheck,
  Loader2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { createPortal } from "react-dom";
import { useDebounce } from "@/hooks/use-debounce";
import { apiRequest } from "@/lib/queryClient";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, CalendarMinus, AlertCircle, CheckCheck, X as XIcon } from "lucide-react";

// ─── Global Search ─────────────────────────────────────────────────────────────
type SearchResult = { id: string; title: string; subtitle: string; href: string };
type SearchResults = {
  candidates: SearchResult[];
  employees: SearchResult[];
  events: SearchResult[];
  jobs: SearchResult[];
};

const CATEGORY_META = {
  candidates: { label: "Candidates", icon: User,          color: "text-blue-400"   },
  employees:  { label: "Employees",  icon: Users,         color: "text-emerald-400" },
  events:     { label: "Events",     icon: CalendarCheck, color: "text-violet-400"  },
  jobs:       { label: "Jobs",       icon: Briefcase,     color: "text-amber-400"   },
} as const;

function GlobalSearch() {
  const [, setLocation] = useLocation();
  const [query, setQuery]       = useState("");
  const [open, setOpen]         = useState(false);
  const [activeIdx, setActive]  = useState(-1);
  const inputRef  = useRef<HTMLInputElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);

  const debouncedQ = useDebounce(query, 200);
  const shouldFetch = debouncedQ.trim().length >= 2;

  const { data, isFetching } = useQuery<SearchResults>({
    queryKey: ["/api/search", debouncedQ],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/search?q=${encodeURIComponent(debouncedQ)}`);
      return r.json();
    },
    enabled: shouldFetch,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });

  // flat ordered list of all results for keyboard nav
  const flatItems: SearchResult[] = useMemo(() => {
    if (!data) return [];
    return [
      ...data.candidates,
      ...data.employees,
      ...data.events,
      ...data.jobs,
    ];
  }, [data]);

  const hasResults = flatItems.length > 0;

  const totalCount = flatItems.length;

  // Update dropdown position when open
  const updateRect = useCallback(() => {
    if (wrapRef.current) setDropRect(wrapRef.current.getBoundingClientRect());
  }, []);

  useEffect(() => {
    if (open) {
      updateRect();
      window.addEventListener("scroll", updateRect, true);
      window.addEventListener("resize", updateRect);
      return () => {
        window.removeEventListener("scroll", updateRect, true);
        window.removeEventListener("resize", updateRect);
      };
    }
  }, [open, updateRect]);

  // Reset active index when results change
  useEffect(() => { setActive(-1); }, [debouncedQ]);

  // Open on type
  useEffect(() => {
    if (query.length > 0) setOpen(true);
    else { setOpen(false); setActive(-1); }
  }, [query]);

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
        updateRect();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [updateRect]);

  // Click-outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navigate = (href: string) => {
    setOpen(false);
    setQuery("");
    setLocation(href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(i => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(i => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIdx >= 0 && flatItems[activeIdx]) {
      e.preventDefault();
      navigate(flatItems[activeIdx].href);
    }
  };

  // build grouped structure preserving order for rendering but tracking flat index
  const grouped = useMemo(() => {
    if (!data) return [];
    let idx = 0;
    return (Object.keys(CATEGORY_META) as (keyof typeof CATEGORY_META)[])
      .filter(k => data[k].length > 0)
      .map(k => {
        const items = data[k].map(r => ({ ...r, flatIdx: idx++ }));
        return { key: k, items };
      });
  }, [data]);

  const showDropdown = open && shouldFetch;

  return (
    <div ref={wrapRef} className="relative hidden md:block w-96">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
      {isFetching && shouldFetch && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
      )}
      <Input
        ref={inputRef}
        data-testid="input-global-search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (query.length > 0) { setOpen(true); updateRect(); } }}
        placeholder="Search candidates, employees, events, jobs…"
        className="pl-10 pr-10 bg-muted/30 border-border focus-visible:ring-primary/20 h-9 rounded-sm"
        autoComplete="off"
      />

      {showDropdown && createPortal(
        <div
          style={{
            position: "fixed",
            top: (dropRect?.bottom ?? 0) + 6,
            left: dropRect?.left ?? 0,
            width: dropRect?.width ?? 384,
            zIndex: 9999,
          }}
          className="bg-popover border border-border rounded-md shadow-2xl overflow-hidden"
        >
          {isFetching && !hasResults ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          ) : !hasResults ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              No results for <span className="font-medium text-foreground">"{debouncedQ}"</span>
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto py-1">
              {grouped.map(({ key, items }) => {
                const meta = CATEGORY_META[key];
                const Icon = meta.icon;
                return (
                  <div key={key}>
                    <div className="px-3 pt-2 pb-0.5 flex items-center gap-1.5">
                      <Icon className={cn("h-3 w-3", meta.color)} />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {meta.label}
                      </span>
                    </div>
                    {items.map(item => {
                      const isActive = item.flatIdx === activeIdx;
                      return (
                        <button
                          key={item.id}
                          data-testid={`search-result-${key}-${item.id}`}
                          onMouseEnter={() => setActive(item.flatIdx)}
                          onMouseDown={e => { e.preventDefault(); navigate(item.href); }}
                          className={cn(
                            "w-full text-left px-4 py-2 flex flex-col gap-0.5 transition-colors",
                            isActive ? "bg-primary/10 text-foreground" : "hover:bg-muted/50 text-foreground"
                          )}
                        >
                          <span className="text-sm font-medium leading-tight truncate">{item.title}</span>
                          <span className="text-[11px] text-muted-foreground leading-tight truncate">{item.subtitle}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              <div className="border-t border-border mt-1 px-3 py-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                <span>{totalCount} result{totalCount !== 1 ? "s" : ""}</span>
                <span className="ml-auto flex items-center gap-2">
                  <kbd className="border border-border rounded px-1 py-0.5 text-[9px] font-mono">↑↓</kbd> navigate
                  <kbd className="border border-border rounded px-1 py-0.5 text-[9px] font-mono">↵</kbd> open
                  <kbd className="border border-border rounded px-1 py-0.5 text-[9px] font-mono">esc</kbd> close
                </span>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

interface LayoutProps {
  children: React.ReactNode;
}

const recruitmentPaths = ["/events", "/smp-contracts", "/question-sets", "/job-posting", "/interviews", "/onboarding", "/talent"];
const recruitmentItems: { href: string; icon: React.ElementType; label: string }[] = [
  { href: "/events",        icon: CalendarRange, label: "Events" },
  { href: "/smp-contracts", icon: FileText,      label: "SMP Contracts" },
  { href: "/question-sets", icon: ClipboardList, label: "Question Sets" },
  { href: "/job-posting",   icon: Briefcase,     label: "Job Applications" },
  { href: "/interviews",    icon: Minimize,      label: "Interview & Training" },
  { href: "/onboarding",    icon: UserCheck,     label: "Onboarding" },
  { href: "/talent",        icon: Search,        label: "Talent" },
];

const topNavItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/payroll",   icon: Wallet,          label: "Payroll" },
];

const workforcePaths = ["/workforce", "/schedules", "/assets", "/offboarding"];
const workforceSubItems = [
  { href: "/workforce",   icon: Users,   label: "Employees" },
  { href: "/schedules",   icon: Clock,   label: "Schedules & Shifts" },
  { href: "/assets",      icon: Package, label: "Assets" },
  { href: "/offboarding", icon: LogOut,  label: "Offboarding" },
];

const settingsPaths = ["/settings", "/automation", "/id-cards"];
const settingsSubItems = [
  { href: "/settings",   icon: Settings,  label: "Settings" },
  { href: "/id-cards",   icon: CreditCard, label: "ID Cards" },
  { href: "/automation", icon: Workflow,   label: "Rules & Automation" },
];

const bottomNavItems = [
  { href: "/reports",       icon: BarChart3,   label: "Reports" },
  { href: "/audit-log",     icon: ScrollText,  label: "Audit Log" },
  { href: "/documentation", icon: BookOpen,    label: "Documentation" },
];

// ─── Bell Notification Center ─────────────────────────────────────────────────
type DateAlert = { id: string; name: string; startDate?: string; endDate?: string; daysAway: number };
type ActivityAlert = { id: string; subject: string; body: string; createdAt: string; status: string };
type EventAlertsPayload = {
  dateAlerts: { starting: DateAlert[]; ending: DateAlert[] };
  activityLog: ActivityAlert[];
  unreadCount: number;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function BellNotificationCenter() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelRect, setPanelRect] = useState<{ top: number; right: number } | null>(null);
  const qc = useQueryClient();

  const { data } = useQuery<EventAlertsPayload>({
    queryKey: ["/api/admin/event-alerts"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/event-alerts");
      return r.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/alerts/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/event-alerts"] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/alerts/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/event-alerts"] }),
  });

  const dateAlertCount = (data?.dateAlerts.starting.length ?? 0) + (data?.dateAlerts.ending.length ?? 0);
  const totalBadge = dateAlertCount + (data?.unreadCount ?? 0);

  const updatePanelPos = useCallback(() => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPanelRect({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePanelPos();
    window.addEventListener("resize", updatePanelPos);
    return () => window.removeEventListener("resize", updatePanelPos);
  }, [open, updatePanelPos]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        data-testid="bell-notifications"
        onClick={() => { setOpen((v) => !v); updatePanelPos(); }}
        className="relative p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
      >
        <Bell className="h-5 w-5" />
        {totalBadge > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white leading-none">
            {totalBadge > 99 ? "99+" : totalBadge}
          </span>
        )}
      </button>

      {open && panelRect && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: panelRect.top, right: panelRect.right, zIndex: 9999 }}
          className="w-96 bg-popover border border-border rounded-md shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Notifications</span>
              {totalBadge > 0 && (
                <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{totalBadge}</Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {(data?.unreadCount ?? 0) > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50 transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted/50 transition-colors"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          <ScrollArea className="max-h-[440px]">
            {/* Event Date Alerts */}
            {dateAlertCount > 0 && (
              <div>
                <div className="px-4 py-2 bg-muted/30 border-b border-border">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Event Alerts
                  </span>
                </div>
                {data?.dateAlerts.starting.map((ev) => (
                  <div key={`start-${ev.id}`} className="flex items-start gap-3 px-4 py-3 border-b border-border/50 bg-amber-500/5 hover:bg-muted/30 transition-colors">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
                      <CalendarPlus className="h-3.5 w-3.5 text-amber-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground leading-snug">
                        {ev.daysAway === 0 ? "Starting today" : ev.daysAway === 1 ? "Starting tomorrow" : `Starting in ${ev.daysAway} days`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">"{ev.name}"</p>
                      {ev.startDate && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{ev.startDate}</p>}
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px] border-amber-500/40 text-amber-500">
                      +{ev.daysAway}d
                    </Badge>
                  </div>
                ))}
                {data?.dateAlerts.ending.map((ev) => (
                  <div key={`end-${ev.id}`} className="flex items-start gap-3 px-4 py-3 border-b border-border/50 bg-rose-500/5 hover:bg-muted/30 transition-colors">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500/15">
                      <CalendarMinus className="h-3.5 w-3.5 text-rose-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground leading-snug">
                        {ev.daysAway === 0 ? "Ending today" : ev.daysAway === 1 ? "Ending tomorrow" : `Ending in ${ev.daysAway} days`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">"{ev.name}"</p>
                      {ev.endDate && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{ev.endDate}</p>}
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px] border-rose-500/40 text-rose-500">
                      -{ev.daysAway}d
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Activity Log */}
            {(data?.activityLog.length ?? 0) > 0 && (
              <div>
                <div className="px-4 py-2 bg-muted/30 border-b border-border">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Recent Activity
                  </span>
                </div>
                {data?.activityLog.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => { if (n.status === "pending") markRead.mutate(n.id); }}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 border-b border-border/50 transition-colors cursor-pointer",
                      n.status === "pending" ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/30"
                    )}
                  >
                    <div className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      n.status === "pending" ? "bg-primary/15" : "bg-muted"
                    )}>
                      <AlertCircle className={cn("h-3.5 w-3.5", n.status === "pending" ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("text-xs leading-snug", n.status === "pending" ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>
                          {n.subject}
                        </p>
                        {n.status === "pending" && (
                          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {dateAlertCount === 0 && (data?.activityLog.length ?? 0) === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Bell className="h-8 w-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground font-medium">All clear</p>
                <p className="text-xs text-muted-foreground/70 mt-1">No events starting or ending soon</p>
              </div>
            )}
          </ScrollArea>
        </div>,
        document.body
      )}
    </>
  );
}

export default function DashboardLayout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar_collapsed") === "true"
  );
  const [recruitmentOpen, setRecruitmentOpen] = useState(
    () => recruitmentPaths.some((p) => location.startsWith(p))
  );
  const [settingsOpen, setSettingsOpen] = useState(
    () => settingsPaths.some((p) => location.startsWith(p))
  );
  const [workforceOpen, setWorkforceOpen] = useState(
    () => workforcePaths.some((p) => location.startsWith(p))
  );

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };

  const sessionUser = useMemo(() => {
    try {
      const raw = localStorage.getItem("workforce_candidate");
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch { return null; }
  }, []);

  const { data: meUser } = useQuery<{ fullName?: string; name?: string; role?: string; email?: string; phone?: string }>({
    queryKey: ["/api/me"],
  });

  const displayName: string =
    sessionUser?.fullNameEn || sessionUser?.fullName || sessionUser?.name ||
    meUser?.fullName || meUser?.name || "Admin User";

  const rawRole = sessionUser?.role || meUser?.role || "";
  const displayRole: string =
    rawRole === "admin" || rawRole === "super_admin" ? "Administrator" :
    rawRole === "recruiter" ? "Recruiter" :
    rawRole === "manager" ? "Manager" :
    rawRole || "Staff";

  const initials = displayName
    .split(" ").filter(Boolean).slice(0, 2)
    .map((w: string) => w[0]).join("").toUpperCase() || "AU";

  const handleLogout = () => {
    localStorage.removeItem("workforce_candidate");
    setLocation("/auth");
  };

  const isRecruitmentActive = recruitmentPaths.some((p) => location.startsWith(p));
  const isWorkforceActive = workforcePaths.some((p) => location.startsWith(p));
  const isSettingsActive = settingsPaths.some((p) => location.startsWith(p));

  const NavItem = ({
    href,
    icon: Icon,
    label,
    isActive,
    sub = false,
  }: {
    href: string;
    icon: React.ElementType;
    label: string;
    isActive: boolean;
    sub?: boolean;
  }) => {
    const btn = (
      <Link href={href}>
        <button
          className={cn(
            "w-full flex items-center rounded-sm text-sm font-medium transition-all duration-200 group",
            collapsed ? "justify-center px-0 py-3" : sub ? "gap-3 px-3 py-2.5" : "gap-3 px-4 py-3",
            !collapsed && !sub && "border-l-2",
            isActive
              ? cn("bg-primary/10 text-primary", !collapsed && !sub && "border-primary")
              : cn("text-muted-foreground hover:bg-muted/50 hover:text-foreground", !collapsed && !sub && "border-transparent")
          )}
        >
          <Icon className={cn(
            "shrink-0",
            sub && !collapsed ? "h-4 w-4" : "h-5 w-5",
            isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
          )} />
          {!collapsed && <span>{label}</span>}
        </button>
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      );
    }
    return btn;
  };

  const GroupHeader = ({
    icon: Icon,
    label,
    isActive,
    open,
    onClick,
  }: {
    icon: React.ElementType;
    label: string;
    isActive: boolean;
    open: boolean;
    onClick: () => void;
  }) => {
    const btn = (
      <button
        onClick={() => {
          if (collapsed) {
            setCollapsed(false);
            localStorage.setItem("sidebar_collapsed", "false");
          }
          onClick();
        }}
        className={cn(
          "w-full flex items-center rounded-sm text-sm font-medium transition-all duration-200 group",
          collapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-3 border-l-2",
          isActive
            ? cn("bg-primary/10 text-primary", !collapsed && "border-primary")
            : cn("text-muted-foreground hover:bg-muted/50 hover:text-foreground", !collapsed && "border-transparent")
        )}
      >
        <Icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{label}</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-200 shrink-0", open ? "rotate-0" : "-rotate-90")} />
          </>
        )}
      </button>
    );

    if (collapsed) {
      return (
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      );
    }
    return btn;
  };

  const NavContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full bg-sidebar border-r border-border text-sidebar-foreground">
      {/* Logo */}
      <div className={cn(
        "h-16 flex items-center border-b border-border/50 shrink-0",
        collapsed && !mobile ? "justify-center px-0" : "px-6"
      )}>
        <div className="flex items-center gap-2.5 overflow-hidden">
          <img src="/workforce-logo.svg" alt="Workforce" className="h-9 w-9 shrink-0" />
          <span className={cn(
            "font-display font-bold text-xl tracking-tight text-white whitespace-nowrap transition-all duration-300",
            collapsed && !mobile ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
          )}>
            WORKFORCE
          </span>
        </div>
      </div>

      {/* Nav items */}
      <div className={cn(
        "flex-1 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden",
        collapsed && !mobile ? "px-2" : "px-3"
      )}>
        {topNavItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            isActive={location === item.href}
          />
        ))}

        {/* Workforce group */}
        <div>
          <GroupHeader
            icon={Users}
            label="Workforce"
            isActive={isWorkforceActive}
            open={workforceOpen}
            onClick={() => setWorkforceOpen((v) => !v)}
          />
          {workforceOpen && !collapsed && (
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border/50 pl-3">
              {workforceSubItems.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  isActive={location === item.href || location.startsWith(item.href + "/")}
                  sub
                />
              ))}
            </div>
          )}
        </div>

        {/* Recruitment group */}
        <div>
          <GroupHeader
            icon={UserSearch}
            label="Recruitment"
            isActive={isRecruitmentActive}
            open={recruitmentOpen}
            onClick={() => setRecruitmentOpen((v) => !v)}
          />
          {recruitmentOpen && !collapsed && (
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border/50 pl-3">
              {recruitmentItems.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  isActive={location === item.href}
                  sub
                />
              ))}
            </div>
          )}
        </div>

        {bottomNavItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            isActive={location === item.href}
          />
        ))}

        {/* Settings group */}
        <div>
          <GroupHeader
            icon={Settings}
            label="System & Settings"
            isActive={isSettingsActive}
            open={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          />
          {settingsOpen && !collapsed && (
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border/50 pl-3">
              {settingsSubItems.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  isActive={location === item.href}
                  sub
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Collapse toggle — desktop only */}
      {!mobile && (
        <div className={cn(
          "shrink-0 border-t border-border/50 py-3",
          collapsed ? "flex justify-center" : "px-3"
        )}>
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <button
                onClick={toggleCollapsed}
                className={cn(
                  "flex items-center gap-2 rounded-sm px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all duration-200",
                  collapsed && "px-2"
                )}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed
                  ? <ChevronsRight className="h-4 w-4" />
                  : <>
                      <ChevronsLeft className="h-4 w-4" />
                      <span>Collapse</span>
                    </>
                }
              </button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">Expand sidebar</TooltipContent>}
          </Tooltip>
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground flex">
        {/* Desktop Sidebar */}
        <aside className={cn(
          "hidden lg:block fixed inset-y-0 left-0 z-50 transition-all duration-300 ease-in-out",
          collapsed ? "w-16" : "w-64"
        )}>
          <NavContent />
        </aside>

        {/* Main Content */}
        <div className={cn(
          "flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out",
          collapsed ? "lg:pl-16" : "lg:pl-64"
        )}>
          {/* Top Header */}
          <header className="h-16 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-40 px-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-64 border-r border-border bg-sidebar">
                  <NavContent mobile />
                </SheetContent>
              </Sheet>

              <GlobalSearch />
            </div>

            <div className="flex items-center gap-4">
              <BellNotificationCenter />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0">
                    <Avatar className="h-9 w-9 border border-border">
                      <AvatarFallback className="bg-primary/20 text-primary font-bold text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{displayName}</p>
                      <p className="text-xs leading-none text-muted-foreground">{displayRole}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLocation("/profile")}>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    onClick={handleLogout}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 p-6 lg:p-8 animate-in fade-in duration-500">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
