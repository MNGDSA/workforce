/**
 * Operational probe for `getPortalBaseUrl()`.
 *
 * Architect hardening item #1 from the onboarding-reminder code review:
 * an unset `public_app_url` (or PUBLIC_APP_URL) is a silent misconfig
 * until the first SMS-emitting action throws. Surfacing the probe at
 * boot (warn-log) and on `/api/health` (a JSON field ops already
 * watches) gives operators a one-glance way to spot the gap before any
 * candidate-facing flow blows up.
 *
 * Behaviour contract:
 *  - Never throws. Catches `PortalBaseUrlNotConfiguredError` and any
 *    unexpected error and converts them into a typed status object so
 *    the health endpoint can keep returning JSON.
 *  - Bounded by a short timeout so a hung DB does not slow the health
 *    response (the health route already has its own 2-second db ping;
 *    we use a tighter 1-second budget here because the lookup is a
 *    single indexed PK read against `system_settings`).
 *  - `status: "ok" | "not_configured" | "error"` is the contract.
 *    Anything else indicates a programmer mistake.
 */
import { getPortalBaseUrl, PortalBaseUrlNotConfiguredError } from "./portal-url";

export type PortalUrlProbeResult =
  | { status: "ok"; url: string }
  | { status: "not_configured" }
  | { status: "error"; error: string };

const PROBE_TIMEOUT_MS = 1000;

export async function probePortalUrl(): Promise<PortalUrlProbeResult> {
  try {
    const url = await Promise.race<string>([
      getPortalBaseUrl(),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("portal-url probe timeout")), PROBE_TIMEOUT_MS),
      ),
    ]);
    return { status: "ok", url };
  } catch (err) {
    if (err instanceof PortalBaseUrlNotConfiguredError) {
      return { status: "not_configured" };
    }
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
