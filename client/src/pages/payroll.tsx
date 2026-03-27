import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Banknote,
  Users,
  Clock,
  CheckCircle2,
  Search,
  Download,
  Plus,
  TrendingUp,
  AlertCircle,
  Calendar,
} from "lucide-react";
import { useState } from "react";

const payrollRuns = [
  {
    id: "PR-2026-04",
    period: "April 2026",
    season: "Hajj 2026",
    employees: 1240,
    totalAmount: 7_440_000,
    status: "draft",
    dueDate: "2026-04-30",
  },
  {
    id: "PR-2026-03",
    period: "March 2026",
    season: "Ramadan 2026",
    employees: 1850,
    totalAmount: 9_250_000,
    status: "processing",
    dueDate: "2026-03-31",
  },
  {
    id: "PR-2026-02",
    period: "February 2026",
    season: "Ramadan 2026",
    employees: 1200,
    totalAmount: 6_000_000,
    status: "paid",
    dueDate: "2026-02-28",
  },
  {
    id: "PR-2025-09",
    period: "September 2025",
    season: "National Day 2025",
    employees: 800,
    totalAmount: 4_800_000,
    status: "paid",
    dueDate: "2025-09-25",
  },
];

const employeePayroll = [
  { name: "Faisal Alam", id: "1071793537", role: "Crowd Management Officer", season: "Hajj 2026", salary: 5250, status: "pending", bank: "Al Rajhi Bank" },
  { name: "Ahmad Al-Harbi", id: "1082345678", role: "Food Service Coordinator", season: "Ramadan 2026", salary: 4200, status: "paid", bank: "SNB" },
  { name: "Mohammed Al-Zahrani", id: "1093456789", role: "Shuttle Bus Driver", season: "Hajj 2026", salary: 6000, status: "pending", bank: "Riyad Bank" },
  { name: "Khalid Al-Otaibi", id: "1034567890", role: "Translation Officer", season: "Hajj 2026", salary: 7500, status: "on-hold", bank: "SABB" },
  { name: "Omar Al-Ghamdi", id: "1045678901", role: "Crowd Management Officer", season: "Ramadan 2026", salary: 5000, status: "paid", bank: "Al Rajhi Bank" },
  { name: "Nasser Al-Shehri", id: "1056789012", role: "Supervisor", season: "Hajj 2026", salary: 4800, status: "pending", bank: "SNB" },
];

const statusBadge: Record<string, string> = {
  draft:      "bg-muted/60 text-muted-foreground",
  processing: "bg-amber-500/15 text-amber-400",
  paid:       "bg-emerald-500/15 text-emerald-400",
  "on-hold":  "bg-red-500/15 text-red-400",
  pending:    "bg-blue-500/15 text-blue-400",
};

const statusLabel: Record<string, string> = {
  draft:      "Draft",
  processing: "Processing",
  paid:       "Paid",
  "on-hold":  "On Hold",
  pending:    "Pending",
};

export default function PayrollPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = employeePayroll.filter((e) => {
    const matchesSearch =
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.id.includes(search) ||
      e.role.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <DashboardLayout>
      <div className="p-6 md:p-8 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-white tracking-tight">Payroll</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Manage seasonal employee compensation and payment runs
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="border-border bg-background hover:bg-muted gap-2 text-sm rounded-sm" data-testid="button-export-payroll">
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 text-sm rounded-sm font-bold uppercase tracking-wide" data-testid="button-new-payrun">
              <Plus className="h-4 w-4" />
              New Pay Run
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Payroll (MTD)", value: "SAR 16.69M", icon: Banknote, color: "text-primary", sub: "+12% vs last month" },
            { label: "Employees on Payroll", value: "3,090", icon: Users, color: "text-blue-400", sub: "Across 2 active events" },
            { label: "Pending Payments", value: "SAR 7.44M", icon: Clock, color: "text-amber-400", sub: "April run not yet processed" },
            { label: "Completed Runs", value: "2", icon: CheckCircle2, color: "text-emerald-400", sub: "SAR 10.8M disbursed" },
          ].map((stat) => (
            <Card key={stat.label} className="bg-card border-border rounded-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{stat.label}</p>
                    <p className="text-2xl font-display font-bold text-white mt-1">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
                  </div>
                  <div className={`p-2.5 rounded-sm bg-muted/40 ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pay Runs */}
        <Card className="bg-card border-border rounded-sm">
          <CardHeader className="px-6 py-4 border-b border-border/50">
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-base font-bold text-white flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Pay Runs
              </CardTitle>
              <Badge variant="outline" className="border-border text-muted-foreground text-xs">{payrollRuns.length} runs</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium pl-6">Run ID</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Period</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Event</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium text-right">Employees</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium text-right">Total (SAR)</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Due Date</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium pr-6"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrollRuns.map((run) => (
                  <TableRow key={run.id} className="border-border/30 hover:bg-muted/20 transition-colors" data-testid={`row-payrun-${run.id}`}>
                    <TableCell className="pl-6 font-mono text-xs text-muted-foreground">{run.id}</TableCell>
                    <TableCell className="text-sm font-medium text-white">{run.period}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{run.season}</TableCell>
                    <TableCell className="text-sm text-right text-white">{run.employees.toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-right font-medium text-white">{run.totalAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{run.dueDate}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs border-0 ${statusBadge[run.status]}`}>{statusLabel[run.status]}</Badge>
                    </TableCell>
                    <TableCell className="pr-6">
                      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground h-7 px-3 rounded-sm" data-testid={`button-view-payrun-${run.id}`}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Employee Payroll */}
        <Card className="bg-card border-border rounded-sm">
          <CardHeader className="px-6 py-4 border-b border-border/50">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="font-display text-base font-bold text-white flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Employee Payroll
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search employees..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-8 w-52 bg-muted/30 border-border text-sm rounded-sm"
                    data-testid="input-payroll-search"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-32 bg-muted/30 border-border text-sm rounded-sm" data-testid="select-payroll-status">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="on-hold">On Hold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium pl-6">Employee</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Role</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Event</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Bank</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium text-right">Salary (SAR)</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium pr-6"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                      No employees match your search.
                    </TableCell>
                  </TableRow>
                ) : filtered.map((emp, idx) => (
                  <TableRow key={idx} className="border-border/30 hover:bg-muted/20 transition-colors" data-testid={`row-employee-${emp.id}`}>
                    <TableCell className="pl-6">
                      <div>
                        <p className="text-sm font-medium text-white">{emp.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{emp.id}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{emp.role}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{emp.season}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{emp.bank}</TableCell>
                    <TableCell className="text-sm text-right font-medium text-white">{emp.salary.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {emp.status === "on-hold" && <AlertCircle className="h-3.5 w-3.5 text-red-400" />}
                        <Badge className={`text-xs border-0 ${statusBadge[emp.status]}`}>{statusLabel[emp.status]}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="pr-6">
                      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground h-7 px-3 rounded-sm" data-testid={`button-payslip-${emp.id}`}>
                        Payslip
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
