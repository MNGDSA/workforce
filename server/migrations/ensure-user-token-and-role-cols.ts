import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Boot-time idempotent migration: ensures the three users-table columns
 * added during the RBAC and split-token-revocation rollouts exist.
 *
 *   • role_id                       — RBAC pointer to roles.id. Added as a
 *                                     plain (nullable) varchar here; the
 *                                     one-shot migrate-to-rbac.ts backfill
 *                                     promotes it to NOT NULL with a default
 *                                     once seedRbac has populated the
 *                                     Candidate row. NOT NULL is intentionally
 *                                     NOT enforced here so a fresh boot does
 *                                     not crash on a brand-new users table
 *                                     before the seed runs.
 *   • web_tokens_invalidated_at     — server-side web (cookie) token revocation.
 *   • mobile_tokens_invalidated_at  — server-side mobile (Bearer) token revocation.
 *
 * Production deploys do not run drizzle-kit push automatically. Without
 * this script, getUserByPhone/Email and requireAuth crash with
 * `column "role_id" does not exist` on any environment that pre-dates the
 * RBAC rollout, and any logout request crashes with
 * `column "web_tokens_invalidated_at" does not exist` on environments that
 * pre-date the split-token-revocation work.
 */
export async function ensureUserTokenAndRoleCols(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  await db.execute(sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role_id varchar,
      ADD COLUMN IF NOT EXISTS web_tokens_invalidated_at timestamp,
      ADD COLUMN IF NOT EXISTS mobile_tokens_invalidated_at timestamp
  `);
  log(
    "users.role_id + web/mobile_tokens_invalidated_at columns ensured",
    "boot-migrate",
  );
}
