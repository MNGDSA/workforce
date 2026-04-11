import { useState, useMemo, useCallback } from "react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
  FileText,
  Printer,
  Upload,
  CheckCircle2,
  X,
  AlertCircle,
  Mail,
  MapPin,
  GraduationCap,
  Heart,
  Globe,
  User,
  Building,
  ShieldAlert,
  Languages,
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
import {
  renderIdCardHTML,
  sendPrintJob,
  type IdCardTemplateConfig,
  type EmployeeCardData,
  type PrinterPluginConfig,
} from "@/lib/id-card-renderer";

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
  ibanBankName?: string | null;
  ibanBankCode?: string | null;
  employmentType?: string | null;
  smpCompanyId?: string | null;
  smpCompanyName?: string | null;
  fullNameAr?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  nationalityText?: string | null;
  maritalStatus?: string | null;
  city?: string | null;
  region?: string | null;
  iqamaNumber?: string | null;
  educationLevel?: string | null;
  university?: string | null;
  major?: string | null;
  skills?: string[] | null;
  languages?: string[] | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  ibanAccountFirstName?: string | null;
  ibanAccountLastName?: string | null;
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

type SortField = "employeeNumber" | "fullNameEn" | "nationalId" | "salary" | "startDate" | "endDate" | "phone";
type SortDir = "asc" | "desc";

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

function exportToCSV(employees: Employee[]) {
  const headers = ["Employee #", "Full Name", "National ID", "Phone", "Job Title", "Event", "Salary (SAR)", "IBAN", "Bank Name", "Bank Code", "Start Date", "End Date", "Status", "Termination Reason"];
  const rows = employees.map(e => [
    e.employeeNumber,
    e.fullNameEn ?? "",
    e.nationalId ?? "",
    e.phone ?? "",
    e.jobTitle ?? "",
    e.eventName ?? "",
    e.salary ? Number(e.salary).toString() : "",
    e.iban ?? "",
    e.ibanBankName ?? "",
    e.ibanBankCode ?? "",
    e.startDate ?? "",
    e.endDate ?? "",
    e.isActive ? "Active" : "Terminated",
    e.terminationReason ?? "",
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${(c ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `employees_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportToExcel(employees: Employee[]) {
  const XLSX = await import("xlsx");
  const data = employees.map(e => ({
    "Employee #": e.employeeNumber,
    "Full Name": e.fullNameEn ?? "",
    "National ID": e.nationalId ?? "",
    "Phone": e.phone ?? "",
    "Job Title": e.jobTitle ?? "",
    "Event": e.eventName ?? "",
    "Salary (SAR)": e.salary ? Number(e.salary) : "",
    "IBAN": e.iban ?? "",
    "Bank Name": e.ibanBankName ?? "",
    "Bank Code": e.ibanBankCode ?? "",
    "Start Date": e.startDate ?? "",
    "End Date": e.endDate ?? "",
    "Status": e.isActive ? "Active" : "Terminated",
    "Termination Reason": e.terminationReason ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  XLSX.writeFile(wb, `employees_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function SortableHeader({ label, field, sortField, sortDir, onSort }: {
  label: string; field: SortField; sortField: SortField | null; sortDir: SortDir; onSort: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <button
      className="flex items-center gap-1 hover:text-white transition-colors text-left"
      onClick={() => onSort(field)}
      data-testid={`sort-${field}`}
    >
      {label}
      {active ? (
        sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

type ScheduleTemplateWithDays = { id: string; name: string; mondayShiftId?: string | null; tuesdayShiftId?: string | null; wednesdayShiftId?: string | null; thursdayShiftId?: string | null; fridayShiftId?: string | null; saturdayShiftId?: string | null; sundayShiftId?: string | null };
type ShiftBasic = { id: string; name: string; color: string; startTime: string; endTime: string };

function ActiveAssignmentCard({
  activeAssignment,
  scheduleTemplates,
  allShifts,
  endAssignmentMutation,
  formatDate,
}: {
  activeAssignment: { id: string; templateId: string; startDate: string };
  scheduleTemplates: ScheduleTemplateWithDays[];
  allShifts: ShiftBasic[];
  endAssignmentMutation: { isPending: boolean; mutate: (id: string) => void };
  formatDate: (d: string) => string;
}) {
  const template = scheduleTemplates.find(t => t.id === activeAssignment.templateId);
  const DAY_KEYS = ["sundayShiftId", "mondayShiftId", "tuesdayShiftId", "wednesdayShiftId", "thursdayShiftId", "fridayShiftId", "saturdayShiftId"] as const;
  const todayKey = DAY_KEYS[new Date().getDay()] as keyof ScheduleTemplateWithDays;
  const todayShiftId = template ? (template[todayKey] as string | null | undefined) : undefined;
  const todayShift = todayShiftId ? allShifts.find(s => s.id === todayShiftId) : undefined;
  return (
    <div className="border border-emerald-800/50 bg-emerald-950/10 rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-white text-sm">{template?.name ?? "Unknown Template"}</p>
          <p className="text-xs text-zinc-400 mt-0.5">Since {formatDate(activeAssignment.startDate)}</p>
          {todayShift ? (
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: todayShift.color }} />
              <span className="text-xs text-zinc-300">
                Today: <span className="font-medium text-white">{todayShift.name}</span>
                <span className="text-zinc-500 ml-1">({todayShift.startTime}–{todayShift.endTime})</span>
              </span>
            </div>
          ) : template ? (
            <p className="text-xs text-zinc-500 mt-1">Today: Day off</p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-red-400 hover:text-red-300"
          disabled={endAssignmentMutation.isPending}
          onClick={() => endAssignmentMutation.mutate(activeAssignment.id)}
          data-testid="button-end-schedule-assignment"
        >
          {endAssignmentMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Remove"}
        </Button>
      </div>
    </div>
  );
}

function EmployeeDetailDialog({
  employee,
  open,
  onOpenChange,
  onUpdated,
  onPrintCard,
}: {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpdated: () => void;
  onPrintCard?: (emp: Employee) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"details" | "history" | "schedule">("details");
  const [editSalary, setEditSalary] = useState(false);
  const [salaryValue, setSalaryValue] = useState("");
  const [notesValue, setNotesValue] = useState("");
  const [editNotes, setEditNotes] = useState(false);
  const [editEvent, setEditEvent] = useState(false);
  const [eventValue, setEventValue] = useState("");
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [terminateForm, setTerminateForm] = useState({ endDate: "", reason: "" });
  const [reinstateOpen, setReinstateOpen] = useState(false);
  const [reinstateForm, setReinstateForm] = useState({ startDate: "", eventId: "", salary: "", smpCompanyId: "" });
  const [assignScheduleOpen, setAssignScheduleOpen] = useState(false);
  const [scheduleTemplateId, setScheduleTemplateId] = useState("");
  const [scheduleStartDate, setScheduleStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [scheduleEndDate, setScheduleEndDate] = useState("");

  const { data: history = [], isLoading: historyLoading } = useQuery<WorkHistory[]>({
    queryKey: ["/api/workforce/history", employee?.nationalId],
    queryFn: () => apiRequest("GET", `/api/workforce/history/${employee!.nationalId}`).then(r => r.json()),
    enabled: open && !!employee?.nationalId && tab === "history",
  });

  const { data: eventsList = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/events"],
    queryFn: () => apiRequest("GET", "/api/events").then(r => r.json()),
    enabled: open,
  });

  const { data: scheduleTemplates = [] } = useQuery<ScheduleTemplateWithDays[]>({
    queryKey: ["/api/schedule-templates"],
    queryFn: () => apiRequest("GET", "/api/schedule-templates").then(r => r.json()),
    enabled: open && tab === "schedule",
  });

  const { data: allShifts = [] } = useQuery<ShiftBasic[]>({
    queryKey: ["/api/shifts"],
    queryFn: () => apiRequest("GET", "/api/shifts").then(r => r.json()),
    enabled: open && tab === "schedule",
  });

  const { data: activeAssignment, refetch: refetchAssignment } = useQuery<{
    id: string; templateId: string; startDate: string; endDate: string | null; notes: string | null;
  } | null>({
    queryKey: ["/api/schedule-assignments/employee", employee?.id, "active"],
    queryFn: () => apiRequest("GET", `/api/schedule-assignments/employee/${employee!.id}/active`).then(r => r.json()),
    enabled: open && !!employee?.id && tab === "schedule",
  });

  const { data: assignmentHistory = [] } = useQuery<{ id: string; templateId: string; startDate: string; endDate: string | null }[]>({
    queryKey: ["/api/schedule-assignments/employee", employee?.id],
    queryFn: () => apiRequest("GET", `/api/schedule-assignments/employee/${employee!.id}`).then(r => r.json()),
    enabled: open && !!employee?.id && tab === "schedule",
  });

  const assignScheduleMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/schedule-assignments", {
      workforceId: employee!.id,
      templateId: scheduleTemplateId,
      startDate: scheduleStartDate,
      endDate: scheduleEndDate || null,
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/schedule-assignments/employee", employee?.id] });
      refetchAssignment();
      setAssignScheduleOpen(false);
      toast({ title: "Schedule assigned" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const endAssignmentMutation = useMutation({
    mutationFn: (assignId: string) => apiRequest("POST", `/api/schedule-assignments/${assignId}/end`, {
      endDate: new Date().toISOString().slice(0, 10),
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/schedule-assignments/employee", employee?.id] });
      refetchAssignment();
      toast({ title: "Schedule assignment ended" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiRequest("PATCH", `/api/workforce/${employee!.id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      setEditSalary(false);
      setEditNotes(false);
      onUpdated();
      toast({ title: "Employee updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const terminateMutation = useMutation({
    mutationFn: (data: { endDate: string; terminationReason?: string }) =>
      apiRequest("POST", `/api/workforce/${employee!.id}/terminate`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      setTerminateOpen(false);
      setTerminateForm({ endDate: "", reason: "" });
      onOpenChange(false);
      onUpdated();
      toast({ title: "Employee terminated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const { data: smpCompanies = [] } = useQuery<{ id: string; name: string; isActive: boolean }[]>({
    queryKey: ["/api/smp-companies"],
    queryFn: () => apiRequest("GET", "/api/smp-companies").then(r => r.json()),
    select: (data: { id: string; name: string; isActive: boolean }[]) => data.filter(c => c.isActive),
    enabled: open,
  });

  const reinstateMutation = useMutation({
    mutationFn: (data: { nationalId: string; startDate: string; eventId?: string; salary?: string; smpCompanyId?: string; employmentType?: string }) =>
      apiRequest("POST", "/api/workforce/reinstate", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      setReinstateOpen(false);
      setReinstateForm({ startDate: "", eventId: "", salary: "", smpCompanyId: "" });
      onOpenChange(false);
      onUpdated();
      toast({ title: "Employee reinstated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
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
            <button
              onClick={() => setTab("schedule")}
              className={`flex-1 text-xs font-semibold py-2.5 transition-colors flex items-center justify-center gap-1.5 ${
                tab === "schedule" ? "bg-[hsl(155,45%,45%)] text-white" : "text-zinc-400 hover:text-white"
              }`}
              data-testid="tab-employee-schedule"
            >
              <Clock className="h-3.5 w-3.5" /> Schedule
            </button>
          </div>

          {tab === "details" && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <InfoRow icon={<Hash className="h-3.5 w-3.5" />} label="Employee #" value={employee.employeeNumber} mono />
                <InfoRow icon={<CreditCard className="h-3.5 w-3.5" />} label="National ID" value={employee.nationalId ?? "—"} mono />
                <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={employee.phone ?? "—"} />
                <InfoRow icon={<Briefcase className="h-3.5 w-3.5" />} label="Job Title" value={employee.jobTitle ?? "—"} />
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> Event</span>
                    {employee.isActive && !editEvent && (
                      <Button variant="ghost" size="sm" className="h-5 text-[11px] text-primary px-1" onClick={() => { setEditEvent(true); setEventValue(employee.eventId ?? ""); }}>
                        {employee.eventId ? "Change" : "Assign"}
                      </Button>
                    )}
                  </div>
                  {editEvent ? (
                    <div className="flex gap-2">
                      <Select value={eventValue} onValueChange={setEventValue}>
                        <SelectTrigger data-testid="select-employee-event" className="bg-zinc-900 border-zinc-700 text-white h-8 text-sm flex-1">
                          <SelectValue placeholder="Select event…" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                          {eventsList.map(ev => (
                            <SelectItem key={ev.id} value={ev.id} className="text-white focus:bg-zinc-800">{ev.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="h-8 bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white" disabled={updateMutation.isPending || !eventValue} onClick={() => updateMutation.mutate({ eventId: eventValue }, { onSuccess: () => setEditEvent(false) })}>
                        {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 border-zinc-700" onClick={() => setEditEvent(false)}>Cancel</Button>
                    </div>
                  ) : (
                    <p className="text-white text-sm" data-testid="text-employee-event">
                      {employee.eventName ?? <span className="text-amber-400 text-xs italic">⚠ No event assigned</span>}
                    </p>
                  )}
                </div>
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
                      onClick={() => updateMutation.mutate({ salary: salaryValue || undefined })}
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
                        onClick={() => updateMutation.mutate({ notes: notesValue || undefined })}
                      >
                        {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-zinc-300 text-sm">{employee.notes || "No notes"}</p>
                )}
              </div>

              <Separator className="bg-zinc-800" />
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <User className="h-3.5 w-3.5" /> Personal Information
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  {employee.fullNameAr && <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Arabic Name" value={employee.fullNameAr} />}
                  {employee.email && <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={employee.email} />}
                  {employee.dateOfBirth && <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Date of Birth" value={formatDate(employee.dateOfBirth)} />}
                  {employee.gender && <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Gender" value={employee.gender.charAt(0).toUpperCase() + employee.gender.slice(1)} />}
                  {employee.nationalityText && <InfoRow icon={<Globe className="h-3.5 w-3.5" />} label="Nationality" value={employee.nationalityText} />}
                  {employee.maritalStatus && <InfoRow icon={<Heart className="h-3.5 w-3.5" />} label="Marital Status" value={employee.maritalStatus.charAt(0).toUpperCase() + employee.maritalStatus.slice(1)} />}
                  {employee.iqamaNumber && <InfoRow icon={<CreditCard className="h-3.5 w-3.5" />} label="Iqama #" value={employee.iqamaNumber} mono />}
                  {(employee.city || employee.region) && <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Location" value={[employee.city, employee.region].filter(Boolean).join(", ")} />}
                </div>
              </div>

              {(employee.educationLevel || employee.skills?.length || employee.languages?.length) && (
                <>
                  <Separator className="bg-zinc-800" />
                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider flex items-center gap-1.5 mb-3">
                      <GraduationCap className="h-3.5 w-3.5" /> Education & Skills
                    </Label>
                    <div className="grid grid-cols-2 gap-4">
                      {employee.educationLevel && <InfoRow icon={<GraduationCap className="h-3.5 w-3.5" />} label="Education" value={employee.educationLevel} />}
                      {employee.university && <InfoRow icon={<Building className="h-3.5 w-3.5" />} label="University" value={employee.university} />}
                      {employee.major && <InfoRow icon={<GraduationCap className="h-3.5 w-3.5" />} label="Major" value={employee.major} />}
                    </div>
                    {employee.skills && employee.skills.length > 0 && (
                      <div className="mt-3">
                        <span className="text-zinc-500 text-xs">Skills</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {employee.skills.map((s, i) => (
                            <span key={i} className="bg-zinc-800 text-zinc-300 text-xs px-2 py-0.5 rounded">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {employee.languages && employee.languages.length > 0 && (
                      <div className="mt-3">
                        <span className="text-zinc-500 text-xs">Languages</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {employee.languages.map((l, i) => (
                            <span key={i} className="bg-zinc-800 text-zinc-300 text-xs px-2 py-0.5 rounded">{l}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {(employee.iban || employee.ibanBankName) && (
                <>
                  <Separator className="bg-zinc-800" />
                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider flex items-center gap-1.5 mb-3">
                      <CreditCard className="h-3.5 w-3.5" /> Financial Information
                    </Label>
                    <div className="grid grid-cols-2 gap-4">
                      {employee.iban && <InfoRow icon={<CreditCard className="h-3.5 w-3.5" />} label="IBAN" value={employee.iban} mono />}
                      {employee.ibanBankName && <InfoRow icon={<Building className="h-3.5 w-3.5" />} label="Bank Name" value={employee.ibanBankName} />}
                      {employee.ibanBankCode && <InfoRow icon={<Hash className="h-3.5 w-3.5" />} label="Bank Code" value={employee.ibanBankCode} mono />}
                      {employee.ibanAccountFirstName && <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Account Holder" value={`${employee.ibanAccountFirstName} ${employee.ibanAccountLastName ?? ""}`.trim()} />}
                    </div>
                  </div>
                </>
              )}

              {(employee.emergencyContactName || employee.emergencyContactPhone) && (
                <>
                  <Separator className="bg-zinc-800" />
                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider flex items-center gap-1.5 mb-3">
                      <ShieldAlert className="h-3.5 w-3.5" /> Emergency Contact
                    </Label>
                    <div className="grid grid-cols-2 gap-4">
                      {employee.emergencyContactName && <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Contact Name" value={employee.emergencyContactName} />}
                      {employee.emergencyContactPhone && <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Contact Phone" value={employee.emergencyContactPhone} />}
                    </div>
                  </div>
                </>
              )}

              <>
                <Separator className="bg-zinc-800" />
                <div className="flex justify-end gap-2 flex-wrap">
                  {employee.isActive && (
                    <Button
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => {
                        if (employee && onPrintCard) {
                          onPrintCard(employee);
                        }
                      }}
                      data-testid="button-print-id-card"
                    >
                      <Printer className="h-4 w-4" /> Print ID Card
                    </Button>
                  )}
                  {employee.isActive ? (
                    <Button
                      variant="outline"
                      className="border-red-800 text-red-400 hover:bg-red-950/30 hover:text-red-300 gap-1.5"
                      onClick={() => setTerminateOpen(true)}
                      data-testid="button-terminate-employee"
                    >
                      <UserX className="h-4 w-4" /> Terminate Employee
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="border-emerald-800 text-emerald-400 hover:bg-emerald-950/30 hover:text-emerald-300 gap-1.5"
                      onClick={() => {
                        setReinstateForm({ startDate: "", eventId: "", salary: employee.salary ?? "", smpCompanyId: employee.smpCompanyId ?? "" });
                        setReinstateOpen(true);
                      }}
                      data-testid="button-reinstate-employee"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Reinstate Employee
                    </Button>
                  )}
                </div>
              </>
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

          {tab === "schedule" && (
            <div className="space-y-4 mt-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Current Schedule</p>
                {employee.isActive && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-zinc-700"
                    onClick={() => setAssignScheduleOpen(true)}
                    data-testid="button-assign-schedule-employee"
                  >
                    <Clock className="h-3.5 w-3.5 mr-1" />
                    {activeAssignment ? "Reassign" : "Assign Schedule"}
                  </Button>
                )}
              </div>
              {activeAssignment ? (
                <ActiveAssignmentCard
                  activeAssignment={activeAssignment}
                  scheduleTemplates={scheduleTemplates}
                  allShifts={allShifts}
                  endAssignmentMutation={endAssignmentMutation}
                  formatDate={formatDate}
                />
              ) : (
                <div className="border border-zinc-800 rounded-lg p-4 text-center text-zinc-500 text-sm">
                  No schedule assigned
                </div>
              )}

              {assignmentHistory.length > 1 && (
                <>
                  <Separator className="bg-zinc-800" />
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Assignment History</p>
                  <div className="space-y-2">
                    {assignmentHistory.filter(a => a.endDate != null || a.id !== activeAssignment?.id).map(a => (
                      <div key={a.id} className="flex items-center justify-between text-xs border border-zinc-800 rounded p-3">
                        <span className="text-zinc-300">
                          {scheduleTemplates.find(t => t.id === a.templateId)?.name ?? a.templateId}
                        </span>
                        <span className="text-zinc-500">
                          {formatDate(a.startDate)} – {a.endDate ? formatDate(a.endDate) : "Active"}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={assignScheduleOpen} onOpenChange={setAssignScheduleOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>{activeAssignment ? "Reassign Schedule" : "Assign Schedule"}</DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              {activeAssignment ? "This will end the current assignment and start a new one." : "Choose a schedule template for this employee."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Template</Label>
              <Select value={scheduleTemplateId} onValueChange={setScheduleTemplateId}>
                <SelectTrigger data-testid="select-schedule-template" className="bg-zinc-900 border-zinc-700 text-white">
                  <SelectValue placeholder="Select template..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {scheduleTemplates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Start Date</Label>
              <Input
                data-testid="input-schedule-start-date"
                type="date"
                value={scheduleStartDate}
                onChange={e => setScheduleStartDate(e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">End Date <span className="text-zinc-600 text-xs font-normal normal-case">(optional)</span></Label>
              <Input
                data-testid="input-schedule-end-date"
                type="date"
                value={scheduleEndDate}
                min={scheduleStartDate}
                onChange={e => setScheduleEndDate(e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" className="border-zinc-700" onClick={() => setAssignScheduleOpen(false)}>Cancel</Button>
            <Button
              data-testid="button-confirm-assign-schedule"
              className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
              disabled={!scheduleTemplateId || assignScheduleMutation.isPending}
              onClick={() => assignScheduleMutation.mutate()}
            >
              {assignScheduleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Assign
            </Button>
          </div>
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

      <Dialog open={reinstateOpen} onOpenChange={setReinstateOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              Reinstate Employee
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              Re-activate {employee.fullNameEn ?? "this employee"} ({employee.employeeNumber}) with a new employment period.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-sm">Start Date <span className="text-red-400">*</span></Label>
              <DatePickerField
                data-testid="input-reinstate-startdate"
                value={reinstateForm.startDate}
                onChange={v => setReinstateForm(f => ({ ...f, startDate: v }))}
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-sm">Event</Label>
              <Select value={reinstateForm.eventId} onValueChange={v => setReinstateForm(f => ({ ...f, eventId: v }))}>
                <SelectTrigger data-testid="select-reinstate-event" className="bg-zinc-900 border-zinc-700 text-white">
                  <SelectValue placeholder="Select event…" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                  {eventsList.map(ev => (
                    <SelectItem key={ev.id} value={ev.id} className="text-white focus:bg-zinc-800">{ev.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {employee.employmentType === "smp" && (
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-sm">SMP Company <span className="text-red-400">*</span></Label>
                <select
                  data-testid="select-reinstate-smp-company"
                  value={reinstateForm.smpCompanyId}
                  onChange={e => setReinstateForm(f => ({ ...f, smpCompanyId: e.target.value }))}
                  className="w-full h-10 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
                >
                  <option value="" className="bg-zinc-900 text-zinc-400">— Select SMP company —</option>
                  {smpCompanies.map(c => (
                    <option key={c.id} value={c.id} className="bg-zinc-900 text-white">{c.name}</option>
                  ))}
                </select>
                <p className="text-[11px] text-red-400/70">Required — SMP workers must be linked to a company.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-sm">Monthly Salary (SAR)</Label>
              <Input
                data-testid="input-reinstate-salary"
                type="number"
                placeholder="e.g. 4500"
                value={reinstateForm.salary}
                onChange={e => setReinstateForm(f => ({ ...f, salary: e.target.value }))}
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setReinstateOpen(false)}>Cancel</Button>
              <Button
                data-testid="button-confirm-reinstate"
                disabled={
                  !reinstateForm.startDate ||
                  (employee.employmentType === "smp" && !reinstateForm.smpCompanyId) ||
                  reinstateMutation.isPending
                }
                onClick={() => {
                  if (!employee.nationalId) return;
                  reinstateMutation.mutate({
                    nationalId: employee.nationalId,
                    startDate: reinstateForm.startDate,
                    eventId: reinstateForm.eventId || undefined,
                    salary: reinstateForm.salary || undefined,
                    smpCompanyId: reinstateForm.smpCompanyId || undefined,
                    employmentType: employee.employmentType ?? undefined,
                  });
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                {reinstateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Confirm Reinstate</>}
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

function employeeToCardData(emp: Employee): EmployeeCardData {
  return {
    fullName: emp.fullNameEn ?? "Unknown",
    photoUrl: emp.photoUrl,
    employeeNumber: emp.employeeNumber,
    nationalId: emp.nationalId,
    position: emp.jobTitle,
    eventName: emp.eventName,
    phone: emp.phone,
  };
}

export default function WorkforcePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "terminated">("active");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [printingIds, setPrintingIds] = useState<Set<string>>(new Set());
  const [printProgress, setPrintProgress] = useState<{ total: number; done: number } | null>(null);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [bulkUpdateFile, setBulkUpdateFile] = useState<File | null>(null);
  const [bulkUpdateLoading, setBulkUpdateLoading] = useState(false);
  const [bulkUpdateResult, setBulkUpdateResult] = useState<{
    updated: number; skipped: number; total: number;
    errors: { employeeNumber: string; reason: string }[];
  } | null>(null);

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

  const { data: allEventsForBulk = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/events"],
    queryFn: () => apiRequest("GET", "/api/events").then(r => r.json()),
  });

  const { data: allSmpCompaniesForBulk = [] } = useQuery<{ id: string; name: string; isActive: boolean }[]>({
    queryKey: ["/api/smp-companies"],
    queryFn: () => apiRequest("GET", "/api/smp-companies").then(r => r.json()),
  });

  async function downloadBulkTemplate() {
    const XLSX = await import("xlsx");
    const source = employees.length > 0 ? employees : [];
    const rows = source.map(e => ({
      "Employee #": e.employeeNumber,
      "Full Name": e.fullNameEn ?? "",
      "National ID/Iqama (read-only)": e.nationalId ?? "",
      "Phone (read-only)": e.phone ?? "",
      "Salary (SAR)": e.salary ? Number(e.salary) : "",
      "Start Date": e.startDate ?? "",
      "Event": e.eventName ?? "",
      "SMP Company Name": e.employmentType === "smp" ? (e.smpCompanyName ?? "") : "",
      "Notes": "",
    }));
    if (rows.length === 0) {
      rows.push({ "Employee #": "C000001", "Full Name": "Example Name", "National ID/Iqama (read-only)": "1000000000", "Phone (read-only)": "0500000000", "Salary (SAR)": 4000, "Start Date": "2026-01-01", "Event": "", "SMP Company Name": "", "Notes": "" });
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    // Set column widths
    ws["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 28 }, { wch: 32 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    // Add Events reference sheet
    if (allEventsForBulk.length > 0) {
      const evSheet = XLSX.utils.json_to_sheet(allEventsForBulk.map(ev => ({ "Event Name": ev.name })));
      XLSX.utils.book_append_sheet(wb, evSheet, "Events (Reference)");
    }
    // Add SMP Companies reference sheet
    if (allSmpCompaniesForBulk.length > 0) {
      const smpSheet = XLSX.utils.json_to_sheet(allSmpCompaniesForBulk.map(c => ({ "Company Name": c.name, "Active": c.isActive ? "Yes" : "No" })));
      XLSX.utils.book_append_sheet(wb, smpSheet, "SMP Companies (Reference)");
    }
    XLSX.writeFile(wb, `workforce_bulk_update_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Template downloaded", description: "Edit the file and upload it back to apply updates." });
  }

  async function handleBulkUpdateSubmit() {
    if (!bulkUpdateFile) return;
    setBulkUpdateLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", bulkUpdateFile);
      const res = await fetch("/api/workforce/bulk-update", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Upload failed");
      setBulkUpdateResult(data);
      qc.invalidateQueries({ queryKey: ["/api/workforce"] });
      qc.invalidateQueries({ queryKey: ["/api/workforce/stats"] });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setBulkUpdateLoading(false);
    }
  }

  const employeeIds = useMemo(() => employees.map(e => e.id), [employees]);
  const { data: lastPrintDates = {} } = useQuery<Record<string, string | null>>({
    queryKey: ["/api/workforce/last-printed-bulk", employeeIds],
    queryFn: () =>
      employeeIds.length > 0
        ? apiRequest("POST", "/api/workforce/last-printed-bulk", { employeeIds }).then(r => r.json())
        : Promise.resolve({}),
    enabled: employeeIds.length > 0,
    refetchInterval: 30000,
  });

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }, [sortField]);

  const sortedEmployees = useMemo(() => {
    if (!sortField) return employees;
    return [...employees].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      switch (sortField) {
        case "employeeNumber": aVal = a.employeeNumber; bVal = b.employeeNumber; break;
        case "fullNameEn": aVal = (a.fullNameEn ?? "").toLowerCase(); bVal = (b.fullNameEn ?? "").toLowerCase(); break;
        case "nationalId": aVal = a.nationalId ?? ""; bVal = b.nationalId ?? ""; break;
        case "phone": aVal = a.phone ?? ""; bVal = b.phone ?? ""; break;
        case "salary": aVal = Number(a.salary ?? 0); bVal = Number(b.salary ?? 0); break;
        case "startDate": aVal = a.startDate ?? ""; bVal = b.startDate ?? ""; break;
        case "endDate": aVal = a.endDate ?? ""; bVal = b.endDate ?? ""; break;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [employees, sortField, sortDir]);

  const allSelected = sortedEmployees.length > 0 && selectedIds.size === sortedEmployees.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedEmployees.map(e => e.id)));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const selectedEmployees = sortedEmployees.filter(e => selectedIds.has(e.id));
  const showTerminated = statusFilter === "terminated" || statusFilter === "all";

  function handleExportCSV() {
    const data = selectedIds.size > 0 ? selectedEmployees : sortedEmployees;
    exportToCSV(data);
    toast({ title: `Exported ${data.length} employees to CSV` });
  }

  async function handleExportExcel() {
    const data = selectedIds.size > 0 ? selectedEmployees : sortedEmployees;
    await exportToExcel(data);
    toast({ title: `Exported ${data.length} employees to Excel` });
  }

  async function handlePrintIdCards(emps: Employee[]) {
    if (emps.length === 0) return;
    const ids = new Set(emps.map((e) => e.id));
    setPrintingIds(ids);
    setPrintProgress({ total: emps.length, done: 0 });
    try {
      const eventId = emps[0]?.eventId;
      const templateUrl = eventId
        ? `/api/id-card-templates/active?eventId=${encodeURIComponent(eventId)}`
        : "/api/id-card-templates/active";
      let templateRes: Record<string, unknown> | null = null;
      try {
        templateRes = await apiRequest("GET", templateUrl).then((r) => r.json());
      } catch {
        templateRes = null;
      }
      const lc = (templateRes?.layoutConfig as Record<string, unknown>) ?? {};
      const templateConfig: IdCardTemplateConfig = templateRes
        ? {
            name: templateRes.name as string,
            logoUrl: templateRes.logoUrl as string | null,
            backgroundImageUrl: templateRes.backgroundImageUrl as string | null,
            fields: templateRes.fields as string[],
            fieldPlacements: (lc.fieldPlacements as IdCardTemplateConfig["fieldPlacements"]) ?? undefined,
            backgroundColor: templateRes.backgroundColor as string,
            textColor: templateRes.textColor as string,
            accentColor: templateRes.accentColor as string,
            layout: lc.layout as "horizontal" | "vertical" | "compact" | undefined,
          }
        : {
            name: "Default",
            logoUrl: null,
            backgroundImageUrl: null,
            fields: ["fullName", "photo", "employeeNumber", "nationalId", "position"],
            backgroundColor: "#1a1a2e",
            textColor: "#ffffff",
            accentColor: "#16a34a",
          };

      let activePlugin: PrinterPluginConfig | null = null;
      try {
        const plugins: PrinterPluginConfig[] = await apiRequest("GET", "/api/printer-plugins").then(r => r.json());
        activePlugin = plugins.find(p => p.isActive) ?? null;
      } catch {
        activePlugin = null;
      }

      const cardData = emps.map(employeeToCardData);
      const results = await sendPrintJob(templateConfig, cardData, activePlugin);
      setPrintProgress({ total: emps.length, done: emps.length });

      const statuses = results.map((r, i) => ({
        employeeId: emps[i].id,
        status: r.status,
        error: r.error,
      }));

      try {
        await apiRequest("POST", "/api/id-card-print-jobs", {
          employeeIds: emps.map(e => e.id),
          templateId: templateRes?.id ?? null,
          printerPluginId: activePlugin?.id ?? null,
          statuses,
        });
      } catch {
        // Log failure is non-critical
      }

      const successCount = results.filter(r => r.status === "success").length;
      const pendingCount = results.filter(r => r.status === "pending").length;
      const failCount = results.filter(r => r.status === "failed").length;

      if (failCount === results.length) {
        toast({ title: "Print failed", description: "All cards failed to print", variant: "destructive" });
      } else if (failCount > 0) {
        toast({ title: `Printed ${successCount + pendingCount}/${results.length} cards`, description: `${failCount} failed` });
      } else {
        toast({ title: `Printing ${emps.length} ID card${emps.length !== 1 ? "s" : ""}` });
      }

      qc.invalidateQueries({ queryKey: ["/api/workforce/last-printed-bulk"] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Print failed", description: message, variant: "destructive" });
    } finally {
      setPrintingIds(new Set());
      setPrintProgress(null);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight" data-testid="text-page-title">Workforce Management</h1>
            <p className="text-muted-foreground mt-1">Manage your employees and details.</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              className="h-11 border-border text-foreground font-bold uppercase tracking-wide text-xs gap-2"
              data-testid="button-bulk-update"
              onClick={() => { setBulkUpdateOpen(true); setBulkUpdateFile(null); setBulkUpdateResult(null); }}
            >
              <Upload className="h-4 w-4" />
              Mass Update
            </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs self-start sm:self-auto gap-2"
                data-testid="button-export"
              >
                <Download className="h-4 w-4" />
                Export{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleExportExcel} className="gap-2" data-testid="menu-export-excel">
                <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                Export to Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCSV} className="gap-2" data-testid="menu-export-csv">
                <FileText className="h-4 w-4 text-blue-400" />
                Export to CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handlePrintIdCards(selectedIds.size > 0 ? selectedEmployees : sortedEmployees)}
                className="gap-2"
                data-testid="menu-print-id-cards"
              >
                <Printer className="h-4 w-4 text-amber-400" />
                Print ID Cards{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
              placeholder="Search by Employee ID, ID Number, Name, Phone"
              className="pl-10 h-12 bg-muted/30 border-border focus-visible:ring-primary/20 text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-employees"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setSelectedIds(new Set()); }}>
            <SelectTrigger className="w-full md:w-[180px] h-12 bg-background border-border" data-testid="select-status-filter">
              <SelectValue placeholder="Active Only" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="terminated">Terminated Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-sm px-4 py-2.5">
            <span className="text-sm font-medium text-primary">{selectedIds.size} employee{selectedIds.size !== 1 ? "s" : ""} selected</span>
            <span className="text-zinc-600">|</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-primary hover:text-white gap-1.5"
              onClick={() => handlePrintIdCards(selectedEmployees)}
              disabled={printingIds.size > 0}
              data-testid="button-bulk-print-id-cards"
            >
              {printingIds.size > 0 ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Printer className="h-3.5 w-3.5" />
              )}
              {printProgress
                ? `Printing ${printProgress.done}/${printProgress.total}...`
                : `Print ID Cards (${selectedIds.size})`}
            </Button>
            <span className="text-zinc-600">|</span>
            <Button variant="ghost" size="sm" className="text-xs text-zinc-400 hover:text-white" onClick={() => setSelectedIds(new Set())}>
              Clear Selection
            </Button>
          </div>
        )}

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-display text-white">
              Employee List
              <span className="ml-2 text-sm font-normal text-muted-foreground">({sortedEmployees.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : sortedEmployees.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Users className="h-12 w-12 text-muted-foreground/20 mb-4" />
                <p className="text-muted-foreground">No employees found</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Employees appear here after conversion from Onboarding.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-[50px] pl-4">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={toggleAll}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead className="w-[100px] text-muted-foreground">
                      <SortableHeader label="Emp #" field="employeeNumber" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="text-muted-foreground">
                      <SortableHeader label="Employee" field="fullNameEn" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">
                      <SortableHeader label="National ID" field="nationalId" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">
                      <SortableHeader label="Phone" field="phone" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="text-muted-foreground hidden xl:table-cell">Job / Event</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell text-right">
                      <SortableHeader label="Salary" field="salary" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="text-muted-foreground hidden xl:table-cell">Last Printed</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">
                      <SortableHeader label="Start Date" field="startDate" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </TableHead>
                    {showTerminated && (
                      <TableHead className="text-muted-foreground hidden md:table-cell">
                        <SortableHeader label="End Date" field="endDate" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                      </TableHead>
                    )}
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-right text-muted-foreground pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedEmployees.map((emp) => {
                    const st = statusBadge(emp.isActive);
                    const initials = (emp.fullNameEn ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                    const checked = selectedIds.has(emp.id);
                    return (
                      <TableRow
                        key={emp.id}
                        className={`border-border hover:bg-muted/20 cursor-pointer ${checked ? "bg-primary/5" : ""}`}
                        data-testid={`row-employee-${emp.employeeNumber}`}
                      >
                        <TableCell className="pl-4" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleOne(emp.id)}
                            data-testid={`checkbox-${emp.id}`}
                          />
                        </TableCell>
                        <TableCell
                          className="font-mono text-xs text-primary font-semibold"
                          onClick={() => setSelectedEmployee(emp)}
                          data-testid={`text-empnum-${emp.id}`}
                        >
                          {emp.employeeNumber}
                        </TableCell>
                        <TableCell className="py-3" onClick={() => setSelectedEmployee(emp)}>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 border border-zinc-700">
                              <AvatarImage src={emp.photoUrl ?? undefined} />
                              <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xs">{initials}</AvatarFallback>
                            </Avatar>
                            <div className="font-medium text-white text-sm">{emp.fullNameEn ?? "—"}</div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell font-mono text-xs text-zinc-400" onClick={() => setSelectedEmployee(emp)}>
                          {emp.nationalId ?? "—"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-zinc-400" onClick={() => setSelectedEmployee(emp)}>
                          {emp.phone ?? "—"}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell" onClick={() => setSelectedEmployee(emp)}>
                          <div className="space-y-0.5">
                            <div className="text-sm text-white">{emp.jobTitle ?? "—"}</div>
                            {emp.eventName && <div className="text-xs text-primary/70">{emp.eventName}</div>}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-right text-sm text-white font-medium" onClick={() => setSelectedEmployee(emp)}>
                          {emp.salary ? `${Number(emp.salary).toLocaleString()}` : "—"}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-xs text-zinc-400" onClick={() => setSelectedEmployee(emp)} data-testid={`text-last-printed-${emp.id}`}>
                          {lastPrintDates[emp.id] ? formatDate(lastPrintDates[emp.id]) : <span className="text-zinc-600">Never</span>}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-zinc-400" onClick={() => setSelectedEmployee(emp)}>
                          {formatDate(emp.startDate)}
                        </TableCell>
                        {showTerminated && (
                          <TableCell className="hidden md:table-cell text-sm text-zinc-400" onClick={() => setSelectedEmployee(emp)}>
                            {emp.endDate ? formatDate(emp.endDate) : "—"}
                          </TableCell>
                        )}
                        <TableCell onClick={() => setSelectedEmployee(emp)}>
                          <Badge variant="outline" className={`text-[10px] font-medium border ${st.className}`} data-testid={`badge-status-${emp.id}`}>
                            {st.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              onClick={(e) => { e.stopPropagation(); handlePrintIdCards([emp]); }}
                              disabled={printingIds.has(emp.id)}
                              data-testid={`button-print-id-${emp.id}`}
                              title="Print ID Card"
                            >
                              {printingIds.has(emp.id) ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Printer className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-white"
                              onClick={() => setSelectedEmployee(emp)}
                              data-testid={`button-view-${emp.id}`}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
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
        onUpdated={() => {
          qc.invalidateQueries({ queryKey: ["/api/workforce"] });
          setSelectedEmployee(null);
        }}
        onPrintCard={(emp) => handlePrintIdCards([emp])}
      />

      {/* ── Bulk Mass Update Dialog ─────────────────────────────────────────── */}
      <Dialog open={bulkUpdateOpen} onOpenChange={o => { if (!o) { setBulkUpdateOpen(false); setBulkUpdateResult(null); setBulkUpdateFile(null); } }}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Mass Employee Update
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Download the template, edit employee data in Excel, then upload to apply changes in bulk.
            </DialogDescription>
          </DialogHeader>

          {!bulkUpdateResult ? (
            <div className="space-y-5 mt-1">
              {/* Step 1 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold">1</span>
                  Download Template
                </div>
                <div className="bg-muted/30 border border-border/50 rounded-md p-3 text-sm text-muted-foreground">
                  The template is pre-filled with all current employees. Editable columns: <span className="text-foreground font-medium">Full Name, National ID/Iqama, Phone, Salary, Start Date, Event, Notes</span>. A second sheet lists valid Event names.
                </div>
                <Button variant="outline" className="w-full gap-2 border-primary/40 text-primary hover:bg-primary/10" onClick={downloadBulkTemplate} data-testid="button-download-template">
                  <FileSpreadsheet className="h-4 w-4" />
                  Download Bulk Update Template (.xlsx)
                </Button>
              </div>

              {/* Step 2 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold">2</span>
                  Upload Modified File
                </div>
                <label
                  htmlFor="bulk-update-file"
                  className="flex flex-col items-center justify-center gap-2 w-full h-28 border-2 border-dashed border-border/60 rounded-md cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors text-muted-foreground text-sm"
                  data-testid="label-bulk-upload"
                >
                  {bulkUpdateFile ? (
                    <>
                      <FileSpreadsheet className="h-6 w-6 text-emerald-400" />
                      <span className="font-medium text-foreground">{bulkUpdateFile.name}</span>
                      <span className="text-xs">{(bulkUpdateFile.size / 1024).toFixed(1)} KB — click to change</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6" />
                      <span>Click to select your modified Excel file</span>
                      <span className="text-xs">.xlsx or .xls</span>
                    </>
                  )}
                </label>
                <input
                  id="bulk-update-file"
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  data-testid="input-bulk-update-file"
                  onChange={e => setBulkUpdateFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" className="border-border" onClick={() => setBulkUpdateOpen(false)}>Cancel</Button>
                <Button
                  data-testid="button-submit-bulk-update"
                  disabled={!bulkUpdateFile || bulkUpdateLoading}
                  onClick={handleBulkUpdateSubmit}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                >
                  {bulkUpdateLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : <><Upload className="h-4 w-4" /> Apply Updates</>}
                </Button>
              </div>
            </div>
          ) : (
            /* Results */
            <div className="space-y-4 mt-1">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-950/30 border border-emerald-700/40 rounded-md p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{bulkUpdateResult.updated}</p>
                  <p className="text-xs text-emerald-300/70 mt-0.5">Updated</p>
                </div>
                <div className="bg-muted/20 border border-border/40 rounded-md p-3 text-center">
                  <p className="text-2xl font-bold text-muted-foreground">{bulkUpdateResult.skipped}</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">Skipped</p>
                </div>
                <div className={`rounded-md p-3 text-center border ${bulkUpdateResult.errors.length > 0 ? "bg-red-950/30 border-red-700/40" : "bg-muted/20 border-border/40"}`}>
                  <p className={`text-2xl font-bold ${bulkUpdateResult.errors.length > 0 ? "text-red-400" : "text-muted-foreground"}`}>{bulkUpdateResult.errors.length}</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">Errors</p>
                </div>
              </div>

              {bulkUpdateResult.errors.length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  <p className="text-xs font-semibold uppercase tracking-wider text-red-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Rows with errors</p>
                  {bulkUpdateResult.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm bg-red-950/20 border border-red-800/30 rounded p-2">
                      <span className="font-mono text-xs text-red-300 shrink-0 mt-0.5">{e.employeeNumber}</span>
                      <span className="text-red-200/80">{e.reason}</span>
                    </div>
                  ))}
                </div>
              )}

              {bulkUpdateResult.updated > 0 && (
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  {bulkUpdateResult.updated} employee{bulkUpdateResult.updated !== 1 ? "s" : ""} successfully updated out of {bulkUpdateResult.total} rows processed.
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" className="border-border" onClick={() => { setBulkUpdateResult(null); setBulkUpdateFile(null); }}>
                  Upload Another File
                </Button>
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => setBulkUpdateOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
