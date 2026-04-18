import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Users,
  Briefcase,
  Calendar,
  Clock,
  TrendingUp,
  MoreHorizontal,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ar as dfArLocale } from "date-fns/locale";
import { formatNumber, formatDate } from "@/lib/format";

const statusColor: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400",
  reviewing: "bg-amber-500/10 text-amber-400",
  shortlisted: "bg-purple-500/10 text-purple-400",
  interviewed: "bg-orange-500/10 text-orange-400",
  offered: "bg-cyan-500/10 text-cyan-400",
  hired: "bg-green-500/10 text-green-400",
  rejected: "bg-red-500/10 text-red-400",
  withdrawn: "bg-gray-500/10 text-gray-400",
};

const upcomingShifts = [
  { roleKey: "morningCrew",   timeKey: "morning",   staffNum: 12, staffTotal: 15, pct: 80,  status: "warning" },
  { roleKey: "afternoonCrew", timeKey: "afternoon", staffNum: 15, staffTotal: 15, pct: 100, status: "success" },
  { roleKey: "nightShift",    timeKey: "night",     staffNum: 4,  staffTotal: 5,  pct: 80,  status: "success" },
];

const SHIFT_LABELS: Record<string, { role: string; time: string }> = {
  morningCrewmorning:     { role: "Morning Crew - Makkah Central",   time: "06:00 - 14:00" },
  afternoonCrewafternoon: { role: "Afternoon Crew - Madinah Gate",   time: "14:00 - 22:00" },
  nightShiftnight:        { role: "Night Shift - Security",          time: "22:00 - 06:00" },
};

export default function Dashboard() {
  const { t, i18n } = useTranslation(["dashboard", "common"]);
  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 30000,
  });

  const dashStats = stats as {
    totalCandidates: number;
    openPositions: number;
    activeEvents: number;
    scheduledInterviews: number;
    recentApplications: Array<{
      candidateName: string;
      role: string;
      status: string;
      appliedAt: string;
      photoUrl?: string | null;
    }>;
  } | undefined;

  const fmt = (n: number | undefined) => n != null ? formatNumber(n, i18n.language) : "—";

  const metricCards = [
    { titleKey: "totalCandidates",     subKey: "totalCandidatesSub",     value: fmt(dashStats?.totalCandidates),     icon: Users,      color: "text-blue-500" },
    { titleKey: "openPositions",       subKey: "openPositionsSub",       value: fmt(dashStats?.openPositions),       icon: Briefcase,  color: "text-primary" },
    { titleKey: "activeEvents",        subKey: "activeEventsSub",        value: fmt(dashStats?.activeEvents),        icon: TrendingUp, color: "text-purple-500" },
    { titleKey: "scheduledInterviews", subKey: "scheduledInterviewsSub", value: fmt(dashStats?.scheduledInterviews), icon: Clock,      color: "text-green-500" },
  ];

  const dfLocale = i18n.language?.startsWith("ar") ? dfArLocale : undefined;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">{t("dashboard:title")}</h1>
            <p className="text-muted-foreground mt-1">{t("dashboard:subtitle")}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="h-9 border-border bg-background">
              <Calendar className="me-2 h-4 w-4" />
              <bdi>{formatDate(new Date(), i18n.language, { month: "short", year: "numeric", day: undefined })}</bdi>
            </Button>
            <Button className="h-9 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs">
              {t("dashboard:actions.postJob")}
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metricCards.map((stat) => (
            <Card key={stat.titleKey} className="bg-card border-border shadow-sm hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  {t(`dashboard:metrics.${stat.titleKey}`)}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <div className="text-2xl font-bold font-display text-white" data-testid={`stat-${stat.titleKey}`}><bdi>{stat.value}</bdi></div>
                    <p className="text-xs text-muted-foreground mt-1">{t(`dashboard:metrics.${stat.subKey}`)}</p>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Recent Applications */}
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-display text-white">{t("dashboard:sections.recentApplications")}</CardTitle>
                  <p className="text-sm text-muted-foreground">{t("dashboard:sections.recentApplicationsSub")}</p>
                </div>
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">{t("dashboard:actions.viewAll")}</Button>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : dashStats?.recentApplications?.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-10">{t("dashboard:sections.noApplications")}</p>
                ) : (
                  <div className="space-y-4">
                    {(dashStats?.recentApplications ?? []).map((app, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-muted/20 rounded-sm border border-border/50 hover:bg-muted/40 transition-colors group" data-testid={`application-row-${i}`}>
                        <div className="flex items-center gap-4">
                          <Avatar className="h-10 w-10 border border-border bg-secondary text-secondary-foreground">
                            {app.photoUrl && <AvatarImage src={app.photoUrl} alt={app.candidateName} className="object-cover" />}
                            <AvatarFallback>{app.candidateName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium text-white group-hover:text-primary transition-colors"><bdi>{app.candidateName}</bdi></p>
                            <p className="text-xs text-muted-foreground"><bdi>{app.role}</bdi></p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-end hidden sm:block">
                            <Badge className={`text-[10px] h-5 border-0 font-medium ${statusColor[app.status] ?? "bg-muted text-muted-foreground"}`}>
                              {t(`dashboard:applicationStatus.${app.status}`, app.status.charAt(0).toUpperCase() + app.status.slice(1))}
                            </Badge>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {formatDistanceToNow(new Date(app.appliedAt), { addSuffix: true, locale: dfLocale })}
                            </p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recruitment Funnel */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg font-display text-white">{t("dashboard:sections.recruitmentFunnel")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px] w-full bg-muted/20 rounded-sm flex items-center justify-center border border-dashed border-border">
                  <p className="text-muted-foreground text-sm">{t("dashboard:sections.funnelEmpty")}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg font-display text-white">{t("dashboard:sections.shiftCoverage")}</CardTitle>
                <p className="text-sm text-muted-foreground">{t("dashboard:sections.shiftCoverageSub")}</p>
              </CardHeader>
              <CardContent className="space-y-6">
                {upcomingShifts.map((shift, i) => {
                  const labels = SHIFT_LABELS[shift.roleKey + shift.timeKey];
                  const staff = `${formatNumber(shift.staffNum, i18n.language)}/${formatNumber(shift.staffTotal, i18n.language)}`;
                  return (
                    <div key={i} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-white"><bdi>{labels.role}</bdi></p>
                        {shift.pct < 90 ? (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span><bdi>{labels.time}</bdi></span>
                        <span className={shift.pct < 90 ? "text-amber-500 font-bold" : "text-green-500"}>
                          <bdi>{staff}</bdi>
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${shift.pct < 90 ? "bg-amber-500" : "bg-green-500"}`}
                          style={{ width: `${shift.pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <Button variant="outline" className="w-full mt-4 border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/50">
                  {t("dashboard:actions.viewFullSchedule")}
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card border-border bg-gradient-to-br from-card to-muted/20">
              <CardHeader>
                <CardTitle className="text-lg font-display text-white">{t("dashboard:sections.quickActions")}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Button variant="secondary" className="h-auto py-4 flex flex-col gap-2 bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/50 transition-all" data-testid="button-add-candidate">
                  <Users className="h-6 w-6" />
                  <span className="text-xs">{t("dashboard:actions.addCandidate")}</span>
                </Button>
                <Button variant="secondary" className="h-auto py-4 flex flex-col gap-2 bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/50 transition-all" data-testid="button-create-job">
                  <Briefcase className="h-6 w-6" />
                  <span className="text-xs">{t("dashboard:actions.postApplication")}</span>
                </Button>
                <Button variant="secondary" className="h-auto py-4 flex flex-col gap-2 bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/50 transition-all" data-testid="button-log-hours">
                  <Clock className="h-6 w-6" />
                  <span className="text-xs">{t("dashboard:actions.logHours")}</span>
                </Button>
                <Button variant="secondary" className="h-auto py-4 flex flex-col gap-2 bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/50 transition-all" data-testid="button-report-issue">
                  <AlertCircle className="h-6 w-6" />
                  <span className="text-xs">{t("dashboard:actions.reportIssue")}</span>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
