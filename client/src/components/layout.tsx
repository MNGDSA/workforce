import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface LayoutProps {
  children: React.ReactNode;
}

const recruitmentPaths = ["/seasons", "/question-sets", "/job-posting", "/interviews", "/talent"];

const recruitmentItems = [
  { href: "/seasons",       icon: CalendarRange, label: "Seasons & SMP" },
  { href: "/question-sets", icon: ClipboardList, label: "Question Sets" },
  { href: "/job-posting",   icon: Briefcase,     label: "Job Applications" },
  { href: "/interviews",    icon: Minimize,      label: "Interview Calls" },
  { href: "/talent",        icon: Search,        label: "Talent" },
];

const topNavItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/workforce", icon: Users,           label: "Workforce" },
];

const settingsPaths = ["/settings", "/automation"];

const settingsSubItems = [
  { href: "/automation", icon: Workflow, label: "Rules & Automation" },
];

const bottomNavItems = [
  { href: "/documentation", icon: BookOpen, label: "Documentation" },
];

export default function DashboardLayout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [recruitmentOpen, setRecruitmentOpen] = useState(
    () => recruitmentPaths.some((p) => location.startsWith(p))
  );
  const [settingsOpen, setSettingsOpen] = useState(
    () => settingsPaths.some((p) => location.startsWith(p))
  );

  const renderNavLink = (href: string, Icon: React.ElementType, label: string) => {
    const isActive = location === href;
    return (
      <Link key={href} href={href}>
        <button
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3 rounded-sm text-sm font-medium transition-all duration-200 group",
            isActive
              ? "bg-primary/10 text-primary border-l-2 border-primary"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border-l-2 border-transparent"
          )}
        >
          <Icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
          {label}
        </button>
      </Link>
    );
  };

  const isRecruitmentActive = recruitmentPaths.some((p) => location.startsWith(p));

  const NavContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-border text-sidebar-foreground">
      <div className="h-16 flex items-center px-6 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <img src="/workforce-logo.svg" alt="Workforce" className="h-9 w-9" />
          <span className="font-display font-bold text-xl tracking-tight text-white">
            WORKFORCE
          </span>
        </div>
      </div>

      <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
        {topNavItems.map((item) => renderNavLink(item.href, item.icon, item.label))}

        {/* ── Recruitment Group ── */}
        <div>
          <button
            onClick={() => setRecruitmentOpen((v) => !v)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-sm text-sm font-medium transition-all duration-200 group",
              isRecruitmentActive
                ? "bg-primary/10 text-primary border-l-2 border-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border-l-2 border-transparent"
            )}
          >
            <UserSearch className={cn("h-5 w-5 shrink-0", isRecruitmentActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
            <span className="flex-1 text-left">Recruitment</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-200 shrink-0", recruitmentOpen ? "rotate-0" : "-rotate-90")} />
          </button>

          {recruitmentOpen && (
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border/50 pl-3">
              {recruitmentItems.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <button
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium transition-all duration-200 group",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                      {item.label}
                    </button>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {bottomNavItems.map((item) => renderNavLink(item.href, item.icon, item.label))}

        {/* ── System & Settings Group ── */}
        {(() => {
          const isSettingsActive = settingsPaths.some((p) => location.startsWith(p));
          return (
            <div>
              <button
                onClick={() => setSettingsOpen((v) => !v)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-sm text-sm font-medium transition-all duration-200 group",
                  isSettingsActive
                    ? "bg-primary/10 text-primary border-l-2 border-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border-l-2 border-transparent"
                )}
              >
                <Settings className={cn("h-5 w-5 shrink-0", isSettingsActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                <span className="flex-1 text-left">System & Settings</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200 shrink-0", settingsOpen ? "rotate-0" : "-rotate-90")} />
              </button>

              {settingsOpen && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border/50 pl-3">
                  <Link href="/settings">
                    <button className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium transition-all duration-200 group",
                      location === "/settings"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}>
                      <Settings className={cn("h-4 w-4 shrink-0", location === "/settings" ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                      Settings
                    </button>
                  </Link>
                  {settingsSubItems.map((item) => {
                    const isActive = location === item.href;
                    return (
                      <Link key={item.href} href={item.href}>
                        <button className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium transition-all duration-200 group",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}>
                          <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                          {item.label}
                        </button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <div className="p-4 border-t border-border/50">
        <div className="bg-muted/30 p-4 rounded-sm border border-border">
          <h4 className="font-display font-bold text-sm text-white mb-1">Seasonal Status</h4>
          <div className="w-full bg-muted/50 h-2 rounded-full mt-2 overflow-hidden">
            <div className="bg-primary h-full w-[75%]" />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>Hiring Goal</span>
            <span className="text-white">75%</span>
          </div>
        </div>
        
        <Link href="/">
          <Button variant="ghost" className="w-full mt-4 justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10">
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 fixed inset-y-0 left-0 z-50">
        <NavContent />
      </aside>

      {/* Main Content */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
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
                <NavContent />
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
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9 border border-border">
                    <AvatarImage src="/avatar-foreman.png" alt="Foreman" />
                    <AvatarFallback>JD</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">John Davis</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      Site Foreman
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Profile Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive">
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
  );
}
