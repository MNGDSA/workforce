import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  LogOut, Search, Package, CheckCircle2, AlertTriangle,
  Clock, RefreshCw, ChevronRight, X, Check, Ban, Calendar, Users,
  ShieldAlert, Loader2, TrendingDown, Banknote, FileText, ArrowRight,
  PlayCircle, CheckCircle, Tag,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { differenceInDays } from "date-fns";
import { useTranslation, Trans } from "react-i18next";
import { formatNumber } from "@/lib/format";

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
  terminationReason: string | null;
  terminationCategory: string | null;
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

interface OffboardingStats {
  pending: number;
  inProgress: number;
  ready: number;
  completedToday: number;
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.max(0, differenceInDays(new Date(), new Date(dateStr)));
}

function formatSAR(n: number, locale: string) {
  return new Intl.NumberFormat(locale.startsWith("ar") ? "ar-SA" : "en-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    numberingSystem: "latn",
  }).format(n) + " SAR";
}

function fmtDate(s: string | null | undefined, locale: string) {
  if (!s) return "—";
  try {
    const tag = locale.startsWith("ar") ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB";
    return new Date(s).toLocaleDateString(tag, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return s;
  }
}

function getReadiness(emp: OffboardingEmployee, settlement?: Settlement | null) {
  if (!settlement) return "loading";
  if (settlement.allAssetsConfirmed) return "ready";
  const pending = settlement.assetChecklist.filter(a => a.status === "assigned").length;
  if (pending > 0) return "assets_pending";
  return "ready";
}

function WaiveDialog({ asset, onConfirm, onCancel }: {
  asset: AssetChecklist;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation(["offboarding"]);
  const [typed, setTyped] = useState("");
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-lg shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <ShieldAlert className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{t("offboarding:waive.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("offboarding:waive.irreversible")}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          <Trans
            i18nKey="offboarding:waive.body"
            components={{
              amt: <span className="font-semibold text-foreground" dir="ltr">{formatSAR(asset.assetPrice, i18n.language)}</span>,
              name: <span className="font-semibold text-foreground"><bdi>{asset.assetName}</bdi></span>,
            }}
          />
        </p>
        <p className="text-sm text-muted-foreground mb-3">
          <Trans
            i18nKey="offboarding:waive.typePrompt"
            components={{ code: <span className="font-mono bg-muted px-1 rounded text-foreground" dir="ltr">WAIVE</span> }}
          />
        </p>
        <Input
          value={typed}
          onChange={e => setTyped(e.target.value)}
          placeholder={t("offboarding:waive.typePh")}
          dir="ltr"
          className="mb-4 font-mono"
          data-testid="input-waive-confirm"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel} className="border-border">{t("offboarding:waive.cancel")}</Button>
          <Button
            variant="destructive"
            disabled={typed !== "WAIVE"}
            onClick={onConfirm}
            data-testid="button-waive-confirm"
          >
            {t("offboarding:waive.confirm")}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function OffboardingSheet({ emp, events, onClose }: {
  emp: OffboardingEmployee;
  events: any[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation(["offboarding"]);
  const ar = i18n.language.startsWith("ar");
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
    qc.invalidateQueries({ queryKey: ["/api/offboarding/stats"] });
    qc.invalidateQueries({ queryKey: ["/api/offboarding/settlement", emp.id] });
  };

  const startMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/offboarding/${emp.id}/start`),
    onSuccess: () => { toast({ title: t("offboarding:toasts.started") }); invalidate(); },
    onError: (e: any) => toast({ title: t("offboarding:toasts.error"), description: e.message, variant: "destructive" }),
  });

  const completeMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/offboarding/${emp.id}/complete`),
    onSuccess: () => { toast({ title: t("offboarding:toasts.completed") }); invalidate(); onClose(); },
    onError: (e: any) => toast({ title: t("offboarding:toasts.completeError"), description: e.message, variant: "destructive" }),
  });

  const reassignMut = useMutation({
    mutationFn: (eventId: string) => apiRequest("POST", `/api/offboarding/${emp.id}/reassign-event`, { eventId }),
    onSuccess: () => { toast({ title: t("offboarding:toasts.reassigned") }); invalidate(); onClose(); },
    onError: (e: any) => toast({ title: t("offboarding:toasts.error"), description: e.message, variant: "destructive" }),
  });

  const confirmMut = useMutation({
    mutationFn: ({ assetId, status }: { assetId: string; status: "returned" | "not_returned" }) =>
      apiRequest("POST", `/api/employee-assets/${assetId}/confirm`, { status }),
    onSuccess: () => { toast({ title: t("offboarding:toasts.assetConfirmed") }); invalidate(); },
    onError: (e: any) => toast({ title: t("offboarding:toasts.error"), description: e.message, variant: "destructive" }),
  });

  const bulkConfirmMut = useMutation({
    mutationFn: (status: "returned" | "not_returned") =>
      apiRequest("POST", `/api/employee-assets/bulk-confirm`, { workforceId: emp.id, status }),
    onSuccess: (_, status) => {
      toast({ title: status === "returned" ? t("offboarding:toasts.bulkReturned") : t("offboarding:toasts.bulkNotReturned") });
      invalidate();
    },
    onError: (e: any) => toast({ title: t("offboarding:toasts.error"), description: e.message, variant: "destructive" }),
  });

  const waiveMut = useMutation({
    mutationFn: (assetId: string) => apiRequest("POST", `/api/employee-assets/${assetId}/waive-deduction`),
    onSuccess: () => { toast({ title: t("offboarding:toasts.deductionWaived") }); setWaivedAsset(null); invalidate(); },
    onError: (e: any) => toast({ title: t("offboarding:toasts.error"), description: e.message, variant: "destructive" }),
  });

  const readiness = getReadiness(emp, settlement);
  const pendingAssets = settlement?.assetChecklist.filter(a => a.status === "assigned").length ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  const activeEvents = events.filter(e => e.status !== "archived" && (e.endDate == null || e.endDate > today));

  const reasonLabel = emp.terminationCategory
    ? t(`offboarding:categories.${emp.terminationCategory}`, { defaultValue: emp.terminationCategory })
    : null;

  const TABS: { key: "overview" | "assets" | "settlement"; label: string }[] = [
    { key: "overview", label: t("offboarding:sheet.tabOverview") },
    { key: "assets", label: t("offboarding:sheet.tabAssets") },
    { key: "settlement", label: t("offboarding:sheet.tabSettlement") },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`w-full max-w-2xl bg-background border-border flex flex-col h-full shadow-2xl overflow-hidden ${ar ? "border-r" : "border-l"}`}>
        <div className="flex items-start justify-between p-5 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-sm">
              {(emp.fullNameEn ?? "?").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div>
              <div className="font-semibold text-foreground"><bdi>{emp.fullNameEn ?? "—"}</bdi></div>
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="font-mono" dir="ltr">#{emp.employeeNumber}</span>
                <span>·</span>
                <span>{emp.employmentType === "smp" ? t("offboarding:sheet.smp") : t("offboarding:sheet.individual")}</span>
                {emp.eventName && <><span>·</span><span><bdi>{emp.eventName}</bdi></span></>}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-5 py-2.5 bg-amber-500/5 border-b border-amber-500/20 flex items-center gap-2 shrink-0">
          {readiness === "ready" ? (
            <><CheckCircle2 className="h-4 w-4 text-emerald-400" /><span className="text-xs text-emerald-400 font-medium">{t("offboarding:sheet.ready")}</span></>
          ) : readiness === "assets_pending" ? (
            <><AlertTriangle className="h-4 w-4 text-amber-400" /><span className="text-xs text-amber-400 font-medium">{t("offboarding:sheet.pendingAssets", { count: pendingAssets, replace: { count: formatNumber(pendingAssets, i18n.language) } })}</span></>
          ) : (
            <><Clock className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">{t("offboarding:sheet.calculating")}</span></>
          )}
          <div className="ms-auto text-xs text-muted-foreground">
            {emp.endDate
              ? t("offboarding:sheet.endDateLabel", { date: fmtDate(emp.endDate, i18n.language) })
              : emp.eventEndDate
                ? t("offboarding:sheet.eventEndedAgo", { count: daysSince(emp.eventEndDate), replace: { count: formatNumber(daysSince(emp.eventEndDate), i18n.language) } })
                : "—"}
          </div>
        </div>

        <div className="flex border-b border-border shrink-0 bg-card">
          {TABS.map(tb => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              data-testid={`tab-offboarding-${tb.key}`}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === tb.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tb.key === "assets" && pendingAssets > 0 ? (
                <span className="flex items-center gap-1.5">
                  {tb.label} <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{formatNumber(pendingAssets, i18n.language)}</span>
                </span>
              ) : tb.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {tab === "overview" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: t("offboarding:sheet.fields.employeeNo"), value: emp.employeeNumber, mono: true, ltr: true },
                  { label: t("offboarding:sheet.fields.event"), value: emp.eventName ?? "—" },
                  { label: t("offboarding:sheet.fields.endDate"), value: fmtDate(emp.endDate ?? emp.eventEndDate, i18n.language), ltr: true },
                  { label: t("offboarding:sheet.fields.started"), value: fmtDate(emp.startDate, i18n.language), ltr: true },
                  { label: t("offboarding:sheet.fields.monthlySalary"), value: emp.salary ? formatSAR(parseFloat(emp.salary), i18n.language) : "—", ltr: true },
                  { label: t("offboarding:sheet.fields.type"), value: emp.employmentType === "smp" ? t("offboarding:sheet.smpWorker") : t("offboarding:sheet.individual") },
                ].map(({ label, value, mono, ltr }) => (
                  <div key={label} className="bg-muted/20 border border-border/50 rounded-md p-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                    <p className={`text-sm font-medium text-foreground ${mono ? "font-mono" : ""}`} {...(ltr ? { dir: "ltr" } : {})}><bdi>{value}</bdi></p>
                  </div>
                ))}
              </div>

              {(reasonLabel || emp.terminationReason) && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <Tag className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-red-300">
                      {t("offboarding:sheet.termination", { label: reasonLabel ?? t("offboarding:categories.manual") })}
                    </p>
                    {emp.terminationReason && (
                      <p className="text-xs text-red-300/70 mt-0.5"><bdi>{emp.terminationReason}</bdi></p>
                    )}
                  </div>
                </div>
              )}

              {emp.employmentType === "smp" && (
                <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <FileText className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-300">
                    {t("offboarding:sheet.smpNote")}
                  </p>
                </div>
              )}

              <Card className="border-border">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-primary" />
                    {t("offboarding:sheet.reassign.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {t("offboarding:sheet.reassign.desc")}
                  </p>
                  {showReassign ? (
                    <div className="flex gap-2">
                      <select
                        className="flex-1 text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground"
                        value={selectedEventId}
                        onChange={e => setSelectedEventId(e.target.value)}
                        data-testid="select-reassign-event"
                      >
                        <option value="">{t("offboarding:sheet.reassign.selectPh")}</option>
                        {activeEvents.map(ev => (
                          <option key={ev.id} value={ev.id}>
                            {ev.name}{ev.endDate ? ` (${t("offboarding:sheet.reassign.endsOn", { date: fmtDate(ev.endDate, i18n.language) })})` : ` (${t("offboarding:sheet.reassign.ongoing")})`}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        disabled={!selectedEventId || reassignMut.isPending}
                        onClick={() => reassignMut.mutate(selectedEventId)}
                        data-testid="button-reassign-confirm"
                      >
                        {reassignMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("offboarding:sheet.reassign.confirm")}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowReassign(false)}>{t("offboarding:sheet.reassign.cancel")}</Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setShowReassign(true)} className="border-border" data-testid="button-show-reassign">
                      <ArrowRight className="h-4 w-4 me-2 rtl:rotate-180" /> {t("offboarding:sheet.reassign.choose")}
                    </Button>
                  )}
                </CardContent>
              </Card>

              {emp.offboardingStatus === null && (
                <div className="flex items-center justify-between p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t("offboarding:sheet.begin.title")}</p>
                    <p className="text-xs text-muted-foreground">{t("offboarding:sheet.begin.desc")}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => startMut.mutate()}
                    disabled={startMut.isPending}
                    data-testid="button-start-offboarding"
                  >
                    {startMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("offboarding:sheet.begin.btn")}
                  </Button>
                </div>
              )}

              {emp.offboardingStatus === "in_progress" && (
                <div className={`flex items-center justify-between p-4 border rounded-lg ${
                  readiness === "ready"
                    ? "bg-emerald-500/5 border-emerald-500/20"
                    : "bg-muted/10 border-border"
                }`}>
                  <div>
                    <p className="text-sm font-medium text-foreground">{t("offboarding:sheet.complete.title")}</p>
                    <p className="text-xs text-muted-foreground">
                      {readiness === "ready"
                        ? t("offboarding:sheet.complete.ready")
                        : t("offboarding:sheet.complete.pending", { count: pendingAssets, replace: { count: formatNumber(pendingAssets, i18n.language) } })}
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
                    {completeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 me-1.5" />{t("offboarding:sheet.complete.btn")}</>}
                  </Button>
                </div>
              )}
            </>
          )}

          {tab === "assets" && (
            <>
              {settlementLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /><span>{t("offboarding:assets.loading")}</span>
                </div>
              ) : !settlement?.assetChecklist.length ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{t("offboarding:assets.none")}</p>
                </div>
              ) : (
                <>
                  {pendingAssets > 0 && (
                    <div className="flex gap-2 p-3 bg-muted/20 border border-border/50 rounded-lg">
                      <span className="text-xs text-muted-foreground flex-1 self-center">{t("offboarding:assets.pendingNote", { count: pendingAssets, replace: { count: formatNumber(pendingAssets, i18n.language) } })}</span>
                      <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                        onClick={() => bulkConfirmMut.mutate("returned")} disabled={bulkConfirmMut.isPending}
                        data-testid="button-bulk-returned">
                        <Check className="h-3.5 w-3.5 me-1" /> {t("offboarding:assets.allReturned")}
                      </Button>
                      <Button size="sm" variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                        onClick={() => bulkConfirmMut.mutate("not_returned")} disabled={bulkConfirmMut.isPending}
                        data-testid="button-bulk-not-returned">
                        <X className="h-3.5 w-3.5 me-1" /> {t("offboarding:assets.noneReturned")}
                      </Button>
                    </div>
                  )}

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
                              <span className="font-medium text-sm text-foreground"><bdi>{asset.assetName}</bdi></span>
                              {asset.assetCategory && (
                                <span className="text-[10px] bg-muted/40 border border-border/50 rounded px-1.5 py-0.5 text-muted-foreground"><bdi>{asset.assetCategory}</bdi></span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span>{t("offboarding:assets.assigned", { date: fmtDate(asset.assignedAt, i18n.language) })}</span>
                              <span>·</span>
                              <span className="font-semibold text-foreground" dir="ltr">{formatSAR(asset.assetPrice, i18n.language)}</span>
                            </div>

                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              {asset.status === "assigned" && (
                                <Badge variant="outline" className="text-[11px] border-amber-500/40 text-amber-400">{t("offboarding:assets.pending")}</Badge>
                              )}
                              {asset.status === "returned" && (
                                <Badge variant="outline" className="text-[11px] border-emerald-500/40 text-emerald-400"><CheckCircle2 className="h-3 w-3 me-1" />{t("offboarding:assets.returned")}</Badge>
                              )}
                              {asset.status === "not_returned" && (
                                <>
                                  <Badge variant="outline" className="text-[11px] border-red-500/40 text-red-400"><X className="h-3 w-3 me-1" />{t("offboarding:assets.notReturned")}</Badge>
                                  {asset.deductionWaived === true ? (
                                    <Badge variant="outline" className="text-[11px] border-purple-500/40 text-purple-400"><Ban className="h-3 w-3 me-1" />{t("offboarding:assets.deductionWaived")}</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[11px] border-orange-500/40 text-orange-400"><TrendingDown className="h-3 w-3 me-1" /><span dir="ltr">−{formatSAR(asset.assetPrice, i18n.language)}</span></Badge>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col gap-1.5 shrink-0">
                            {asset.status === "assigned" && (
                              <>
                                <Button size="sm" variant="outline" className="text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 h-7"
                                  onClick={() => confirmMut.mutate({ assetId: asset.id, status: "returned" })} disabled={confirmMut.isPending}
                                  data-testid={`button-confirm-returned-${asset.id}`}>
                                  <Check className="h-3 w-3 me-1" /> {t("offboarding:assets.btnReturned")}
                                </Button>
                                <Button size="sm" variant="outline" className="text-xs border-red-500/40 text-red-400 hover:bg-red-500/10 h-7"
                                  onClick={() => confirmMut.mutate({ assetId: asset.id, status: "not_returned" })} disabled={confirmMut.isPending}
                                  data-testid={`button-confirm-not-returned-${asset.id}`}>
                                  <X className="h-3 w-3 me-1" /> {t("offboarding:assets.btnNotReturned")}
                                </Button>
                              </>
                            )}
                            {asset.status === "not_returned" && asset.deductionWaived !== true && (
                              <Button size="sm" variant="outline" className="text-xs border-purple-500/40 text-purple-400 hover:bg-purple-500/10 h-7"
                                onClick={() => setWaivedAsset(asset)}
                                data-testid={`button-waive-${asset.id}`}>
                                <Ban className="h-3 w-3 me-1" /> {t("offboarding:assets.btnWaive")}
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

          {tab === "settlement" && (
            <>
              {settlementLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /><span>{t("offboarding:settlement.calculating")}</span>
                </div>
              ) : !settlement ? (
                <div className="text-center py-12 text-muted-foreground text-sm">{t("offboarding:settlement.unable")}</div>
              ) : (
                <>
                  <Card className="border-border">
                    <CardContent className="p-4 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("offboarding:settlement.period")}</p>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: t("offboarding:settlement.startDate"), value: fmtDate(settlement.period.start, i18n.language) },
                          { label: t("offboarding:settlement.endDate"), value: fmtDate(settlement.period.end, i18n.language) },
                          { label: t("offboarding:settlement.calendarDays"), value: formatNumber(settlement.period.calendarDays, i18n.language) },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <p className="text-[10px] text-muted-foreground">{label}</p>
                            <p className="text-sm font-medium text-foreground" dir="ltr">{value}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border">
                    <CardContent className="p-4 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("offboarding:settlement.salary")}</p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between text-muted-foreground">
                          <span>{t("offboarding:settlement.monthly")}</span>
                          <span className="font-mono" dir="ltr">{formatSAR(settlement.salary.monthly, i18n.language)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>{t("offboarding:settlement.daily")}</span>
                          <span className="font-mono" dir="ltr">{formatSAR(settlement.salary.daily, i18n.language)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>{t("offboarding:settlement.calendarMul", { count: settlement.period.calendarDays, replace: { count: formatNumber(settlement.period.calendarDays, i18n.language) } })}</span>
                          <span className="font-mono font-semibold text-foreground" dir="ltr">{formatSAR(settlement.salary.gross, i18n.language)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border">
                    <CardContent className="p-4 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("offboarding:settlement.attendance")}</p>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: t("offboarding:settlement.worked"), value: settlement.attendance.workedDays, color: "text-emerald-400" },
                          { label: t("offboarding:settlement.absent"), value: settlement.attendance.absentDays, color: "text-red-400" },
                          { label: t("offboarding:settlement.logged"), value: settlement.attendance.loggedDays, color: "text-foreground" },
                        ].map(({ label, value, color }) => (
                          <div key={label}>
                            <p className="text-[10px] text-muted-foreground">{label}</p>
                            <p className={`text-sm font-medium ${color}`} dir="ltr">{formatNumber(value, i18n.language)}</p>
                          </div>
                        ))}
                      </div>
                      {settlement.attendance.loggedDays === 0 && (
                        <p className="text-[11px] text-muted-foreground italic">{t("offboarding:settlement.noAttendance")}</p>
                      )}
                    </CardContent>
                  </Card>

                  {settlement.deductions.length > 0 && (
                    <Card className="border-red-500/20 bg-red-500/5">
                      <CardContent className="p-4 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-red-400">{t("offboarding:settlement.deductions")}</p>
                        <div className="space-y-1.5">
                          {settlement.deductions.map(d => (
                            <div key={d.employeeAssetId} className="flex justify-between text-sm">
                              <span className="text-muted-foreground"><bdi>{d.assetName}</bdi></span>
                              <span className="font-mono text-red-400" dir="ltr">−{formatSAR(d.price, i18n.language)}</span>
                            </div>
                          ))}
                        </div>
                        <Separator className="bg-red-500/20" />
                        <div className="flex justify-between text-sm font-semibold">
                          <span className="text-muted-foreground">{t("offboarding:settlement.totalDeductions")}</span>
                          <span className="font-mono text-red-400" dir="ltr">−{formatSAR(settlement.totalDeductions, i18n.language)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card className="border-emerald-500/20 bg-emerald-500/5">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{t("offboarding:settlement.net")}</p>
                          <p className="text-2xl font-bold text-emerald-400 font-mono" dir="ltr">{formatSAR(settlement.netSettlement, i18n.language)}</p>
                          {emp.employmentType === "smp" && (
                            <p className="text-[11px] text-muted-foreground mt-1">{t("offboarding:settlement.smpReported")}</p>
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

function CompletedTab() {
  const { t, i18n } = useTranslation(["offboarding"]);
  const [search, setSearch] = useState("");
  const { data: completed = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/offboarding/completed"],
    queryFn: () => apiRequest("GET", "/api/offboarding/completed").then(r => r.json()),
    staleTime: 30_000,
  });

  const filtered = completed.filter((e: any) => {
    const q = search.toLowerCase();
    return !q || (e.fullNameEn ?? "").toLowerCase().includes(q) || e.employeeNumber?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder={t("offboarding:completed.searchPh")} className="ps-9 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-completed-search" />
      </div>
      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="text-start py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("offboarding:completed.h.employee")}</th>
              <th className="text-start py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("offboarding:completed.h.event")}</th>
              <th className="text-start py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("offboarding:completed.h.completed")}</th>
              <th className="text-end py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("offboarding:completed.h.gross")}</th>
              <th className="text-end py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("offboarding:completed.h.deductions")}</th>
              <th className="text-end py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("offboarding:completed.h.net")}</th>
              <th className="text-start py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("offboarding:completed.h.payment")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="py-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /><p className="text-sm">{t("offboarding:completed.loading")}</p></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">{t("offboarding:completed.none")}</td></tr>
            ) : filtered.map((emp: any) => (
              <tr key={emp.id} className="border-b border-border/30 hover:bg-muted/[0.08] transition-colors" data-testid={`completed-row-${emp.id}`}>
                <td className="py-3 px-4">
                  <div className="font-medium text-foreground"><bdi>{emp.fullNameEn ?? "—"}</bdi></div>
                  <div className="text-xs text-muted-foreground font-mono" dir="ltr">#{emp.employeeNumber}</div>
                </td>
                <td className="py-3 px-4 text-muted-foreground"><bdi>{emp.eventName ?? "—"}</bdi></td>
                <td className="py-3 px-4 text-muted-foreground" dir="ltr">{fmtDate(emp.offboardingCompletedAt, i18n.language)}</td>
                <td className="py-3 px-4 text-end font-mono text-emerald-400" dir="ltr">{emp.finalGrossPay ? formatSAR(parseFloat(emp.finalGrossPay), i18n.language) : "—"}</td>
                <td className="py-3 px-4 text-end font-mono text-red-400" dir="ltr">{emp.finalDeductions ? `-${formatSAR(parseFloat(emp.finalDeductions), i18n.language)}` : "—"}</td>
                <td className="py-3 px-4 text-end font-mono font-bold text-foreground" dir="ltr">{emp.finalNetSettlement ? formatSAR(parseFloat(emp.finalNetSettlement), i18n.language) : "—"}</td>
                <td className="py-3 px-4">
                  {emp.settlementPaidAt ? (
                    <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400">{t("offboarding:completed.paid", { date: fmtDate(emp.settlementPaidAt, i18n.language) })}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">{t("offboarding:completed.unpaid")}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OffboardingPage() {
  const { t, i18n } = useTranslation(["offboarding"]);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedEmp, setSelectedEmp] = useState<OffboardingEmployee | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"queue" | "completed">("queue");

  const { data: employees = [], isLoading } = useQuery<OffboardingEmployee[]>({
    queryKey: ["/api/offboarding"],
    queryFn: () => apiRequest("GET", "/api/offboarding").then(r => r.json()),
    staleTime: 30_000,
  });

  const { data: stats } = useQuery<OffboardingStats>({
    queryKey: ["/api/offboarding/stats"],
    queryFn: () => apiRequest("GET", "/api/offboarding/stats").then(r => r.json()),
    staleTime: 30_000,
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
    queryFn: () => apiRequest("GET", "/api/events").then(r => r.json()),
    staleTime: 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/offboarding"] });
    qc.invalidateQueries({ queryKey: ["/api/offboarding/stats"] });
  };

  const bulkStartMut = useMutation({
    mutationFn: (ids: string[]) => apiRequest("POST", "/api/offboarding/bulk-start", { ids }).then(r => r.json()),
    onSuccess: (data: any) => {
      toast({ title: t("offboarding:toasts.bulkStarted", { count: data.started, replace: { count: formatNumber(data.started, i18n.language) } }) });
      setSelectedIds(new Set());
      invalidate();
    },
    onError: (e: any) => toast({ title: t("offboarding:toasts.error"), description: e.message, variant: "destructive" }),
  });

  const bulkCompleteMut = useMutation({
    mutationFn: (ids: string[]) => apiRequest("POST", "/api/offboarding/bulk-complete", { ids }).then(r => r.json()),
    onSuccess: (data: any) => {
      const msg = data.errors?.length > 0
        ? t("offboarding:toasts.bulkPartial", {
            completed: formatNumber(data.completed, i18n.language),
            total: formatNumber(data.total, i18n.language),
            failed: formatNumber(data.errors.length, i18n.language),
          })
        : t("offboarding:toasts.bulkCompleted", { count: data.completed, replace: { count: formatNumber(data.completed, i18n.language) } });
      toast({ title: msg });
      setSelectedIds(new Set());
      invalidate();
    },
    onError: (e: any) => toast({ title: t("offboarding:toasts.error"), description: e.message, variant: "destructive" }),
  });

  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    return !q || (e.fullNameEn ?? "").toLowerCase().includes(q)
      || e.employeeNumber.toLowerCase().includes(q)
      || (e.eventName ?? "").toLowerCase().includes(q)
      || (e.nationalId ?? "").includes(q);
  });

  const toggleId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(e => e.id)));
    }
  };

  const selectedPending = filtered.filter(e => selectedIds.has(e.id) && e.offboardingStatus === null);
  const selectedInProgress = filtered.filter(e => selectedIds.has(e.id) && e.offboardingStatus === "in_progress");

  function statusBadge(emp: OffboardingEmployee) {
    if (emp.offboardingStatus === "in_progress") return (
      <Badge variant="outline" className="text-[11px] border-amber-500/40 text-amber-400">{t("offboarding:table.statusInProgress")}</Badge>
    );
    return <Badge variant="outline" className="text-[11px] border-blue-500/40 text-blue-400">{t("offboarding:table.statusPending")}</Badge>;
  }

  const STAT_CARDS = [
    { key: "pending", label: t("offboarding:stats.pending"), value: stats?.pending ?? 0, icon: Clock, color: "border-s-blue-500" },
    { key: "inProgress", label: t("offboarding:stats.inProgress"), value: stats?.inProgress ?? 0, icon: RefreshCw, color: "border-s-amber-500" },
    { key: "ready", label: t("offboarding:stats.ready"), value: stats?.ready ?? 0, icon: CheckCircle, color: "border-s-emerald-500" },
    { key: "completedToday", label: t("offboarding:stats.completedToday"), value: stats?.completedToday ?? 0, icon: CheckCircle2, color: "border-s-primary" },
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <LogOut className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground tracking-tight">{t("offboarding:page.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("offboarding:page.subtitle")}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-1 border-b border-border">
          {(["queue", "completed"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`} data-testid={`tab-offboarding-main-${tab}`}>
              {tab === "queue" ? t("offboarding:tabs.queue") : t("offboarding:tabs.completed")}
            </button>
          ))}
        </div>

        {activeTab === "completed" && <CompletedTab />}
        {activeTab === "queue" && <>
        <div className="grid grid-cols-4 gap-4">
          {STAT_CARDS.map(({ key, label, value, icon: Icon, color }) => (
            <Card key={key} className={`border-s-4 ${color} border-border`}>
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-2xl font-bold text-foreground" data-testid={`stat-offboarding-${key}`}>{formatNumber(value, i18n.language)}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("offboarding:table.searchPh")}
              className="ps-9 bg-card border-border"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-offboarding-search"
            />
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("offboarding:table.selected", { count: selectedIds.size, replace: { count: formatNumber(selectedIds.size, i18n.language) } })}</span>
              {selectedPending.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 gap-1.5"
                  onClick={() => bulkStartMut.mutate(selectedPending.map(e => e.id))}
                  disabled={bulkStartMut.isPending}
                  data-testid="button-bulk-start-offboarding"
                >
                  {bulkStartMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                  {t("offboarding:table.start", { count: selectedPending.length, replace: { count: formatNumber(selectedPending.length, i18n.language) } })}
                </Button>
              )}
              {selectedInProgress.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 gap-1.5"
                  onClick={() => bulkCompleteMut.mutate(selectedInProgress.map(e => e.id))}
                  disabled={bulkCompleteMut.isPending}
                  data-testid="button-bulk-complete-offboarding"
                >
                  {bulkCompleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  {t("offboarding:table.complete", { count: selectedInProgress.length, replace: { count: formatNumber(selectedInProgress.length, i18n.language) } })}
                </Button>
              )}
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setSelectedIds(new Set())}>
                {t("offboarding:table.clear")}
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="py-3 px-3 w-10">
                  <Checkbox
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onCheckedChange={toggleAll}
                    data-testid="checkbox-select-all-offboarding"
                  />
                </th>
                <th className="text-start py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("offboarding:table.h.employee")}</th>
                <th className="text-start py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("offboarding:table.h.event")}</th>
                <th className="text-start py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("offboarding:table.h.reason")}</th>
                <th className="text-start py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("offboarding:table.h.endDate")}</th>
                <th className="text-start py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("offboarding:table.h.salary")}</th>
                <th className="text-start py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("offboarding:table.h.status")}</th>
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    <p className="text-sm">{t("offboarding:table.loading")}</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-muted-foreground">
                    <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">{search ? t("offboarding:table.noMatches") : t("offboarding:table.noEmployees")}</p>
                    {!search && <p className="text-xs mt-1">{t("offboarding:table.noEmployeesHint")}</p>}
                  </td>
                </tr>
              ) : filtered.map((emp, i) => (
                <tr
                  key={emp.id}
                  data-testid={`offboarding-row-${i}`}
                  className="border-b border-border/30 hover:bg-muted/[0.08] transition-colors cursor-pointer"
                  onClick={() => setSelectedEmp(emp)}
                >
                  <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(emp.id)}
                      onCheckedChange={() => toggleId(emp.id)}
                      data-testid={`checkbox-offboarding-${emp.id}`}
                    />
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-foreground"><bdi>{emp.fullNameEn ?? "—"}</bdi></div>
                    <div className="text-xs text-muted-foreground font-mono" dir="ltr">#{emp.employeeNumber}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-muted-foreground"><bdi>{emp.eventName ?? "—"}</bdi></span>
                  </td>
                  <td className="py-3 px-4">
                    {emp.terminationCategory ? (
                      <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400">
                        {t(`offboarding:categories.${emp.terminationCategory}`, { defaultValue: emp.terminationCategory })}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("offboarding:table.eventEnded")}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-muted-foreground" dir="ltr">{fmtDate(emp.endDate ?? emp.eventEndDate, i18n.language)}</td>
                  <td className="py-3 px-4 font-mono text-muted-foreground" dir="ltr">
                    {emp.salary ? formatSAR(parseFloat(emp.salary), i18n.language) : "—"}
                  </td>
                  <td className="py-3 px-4">{statusBadge(emp)}</td>
                  <td className="py-3 px-4 text-end">
                    <ChevronRight className="h-4 w-4 text-muted-foreground ms-auto rtl:rotate-180" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>}
      </div>

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
