import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import {
  BarChart3,
  Users,
  Briefcase,
  CalendarCheck2,
  TrendingUp,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Clock,
  Star,
  MapPin,
  Globe2,
  UserCheck,
  UserX,
} from "lucide-react";

type DashboardStats = {
  totalCandidates: number;
  openPositions: number;
  activeEvents: number;
  scheduledInterviews: number;
};

type JobsStats = {
  total: number;
  active: number;
  draft: number;
  filled: number;
  totalOpenings: number;
};

type InterviewStats = {
  total: number;
  scheduled: number;
  completed: number;
  cancelled: number;
};

type Application = {
  id: string;
  status: string;
  candidateId: string;
};

type Candidate = {
  id: string;
  fullNameEn: string;
  region: string | null;
  nationality: string | null;
  gender: string | null;
  city: string | null;
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-primary",
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-1">{label}</p>
            <p className="text-3xl font-display font-bold text-white">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`h-10 w-10 rounded-md bg-muted/30 flex items-center justify-center ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FunnelBar({
  label,
  count,
  total,
  color,
  badgeColor,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  badgeColor: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold">{count}</span>
          <Badge className={`text-[10px] px-1.5 py-0 ${badgeColor}`}>{pct}%</Badge>
        </div>
      </div>
      <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BreakdownRow({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground capitalize">{label}</span>
      <div className="flex items-center gap-3">
        <div className="w-24 h-1.5 bg-muted/30 rounded-full overflow-hidden">
          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm text-white font-medium w-8 text-right">{count}</span>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { data: dashStats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: jobsStats } = useQuery<JobsStats>({
    queryKey: ["/api/jobs/stats"],
  });

  const { data: interviewStats } = useQuery<InterviewStats>({
    queryKey: ["/api/interviews/stats"],
  });

  const { data: applicationsRaw = [] } = useQuery<Application[]>({
    queryKey: ["/api/applications"],
  });

  const { data: candidatesRaw } = useQuery<{ data: Candidate[]; total: number }>({
    queryKey: ["/api/candidates"],
  });

  const candidates = candidatesRaw?.data ?? [];
  const apps = applicationsRaw;
  const totalApps = apps.length;

  const appsByStatus = {
    new:          apps.filter((a) => a.status === "new").length,
    shortlisted:  apps.filter((a) => a.status === "shortlisted").length,
    interviewed:  apps.filter((a) => a.status === "interviewed").length,
    hired:        apps.filter((a) => a.status === "hired").length,
    rejected:     apps.filter((a) => a.status === "rejected").length,
  };

  const byRegion = candidates.reduce<Record<string, number>>((acc, c) => {
    const key = c.region || c.city || "Unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const byGender = candidates.reduce<Record<string, number>>((acc, c) => {
    const key = c.gender ?? "Unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const byNationality = candidates.reduce<Record<string, number>>((acc, c) => {
    const key = c.nationality ?? "Unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const totalCandidates = candidates.length;

  const dateStr = new Date().toISOString().slice(0, 10);

  const exportCSV = () => {
    const rows = [
      ["Report", "Metric", "Value"],
      ["Overview", "Total Candidates", String(dashStats?.totalCandidates ?? 0)],
      ["Overview", "Open Positions", String(dashStats?.openPositions ?? 0)],
      ["Overview", "Active Events", String(dashStats?.activeEvents ?? 0)],
      ["Overview", "Scheduled Interviews", String(dashStats?.scheduledInterviews ?? 0)],
      ["Pipeline", "New Applications", String(appsByStatus.new)],
      ["Pipeline", "Shortlisted", String(appsByStatus.shortlisted)],
      ["Pipeline", "Interviewed", String(appsByStatus.interviewed)],
      ["Pipeline", "Hired", String(appsByStatus.hired)],
      ["Pipeline", "Rejected", String(appsByStatus.rejected)],
      ["Interviews", "Total", String(interviewStats?.total ?? 0)],
      ["Interviews", "Scheduled", String(interviewStats?.scheduled ?? 0)],
      ["Interviews", "Completed", String(interviewStats?.completed ?? 0)],
      ["Interviews", "Cancelled", String(interviewStats?.cancelled ?? 0)],
      ["Jobs", "Total Jobs", String(jobsStats?.total ?? 0)],
      ["Jobs", "Active", String(jobsStats?.active ?? 0)],
      ["Jobs", "Filled", String(jobsStats?.filled ?? 0)],
      ["Jobs", "Total Openings", String(jobsStats?.totalOpenings ?? 0)],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recruitment-report-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();

    const overviewData = [
      ["Metric", "Value"],
      ["Total Candidates",    dashStats?.totalCandidates   ?? 0],
      ["Open Positions",      dashStats?.openPositions     ?? 0],
      ["Active Events",      dashStats?.activeEvents     ?? 0],
      ["Scheduled Interviews",dashStats?.scheduledInterviews ?? 0],
      ["Total Jobs",          jobsStats?.total             ?? 0],
      ["Total Openings",      jobsStats?.totalOpenings     ?? 0],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overviewData), "Overview");

    const pipelineData = [
      ["Stage", "Count", "% of Total"],
      ["New",         appsByStatus.new,         totalApps > 0 ? +(appsByStatus.new / totalApps * 100).toFixed(1) : 0],
      ["Shortlisted", appsByStatus.shortlisted, totalApps > 0 ? +(appsByStatus.shortlisted / totalApps * 100).toFixed(1) : 0],
      ["Interviewed", appsByStatus.interviewed, totalApps > 0 ? +(appsByStatus.interviewed / totalApps * 100).toFixed(1) : 0],
      ["Hired",       appsByStatus.hired,       totalApps > 0 ? +(appsByStatus.hired / totalApps * 100).toFixed(1) : 0],
      ["Rejected",    appsByStatus.rejected,    totalApps > 0 ? +(appsByStatus.rejected / totalApps * 100).toFixed(1) : 0],
      ["Total",       totalApps,                100],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pipelineData), "Application Pipeline");

    const interviewData = [
      ["Metric", "Count"],
      ["Total",     interviewStats?.total     ?? 0],
      ["Scheduled", interviewStats?.scheduled ?? 0],
      ["Completed", interviewStats?.completed ?? 0],
      ["Cancelled", interviewStats?.cancelled ?? 0],
      ["Completion Rate %",
        interviewStats?.total
          ? +((interviewStats.completed / interviewStats.total) * 100).toFixed(1)
          : 0],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(interviewData), "Interviews");

    const jobsData = [
      ["Metric", "Count"],
      ["Total Jobs",    jobsStats?.total         ?? 0],
      ["Active",        jobsStats?.active        ?? 0],
      ["Draft",         jobsStats?.draft         ?? 0],
      ["Filled",        jobsStats?.filled        ?? 0],
      ["Total Openings",jobsStats?.totalOpenings ?? 0],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(jobsData), "Jobs");

    const genderRows = Object.entries(byGender).sort(([, a], [, b]) => b - a)
      .map(([k, v]) => [k, v, totalCandidates > 0 ? +(v / totalCandidates * 100).toFixed(1) : 0]);
    const nationalityRows = Object.entries(byNationality).sort(([, a], [, b]) => b - a)
      .map(([k, v]) => [k, v, totalCandidates > 0 ? +(v / totalCandidates * 100).toFixed(1) : 0]);
    const regionRows = Object.entries(byRegion).sort(([, a], [, b]) => b - a)
      .map(([k, v]) => [k, v, totalCandidates > 0 ? +(v / totalCandidates * 100).toFixed(1) : 0]);

    const candidatesSheet = XLSX.utils.aoa_to_sheet([
      ["Gender", "Count", "% of Total"],
      ...genderRows,
      [],
      ["Nationality", "Count", "% of Total"],
      ...nationalityRows,
      [],
      ["Region / City", "Count", "% of Total"],
      ...regionRows,
    ]);
    XLSX.utils.book_append_sheet(wb, candidatesSheet, "Candidates");

    XLSX.writeFile(wb, `recruitment-report-${dateStr}.xlsx`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight flex items-center gap-3">
              <BarChart3 className="h-7 w-7 text-primary" />
              Reports
            </h1>
            <p className="text-muted-foreground mt-1">
              Recruitment performance metrics across candidates, applications, interviews, and jobs.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={exportCSV}
              variant="outline"
              className="border-border font-semibold"
              data-testid="button-export-csv"
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              onClick={exportExcel}
              className="bg-primary text-primary-foreground font-bold"
              data-testid="button-export-excel"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Export Excel
            </Button>
          </div>
        </div>

        {/* ── Top KPI Cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users}          label="Total Candidates"   value={dashStats?.totalCandidates ?? 0}    sub="Registered in system"      color="text-blue-400" />
          <StatCard icon={Briefcase}      label="Open Positions"     value={dashStats?.openPositions ?? 0}      sub={`of ${jobsStats?.total ?? 0} total jobs`} color="text-primary" />
          <StatCard icon={CalendarCheck2} label="Active Events"     value={dashStats?.activeEvents ?? 0}      sub="Hiring events"            color="text-amber-400" />
          <StatCard icon={TrendingUp}     label="Total Openings"     value={jobsStats?.totalOpenings ?? 0}      sub="Across all active jobs"    color="text-emerald-400" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Application Pipeline ──────────────────────────────── */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Application Pipeline
              </CardTitle>
              <CardDescription>{totalApps} total application{totalApps !== 1 ? "s" : ""}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FunnelBar label="New"         count={appsByStatus.new}         total={totalApps} color="bg-blue-500"    badgeColor="bg-blue-500/20 text-blue-400 border-blue-500/30" />
              <FunnelBar label="Shortlisted" count={appsByStatus.shortlisted}  total={totalApps} color="bg-amber-500"   badgeColor="bg-amber-500/20 text-amber-400 border-amber-500/30" />
              <FunnelBar label="Interviewed" count={appsByStatus.interviewed}  total={totalApps} color="bg-purple-500"  badgeColor="bg-purple-500/20 text-purple-400 border-purple-500/30" />
              <FunnelBar label="Hired"       count={appsByStatus.hired}        total={totalApps} color="bg-emerald-500" badgeColor="bg-emerald-500/20 text-emerald-400 border-emerald-500/30" />
              <FunnelBar label="Rejected"    count={appsByStatus.rejected}     total={totalApps} color="bg-red-500"     badgeColor="bg-red-500/20 text-red-400 border-red-500/30" />
              {totalApps === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">No applications yet</p>
              )}
            </CardContent>
          </Card>

          {/* ── Interview Performance ─────────────────────────────── */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <CalendarCheck2 className="h-4 w-4 text-primary" />
                Interview Performance
              </CardTitle>
              <CardDescription>{interviewStats?.total ?? 0} total interview sessions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: "Scheduled",  value: interviewStats?.scheduled  ?? 0, Icon: Clock,         color: "text-blue-400",    bg: "bg-blue-500/10" },
                  { label: "Completed",  value: interviewStats?.completed  ?? 0, Icon: CheckCircle2,  color: "text-emerald-400", bg: "bg-emerald-500/10" },
                  { label: "Cancelled",  value: interviewStats?.cancelled  ?? 0, Icon: XCircle,       color: "text-red-400",     bg: "bg-red-500/10" },
                ].map(({ label, value, Icon, color, bg }) => (
                  <div key={label} className={`rounded-lg p-3 ${bg} border border-border`}>
                    <Icon className={`h-5 w-5 mx-auto mb-1.5 ${color}`} />
                    <p className="text-2xl font-display font-bold text-white">{value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3 pt-1">
                <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground/60">Completion Rate</p>
                {(() => {
                  const total = interviewStats?.total ?? 0;
                  const completed = interviewStats?.completed ?? 0;
                  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                  return (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Completed vs Total</span>
                        <span className="text-white font-semibold">{pct}%</span>
                      </div>
                      <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          {/* ── Job Openings ──────────────────────────────────────── */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                Job Openings
              </CardTitle>
              <CardDescription>{jobsStats?.total ?? 0} jobs · {jobsStats?.totalOpenings ?? 0} total seats</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Active",   value: jobsStats?.active ?? 0,  color: "text-emerald-400", bg: "bg-emerald-500/10", Icon: Star },
                  { label: "Draft",    value: jobsStats?.draft ?? 0,   color: "text-amber-400",   bg: "bg-amber-500/10",   Icon: Clock },
                  { label: "Filled",   value: jobsStats?.filled ?? 0,  color: "text-blue-400",    bg: "bg-blue-500/10",    Icon: CheckCircle2 },
                  { label: "Openings", value: jobsStats?.totalOpenings ?? 0, color: "text-primary", bg: "bg-primary/10", Icon: UserCheck },
                ].map(({ label, value, color, bg, Icon }) => (
                  <div key={label} className={`rounded-lg p-3 ${bg} border border-border flex items-center gap-3`}>
                    <Icon className={`h-5 w-5 shrink-0 ${color}`} />
                    <div>
                      <p className="text-xl font-display font-bold text-white">{value}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ── Candidate Breakdown ───────────────────────────────── */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Candidate Breakdown
              </CardTitle>
              <CardDescription>{totalCandidates} registered candidates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Gender */}
              <div>
                <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground/60 mb-2">By Gender</p>
                <div className="space-y-1">
                  {Object.entries(byGender).sort(([, a], [, b]) => b - a).map(([key, count]) => (
                    <BreakdownRow key={key} label={key} count={count} total={totalCandidates} />
                  ))}
                  {Object.keys(byGender).length === 0 && <p className="text-xs text-muted-foreground">No data</p>}
                </div>
              </div>

              {/* Nationality */}
              <div>
                <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground/60 mb-2 flex items-center gap-1.5">
                  <Globe2 className="h-3 w-3" /> By Nationality
                </p>
                <div className="space-y-1">
                  {Object.entries(byNationality).sort(([, a], [, b]) => b - a).slice(0, 5).map(([key, count]) => (
                    <BreakdownRow key={key} label={key} count={count} total={totalCandidates} />
                  ))}
                  {Object.keys(byNationality).length === 0 && <p className="text-xs text-muted-foreground">No data</p>}
                </div>
              </div>

              {/* Region */}
              <div>
                <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground/60 mb-2 flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> By Region
                </p>
                <div className="space-y-1">
                  {Object.entries(byRegion).sort(([, a], [, b]) => b - a).slice(0, 5).map(([key, count]) => (
                    <BreakdownRow key={key} label={key} count={count} total={totalCandidates} />
                  ))}
                  {Object.keys(byRegion).length === 0 && <p className="text-xs text-muted-foreground">No data</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Hiring Conversion Summary ─────────────────────────────── */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              Hiring Conversion Summary
            </CardTitle>
            <CardDescription>End-to-end funnel conversion from application to hire</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { label: "Applied",    count: totalApps,                 Icon: Users,        color: "text-blue-400",    border: "border-blue-500/30" },
                { label: "Shortlisted",count: appsByStatus.shortlisted,  Icon: Star,         color: "text-amber-400",   border: "border-amber-500/30" },
                { label: "Interviewed",count: appsByStatus.interviewed,  Icon: CalendarCheck2, color: "text-purple-400", border: "border-purple-500/30" },
                { label: "Hired",      count: appsByStatus.hired,        Icon: UserCheck,    color: "text-emerald-400", border: "border-emerald-500/30" },
                { label: "Rejected",   count: appsByStatus.rejected,     Icon: UserX,        color: "text-red-400",     border: "border-red-500/30" },
              ].map(({ label, count, Icon, color, border }) => (
                <div key={label} className={`text-center rounded-lg border ${border} bg-muted/10 p-4`}>
                  <Icon className={`h-6 w-6 mx-auto mb-2 ${color}`} />
                  <p className="text-2xl font-display font-bold text-white">{count}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                  {totalApps > 0 && count > 0 && (
                    <p className={`text-xs font-semibold mt-0.5 ${color}`}>
                      {Math.round((count / totalApps) * 100)}%
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
