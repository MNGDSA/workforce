import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Boot-time idempotent migration: ensures the `login_rate_limit_buckets`
 * table exists. Postgres-backed rate-limit state for login flows so the
 * limit holds across multiple app instances (the previous in-memory
 * bucket was per-process and trivially bypassable behind a load balancer).
 *
 * Production deploys do not run drizzle-kit push automatically. Without
 * this script the login route crashes with
 * `relation "login_rate_limit_buckets" does not exist` on the first
 * authentication attempt.
 *
 * Composite PK (scope, key) mirrors the schema: `scope` is the bucket
 * type (e.g. 'phone', 'ip') and `key` is the bucketed identifier.
 */
export async function ensureLoginRateLimitBuckets(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS login_rate_limit_buckets (
      scope varchar(16) NOT NULL,
      key text NOT NULL,
      attempt_count integer NOT NULL DEFAULT 0,
      window_start timestamp NOT NULL DEFAULT now(),
      locked_until timestamp,
      updated_at timestamp NOT NULL DEFAULT now(),
      PRIMARY KEY (scope, key)
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS lrlb_locked_until_idx
        ON login_rate_limit_buckets (locked_until)`,
  );
  log("login_rate_limit_buckets table ensured", "boot-migrate");
}
