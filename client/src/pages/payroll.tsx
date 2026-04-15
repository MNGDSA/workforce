import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Banknote, Users, Clock, CheckCircle2, Plus, Calendar, ArrowLeft,
  Download, Upload, DollarSign, AlertTriangle, Ban, Coins, FileText,
  CreditCard, Landmark, Search,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const statusBadge: Record<string, string> = {
  draft: "bg-muted/60 text-muted-foreground",
  processing: "bg-blue-500/15 text-blue-400",
  t1_paid: "bg-amber-500/15 text-amber-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  pending: "bg-blue-500/15 text-blue-400",
  paid: "bg-emerald-500/15 text-emerald-400",
  blocked: "bg-red-500/15 text-red-400",
};

const statusLabel: Record<string, string> = {
  draft: "Draft",
  processing: "Processing",
  t1_paid: "T1 Paid",
  completed: "Completed",
  pending: "Pending",
  paid: "Paid",
  blocked: "Blocked",
};

export default function PayrollPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState<any>(null);
  const [showOverrideSheet, setShowOverrideSheet] = useState(false);
  const [search, setSearch] = useState("");

  const [createForm, setCreateForm] = useState({
    name: "", eventId: "", dateFrom: "", dateTo: "", mode: "full",
    splitPercentage: 70, tranche1DepositDate: "", tranche2DepositDate: "",
  });

  const { data: payRuns = [] } = useQuery<any[]>({
    queryKey: ["/api/pay-runs"],
    queryFn: () => apiRequest("GET", "/api/pay-runs").then(r => r.json()),
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
    queryFn: () => apiRequest("GET", "/api/events").then(r => r.json()),
  });

  const { data: runDetail } = useQuery<any>({
    queryKey: ["/api/pay-runs", selectedRunId],
    queryFn: () => apiRequest("GET", `/api/pay-runs/${selectedRunId}`).then(r => r.json()),
    enabled: !!selectedRunId,
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/pay-runs", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/pay-runs"] }); setShowCreateDialog(false); toast({ title: "Pay run created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const processMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/pay-runs/${id}/process`).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/pay-runs"] }); toast({ title: "Pay run processed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const markT1Mut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/pay-runs/${id}/mark-t1-paid`).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/pay-runs"] }); toast({ title: "Tranche 1 marked as paid" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const recordPaymentMut = useMutation({
    mutationFn: (data: { runId: string; lineId: string; bankTransactionId: string; trancheNumber: number; depositDate: string }) =>
      apiRequest("POST", `/api/pay-runs/${data.runId}/lines/${data.lineId}/record-payment`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/pay-runs"] }); setShowPaymentDialog(null); toast({ title: "Payment recorded" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const totalPayroll = payRuns.reduce((s: number, r: any) => s + (r.totalAmount ?? 0), 0);
  const totalEmployees = payRuns.filter((r: any) => r.status !== "completed").reduce((s: number, r: any) => s + (r.employeeCount ?? 0), 0);
  const completedRuns = payRuns.filter((r: any) => r.status === "completed").length;
  const pendingAmount = payRuns.filter((r: any) => r.status !== "completed").reduce((s: number, r: any) => s + (r.totalAmount ?? 0), 0);

  function handleEventChange(eventId: string) {
    setCreateForm(prev => {
      const ev = events.find((e: any) => e.id === eventId);
      return { ...prev, eventId, dateFrom: ev?.startDate ?? prev.dateFrom, dateTo: ev?.endDate ?? prev.dateTo };
    });
  }

  function handleCreateSubmit() {
    createMut.mutate({
      ...createForm,
      eventId: createForm.eventId && createForm.eventId !== "none" ? createForm.eventId : null,
      splitPercentage: createForm.mode === "split" ? createForm.splitPercentage : null,
      tranche2DepositDate: createForm.mode === "split" ? createForm.tranche2DepositDate : null,
    });
  }

  if (selectedRunId && runDetail) {
    return <PayRunDetail
      run={runDetail}
      onBack={() => setSelectedRunId(null)}
      onProcess={() => processMut.mutate(runDetail.id)}
      onMarkT1Paid={() => markT1Mut.mutate(runDetail.id)}
      showImportDialog={showImportDialog}
      setShowImportDialog={setShowImportDialog}
      showPaymentDialog={showPaymentDialog}
      setShowPaymentDialog={setShowPaymentDialog}
      recordPaymentMut={recordPaymentMut}
      showOverrideSheet={showOverrideSheet}
      setShowOverrideSheet={setShowOverrideSheet}
      search={search}
      setSearch={setSearch}
    />;
  }

  return (
    <DashboardLayout>
      <div className="p-6 md:p-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-white tracking-tight">Payroll</h1>
            <p className="text-muted-foreground mt-1 text-sm">Manage pay runs, settlements, and payment tracking</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 text-sm rounded-sm font-bold uppercase tracking-wide" data-testid="button-new-payrun">
            <Plus className="h-4 w-4" /> New Pay Run
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Payroll", value: `SAR ${(totalPayroll / 1000).toFixed(1)}K`, icon: Banknote, color: "text-primary" },
            { label: "Employees on Payroll", value: String(totalEmployees), icon: Users, color: "text-blue-400" },
            { label: "Pending", value: `SAR ${(pendingAmount / 1000).toFixed(1)}K`, icon: Clock, color: "text-amber-400" },
            { label: "Completed Runs", value: String(completedRuns), icon: CheckCircle2, color: "text-emerald-400" },
          ].map(stat => (
            <Card key={stat.label} className="bg-card border-border rounded-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{stat.label}</p>
                    <p className="text-2xl font-display font-bold text-white mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-2.5 rounded-sm bg-muted/40 ${stat.color}`}><stat.icon className="h-5 w-5" /></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-card border-border rounded-sm">
          <CardHeader className="px-6 py-4 border-b border-border/50">
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-base font-bold text-white flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" /> Pay Runs
              </CardTitle>
              <Badge variant="outline" className="border-border text-muted-foreground text-xs">{payRuns.length} runs</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium pl-6">Name</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Event</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Period</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Mode</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium text-right">Employees</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium text-right">Total (SAR)</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium pr-6"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payRuns.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">No pay runs yet. Create your first one.</TableCell></TableRow>
                ) : payRuns.map((run: any) => (
                  <TableRow key={run.id} className="border-border/30 hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setSelectedRunId(run.id)} data-testid={`row-payrun-${run.id}`}>
                    <TableCell className="pl-6 text-sm font-medium text-white">{run.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{run.eventName ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{run.dateFrom} → {run.dateTo}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs border-0 ${run.mode === "split" ? "bg-purple-500/15 text-purple-400" : "bg-muted/60 text-muted-foreground"}`}>
                        {run.mode === "split" ? `Split ${run.splitPercentage}/${100 - (run.splitPercentage ?? 0)}` : "Full"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-right text-white">{run.employeeCount ?? 0}</TableCell>
                    <TableCell className="text-sm text-right font-medium text-white">{(run.totalAmount ?? 0).toLocaleString()}</TableCell>
                    <TableCell><Badge className={`text-xs border-0 ${statusBadge[run.status]}`}>{statusLabel[run.status]}</Badge></TableCell>
                    <TableCell className="pr-6">
                      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground h-7 px-3 rounded-sm" data-testid={`button-view-payrun-${run.id}`}>View</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-card border-border rounded-sm max-w-lg">
          <DialogHeader><DialogTitle className="font-display text-white">Create Pay Run</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
              <Input value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Ramadan 2026 — Final" className="bg-muted/30 border-border rounded-sm mt-1" data-testid="input-payrun-name" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Event (optional)</Label>
              <Select value={createForm.eventId} onValueChange={handleEventChange}>
                <SelectTrigger className="bg-muted/30 border-border rounded-sm mt-1" data-testid="select-payrun-event"><SelectValue placeholder="Select event" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Event</SelectItem>
                  {events.map((ev: any) => <SelectItem key={ev.id} value={ev.id}>{ev.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Date From</Label>
                <Input type="date" value={createForm.dateFrom} onChange={e => setCreateForm(p => ({ ...p, dateFrom: e.target.value }))} className="bg-muted/30 border-border rounded-sm mt-1" data-testid="input-payrun-datefrom" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Date To</Label>
                <Input type="date" value={createForm.dateTo} onChange={e => setCreateForm(p => ({ ...p, dateTo: e.target.value }))} className="bg-muted/30 border-border rounded-sm mt-1" data-testid="input-payrun-dateto" />
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Mode</Label>
              <Select value={createForm.mode} onValueChange={v => setCreateForm(p => ({ ...p, mode: v }))}>
                <SelectTrigger className="bg-muted/30 border-border rounded-sm mt-1" data-testid="select-payrun-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full — Single Payment</SelectItem>
                  <SelectItem value="split">Split — Two Tranches</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createForm.mode === "split" && (
              <div className="space-y-4 p-4 bg-purple-500/5 border border-purple-500/20 rounded-sm">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-purple-400">Split Percentage (Tranche 1)</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input type="number" min={1} max={99} value={createForm.splitPercentage} onChange={e => setCreateForm(p => ({ ...p, splitPercentage: parseInt(e.target.value) || 70 }))} className="bg-muted/30 border-border rounded-sm w-20" data-testid="input-payrun-split-pct" />
                    <span className="text-sm text-muted-foreground">% / {100 - createForm.splitPercentage}%</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-purple-400">T1 Deposit Date</Label>
                    <Input type="date" value={createForm.tranche1DepositDate} onChange={e => setCreateForm(p => ({ ...p, tranche1DepositDate: e.target.value }))} className="bg-muted/30 border-border rounded-sm mt-1" data-testid="input-payrun-t1-date" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-purple-400">T2 Deposit Date</Label>
                    <Input type="date" value={createForm.tranche2DepositDate} onChange={e => setCreateForm(p => ({ ...p, tranche2DepositDate: e.target.value }))} className="bg-muted/30 border-border rounded-sm mt-1" data-testid="input-payrun-t2-date" />
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="rounded-sm">Cancel</Button>
            <Button onClick={handleCreateSubmit} disabled={!createForm.name || !createForm.dateFrom || !createForm.dateTo || createMut.isPending} className="bg-primary hover:bg-primary/90 rounded-sm" data-testid="button-submit-payrun">
              {createMut.isPending ? "Creating..." : "Create Pay Run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function PayRunDetail({ run, onBack, onProcess, onMarkT1Paid, showImportDialog, setShowImportDialog, showPaymentDialog, setShowPaymentDialog, recordPaymentMut, showOverrideSheet, setShowOverrideSheet, search, setSearch }: any) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importCols, setImportCols] = useState({ ibanColumn: "", txnIdColumn: "" });
  const [paymentForm, setPaymentForm] = useState({ bankTransactionId: "", depositDate: "", trancheNumber: 1 });
  const [overrideForm, setOverrideForm] = useState({ date: "", reason: "", mode: "bulk" });

  const lines: any[] = run.lines ?? [];
  const bankLines = lines.filter((l: any) => l.paymentMethod === "bank_transfer");
  const cashLines = lines.filter((l: any) => l.paymentMethod === "cash");
  const filteredLines = lines.filter((l: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return l.employeeNumber?.toLowerCase().includes(s) || l.candidate?.fullNameEn?.toLowerCase().includes(s);
  });

  const t2Blocked = lines.filter((l: any) => l.tranche2Status === "blocked").length;
  const t2Ready = lines.filter((l: any) => l.tranche2Status === "pending").length;

  const importMut = useMutation({
    mutationFn: async () => {
      if (!importFile) throw new Error("No file");
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("ibanColumn", importCols.ibanColumn);
      formData.append("txnIdColumn", importCols.txnIdColumn);
      formData.append("depositDate", new Date().toISOString().slice(0, 10));
      const res = await fetch(`/api/pay-runs/${run.id}/import-bank-response`, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/pay-runs"] });
      setShowImportDialog(false);
      toast({ title: `Import complete: ${data.matched} matched, ${data.skipped} skipped, ${data.notFound} not found` });
    },
  });

  const overrideMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/payroll-adjustments/bulk", data).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: `Override applied to ${data.created} employees` });
      setShowOverrideSheet(false);
    },
  });

  const thClasses = "text-[10px] uppercase tracking-wider font-semibold px-3 py-2 whitespace-nowrap";

  return (
    <DashboardLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="rounded-sm h-8 px-2" data-testid="button-back-payroll">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold text-white tracking-tight">{run.name}</h1>
            <p className="text-muted-foreground text-sm">
              {run.eventName ? `${run.eventName} · ` : ""}{run.dateFrom} → {run.dateTo}
              {run.mode === "split" && <span className="ml-2 text-purple-400">· Split {run.splitPercentage}/{100 - (run.splitPercentage ?? 0)}</span>}
            </p>
          </div>
          <Badge className={`text-xs border-0 ${statusBadge[run.status]}`}>{statusLabel[run.status]}</Badge>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="bg-card border-border rounded-sm"><CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Net</p>
            <p className="text-xl font-display font-bold text-white mt-1">SAR {(run.totalAmount ?? 0).toLocaleString()}</p>
          </CardContent></Card>
          <Card className="bg-card border-border rounded-sm"><CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Employees</p>
            <p className="text-xl font-display font-bold text-white mt-1">{lines.length} <span className="text-sm font-normal text-muted-foreground">({bankLines.length} bank, {cashLines.length} cash)</span></p>
          </CardContent></Card>
          {run.mode === "split" && (
            <>
              <Card className="bg-card border-border rounded-sm"><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">T2 Ready</p>
                <p className="text-xl font-display font-bold text-emerald-400 mt-1">{t2Ready}</p>
              </CardContent></Card>
              <Card className="bg-card border-border rounded-sm"><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">T2 Blocked</p>
                <p className="text-xl font-display font-bold text-red-400 mt-1">{t2Blocked} <span className="text-xs font-normal text-muted-foreground">pending offboarding</span></p>
              </CardContent></Card>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {run.status === "draft" && (
            <Button onClick={onProcess} className="bg-primary hover:bg-primary/90 rounded-sm gap-2 text-sm" data-testid="button-process-payrun">
              <CheckCircle2 className="h-4 w-4" /> Process Pay Run
            </Button>
          )}
          {(run.status === "processing" || run.status === "t1_paid") && (
            <>
              {run.status === "processing" && (
                <Button onClick={onMarkT1Paid} className="bg-emerald-600 hover:bg-emerald-700 rounded-sm gap-2 text-sm" data-testid="button-mark-t1-paid">
                  <DollarSign className="h-4 w-4" /> Mark T1 Paid
                </Button>
              )}
              <Button variant="outline" onClick={() => setShowImportDialog(true)} className="rounded-sm gap-2 text-sm border-border" data-testid="button-import-bank">
                <Upload className="h-4 w-4" /> Import Bank Response
              </Button>
              <Button variant="outline" onClick={() => window.open(`/api/pay-runs/${run.id}/export-for-bank`, "_blank")} className="rounded-sm gap-2 text-sm border-border" data-testid="button-export-bank">
                <Landmark className="h-4 w-4" /> Export for Bank
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => window.open(`/api/pay-runs/${run.id}/export?format=csv`, "_blank")} className="rounded-sm gap-2 text-sm border-border" data-testid="button-export-csv">
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" onClick={() => setShowOverrideSheet(true)} className="rounded-sm gap-2 text-sm border-border" data-testid="button-override">
            <AlertTriangle className="h-4 w-4" /> Override
          </Button>
        </div>

        <Card className="bg-card border-border rounded-sm">
          <CardHeader className="px-4 py-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-sm font-bold text-white">Employee Payroll</CardTitle>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-7 w-48 bg-muted/30 border-border text-xs rounded-sm" data-testid="input-payrun-search" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className={`${thClasses} pl-4 text-white sticky left-0 bg-card z-10`}>Employee</TableHead>
                  <TableHead className={`${thClasses} text-emerald-400 bg-emerald-500/5`}>Base Salary</TableHead>
                  <TableHead className={`${thClasses} text-emerald-400 bg-emerald-500/5`}>Days Worked</TableHead>
                  <TableHead className={`${thClasses} text-emerald-400 bg-emerald-500/5`}>Excused</TableHead>
                  <TableHead className={`${thClasses} text-emerald-400 bg-emerald-500/5`}>Manual +</TableHead>
                  <TableHead className={`${thClasses} text-emerald-400 bg-emerald-500/5 font-bold`}>Gross Earned</TableHead>
                  <TableHead className={`${thClasses} text-red-400 bg-red-500/5`}>Absent</TableHead>
                  <TableHead className={`${thClasses} text-red-400 bg-red-500/5`}>Late</TableHead>
                  <TableHead className={`${thClasses} text-red-400 bg-red-500/5`}>Assets</TableHead>
                  <TableHead className={`${thClasses} text-red-400 bg-red-500/5`}>Manual -</TableHead>
                  <TableHead className={`${thClasses} text-red-400 bg-red-500/5 font-bold`}>Total Ded.</TableHead>
                  <TableHead className={`${thClasses} text-white font-bold`}>Net Payable</TableHead>
                  {run.mode === "split" && (
                    <>
                      <TableHead className={`${thClasses} text-purple-400`}>T1</TableHead>
                      <TableHead className={`${thClasses} text-purple-400`}>T2</TableHead>
                    </>
                  )}
                  <TableHead className={`${thClasses} text-white`}>Txn</TableHead>
                  <TableHead className={`${thClasses} pr-4`}></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLines.length === 0 ? (
                  <TableRow><TableCell colSpan={16} className="text-center py-12 text-muted-foreground text-sm">{run.status === "draft" ? "Process the pay run to generate employee lines." : "No employees match."}</TableCell></TableRow>
                ) : filteredLines.map((line: any) => {
                  const txns = line.transactions ?? [];
                  const t1Txn = txns.find((t: any) => t.trancheNumber === 1);
                  const t2Txn = txns.find((t: any) => t.trancheNumber === 2);
                  const cellClass = "px-3 py-2 text-xs";
                  return (
                    <TableRow key={line.id} className="border-border/30 hover:bg-muted/20 transition-colors" data-testid={`row-payline-${line.employeeNumber}`}>
                      <TableCell className={`${cellClass} pl-4 sticky left-0 bg-card z-10`}>
                        <div>
                          <p className="font-medium text-white text-xs">{line.candidate?.fullNameEn ?? line.employeeNumber}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{line.employeeNumber}</p>
                          {line.paymentMethod === "cash" && <Badge className="text-[9px] mt-0.5 bg-amber-500/15 text-amber-400 border-0">Cash</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className={`${cellClass} bg-emerald-500/[0.02] text-right`}>{parseFloat(line.baseSalary).toLocaleString()}</TableCell>
                      <TableCell className={`${cellClass} bg-emerald-500/[0.02] text-right`}>{line.daysWorked}</TableCell>
                      <TableCell className={`${cellClass} bg-emerald-500/[0.02] text-right`}>{line.excusedDays > 0 ? <span className="text-emerald-400">{line.excusedDays}</span> : "—"}</TableCell>
                      <TableCell className={`${cellClass} bg-emerald-500/[0.02] text-right`}>{parseFloat(line.totalManualAdditions) > 0 ? <span className="text-emerald-400">+{parseFloat(line.totalManualAdditions).toLocaleString()}</span> : "—"}</TableCell>
                      <TableCell className={`${cellClass} bg-emerald-500/[0.02] text-right font-bold text-emerald-400`}>{parseFloat(line.grossEarned).toLocaleString()}</TableCell>
                      <TableCell className={`${cellClass} bg-red-500/[0.02] text-right`}>{line.absentDays > 0 ? <span className="text-red-400">{line.absentDays}d (-{parseFloat(line.absentDeduction).toLocaleString()})</span> : "—"}</TableCell>
                      <TableCell className={`${cellClass} bg-red-500/[0.02] text-right`}>{line.lateMinutes > 0 ? <span className="text-red-400">{line.lateMinutes}m (-{parseFloat(line.lateDeduction).toLocaleString()})</span> : "—"}</TableCell>
                      <TableCell className={`${cellClass} bg-red-500/[0.02] text-right`}>{parseFloat(line.assetDeductions) > 0 ? <span className="text-red-400">-{parseFloat(line.assetDeductions).toLocaleString()}</span> : "—"}</TableCell>
                      <TableCell className={`${cellClass} bg-red-500/[0.02] text-right`}>{parseFloat(line.totalManualDeductions) > 0 ? <span className="text-red-400">-{parseFloat(line.totalManualDeductions).toLocaleString()}</span> : "—"}</TableCell>
                      <TableCell className={`${cellClass} bg-red-500/[0.02] text-right font-bold text-red-400`}>{parseFloat(line.totalDeductions) > 0 ? `-${parseFloat(line.totalDeductions).toLocaleString()}` : "—"}</TableCell>
                      <TableCell className={`${cellClass} text-right font-bold text-white text-sm`}>{parseFloat(line.netPayable).toLocaleString()}</TableCell>
                      {run.mode === "split" && (
                        <>
                          <TableCell className={cellClass}>
                            <div className="text-right">
                              <p className="text-xs">{parseFloat(line.tranche1Amount ?? 0).toLocaleString()}</p>
                              <Badge className={`text-[9px] border-0 ${statusBadge[line.tranche1Status ?? "pending"]}`}>{statusLabel[line.tranche1Status ?? "pending"]}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className={cellClass}>
                            <div className="text-right">
                              <p className="text-xs">{parseFloat(line.tranche2Amount ?? 0).toLocaleString()}</p>
                              <Badge className={`text-[9px] border-0 ${statusBadge[line.tranche2Status ?? "pending"]}`}>{statusLabel[line.tranche2Status ?? "pending"]}</Badge>
                            </div>
                          </TableCell>
                        </>
                      )}
                      <TableCell className={cellClass}>
                        {t1Txn ? (
                          <div className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                            <span className="text-[10px] font-mono text-emerald-400 truncate max-w-[80px]" title={t1Txn.bankTransactionId ?? t1Txn.receiptNumber}>{t1Txn.bankTransactionId ?? t1Txn.receiptNumber ?? "—"}</span>
                          </div>
                        ) : <span className="text-[10px] text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className={`${cellClass} pr-4`}>
                        {run.status !== "draft" && line.tranche1Status === "pending" && line.paymentMethod === "bank_transfer" && (
                          <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2 rounded-sm" onClick={() => { setShowPaymentDialog(line); setPaymentForm({ bankTransactionId: "", depositDate: "", trancheNumber: 1 }); }} data-testid={`button-record-payment-${line.employeeNumber}`}>
                            <CreditCard className="h-3 w-3 mr-1" /> Pay
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!showPaymentDialog} onOpenChange={() => setShowPaymentDialog(null)}>
        <DialogContent className="bg-card border-border rounded-sm max-w-md">
          <DialogHeader><DialogTitle className="font-display text-white">Record Payment</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Employee: <span className="text-white">{showPaymentDialog?.candidate?.fullNameEn ?? showPaymentDialog?.employeeNumber}</span></p>
          <p className="text-sm text-muted-foreground">Amount: <span className="text-white font-bold">SAR {parseFloat(showPaymentDialog?.tranche1Amount ?? showPaymentDialog?.netPayable ?? 0).toLocaleString()}</span></p>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Bank Transaction ID</Label>
              <Input value={paymentForm.bankTransactionId} onChange={e => setPaymentForm(p => ({ ...p, bankTransactionId: e.target.value }))} placeholder="TRX-2026-..." className="bg-muted/30 border-border rounded-sm mt-1" data-testid="input-bank-txn-id" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Deposit Date</Label>
              <Input type="date" value={paymentForm.depositDate} onChange={e => setPaymentForm(p => ({ ...p, depositDate: e.target.value }))} className="bg-muted/30 border-border rounded-sm mt-1" data-testid="input-deposit-date" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(null)} className="rounded-sm">Cancel</Button>
            <Button disabled={!paymentForm.bankTransactionId || !paymentForm.depositDate || recordPaymentMut.isPending} onClick={() => recordPaymentMut.mutate({ runId: run.id, lineId: showPaymentDialog.id, ...paymentForm })} className="bg-primary hover:bg-primary/90 rounded-sm" data-testid="button-submit-payment">
              {recordPaymentMut.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="bg-card border-border rounded-sm max-w-md">
          <DialogHeader><DialogTitle className="font-display text-white">Import Bank Response</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">CSV File</Label>
              <Input type="file" accept=".csv" onChange={e => setImportFile(e.target.files?.[0] ?? null)} className="bg-muted/30 border-border rounded-sm mt-1" data-testid="input-import-file" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">IBAN Column Name</Label>
              <Input value={importCols.ibanColumn} onChange={e => setImportCols(p => ({ ...p, ibanColumn: e.target.value }))} placeholder="e.g. IBAN" className="bg-muted/30 border-border rounded-sm mt-1" data-testid="input-iban-column" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Transaction ID Column Name</Label>
              <Input value={importCols.txnIdColumn} onChange={e => setImportCols(p => ({ ...p, txnIdColumn: e.target.value }))} placeholder="e.g. Transaction ID" className="bg-muted/30 border-border rounded-sm mt-1" data-testid="input-txn-column" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)} className="rounded-sm">Cancel</Button>
            <Button disabled={!importFile || !importCols.ibanColumn || !importCols.txnIdColumn || importMut.isPending} onClick={() => importMut.mutate()} className="bg-primary hover:bg-primary/90 rounded-sm" data-testid="button-submit-import">
              {importMut.isPending ? "Importing..." : "Import & Match"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={showOverrideSheet} onOpenChange={setShowOverrideSheet}>
        <SheetContent className="bg-card border-border w-[400px]">
          <SheetHeader><SheetTitle className="font-display text-white">Bulk Override</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-6">
            <p className="text-sm text-muted-foreground">Waive all deductions for a specific date across employees in this pay run.</p>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Date</Label>
              <Input type="date" value={overrideForm.date} onChange={e => setOverrideForm(p => ({ ...p, date: e.target.value }))} className="bg-muted/30 border-border rounded-sm mt-1" data-testid="input-override-date" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reason</Label>
              <Textarea value={overrideForm.reason} onChange={e => setOverrideForm(p => ({ ...p, reason: e.target.value }))} placeholder="e.g. Public holiday — waive all absence deductions" className="bg-muted/30 border-border rounded-sm mt-1" data-testid="input-override-reason" />
            </div>
            <Button disabled={!overrideForm.date || !overrideForm.reason || overrideMut.isPending} onClick={() => overrideMut.mutate({ date: overrideForm.date, reason: overrideForm.reason, eventId: run.eventId })} className="w-full bg-primary hover:bg-primary/90 rounded-sm" data-testid="button-submit-override">
              {overrideMut.isPending ? "Applying..." : "Apply Override"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
