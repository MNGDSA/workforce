import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Filter, 
  MoreHorizontal, 
  Calendar,
  Users,
  Plus,
  BarChart3
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

const seasons = [
  {
    id: "S-2025-001",
    name: "Summer Peak 2025",
    startDate: "May 15, 2025",
    endDate: "Sep 01, 2025",
    status: "Planning",
    headcount: { current: 45, target: 150 },
    departments: ["Warehouse", "Logistics"],
    priority: "High"
  },
  {
    id: "S-2024-004",
    name: "Holiday Season 2024",
    startDate: "Nov 01, 2024",
    endDate: "Jan 15, 2025",
    status: "Active",
    headcount: { current: 280, target: 300 },
    departments: ["All Departments"],
    priority: "Critical"
  },
  {
    id: "S-2024-003",
    name: "Back to School 2024",
    startDate: "Jul 15, 2024",
    endDate: "Sep 10, 2024",
    status: "Completed",
    headcount: { current: 120, target: 120 },
    departments: ["Retail", "Stock"],
    priority: "Medium"
  },
  {
    id: "S-2024-002",
    name: "Spring Garden 2024",
    startDate: "Mar 01, 2024",
    endDate: "May 30, 2024",
    status: "Completed",
    headcount: { current: 85, target: 90 },
    departments: ["Garden Center"],
    priority: "Low"
  },
  {
    id: "S-2024-001",
    name: "Winter Clearance 2024",
    startDate: "Jan 02, 2024",
    endDate: "Feb 28, 2024",
    status: "Archived",
    headcount: { current: 40, target: 40 },
    departments: ["Retail"],
    priority: "Low"
  }
];

export default function SeasonsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Seasons Management</h1>
            <p className="text-muted-foreground mt-1">Plan and track your seasonal workforce requirements.</p>
          </div>
          <Button className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs">
            <Plus className="mr-2 h-4 w-4" />
            Create Season
          </Button>
        </div>

        {/* Top Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Total Seasons
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">{seasons.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Across all time
              </p>
            </CardContent>
          </Card>
          
           <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Active Campaigns
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">
                {seasons.filter(s => s.status === 'Active').length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Currently in progress
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
              <div className="text-4xl font-bold font-display text-white">
                {seasons.filter(s => s.status === 'Planning').length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                In planning phase
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar Area */}
        <div className="flex flex-col md:flex-row gap-4 items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
              placeholder="Search seasons by name, ID, or department..." 
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
              Date Range
            </Button>
          </div>
        </div>

        {/* Seasons List */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-display text-white">Seasons List</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-[100px] text-muted-foreground">ID</TableHead>
                  <TableHead className="text-muted-foreground">Season Name</TableHead>
                  <TableHead className="text-muted-foreground hidden md:table-cell">Deadline</TableHead>
                  <TableHead className="text-muted-foreground hidden lg:table-cell">Hiring Progress</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seasons.map((season) => (
                  <TableRow key={season.id} className="border-border hover:bg-muted/20">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {season.id}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-white">{season.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {season.departments.map(dept => (
                           <span key={dept} className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-sm">
                             {dept}
                           </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-white">{season.endDate}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell w-[200px]">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Users className="h-3 w-3" /> {season.headcount.current} / {season.headcount.target}
                          </span>
                          <span className="text-white font-medium">
                            {Math.round((season.headcount.current / season.headcount.target) * 100)}%
                          </span>
                        </div>
                        <Progress value={(season.headcount.current / season.headcount.target) * 100} className="h-1.5" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={`font-medium border-0 ${
                          season.status === "Active" ? "bg-green-500/10 text-green-500" :
                          season.status === "Planning" ? "bg-blue-500/10 text-blue-500" :
                          season.status === "Completed" ? "bg-muted text-muted-foreground" :
                          "bg-zinc-800 text-zinc-500"
                        }`}
                      >
                        {season.status}
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
