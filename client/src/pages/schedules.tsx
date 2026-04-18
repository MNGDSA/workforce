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
  Shield,
  Download,
  LayoutDashboard,
  TrendingUp,
  MessageCircle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { formatNumber, formatDate } from "@/lib/format";

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
  status: "present" | "absent" | "late" | "excused";
  clockIn: string | null;
  clockOut: string | null;
  minutesScheduled: number | null;
  minutesWorked: number | null;
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
  excusedDays: number;
  totalScheduledDays: number;
  totalMinutesWorked: number;
  totalMinutesScheduled: number;
  totalMinutesLate: number;
};

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
type Day = typeof DAYS[number];
const DAY_KEYS: Record<Day, string> = {
  monday: "schedules:days.monShort",
  tuesday: "schedules:days.tueShort",
  wednesday: "schedules:days.wedShort",
  thursday: "schedules:days.thuShort",
  friday: "schedules:days.friShort",
  saturday: "schedules:days.satShort",
  sunday: "schedules:days.sunShort",
};

type AttendanceStatusValue = "present" | "absent" | "late" | "excused";
const ATTENDANCE_STATUSES: { value: AttendanceStatusValue; tKey: string; icon: typeof CheckCircle2; color: string; bg: string }[] = [
  { value: "present", tKey: "schedules:attendance.status.present", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  { value: "absent", tKey: "schedules:attendance.status.absent", icon: XCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
  { value: "late", tKey: "schedules:attendance.status.late", icon: AlertCircle, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" },
  { value: "excused", tKey: "schedules:attendance.status.excused", icon: Shield, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
];

function getStatusInfo(status: string) {
  return ATTENDANCE_STATUSES.find(s => s.value === status) ?? ATTENDANCE_STATUSES[0];
}

function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${h.padStart(2, "0")}:${m}`;
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
  const { t } = useTranslation(["schedules", "common"]);
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
      toast({ title: initial ? t("schedules:shifts.shiftUpdated") : t("schedules:shifts.shiftCreated") });
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: t("schedules:common.error"), description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? t("schedules:shifts.editShift") : t("schedules:shifts.newShift")}</DialogTitle>
          <DialogDescription className="sr-only">{t("schedules:shifts.shiftFormDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("schedules:shifts.fields.name")}</Label>
            <Input
              data-testid="input-shift-name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={t("schedules:shifts.fields.namePlaceholder")}
              className="bg-background border-input text-foreground"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("schedules:shifts.fields.startTime")}</Label>
              <Input
                data-testid="input-shift-start"
                type="time"
                value={form.startTime}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                className="bg-background border-input text-foreground"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("schedules:shifts.fields.endTime")}</Label>
              <Input
                data-testid="input-shift-end"
                type="time"
                value={form.endTime}
                onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                className="bg-background border-input text-foreground"
                dir="ltr"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("schedules:shifts.fields.color")}</Label>
            <div className="flex items-center gap-3">
              <input
                data-testid="input-shift-color"
                type="color"
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="h-9 w-16 rounded border border-input bg-background cursor-pointer"
              />
              <Input
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="bg-background border-input text-foreground font-mono uppercase flex-1"
                maxLength={7}
                dir="ltr"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" className="border-zinc-700" onClick={() => onOpenChange(false)}>{t("schedules:common.cancel")}</Button>
            <Button
              data-testid="button-save-shift"
              className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
              disabled={mutation.isPending || !form.name}
              onClick={() => mutation.mutate(form)}
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : null}
              {initial ? t("schedules:common.saveChanges") : t("schedules:shifts.createShift")}
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
  const { t } = useTranslation(["schedules", "common"]);
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
      toast({ title: initial ? t("schedules:templates.templateUpdated") : t("schedules:templates.templateCreated") });
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: t("schedules:common.error"), description: e.message, variant: "destructive" }),
  });

  const shiftById = useMemo(() => {
    const m: Record<string, Shift> = {};
    for (const s of shifts) m[s.id] = s;
    return m;
  }, [shifts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? t("schedules:templates.editTemplate") : t("schedules:templates.createTemplate")}</DialogTitle>
          <DialogDescription className="sr-only">{t("schedules:templates.templateFormDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("schedules:templates.fields.name")}</Label>
            <Input
              data-testid="input-template-name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={t("schedules:templates.fields.namePlaceholder")}
              className="bg-background border-input text-foreground"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("schedules:templates.fields.weeklyPattern")}</Label>
            <div className="border border-border/50 rounded-lg overflow-hidden">
              {DAYS.map((day, idx) => {
                const shiftId = form[day];
                const shift = shiftId ? shiftById[shiftId] : undefined;
                return (
                  <div
                    key={day}
                    className={`flex items-center gap-3 px-3 py-2 ${idx < DAYS.length - 1 ? "border-b border-border/40" : ""}`}
                  >
                    <span className="text-xs font-medium text-zinc-400 w-8">{t(DAY_KEYS[day])}</span>
                    <Select
                      value={shiftId ?? "off"}
                      onValueChange={v => setForm(f => ({ ...f, [day]: v === "off" ? null : v }))}
                    >
                      <SelectTrigger
                        data-testid={`select-shift-${day}`}
                        className="h-7 text-xs bg-background border-input text-foreground flex-1"
                      >
                        <SelectValue>
                          {shift ? (
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: shift.color }} />
                              <bdi>{shift.name}</bdi> <span dir="ltr">({formatTime(shift.startTime)} – {formatTime(shift.endTime)})</span>
                            </span>
                          ) : (
                            <span className="text-zinc-500">{t("schedules:common.dayOff")}</span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        <SelectItem value="off" className="text-zinc-400 text-xs">{t("schedules:common.dayOff")}</SelectItem>
                        {shifts.map(s => (
                          <SelectItem key={s.id} value={s.id} className="text-xs">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                              <bdi>{s.name}</bdi> <span dir="ltr">({formatTime(s.startTime)} – {formatTime(s.endTime)})</span>
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
            <Button variant="outline" className="border-zinc-700" onClick={() => onOpenChange(false)}>{t("schedules:common.cancel")}</Button>
            <Button
              data-testid="button-save-template"
              className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
              disabled={mutation.isPending || !form.name}
              onClick={() => mutation.mutate(form)}
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : null}
              {initial ? t("schedules:common.saveChanges") : t("schedules:templates.createTemplate")}
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
  const { t } = useTranslation(["schedules", "common"]);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [templateId, setTemplateId] = useState("");
  const [startDate, setStartDate] = useState(localDateStr());
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
      Array.from(selectedIds).forEach(wid => {
        qc.invalidateQueries({ queryKey: ["/api/schedule-assignments/employee", wid] });
        qc.invalidateQueries({ queryKey: ["/api/schedule-assignments/employee", wid, "active"] });
      });
      toast({ title: t("schedules:assign.assigned") });
      onAssigned();
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: t("schedules:common.error"), description: e.message, variant: "destructive" }),
  });

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(e => e.id)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("schedules:assign.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("schedules:assign.desc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("schedules:assign.template")}</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger data-testid="select-assign-template" className="bg-background border-input text-foreground">
                  <SelectValue placeholder={t("schedules:assign.templatePlaceholder")} />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {templates.map(tpl => (
                    <SelectItem key={tpl.id} value={tpl.id}><bdi>{tpl.name}</bdi></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("schedules:assign.startDate")}</Label>
              <Input
                data-testid="input-assign-start-date"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-background border-input text-foreground"
                dir="ltr"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("schedules:assign.endDate")} <span className="text-zinc-600 normal-case">{t("schedules:assign.endDateOptional")}</span></Label>
            <Input
              data-testid="input-assign-end-date"
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-background border-input text-foreground"
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">
                {t("schedules:assign.employees", { n: formatNumber(selectedIds.size) })}
              </Label>
              <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={toggleAll}>
                {selectedIds.size === filtered.length ? t("schedules:assign.deselectAll") : t("schedules:assign.selectAll")}
              </Button>
            </div>
            <Input
              data-testid="input-assign-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("schedules:assign.searchPlaceholder")}
              className="bg-background border-input text-foreground text-sm h-8"
            />
            <div className="border border-border/50 rounded-lg divide-y divide-border/30 max-h-64 overflow-y-auto">
              {filtered.map(emp => (
                <label
                  key={emp.id}
                  data-testid={`checkbox-assign-${emp.id}`}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/10"
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
                  <span className="font-mono text-xs text-primary" dir="ltr">{emp.employeeNumber}</span>
                  <span className="text-sm text-white"><bdi>{emp.fullNameEn ?? "—"}</bdi></span>
                </label>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-xs text-zinc-500 text-center">{t("schedules:assign.noEmployees")}</div>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2 border-t border-border/40 mt-2">
          <Button variant="outline" className="border-zinc-700" onClick={() => onOpenChange(false)}>{t("schedules:common.cancel")}</Button>
          <Button
            data-testid="button-confirm-assign"
            className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
            disabled={mutation.isPending || !templateId || selectedIds.size === 0}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : null}
            {t("schedules:assign.assignBtn", { count: selectedIds.size, n: formatNumber(selectedIds.size) })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Shifts Tab ────────────────────────────────────────────────────────────────
function ShiftsTab({ shifts }: { shifts: Shift[] }) {
  const { t } = useTranslation(["schedules", "common"]);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Shift | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/shifts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({ title: t("schedules:shifts.shiftDeleted") });
      setDeleteId(null);
    },
    onError: (e: Error) => toast({ title: t("schedules:common.error"), description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">{t("schedules:shifts.countDefined", { count: shifts.length, n: formatNumber(shifts.length) })}</p>
        <Button
          data-testid="button-new-shift"
          size="sm"
          className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4 me-1" /> {t("schedules:shifts.newShift")}
        </Button>
      </div>

      {shifts.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <Clock className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p>{t("schedules:shifts.noShiftsTitle")}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shifts.map(shift => (
            <div
              key={shift.id}
              data-testid={`card-shift-${shift.id}`}
              className="border border-border/50 rounded-lg p-4 bg-muted/[0.06] flex items-start justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-3 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: shift.color }} />
                <div>
                  <div className="font-semibold text-white text-sm"><bdi>{shift.name}</bdi></div>
                  <div className="text-xs text-zinc-400 mt-0.5" dir="ltr">
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
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("schedules:shifts.deleteTitle")}</DialogTitle>
            <DialogDescription className="text-zinc-400">{t("schedules:shifts.deleteDesc")}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" className="border-zinc-700" onClick={() => setDeleteId(null)}>{t("schedules:common.cancel")}</Button>
            <Button
              variant="destructive"
              data-testid="button-confirm-delete-shift"
              disabled={deleteMutation.isPending}
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : null}
              {t("schedules:common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Templates Tab ─────────────────────────────────────────────────────────────
function TemplatesTab({ shifts, templates }: { shifts: Shift[]; templates: ScheduleTemplate[] }) {
  const { t } = useTranslation(["schedules", "common"]);
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
      toast({ title: t("schedules:templates.templateDeleted") });
      setDeleteId(null);
    },
    onError: (e: Error) => toast({ title: t("schedules:common.error"), description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">{t("schedules:templates.countDefined", { count: templates.length, n: formatNumber(templates.length) })}</p>
        <Button
          data-testid="button-new-template"
          size="sm"
          className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
          onClick={() => setCreateOpen(true)}
          disabled={shifts.length === 0}
          title={shifts.length === 0 ? t("schedules:templates.createShiftsFirst") : undefined}
        >
          <Plus className="h-4 w-4 me-1" /> {t("schedules:templates.newTemplate")}
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p>{t("schedules:templates.noTemplatesTitle")} {shifts.length === 0 ? t("schedules:templates.createShiftsHint") : t("schedules:templates.createFirstHint")}</p>
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
              <div key={tpl.id} data-testid={`card-template-${tpl.id}`} className="border border-border/50 rounded-lg bg-muted/[0.06]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                  <div className="font-semibold text-white"><bdi>{tpl.name}</bdi></div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-white" onClick={() => setEditTarget(tpl)} data-testid={`button-edit-template-${tpl.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-red-400" onClick={() => setDeleteId(tpl.id)} data-testid={`button-delete-template-${tpl.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-7 divide-x divide-border/30 p-3 gap-1">
                  {days.map(day => {
                    const shiftId = tpl[dayKeys[day]] as string | null;
                    const shift = shiftId ? shiftById[shiftId] : undefined;
                    return (
                      <div key={day} className="flex flex-col items-center gap-1 px-1">
                        <span className="text-[10px] text-zinc-500 font-medium">{t(DAY_KEYS[day])}</span>
                        {shift ? (
                          <div className="w-full rounded py-1 flex items-center justify-center" style={{ backgroundColor: shift.color + "22" }}>
                            <span className="text-[9px] font-bold" style={{ color: shift.color }}><bdi>{shift.name.slice(0, 3)}</bdi></span>
                          </div>
                        ) : (
                          <div className="w-full rounded py-1 bg-muted/20 flex items-center justify-center">
                            <span className="text-[9px] text-zinc-600">{t("schedules:common.off")}</span>
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
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("schedules:templates.deleteTitle")}</DialogTitle>
            <DialogDescription className="text-zinc-400">{t("schedules:templates.deleteDesc")}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" className="border-zinc-700" onClick={() => setDeleteId(null)}>{t("schedules:common.cancel")}</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : null}
              {t("schedules:common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Roster Tab ────────────────────────────────────────────────────────────────
function RosterTab({ employees, shifts, templates }: { employees: Employee[]; shifts: Shift[]; templates: ScheduleTemplate[] }) {
  const { t, i18n } = useTranslation(["schedules", "common"]);
  const locale = i18n.language;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [rosterView, setRosterView] = useState<"week" | "month">("week");
  const [endAssignId, setEndAssignId] = useState<string | null>(null);
  const [endDate, setEndDate] = useState(localDateStr());

  const { data: assignments = [] } = useQuery<ScheduleAssignment[]>({
    queryKey: ["/api/schedule-assignments"],
    queryFn: () => apiRequest("GET", "/api/schedule-assignments").then(r => r.json()),
  });

  const weekStart = useMemo(() => {
    const now = new Date();
    const d = new Date(now);
    const day = d.getDay();
    const diff = -day;
    d.setDate(d.getDate() + diff + weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [weekOffset]);

  const weekDates = useMemo(() => {
    return DAYS.map((_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return localDateStr(d);
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
    const dayIndex = d.getDay();
    const dayKey = (DAYS[dayIndex] + "ShiftId") as keyof ScheduleTemplate;
    const shiftId = template[dayKey] as string | null;
    return shiftId ? shiftById[shiftId] : undefined;
  }

  const endMutation = useMutation({
    mutationFn: (id: string) => {
      const assignment = assignments.find(a => a.id === id);
      return apiRequest("POST", `/api/schedule-assignments/${id}/end`, { endDate }).then(r => r.json()).then(res => ({ res, workforceId: assignment?.workforceId }));
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/schedule-assignments"] });
      if (data?.workforceId) {
        qc.invalidateQueries({ queryKey: ["/api/schedule-assignments/employee", data.workforceId] });
        qc.invalidateQueries({ queryKey: ["/api/schedule-assignments/employee", data.workforceId, "active"] });
      }
      toast({ title: t("schedules:assign.ended") });
      setEndAssignId(null);
    },
    onError: (e: Error) => toast({ title: t("schedules:common.error"), description: e.message, variant: "destructive" }),
  });

  const formatShortDate = (iso: string) => {
    return formatDate(iso + "T00:00:00", locale, { month: "short", day: "numeric" });
  };

  const monthStart = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    return d;
  }, [monthOffset]);

  const monthLabel = useMemo(() => {
    return formatDate(monthStart, locale, { month: "long", year: "numeric" });
  }, [monthStart, locale]);

  const monthDates = useMemo(() => {
    const days: string[] = [];
    const d = new Date(monthStart);
    while (d.getMonth() === monthStart.getMonth()) {
      days.push(localDateStr(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [monthStart]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="flex rounded-md overflow-hidden border border-border/50 bg-muted/20">
            <button
              onClick={() => setRosterView("week")}
              className={`text-xs font-semibold py-1.5 px-3 transition-colors ${rosterView === "week" ? "bg-[hsl(155,45%,45%)] text-white" : "text-zinc-400 hover:text-white"}`}
              data-testid="button-roster-week"
            >
              {t("schedules:roster.week")}
            </button>
            <button
              onClick={() => setRosterView("month")}
              className={`text-xs font-semibold py-1.5 px-3 transition-colors ${rosterView === "month" ? "bg-[hsl(155,45%,45%)] text-white" : "text-zinc-400 hover:text-white"}`}
              data-testid="button-roster-month"
            >
              {t("schedules:roster.month")}
            </button>
          </div>
          {rosterView === "week" ? (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={() => setWeekOffset(o => o - 1)} data-testid="button-prev-week">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium text-white" dir="ltr">
                {formatShortDate(weekDates[0])} – {formatShortDate(weekDates[6])}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={() => setWeekOffset(o => o + 1)} data-testid="button-next-week">
                <ChevronRight className="h-4 w-4" />
              </Button>
              {weekOffset !== 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => setWeekOffset(0)}>{t("schedules:common.today")}</Button>
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
                <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => setMonthOffset(0)}>{t("schedules:common.today")}</Button>
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
          <Users className="h-4 w-4 me-1" /> {t("schedules:roster.assignSchedule")}
        </Button>
      </div>

      {rosterView === "week" && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-start text-zinc-400 py-2 px-3 font-medium min-w-[160px]">{t("schedules:common.employee")}</th>
                {DAYS.map((day, i) => (
                  <th key={day} className="text-center text-zinc-400 py-2 px-2 font-medium min-w-[80px]">
                    <div>{t(DAY_KEYS[day])}</div>
                    <div className="text-[10px] text-zinc-600" dir="ltr">{formatShortDate(weekDates[i])}</div>
                  </th>
                ))}
                <th className="text-zinc-400 py-2 px-3 font-medium">{t("schedules:roster.schedule")}</th>
              </tr>
            </thead>
            <tbody>
              {activeEmployees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-zinc-500">{t("schedules:common.noActiveEmployees")}</td>
                </tr>
              ) : (
                activeEmployees.map(emp => {
                  const activeAssignment = assignments.find(a => a.workforceId === emp.id && a.endDate == null);
                  const template = activeAssignment ? templateById[activeAssignment.templateId] : undefined;
                  return (
                    <tr key={emp.id} className="border-b border-border/30 hover:bg-muted/[0.08]" data-testid={`row-roster-${emp.id}`}>
                      <td className="py-2 px-3">
                        <div className="font-medium text-white"><bdi>{emp.fullNameEn ?? "—"}</bdi></div>
                        <div className="text-[10px] text-primary font-mono" dir="ltr">{emp.employeeNumber}</div>
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
                                <bdi>{shift.name.slice(0, 4)}</bdi>
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
                            <span className="text-zinc-300 text-xs"><bdi>{template.name}</bdi></span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 text-[10px] text-red-400 hover:text-red-300 px-1"
                              onClick={() => setEndAssignId(activeAssignment!.id)}
                              data-testid={`button-end-assign-${emp.id}`}
                            >
                              {t("schedules:common.end")}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-zinc-600 text-xs">{t("schedules:common.unassigned")}</span>
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
              <tr className="border-b border-border/40">
                <th className="text-start text-zinc-400 py-2 px-3 font-medium min-w-[140px] sticky start-0 bg-card z-10">{t("schedules:common.employee")}</th>
                {monthDates.map(date => {
                  const d = new Date(date + "T00:00:00");
                  const today = localDateStr();
                  return (
                    <th
                      key={date}
                      className={`text-center text-zinc-400 py-2 px-0.5 font-medium min-w-[28px] ${date === today ? "text-primary" : ""}`}
                    >
                      <div className="text-[9px] text-zinc-600">{formatDate(d, locale, { weekday: "narrow" })}</div>
                      <div className={date === today ? "text-primary font-bold" : ""}>{formatNumber(d.getDate())}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {activeEmployees.length === 0 ? (
                <tr>
                  <td colSpan={monthDates.length + 1} className="text-center py-12 text-zinc-500">{t("schedules:common.noActiveEmployees")}</td>
                </tr>
              ) : (
                activeEmployees.map(emp => (
                  <tr key={emp.id} className="border-b border-border/30 hover:bg-muted/[0.08]" data-testid={`row-roster-month-${emp.id}`}>
                    <td className="py-1.5 px-3 sticky start-0 bg-card z-10">
                      <div className="font-medium text-white truncate max-w-[120px]"><bdi>{emp.fullNameEn ?? "—"}</bdi></div>
                      <div className="text-[9px] text-primary font-mono" dir="ltr">{emp.employeeNumber}</div>
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
                              <bdi>{shift.name.slice(0, 1)}</bdi>
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
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("schedules:assign.endTitle")}</DialogTitle>
            <DialogDescription className="text-zinc-400">{t("schedules:assign.endDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("schedules:assign.endDate")}</Label>
              <Input
                data-testid="input-end-date"
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-background border-input text-foreground"
                dir="ltr"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" className="border-zinc-700" onClick={() => setEndAssignId(null)}>{t("schedules:common.cancel")}</Button>
            <Button
              variant="destructive"
              data-testid="button-confirm-end-assign"
              disabled={endMutation.isPending}
              onClick={() => endAssignId && endMutation.mutate(endAssignId)}
            >
              {endMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : null}
              {t("schedules:assign.endAssignment")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Attendance Tab ─────────────────────────────────────────────────────────────
function AttendanceTab({ employees, shifts, templates }: { employees: Employee[]; shifts: Shift[]; templates: ScheduleTemplate[] }) {
  const { t, i18n } = useTranslation(["schedules", "common"]);
  const locale = i18n.language;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<"daily" | "summary">("daily");
  const [selectedDate, setSelectedDate] = useState(localDateStr());
  const [summaryFrom, setSummaryFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return localDateStr(d);
  });
  const [summaryTo, setSummaryTo] = useState(localDateStr());
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

  const [localStatuses, setLocalStatuses] = useState<Record<string, "present" | "absent" | "late" | "excused">>({});
  const [localClockIn, setLocalClockIn] = useState<Record<string, string>>({});
  const [localClockOut, setLocalClockOut] = useState<Record<string, string>>({});

  useEffect(() => {
    setLocalStatuses({});
    setLocalClockIn({});
    setLocalClockOut({});
  }, [selectedDate]);

  const handleStatusChange = (workforceId: string, status: "present" | "absent" | "late" | "excused") => {
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
      toast({ title: t("schedules:attendance.saved") });
    } catch (e) {
      toast({ title: t("schedules:common.error"), description: String(e), variant: "destructive" });
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
    const dayIndex = d.getDay();
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
        <div className="flex rounded-md overflow-hidden border border-border/50 bg-muted/20">
          <button
            onClick={() => setView("daily")}
            className={`text-xs font-semibold py-2 px-4 transition-colors ${view === "daily" ? "bg-[hsl(155,45%,45%)] text-white" : "text-zinc-400 hover:text-white"}`}
            data-testid="tab-attendance-daily"
          >
            {t("schedules:attendance.viewDaily")}
          </button>
          <button
            onClick={() => setView("summary")}
            className={`text-xs font-semibold py-2 px-4 transition-colors ${view === "summary" ? "bg-[hsl(155,45%,45%)] text-white" : "text-zinc-400 hover:text-white"}`}
            data-testid="tab-attendance-summary"
          >
            {t("schedules:attendance.viewSummary")}
          </button>
        </div>
        {view === "daily" && (
          <div className="flex items-center gap-2">
            <Input
              data-testid="input-attendance-date"
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-background border-input text-foreground h-8 text-xs"
              dir="ltr"
            />
            <Button
              data-testid="button-save-attendance"
              size="sm"
              className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
              disabled={saving || scheduledEmployeesWithShift.length === 0}
              onClick={saveAll}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin me-1" /> : null}
              {t("schedules:attendance.saveAttendance")}
            </Button>
          </div>
        )}
        {view === "summary" && (
          <div className="flex items-center gap-2">
            <Label className="text-zinc-400 text-xs">{t("schedules:common.from")}</Label>
            <Input
              data-testid="input-summary-from"
              type="date"
              value={summaryFrom}
              onChange={e => setSummaryFrom(e.target.value)}
              className="bg-background border-input text-foreground h-8 text-xs"
              dir="ltr"
            />
            <Label className="text-zinc-400 text-xs">{t("schedules:common.to")}</Label>
            <Input
              data-testid="input-summary-to"
              type="date"
              value={summaryTo}
              onChange={e => setSummaryTo(e.target.value)}
              className="bg-background border-input text-foreground h-8 text-xs"
              dir="ltr"
            />
          </div>
        )}
      </div>

      {view === "daily" && (
        <>
          {scheduledEmployeesWithShift.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>{t("schedules:attendance.noShiftToday", { date: formatDate(selectedDate + "T00:00:00", locale) })}</p>
              <p className="text-xs mt-1">{t("schedules:attendance.noShiftHint")}</p>
            </div>
          ) : (
            <div className="border border-border/50 rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40 hover:bg-transparent">
                    <TableHead className="text-zinc-400">{t("schedules:common.employee")}</TableHead>
                    <TableHead className="text-zinc-400">{t("schedules:attendance.shift")}</TableHead>
                    <TableHead className="text-zinc-400">{t("schedules:attendance.statusCol")}</TableHead>
                    <TableHead className="text-zinc-400">{t("schedules:attendance.clockIn")}</TableHead>
                    <TableHead className="text-zinc-400">{t("schedules:attendance.clockOut")}</TableHead>
                    <TableHead className="text-zinc-400 text-center">{t("schedules:attendance.minsWorked")}</TableHead>
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
                    const hasMissingClockOut = !!(existing?.clockIn && !existing?.clockOut && existing?.status !== "absent");
                    return (
                      <TableRow key={emp.id} className="border-border/30 hover:bg-muted/[0.08]" data-testid={`row-attendance-${emp.id}`}>
                        <TableCell>
                          <div className="font-medium text-white text-sm"><bdi>{emp.fullNameEn ?? "—"}</bdi></div>
                          <div className="text-[10px] text-primary font-mono" dir="ltr">{emp.employeeNumber}</div>
                        </TableCell>
                        <TableCell>
                          <ShiftBadge shift={shift} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
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
                              <SelectContent className="bg-popover border-border">
                                {ATTENDANCE_STATUSES.map(s => (
                                  <SelectItem key={s.value} value={s.value} className="text-xs">
                                    {t(s.tKey)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {hasMissingClockOut && (
                              <span title={t("schedules:attendance.missingClockOut")} className="text-amber-400" data-testid={`badge-missing-clockout-${emp.id}`}>
                                <AlertCircle className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            data-testid={`input-clockin-${emp.id}`}
                            type="time"
                            value={clockInValue}
                            onChange={e => setLocalClockIn(prev => ({ ...prev, [emp.id]: e.target.value }))}
                            placeholder={formatTime(shift.startTime)}
                            className="bg-background border-input text-foreground h-7 text-xs w-[100px]"
                            dir="ltr"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            data-testid={`input-clockout-${emp.id}`}
                            type="time"
                            value={clockOutValue}
                            onChange={e => setLocalClockOut(prev => ({ ...prev, [emp.id]: e.target.value }))}
                            placeholder={formatTime(shift.endTime)}
                            className="bg-background border-input text-foreground h-7 text-xs w-[100px]"
                            dir="ltr"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs text-zinc-300" data-testid={`text-minutes-${emp.id}`} dir="ltr">
                            {existing?.minutesWorked != null ? `${formatNumber(existing.minutesWorked)}/${existing.minutesScheduled != null ? formatNumber(existing.minutesScheduled) : "—"}` : "—"}
                          </span>
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
              <p>{t("schedules:attendance.noSummaryData")}</p>
            </div>
          ) : (
            <div className="border border-border/50 rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40 hover:bg-transparent">
                    <TableHead className="text-zinc-400">{t("schedules:common.employee")}</TableHead>
                    <TableHead className="text-zinc-400 text-center">{t("schedules:attendance.worked")}</TableHead>
                    <TableHead className="text-zinc-400 text-center">{t("schedules:attendance.status.absent")}</TableHead>
                    <TableHead className="text-zinc-400 text-center">{t("schedules:attendance.late")}</TableHead>
                    <TableHead className="text-zinc-400 text-center">{t("schedules:attendance.excused")}</TableHead>
                    <TableHead className="text-zinc-400 text-center">{t("schedules:attendance.lateMins")}</TableHead>
                    <TableHead className="text-zinc-400 text-center">{t("schedules:attendance.totalCol")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryData.map(row => (
                    <TableRow key={row.workforceId} className="border-border/30 hover:bg-muted/[0.08]" data-testid={`row-summary-${row.workforceId}`}>
                      <TableCell>
                        <div className="font-medium text-white text-sm"><bdi>{row.fullNameEn ?? "—"}</bdi></div>
                        <div className="text-[10px] text-primary font-mono" dir="ltr">{row.employeeNumber}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 border text-xs" data-testid={`text-worked-${row.workforceId}`}>
                          {formatNumber(row.workedDays)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-red-400 text-sm">{formatNumber(row.absentDays)}</TableCell>
                      <TableCell className="text-center text-yellow-400 text-sm">{formatNumber(row.lateDays)}</TableCell>
                      <TableCell className="text-center text-blue-400 text-sm">{formatNumber(row.excusedDays)}</TableCell>
                      <TableCell className="text-center text-amber-400 text-sm" data-testid={`text-late-mins-${row.workforceId}`}>{formatNumber(row.totalMinutesLate)}</TableCell>
                      <TableCell className="text-center text-zinc-400 text-sm">{formatNumber(row.totalScheduledDays)}</TableCell>
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

// ─── Dashboard Tab ──────────────────────────────────────────────────────────────
type DashboardStats = {
  totals: {
    present: number; absent: number; late: number; excused: number;
    totalRecords: number; totalMinutesWorked: number; totalMinutesScheduled: number; totalMinutesLate: number;
  };
  topLate: WorkedDaySummary[];
  topAbsent: WorkedDaySummary[];
};

function DashboardTab() {
  const { t } = useTranslation(["schedules", "common"]);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return localDateStr(d);
  });
  const [dateTo, setDateTo] = useState(localDateStr());

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/attendance/dashboard-stats", dateFrom, dateTo],
    queryFn: () => apiRequest("GET", `/api/attendance/dashboard-stats?dateFrom=${dateFrom}&dateTo=${dateTo}`).then(r => r.json()),
  });

  const { data: pendingExcuses } = useQuery<{ count: number }>({
    queryKey: ["/api/excuse-requests/pending-count"],
    queryFn: () => apiRequest("GET", "/api/excuse-requests/pending-count").then(r => r.json()),
  });

  const handleExport = (format: "csv" | "xlsx") => {
    window.open(`/api/attendance/export-lateness?dateFrom=${dateFrom}&dateTo=${dateTo}&format=${format}`, "_blank");
  };

  const totals = stats?.totals ?? { present: 0, absent: 0, late: 0, excused: 0, totalRecords: 0, totalMinutesWorked: 0, totalMinutesScheduled: 0, totalMinutesLate: 0 };
  const attendanceRate = totals.totalRecords > 0 ? Math.round((totals.present / totals.totalRecords) * 100) : 0;

  const statCards = [
    { key: "present-days", label: t("schedules:dashboard.stats.presentDays"), value: formatNumber(totals.present), color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", icon: CheckCircle2 },
    { key: "absent-days", label: t("schedules:dashboard.stats.absentDays"), value: formatNumber(totals.absent), color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", icon: XCircle },
    { key: "late-days", label: t("schedules:dashboard.stats.lateDays"), value: formatNumber(totals.late), color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", icon: AlertCircle },
    { key: "total-late-minutes", label: t("schedules:dashboard.stats.totalLateMinutes"), value: formatNumber(totals.totalMinutesLate), color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30", icon: TrendingUp },
    { key: "attendance-rate", label: t("schedules:dashboard.stats.attendanceRate"), value: `${formatNumber(attendanceRate)}%`, color: "text-primary", bg: "bg-primary/10 border-primary/30", icon: BarChart3 },
    { key: "excused-days", label: t("schedules:dashboard.stats.excusedDays"), value: formatNumber(totals.excused), color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30", icon: Shield },
    { key: "pending-excuses", label: t("schedules:dashboard.stats.pendingExcuses"), value: formatNumber(pendingExcuses?.count ?? 0), color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", icon: MessageCircle },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-zinc-400 text-xs">{t("schedules:common.from")}</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-background border-input text-foreground h-8 text-xs w-[140px]" data-testid="input-dashboard-from" dir="ltr" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-zinc-400 text-xs">{t("schedules:common.to")}</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-background border-input text-foreground h-8 text-xs w-[140px]" data-testid="input-dashboard-to" dir="ltr" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">{t("schedules:dashboard.loading")}</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {statCards.map(sc => (
              <div key={sc.key} className={`rounded-lg border p-3 ${sc.bg}`} data-testid={`stat-card-${sc.key}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <sc.icon className={`h-3.5 w-3.5 ${sc.color}`} />
                  <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">{sc.label}</span>
                </div>
                <span className={`text-xl font-bold ${sc.color}`}>{sc.value}</span>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white font-display">{t("schedules:dashboard.topLate")}</h3>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleExport("csv")} data-testid="button-export-csv">
                    <Download className="h-3 w-3" /> {t("schedules:dashboard.csv")}
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleExport("xlsx")} data-testid="button-export-xlsx">
                    <Download className="h-3 w-3" /> {t("schedules:dashboard.excel")}
                  </Button>
                </div>
              </div>
              <div className="border border-border/50 rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/40 hover:bg-transparent">
                      <TableHead className="text-zinc-400 text-xs">#</TableHead>
                      <TableHead className="text-zinc-400 text-xs">{t("schedules:common.employee")}</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-center">{t("schedules:dashboard.stats.lateDays")}</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-center">{t("schedules:attendance.lateMins")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(stats?.topLate ?? []).filter(r => r.totalMinutesLate > 0).map((row, i) => (
                      <TableRow key={row.workforceId} className="border-border/30 hover:bg-muted/[0.08]" data-testid={`row-top-late-${row.workforceId}`}>
                        <TableCell className="text-zinc-500 text-xs">{formatNumber(i + 1)}</TableCell>
                        <TableCell>
                          <div className="text-sm text-white font-medium"><bdi>{row.fullNameEn ?? "—"}</bdi></div>
                          <div className="text-[10px] text-primary font-mono" dir="ltr">{row.employeeNumber}</div>
                        </TableCell>
                        <TableCell className="text-center text-yellow-400 text-sm">{formatNumber(row.lateDays)}</TableCell>
                        <TableCell className="text-center text-amber-400 text-sm font-bold">{formatNumber(row.totalMinutesLate)}</TableCell>
                      </TableRow>
                    ))}
                    {(stats?.topLate ?? []).filter(r => r.totalMinutesLate > 0).length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-zinc-500 py-8 text-sm">{t("schedules:dashboard.noLateness")}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-white font-display mb-3">{t("schedules:dashboard.topAbsent")}</h3>
              <div className="border border-border/50 rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/40 hover:bg-transparent">
                      <TableHead className="text-zinc-400 text-xs">#</TableHead>
                      <TableHead className="text-zinc-400 text-xs">{t("schedules:common.employee")}</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-center">{t("schedules:dashboard.stats.absentDays")}</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-center">{t("schedules:attendance.scheduled")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(stats?.topAbsent ?? []).filter(r => r.absentDays > 0).map((row, i) => (
                      <TableRow key={row.workforceId} className="border-border/30 hover:bg-muted/[0.08]" data-testid={`row-top-absent-${row.workforceId}`}>
                        <TableCell className="text-zinc-500 text-xs">{formatNumber(i + 1)}</TableCell>
                        <TableCell>
                          <div className="text-sm text-white font-medium"><bdi>{row.fullNameEn ?? "—"}</bdi></div>
                          <div className="text-[10px] text-primary font-mono" dir="ltr">{row.employeeNumber}</div>
                        </TableCell>
                        <TableCell className="text-center text-red-400 text-sm font-bold">{formatNumber(row.absentDays)}</TableCell>
                        <TableCell className="text-center text-zinc-400 text-sm">{formatNumber(row.totalScheduledDays)}</TableCell>
                      </TableRow>
                    ))}
                    {(stats?.topAbsent ?? []).filter(r => r.absentDays > 0).length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-zinc-500 py-8 text-sm">{t("schedules:dashboard.noAbsence")}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function SchedulesPage() {
  const { t } = useTranslation(["schedules", "common"]);
  const [tab, setTab] = useState<"dashboard" | "shifts" | "templates" | "roster" | "attendance">("dashboard");

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
    { key: "dashboard", label: t("schedules:tabs.dashboard"), icon: LayoutDashboard },
    { key: "shifts", label: t("schedules:tabs.shifts"), icon: Clock },
    { key: "templates", label: t("schedules:tabs.templates"), icon: Calendar },
    { key: "roster", label: t("schedules:tabs.roster"), icon: Users },
    { key: "attendance", label: t("schedules:tabs.attendance"), icon: ClipboardList },
  ] as const;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">{t("schedules:page.title")}</h1>
          <p className="text-zinc-400 text-sm mt-1">{t("schedules:page.subtitle")}</p>
        </div>

        <div className="flex rounded-md overflow-hidden border border-border/50 bg-muted/20 w-fit">
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

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-3 text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">{t("schedules:page.loading")}</span>
              </div>
            ) : (
              <>
                {tab === "dashboard" && <DashboardTab />}
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
