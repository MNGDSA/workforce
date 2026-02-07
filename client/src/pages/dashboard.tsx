import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  Briefcase, 
  Clock, 
  TrendingUp, 
  MoreHorizontal, 
  Calendar,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const stats = [
  {
    title: "Total Candidates",
    value: "1,284",
    change: "+12%",
    trend: "up",
    icon: Users,
    color: "text-blue-500",
  },
  {
    title: "Open Positions",
    value: "42",
    change: "-5%",
    trend: "down",
    icon: Briefcase,
    color: "text-primary",
  },
  {
    title: "Avg. Time to Hire",
    value: "14 Days",
    change: "-2 Days",
    trend: "up",
    icon: Clock,
    color: "text-green-500",
  },
  {
    title: "Onboarding Rate",
    value: "94%",
    change: "+4%",
    trend: "up",
    icon: TrendingUp,
    color: "text-purple-500",
  },
];

const recentApplications = [
  {
    name: "Sarah Williams",
    role: "Forklift Operator",
    date: "2 mins ago",
    status: "New",
    avatar: "SW",
  },
  {
    name: "Michael Chen",
    role: "Warehouse Associate",
    date: "1 hour ago",
    status: "Reviewing",
    avatar: "MC",
  },
  {
    name: "David Rodriguez",
    role: "Site Supervisor",
    date: "3 hours ago",
    status: "Interview",
    avatar: "DR",
  },
  {
    name: "Emily Johnson",
    role: "Safety Inspector",
    date: "5 hours ago",
    status: "New",
    avatar: "EJ",
  },
];

const upcomingShifts = [
  {
    role: "Morning Crew - Warehouse A",
    time: "06:00 AM - 02:00 PM",
    staff: "12/15 Filled",
    status: "warning",
  },
  {
    role: "Afternoon Crew - Loading Dock",
    time: "02:00 PM - 10:00 PM",
    staff: "15/15 Filled",
    status: "success",
  },
  {
    role: "Night Shift - Security",
    time: "10:00 PM - 06:00 AM",
    staff: "4/5 Filled",
    status: "success",
  },
];

export default function Dashboard() {
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
              Feb 2024
            </Button>
            <Button className="h-9 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs">
              Post New Job
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <Card key={i} className="bg-card border-border shadow-sm hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display text-white">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className={stat.trend === "up" ? "text-green-500" : "text-red-500"}>
                    {stat.change}
                  </span>{" "}
                  from last month
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content Area - 2 Cols */}
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
                <div className="space-y-4">
                  {recentApplications.map((app, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-muted/20 rounded-sm border border-border/50 hover:bg-muted/40 transition-colors group">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-10 w-10 border border-border bg-secondary text-secondary-foreground">
                          <AvatarFallback>{app.avatar}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-white group-hover:text-primary transition-colors">{app.name}</p>
                          <p className="text-xs text-muted-foreground">{app.role}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                          <p className="text-xs font-medium text-white">{app.status}</p>
                          <p className="text-[10px] text-muted-foreground">{app.date}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            {/* Chart Placeholder - Recruitment Funnel */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg font-display text-white">Recruitment Funnel</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px] w-full bg-muted/20 rounded-sm flex items-center justify-center border border-dashed border-border">
                  <p className="text-muted-foreground text-sm">Interactive Funnel Chart Visualization</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar Area - 1 Col */}
          <div className="space-y-8">
            {/* Upcoming Shifts Status */}
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
                      {shift.status === "warning" ? (
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{shift.time}</span>
                      <span className={shift.status === "warning" ? "text-amber-500 font-bold" : "text-green-500"}>
                        {shift.staff}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${shift.status === "warning" ? "bg-amber-500" : "bg-green-500"}`} 
                        style={{ width: shift.status === "warning" ? "80%" : "100%" }}
                      />
                    </div>
                  </div>
                ))}
                
                <Button variant="outline" className="w-full mt-4 border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/50">
                  View Full Schedule
                </Button>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="bg-card border-border bg-gradient-to-br from-card to-muted/20">
              <CardHeader>
                <CardTitle className="text-lg font-display text-white">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Button variant="secondary" className="h-auto py-4 flex flex-col gap-2 bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/50 transition-all">
                  <Users className="h-6 w-6" />
                  <span className="text-xs">Add Candidate</span>
                </Button>
                <Button variant="secondary" className="h-auto py-4 flex flex-col gap-2 bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/50 transition-all">
                  <Briefcase className="h-6 w-6" />
                  <span className="text-xs">Create Job</span>
                </Button>
                <Button variant="secondary" className="h-auto py-4 flex flex-col gap-2 bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/50 transition-all">
                  <Clock className="h-6 w-6" />
                  <span className="text-xs">Log Hours</span>
                </Button>
                <Button variant="secondary" className="h-auto py-4 flex flex-col gap-2 bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/50 transition-all">
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
