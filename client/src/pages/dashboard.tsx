import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

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
  {
    role: "Morning Crew - Makkah Central",
    time: "06:00 AM - 02:00 PM",
    staff: "12/15 Filled",
    pct: 80,
    status: "warning",
  },
  {
    role: "Afternoon Crew - Madinah Gate",
    time: "02:00 PM - 10:00 PM",
    staff: "15/15 Filled",
    pct: 100,
    status: "success",
  },
  {
    role: "Night Shift - Security",
    time: "10:00 PM - 06:00 AM",
    staff: "4/5 Filled",
    pct: 80,
    status: "success",
  },
];

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 30000,
  });

  const dashStats = stats as {
    totalCandidates: number;
    openPositions: number;
    activeSeasons: number;
    scheduledInterviews: number;
    recentApplications: Array<{
      candidateName: string;
      role: string;
      status: string;
      appliedAt: string;
    }>;
  } | undefined;

  const metricCards = [
    {
      title: "Total Candidates",
      value: dashStats ? dashStats.totalCandidates.toLocaleString() : "—",
      icon: Users,
      color: "text-blue-500",
      sub: "In talent database",
    },
    {
      title: "Open Positions",
      value: dashStats ? dashStats.openPositions.toLocaleString() : "—",
      icon: Briefcase,
      color: "text-primary",
      sub: "Active postings",
    },
    {
      title: "Active Seasons",
      value: dashStats ? dashStats.activeSeasons.toLocaleString() : "—",
      icon: TrendingUp,
      color: "text-purple-500",
      sub: "Running right now",
    },
    {
      title: "Scheduled Interviews",
      value: dashStats ? dashStats.scheduledInterviews.toLocaleString() : "—",
      icon: Clock,
      color: "text-green-500",
      sub: "Upcoming interviews",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Overview of your seasonal hiring pipeline and workforce status.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="h-9 border-border bg-background">
              <Calendar className="mr-2 h-4 w-4" />
              {new Date().toLocaleString("en-US", { month: "short", year: "numeric" })}
            </Button>
            <Button variant="outline" className="h-9 border-border bg-background font-bold uppercase tracking-wide text-xs">
              Post Job
            </Button>
            <Button className="h-9 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs">
              Post Consolidated Job
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metricCards.map((stat, i) => (
            <Card key={i} className="bg-card border-border shadow-sm hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <div className="text-2xl font-bold font-display text-white" data-testid={`stat-${stat.title.toLowerCase().replace(/\s/g, "-")}`}>{stat.value}</div>
                    <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
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
                  <CardTitle className="text-lg font-display text-white">Recent Applications</CardTitle>
                  <p className="text-sm text-muted-foreground">Latest candidates applying for open positions</p>
                </div>
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">View All</Button>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : dashStats?.recentApplications?.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-10">No applications yet. Post a job to get started.</p>
                ) : (
                  <div className="space-y-4">
                    {(dashStats?.recentApplications ?? []).map((app, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-muted/20 rounded-sm border border-border/50 hover:bg-muted/40 transition-colors group" data-testid={`application-row-${i}`}>
                        <div className="flex items-center gap-4">
                          <Avatar className="h-10 w-10 border border-border bg-secondary text-secondary-foreground">
                            <AvatarFallback>{app.candidateName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium text-white group-hover:text-primary transition-colors">{app.candidateName}</p>
                            <p className="text-xs text-muted-foreground">{app.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right hidden sm:block">
                            <Badge className={`text-[10px] h-5 border-0 font-medium ${statusColor[app.status] ?? "bg-muted text-muted-foreground"}`}>
                              {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                            </Badge>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {formatDistanceToNow(new Date(app.appliedAt), { addSuffix: true })}
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
                <CardTitle className="text-lg font-display text-white">Recruitment Funnel</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px] w-full bg-muted/20 rounded-sm flex items-center justify-center border border-dashed border-border">
                  <p className="text-muted-foreground text-sm">Interactive Funnel Chart — Upload candidates to visualize pipeline</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg font-display text-white">Shift Coverage</CardTitle>
                <p className="text-sm text-muted-foreground">Today's staffing status</p>
              </CardHeader>
              <CardContent className="space-y-6">
                {upcomingShifts.map((shift, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-white">{shift.role}</p>
                      {shift.pct < 90 ? (
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{shift.time}</span>
                      <span className={shift.pct < 90 ? "text-amber-500 font-bold" : "text-green-500"}>
                        {shift.staff}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${shift.pct < 90 ? "bg-amber-500" : "bg-green-500"}`}
                        style={{ width: `${shift.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="w-full mt-4 border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/50">
                  View Full Schedule
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card border-border bg-gradient-to-br from-card to-muted/20">
              <CardHeader>
                <CardTitle className="text-lg font-display text-white">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Button variant="secondary" className="h-auto py-4 flex flex-col gap-2 bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/50 transition-all" data-testid="button-add-candidate">
                  <Users className="h-6 w-6" />
                  <span className="text-xs">Add Candidate</span>
                </Button>
                <Button variant="secondary" className="h-auto py-4 flex flex-col gap-2 bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/50 transition-all" data-testid="button-create-job">
                  <Briefcase className="h-6 w-6" />
                  <span className="text-xs">Post Application</span>
                </Button>
                <Button variant="secondary" className="h-auto py-4 flex flex-col gap-2 bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/50 transition-all" data-testid="button-log-hours">
                  <Clock className="h-6 w-6" />
                  <span className="text-xs">Log Hours</span>
                </Button>
                <Button variant="secondary" className="h-auto py-4 flex flex-col gap-2 bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/50 transition-all" data-testid="button-report-issue">
                  <AlertCircle className="h-6 w-6" />
                  <span className="text-xs">Report Issue</span>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
