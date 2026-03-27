import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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

function Step({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="h-7 w-7 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 text-xs font-bold font-display mt-0.5">
        {number}
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
    <pre className="bg-muted/40 border border-border rounded-sm p-4 text-xs font-mono text-green-400 overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}

export default function DocumentationPage() {
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
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Documentation</h1>
            <p className="text-muted-foreground mt-1">
              Guides, references, and system architecture for Workforce.
            </p>
          </div>
          <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 font-mono text-xs">
            {currentUser?.role ?? "loading"}
          </Badge>
        </div>

        <Tabs defaultValue="user" className="space-y-6">
          <TabsList className={`grid w-full max-w-sm bg-muted/20 ${isTechnicalUser ? "grid-cols-2" : "grid-cols-1"}`}>
            <TabsTrigger value="user" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              User Guide
            </TabsTrigger>
            {isTechnicalUser && (
              <TabsTrigger value="technical" className="flex items-center gap-2">
                <Code2 className="h-4 w-4" />
                Technical Docs
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
                  <h2 className="text-white font-display font-bold text-xl">Welcome to Workforce</h2>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    Workforce is a seasonal hiring management system built for large-scale operations in Saudi Arabia.
                    It covers the entire hiring lifecycle — from posting jobs and screening candidates to scheduling interviews,
                    managing workforce placements, and tracking seasonal campaign progress.
                  </p>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Badge className="bg-primary/10 text-primary border-0">Saudi Arabia Ready</Badge>
                    <Badge className="bg-blue-500/10 text-blue-400 border-0">CITC Compliant SMS</Badge>
                    <Badge className="bg-green-500/10 text-green-400 border-0">70,000+ Candidates</Badge>
                  </div>
                </div>
              </div>
            </DocCard>

            {/* Navigation Guide */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-white font-display flex items-center gap-2">
                  <LayoutDashboard className="h-5 w-5 text-primary" />
                  Navigation Guide
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { icon: LayoutDashboard, label: "Dashboard", desc: "Overview of active events, open positions, scheduled interviews, and recent applications. Quick-action buttons for common tasks." },
                  { icon: CalendarRange, label: "Events & SMP", desc: "Create and manage hiring events (e.g. Hajj 2026, Ramadan). Each event tracks its own timeline, headcount, and status." },
                  { icon: Briefcase, label: "Job Applications", desc: "Post jobs linked to events or standalone. Filter by status (Active, Draft, Ended) and manage postings." },
                  { icon: PhoneCall, label: "Interview Calls", desc: "Track scheduled interviews, their type (Video, Phone, In-Person), interviewer assignments, and current status." },
                  { icon: Users, label: "Workforce", desc: "View active workforce placements. See who is hired, their event assignment, and shift coverage." },
                  { icon: Search, label: "Talent", desc: "Full candidate database with search, filters, and pagination. Supports 70,000+ candidates with fast server-side queries." },
                  { icon: Workflow, label: "Rules & Automation", desc: "Configure automated triggers — e.g. send SMS when a candidate applies, or flag incomplete profiles." },
                  { icon: Bell, label: "Notification Center", desc: "Manage SMS integrations (GoInfinito). Configure credentials and test connections." },
                  { icon: Settings, label: "System & Settings", desc: "System-level configuration, user management, and platform preferences." },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex gap-3 p-3 rounded-sm bg-muted/20 border border-border/50">
                    <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-white text-sm font-medium">{label}</p>
                      <p className="text-muted-foreground text-xs mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* How to post a job */}
            <DocCard>
              <SectionHeading icon={Briefcase} title="How to Post a Job" description="Create a job application — standalone or linked to a hiring event." />
              <div className="space-y-4">
                <Step number={1} title="Go to Job Applications" description="Click 'Job Applications' in the left sidebar." />
                <Step number={2} title="Fill in job details" description="Click 'Post Job' to create a new position — standalone or linked to a hiring event." />
                <Step number={3} title="Fill in the form" description="Enter the job title, type (Full Time / Part Time), location, region, salary range, deadline, description, and requirements." />
                <Step number={4} title="Set status" description="Choose 'Draft' to save without publishing, or 'Active' to publish immediately and accept applications." />
                <Step number={5} title="Submit" description="Click 'Save Draft' or 'Publish Now'. The posting appears in the table immediately." />
              </div>
            </DocCard>

            {/* How to create an event */}
            <DocCard>
              <SectionHeading icon={CalendarRange} title="How to Create an Event" description="Events group related job postings under one campaign." />
              <div className="space-y-4">
                <Step number={1} title="Go to Events & SMP" description="Click 'Events & SMP' in the sidebar." />
                <Step number={2} title="Click 'Create Event'" description="Press the green 'Create Event' button in the top right." />
                <Step number={3} title="Name and describe the event" description="Enter a clear name (e.g. 'Hajj 1446') and a short description of scope." />
                <Step number={4} title="Set the timeline" description="Choose start and end dates. These define the active window for this event's hiring." />
                <Step number={5} title="Submit" description="Click 'Create Event'. It will appear as 'Upcoming' and can be activated when ready." />
              </div>
            </DocCard>

            {/* Candidate search tips */}
            <DocCard>
              <SectionHeading icon={Search} title="Finding Candidates in Talent" description="Tips for efficient candidate search." />
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>• Use the <span className="text-white">search bar</span> to find by name, national ID, phone number, or city.</p>
                <p>• Use the <span className="text-white">Status filter</span> to narrow by: New, Shortlisted, Interviewed, Hired, Not Shortlisted.</p>
                <p>• Use the <span className="text-white">Nationality filter</span> to separate Saudi and Non-Saudi candidates.</p>
                <p>• Click <span className="text-white">column headers</span> to sort by name, rating, or date added.</p>
                <p>• Pagination shows 50 candidates per page for performance. Use filters to narrow large result sets.</p>
              </div>
            </DocCard>

            {/* Role permissions summary */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-white font-display flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Role Permissions Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-muted-foreground font-medium pb-3 pr-4">Role</th>
                        <th className="text-left text-muted-foreground font-medium pb-3 pr-4">Jobs</th>
                        <th className="text-left text-muted-foreground font-medium pb-3 pr-4">Events</th>
                        <th className="text-left text-muted-foreground font-medium pb-3 pr-4">Candidates</th>
                        <th className="text-left text-muted-foreground font-medium pb-3">Settings</th>
                      </tr>
                    </thead>
                    <tbody className="space-y-2">
                      {[
                        { role: "super_admin", jobs: "Full", events: "Full", candidates: "Full", settings: "Full" },
                        { role: "admin", jobs: "Full", events: "Full", candidates: "Full", settings: "Full" },
                        { role: "hr_manager", jobs: "Create/Edit", events: "Create/Edit", candidates: "View/Edit", settings: "View" },
                        { role: "recruiter", jobs: "Create", events: "View", candidates: "View/Edit", settings: "None" },
                        { role: "interviewer", jobs: "View", events: "View", candidates: "View", settings: "None" },
                        { role: "viewer", jobs: "View", events: "View", candidates: "View", settings: "None" },
                      ].map((r) => (
                        <tr key={r.role} className="border-b border-border/30">
                          <td className="py-2.5 pr-4">
                            <Badge variant="outline" className="font-mono text-xs border-border">{r.role}</Badge>
                          </td>
                          <td className="py-2.5 pr-4 text-muted-foreground">{r.jobs}</td>
                          <td className="py-2.5 pr-4 text-muted-foreground">{r.events}</td>
                          <td className="py-2.5 pr-4 text-muted-foreground">{r.candidates}</td>
                          <td className="py-2.5 text-muted-foreground">{r.settings}</td>
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
                  This section is restricted to <strong>super_admin</strong> and <strong>admin</strong> roles only. Do not share access credentials or architecture details externally.
                </p>
              </div>

              {/* Stack */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-white font-display flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    Technology Stack
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { layer: "Frontend", tech: "React 19 + Vite + TypeScript", detail: "Tailwind CSS v4, Shadcn/UI, TanStack Query v5, wouter routing" },
                    { layer: "Backend", tech: "Express.js + Node.js + TypeScript", detail: "REST API, bcryptjs auth, Zod validation" },
                    { layer: "Database", tech: "PostgreSQL + Drizzle ORM", detail: "drizzle-zod for schema validation, drizzle-kit for migrations" },
                    { layer: "SMS", tech: "GoInfinito", detail: "Saudi CITC-compliant SMS gateway" },
                    { layer: "PDF / Signature", tech: "jsPDF + react-signature-canvas", detail: "E-signature on candidate portal" },
                  ].map(({ layer, tech, detail }) => (
                    <div key={layer} className="flex gap-4 p-3 bg-muted/20 rounded-sm border border-border/50">
                      <div className="w-24 shrink-0">
                        <Badge variant="outline" className="font-mono text-xs border-border">{layer}</Badge>
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{tech}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{detail}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Project structure */}
              <DocCard>
                <SectionHeading icon={GitBranch} title="Project Structure" />
                <CodeBlock>{`/
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
└── drizzle.config.ts    # Drizzle Kit config`}</CodeBlock>
              </DocCard>

              {/* Database schema */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-white font-display flex items-center gap-2">
                    <Database className="h-5 w-5 text-primary" />
                    Database Schema
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { table: "users", purpose: "Admin staff accounts + auth", notes: "Roles: super_admin, admin, hr_manager, recruiter, interviewer, viewer, candidate" },
                    { table: "candidates", purpose: "70k+ candidate profiles", notes: "Indexes on status+city, phone, national_id, name, rating. Bulk insert via 1000-row batches." },
                    { table: "events", purpose: "Event campaigns (Hajj, Ramadan…)", notes: "Status enum: upcoming → active → closed → archived" },
                    { table: "job_postings", purpose: "Job openings", notes: "Linked to events via event_id FK. Status: draft → active → filled → closed" },
                    { table: "applications", purpose: "Candidate ↔ Job links", notes: "Unique constraint on (candidate_id, job_id). Status pipeline." },
                    { table: "interviews", purpose: "Scheduled interview calls", notes: "Linked to candidate + job_posting. Type: video, phone, in_person" },
                    { table: "workforce", purpose: "Active placements", notes: "Linked to candidate + event. Tracks check-in/check-out." },
                    { table: "automation_rules", purpose: "Trigger-action rules", notes: "Stored in DB, toggled on/off. Executed server-side." },
                    { table: "notifications", purpose: "SMS/email/in-app log", notes: "Status: pending → sent → failed → read" },
                  ].map(({ table, purpose, notes }) => (
                    <div key={table} className="p-3 bg-muted/20 rounded-sm border border-border/50">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-primary text-xs font-mono bg-primary/10 px-1.5 py-0.5 rounded">{table}</code>
                        <span className="text-white text-sm">{purpose}</span>
                      </div>
                      <p className="text-muted-foreground text-xs">{notes}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* API reference */}
              <DocCard>
                <SectionHeading icon={Server} title="API Reference" description="All endpoints are prefixed with /api" />
                <div className="space-y-3">
                  {[
                    { method: "GET", path: "/api/me", desc: "Returns current user (dev bypass: always admin)" },
                    { method: "POST", path: "/api/auth/login", desc: "Authenticate by nationalId, phone, email, or username + password" },
                    { method: "GET", path: "/api/dashboard/stats", desc: "Aggregate counts for dashboard metrics" },
                    { method: "GET", path: "/api/candidates", desc: "Paginated candidate list. Query: page, limit, search, status, city, nationality, sortBy, sortOrder" },
                    { method: "POST", path: "/api/candidates/bulk", desc: "Bulk insert up to 1,000 candidates per upload" },
                    { method: "GET", path: "/api/events", desc: "All events" },
                    { method: "POST", path: "/api/events", desc: "Create event" },
                    { method: "PATCH", path: "/api/events/:id", desc: "Update event fields (partial)" },
                    { method: "GET", path: "/api/jobs", desc: "Job postings. Query: status, eventId" },
                    { method: "POST", path: "/api/jobs", desc: "Create job posting" },
                    { method: "GET", path: "/api/applications/stats", desc: "Application pipeline counts" },
                    { method: "GET", path: "/api/automation", desc: "All automation rules" },
                    { method: "PATCH", path: "/api/automation/:id", desc: "Toggle or update an automation rule" },
                  ].map(({ method, path, desc }) => (
                    <div key={path} className="flex gap-3 items-start">
                      <Badge
                        variant="outline"
                        className={`font-mono text-xs shrink-0 border-0 ${
                          method === "GET" ? "bg-blue-500/15 text-blue-400" :
                          method === "POST" ? "bg-green-500/15 text-green-400" :
                          method === "PATCH" ? "bg-amber-500/15 text-amber-400" :
                          "bg-red-500/15 text-red-400"
                        }`}
                      >
                        {method}
                      </Badge>
                      <div>
                        <code className="text-white text-xs font-mono">{path}</code>
                        <p className="text-muted-foreground text-xs mt-0.5">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </DocCard>

              {/* RBAC implementation */}
              <DocCard>
                <SectionHeading icon={Shield} title="RBAC Implementation" description="How role-based access is enforced." />
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Roles are stored in the <code className="text-primary font-mono text-xs">users.role</code> column as a PostgreSQL enum: <code className="text-primary font-mono text-xs">user_role</code>.</p>
                  <p>The <code className="text-primary font-mono text-xs">/api/me</code> endpoint returns the current user including their role. The frontend reads this via TanStack Query and gates UI elements accordingly.</p>
                  <p>The <strong className="text-white">Technical Documentation</strong> tab on this page is only rendered when the role is <code className="text-primary font-mono text-xs">super_admin</code> or <code className="text-primary font-mono text-xs">admin</code>.</p>
                  <p className="mt-2 text-amber-400 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Server-side RBAC middleware should be added to all mutating endpoints before production deployment.
                  </p>
                </div>
              </DocCard>

              {/* Automation engine */}
              <DocCard>
                <SectionHeading icon={Zap} title="Automation Engine" description="How rules are stored and triggered." />
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Rules are stored in the <code className="text-primary font-mono text-xs">automation_rules</code> table with a <code className="text-primary font-mono text-xs">trigger</code> and <code className="text-primary font-mono text-xs">action</code> column (text/JSONB).</p>
                  <p>Each rule has an <code className="text-primary font-mono text-xs">isActive</code> boolean. Toggling from the UI sends a <code className="text-primary font-mono text-xs">PATCH /api/automation/:id</code>.</p>
                  <p>Rule execution is currently client-triggered (demo). Production implementation should add a server-side event bus or job queue (e.g. BullMQ) that listens to application lifecycle events and fires matching rules.</p>
                </div>
              </DocCard>

              {/* Pre-launch checklist */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-white font-display flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    Pre-Launch Checklist
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[
                    { done: false, item: "Re-enable authentication routes in App.tsx (currently bypassed for development)" },
                    { done: false, item: "Add server-side RBAC middleware to all mutating API endpoints" },
                    { done: false, item: "Set SESSION_SECRET, DATABASE_URL as environment secrets" },
                    { done: false, item: "Configure GoInfinito credentials in Notification Center" },
                    { done: false, item: "Run full unit, system, regression, UAT, and security tests" },
                    { done: false, item: "Implement bilingual (EN/AR) toggle input across job posting forms" },
                    { done: false, item: "Set up BullMQ or equivalent for production automation rule execution" },
                    { done: false, item: "Enable rate limiting on auth and bulk-upload endpoints" },
                    { done: false, item: "Configure HTTPS / TLS termination in production" },
                  ].map(({ done, item }) => (
                    <div key={item} className="flex items-start gap-3">
                      <div className={`h-4 w-4 rounded-sm border mt-0.5 shrink-0 flex items-center justify-center ${done ? "bg-primary border-primary" : "border-border"}`}>
                        {done && <CheckCircle2 className="h-3 w-3 text-white" />}
                      </div>
                      <p className="text-sm text-muted-foreground">{item}</p>
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
