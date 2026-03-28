import { useState } from "react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Users,
  UserCheck,
  UserX,
  Briefcase,
  Clock,
  Hash,
  DollarSign,
  Phone,
  CreditCard,
  Calendar,
  History,
  Eye,
  Loader2,
  AlertTriangle,
  XCircle,
  ChevronRight,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

type Employee = {
  id: string;
  employeeNumber: string;
  candidateId: string;
  jobId: string | null;
  eventId: string | null;
  salary: string | null;
  startDate: string;
  endDate: string | null;
  terminationReason: string | null;
  isActive: boolean;
  supervisorId: string | null;
  performanceScore: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  fullNameEn: string | null;
  nationalId: string | null;
  phone: string | null;
  photoUrl: string | null;
  candidateStatus: string | null;
  eventName: string | null;
  jobTitle: string | null;
  iban?: string | null;
};

type WorkHistory = {
  id: string;
  employeeNumber: string;
  salary: string | null;
  startDate: string;
  endDate: string | null;
  terminationReason: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  eventName: string | null;
  jobTitle: string | null;
};

function statusBadge(isActive: boolean) {
  return isActive
    ? { label: "Active", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" }
    : { label: "Terminated", className: "bg-red-500/10 text-red-400 border-red-500/30" };
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  return d.toLocaleDateString("en-SA", { month: "short", day: "numeric", year: "numeric" });
}

function EmployeeDetailDialog({
  employee,
  open,
  onOpenChange,
}: {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"details" | "history">("details");
  const [editSalary, setEditSalary] = useState(false);
  const [salaryValue, setSalaryValue] = useState("");
  const [notesValue, setNotesValue] = useState("");
  const [editNotes, setEditNotes] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [terminateForm, setTerminateForm] = useState({ endDate: "", reason: "" });

  const { data: history = [], isLoading: historyLoading } = useQuery<WorkHistory[]>({
    queryKey: ["/api/workforce/history", employee?.nationalId],
    queryFn: () => apiRequest("GET", `/api/workforce/history/${employee!.nationalId}`).then(r => r.json()),
    enabled: open && !!employee?.nationalId && tab === "history",
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiRequest("PATCH", `/api/workforce/${employee!.id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      setEditSalary(false);
      setEditNotes(false);
      toast({ title: "Employee updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const terminateMutation = useMutation({
    mutationFn: (data: { endDate: string; terminationReason?: string }) =>
      apiRequest("POST", `/api/workforce/${employee!.id}/terminate`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      setTerminateOpen(false);
      setTerminateForm({ endDate: "", reason: "" });
      toast({ title: "Employee terminated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  if (!employee) return null;

  const st = statusBadge(employee.isActive);
  const initials = (employee.fullNameEn ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-3">
              <Avatar className="h-10 w-10 border border-zinc-700">
                <AvatarImage src={employee.photoUrl ?? undefined} />
                <AvatarFallback className="bg-zinc-800 text-zinc-300 text-sm font-bold">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  {employee.fullNameEn ?? "Unknown"}
                  <Badge variant="outline" className={`text-[10px] font-mono ${st.className}`}>{st.label}</Badge>
                </div>
                <div className="text-xs text-zinc-500 font-mono font-normal">{employee.employeeNumber}</div>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Employee details and work history</DialogDescription>
          </DialogHeader>

          <div className="flex rounded-md overflow-hidden border border-zinc-800 bg-zinc-900/50 mt-2">
            <button
              onClick={() => setTab("details")}
              className={`flex-1 text-xs font-semibold py-2.5 transition-colors flex items-center justify-center gap-1.5 ${
                tab === "details" ? "bg-[hsl(155,45%,45%)] text-white" : "text-zinc-400 hover:text-white"
              }`}
              data-testid="tab-employee-details"
            >
              <Eye className="h-3.5 w-3.5" /> Details
            </button>
            <button
              onClick={() => setTab("history")}
              className={`flex-1 text-xs font-semibold py-2.5 transition-colors flex items-center justify-center gap-1.5 ${
                tab === "history" ? "bg-[hsl(155,45%,45%)] text-white" : "text-zinc-400 hover:text-white"
              }`}
              data-testid="tab-employee-history"
            >
              <History className="h-3.5 w-3.5" /> Work History
            </button>
          </div>

          {tab === "details" && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <InfoRow icon={<Hash className="h-3.5 w-3.5" />} label="Employee #" value={employee.employeeNumber} mono />
                <InfoRow icon={<CreditCard className="h-3.5 w-3.5" />} label="National ID" value={employee.nationalId ?? "—"} mono />
                <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={employee.phone ?? "—"} />
                <InfoRow icon={<Briefcase className="h-3.5 w-3.5" />} label="Job Title" value={employee.jobTitle ?? "—"} />
                <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Event" value={employee.eventName ?? "—"} />
                <InfoRow icon={<Clock className="h-3.5 w-3.5" />} label="Start Date" value={formatDate(employee.startDate)} />
                {!employee.isActive && (
                  <>
                    <InfoRow icon={<XCircle className="h-3.5 w-3.5" />} label="End Date" value={formatDate(employee.endDate)} />
                    <InfoRow icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Termination Reason" value={employee.terminationReason ?? "—"} />
                  </>
                )}
              </div>

              <Separator className="bg-zinc-800" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" /> Monthly Salary (SAR)
                  </Label>
                  {employee.isActive && !editSalary && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={() => { setEditSalary(true); setSalaryValue(employee.salary ?? ""); }}>
                      Edit
                    </Button>
                  )}
                </div>
                {editSalary ? (
                  <div className="flex gap-2">
                    <Input
                      data-testid="input-edit-salary"
                      type="number"
                      value={salaryValue}
                      onChange={e => setSalaryValue(e.target.value)}
                      className="bg-zinc-900 border-zinc-700 text-white flex-1"
                      placeholder="e.g. 4500"
                    />
                    <Button
                      size="sm"
                      className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
                      disabled={updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ salary: salaryValue || null })}
                    >
                      {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                    <Button size="sm" variant="outline" className="border-zinc-700" onClick={() => setEditSalary(false)}>Cancel</Button>
                  </div>
                ) : (
                  <p className="text-white font-medium text-lg" data-testid="text-employee-salary">
                    {employee.salary ? `${Number(employee.salary).toLocaleString()} SAR` : "Not set"}
                  </p>
                )}
              </div>

              <Separator className="bg-zinc-800" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Notes</Label>
                  {employee.isActive && !editNotes && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={() => { setEditNotes(true); setNotesValue(employee.notes ?? ""); }}>
                      Edit
                    </Button>
                  )}
                </div>
                {editNotes ? (
                  <div className="space-y-2">
                    <Textarea
                      data-testid="textarea-edit-notes"
                      value={notesValue}
                      onChange={e => setNotesValue(e.target.value)}
                      className="bg-zinc-900 border-zinc-700 text-white resize-none"
                      rows={3}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" className="border-zinc-700" onClick={() => setEditNotes(false)}>Cancel</Button>
                      <Button
                        size="sm"
                        className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
                        disabled={updateMutation.isPending}
                        onClick={() => updateMutation.mutate({ notes: notesValue || null })}
                      >
                        {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-zinc-300 text-sm">{employee.notes || "No notes"}</p>
                )}
              </div>

              {employee.isActive && (
                <>
                  <Separator className="bg-zinc-800" />
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      className="border-red-800 text-red-400 hover:bg-red-950/30 hover:text-red-300 gap-1.5"
                      onClick={() => setTerminateOpen(true)}
                      data-testid="button-terminate-employee"
                    >
                      <UserX className="h-4 w-4" /> Terminate Employee
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "history" && (
            <div className="mt-2">
              {historyLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No work history found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                    Employment Records ({history.length})
                  </p>
                  {history.map((h, idx) => (
                    <div
                      key={h.id}
                      className={`border rounded-lg p-4 space-y-2 ${
                        h.isActive ? "border-emerald-800/50 bg-emerald-950/10" : "border-zinc-800 bg-zinc-900/30"
                      }`}
                      data-testid={`history-record-${idx}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-zinc-400">{h.employeeNumber}</code>
                          <Badge variant="outline" className={h.isActive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]" : "bg-red-500/10 text-red-400 border-red-500/30 text-[10px]"}>
                            {h.isActive ? "Active" : "Terminated"}
                          </Badge>
                        </div>
                        {h.salary && <span className="text-sm text-zinc-300 font-medium">{Number(h.salary).toLocaleString()} SAR</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-zinc-500 text-xs">Event</span>
                          <p className="text-zinc-200">{h.eventName ?? "—"}</p>
                        </div>
                        <div>
                          <span className="text-zinc-500 text-xs">Job Title</span>
                          <p className="text-zinc-200">{h.jobTitle ?? "—"}</p>
                        </div>
                        <div>
                          <span className="text-zinc-500 text-xs">Start</span>
                          <p className="text-zinc-200">{formatDate(h.startDate)}</p>
                        </div>
                        <div>
                          <span className="text-zinc-500 text-xs">End</span>
                          <p className="text-zinc-200">{formatDate(h.endDate)}</p>
                        </div>
                      </div>
                      {h.terminationReason && (
                        <div className="text-xs text-red-400/80 flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3" /> {h.terminationReason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={terminateOpen} onOpenChange={setTerminateOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-2 text-red-400">
              <UserX className="h-5 w-5" />
              Terminate Employee
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              This will mark {employee.fullNameEn ?? "this employee"} ({employee.employeeNumber}) as terminated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="bg-red-950/20 border border-red-800/40 rounded-lg p-3 text-sm text-red-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              This action cannot be undone. The employee's record will be preserved in work history.
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-sm">End Date <span className="text-red-400">*</span></Label>
              <DatePickerField
                data-testid="input-terminate-enddate"
                value={terminateForm.endDate}
                onChange={v => setTerminateForm(f => ({ ...f, endDate: v }))}
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-sm">Reason</Label>
              <Textarea
                data-testid="textarea-terminate-reason"
                value={terminateForm.reason}
                onChange={e => setTerminateForm(f => ({ ...f, reason: e.target.value }))}
                className="bg-zinc-900 border-zinc-700 text-white resize-none"
                rows={2}
                placeholder="e.g. End of season, Performance, Resignation..."
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setTerminateOpen(false)}>Cancel</Button>
              <Button
                data-testid="button-confirm-terminate"
                disabled={!terminateForm.endDate || terminateMutation.isPending}
                onClick={() => terminateMutation.mutate({ endDate: terminateForm.endDate, terminationReason: terminateForm.reason || undefined })}
                className="bg-red-600 hover:bg-red-700 text-white gap-2"
              >
                {terminateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserX className="h-4 w-4" /> Confirm Termination</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InfoRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-zinc-900/50 rounded-md p-3 border border-zinc-800/50">
      <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] uppercase tracking-wider font-semibold mb-1">
        {icon} {label}
      </div>
      <p className={`text-white text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

export default function WorkforcePage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "terminated">("all");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/workforce", search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter === "active") params.set("isActive", "true");
      if (statusFilter === "terminated") params.set("isActive", "false");
      return apiRequest("GET", `/api/workforce?${params}`).then(r => r.json());
    },
    refetchInterval: 15000,
  });

  const { data: stats } = useQuery<{ total: number; active: number; terminated: number }>({
    queryKey: ["/api/workforce/stats"],
    queryFn: () => apiRequest("GET", "/api/workforce/stats").then(r => r.json()),
    refetchInterval: 15000,
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight" data-testid="text-page-title">Employee Management</h1>
            <p className="text-muted-foreground mt-1">Manage seasonal and permanent employees across events.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Employees</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-employees">{stats?.total ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">All-time employee records</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-emerald-400" data-testid="stat-active-employees">{stats?.active ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Currently employed</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Terminated</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-red-400" data-testid="stat-terminated-employees">{stats?.terminated ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Past employees</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by name, national ID, or employee number…"
              className="pl-10 h-12 bg-muted/30 border-border focus-visible:ring-primary/20 text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-employees"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-full md:w-[180px] h-12 bg-background border-border" data-testid="select-status-filter">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="terminated">Terminated Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-display text-white">
              Employee List
              <span className="ml-2 text-sm font-normal text-muted-foreground">({employees.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : employees.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Users className="h-12 w-12 text-muted-foreground/20 mb-4" />
                <p className="text-muted-foreground">No employees found</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Employees appear here after conversion from Onboarding.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-[100px] text-muted-foreground pl-6">Emp #</TableHead>
                    <TableHead className="text-muted-foreground">Employee</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">National ID</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">Job / Event</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell text-right">Salary</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">Start Date</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-right text-muted-foreground pr-6">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((emp) => {
                    const st = statusBadge(emp.isActive);
                    const initials = (emp.fullNameEn ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                    return (
                      <TableRow
                        key={emp.id}
                        className="border-border hover:bg-muted/20 cursor-pointer"
                        onClick={() => setSelectedEmployee(emp)}
                        data-testid={`row-employee-${emp.employeeNumber}`}
                      >
                        <TableCell className="font-mono text-xs text-primary font-semibold pl-6" data-testid={`text-empnum-${emp.id}`}>
                          {emp.employeeNumber}
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 border border-zinc-700">
                              <AvatarImage src={emp.photoUrl ?? undefined} />
                              <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xs">{initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-white text-sm">{emp.fullNameEn ?? "—"}</div>
                              <div className="text-xs text-muted-foreground">{emp.phone ?? "—"}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell font-mono text-xs text-zinc-400">
                          {emp.nationalId ?? "—"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="space-y-0.5">
                            <div className="text-sm text-white">{emp.jobTitle ?? "—"}</div>
                            {emp.eventName && <div className="text-xs text-primary/70">{emp.eventName}</div>}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-right text-sm text-white font-medium">
                          {emp.salary ? `${Number(emp.salary).toLocaleString()}` : "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-zinc-400">
                          {formatDate(emp.startDate)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] font-medium border ${st.className}`} data-testid={`badge-status-${emp.id}`}>
                            {st.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-white"
                            data-testid={`button-view-${emp.id}`}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <EmployeeDetailDialog
        employee={selectedEmployee}
        open={!!selectedEmployee}
        onOpenChange={(o) => !o && setSelectedEmployee(null)}
      />
    </DashboardLayout>
  );
}
