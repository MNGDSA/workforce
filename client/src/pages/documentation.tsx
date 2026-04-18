import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { useTranslation, Trans } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { formatNumber } from "@/lib/format";
import {
  BookOpen,
  Code2,
  LayoutDashboard,
  CalendarRange,
  Briefcase,
  PhoneCall,
  Users,
  Search,
  Workflow,
  Bell,
  Settings,
  Lock,
  Database,
  GitBranch,
  Server,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Zap,
} from "lucide-react";

const TECHNICAL_ROLES = ["super_admin", "admin"];

const NAV_ICONS: Record<string, React.ElementType> = {
  dashboard: LayoutDashboard,
  events: CalendarRange,
  jobs: Briefcase,
  interviews: PhoneCall,
  workforce: Users,
  talent: Search,
  automation: Workflow,
  notifications: Bell,
  settings: Settings,
};

const NAV_KEYS = ["dashboard", "events", "jobs", "interviews", "workforce", "talent", "automation", "notifications", "settings"] as const;
const STEP_NUMS = ["1", "2", "3", "4", "5"] as const;
const TIP_NUMS = ["1", "2", "3", "4", "5"] as const;
const ROLE_ROWS = [
  { role: "super_admin",  jobs: "full",       events: "full",       candidates: "full",       settings: "full" },
  { role: "admin",        jobs: "full",       events: "full",       candidates: "full",       settings: "full" },
  { role: "hr_manager",   jobs: "createEdit", events: "createEdit", candidates: "viewEdit",   settings: "view" },
  { role: "recruiter",    jobs: "create",     events: "view",       candidates: "viewEdit",   settings: "none" },
  { role: "interviewer",  jobs: "view",       events: "view",       candidates: "view",       settings: "none" },
  { role: "viewer",       jobs: "view",       events: "view",       candidates: "view",       settings: "none" },
] as const;
const STACK_KEYS = ["frontend", "backend", "database", "sms", "pdf"] as const;
const SCHEMA_TABLES = ["users", "candidates", "events", "job_postings", "applications", "interviews", "workforce", "automation_rules", "notifications"] as const;
const API_ROWS = [
  { key: "me",               method: "GET",   path: "/api/me" },
  { key: "login",            method: "POST",  path: "/api/auth/login" },
  { key: "dashboardStats",   method: "GET",   path: "/api/dashboard/stats" },
  { key: "candidatesList",   method: "GET",   path: "/api/candidates" },
  { key: "candidatesBulk",   method: "POST",  path: "/api/candidates/bulk" },
  { key: "eventsList",       method: "GET",   path: "/api/events" },
  { key: "eventsCreate",     method: "POST",  path: "/api/events" },
  { key: "eventsUpdate",     method: "PATCH", path: "/api/events/:id" },
  { key: "jobsList",         method: "GET",   path: "/api/jobs" },
  { key: "jobsCreate",       method: "POST",  path: "/api/jobs" },
  { key: "appsStats",        method: "GET",   path: "/api/applications/stats" },
  { key: "automationList",   method: "GET",   path: "/api/automation" },
  { key: "automationUpdate", method: "PATCH", path: "/api/automation/:id" },
] as const;
const CHECKLIST_NUMS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

function SectionHeading({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="h-9 w-9 rounded-sm bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h3 className="text-white font-display font-semibold text-base">{title}</h3>
        {description && <p className="text-muted-foreground text-sm mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

function DocCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={`bg-card border-border ${className}`}>
      <CardContent className="p-6">{children}</CardContent>
    </Card>
  );
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="h-7 w-7 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 text-xs font-bold font-display mt-0.5">
        <bdi>{number}</bdi>
      </div>
      <div>
        <p className="text-white text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-sm mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-muted/40 border border-border rounded-sm p-4 text-xs font-mono text-green-400 overflow-x-auto whitespace-pre-wrap" dir="ltr">
      {children}
    </pre>
  );
}

const PROJECT_STRUCTURE = `/
├── client/src/
│   ├── pages/           # All page components (one file per route)
│   ├── components/
│   │   ├── layout.tsx   # Sidebar + top nav + RBAC nav filtering
│   │   └── ui/          # Shadcn component library
│   ├── hooks/           # use-debounce, use-mobile
│   └── lib/
│       └── queryClient.ts   # apiRequest() wrapper + TanStack Query client
├── server/
│   ├── index.ts         # Express app entry point
│   ├── routes.ts        # All /api/* endpoints
│   ├── storage.ts       # DatabaseStorage (IStorage interface)
│   ├── db.ts            # Drizzle + PostgreSQL connection pool
│   └── seed.ts          # DB seeder (demo users + sample data)
├── shared/
│   └── schema.ts        # Drizzle tables + Zod schemas + TypeScript types
└── drizzle.config.ts    # Drizzle Kit config`;

export default function DocumentationPage() {
  const { t } = useTranslation("documentation");
  const { data: currentUser } = useQuery<{ role: string; fullName: string }>({
    queryKey: ["/api/me"],
    queryFn: () => apiRequest("GET", "/api/me").then((r) => r.json()),
  });

  const isTechnicalUser = TECHNICAL_ROLES.includes(currentUser?.role ?? "");

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight" data-testid="text-doc-title">{t("header.title")}</h1>
            <p className="text-muted-foreground mt-1">{t("header.subtitle")}</p>
          </div>
          <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 font-mono text-xs" dir="ltr">
            {currentUser?.role ?? t("header.loadingRole")}
          </Badge>
        </div>

        <Tabs defaultValue="user" className="space-y-6">
          <TabsList className={`grid w-full max-w-sm bg-muted/20 ${isTechnicalUser ? "grid-cols-2" : "grid-cols-1"}`}>
            <TabsTrigger value="user" className="flex items-center gap-2" data-testid="tab-user-guide">
              <BookOpen className="h-4 w-4" />
              {t("tabs.user")}
            </TabsTrigger>
            {isTechnicalUser && (
              <TabsTrigger value="technical" className="flex items-center gap-2" data-testid="tab-technical">
                <Code2 className="h-4 w-4" />
                {t("tabs.technical")}
              </TabsTrigger>
            )}
          </TabsList>

          {/* ─── User Guide ─────────────────────────────────────────── */}
          <TabsContent value="user" className="space-y-6">

            {/* Welcome */}
            <DocCard>
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-sm bg-primary flex items-center justify-center shrink-0">
                  <BookOpen className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h2 className="text-white font-display font-bold text-xl">{t("welcome.title")}</h2>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{t("welcome.body")}</p>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Badge className="bg-primary/10 text-primary border-0">{t("welcome.badges.saudi")}</Badge>
                    <Badge className="bg-blue-500/10 text-blue-400 border-0">{t("welcome.badges.citc")}</Badge>
                    <Badge className="bg-green-500/10 text-green-400 border-0">{t("welcome.badges.candidates")}</Badge>
                  </div>
                </div>
              </div>
            </DocCard>

            {/* Navigation Guide */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-white font-display flex items-center gap-2">
                  <LayoutDashboard className="h-5 w-5 text-primary" />
                  {t("nav.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {NAV_KEYS.map((key) => {
                  const Icon = NAV_ICONS[key];
                  return (
                    <div key={key} className="flex gap-3 p-3 rounded-sm bg-muted/20 border border-border/50">
                      <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-white text-sm font-medium">{t(`nav.items.${key}.label`)}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{t(`nav.items.${key}.desc`)}</p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* How to post a job */}
            <DocCard>
              <SectionHeading icon={Briefcase} title={t("postJob.title")} description={t("postJob.desc")} />
              <div className="space-y-4">
                {STEP_NUMS.map((n) => (
                  <Step key={n} number={formatNumber(Number(n))} title={t(`postJob.steps.${n}.title`)} description={t(`postJob.steps.${n}.desc`)} />
                ))}
              </div>
            </DocCard>

            {/* How to create an event */}
            <DocCard>
              <SectionHeading icon={CalendarRange} title={t("createEvent.title")} description={t("createEvent.desc")} />
              <div className="space-y-4">
                {STEP_NUMS.map((n) => (
                  <Step key={n} number={formatNumber(Number(n))} title={t(`createEvent.steps.${n}.title`)} description={t(`createEvent.steps.${n}.desc`)} />
                ))}
              </div>
            </DocCard>

            {/* Candidate search tips */}
            <DocCard>
              <SectionHeading icon={Search} title={t("search.title")} description={t("search.desc")} />
              <div className="space-y-3 text-sm text-muted-foreground">
                {TIP_NUMS.map((n) => {
                  const lead = t(`search.tips.${n}.lead`);
                  const highlight = t(`search.tips.${n}.highlight`);
                  const tail = t(`search.tips.${n}.tail`);
                  return (
                    <p key={n}>
                      {lead && <>• {lead}</>}
                      {highlight && <span className="text-white">{highlight}</span>}
                      {!lead && !highlight ? `• ${tail}` : tail}
                    </p>
                  );
                })}
              </div>
            </DocCard>

            {/* Role permissions summary */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-white font-display flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  {t("roles.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-start text-muted-foreground font-medium pb-3 pe-4">{t("roles.headers.role")}</th>
                        <th className="text-start text-muted-foreground font-medium pb-3 pe-4">{t("roles.headers.jobs")}</th>
                        <th className="text-start text-muted-foreground font-medium pb-3 pe-4">{t("roles.headers.events")}</th>
                        <th className="text-start text-muted-foreground font-medium pb-3 pe-4">{t("roles.headers.candidates")}</th>
                        <th className="text-start text-muted-foreground font-medium pb-3">{t("roles.headers.settings")}</th>
                      </tr>
                    </thead>
                    <tbody className="space-y-2">
                      {ROLE_ROWS.map((r) => (
                        <tr key={r.role} className="border-b border-border/30">
                          <td className="py-2.5 pe-4">
                            <Badge variant="outline" className="font-mono text-xs border-border" dir="ltr">{r.role}</Badge>
                          </td>
                          <td className="py-2.5 pe-4 text-muted-foreground">{t(`roles.values.${r.jobs}`)}</td>
                          <td className="py-2.5 pe-4 text-muted-foreground">{t(`roles.values.${r.events}`)}</td>
                          <td className="py-2.5 pe-4 text-muted-foreground">{t(`roles.values.${r.candidates}`)}</td>
                          <td className="py-2.5 text-muted-foreground">{t(`roles.values.${r.settings}`)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Technical Documentation ─────────────────────────────── */}
          {isTechnicalUser && (
            <TabsContent value="technical" className="space-y-6">

              {/* Access warning */}
              <div className="flex items-center gap-3 p-4 rounded-sm bg-amber-500/10 border border-amber-500/20">
                <Lock className="h-5 w-5 text-amber-500 shrink-0" />
                <p className="text-sm text-amber-400">
                  <Trans i18nKey="documentation:tech.warning" components={{ strong: <strong /> }} />
                </p>
              </div>

              {/* Stack */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-white font-display flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    {t("tech.stack.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {STACK_KEYS.map((k) => (
                    <div key={k} className="flex gap-4 p-3 bg-muted/20 rounded-sm border border-border/50">
                      <div className="w-24 shrink-0">
                        <Badge variant="outline" className="font-mono text-xs border-border">{t(`tech.stack.items.${k}.layer`)}</Badge>
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium" dir="ltr">{t(`tech.stack.items.${k}.tech`)}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{t(`tech.stack.items.${k}.detail`)}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Project structure */}
              <DocCard>
                <SectionHeading icon={GitBranch} title={t("tech.structure.title")} />
                <CodeBlock>{PROJECT_STRUCTURE}</CodeBlock>
              </DocCard>

              {/* Database schema */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-white font-display flex items-center gap-2">
                    <Database className="h-5 w-5 text-primary" />
                    {t("tech.schema.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {SCHEMA_TABLES.map((tbl) => (
                    <div key={tbl} className="p-3 bg-muted/20 rounded-sm border border-border/50">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-primary text-xs font-mono bg-primary/10 px-1.5 py-0.5 rounded" dir="ltr">{tbl}</code>
                        <span className="text-white text-sm">{t(`tech.schema.tables.${tbl}.purpose`)}</span>
                      </div>
                      <p className="text-muted-foreground text-xs">{t(`tech.schema.tables.${tbl}.notes`)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* API reference */}
              <DocCard>
                <SectionHeading icon={Server} title={t("tech.api.title")} description={t("tech.api.desc")} />
                <div className="space-y-3">
                  {API_ROWS.map((row) => (
                    <div key={row.path + row.method} className="flex gap-3 items-start">
                      <Badge
                        variant="outline"
                        className={`font-mono text-xs shrink-0 border-0 ${
                          row.method === "GET" ? "bg-blue-500/15 text-blue-400" :
                          row.method === "POST" ? "bg-green-500/15 text-green-400" :
                          row.method === "PATCH" ? "bg-amber-500/15 text-amber-400" :
                          "bg-red-500/15 text-red-400"
                        }`}
                        dir="ltr"
                      >
                        {row.method}
                      </Badge>
                      <div>
                        <code className="text-white text-xs font-mono" dir="ltr">{row.path}</code>
                        <p className="text-muted-foreground text-xs mt-0.5">{t(`tech.api.items.${row.key}.desc`)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </DocCard>

              {/* RBAC implementation */}
              <DocCard>
                <SectionHeading icon={Shield} title={t("tech.rbac.title")} description={t("tech.rbac.desc")} />
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p className="text-amber-400 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      <Trans i18nKey="documentation:tech.rbac.outdated" components={{ strong: <strong />, code: <code className="text-primary font-mono text-xs" dir="ltr" /> }} />
                    </span>
                  </p>
                  <p>
                    <Trans i18nKey="documentation:tech.rbac.p1" components={{ strong: <strong className="text-white" />, code: <code className="text-primary font-mono text-xs" dir="ltr" /> }} />
                  </p>
                  <p>
                    <Trans i18nKey="documentation:tech.rbac.p2" components={{ code: <code className="text-primary font-mono text-xs" dir="ltr" /> }} />
                  </p>
                  <p>
                    <Trans i18nKey="documentation:tech.rbac.p3" components={{ code: <code className="text-primary font-mono text-xs" dir="ltr" /> }} />
                  </p>
                </div>
              </DocCard>

              {/* Automation engine */}
              <DocCard>
                <SectionHeading icon={Zap} title={t("tech.automation.title")} description={t("tech.automation.desc")} />
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    <Trans i18nKey="documentation:tech.automation.p1" components={{ code: <code className="text-primary font-mono text-xs" dir="ltr" /> }} />
                  </p>
                  <p>
                    <Trans i18nKey="documentation:tech.automation.p2" components={{ code: <code className="text-primary font-mono text-xs" dir="ltr" /> }} />
                  </p>
                  <p>
                    <Trans i18nKey="documentation:tech.automation.p3" components={{ code: <code className="text-primary font-mono text-xs" dir="ltr" /> }} />
                  </p>
                </div>
              </DocCard>

              {/* Pre-launch checklist */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-white font-display flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    {t("tech.checklist.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {CHECKLIST_NUMS.map((n) => (
                    <div key={n} className="flex items-start gap-3">
                      <div className="h-4 w-4 rounded-sm border mt-0.5 shrink-0 flex items-center justify-center border-border" />
                      <p className="text-sm text-muted-foreground">{t(`tech.checklist.items.${n}`)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
