import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useCallback } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Search,
  Filter,
  MoreHorizontal,
  MapPin,
  Briefcase,
  Star,
  Download,
  Mail,
  Phone,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Upload,
  RefreshCw,
  Users,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { Candidate } from "@shared/schema";

const statusStyles: Record<string, string> = {
  active: "bg-green-500/10 text-green-500",
  inactive: "bg-gray-500/10 text-gray-400",
  blocked: "bg-red-500/10 text-red-500",
  hired: "bg-blue-500/10 text-blue-400",
  rejected: "bg-red-500/10 text-red-400",
  pending_review: "bg-amber-500/10 text-amber-400",
};

export default function TalentPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");

  const debouncedSearch = useDebounce(search, 300);

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: "50",
    sortBy,
    sortOrder: "desc",
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(status && status !== "all" ? { status } : {}),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["/api/candidates", page, debouncedSearch, status, sortBy],
    queryFn: () => apiRequest("GET", `/api/candidates?${queryParams.toString()}`).then(r => r.json()),
  });

  const { data: statsData } = useQuery({
    queryKey: ["/api/candidates/stats"],
    queryFn: () => apiRequest("GET", "/api/candidates/stats").then(r => r.json()),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/candidates/${id}`, { status }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/stats"] });
    },
  });

  const candidates: Candidate[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  const stats = statsData as { total: number; active: number; hired: number; blocked: number; avgRating: number } | undefined;

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Talent Pool</h1>
            <p className="text-muted-foreground mt-1">
              Manage and search your candidate database.
              {total > 0 && <span className="text-primary font-medium ml-1">{total.toLocaleString()} total records</span>}
            </p>
          </div>
          <Button
            className="h-9 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs"
            data-testid="button-upload-candidates"
          >
            <Upload className="mr-2 h-4 w-4" />
            Bulk Upload
          </Button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Profiles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-profiles">
                {stats ? stats.total.toLocaleString() : "—"}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-green-500" data-testid="stat-active">
                {stats ? stats.active.toLocaleString() : "—"}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Hired</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-blue-500" data-testid="stat-hired">
                {stats ? stats.hired.toLocaleString() : "—"}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Avg Rating</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="text-4xl font-bold font-display text-white" data-testid="stat-avg-rating">
                  {stats ? Number(stats.avgRating).toFixed(1) : "—"}
                </div>
                <Star className="h-5 w-5 text-yellow-500 fill-current mt-1" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by name, role, phone, ID..."
              className="pl-10 h-10 bg-muted/30 border-border focus-visible:ring-primary/20"
              value={search}
              onChange={handleSearchChange}
              data-testid="input-search-candidates"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="h-10 w-36 border-border bg-background" data-testid="select-status-filter">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="hired">Hired</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-10 w-36 border-border bg-background" data-testid="select-sort-by">
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Newest First</SelectItem>
                <SelectItem value="fullNameEn">Name A–Z</SelectItem>
                <SelectItem value="rating">Highest Rated</SelectItem>
                <SelectItem value="experienceYears">Most Experienced</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="h-10 border-border bg-background" data-testid="button-export">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Table */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-base font-display text-white">
              Candidate List
              {isFetching && <RefreshCw className="inline ml-2 h-3 w-3 animate-spin text-muted-foreground" />}
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages || 1} · {total.toLocaleString()} records
            </span>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : candidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">No candidates found</p>
                <p className="text-muted-foreground/60 text-sm mt-1">
                  {search ? "Try a different search term" : "Upload your candidate database to get started"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-[110px] text-muted-foreground">ID</TableHead>
                    <TableHead className="text-muted-foreground">Candidate</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">Role & Skills</TableHead>
                    <TableHead className="text-muted-foreground hidden sm:table-cell">Status</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">Contact</TableHead>
                    <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((candidate) => (
                    <TableRow key={candidate.id} className="border-border hover:bg-muted/20" data-testid={`row-candidate-${candidate.id}`}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {candidate.nationalId ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border border-border">
                            <AvatarFallback className="text-xs">
                              {candidate.fullNameEn.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-white text-sm">{candidate.fullNameEn}</p>
                            {candidate.city && (
                              <div className="flex items-center text-xs text-muted-foreground gap-1">
                                <MapPin className="h-3 w-3" />
                                {candidate.city}
                                {candidate.nationality && (
                                  <span className="ml-1 text-[10px] text-muted-foreground/60">
                                    ({candidate.nationality === "saudi" ? "SA" : "Non-SA"})
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="space-y-1">
                          {candidate.currentRole && (
                            <div className="flex items-center gap-1 text-sm font-medium text-white">
                              <Briefcase className="h-3 w-3 text-primary" />
                              {candidate.currentRole}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1">
                            {(candidate.skills ?? []).slice(0, 2).map((skill) => (
                              <Badge key={skill} variant="secondary" className="text-[10px] h-5 font-normal bg-muted/50 text-muted-foreground border-border/50">
                                {skill}
                              </Badge>
                            ))}
                            {(candidate.skills ?? []).length > 2 && (
                              <Badge variant="secondary" className="text-[10px] h-5 font-normal bg-muted/50 text-muted-foreground border-border/50">
                                +{(candidate.skills ?? []).length - 2}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge
                          variant="outline"
                          className={`font-medium border-0 text-xs ${statusStyles[candidate.status] ?? "bg-muted text-muted-foreground"}`}
                          data-testid={`status-${candidate.id}`}
                        >
                          {candidate.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="space-y-1 text-sm text-muted-foreground">
                          {candidate.email && (
                            <div className="flex items-center gap-2">
                              <Mail className="h-3 w-3" />
                              <span className="truncate max-w-[160px]">{candidate.email}</span>
                            </div>
                          )}
                          {candidate.phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-3 w-3" />
                              {candidate.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" data-testid={`button-actions-${candidate.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem>View Profile</DropdownMenuItem>
                            <DropdownMenuItem>Schedule Interview</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => updateStatus.mutate({ id: candidate.id, status: candidate.status === "active" ? "blocked" : "active" })}
                              className={candidate.status === "blocked" ? "text-green-500" : "text-red-500"}
                            >
                              {candidate.status === "blocked" ? "Unblock" : "Block"}
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Showing {((page - 1) * 50) + 1}–{Math.min(page * 50, total)} of {total.toLocaleString()} candidates
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="flex items-center text-xs text-muted-foreground px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
