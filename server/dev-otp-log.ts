/**
 * Dev/staging escape hatch — when SMS delivery is unavailable (carrier
 * outage, sandbox account, etc.), log the plaintext OTP code to the server
 * console so login / activation flows remain testable without a working SMS
 * channel.
 *
 * SECURITY: gate is an explicit allow-list, not a block-list. Plaintext
 * OTPs MUST NEVER appear in production logs. We require NODE_ENV to be
 * exactly "development" or "test", so any misconfiguration (unset, typo'd
 * "prod", "Production", "staging", etc.) fails closed and produces zero
 * output. A separate ENABLE_DEV_OTP_LOG=true override is also accepted in
 * case a maintainer needs to debug a non-prod environment that happens to
 * set NODE_ENV=production for build-correctness reasons (e.g. a preview
 * build) — this is opt-in, never default.
 *
 * Output format is deliberately greppable:
 *   [DEV-OTP] <purpose> code for <phone>: <code>
 *
 * In addition, the most-recent code per (phone, purpose) is held in an
 * in-process Map for the same gated environments — exposed via the
 * /api/_dev/last-otp/:phone endpoint so e2e tests and load-test scripts
 * can fetch the code without scraping logs. Same allow-list contract.
 */
type DevOtpEntry = { code: string; purpose: string; createdAt: number };
const devOtpStore = new Map<string, DevOtpEntry>();
const DEV_OTP_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Three-tier gate. The contract:
 *
 *   NODE_ENV=development | test
 *     → gate OPEN unconditionally.
 *
 *   NODE_ENV=production
 *     → gate is CLOSED unless BOTH
 *        ENABLE_DEV_OTP_LOG=true AND
 *        ALLOW_DEV_BYPASS_IN_PROD=true
 *       are explicitly set. The dual-flag requirement exists ONLY to support
 *       staging/preview deployments that are forced to set
 *       NODE_ENV=production for build correctness but are not actually
 *       serving real users. Setting either flag alone in a prod environment
 *       is a misconfiguration and the gate stays closed. assertDevGateSafe()
 *       (called at boot) additionally fail-fasts the process when only one
 *       flag is set, and logs a CRITICAL warning when both are set.
 *
 *   NODE_ENV=anything else (e.g. "staging", "preview", unset)
 *     → gate OPEN if ENABLE_DEV_OTP_LOG=true is set, else CLOSED.
 *
 * This is intentionally fail-closed for production traffic.
 */
function devGateOpen(): boolean {
  const env = process.env.NODE_ENV;
  if (env === "development" || env === "test") return true;
  if (env === "production") {
    return (
      process.env.ENABLE_DEV_OTP_LOG === "true" &&
      process.env.ALLOW_DEV_BYPASS_IN_PROD === "true"
    );
  }
  return process.env.ENABLE_DEV_OTP_LOG === "true";
}

export function logOtpForDev(phone: string, code: string, purpose: string): void {
  if (!devGateOpen()) return;
  console.log(`[DEV-OTP] ${purpose} code for ${phone}: ${code}`);
  devOtpStore.set(phone, { code, purpose, createdAt: Date.now() });
}

/**
 * Returns the most recently issued OTP for a phone, or null if missing/expired
 * or if the dev gate is closed. Safe to call from production code paths — it
 * fail-closes when the gate is shut.
 */
export function peekLatestDevOtp(phone: string): { code: string; purpose: string } | null {
  if (!devGateOpen()) return null;
  const entry = devOtpStore.get(phone);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > DEV_OTP_TTL_MS) {
    devOtpStore.delete(phone);
    return null;
  }
  return { code: entry.code, purpose: entry.purpose };
}

export function isDevOtpGateOpen(): boolean {
  return devGateOpen();
}

/**
 * Load-test only: when NODE_ENV is "development" or "test" AND
 * LOAD_TEST_BYPASS_THROTTLE=1 is set, OTP request/verify/activate IP
 * throttles short-circuit to "allowed". This bypass is permanently
 * unavailable in production — even with ALLOW_DEV_BYPASS_IN_PROD set —
 * because removing throttles in front of real traffic is never a
 * legitimate operation, no matter how the env happens to be labelled.
 */
export function isLoadTestThrottleBypassEnabled(): boolean {
  const env = process.env.NODE_ENV;
  const inDevOrTest = env === "development" || env === "test";
  return inDevOrTest && process.env.LOAD_TEST_BYPASS_THROTTLE === "1";
}

/**
 * Boot-time safety check. Call once at startup BEFORE any traffic is served.
 *
 *   - If NODE_ENV=production and any dev flag is set without the dual-flag
 *     opt-in, throw — operator misconfigured the env and we refuse to serve.
 *   - If NODE_ENV=production and BOTH dual-flag opt-ins are set, log a
 *     CRITICAL warning (this should only ever be a deliberate staging
 *     deployment).
 *   - Always refuse to boot if LOAD_TEST_BYPASS_THROTTLE=1 is set with
 *     NODE_ENV=production (no legitimate reason).
 */
export function assertDevGateSafe(log: (msg: string, src?: string) => void): void {
  const env = process.env.NODE_ENV;
  const enableOtp = process.env.ENABLE_DEV_OTP_LOG === "true";
  const allowProd = process.env.ALLOW_DEV_BYPASS_IN_PROD === "true";
  const loadBypass = process.env.LOAD_TEST_BYPASS_THROTTLE === "1";

  if (env === "production") {
    if (loadBypass) {
      throw new Error(
        "boot-safety: LOAD_TEST_BYPASS_THROTTLE=1 is set with NODE_ENV=production. " +
          "OTP/activation throttles must NEVER be disabled in production. Refusing to start.",
      );
    }
    // XOR — exactly one of the two prod-override flags is set.
    if (enableOtp !== allowProd) {
      throw new Error(
        "boot-safety: NODE_ENV=production but only one of " +
          "ENABLE_DEV_OTP_LOG / ALLOW_DEV_BYPASS_IN_PROD is set. The dev OTP gate " +
          "requires BOTH flags in production deployments (intended for staging/preview " +
          "builds that ship NODE_ENV=production for build correctness). Refusing to start.",
      );
    }
    if (enableOtp && allowProd) {
      log(
        "[CRITICAL] dev OTP gate is OPEN in a NODE_ENV=production process " +
          "(ENABLE_DEV_OTP_LOG + ALLOW_DEV_BYPASS_IN_PROD both true). " +
          "Plaintext OTPs WILL be logged and exposed via /api/_dev/last-otp/:phone. " +
          "Confirm this is staging/preview traffic ONLY — never real users.",
        "boot-safety",
      );
    }
    return;
  }

  // Non-production: emit a single info line if any dev flag is on, so the
  // operator can see at-a-glance which bypasses are active in this process.
  const flags: string[] = [];
  if (env === "development" || env === "test") flags.push(`NODE_ENV=${env}`);
  if (enableOtp) flags.push("ENABLE_DEV_OTP_LOG=true");
  if (loadBypass) flags.push("LOAD_TEST_BYPASS_THROTTLE=1");
  if (flags.length > 0) {
    log(
      `dev OTP gate active: ${flags.join(", ")}. /api/_dev/last-otp/:phone is reachable; ` +
        `SMS sender skips real gateway calls.`,
      "boot-safety",
    );
  }
}
