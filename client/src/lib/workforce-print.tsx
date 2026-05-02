// Task #284 — shared ID-card print + pickup-SMS flow.
// Extracted from workforce.tsx so both the list page and the new
// /workforce/:id detail page can trigger printing (and the same
// post-print pickup-SMS prompt) without duplicating ~150 lines.

import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatNumber } from "@/lib/format";
import {
  sendPrintJob,
  type IdCardTemplateConfig,
  type PrinterPluginConfig,
} from "@/lib/id-card-renderer";
import { employeeToCardData, type Employee } from "@/pages/workforce";

export function usePrintIdCards(): {
  printIdCards: (emps: Employee[]) => Promise<void>;
  printingIds: Set<string>;
  printProgress: { total: number; done: number } | null;
  pickupSmsDialogJsx: ReactNode;
} {
  const { t: tt } = useTranslation("workforce");
  const { toast } = useToast();
  const qc = useQueryClient();

  const [printingIds, setPrintingIds] = useState<Set<string>>(new Set());
  const [printProgress, setPrintProgress] = useState<{ total: number; done: number } | null>(null);
  const [pickupSmsDialog, setPickupSmsDialog] = useState<{ open: boolean; employeeIds: string[] }>(
    { open: false, employeeIds: [] }
  );
  const [pickupSmsSending, setPickupSmsSending] = useState(false);

  const { data: pickupSmsStatus, isError: pickupStatusError } = useQuery<{ active: boolean }>({
    queryKey: ["/api/id-card-pickup-sms/status"],
    queryFn: () => apiRequest("GET", "/api/id-card-pickup-sms/status").then(r => r.json()),
    enabled: pickupSmsDialog.open,
    staleTime: 0,
    retry: 1,
  });
  // Default to "no plugin" until the status query resolves so Send is never
  // enabled in a no-plugin tenant during the loading window.
  const pickupPluginActive = pickupSmsStatus?.active ?? false;

  async function printIdCards(emps: Employee[]) {
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
        toast({ title: tt("toast.printFailed"), description: tt("toast.printAllFailed"), variant: "destructive" });
      } else if (failCount > 0) {
        toast({ title: tt("toast.printPartial", { done: formatNumber(successCount + pendingCount), total: formatNumber(results.length) }), description: tt("toast.printPartialDesc", { n: formatNumber(failCount) }) });
      } else {
        toast({ title: tt("toast.printingCount", { count: emps.length, n: formatNumber(emps.length) }) });
      }

      qc.invalidateQueries({ queryKey: ["/api/workforce/last-printed-bulk"] });

      // Task #207 — prompt admin to send pickup SMS for eligible (success/pending) employees
      const eligibleIds = statuses.filter(s => s.status !== "failed").map(s => s.employeeId);
      if (eligibleIds.length > 0) {
        setPickupSmsDialog({ open: true, employeeIds: eligibleIds });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({ title: tt("toast.printFailed"), description: message, variant: "destructive" });
    } finally {
      setPrintingIds(new Set());
      setPrintProgress(null);
    }
  }

  const pickupSmsDialogJsx = (
    <AlertDialog
      open={pickupSmsDialog.open}
      onOpenChange={(open) => {
        if (!pickupSmsSending) {
          setPickupSmsDialog((prev) => ({ ...prev, open }));
        }
      }}
    >
      <AlertDialogContent data-testid="dialog-pickup-sms">
        <AlertDialogHeader>
          <AlertDialogTitle>{tt("pickupSms.dialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {pickupSmsDialog.employeeIds.length === 1
              ? tt("pickupSms.dialogDescOne")
              : tt("pickupSms.dialogDescOther", { n: formatNumber(pickupSmsDialog.employeeIds.length) })}
            <br />
            <span className="text-xs text-muted-foreground">{tt("pickupSms.dialogHint")}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {pickupSmsStatus && !pickupPluginActive && (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2"
            data-testid="text-pickup-sms-no-plugin"
          >
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{tt("pickupSms.noPluginNote")}</span>
          </div>
        )}
        {pickupStatusError && (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2"
            data-testid="text-pickup-sms-status-error"
          >
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{tt("pickupSms.statusErrorNote")}</span>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pickupSmsSending} data-testid="button-pickup-sms-skip">
            {tt("pickupSms.skip")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pickupSmsSending || !pickupPluginActive}
            data-testid="button-pickup-sms-send"
            onClick={async (e) => {
              e.preventDefault();
              const ids = pickupSmsDialog.employeeIds;
              setPickupSmsSending(true);
              try {
                const res = await apiRequest("POST", "/api/id-card-pickup-sms/send", { employeeIds: ids });
                const json = await res.json();
                const sent = Number(json?.sent ?? 0);
                const skipped = Number(json?.skipped ?? 0);
                const failed = Number(json?.failed ?? 0);
                if (sent === 0 && failed > 0) {
                  toast({
                    title: tt("pickupSms.sendFailedToast"),
                    description: tt("pickupSms.sentToastDesc", { skipped: formatNumber(skipped), failed: formatNumber(failed) }),
                    variant: "destructive",
                  });
                } else {
                  toast({
                    title: tt("pickupSms.sentToast", { count: sent, n: formatNumber(sent) }),
                    description: skipped + failed > 0
                      ? tt("pickupSms.sentToastDesc", { skipped: formatNumber(skipped), failed: formatNumber(failed) })
                      : undefined,
                  });
                }
                setPickupSmsDialog({ open: false, employeeIds: [] });
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "Unknown error";
                const isNoPlugin = /plugin|gateway|notConfigured/i.test(message);
                toast({
                  title: isNoPlugin ? tt("pickupSms.noActivePluginToast") : tt("pickupSms.sendFailedToast"),
                  description: isNoPlugin ? undefined : message,
                  variant: "destructive",
                });
              } finally {
                setPickupSmsSending(false);
              }
            }}
          >
            {pickupSmsSending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
            {tt("pickupSms.send")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { printIdCards, printingIds, printProgress, pickupSmsDialogJsx };
}
