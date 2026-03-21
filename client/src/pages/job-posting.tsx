import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import {
  Briefcase,
  Plus,
  Search,
  MapPin,
  Building,
  MoreHorizontal,
  Loader2,
  Users,
  DollarSign,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import type { JobPosting } from "@shared/schema";

const statusStyles: Record<string, string> = {
  active: "bg-green-500/10 text-green-500",
  draft: "bg-muted text-muted-foreground",
  paused: "bg-amber-500/10 text-amber-400",
  closed: "bg-red-500/10 text-red-400",
  filled: "bg-blue-500/10 text-blue-400",
};

export default function JobPostingPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: jobs = [], isLoading } = useQuery<JobPosting[]>({
    queryKey: ["/api/jobs"],
    queryFn: () => apiRequest("GET", "/api/jobs").then(r => r.json()),
  });

  const { data: jobStats } = useQuery({
    queryKey: ["/api/jobs/stats"],
    queryFn: () => apiRequest("GET", "/api/jobs/stats").then(r => r.json()),
  });

  const updateJob = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/jobs/${id}`, { status }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/stats"] });
    },
  });

  const deleteJob = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/jobs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/stats"] });
    },
  });

  const stats = jobStats as { total: number; active: number; draft: number; filled: number; totalOpenings: number } | undefined;

  const filtered = jobs.filter(j => {
    const matchSearch = !search || j.title.toLowerCase().includes(search.toLowerCase()) || (j.location ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || j.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Job Postings</h1>
            <p className="text-muted-foreground mt-1">Manage and publish seasonal job opportunities.</p>
          </div>
          <Button className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs" data-testid="button-create-job">
            <Plus className="mr-2 h-4 w-4" />
            Create Job
          </Button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-jobs">{stats?.total ?? "—"}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-green-500" data-testid="stat-active-jobs">{stats?.active ?? "—"}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Drafts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-muted-foreground" data-testid="stat-draft-jobs">{stats?.draft ?? "—"}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Openings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-openings">{stats?.totalOpenings?.toLocaleString() ?? "—"}</div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col md:flex-row gap-3 items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by job title, location..."
              className="pl-10 h-10 bg-muted/30 border-border focus-visible:ring-primary/20"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-jobs"
            />
          </div>
          <div className="flex gap-2">
            {["all", "active", "draft", "paused", "closed"].map(s => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                className={`h-10 capitalize ${statusFilter === s ? "bg-primary text-primary-foreground" : "border-border bg-background"}`}
                onClick={() => setStatusFilter(s)}
                data-testid={`filter-status-${s}`}
              >
                {s}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <Card className="bg-card border-border">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base font-display text-white">
              Job Listings
              {filtered.length > 0 && <span className="text-muted-foreground font-normal text-sm ml-2">({filtered.length})</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Briefcase className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">No jobs found</p>
                <p className="text-muted-foreground/60 text-sm mt-1">Create a job posting to attract candidates</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Job Title</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">Location</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">Openings</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">Salary Range</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">Posted</TableHead>
                    <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((job) => (
                    <TableRow key={job.id} className="border-border hover:bg-muted/20" data-testid={`row-job-${job.id}`}>
                      <TableCell>
                        <div className="font-medium text-white">{job.title}</div>
                        {job.department && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <Building className="h-3 w-3" />
                            {job.department} · {job.type}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {job.location && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {job.location}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-1 text-sm text-white">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          {job.openings.toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {job.salaryMin && job.salaryMax ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <DollarSign className="h-3 w-3" />
                            {Number(job.salaryMin).toLocaleString()} – {Number(job.salaryMax).toLocaleString()} SAR
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`font-medium border-0 capitalize text-xs ${statusStyles[job.status] ?? "bg-muted text-muted-foreground"}`}
                          data-testid={`status-job-${job.id}`}
                        >
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" data-testid={`button-job-actions-${job.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem>View Applicants</DropdownMenuItem>
                            <DropdownMenuItem>Edit Job</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {job.status === "draft" && (
                              <DropdownMenuItem onClick={() => updateJob.mutate({ id: job.id, status: "active" })}>
                                Publish
                              </DropdownMenuItem>
                            )}
                            {job.status === "active" && (
                              <DropdownMenuItem onClick={() => updateJob.mutate({ id: job.id, status: "paused" })}>
                                Pause
                              </DropdownMenuItem>
                            )}
                            {job.status === "paused" && (
                              <DropdownMenuItem onClick={() => updateJob.mutate({ id: job.id, status: "active" })}>
                                Resume
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-500"
                              onClick={() => deleteJob.mutate(job.id)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
