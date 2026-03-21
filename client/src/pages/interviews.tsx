import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Search, 
  Filter, 
  MoreHorizontal, 
  Calendar,
  Clock,
  Video,
  Phone,
  CheckCircle2,
  XCircle,
  AlertCircle
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const interviews = [
  {
    id: "INT-1042",
    candidateName: "Sarah Williams",
    candidateAvatar: "SW",
    role: "Forklift Operator",
    date: "Today",
    time: "10:00 AM",
    type: "Video Call",
    interviewer: "John Davis",
    status: "Upcoming"
  },
  {
    id: "INT-1043",
    candidateName: "Michael Chen",
    candidateAvatar: "MC",
    role: "Warehouse Associate",
    date: "Today",
    time: "11:30 AM",
    type: "Phone Call",
    interviewer: "Alice Smith",
    status: "In Progress"
  },
  {
    id: "INT-1044",
    candidateName: "David Rodriguez",
    candidateAvatar: "DR",
    role: "Site Supervisor",
    date: "Today",
    time: "02:00 PM",
    type: "In Person",
    interviewer: "Mark Johnson",
    status: "Upcoming"
  },
  {
    id: "INT-1041",
    candidateName: "Emily Johnson",
    candidateAvatar: "EJ",
    role: "Safety Inspector",
    date: "Yesterday",
    time: "04:00 PM",
    type: "Video Call",
    interviewer: "John Davis",
    status: "Completed"
  },
  {
    id: "INT-1040",
    candidateName: "James Wilson",
    candidateAvatar: "JW",
    role: "Driver",
    date: "Yesterday",
    time: "01:00 PM",
    type: "Phone Call",
    interviewer: "Alice Smith",
    status: "No Show"
  }
];

export default function InterviewsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Interview Calls</h1>
            <p className="text-muted-foreground mt-1">Manage and track candidate interview schedules.</p>
          </div>
          <Button className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs">
            Schedule Interview
          </Button>
        </div>

        {/* Top Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Today's Calls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">12</div>
              <p className="text-xs text-muted-foreground mt-1">
                4 Completed
              </p>
            </CardContent>
          </Card>
          
           <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Upcoming
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">45</div>
              <p className="text-xs text-muted-foreground mt-1">
                Next 7 days
              </p>
            </CardContent>
          </Card>

           <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Completion Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">92%</div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="text-green-500 font-medium">+2%</span> vs last week
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                No Shows
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white text-destructive">3</div>
              <p className="text-xs text-muted-foreground mt-1">
                This week
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar Area */}
        <div className="flex flex-col md:flex-row gap-4 items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
              placeholder="Search by candidate name, role, or interviewer..." 
              className="pl-10 h-12 bg-muted/30 border-border focus-visible:ring-primary/20 text-base" 
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="outline" className="h-12 border-border bg-background flex-1 md:flex-none">
              <Filter className="mr-2 h-4 w-4" />
              Status
            </Button>
            <Button variant="outline" className="h-12 border-border bg-background flex-1 md:flex-none">
              <Calendar className="mr-2 h-4 w-4" />
              Date
            </Button>
          </div>
        </div>

        {/* Interviews List */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-display text-white">Interview Schedule</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Venue</TableHead>
                  <TableHead className="text-muted-foreground hidden md:table-cell">Venue</TableHead>
                  <TableHead className="text-muted-foreground">Schedule</TableHead>
                  <TableHead className="text-muted-foreground hidden lg:table-cell">Type</TableHead>
                  <TableHead className="text-muted-foreground hidden lg:table-cell">Interviewer</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interviews.map((interview) => (
                  <TableRow key={interview.id} className="border-border hover:bg-muted/20">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 border border-border">
                          <AvatarFallback className="bg-primary/20 text-primary text-xs">{interview.candidateAvatar}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-white">{interview.candidateName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{interview.id}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {interview.role}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-sm text-white">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {interview.date}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {interview.time}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        {interview.type === "Video Call" && <Video className="h-4 w-4" />}
                        {interview.type === "Phone Call" && <Phone className="h-4 w-4" />}
                        {interview.type === "In Person" && <Calendar className="h-4 w-4" />}
                        {interview.type}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {interview.interviewer}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={`font-medium border-0 ${
                          interview.status === "Upcoming" ? "bg-blue-500/10 text-blue-500" :
                          interview.status === "In Progress" ? "bg-amber-500/10 text-amber-500" :
                          interview.status === "Completed" ? "bg-green-500/10 text-green-500" :
                          "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {interview.status === "Completed" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                        {interview.status === "No Show" && <XCircle className="mr-1 h-3 w-3" />}
                        {interview.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
