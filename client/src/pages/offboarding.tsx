import { useState, createPortal } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  LogOut, Search, UserX, Package, DollarSign, CheckCircle2, AlertTriangle,
  Clock, RefreshCw, ChevronRight, X, Check, Ban, Undo2, Calendar, Users,
  ShieldAlert, Loader2, TrendingDown, Banknote, FileText, ArrowRight,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { format, differenceInDays } from "date-fns";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OffboardingEmployee {
  id: string;
  employeeNumber: string;
  fullNameEn: string | null;
  nationalId: string | null;
  phone: string | null;
  salary: string | null;
  startDate: string;
  endDate: string | null;
  eventId: string | null;
  eventName: string | null;
  eventEndDate: string | null;
  employmentType: string;
  offboardingStatus: string | null;
  offboardingStartedAt: string | null;
}

interface AssetChecklist {
  id: string;
  assetId: string;
  assetName: string;
  assetPrice: number;
  assetCategory: string | null;
  assignedAt: string;
  status: "assigned" | "returned" | "not_returned";
  deductionWaived: boolean | null;
  deductionWaivedBy: string | null;
  deductionWaivedAt: string | null;
  confirmedAt: string | null;
}

interface Settlement {
  employee: any;
  period: { start: string; end: string; calendarDays: number };
  salary: { monthly: number; daily: number; gross: number };
  attendance: { workedDays: number; absentDays: number; loggedDays: number; total: number };
  deductions: { assetId: string; employeeAssetId: string; assetName: string; price: number; deductionWaived: boolean | null }[];
  totalDeductions: number;
  netSettlement: number;
  assetChecklist: AssetChecklist[];
  allAssetsConfirmed: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.max(0, differenceInDays(new Date(), new Date(dateStr)));
}

function formatSAR(n: number) {
  return n.toLocaleString("en-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " SAR";
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return format(new Date(s), "dd MMM yyyy"); } catch { return s; }
}

function getReadiness(emp: OffboardingEmployee, settlement?: Settlement | null) {
  if (!settlement) return "loading";
  if (settlement.allAssetsConfirmed) return "ready";
  const pending = settlement.assetChecklist.filter(a => a.status === "assigned").length;
  if (pending > 0) return "assets_pending";
  return "ready";
}

// ─── Waive Deduction Confirm Dialog ──────────────────────────────────────────

function WaiveDialog({ asset, onConfirm, onCancel }: {
  asset: AssetChecklist;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-lg shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <ShieldAlert className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Waive Asset Deduction</h3>
            <p className="text-xs text-muted-foreground">This action is IRREVERSIBLE</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          You are about to waive the deduction of <span className="font-semibold text-foreground">{formatSAR(asset.assetPrice)}</span> for
          asset <span className="font-semibold text-foreground">"{asset.assetName}"</span>.
          This means the employee will NOT be charged for this item. Once confirmed, this cannot be undone.
        </p>
        <p className="text-sm text-muted-foreground mb-3">
          Type <span className="font-mono bg-muted px-1 rounded text-foreground">WAIVE</span> to confirm:
        </p>
        <Input
          value={typed}
          onChange={e => setTyped(e.target.value)}
          placeholder="Type WAIVE to confirm"
          className="mb-4 font-mono"
          data-testid="input-waive-confirm"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel} className="border-border">Cancel</Button>
          <Button
            variant="destructive"
            disabled={typed !== "WAIVE"}
            onClick={onConfirm}
            data-testid="button-waive-confirm"
          >
            Waive Deduction (Irreversible)
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Employee Detail Sheet ────────────────────────────────────────────────────

function OffboardingSheet({ emp, events, onClose }: {
  emp: OffboardingEmployee;
  events: any[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"overview" | "assets" | "settlement">("overview");
  const [waivedAsset, setWaivedAsset] = useState<AssetChecklist | null>(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [showReassign, setShowReassign] = useState(false);

  const { data: settlement, isLoading: settlementLoading } = useQuery<Settlement>({
    queryKey: ["/api/offboarding/settlement", emp.id],
    queryFn: () => apiRequest("GET", `/api/offboarding/${emp.id}/settlement`).then(r => r.json()),
    staleTime: 10_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/offboarding"] });
    qc.invalidateQueries({ queryKey: ["/api/offboarding/settlement", emp.id] });
  };

  const startMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/offboarding/${emp.id}/start`),
    onSuccess: () => { toast({ title: "Offboarding started" }); invalidate(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const completeMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/offboarding/${emp.id}/complete`),
    onSuccess: () => { toast({ title: "Offboarding completed — employee returned to talent pool" }); qc.invalidateQueries({ queryKey: ["/api/offboarding"] }); onClose(); },
    onError: (e: any) => toast({ title: "Cannot complete", description: e.message, variant: "destructive" }),
  });

  const reassignMut = useMutation({
    mutationFn: (eventId: string) => apiRequest("POST", `/api/offboarding/${emp.id}/reassign-event`, { eventId }),
    onSuccess: () => { toast({ title: "Employee reassigned — removed from offboarding" }); invalidate(); onClose(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const confirmMut = useMutation({
    mutationFn: ({ assetId, status }: { assetId: string; status: "returned" | "not_returned" }) =>
      apiRequest("POST", `/api/employee-assets/${assetId}/confirm`, { status }),
    onSuccess: () => { toast({ title: "Asset confirmation recorded" }); invalidate(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bulkConfirmMut = useMutation({
    mutationFn: (status: "returned" | "not_returned") =>
      apiRequest("POST", `/api/employee-assets/bulk-confirm`, { workforceId: emp.id, status }),
    onSuccess: (_, status) => { toast({ title: `All assets marked as ${status.replace("_", " ")}` }); invalidate(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const waiveMut = useMutation({
    mutationFn: (assetId: string) => apiRequest("POST", `/api/employee-assets/${assetId}/waive-deduction`),
    onSuccess: () => { toast({ title: "Deduction waived — this cannot be undone" }); setWaivedAsset(null); invalidate(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const readiness = getReadiness(emp, settlement);
  const pendingAssets = settlement?.assetChecklist.filter(a => a.status === "assigned").length ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  const activeEvents = events.filter(e => e.status !== "archived" && (e.endDate == null || e.endDate > today));

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-background border-l border-border flex flex-col h-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-sm">
              {(emp.fullNameEn ?? "?").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div>
              <div className="font-semibold text-foreground">{emp.fullNameEn ?? "—"}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="font-mono">#{emp.employeeNumber}</span>
                <span>·</span>
                <span>{emp.employmentType === "smp" ? "SMP" : "Individual"}</span>
                {emp.eventName && <><span>·</span><span>{emp.eventName}</span></>}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Status bar */}
        <div className="px-5 py-2.5 bg-amber-500/5 border-b border-amber-500/20 flex items-center gap-2 shrink-0">
          {readiness === "ready" ? (
            <><CheckCircle2 className="h-4 w-4 text-emerald-400" /><span className="text-xs text-emerald-400 font-medium">Ready to complete offboarding</span></>
          ) : readiness === "assets_pending" ? (
            <><AlertTriangle className="h-4 w-4 text-amber-400" /><span className="text-xs text-amber-400 font-medium">{pendingAssets} asset(s) awaiting confirmation</span></>
          ) : (
            <><Clock className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Calculating checklist…</span></>
          )}
          <div className="ml-auto text-xs text-muted-foreground">
            Event ended {daysSince(emp.eventEndDate)} days ago
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-border shrink-0 bg-card">
          {(["overview", "assets", "settlement"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              data-testid={`tab-offboarding-${t}`}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "assets" && pendingAssets > 0 ? (
                <span className="flex items-center gap-1.5">
                  Assets <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingAssets}</span>
                </span>
              ) : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ── OVERVIEW TAB ── */}
          {tab === "overview" && (
            <>
              {/* Key info */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Employee #", value: emp.employeeNumber, mono: true },
                  { label: "Event", value: emp.eventName ?? "—" },
                  { label: "Event Ended", value: fmtDate(emp.eventEndDate) },
                  { label: "Started Work", value: fmtDate(emp.startDate) },
                  { label: "Monthly Salary", value: emp.salary ? formatSAR(parseFloat(emp.salary)) : "—" },
                  { label: "Type", value: emp.employmentType === "smp" ? "SMP Worker" : "Individual" },
                ].map(({ label, value, mono }) => (
                  <div key={label} className="bg-muted/20 border border-border/50 rounded-md p-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                    <p className={`text-sm font-medium text-foreground ${mono ? "font-mono" : ""}`}>{value}</p>
                  </div>
                ))}
              </div>

              {emp.employmentType === "smp" && (
                <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <FileText className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-300">
                    This is an SMP worker. Financial settlement is managed at the SMP contract level.
                    Asset deductions are still recorded individually and will be reflected in the SMP settlement report.
                  </p>
                </div>
              )}

              {/* Reassign Event */}
              <Card className="border-border">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-primary" />
                    Reassign to Active Event
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    If you want to retain this employee, assign them to an ongoing or upcoming event. This will remove them from offboarding.
                  </p>
                  {showReassign ? (
                    <div className="flex gap-2">
                      <select
                        className="flex-1 text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground"
                        value={selectedEventId}
                        onChange={e => setSelectedEventId(e.target.value)}
                        data-testid="select-reassign-event"
                      >
                        <option value="">Select event…</option>
                        {activeEvents.map(ev => (
                          <option key={ev.id} value={ev.id}>{ev.name} (ends {fmtDate(ev.endDate)})</option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        disabled={!selectedEventId || reassignMut.isPending}
                        onClick={() => reassignMut.mutate(selectedEventId)}
                        data-testid="button-reassign-confirm"
                      >
                        {reassignMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reassign"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowReassign(false)}>Cancel</Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setShowReassign(true)} className="border-border" data-testid="button-show-reassign">
                      <ArrowRight className="h-4 w-4 mr-2" /> Choose Event
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Start Offboarding (if pending) */}
              {emp.offboardingStatus === null && (
                <div className="flex items-center justify-between p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-foreground">Begin Offboarding Process</p>
                    <p className="text-xs text-muted-foreground">Start the asset confirmation and settlement workflow</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => startMut.mutate()}
                    disabled={startMut.isPending}
                    data-testid="button-start-offboarding"
                  >
                    {startMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Begin"}
                  </Button>
                </div>
              )}

              {/* Complete Offboarding */}
              {emp.offboardingStatus === "in_progress" && (
                <div className={`flex items-center justify-between p-4 border rounded-lg ${
                  readiness === "ready"
                    ? "bg-emerald-500/5 border-emerald-500/20"
                    : "bg-muted/10 border-border"
                }`}>
                  <div>
                    <p className="text-sm font-medium text-foreground">Complete Offboarding</p>
                    <p className="text-xs text-muted-foreground">
                      {readiness === "ready"
                        ? "All prerequisites met — employee will be returned to talent pool"
                        : `${pendingAssets} asset(s) must be confirmed first`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={readiness === "ready" ? "default" : "outline"}
                    disabled={readiness !== "ready" || completeMut.isPending}
                    onClick={() => completeMut.mutate()}
                    data-testid="button-complete-offboarding"
                    className={readiness !== "ready" ? "border-border opacity-50" : ""}
                  >
                    {completeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1.5" />Complete</>}
                  </Button>
                </div>
              )}
            </>
          )}

          {/* ── ASSETS TAB ── */}
          {tab === "assets" && (
            <>
              {settlementLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /><span>Loading asset checklist…</span>
                </div>
              ) : !settlement?.assetChecklist.length ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No assets assigned to this employee</p>
                </div>
              ) : (
                <>
                  {/* Bulk actions */}
                  {pendingAssets > 0 && (
                    <div className="flex gap-2 p-3 bg-muted/20 border border-border/50 rounded-lg">
                      <span className="text-xs text-muted-foreground flex-1 self-center">{pendingAssets} asset(s) awaiting confirmation</span>
                      <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                        onClick={() => bulkConfirmMut.mutate("returned")} disabled={bulkConfirmMut.isPending}
                        data-testid="button-bulk-returned">
                        <Check className="h-3.5 w-3.5 mr-1" /> All Returned
                      </Button>
                      <Button size="sm" variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                        onClick={() => bulkConfirmMut.mutate("not_returned")} disabled={bulkConfirmMut.isPending}
                        data-testid="button-bulk-not-returned">
                        <X className="h-3.5 w-3.5 mr-1" /> None Returned
                      </Button>
                    </div>
                  )}

                  {/* Asset list */}
                  <div className="space-y-2">
                    {settlement.assetChecklist.map((asset) => (
                      <div
                        key={asset.id}
                        data-testid={`asset-row-${asset.id}`}
                        className="border border-border/60 rounded-lg p-4 bg-card"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="font-medium text-sm text-foreground">{asset.assetName}</span>
                              {asset.assetCategory && (
                                <span className="text-[10px] bg-muted/40 border border-border/50 rounded px-1.5 py-0.5 text-muted-foreground">{asset.assetCategory}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span>Assigned: {fmtDate(asset.assignedAt)}</span>
                              <span>·</span>
                              <span className="font-semibold text-foreground">{formatSAR(asset.assetPrice)}</span>
                            </div>

                            {/* Status & deduction */}
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              {asset.status === "assigned" && (
                                <Badge variant="outline" className="text-[11px] border-amber-500/40 text-amber-400">Pending Confirmation</Badge>
                              )}
                              {asset.status === "returned" && (
                                <Badge variant="outline" className="text-[11px] border-emerald-500/40 text-emerald-400"><CheckCircle2 className="h-3 w-3 mr-1" />Returned</Badge>
                              )}
                              {asset.status === "not_returned" && (
                                <>
                                  <Badge variant="outline" className="text-[11px] border-red-500/40 text-red-400"><X className="h-3 w-3 mr-1" />Not Returned</Badge>
                                  {asset.deductionWaived === true ? (
                                    <Badge variant="outline" className="text-[11px] border-purple-500/40 text-purple-400"><Ban className="h-3 w-3 mr-1" />Deduction Waived</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[11px] border-orange-500/40 text-orange-400"><TrendingDown className="h-3 w-3 mr-1" />−{formatSAR(asset.assetPrice)}</Badge>
                                  )}
                                </>
                              )}
                              {asset.confirmedAt && (
                                <span className="text-[10px] text-muted-foreground">Confirmed {fmtDate(asset.confirmedAt)}</span>
                              )}
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex flex-col gap-1.5 shrink-0">
                            {asset.status === "assigned" && (
                              <>
                                <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 h-7 text-[11px]"
                                  onClick={() => confirmMut.mutate({ assetId: asset.id, status: "returned" })}
                                  disabled={confirmMut.isPending}
                                  data-testid={`button-returned-${asset.id}`}>
                                  <Check className="h-3 w-3 mr-1" /> Returned
                                </Button>
                                <Button size="sm" variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10 h-7 text-[11px]"
                                  onClick={() => confirmMut.mutate({ assetId: asset.id, status: "not_returned" })}
                                  disabled={confirmMut.isPending}
                                  data-testid={`button-not-returned-${asset.id}`}>
                                  <X className="h-3 w-3 mr-1" /> Not Returned
                                </Button>
                              </>
                            )}
                            {asset.status === "not_returned" && asset.deductionWaived !== true && (
                              <Button size="sm" variant="outline" className="border-purple-500/40 text-purple-400 hover:bg-purple-500/10 h-7 text-[11px]"
                                onClick={() => setWaivedAsset(asset)}
                                data-testid={`button-waive-${asset.id}`}>
                                <Ban className="h-3 w-3 mr-1" /> Waive
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── SETTLEMENT TAB ── */}
          {tab === "settlement" && (
            <>
              {settlementLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /><span>Calculating settlement…</span>
                </div>
              ) : !settlement ? (
                <div className="text-center py-12 text-muted-foreground text-sm">Unable to calculate settlement</div>
              ) : (
                <>
                  {/* Employment period */}
                  <Card className="border-border">
                    <CardContent className="p-4 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Employment Period</p>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: "Start Date", value: fmtDate(settlement.period.start) },
                          { label: "End Date", value: fmtDate(settlement.period.end) },
                          { label: "Calendar Days", value: String(settlement.period.calendarDays) },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <p className="text-[10px] text-muted-foreground">{label}</p>
                            <p className="text-sm font-medium text-foreground">{value}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Salary breakdown */}
                  <Card className="border-border">
                    <CardContent className="p-4 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Salary Breakdown</p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Monthly Salary</span>
                          <span className="font-mono">{formatSAR(settlement.salary.monthly)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>Daily Rate (÷ 30)</span>
                          <span className="font-mono">{formatSAR(settlement.salary.daily)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>× {settlement.period.calendarDays} calendar days</span>
                          <span className="font-mono font-semibold text-foreground">{formatSAR(settlement.salary.gross)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Attendance */}
                  <Card className="border-border">
                    <CardContent className="p-4 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attendance (Logged)</p>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: "Worked Days", value: String(settlement.attendance.workedDays), color: "text-emerald-400" },
                          { label: "Absent Days", value: String(settlement.attendance.absentDays), color: "text-red-400" },
                          { label: "Logged Entries", value: String(settlement.attendance.loggedDays), color: "text-foreground" },
                        ].map(({ label, value, color }) => (
                          <div key={label}>
                            <p className="text-[10px] text-muted-foreground">{label}</p>
                            <p className={`text-sm font-medium ${color}`}>{value}</p>
                          </div>
                        ))}
                      </div>
                      {settlement.attendance.loggedDays === 0 && (
                        <p className="text-[11px] text-muted-foreground italic">No attendance records logged. Settlement uses calendar days.</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Deductions */}
                  {settlement.deductions.length > 0 && (
                    <Card className="border-red-500/20 bg-red-500/5">
                      <CardContent className="p-4 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-red-400">Asset Deductions</p>
                        <div className="space-y-1.5">
                          {settlement.deductions.map(d => (
                            <div key={d.employeeAssetId} className="flex justify-between text-sm">
                              <span className="text-muted-foreground">{d.assetName}</span>
                              <span className="font-mono text-red-400">−{formatSAR(d.price)}</span>
                            </div>
                          ))}
                        </div>
                        <Separator className="bg-red-500/20" />
                        <div className="flex justify-between text-sm font-semibold">
                          <span className="text-muted-foreground">Total Deductions</span>
                          <span className="font-mono text-red-400">−{formatSAR(settlement.totalDeductions)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Net Settlement */}
                  <Card className="border-emerald-500/20 bg-emerald-500/5">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Net Settlement</p>
                          <p className="text-2xl font-bold text-emerald-400 font-mono">{formatSAR(settlement.netSettlement)}</p>
                          {emp.employmentType === "smp" && (
                            <p className="text-[11px] text-muted-foreground mt-1">Reported to SMP contract settlement</p>
                          )}
                        </div>
                        <Banknote className="h-8 w-8 text-emerald-400/40" />
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Waive Deduction Dialog */}
      {waivedAsset && (
        <WaiveDialog
          asset={waivedAsset}
          onConfirm={() => waiveMut.mutate(waivedAsset.id)}
          onCancel={() => setWaivedAsset(null)}
        />
      )}
    </div>,
    document.body
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OffboardingPage() {
  const [search, setSearch] = useState("");
  const [selectedEmp, setSelectedEmp] = useState<OffboardingEmployee | null>(null);

  const { data: employees = [], isLoading } = useQuery<OffboardingEmployee[]>({
    queryKey: ["/api/offboarding"],
    queryFn: () => apiRequest("GET", "/api/offboarding").then(r => r.json()),
    staleTime: 30_000,
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
    queryFn: () => apiRequest("GET", "/api/events").then(r => r.json()),
    staleTime: 60_000,
  });

  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    return !q || (e.fullNameEn ?? "").toLowerCase().includes(q)
      || e.employeeNumber.toLowerCase().includes(q)
      || (e.eventName ?? "").toLowerCase().includes(q)
      || (e.nationalId ?? "").includes(q);
  });

  const pending = employees.filter(e => e.offboardingStatus === null).length;
  const inProgress = employees.filter(e => e.offboardingStatus === "in_progress").length;
  const total = employees.length;

  function statusBadge(emp: OffboardingEmployee) {
    if (emp.offboardingStatus === "in_progress") return (
      <Badge variant="outline" className="text-[11px] border-amber-500/40 text-amber-400">In Progress</Badge>
    );
    return <Badge variant="outline" className="text-[11px] border-blue-500/40 text-blue-400">Pending Start</Badge>;
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <LogOut className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground tracking-tight">Offboarding</h1>
              <p className="text-sm text-muted-foreground">Manage employee exits, asset returns & final settlements</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "In Offboarding", value: total, icon: UserX, color: "border-l-amber-500" },
            { label: "Pending Start", value: pending, icon: Clock, color: "border-l-blue-500" },
            { label: "In Progress", value: inProgress, icon: RefreshCw, color: "border-l-primary" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className={`border-l-4 ${color} border-border`}>
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, employee #, event…"
            className="pl-9 bg-card border-border"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-offboarding-search"
          />
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Event</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Event Ended</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Days Since</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Salary</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    <p className="text-sm">Loading offboarding queue…</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-muted-foreground">
                    <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">{search ? "No matches found" : "No employees in offboarding"}</p>
                    <p className="text-xs mt-1">{!search && "Employees whose event end date has passed will appear here automatically"}</p>
                  </td>
                </tr>
              ) : filtered.map((emp, i) => (
                <tr
                  key={emp.id}
                  data-testid={`offboarding-row-${i}`}
                  className="border-b border-border/30 hover:bg-muted/[0.08] transition-colors cursor-pointer"
                  onClick={() => setSelectedEmp(emp)}
                >
                  <td className="py-3 px-4">
                    <div className="font-medium text-foreground">{emp.fullNameEn ?? "—"}</div>
                    <div className="text-xs text-muted-foreground font-mono">#{emp.employeeNumber}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-muted-foreground">{emp.eventName ?? "—"}</span>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{fmtDate(emp.eventEndDate)}</td>
                  <td className="py-3 px-4">
                    <span className={`font-medium ${daysSince(emp.eventEndDate) > 7 ? "text-red-400" : "text-amber-400"}`}>
                      {daysSince(emp.eventEndDate)}d
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-muted-foreground">
                    {emp.salary ? formatSAR(parseFloat(emp.salary)) : "—"}
                  </td>
                  <td className="py-3 px-4">{statusBadge(emp)}</td>
                  <td className="py-3 px-4 text-right">
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Sheet */}
      {selectedEmp && (
        <OffboardingSheet
          emp={selectedEmp}
          events={events}
          onClose={() => setSelectedEmp(null)}
        />
      )}
    </DashboardLayout>
  );
}
