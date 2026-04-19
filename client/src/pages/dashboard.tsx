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

        <div className="grid grid-cols-1 gap-8">
          <div className="space-y-8">
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
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
