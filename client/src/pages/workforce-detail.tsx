// Task #284 — Dedicated full-page route for an individual employee.
// Replaces the modal `EmployeeDetailDialog` (now exported as
// `EmployeeDetailContent` from `workforce.tsx`) with a real page so
// the Workforce flow gets browser-back support, a stable URL, and
// proper deep-linking from notifications/audit log etc.
//
// Tab state lives in the URL (`?tab=details|history|schedule`) so a
// shared link lands on the correct section. Browser back returns to
// the list with the previous scroll position restored (the list page
// stashes `window.scrollY` in sessionStorage on row click).

import { useEffect, useMemo } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, AlertTriangle, ChevronLeft } from "lucide-react";
import DashboardLayout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { EmployeeDetailContent, type Employee } from "@/pages/workforce";
import { usePrintIdCards } from "@/lib/workforce-print";

type TabKey = "details" | "history" | "schedule";

function isTabKey(v: string | null | undefined): v is TabKey {
  return v === "details" || v === "history" || v === "schedule";
}

export default function WorkforceDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { t } = useTranslation("workforce");
  const qc = useQueryClient();
  const id = params.id;

  // Parse `?tab=` from the URL so refresh / shared links land on the
  // right section. Falls back to "details" for unknown values.
  const tab: TabKey = useMemo(() => {
    const raw = new URLSearchParams(search).get("tab");
    return isTabKey(raw) ? raw : "details";
  }, [search]);

  function setTab(next: TabKey) {
    const sp = new URLSearchParams(search);
    if (next === "details") sp.delete("tab");
    else sp.set("tab", next);
    const qs = sp.toString();
    // `replace`-style navigation — tab switches shouldn't pollute
    // browser history with intermediate stops.
    window.history.replaceState(null, "", `/workforce/${id}${qs ? `?${qs}` : ""}`);
    // Force a re-read of the search string so the memo updates.
    setLocation(`/workforce/${id}${qs ? `?${qs}` : ""}`, { replace: true });
  }

  const {
    data: employee,
    isLoading,
    isError,
    error,
  } = useQuery<Employee>({
    queryKey: ["/api/workforce", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/workforce/${id}`);
      return res.json();
    },
    enabled: !!id,
    retry: (failureCount, err: any) => {
      // Don't retry 404s — let the not-found UI render immediately.
      const status = err?.status ?? Number(String(err?.message ?? "").match(/^(\d{3})/)?.[1]);
      if (status === 404) return false;
      return failureCount < 2;
    },
  });

  // The error message shape from `apiRequest` is `${status}: ${body}` so
  // we sniff the leading 404 to distinguish "not found" from a network
  // failure that deserves a retry button instead.
  const isNotFound = isError && /^404/.test(String((error as Error)?.message ?? ""));

  const { printIdCards, pickupSmsDialogJsx } = usePrintIdCards();

  // Reset window scroll on mount so navigating from the list (which
  // may be scrolled deep) lands at the top of the detail page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  function handleClose() {
    // Prefer browser back when the previous entry was the list — this
    // lets the list's scroll-restore effect run with the saved Y. If
    // the user deep-linked the URL there's no list entry to go back
    // to, so navigate to the list directly.
    const ref = typeof document !== "undefined" ? document.referrer : "";
    if (ref && ref.includes("/workforce") && !ref.includes(`/workforce/${id}`)) {
      window.history.back();
    } else {
      setLocation("/workforce");
    }
  }

  return (
    <DashboardLayout>
      {isLoading && (
        <div className="flex items-center justify-center py-24" data-testid="loading-employee">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        </div>
      )}

      {isNotFound && (
        <div className="max-w-xl mx-auto py-16 text-center space-y-4" data-testid="employee-not-found">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-display font-bold text-white">{t("page.notFound")}</h2>
          <p className="text-sm text-muted-foreground">{t("page.notFoundDescription")}</p>
          <Button
            variant="outline"
            className="border-zinc-700"
            onClick={() => setLocation("/workforce")}
            data-testid="button-back-to-workforce-list"
          >
            <ChevronLeft className="h-4 w-4 me-1.5 rtl:rotate-180" />
            {t("page.backToList")}
          </Button>
        </div>
      )}

      {isError && !isNotFound && (
        <div className="max-w-xl mx-auto py-16 text-center space-y-4" data-testid="employee-load-error">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-display font-bold text-white">{t("page.loadError")}</h2>
          <p className="text-sm text-muted-foreground"><bdi>{(error as Error)?.message ?? ""}</bdi></p>
          <Button
            variant="outline"
            className="border-zinc-700"
            onClick={() => setLocation("/workforce")}
            data-testid="button-back-to-workforce-list"
          >
            <ChevronLeft className="h-4 w-4 me-1.5 rtl:rotate-180" />
            {t("page.backToList")}
          </Button>
        </div>
      )}

      {employee && !isError && (
        <EmployeeDetailContent
          employee={employee}
          tab={tab}
          onTabChange={setTab}
          onClose={handleClose}
          onUpdated={() => {
            qc.invalidateQueries({ queryKey: ["/api/workforce"] });
            qc.invalidateQueries({ queryKey: ["/api/workforce", id] });
          }}
          onPrintCard={(emp) => printIdCards([emp])}
          onEmployeeRefreshed={(emp) => {
            // Server returns the updated row; seed the by-id cache so
            // the page reflects the change without an extra round-trip.
            qc.setQueryData(["/api/workforce", id], emp);
            qc.invalidateQueries({ queryKey: ["/api/workforce"] });
          }}
        />
      )}

      {pickupSmsDialogJsx}
    </DashboardLayout>
  );
}
