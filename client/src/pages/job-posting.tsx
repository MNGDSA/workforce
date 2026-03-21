import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Briefcase, Plus, Search, MapPin, Building } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const activeJobs = [
  {
    id: "JOB-2025-01",
    title: "Al Masjid Al Haram (Ramadan)",
    department: "Seasonal",
    location: "Makkah",
    type: "Seasonal Full-time",
    applicants: 145,
    status: "Active",
    posted: "2 days ago"
  },
  {
    id: "JOB-2025-02",
    title: "Logistics Coordinator",
    department: "Operations",
    location: "Remote / Hybrid",
    type: "Contract",
    applicants: 32,
    status: "Active",
    posted: "5 days ago"
  },
  {
    id: "JOB-2025-03",
    title: "Inventory Clerk",
    department: "Warehouse",
    location: "Chicago, IL (Zone B)",
    type: "Part-time",
    applicants: 89,
    status: "Active",
    posted: "1 week ago"
  },
  {
    id: "JOB-2025-04",
    title: "Security Staff",
    department: "Security",
    location: "Riyadh",
    type: "Seasonal",
    applicants: 210,
    status: "Draft",
    posted: "-"
  }
];

export default function JobPostingPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Job Posting</h1>
            <p className="text-muted-foreground mt-1">Manage active listings and create new job opportunities.</p>
          </div>
          <Button className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs">
            <Plus className="mr-2 h-4 w-4" />
            Create New Job
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Active Listings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">12</div>
              <p className="text-xs text-muted-foreground mt-1">
                Across 4 locations
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Total Applicants
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">476</div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="text-green-500 font-medium">+15%</span> from last week
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Drafts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">3</div>
              <p className="text-xs text-muted-foreground mt-1">
                Pending approval
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border-border mt-8">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <CardTitle className="text-lg font-display text-white">All Jobs</CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search jobs..." 
                  className="pl-9 bg-muted/30 border-border focus-visible:ring-primary/20 h-9 rounded-sm w-full" 
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground pl-6">Job Title</TableHead>
                  <TableHead className="text-muted-foreground hidden md:table-cell">Details</TableHead>
                  <TableHead className="text-muted-foreground">Applicants</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeJobs.map((job) => (
                  <TableRow key={job.id} className="border-border hover:bg-muted/20 cursor-pointer group">
                    <TableCell className="pl-6 py-4">
                      <div className="font-medium text-white group-hover:text-primary transition-colors">{job.title}</div>
                      <div className="text-xs text-muted-foreground mt-1 font-mono">{job.id}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell py-4">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center text-xs text-muted-foreground">
                          <Building className="h-3.5 w-3.5 mr-1.5" />
                          {job.department} • <span className="ml-1 text-white">{job.type}</span>
                        </div>
                        <div className="flex items-center text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 mr-1.5" />
                          {job.location}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{job.applicants}</span>
                        <span className="text-xs text-muted-foreground">candidates</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <Badge 
                        variant="outline" 
                        className={`font-medium border-0 ${
                          job.status === "Active" ? "bg-green-500/10 text-green-500" :
                          "bg-muted text-muted-foreground"
                        }`}
                      >
                        {job.status}
                      </Badge>
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
