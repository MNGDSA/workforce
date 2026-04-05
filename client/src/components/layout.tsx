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
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

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

const workforcePaths = ["/workforce", "/schedules"];
const workforceSubItems = [
  { href: "/workforce", icon: Users,  label: "Employees" },
  { href: "/schedules", icon: Clock,  label: "Schedules & Shifts" },
];

const settingsPaths = ["/settings", "/automation", "/id-cards"];
const settingsSubItems = [
  { href: "/settings",   icon: Settings,  label: "Settings" },
  { href: "/id-cards",   icon: CreditCard, label: "ID Cards" },
  { href: "/automation", icon: Workflow,   label: "Rules & Automation" },
];

const bottomNavItems = [
  { href: "/reports",       icon: BarChart3, label: "Reports" },
  { href: "/documentation", icon: BookOpen,  label: "Documentation" },
];

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

              <div className="relative hidden md:block w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search candidates, jobs, or schedules..."
                  className="pl-10 bg-muted/30 border-border focus-visible:ring-primary/20 h-9 rounded-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
                <Bell className="h-5 w-5" />
                <span className="absolute top-2 right-2 h-2 w-2 bg-primary rounded-full animate-pulse" />
              </Button>

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
