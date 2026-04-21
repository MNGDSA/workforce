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
 */
export function logOtpForDev(phone: string, code: string, purpose: string): void {
  const env = process.env.NODE_ENV;
  const explicitOverride = process.env.ENABLE_DEV_OTP_LOG === "true";
  const inDevOrTest = env === "development" || env === "test";
  if (!inDevOrTest && !explicitOverride) return;
  console.log(`[DEV-OTP] ${purpose} code for ${phone}: ${code}`);
}
