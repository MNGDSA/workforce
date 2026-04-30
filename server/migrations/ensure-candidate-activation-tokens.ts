import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Boot-time idempotent migration: ensures the `candidate_activation_tokens`
 * table (Task #107) exists. One-time tokens minted at SMP worker creation
 * (or reissue/self-heal). Plain token is sent in SMS, only the SHA-256
 * hash is stored. The single-live-token-per-candidate invariant is
 * enforced via the partial unique index.
 *
 * Production deploys do not run drizzle-kit push automatically. Without
 * this script, the SMP activation flow crashes with
 * `relation "candidate_activation_tokens" does not exist`.
 *
 * The partial unique index `cand_activation_tokens_live_idx` uses an
 * IMMUTABLE predicate (no `now()`) so reissue paths must explicitly stamp
 * `invalidated_at` on prior live rows inside the same tx.
 */
export async function ensureCandidateActivationTokens(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS candidate_activation_tokens (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_id varchar NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      token_hash varchar(64) NOT NULL,
      expires_at timestamp NOT NULL,
      consumed_at timestamp,
      invalidated_at timestamp,
      sms_sent_at timestamp,
      created_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS cand_activation_tokens_hash_idx
        ON candidate_activation_tokens (token_hash)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS cand_activation_tokens_expires_at_idx
        ON candidate_activation_tokens (expires_at)`,
  );
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS cand_activation_tokens_live_idx
        ON candidate_activation_tokens (candidate_id)
        WHERE consumed_at IS NULL AND invalidated_at IS NULL`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS cand_activation_tokens_candidate_idx
        ON candidate_activation_tokens (candidate_id)`,
  );

  log("candidate_activation_tokens table + indexes ensured", "boot-migrate");
}
