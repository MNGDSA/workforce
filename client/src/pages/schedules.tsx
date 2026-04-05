import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Clock,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Calendar,
  Users,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MinusCircle,
  Shield,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Shift = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  isActive: boolean;
};

type ScheduleTemplate = {
  id: string;
  name: string;
  eventId: string | null;
  mondayShiftId: string | null;
  tuesdayShiftId: string | null;
  wednesdayShiftId: string | null;
  thursdayShiftId: string | null;
  fridayShiftId: string | null;
  saturdayShiftId: string | null;
  sundayShiftId: string | null;
  isActive: boolean;
};

type ScheduleAssignment = {
  id: string;
  workforceId: string;
  templateId: string;
  startDate: string;
  endDate: string | null;
  notes: string | null;
};

type AttendanceRecord = {
  id: string;
  workforceId: string;
  date: string;
  status: "present" | "absent" | "late" | "half_day" | "excused";
  clockIn: string | null;
  clockOut: string | null;
  notes: string | null;
};

type Employee = {
  id: string;
  employeeNumber: string;
  fullNameEn: string | null;
  photoUrl: string | null;
  isActive: boolean;
  eventName: string | null;
};

type WorkedDaySummary = {
  workforceId: string;
  fullNameEn: string | null;
  employeeNumber: string | null;
  workedDays: number;
  absentDays: number;
  lateDays: number;
  halfDays: number;
  excusedDays: number;
  totalScheduledDays: number;
};

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
type Day = typeof DAYS[number];
const DAY_LABELS: Record<Day, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};
const DAY_FULL_LABELS: Record<Day, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday",
  friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};

const ATTENDANCE_STATUSES = [
  { value: "present", label: "Present", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  { value: "absent", label: "Absent", icon: XCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
  { value: "late", label: "Late", icon: AlertCircle, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" },
  { value: "half_day", label: "Half Day", icon: MinusCircle, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
  { value: "excused", label: "Excused", icon: Shield, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
];

function getStatusInfo(status: string) {
  return ATTENDANCE_STATUSES.find(s => s.value === status) ?? ATTENDANCE_STATUSES[0];
}

function formatTime(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour < 12 ? "AM" : "PM"}`;
}

function ShiftBadge({ shift }: { shift: Shift | undefined }) {
  if (!shift) return <span className="text-zinc-600 text-xs">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium rounded px-1.5 py-0.5"
      style={{ backgroundColor: shift.color + "22", color: shift.color, border: `1px solid ${shift.color}44` }}
    >
      {shift.name}
    </span>
  );
}

// ─── Shift Form Dialog ────────────────────────────────────────────────────────
function ShiftFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Shift | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    startTime: initial?.startTime ?? "08:00",
    endTime: initial?.endTime ?? "16:00",
    color: initial?.color ?? "#10b981",
  });

  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      if (initial) return apiRequest("PATCH", `/api/shifts/${initial.id}`, data).then(r => r.json());
      return apiRequest("POST", "/api/shifts", data).then(r => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({ title: initial ? "Shift updated" : "Shift created" });
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Shift" : "New Shift"}</DialogTitle>
          <DialogDescription className="sr-only">Define a shift type with times and color</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs uppercase tracking-wider">Shift Name</Label>
            <Input
              data-testid="input-shift-name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Morning Shift"
              className="bg-zinc-900 border-zinc-700 text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Start Time</Label>
              <Input
                data-testid="input-shift-start"
                type="time"
                value={form.startTime}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">End Time</Label>
              <Input
                data-testid="input-shift-end"
                type="time"
                value={form.endTime}
                onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs uppercase tracking-wider">Color</Label>
            <div className="flex items-center gap-3">
              <input
                data-testid="input-shift-color"
                type="color"
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="h-9 w-16 rounded border border-zinc-700 bg-zinc-900 cursor-pointer"
              />
              <Input
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="bg-zinc-900 border-zinc-700 text-white font-mono uppercase flex-1"
                maxLength={7}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" className="border-zinc-700" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              data-testid="button-save-shift"
              className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
              disabled={mutation.isPending || !form.name}
              onClick={() => mutation.mutate(form)}
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {initial ? "Save Changes" : "Create Shift"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Template Form Dialog ────────────────────────────────────────────────────
function TemplateFormDialog({
  open,
  onOpenChange,
  initial,
  shifts,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: ScheduleTemplate | null;
  shifts: Shift[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  type DayShifts = Record<Day, string | null>;
  const [form, setForm] = useState<{ name: string } & DayShifts>({
    name: initial?.name ?? "",
    monday: initial?.mondayShiftId ?? null,
    tuesday: initial?.tuesdayShiftId ?? null,
    wednesday: initial?.wednesdayShiftId ?? null,
    thursday: initial?.thursdayShiftId ?? null,
    friday: initial?.fridayShiftId ?? null,
    saturday: initial?.saturdayShiftId ?? null,
    sunday: initial?.sundayShiftId ?? null,
  });

  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = {
        name: data.name,
        mondayShiftId: data.monday ?? null,
        tuesdayShiftId: data.tuesday ?? null,
        wednesdayShiftId: data.wednesday ?? null,
        thursdayShiftId: data.thursday ?? null,
        fridayShiftId: data.friday ?? null,
        saturdayShiftId: data.saturday ?? null,
        sundayShiftId: data.sunday ?? null,
      };
      if (initial) return apiRequest("PATCH", `/api/schedule-templates/${initial.id}`, payload).then(r => r.json());
      return apiRequest("POST", "/api/schedule-templates", payload).then(r => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/schedule-templates"] });
      toast({ title: initial ? "Template updated" : "Template created" });
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const shiftById = useMemo(() => {
    const m: Record<string, Shift> = {};
    for (const s of shifts) m[s.id] = s;
    return m;
  }, [shifts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Schedule Template" : "New Schedule Template"}</DialogTitle>
          <DialogDescription className="sr-only">Define a weekly schedule pattern</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs uppercase tracking-wider">Template Name</Label>
            <Input
              data-testid="input-template-name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Standard Work Week"
              className="bg-zinc-900 border-zinc-700 text-white"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400 text-xs uppercase tracking-wider">Weekly Pattern</Label>
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              {DAYS.map((day, idx) => {
                const shiftId = form[day];
                const shift = shiftId ? shiftById[shiftId] : undefined;
                return (
                  <div
                    key={day}
                    className={`flex items-center gap-3 px-3 py-2 ${idx < DAYS.length - 1 ? "border-b border-zinc-800" : ""}`}
                  >
                    <span className="text-xs font-medium text-zinc-400 w-8">{DAY_LABELS[day]}</span>
                    <Select
                      value={shiftId ?? "off"}
                      onValueChange={v => setForm(f => ({ ...f, [day]: v === "off" ? null : v }))}
                    >
                      <SelectTrigger
                        data-testid={`select-shift-${day}`}
                        className="h-7 text-xs bg-zinc-900 border-zinc-700 text-white flex-1"
                      >
                        <SelectValue>
                          {shift ? (
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: shift.color }} />
                              {shift.name} ({formatTime(shift.startTime)} – {formatTime(shift.endTime)})
                            </span>
                          ) : (
                            <span className="text-zinc-500">Day Off</span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="off" className="text-zinc-400 text-xs">Day Off</SelectItem>
                        {shifts.map(s => (
                          <SelectItem key={s.id} value={s.id} className="text-xs">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                              {s.name} ({formatTime(s.startTime)} – {formatTime(s.endTime)})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" className="border-zinc-700" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              data-testid="button-save-template"
              className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
              disabled={mutation.isPending || !form.name}
              onClick={() => mutation.mutate(form)}
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {initial ? "Save Changes" : "Create Template"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Assign Schedule Dialog ────────────────────────────────────────────────────
function AssignScheduleDialog({
  open,
  onOpenChange,
  employees,
  templates,
  preselectedIds,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employees: Employee[];
  templates: ScheduleTemplate[];
  preselectedIds?: string[];
  onAssigned: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [templateId, setTemplateId] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(preselectedIds ?? []));
  const [search, setSearch] = useState("");

  const filtered = useMemo(() =>
    employees.filter(e => !search || (e.fullNameEn ?? "").toLowerCase().includes(search.toLowerCase()) || e.employeeNumber.includes(search)),
    [employees, search]
  );

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/schedule-assignments/bulk", {
      workforceIds: Array.from(selectedIds),
      templateId,
      startDate,
      endDate: endDate || null,
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/schedule-assignments"] });
      toast({ title: "Schedule assigned successfully" });
      onAssigned();
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(e => e.id)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Assign Schedule</DialogTitle>
          <DialogDescription className="sr-only">Assign a schedule template to employees</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Schedule Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger data-testid="select-assign-template" className="bg-zinc-900 border-zinc-700 text-white">
                  <SelectValue placeholder="Select template..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Start Date</Label>
              <Input
                data-testid="input-assign-start-date"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs uppercase tracking-wider">End Date <span className="text-zinc-600 normal-case">(optional, leave blank for open-ended)</span></Label>
            <Input
              data-testid="input-assign-end-date"
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">
                Employees ({selectedIds.size} selected)
              </Label>
              <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={toggleAll}>
                {selectedIds.size === filtered.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <Input
              data-testid="input-assign-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search employees..."
              className="bg-zinc-900 border-zinc-700 text-white text-sm h-8"
            />
            <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800 max-h-64 overflow-y-auto">
              {filtered.map(emp => (
                <label
                  key={emp.id}
                  data-testid={`checkbox-assign-${emp.id}`}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-zinc-900/50"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(emp.id)}
                    onChange={() => {
                      const next = new Set(selectedIds);
                      if (next.has(emp.id)) next.delete(emp.id); else next.add(emp.id);
                      setSelectedIds(next);
                    }}
                    className="accent-[hsl(155,45%,45%)]"
                  />
                  <span className="font-mono text-xs text-primary">{emp.employeeNumber}</span>
                  <span className="text-sm text-white">{emp.fullNameEn ?? "—"}</span>
                </label>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-xs text-zinc-500 text-center">No employees found</div>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2 border-t border-zinc-800 mt-2">
          <Button variant="outline" className="border-zinc-700" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            data-testid="button-confirm-assign"
            className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
            disabled={mutation.isPending || !templateId || selectedIds.size === 0}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Assign to {selectedIds.size} Employee{selectedIds.size !== 1 ? "s" : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Shifts Tab ────────────────────────────────────────────────────────────────
function ShiftsTab({ shifts }: { shifts: Shift[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Shift | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/shifts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({ title: "Shift deleted" });
      setDeleteId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">{shifts.length} shift type{shifts.length !== 1 ? "s" : ""} defined</p>
        <Button
          data-testid="button-new-shift"
          size="sm"
          className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" /> New Shift
        </Button>
      </div>

      {shifts.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <Clock className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p>No shift types yet. Create your first shift to get started.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shifts.map(shift => (
            <div
              key={shift.id}
              data-testid={`card-shift-${shift.id}`}
              className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/50 flex items-start justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-3 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: shift.color }} />
                <div>
                  <div className="font-semibold text-white text-sm">{shift.name}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {formatTime(shift.startTime)} – {formatTime(shift.endTime)}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-white"
                  onClick={() => setEditTarget(shift)}
                  data-testid={`button-edit-shift-${shift.id}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-red-400"
                  onClick={() => setDeleteId(shift.id)}
                  data-testid={`button-delete-shift-${shift.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ShiftFormDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={() => {}} />
      {editTarget && (
        <ShiftFormDialog open={!!editTarget} onOpenChange={v => !v && setEditTarget(null)} initial={editTarget} onSaved={() => setEditTarget(null)} />
      )}
      <Dialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Shift</DialogTitle>
            <DialogDescription className="text-zinc-400">This will permanently delete the shift type. Employees currently on this shift may be affected.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" className="border-zinc-700" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              data-testid="button-confirm-delete-shift"
              disabled={deleteMutation.isPending}
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Templates Tab ─────────────────────────────────────────────────────────────
function TemplatesTab({ shifts, templates }: { shifts: Shift[]; templates: ScheduleTemplate[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ScheduleTemplate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const shiftById = useMemo(() => {
    const m: Record<string, Shift> = {};
    for (const s of shifts) m[s.id] = s;
    return m;
  }, [shifts]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/schedule-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/schedule-templates"] });
      toast({ title: "Template deleted" });
      setDeleteId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">{templates.length} template{templates.length !== 1 ? "s" : ""} defined</p>
        <Button
          data-testid="button-new-template"
          size="sm"
          className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
          onClick={() => setCreateOpen(true)}
          disabled={shifts.length === 0}
          title={shifts.length === 0 ? "Create shifts first" : undefined}
        >
          <Plus className="h-4 w-4 mr-1" /> New Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p>No schedule templates yet. {shifts.length === 0 ? "Create shift types first." : "Create your first template."}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {templates.map(tpl => {
            const days: readonly Day[] = DAYS;
            const dayKeys: Record<Day, keyof ScheduleTemplate> = {
              monday: "mondayShiftId", tuesday: "tuesdayShiftId", wednesday: "wednesdayShiftId",
              thursday: "thursdayShiftId", friday: "fridayShiftId", saturday: "saturdayShiftId", sunday: "sundayShiftId",
            };
            return (
              <div key={tpl.id} data-testid={`card-template-${tpl.id}`} className="border border-zinc-800 rounded-lg bg-zinc-900/50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                  <div className="font-semibold text-white">{tpl.name}</div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-white" onClick={() => setEditTarget(tpl)} data-testid={`button-edit-template-${tpl.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-red-400" onClick={() => setDeleteId(tpl.id)} data-testid={`button-delete-template-${tpl.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-7 divide-x divide-zinc-800 p-3 gap-1">
                  {days.map(day => {
                    const shiftId = tpl[dayKeys[day]] as string | null;
                    const shift = shiftId ? shiftById[shiftId] : undefined;
                    return (
                      <div key={day} className="flex flex-col items-center gap-1 px-1">
                        <span className="text-[10px] text-zinc-500 font-medium">{DAY_LABELS[day]}</span>
                        {shift ? (
                          <div className="w-full rounded py-1 flex items-center justify-center" style={{ backgroundColor: shift.color + "22" }}>
                            <span className="text-[9px] font-bold" style={{ color: shift.color }}>{shift.name.slice(0, 3)}</span>
                          </div>
                        ) : (
                          <div className="w-full rounded py-1 bg-zinc-800/50 flex items-center justify-center">
                            <span className="text-[9px] text-zinc-600">off</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TemplateFormDialog open={createOpen} onOpenChange={setCreateOpen} shifts={shifts} onSaved={() => {}} />
      {editTarget && (
        <TemplateFormDialog open={!!editTarget} onOpenChange={v => !v && setEditTarget(null)} initial={editTarget} shifts={shifts} onSaved={() => setEditTarget(null)} />
      )}
      <Dialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription className="text-zinc-400">This will permanently delete the schedule template.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" className="border-zinc-700" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Roster Tab ────────────────────────────────────────────────────────────────
function RosterTab({ employees, shifts, templates }: { employees: Employee[]; shifts: Shift[]; templates: ScheduleTemplate[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [rosterView, setRosterView] = useState<"week" | "month">("week");
  const [endAssignId, setEndAssignId] = useState<string | null>(null);
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: assignments = [] } = useQuery<ScheduleAssignment[]>({
    queryKey: ["/api/schedule-assignments"],
    queryFn: () => apiRequest("GET", "/api/schedule-assignments").then(r => r.json()),
  });

  const weekStart = useMemo(() => {
    const now = new Date();
    const d = new Date(now);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff + weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [weekOffset]);

  const weekDates = useMemo(() => {
    return DAYS.map((_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }, [weekStart]);

  const shiftById = useMemo(() => {
    const m: Record<string, Shift> = {};
    for (const s of shifts) m[s.id] = s;
    return m;
  }, [shifts]);

  const templateById = useMemo(() => {
    const m: Record<string, ScheduleTemplate> = {};
    for (const t of templates) m[t.id] = t;
    return m;
  }, [templates]);

  const activeEmployees = employees.filter(e => e.isActive);

  function getShiftForDate(workforceId: string, date: string): Shift | undefined {
    const assignment = assignments.find(a =>
      a.workforceId === workforceId &&
      a.startDate <= date &&
      (a.endDate == null || a.endDate > date)
    );
    if (!assignment) return undefined;
    const template = templateById[assignment.templateId];
    if (!template) return undefined;
    const d = new Date(date + "T00:00:00");
    const dayIndex = (d.getDay() + 6) % 7;
    const dayKey = (DAYS[dayIndex] + "ShiftId") as keyof ScheduleTemplate;
    const shiftId = template[dayKey] as string | null;
    return shiftId ? shiftById[shiftId] : undefined;
  }

  const endMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/schedule-assignments/${id}/end`, { endDate }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/schedule-assignments"] });
      toast({ title: "Assignment ended" });
      setEndAssignId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const formatShortDate = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const monthStart = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    return d;
  }, [monthOffset]);

  const monthLabel = useMemo(() => {
    return monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [monthStart]);

  const monthDates = useMemo(() => {
    const days: string[] = [];
    const d = new Date(monthStart);
    while (d.getMonth() === monthStart.getMonth()) {
      days.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [monthStart]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="flex rounded-md overflow-hidden border border-zinc-800 bg-zinc-900/50">
            <button
              onClick={() => setRosterView("week")}
              className={`text-xs font-semibold py-1.5 px-3 transition-colors ${rosterView === "week" ? "bg-[hsl(155,45%,45%)] text-white" : "text-zinc-400 hover:text-white"}`}
              data-testid="button-roster-week"
            >
              Week
            </button>
            <button
              onClick={() => setRosterView("month")}
              className={`text-xs font-semibold py-1.5 px-3 transition-colors ${rosterView === "month" ? "bg-[hsl(155,45%,45%)] text-white" : "text-zinc-400 hover:text-white"}`}
              data-testid="button-roster-month"
            >
              Month
            </button>
          </div>
          {rosterView === "week" ? (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={() => setWeekOffset(o => o - 1)} data-testid="button-prev-week">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium text-white">
                {formatShortDate(weekDates[0])} – {formatShortDate(weekDates[6])}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={() => setWeekOffset(o => o + 1)} data-testid="button-next-week">
                <ChevronRight className="h-4 w-4" />
              </Button>
              {weekOffset !== 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => setWeekOffset(0)}>Today</Button>
              )}
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={() => setMonthOffset(o => o - 1)} data-testid="button-prev-month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium text-white">{monthLabel}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={() => setMonthOffset(o => o + 1)} data-testid="button-next-month">
                <ChevronRight className="h-4 w-4" />
              </Button>
              {monthOffset !== 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => setMonthOffset(0)}>Today</Button>
              )}
            </>
          )}
        </div>
        <Button
          data-testid="button-assign-schedule"
          size="sm"
          className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
          onClick={() => setAssignOpen(true)}
          disabled={templates.length === 0 || activeEmployees.length === 0}
        >
          <Users className="h-4 w-4 mr-1" /> Assign Schedule
        </Button>
      </div>

      {rosterView === "week" && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-zinc-400 py-2 px-3 font-medium min-w-[160px]">Employee</th>
                {DAYS.map((day, i) => (
                  <th key={day} className="text-center text-zinc-400 py-2 px-2 font-medium min-w-[80px]">
                    <div>{DAY_LABELS[day]}</div>
                    <div className="text-[10px] text-zinc-600">{formatShortDate(weekDates[i])}</div>
                  </th>
                ))}
                <th className="text-zinc-400 py-2 px-3 font-medium">Schedule</th>
              </tr>
            </thead>
            <tbody>
              {activeEmployees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-zinc-500">No active employees found</td>
                </tr>
              ) : (
                activeEmployees.map(emp => {
                  const activeAssignment = assignments.find(a => a.workforceId === emp.id && a.endDate == null);
                  const template = activeAssignment ? templateById[activeAssignment.templateId] : undefined;
                  return (
                    <tr key={emp.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/30" data-testid={`row-roster-${emp.id}`}>
                      <td className="py-2 px-3">
                        <div className="font-medium text-white">{emp.fullNameEn ?? "—"}</div>
                        <div className="text-[10px] text-primary font-mono">{emp.employeeNumber}</div>
                      </td>
                      {DAYS.map((_, i) => {
                        const shift = getShiftForDate(emp.id, weekDates[i]);
                        return (
                          <td key={i} className="py-2 px-1 text-center">
                            {shift ? (
                              <div
                                className="rounded px-1 py-0.5 text-[10px] font-semibold inline-block"
                                style={{ backgroundColor: shift.color + "22", color: shift.color }}
                              >
                                {shift.name.slice(0, 4)}
                              </div>
                            ) : (
                              <span className="text-zinc-700">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-2 px-3">
                        {template ? (
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-300 text-xs">{template.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 text-[10px] text-red-400 hover:text-red-300 px-1"
                              onClick={() => setEndAssignId(activeAssignment!.id)}
                              data-testid={`button-end-assign-${emp.id}`}
                            >
                              End
                            </Button>
                          </div>
                        ) : (
                          <span className="text-zinc-600 text-xs">Unassigned</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {rosterView === "month" && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-zinc-400 py-2 px-3 font-medium min-w-[140px] sticky left-0 bg-zinc-950 z-10">Employee</th>
                {monthDates.map(date => {
                  const d = new Date(date + "T00:00:00");
                  const today = new Date().toISOString().slice(0, 10);
                  return (
                    <th
                      key={date}
                      className={`text-center text-zinc-400 py-2 px-0.5 font-medium min-w-[28px] ${date === today ? "text-primary" : ""}`}
                    >
                      <div className="text-[9px] text-zinc-600">{d.toLocaleDateString("en-US", { weekday: "narrow" })}</div>
                      <div className={date === today ? "text-primary font-bold" : ""}>{d.getDate()}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {activeEmployees.length === 0 ? (
                <tr>
                  <td colSpan={monthDates.length + 1} className="text-center py-12 text-zinc-500">No active employees found</td>
                </tr>
              ) : (
                activeEmployees.map(emp => (
                  <tr key={emp.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/30" data-testid={`row-roster-month-${emp.id}`}>
                    <td className="py-1.5 px-3 sticky left-0 bg-zinc-950 z-10">
                      <div className="font-medium text-white truncate max-w-[120px]">{emp.fullNameEn ?? "—"}</div>
                      <div className="text-[9px] text-primary font-mono">{emp.employeeNumber}</div>
                    </td>
                    {monthDates.map(date => {
                      const shift = getShiftForDate(emp.id, date);
                      return (
                        <td key={date} className="py-1.5 px-0.5 text-center">
                          {shift ? (
                            <div
                              title={shift.name}
                              className="rounded w-5 h-5 mx-auto flex items-center justify-center text-[8px] font-bold"
                              style={{ backgroundColor: shift.color + "33", color: shift.color }}
                            >
                              {shift.name.slice(0, 1)}
                            </div>
                          ) : (
                            <div className="w-5 h-5 mx-auto" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <AssignScheduleDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        employees={activeEmployees}
        templates={templates}
        onAssigned={() => {}}
      />
      <Dialog open={!!endAssignId} onOpenChange={v => !v && setEndAssignId(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>End Schedule Assignment</DialogTitle>
            <DialogDescription className="text-zinc-400">Choose the date to end this assignment. History will be preserved.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">End Date</Label>
              <Input
                data-testid="input-end-date"
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" className="border-zinc-700" onClick={() => setEndAssignId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              data-testid="button-confirm-end-assign"
              disabled={endMutation.isPending}
              onClick={() => endAssignId && endMutation.mutate(endAssignId)}
            >
              {endMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              End Assignment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Attendance Tab ─────────────────────────────────────────────────────────────
function AttendanceTab({ employees, shifts, templates }: { employees: Employee[]; shifts: Shift[]; templates: ScheduleTemplate[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<"daily" | "summary">("daily");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [summaryFrom, setSummaryFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [summaryTo, setSummaryTo] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const { data: assignments = [] } = useQuery<ScheduleAssignment[]>({
    queryKey: ["/api/schedule-assignments"],
    queryFn: () => apiRequest("GET", "/api/schedule-assignments").then(r => r.json()),
  });

  const { data: attendanceRows = [] } = useQuery<AttendanceRecord[]>({
    queryKey: ["/api/attendance", selectedDate],
    queryFn: () => apiRequest("GET", `/api/attendance?date=${selectedDate}`).then(r => r.json()),
    enabled: view === "daily",
  });

  const { data: summaryData = [] } = useQuery<WorkedDaySummary[]>({
    queryKey: ["/api/attendance/summary", summaryFrom, summaryTo],
    queryFn: () => apiRequest("GET", `/api/attendance/summary?dateFrom=${summaryFrom}&dateTo=${summaryTo}`).then(r => r.json()),
    enabled: view === "summary",
  });

  const templateById = useMemo(() => {
    const m: Record<string, ScheduleTemplate> = {};
    for (const t of templates) m[t.id] = t;
    return m;
  }, [templates]);

  const shiftById = useMemo(() => {
    const m: Record<string, Shift> = {};
    for (const s of shifts) m[s.id] = s;
    return m;
  }, [shifts]);

  const scheduledEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (!emp.isActive) return false;
      const assignment = assignments.find(a =>
        a.workforceId === emp.id &&
        a.startDate <= selectedDate &&
        (a.endDate == null || a.endDate > selectedDate)
      );
      return !!assignment;
    });
  }, [employees, assignments, selectedDate]);

  const attendanceByEmployee = useMemo(() => {
    const m: Record<string, AttendanceRecord> = {};
    for (const r of attendanceRows) m[r.workforceId] = r;
    return m;
  }, [attendanceRows]);

  const [localStatuses, setLocalStatuses] = useState<Record<string, "present" | "absent" | "late" | "half_day" | "excused">>({});
  const [localClockIn, setLocalClockIn] = useState<Record<string, string>>({});
  const [localClockOut, setLocalClockOut] = useState<Record<string, string>>({});

  useEffect(() => {
    setLocalStatuses({});
    setLocalClockIn({});
    setLocalClockOut({});
  }, [selectedDate]);

  const handleStatusChange = (workforceId: string, status: "present" | "absent" | "late" | "half_day" | "excused") => {
    setLocalStatuses(prev => ({ ...prev, [workforceId]: status }));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const records = scheduledEmployeesWithShift.map(emp => {
        const existing = attendanceByEmployee[emp.id];
        return {
          workforceId: emp.id,
          date: selectedDate,
          status: localStatuses[emp.id] ?? existing?.status ?? "absent",
          clockIn: localClockIn[emp.id] !== undefined ? (localClockIn[emp.id] || null) : (existing?.clockIn ?? null),
          clockOut: localClockOut[emp.id] !== undefined ? (localClockOut[emp.id] || null) : (existing?.clockOut ?? null),
          source: "manual" as const,
        };
      });
      await apiRequest("POST", "/api/attendance/bulk", { records }).then(r => r.json());
      qc.invalidateQueries({ queryKey: ["/api/attendance", selectedDate] });
      setLocalStatuses({});
      setLocalClockIn({});
      setLocalClockOut({});
      toast({ title: "Attendance saved" });
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  function getShiftForDate(workforceId: string, date: string): Shift | undefined {
    const assignment = assignments.find(a =>
      a.workforceId === workforceId &&
      a.startDate <= date &&
      (a.endDate == null || a.endDate > date)
    );
    if (!assignment) return undefined;
    const template = templateById[assignment.templateId];
    if (!template) return undefined;
    const d = new Date(date + "T00:00:00");
    const dayIndex = (d.getDay() + 6) % 7;
    const dayKey = (DAYS[dayIndex] + "ShiftId") as keyof ScheduleTemplate;
    const shiftId = template[dayKey] as string | null;
    return shiftId ? shiftById[shiftId] : undefined;
  }

  const scheduledEmployeesWithShift = useMemo(() => {
    return scheduledEmployees.filter(emp => !!getShiftForDate(emp.id, selectedDate));
  }, [scheduledEmployees, assignments, selectedDate, templateById, shiftById]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex rounded-md overflow-hidden border border-zinc-800 bg-zinc-900/50">
          <button
            onClick={() => setView("daily")}
            className={`text-xs font-semibold py-2 px-4 transition-colors ${view === "daily" ? "bg-[hsl(155,45%,45%)] text-white" : "text-zinc-400 hover:text-white"}`}
            data-testid="tab-attendance-daily"
          >
            Daily
          </button>
          <button
            onClick={() => setView("summary")}
            className={`text-xs font-semibold py-2 px-4 transition-colors ${view === "summary" ? "bg-[hsl(155,45%,45%)] text-white" : "text-zinc-400 hover:text-white"}`}
            data-testid="tab-attendance-summary"
          >
            Summary
          </button>
        </div>
        {view === "daily" && (
          <div className="flex items-center gap-2">
            <Input
              data-testid="input-attendance-date"
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white h-8 text-xs"
            />
            <Button
              data-testid="button-save-attendance"
              size="sm"
              className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
              disabled={saving || scheduledEmployeesWithShift.length === 0}
              onClick={saveAll}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Save Attendance
            </Button>
          </div>
        )}
        {view === "summary" && (
          <div className="flex items-center gap-2">
            <Label className="text-zinc-400 text-xs">From</Label>
            <Input
              data-testid="input-summary-from"
              type="date"
              value={summaryFrom}
              onChange={e => setSummaryFrom(e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white h-8 text-xs"
            />
            <Label className="text-zinc-400 text-xs">To</Label>
            <Input
              data-testid="input-summary-to"
              type="date"
              value={summaryTo}
              onChange={e => setSummaryTo(e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white h-8 text-xs"
            />
          </div>
        )}
      </div>

      {view === "daily" && (
        <>
          {scheduledEmployeesWithShift.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No employees have a shift on {selectedDate}.</p>
              <p className="text-xs mt-1">Employees with a day-off or no assignment on this day are excluded.</p>
            </div>
          ) : (
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Employee</TableHead>
                    <TableHead className="text-zinc-400">Scheduled Shift</TableHead>
                    <TableHead className="text-zinc-400">Status</TableHead>
                    <TableHead className="text-zinc-400">Clock In</TableHead>
                    <TableHead className="text-zinc-400">Clock Out</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduledEmployeesWithShift.map(emp => {
                    const existing = attendanceByEmployee[emp.id];
                    const currentStatus = localStatuses[emp.id] ?? existing?.status ?? "absent";
                    const shift = getShiftForDate(emp.id, selectedDate)!;
                    const statusInfo = getStatusInfo(currentStatus);
                    const clockInValue = localClockIn[emp.id] !== undefined ? localClockIn[emp.id] : (existing?.clockIn ?? "");
                    const clockOutValue = localClockOut[emp.id] !== undefined ? localClockOut[emp.id] : (existing?.clockOut ?? "");
                    return (
                      <TableRow key={emp.id} className="border-zinc-800 hover:bg-zinc-900/30" data-testid={`row-attendance-${emp.id}`}>
                        <TableCell>
                          <div className="font-medium text-white text-sm">{emp.fullNameEn ?? "—"}</div>
                          <div className="text-[10px] text-primary font-mono">{emp.employeeNumber}</div>
                        </TableCell>
                        <TableCell>
                          <ShiftBadge shift={shift} />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={currentStatus}
                            onValueChange={v => handleStatusChange(emp.id, v as typeof currentStatus)}
                          >
                            <SelectTrigger
                              data-testid={`select-status-${emp.id}`}
                              className={`h-7 text-xs border ${statusInfo.bg} ${statusInfo.color} w-[120px]`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-700">
                              {ATTENDANCE_STATUSES.map(s => (
                                <SelectItem key={s.value} value={s.value} className="text-xs">
                                  {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            data-testid={`input-clockin-${emp.id}`}
                            type="time"
                            value={clockInValue}
                            onChange={e => setLocalClockIn(prev => ({ ...prev, [emp.id]: e.target.value }))}
                            placeholder={formatTime(shift.startTime)}
                            className="bg-zinc-900 border-zinc-700 text-white h-7 text-xs w-[100px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            data-testid={`input-clockout-${emp.id}`}
                            type="time"
                            value={clockOutValue}
                            onChange={e => setLocalClockOut(prev => ({ ...prev, [emp.id]: e.target.value }))}
                            placeholder={formatTime(shift.endTime)}
                            className="bg-zinc-900 border-zinc-700 text-white h-7 text-xs w-[100px]"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {view === "summary" && (
        <>
          {summaryData.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No attendance data for selected period.</p>
            </div>
          ) : (
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Employee</TableHead>
                    <TableHead className="text-zinc-400 text-center">Worked</TableHead>
                    <TableHead className="text-zinc-400 text-center">Absent</TableHead>
                    <TableHead className="text-zinc-400 text-center">Late</TableHead>
                    <TableHead className="text-zinc-400 text-center">Half Day</TableHead>
                    <TableHead className="text-zinc-400 text-center">Excused</TableHead>
                    <TableHead className="text-zinc-400 text-center">Total Scheduled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryData.map(row => (
                    <TableRow key={row.workforceId} className="border-zinc-800 hover:bg-zinc-900/30" data-testid={`row-summary-${row.workforceId}`}>
                      <TableCell>
                        <div className="font-medium text-white text-sm">{row.fullNameEn ?? "—"}</div>
                        <div className="text-[10px] text-primary font-mono">{row.employeeNumber}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 border text-xs" data-testid={`text-worked-${row.workforceId}`}>
                          {row.workedDays}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-red-400 text-sm">{row.absentDays}</TableCell>
                      <TableCell className="text-center text-yellow-400 text-sm">{row.lateDays}</TableCell>
                      <TableCell className="text-center text-orange-400 text-sm">{row.halfDays}</TableCell>
                      <TableCell className="text-center text-blue-400 text-sm">{row.excusedDays}</TableCell>
                      <TableCell className="text-center text-zinc-400 text-sm">{row.totalScheduledDays}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function SchedulesPage() {
  const [tab, setTab] = useState<"shifts" | "templates" | "roster" | "attendance">("shifts");

  const { data: shifts = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ["/api/shifts"],
    queryFn: () => apiRequest("GET", "/api/shifts").then(r => r.json()),
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery<ScheduleTemplate[]>({
    queryKey: ["/api/schedule-templates"],
    queryFn: () => apiRequest("GET", "/api/schedule-templates").then(r => r.json()),
  });

  const { data: employees = [], isLoading: empLoading } = useQuery<Employee[]>({
    queryKey: ["/api/workforce"],
    queryFn: () => apiRequest("GET", "/api/workforce").then(r => r.json()),
  });

  const loading = shiftsLoading || templatesLoading || empLoading;

  const TABS = [
    { key: "shifts", label: "Shifts", icon: Clock },
    { key: "templates", label: "Templates", icon: Calendar },
    { key: "roster", label: "Roster", icon: Users },
    { key: "attendance", label: "Attendance", icon: ClipboardList },
  ] as const;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Work Schedules</h1>
          <p className="text-zinc-400 text-sm mt-1">Manage shift definitions, schedule templates, employee rosters, and attendance tracking.</p>
        </div>

        <div className="flex rounded-md overflow-hidden border border-zinc-800 bg-zinc-900/50 w-fit">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              data-testid={`tab-${key}`}
              className={`flex items-center gap-1.5 text-xs font-semibold py-2.5 px-4 transition-colors ${
                tab === key ? "bg-[hsl(155,45%,45%)] text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-3 text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading...</span>
              </div>
            ) : (
              <>
                {tab === "shifts" && <ShiftsTab shifts={shifts} />}
                {tab === "templates" && <TemplatesTab shifts={shifts} templates={templates} />}
                {tab === "roster" && <RosterTab employees={employees} shifts={shifts} templates={templates} />}
                {tab === "attendance" && <AttendanceTab employees={employees} shifts={shifts} templates={templates} />}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
