import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/lib/format";
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
  FileText,
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
            <p className="text-3xl font-display font-bold text-white"><bdi>{value}</bdi></p>
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
  locale,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  badgeColor: string;
  locale: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold"><bdi>{formatNumber(count, locale)}</bdi></span>
          <Badge className={`text-[10px] px-1.5 py-0 ${badgeColor}`}><bdi>{formatNumber(pct, locale)}%</bdi></Badge>
        </div>
      </div>
      <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BreakdownRow({ label, count, total, locale }: { label: string; count: number; total: number; locale: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground capitalize"><bdi>{label}</bdi></span>
      <div className="flex items-center gap-3">
        <div className="w-24 h-1.5 bg-muted/30 rounded-full overflow-hidden">
          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm text-white font-medium w-8 text-end"><bdi>{formatNumber(count, locale)}</bdi></span>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { t, i18n } = useTranslation(["reports", "common"]);
  const locale = i18n.language;

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
    offered:      apps.filter((a) => a.status === "offered").length,
    hired:        apps.filter((a) => a.status === "hired").length,
    rejected:     apps.filter((a) => a.status === "rejected").length,
  };

  const unknownLabel = t("reports:candidates.unknown");

  const byRegion = candidates.reduce<Record<string, number>>((acc, c) => {
    const key = c.region || c.city || unknownLabel;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const byGender = candidates.reduce<Record<string, number>>((acc, c) => {
    const key = c.gender ?? unknownLabel;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const byNationality = candidates.reduce<Record<string, number>>((acc, c) => {
    const key = c.nationality ?? unknownLabel;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const totalCandidates = candidates.length;

  const dateStr = new Date().toISOString().slice(0, 10);

  const exportCSV = () => {
    const rows = [
      [t("reports:csv.headerReport"), t("reports:csv.headerMetric"), t("reports:csv.headerValue")],
      [t("reports:csv.sectionOverview"), t("reports:csv.metricCandidates"), String(dashStats?.totalCandidates ?? 0)],
      [t("reports:csv.sectionOverview"), t("reports:csv.metricOpen"), String(dashStats?.openPositions ?? 0)],
      [t("reports:csv.sectionOverview"), t("reports:csv.metricEvents"), String(dashStats?.activeEvents ?? 0)],
      [t("reports:csv.sectionOverview"), t("reports:csv.metricInterviews"), String(dashStats?.scheduledInterviews ?? 0)],
      [t("reports:csv.sectionPipeline"), t("reports:csv.metricNew"), String(appsByStatus.new)],
      [t("reports:csv.sectionPipeline"), t("reports:stages.shortlisted"), String(appsByStatus.shortlisted)],
      [t("reports:csv.sectionPipeline"), t("reports:stages.interviewed"), String(appsByStatus.interviewed)],
      [t("reports:csv.sectionPipeline"), t("reports:stages.offered"), String(appsByStatus.offered)],
      [t("reports:csv.sectionPipeline"), t("reports:stages.hired"), String(appsByStatus.hired)],
      [t("reports:csv.sectionPipeline"), t("reports:stages.rejected"), String(appsByStatus.rejected)],
      [t("reports:csv.sectionInterviews"), t("reports:csv.metricTotal"), String(interviewStats?.total ?? 0)],
      [t("reports:csv.sectionInterviews"), t("reports:interviews.scheduled"), String(interviewStats?.scheduled ?? 0)],
      [t("reports:csv.sectionInterviews"), t("reports:interviews.completed"), String(interviewStats?.completed ?? 0)],
      [t("reports:csv.sectionInterviews"), t("reports:interviews.cancelled"), String(interviewStats?.cancelled ?? 0)],
      [t("reports:csv.sectionJobs"), t("reports:csv.metricTotalJobs"), String(jobsStats?.total ?? 0)],
      [t("reports:csv.sectionJobs"), t("reports:jobs.active"), String(jobsStats?.active ?? 0)],
      [t("reports:csv.sectionJobs"), t("reports:jobs.filled"), String(jobsStats?.filled ?? 0)],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t("reports:csv.fileName", { date: dateStr })}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();

    const overviewData = [
      [t("reports:csv.headerMetric"), t("reports:csv.headerValue")],
      [t("reports:csv.metricCandidates"),  dashStats?.totalCandidates   ?? 0],
      [t("reports:csv.metricOpen"),        dashStats?.openPositions     ?? 0],
      [t("reports:csv.metricEvents"),      dashStats?.activeEvents      ?? 0],
      [t("reports:csv.metricInterviews"),  dashStats?.scheduledInterviews ?? 0],
      [t("reports:csv.metricTotalJobs"),   jobsStats?.total             ?? 0],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overviewData), t("reports:csv.sheetOverview"));

    const pipelineData = [
      [t("reports:csv.headerStage"), t("reports:csv.headerCount"), t("reports:csv.headerPercent")],
      [t("reports:stages.new"),         appsByStatus.new,         totalApps > 0 ? +(appsByStatus.new / totalApps * 100).toFixed(1) : 0],
      [t("reports:stages.shortlisted"), appsByStatus.shortlisted, totalApps > 0 ? +(appsByStatus.shortlisted / totalApps * 100).toFixed(1) : 0],
      [t("reports:stages.interviewed"), appsByStatus.interviewed, totalApps > 0 ? +(appsByStatus.interviewed / totalApps * 100).toFixed(1) : 0],
      [t("reports:stages.offered"),     appsByStatus.offered,     totalApps > 0 ? +(appsByStatus.offered / totalApps * 100).toFixed(1) : 0],
      [t("reports:stages.hired"),       appsByStatus.hired,       totalApps > 0 ? +(appsByStatus.hired / totalApps * 100).toFixed(1) : 0],
      [t("reports:stages.rejected"),    appsByStatus.rejected,    totalApps > 0 ? +(appsByStatus.rejected / totalApps * 100).toFixed(1) : 0],
      [t("reports:csv.metricTotal"),    totalApps,                100],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pipelineData), t("reports:csv.sheetPipeline"));

    const interviewData = [
      [t("reports:csv.headerMetric"), t("reports:csv.headerCount")],
      [t("reports:csv.metricTotal"),         interviewStats?.total     ?? 0],
      [t("reports:interviews.scheduled"),    interviewStats?.scheduled ?? 0],
      [t("reports:interviews.completed"),    interviewStats?.completed ?? 0],
      [t("reports:interviews.cancelled"),    interviewStats?.cancelled ?? 0],
      [t("reports:csv.metricCompletionRate"),
        interviewStats?.total
          ? +((interviewStats.completed / interviewStats.total) * 100).toFixed(1)
          : 0],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(interviewData), t("reports:csv.sheetInterviews"));

    const jobsData = [
      [t("reports:csv.headerMetric"), t("reports:csv.headerCount")],
      [t("reports:csv.metricTotalJobs"), jobsStats?.total  ?? 0],
      [t("reports:jobs.active"),         jobsStats?.active ?? 0],
      [t("reports:jobs.draft"),          jobsStats?.draft  ?? 0],
      [t("reports:jobs.filled"),         jobsStats?.filled ?? 0],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(jobsData), t("reports:csv.sheetJobs"));

    const genderRows = Object.entries(byGender).sort(([, a], [, b]) => b - a)
      .map(([k, v]) => [k, v, totalCandidates > 0 ? +(v / totalCandidates * 100).toFixed(1) : 0]);
    const nationalityRows = Object.entries(byNationality).sort(([, a], [, b]) => b - a)
      .map(([k, v]) => [k, v, totalCandidates > 0 ? +(v / totalCandidates * 100).toFixed(1) : 0]);
    const regionRows = Object.entries(byRegion).sort(([, a], [, b]) => b - a)
      .map(([k, v]) => [k, v, totalCandidates > 0 ? +(v / totalCandidates * 100).toFixed(1) : 0]);

    const candidatesSheet = XLSX.utils.aoa_to_sheet([
      [t("reports:csv.rowGender"),      t("reports:csv.headerCount"), t("reports:csv.headerPercent")],
      ...genderRows,
      [],
      [t("reports:csv.rowNationality"), t("reports:csv.headerCount"), t("reports:csv.headerPercent")],
      ...nationalityRows,
      [],
      [t("reports:csv.rowRegion"),      t("reports:csv.headerCount"), t("reports:csv.headerPercent")],
      ...regionRows,
    ]);
    XLSX.utils.book_append_sheet(wb, candidatesSheet, t("reports:csv.sheetCandidates"));

    XLSX.writeFile(wb, `${t("reports:csv.fileName", { date: dateStr })}.xlsx`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight flex items-center gap-3">
              <BarChart3 className="h-7 w-7 text-primary" />
              {t("reports:title")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("reports:subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={exportCSV}
              variant="outline"
              className="border-border font-semibold"
              data-testid="button-export-csv"
            >
              <Download className="me-2 h-4 w-4" />
              {t("reports:exportCsv")}
            </Button>
            <Button
              onClick={exportExcel}
              className="bg-primary text-primary-foreground font-bold"
              data-testid="button-export-excel"
            >
              <FileSpreadsheet className="me-2 h-4 w-4" />
              {t("reports:exportExcel")}
            </Button>
          </div>
        </div>

        {/* ── Top KPI Cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users}          label={t("reports:kpi.totalCandidates")} value={formatNumber(dashStats?.totalCandidates ?? 0, locale)} sub={t("reports:kpi.totalCandidatesSub")} color="text-blue-400" />
          <StatCard icon={Briefcase}      label={t("reports:kpi.openPositions")}   value={formatNumber(dashStats?.openPositions ?? 0, locale)}   sub={t("reports:kpi.openPositionsSub", { count: jobsStats?.total ?? 0 })} color="text-primary" />
          <StatCard icon={CalendarCheck2} label={t("reports:kpi.activeEvents")}    value={formatNumber(dashStats?.activeEvents ?? 0, locale)}    sub={t("reports:kpi.activeEventsSub")} color="text-amber-400" />
          <StatCard icon={TrendingUp}     label={t("reports:kpi.filledJobs")}      value={formatNumber(jobsStats?.filled ?? 0, locale)}          sub={t("reports:kpi.filledJobsSub")} color="text-emerald-400" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Application Pipeline ──────────────────────────────── */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                {t("reports:pipeline.title")}
              </CardTitle>
              <CardDescription><bdi>{t("reports:pipeline.totalApps", { count: totalApps })}</bdi></CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FunnelBar locale={locale} label={t("reports:stages.new")}         count={appsByStatus.new}         total={totalApps} color="bg-blue-500"    badgeColor="bg-blue-500/20 text-blue-400 border-blue-500/30" />
              <FunnelBar locale={locale} label={t("reports:stages.shortlisted")} count={appsByStatus.shortlisted} total={totalApps} color="bg-amber-500"   badgeColor="bg-amber-500/20 text-amber-400 border-amber-500/30" />
              <FunnelBar locale={locale} label={t("reports:stages.interviewed")} count={appsByStatus.interviewed} total={totalApps} color="bg-purple-500"  badgeColor="bg-purple-500/20 text-purple-400 border-purple-500/30" />
              <FunnelBar locale={locale} label={t("reports:stages.offered")}     count={appsByStatus.offered}     total={totalApps} color="bg-cyan-500"    badgeColor="bg-cyan-500/20 text-cyan-400 border-cyan-500/30" />
              <FunnelBar locale={locale} label={t("reports:stages.hired")}       count={appsByStatus.hired}       total={totalApps} color="bg-emerald-500" badgeColor="bg-emerald-500/20 text-emerald-400 border-emerald-500/30" />
              <FunnelBar locale={locale} label={t("reports:stages.rejected")}    count={appsByStatus.rejected}    total={totalApps} color="bg-red-500"     badgeColor="bg-red-500/20 text-red-400 border-red-500/30" />
              {totalApps === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">{t("reports:pipeline.noApps")}</p>
              )}
            </CardContent>
          </Card>

          {/* ── Interview Performance ─────────────────────────────── */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <CalendarCheck2 className="h-4 w-4 text-primary" />
                {t("reports:interviews.title")}
              </CardTitle>
              <CardDescription><bdi>{t("reports:interviews.subtitle", { count: interviewStats?.total ?? 0 })}</bdi></CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: t("reports:interviews.scheduled"), value: interviewStats?.scheduled ?? 0, Icon: Clock,        color: "text-blue-400",    bg: "bg-blue-500/10" },
                  { label: t("reports:interviews.completed"), value: interviewStats?.completed ?? 0, Icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
                  { label: t("reports:interviews.cancelled"), value: interviewStats?.cancelled ?? 0, Icon: XCircle,      color: "text-red-400",     bg: "bg-red-500/10" },
                ].map(({ label, value, Icon, color, bg }) => (
                  <div key={label} className={`rounded-lg p-3 ${bg} border border-border`}>
                    <Icon className={`h-5 w-5 mx-auto mb-1.5 ${color}`} />
                    <p className="text-2xl font-display font-bold text-white"><bdi>{formatNumber(value, locale)}</bdi></p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3 pt-1">
                <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground/60">{t("reports:interviews.completionRate")}</p>
                {(() => {
                  const total = interviewStats?.total ?? 0;
                  const completed = interviewStats?.completed ?? 0;
                  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                  return (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t("reports:interviews.completedVsTotal")}</span>
                        <span className="text-white font-semibold"><bdi>{formatNumber(pct, locale)}%</bdi></span>
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
                {t("reports:jobs.title")}
              </CardTitle>
              <CardDescription><bdi>{t("reports:jobs.count", { count: jobsStats?.total ?? 0 })}</bdi></CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: t("reports:jobs.active"), value: jobsStats?.active ?? 0, color: "text-emerald-400", bg: "bg-emerald-500/10", Icon: Star },
                  { label: t("reports:jobs.draft"),  value: jobsStats?.draft  ?? 0, color: "text-amber-400",   bg: "bg-amber-500/10",   Icon: Clock },
                  { label: t("reports:jobs.filled"), value: jobsStats?.filled ?? 0, color: "text-blue-400",    bg: "bg-blue-500/10",    Icon: CheckCircle2 },
                ].map(({ label, value, color, bg, Icon }) => (
                  <div key={label} className={`rounded-lg p-3 ${bg} border border-border flex items-center gap-3`}>
                    <Icon className={`h-5 w-5 shrink-0 ${color}`} />
                    <div>
                      <p className="text-xl font-display font-bold text-white"><bdi>{formatNumber(value, locale)}</bdi></p>
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
                {t("reports:candidates.title")}
              </CardTitle>
              <CardDescription><bdi>{t("reports:candidates.subtitle", { count: totalCandidates })}</bdi></CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Gender */}
              <div>
                <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground/60 mb-2">{t("reports:candidates.byGender")}</p>
                <div className="space-y-1">
                  {Object.entries(byGender).sort(([, a], [, b]) => b - a).map(([key, count]) => (
                    <BreakdownRow key={key} label={key} count={count} total={totalCandidates} locale={locale} />
                  ))}
                  {Object.keys(byGender).length === 0 && <p className="text-xs text-muted-foreground">{t("reports:candidates.noData")}</p>}
                </div>
              </div>

              {/* Nationality */}
              <div>
                <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground/60 mb-2 flex items-center gap-1.5">
                  <Globe2 className="h-3 w-3" /> {t("reports:candidates.byNationality")}
                </p>
                <div className="space-y-1">
                  {Object.entries(byNationality).sort(([, a], [, b]) => b - a).slice(0, 5).map(([key, count]) => (
                    <BreakdownRow key={key} label={key} count={count} total={totalCandidates} locale={locale} />
                  ))}
                  {Object.keys(byNationality).length === 0 && <p className="text-xs text-muted-foreground">{t("reports:candidates.noData")}</p>}
                </div>
              </div>

              {/* Region */}
              <div>
                <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground/60 mb-2 flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> {t("reports:candidates.byRegion")}
                </p>
                <div className="space-y-1">
                  {Object.entries(byRegion).sort(([, a], [, b]) => b - a).slice(0, 5).map(([key, count]) => (
                    <BreakdownRow key={key} label={key} count={count} total={totalCandidates} locale={locale} />
                  ))}
                  {Object.keys(byRegion).length === 0 && <p className="text-xs text-muted-foreground">{t("reports:candidates.noData")}</p>}
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
              {t("reports:conversion.title")}
            </CardTitle>
            <CardDescription>{t("reports:conversion.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: t("reports:stages.applied"),     count: totalApps,                 Icon: Users,        color: "text-blue-400",    border: "border-blue-500/30" },
                { label: t("reports:stages.shortlisted"), count: appsByStatus.shortlisted,  Icon: Star,         color: "text-amber-400",   border: "border-amber-500/30" },
                { label: t("reports:stages.interviewed"), count: appsByStatus.interviewed,  Icon: CalendarCheck2, color: "text-purple-400", border: "border-purple-500/30" },
                { label: t("reports:stages.offered"),     count: appsByStatus.offered,      Icon: FileText,     color: "text-cyan-400",    border: "border-cyan-500/30" },
                { label: t("reports:stages.hired"),       count: appsByStatus.hired,        Icon: UserCheck,    color: "text-emerald-400", border: "border-emerald-500/30" },
                { label: t("reports:stages.rejected"),    count: appsByStatus.rejected,     Icon: UserX,        color: "text-red-400",     border: "border-red-500/30" },
              ].map(({ label, count, Icon, color, border }) => (
                <div key={label} className={`text-center rounded-lg border ${border} bg-muted/10 p-4`}>
                  <Icon className={`h-6 w-6 mx-auto mb-2 ${color}`} />
                  <p className="text-2xl font-display font-bold text-white"><bdi>{formatNumber(count, locale)}</bdi></p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                  {totalApps > 0 && count > 0 && (
                    <p className={`text-xs font-semibold mt-0.5 ${color}`}>
                      <bdi>{formatNumber(Math.round((count / totalApps) * 100), locale)}%</bdi>
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
