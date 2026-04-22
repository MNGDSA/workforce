import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

function getConnectionString(): string {
  const url = process.env.DATABASE_URL || "";
  return url.replace(/[?&]sslmode=[^&]*/, "").replace(/\?$/, "");
}

const isProduction = process.env.NODE_ENV === "production";

/**
 * Production TLS policy.
 *
 *   - Default (recommended): full chain verification with the platform CA
 *     bundle. Set DATABASE_CA_CERT (PEM string) when the database provider
 *     issues certs from a non-default root — DigitalOcean Managed PostgreSQL
 *     ships its CA in the cluster dashboard ("ca-certificate.crt"); paste
 *     its full PEM contents into DATABASE_CA_CERT and TLS verifies cleanly.
 *
 *   - Escape hatch: INSECURE_DB_TLS=true disables certificate validation.
 *     This is ONLY for one-off local debugging against a remote DB whose CA
 *     isn't conveniently available. The boot logs an unmissable warning so
 *     it cannot become the silent default. Never set this in real production.
 *
 *   - Non-production: SSL is left unset so local docker/Replit databases
 *     (no TLS) keep working.
 */
function buildSslConfig(): false | { rejectUnauthorized: boolean; ca?: string } | undefined {
  if (!isProduction) return undefined;
  const ca = process.env.DATABASE_CA_CERT?.trim();
  const insecure = process.env.INSECURE_DB_TLS === "true";
  if (insecure) {
    console.warn(
      "[db] INSECURE_DB_TLS=true — Postgres TLS certificate validation DISABLED. " +
        "Operator credentials and PII are exposed to MITM. " +
        "Set DATABASE_CA_CERT to the provider CA and remove INSECURE_DB_TLS for production.",
    );
    return { rejectUnauthorized: false };
  }
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

const pool = new Pool({
  connectionString: getConnectionString(),
  max: 40,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: buildSslConfig(),
});

export const db = drizzle(pool, { schema });
