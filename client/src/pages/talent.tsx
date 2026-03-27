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
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import {
  Search,
  Filter,
  MoreHorizontal,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Upload,
  RefreshCw,
  Users,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileDown,
  FileUp,
  X,
  FileSpreadsheet,
  SlidersHorizontal,
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
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Candidate } from "@shared/schema";

const statusStyles: Record<string, string> = {
  active: "bg-green-500/10 text-green-500",
  inactive: "bg-gray-500/10 text-gray-400",
  dormant: "bg-amber-500/10 text-amber-400",
  blocked: "bg-red-500/10 text-red-500",
  hired: "bg-blue-500/10 text-blue-400",
  rejected: "bg-red-500/10 text-red-400",
  pending_review: "bg-amber-500/10 text-amber-400",
};

function getDisplayStatus(candidate: Candidate): string {
  if (candidate.status === "blocked" || candidate.status === "hired") return candidate.status;
  const lastLogin = (candidate as any).lastLoginAt;
  const createdAt = (candidate as any).createdAt;
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  if (lastLogin && new Date(lastLogin) < oneYearAgo) return "dormant";
  if (!lastLogin && createdAt && new Date(createdAt) < oneYearAgo) return "dormant";
  return candidate.status;
}

type SortField = "createdAt" | "fullNameEn" | "city" | "source" | "phone" | "email";

type ColumnKey = "id" | "candidate" | "classification" | "status" | "phone" | "email" | "city";

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "candidate", label: "Candidate" },
  { key: "classification", label: "Classification" },
  { key: "status", label: "Status" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "city", label: "City" },
];

const DEFAULT_VISIBLE: ColumnKey[] = ["id", "candidate", "classification", "status", "phone", "email", "city"];

const BULK_TEMPLATE_HEADERS = [
  "fullNameEn", "fullNameAr", "phone", "email", "nationalId",
  "city", "nationality", "gender", "dateOfBirth", "source"
];

const TEMPLATE_SAMPLE_ROWS = [
  ["John Doe", "جون دو", "0501234567", "john@example.com", "1234567890", "Makkah", "saudi", "male", "1990-01-15", "individual"],
  ["Jane Smith", "جين سميث", "0559876543", "jane@example.com", "0987654321", "Jeddah", "non_saudi", "female", "1992-06-20", "smp"],
];

function downloadTemplate(format: "csv" | "xlsx") {
  if (format === "xlsx") {
    const ws = XLSX.utils.aoa_to_sheet([BULK_TEMPLATE_HEADERS, ...TEMPLATE_SAMPLE_ROWS]);
    ws["!cols"] = BULK_TEMPLATE_HEADERS.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Candidates");
    XLSX.writeFile(wb, "candidate_upload_template.xlsx");
  } else {
    const csv = BULK_TEMPLATE_HEADERS.join(",") + "\n" +
      TEMPLATE_SAMPLE_ROWS.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "candidate_upload_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
}

function parseFileToRows(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isExcel = /\.xlsx?$/i.test(file.name);

    if (isExcel) {
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
          const cleaned = rows.map(r => {
            const obj: Record<string, string> = {};
            for (const [k, v] of Object.entries(r)) obj[k.trim()] = String(v).trim();
            return obj;
          });
          resolve(cleaned);
        } catch {
          reject(new Error("Could not parse Excel file. Please use the template."));
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (ev) => {
        try {
          const text = ev.target?.result as string;
          const wb = XLSX.read(text, { type: "string" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
          const cleaned = rows.map(r => {
            const obj: Record<string, string> = {};
            for (const [k, v] of Object.entries(r)) obj[k.trim()] = String(v).trim();
            return obj;
          });
          resolve(cleaned);
        } catch {
          reject(new Error("Could not parse CSV file. Please use the template."));
        }
      };
      reader.readAsText(file);
    }
  });
}

export default function TalentPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(new Set(DEFAULT_VISIBLE));
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<Record<string, string>[] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function toggleColumn(key: ColumnKey) {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size <= 2) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const col = (key: ColumnKey) => visibleColumns.has(key);

  const debouncedSearch = useDebounce(search, 300);

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: "50",
    sortBy,
    sortOrder,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(status && status !== "all" ? { status } : {}),
    ...(sourceFilter && sourceFilter !== "all" ? { source: sourceFilter } : {}),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["/api/candidates", page, debouncedSearch, status, sourceFilter, sortBy, sortOrder],
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

  const bulkUpload = useMutation({
    mutationFn: (candidates: Record<string, string>[]) => {
      const mapped = candidates.map(c => ({
        fullNameEn: c.fullNameEn || c.fullNameEn || "Unknown",
        fullNameAr: c.fullNameAr || undefined,
        phone: c.phone || undefined,
        email: c.email || undefined,
        nationalId: c.nationalId || undefined,
        city: c.city || undefined,
        nationality: c.nationality === "saudi" ? "saudi" : c.nationality === "non_saudi" ? "non_saudi" : undefined,
        gender: c.gender || undefined,
        dateOfBirth: c.dateOfBirth || undefined,
        source: c.source === "smp" ? "smp" : "individual",
        candidateCode: `C-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      }));
      return apiRequest("POST", "/api/candidates/bulk", { candidates: mapped }).then(r => r.json());
    },
    onSuccess: (data) => {
      toast({ title: "Upload Complete", description: `${data.inserted} candidates imported successfully.` });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates/stats"] });
      setUploadOpen(false);
      setUploadFile(null);
      setUploadPreview(null);
      setUploadError(null);
    },
    onError: (err: any) => {
      setUploadError(err.message || "Upload failed");
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

  function handleColumnSort(field: SortField) {
    if (sortBy === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortOrder === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadError(null);
    setUploadPreview(null);
    try {
      const rows = await parseFileToRows(file);
      if (rows.length === 0) {
        setUploadError("No data rows found in file");
        return;
      }
      setUploadPreview(rows);
    } catch (err: any) {
      setUploadError(err.message || "Could not parse file. Please use the template.");
    }
  }

  async function handleExport() {
    const params = new URLSearchParams({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(status && status !== "all" ? { status } : {}),
      ...(sourceFilter && sourceFilter !== "all" ? { source: sourceFilter } : {}),
      sortBy,
      sortOrder,
    });
    try {
      const res = await apiRequest("GET", `/api/candidates/export?${params.toString()}`);
      const data = await res.json();
      const rows: any[][] = data.rows || [];
      const headers: string[] = data.headers || [];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws["!cols"] = headers.map(() => ({ wch: 20 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Candidates");
      XLSX.writeFile(wb, `candidates_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      toast({ title: "Export failed", description: "Could not export candidates.", variant: "destructive" });
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Talent</h1>
            <p className="text-muted-foreground mt-1">
              Manage and search your candidate database.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-9 border-border bg-background"
              onClick={handleExport}
              data-testid="button-export"
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button
              className="h-9 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs"
              onClick={() => { setUploadOpen(true); setUploadFile(null); setUploadPreview(null); setUploadError(null); }}
              data-testid="button-upload-candidates"
            >
              <Upload className="mr-2 h-4 w-4" />
              Bulk Upload
            </Button>
          </div>
        </div>

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
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Blocked</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-red-500" data-testid="stat-blocked">
                {stats ? stats.blocked.toLocaleString() : "—"}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, email, ID..."
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
            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1); }}>
              <SelectTrigger className="h-10 w-40 border-border bg-background" data-testid="select-source-filter">
                <SelectValue placeholder="Classification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classifications</SelectItem>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="smp">SMP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-base font-display text-white">
              Candidate List
              {isFetching && <RefreshCw className="inline ml-2 h-3 w-3 animate-spin text-muted-foreground" />}
            </CardTitle>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 border-border bg-background gap-1.5" data-testid="button-toggle-columns">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Toggle columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {ALL_COLUMNS.map(({ key, label }) => (
                    <DropdownMenuCheckboxItem
                      key={key}
                      checked={visibleColumns.has(key)}
                      onCheckedChange={() => toggleColumn(key)}
                      onSelect={(e) => e.preventDefault()}
                      data-testid={`toggle-col-${key}`}
                    >
                      {label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages || 1} · {total.toLocaleString()} records
              </span>
            </div>
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      {col("id") && <TableHead className="w-[110px] text-muted-foreground">ID</TableHead>}
                      {col("candidate") && (
                        <TableHead
                          className="text-muted-foreground cursor-pointer select-none"
                          onClick={() => handleColumnSort("fullNameEn")}
                          data-testid="sort-candidate"
                        >
                          <span className="flex items-center">Candidate <SortIcon field="fullNameEn" /></span>
                        </TableHead>
                      )}
                      {col("classification") && (
                        <TableHead
                          className="text-muted-foreground cursor-pointer select-none"
                          onClick={() => handleColumnSort("source")}
                          data-testid="sort-classification"
                        >
                          <span className="flex items-center">Classification <SortIcon field="source" /></span>
                        </TableHead>
                      )}
                      {col("status") && <TableHead className="text-muted-foreground">Status</TableHead>}
                      {col("phone") && (
                        <TableHead
                          className="text-muted-foreground cursor-pointer select-none"
                          onClick={() => handleColumnSort("phone")}
                          data-testid="sort-phone"
                        >
                          <span className="flex items-center">Phone <SortIcon field="phone" /></span>
                        </TableHead>
                      )}
                      {col("email") && (
                        <TableHead
                          className="text-muted-foreground cursor-pointer select-none"
                          onClick={() => handleColumnSort("email")}
                          data-testid="sort-email"
                        >
                          <span className="flex items-center">Email <SortIcon field="email" /></span>
                        </TableHead>
                      )}
                      {col("city") && (
                        <TableHead
                          className="text-muted-foreground cursor-pointer select-none"
                          onClick={() => handleColumnSort("city")}
                          data-testid="sort-city"
                        >
                          <span className="flex items-center">City <SortIcon field="city" /></span>
                        </TableHead>
                      )}
                      <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((candidate) => {
                      const displayStatus = getDisplayStatus(candidate);
                      return (
                        <TableRow key={candidate.id} className="border-border hover:bg-muted/20" data-testid={`row-candidate-${candidate.id}`}>
                          {col("id") && (
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {candidate.nationalId ?? candidate.candidateCode}
                            </TableCell>
                          )}
                          {col("candidate") && (
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9 border border-border">
                                  <AvatarFallback className="text-xs">
                                    {candidate.fullNameEn.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-white text-sm">{candidate.fullNameEn}</p>
                                  {candidate.fullNameAr && (
                                    <p className="text-xs text-muted-foreground" dir="rtl">{candidate.fullNameAr}</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          )}
                          {col("classification") && (
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`font-medium text-xs border-0 ${
                                  (candidate as any).source === "smp"
                                    ? "bg-violet-500/10 text-violet-400"
                                    : "bg-blue-500/10 text-blue-400"
                                }`}
                                data-testid={`classification-${candidate.id}`}
                              >
                                {(candidate as any).source === "smp" ? "SMP" : "Individual"}
                              </Badge>
                            </TableCell>
                          )}
                          {col("status") && (
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`font-medium border-0 text-xs ${statusStyles[displayStatus] ?? "bg-muted text-muted-foreground"}`}
                                data-testid={`status-${candidate.id}`}
                              >
                                {displayStatus.replace("_", " ")}
                              </Badge>
                            </TableCell>
                          )}
                          {col("phone") && (
                            <TableCell>
                              <span className="text-sm text-muted-foreground font-mono">
                                {candidate.phone || "—"}
                              </span>
                            </TableCell>
                          )}
                          {col("email") && (
                            <TableCell>
                              <span className="text-sm text-muted-foreground truncate max-w-[180px] block">
                                {candidate.email || "—"}
                              </span>
                            </TableCell>
                          )}
                          {col("city") && (
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {candidate.city || "—"}
                              </span>
                            </TableCell>
                          )}
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
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>

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

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Upload Candidates</DialogTitle>
            <DialogDescription>
              Upload an Excel or CSV file to add candidates to the talent pool. Download the template to match the required format.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 justify-start gap-2 h-10 border-dashed"
                onClick={() => downloadTemplate("xlsx")}
                data-testid="button-download-template-xlsx"
              >
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                Download Excel Template
              </Button>
              <Button
                variant="outline"
                className="flex-1 justify-start gap-2 h-10 border-dashed"
                onClick={() => downloadTemplate("csv")}
                data-testid="button-download-template-csv"
              >
                <FileDown className="h-4 w-4 text-muted-foreground" />
                Download CSV Template
              </Button>
            </div>

            <div className="border border-dashed border-border rounded-sm p-6 text-center">
              {!uploadFile ? (
                <label className="cursor-pointer block">
                  <FileUp className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-1">Click to select an Excel or CSV file</p>
                  <p className="text-xs text-muted-foreground/60">Supports .xlsx and .csv · Maximum 70,000 rows</p>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={handleFileSelect}
                    data-testid="input-upload-file"
                  />
                </label>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium text-white">{uploadFile.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => { setUploadFile(null); setUploadPreview(null); setUploadError(null); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {uploadPreview && (
                    <p className="text-xs text-muted-foreground">
                      {uploadPreview.length.toLocaleString()} rows detected
                    </p>
                  )}
                </div>
              )}
            </div>

            {uploadPreview && uploadPreview.length > 0 && (
              <div className="border border-border rounded-sm overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 text-xs text-muted-foreground font-medium">
                  Preview (first 3 rows)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {Object.keys(uploadPreview[0]).slice(0, 5).map(h => (
                          <th key={h} className="text-left px-2 py-1.5 text-muted-foreground font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uploadPreview.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-b border-border/50">
                          {Object.values(row).slice(0, 5).map((val, j) => (
                            <td key={j} className="px-2 py-1.5 text-white">{val || "—"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {uploadError && (
              <p className="text-sm text-red-400">{uploadError}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setUploadOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-primary text-primary-foreground"
                disabled={!uploadPreview || uploadPreview.length === 0 || bulkUpload.isPending}
                onClick={() => uploadPreview && bulkUpload.mutate(uploadPreview)}
                data-testid="button-confirm-upload"
              >
                {bulkUpload.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload {uploadPreview?.length?.toLocaleString() ?? 0} Candidates
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
