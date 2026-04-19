import type { Request } from "express";

/**
 * Resolve the real client IP for rate-limiting / audit purposes.
 *
 * Production chain: Client → Cloudflare edge → DigitalOcean LB → our app.
 *
 * 1. CF-Connecting-IP — Cloudflare sets this to the real client IP. Trusted
 *    because Cloudflare is our only true edge; an attacker hitting the origin
 *    directly (bypassing CF) cannot forge it because the header is overwritten,
 *    not appended to, and it will be absent from non-CF traffic.
 *
 * 2. X-Forwarded-For (rightmost) — our LB APPENDS the upstream-visible client
 *    address to whatever the client may have sent. Taking the rightmost entry
 *    is the only one we can trust; the leftmost is attacker-controllable.
 *
 * 3. req.ip — direct connection (dev / internal traffic).
 */
export function getClientIp(req: Request): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim().length > 0) {
    return cf.trim();
  }

  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    const parts = xff.split(",");
    return parts[parts.length - 1]!.trim();
  }

  return req.ip ?? "unknown";
}
