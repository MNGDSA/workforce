/**
 * Single source of truth for the public-facing workforce app base URL
 * that gets embedded in every candidate-facing SMS.
 *
 * Resolution order (first non-empty wins):
 *   1. `public_app_url` system setting (admin override, hot-editable)
 *   2. `PUBLIC_APP_URL` environment variable (deploy-time)
 *   3. `REPLIT_DEV_DOMAIN` env — ONLY when `NODE_ENV` is `development`
 *      or `test`. In production this fallback is intentionally
 *      ignored: the dev-domain env is auto-set by Replit in any
 *      workspace, so trusting it in production would silently route
 *      candidates to the agent's sandbox URL on a misconfigured
 *      production deploy. Production must explicitly set
 *      `public_app_url` or `PUBLIC_APP_URL` — period.
 *
 * If no source resolves to a non-empty value, this throws
 * `PortalBaseUrlNotConfiguredError`. There is intentionally NO
 * hard-coded production hostname fallback: a silent fallback masks
 * misconfiguration on any future deployment that lives at a different
 * host and produces 404s for real candidates. Operators must
 * configure the URL explicitly.
 *
 * Always returns the URL with no trailing slash so callers can append
 * `/foo` cleanly.
 *
 * Hot-read by design: the system-setting lookup is performed on every
 * call so an admin who flips `public_app_url` in settings sees the
 * change on the very next SMS without a server restart. Per-call cost
 * is one indexed PK lookup against `system_settings` — negligible
 * relative to an SMS gateway round-trip.
 */
import { db } from "../db";
import { systemSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

export class PortalBaseUrlNotConfiguredError extends Error {
  constructor() {
    super(
      "Workforce portal base URL is not configured. Set the `public_app_url` system setting or the PUBLIC_APP_URL environment variable.",
    );
    this.name = "PortalBaseUrlNotConfiguredError";
  }
}

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function stripTrailingSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

function nonEmpty(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve the workforce app base URL. See file header for the contract.
 *
 * Accepts an optional Drizzle transaction handle so callers already
 * inside a `db.transaction(async (tx) => { ... })` block can read the
 * setting through the same connection.
 */
export async function getPortalBaseUrl(tx: DbOrTx = db): Promise<string> {
  const rows = await tx
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "public_app_url"));
  const fromSetting = nonEmpty(rows[0]?.value);
  if (fromSetting) return stripTrailingSlash(fromSetting);

  const fromEnv = nonEmpty(process.env.PUBLIC_APP_URL);
  if (fromEnv) return stripTrailingSlash(fromEnv);

  // REPLIT_DEV_DOMAIN is auto-set by Replit in EVERY workspace —
  // including production deployments that just happen to also be
  // running on Replit infra. Trusting it in production would silently
  // route candidates to a workspace URL when the operator forgot to
  // set PUBLIC_APP_URL. Gate it behind an explicit dev/test NODE_ENV
  // check so production fails loudly instead.
  const env = process.env.NODE_ENV;
  const inDevOrTest = env === "development" || env === "test";
  if (inDevOrTest) {
    const devDomain = nonEmpty(process.env.REPLIT_DEV_DOMAIN);
    if (devDomain) return stripTrailingSlash(`https://${devDomain}`);
  }

  throw new PortalBaseUrlNotConfiguredError();
}
