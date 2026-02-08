import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Filter, 
  MoreHorizontal, 
  Users,
  Plus,
  Briefcase,
  Clock,
  ArrowRight
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

const workforceGroups = [
  {
    id: "WG-001",
    name: "Summer Warehouse Crew A",
    size: 45,
    role: "Warehouse Associate",
    startDate: "May 15, 2025",
    status: "Onboarding",
    progress: 25,
    location: "Chicago, IL"
  },
  {
    id: "WG-002",
    name: "Holiday Logistics Team",
    size: 120,
    role: "Driver / Logistics",
    startDate: "Nov 01, 2024",
    status: "Active",
    progress: 100,
    location: "Nationwide"
  },
  {
    id: "WG-003",
    name: "Spring Garden Staff",
    size: 30,
    role: "Retail Associate",
    startDate: "Mar 01, 2024",
    status: "Offboarded",
    progress: 100,
    location: "Austin, TX"
  },
  {
    id: "WG-004",
    name: "Event Security Team",
    size: 15,
    role: "Security",
    startDate: "Jul 04, 2025",
    status: "Onboarding",
    progress: 10,
    location: "Miami, FL"
  },
  {
    id: "WG-005",
    name: "Inventory Audit Squad",
    size: 8,
    role: "Auditor",
    startDate: "Jan 10, 2025",
    status: "Active",
    progress: 100,
    location: "Denver, CO"
  }
];

export default function WorkforcePage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Workforce Groups</h1>
          <p className="text-muted-foreground mt-1">Manage teams, assignments, and group lifecycles.</p>
        </div>

        {/* Top Metric: Total Groups */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Total Groups
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">{workforceGroups.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Active & Archived
              </p>
            </CardContent>
          </Card>
          
           <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Active Personnel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">
                {workforceGroups.filter(g => g.status !== 'Offboarded').reduce((acc, curr) => acc + curr.size, 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Currently deployed
              </p>
            </CardContent>
          </Card>

           <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Onboarding
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">
                {workforceGroups.filter(g => g.status === 'Onboarding').length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Groups in setup phase
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search & Action Bar */}
        <div className="flex flex-col md:flex-row gap-4 items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
              placeholder="Search groups by name, role, or location..." 
              className="pl-10 h-12 bg-muted/30 border-border focus-visible:ring-primary/20 text-base" 
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="outline" className="h-12 border-border bg-background flex-1 md:flex-none">
              <Filter className="mr-2 h-4 w-4" />
              Status
            </Button>
            <Button className="h-12 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs flex-1 md:flex-none">
              <Plus className="mr-2 h-4 w-4" />
              Create Group
            </Button>
          </div>
        </div>

        {/* Workforce Groups List */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-display text-white">Groups List</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-[100px] text-muted-foreground">ID</TableHead>
                  <TableHead className="text-muted-foreground">Group Name</TableHead>
                  <TableHead className="text-muted-foreground hidden md:table-cell">Role & Location</TableHead>
                  <TableHead className="text-muted-foreground hidden lg:table-cell">Lifecycle Progress</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workforceGroups.map((group) => (
                  <TableRow key={group.id} className="border-border hover:bg-muted/20">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {group.id}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-white">{group.name}</div>
                      <div className="flex items-center text-xs text-muted-foreground mt-1 gap-1">
                        <Users className="h-3 w-3" />
                        {group.size} Members
                        <span className="mx-1">•</span>
                        <Clock className="h-3 w-3" />
                        Starts {group.startDate}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-1.5 text-white">
                           <Briefcase className="h-3 w-3 text-primary" />
                           {group.role}
                        </div>
                        <div className="text-xs text-muted-foreground pl-4.5">
                           {group.location}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell w-[200px]">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Cycle Completion</span>
                          <span className="text-white font-medium">{group.progress}%</span>
                        </div>
                        <Progress value={group.progress} className="h-1.5" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={`font-medium border-0 ${
                          group.status === "Active" ? "bg-green-500/10 text-green-500" :
                          group.status === "Onboarding" ? "bg-blue-500/10 text-blue-500" :
                          group.status === "Offboarded" ? "bg-muted text-muted-foreground" :
                          "bg-zinc-800 text-zinc-500"
                        }`}
                      >
                        {group.status}
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
