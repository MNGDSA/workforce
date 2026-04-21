/**
 * Dev/staging escape hatch — when SMS delivery is unavailable (carrier
 * outage, sandbox account, etc.), log the plaintext OTP code to the server
 * console so login / activation flows remain testable without a working SMS
 * channel. NEVER active in production: the guard is `NODE_ENV === "production"`,
 * and any deployment that sets NODE_ENV correctly is automatically silent.
 *
 * Output format is deliberately greppable:
 *   [DEV-OTP] <purpose> code for <phone>: <code>
 */
export function logOtpForDev(phone: string, code: string, purpose: string): void {
  if (process.env.NODE_ENV === "production") return;
  console.log(`[DEV-OTP] ${purpose} code for ${phone}: ${code}`);
}
