// Task #107 — Activation token lifecycle tests.
//
// Two suites:
//   A) Pure-function tests (no DB):
//      • generatePlainToken returns base64url, ≥43 chars, ≠ across calls
//      • hashToken is deterministic + 64 hex chars (SHA-256)
//   B) DB-integration tests (require DATABASE_URL):
//      • mint → consume happy-path
//      • re-mint invalidates the prior live token
//      • concurrent re-mint cannot leave two live rows (live partial-unique)
//      • concurrent consume of the same token resolves in exactly one win
//      • expired token fails with EXPIRED
//      • invalidateAllTokensForCandidate is idempotent
//
// All DB writes happen against synthetic candidates seeded in this script and
// are torn down at the end (best-effort).
//
// Run:  npx tsx scripts/test-activation-tokens.ts

import { eq, sql } from "drizzle-orm";
import {
  generatePlainToken,
  hashToken,
  mintActivationToken,
  consumeActivationToken,
  invalidateAllTokensForCandidate,
  ActivationError,
} from "../server/activation-tokens";
import { db } from "../server/db";
import {
  candidates,
  candidateActivationTokens,
  users,
} from "../shared/schema";

let pass = 0, fail = 0;
function ok(cond: boolean, name: string, detail = "") {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else      { fail++; console.error(`✗ ${name}${detail ? "  " + detail : ""}`); }
}
async function expectThrows(
  name: string,
  fn: () => Promise<unknown>,
  predicate: (err: unknown) => boolean,
) {
  try {
    await fn();
    fail++; console.error(`✗ ${name}  (expected throw, got resolution)`);
  } catch (err) {
    if (predicate(err)) { pass++; console.log(`✓ ${name}`); }
    else { fail++; console.error(`✗ ${name}  (wrong error: ${(err as Error).message})`); }
  }
}

// ── Suite A: pure functions ─────────────────────────────────────────────────
{
  const t1 = generatePlainToken();
  const t2 = generatePlainToken();
  ok(typeof t1 === "string", "generatePlainToken returns string");
  ok(t1.length >= 43, "plain token is ≥43 chars (32 bytes → base64url)", `len=${t1.length}`);
  ok(/^[A-Za-z0-9_-]+$/.test(t1), "plain token uses base64url alphabet");
  ok(t1 !== t2, "two consecutive mints produce different tokens");

  const h1 = hashToken(t1);
  const h1again = hashToken(t1);
  const h2 = hashToken(t2);
  ok(/^[0-9a-f]{64}$/.test(h1), "hashToken returns 64 hex chars (SHA-256)");
  ok(h1 === h1again, "hashToken is deterministic for same input");
  ok(h1 !== h2, "hashToken differs across different plain tokens");
  ok(h1 !== t1, "hash is not equal to plain (sanity)");
}

// ── Suite B: DB-integration tests ───────────────────────────────────────────
async function makeCandidate(label: string): Promise<string> {
  const [row] = await db.insert(candidates).values({
    fullNameEn: `T107 Activation Test ${label}`,
    phone: `+9665${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 9)}`,
    nationalId: `1${Math.floor(1e8 + Math.random() * 9e8)}`,
    classification: "smp" as any,
    status: "awaiting_activation" as any,
  } as any).returning({ id: candidates.id });
  return row.id;
}

async function cleanup(candidateIds: string[]) {
  if (!candidateIds.length) return;
  // Tokens cascade off candidate via FK — but be explicit for clarity.
  for (const id of candidateIds) {
    try {
      // Drop any user row created by a successful consume so the candidate
      // FK clears cleanly.
      const [cand] = await db.select({ userId: candidates.userId })
        .from(candidates).where(eq(candidates.id, id));
      await db.delete(candidateActivationTokens)
        .where(eq(candidateActivationTokens.candidateId, id));
      await db.delete(candidates).where(eq(candidates.id, id));
      if (cand?.userId) {
        await db.delete(users).where(eq(users.id, cand.userId));
      }
    } catch (err) {
      console.warn(`  (cleanup warn for ${id}: ${(err as Error).message})`);
    }
  }
}

async function runDbSuite() {
  if (!process.env.DATABASE_URL) {
    console.log("\n(Skipping DB suite — DATABASE_URL not set.)");
    return;
  }
  const candIds: string[] = [];
  try {
    // — Test 1: mint → consume happy path
    {
      const candId = await makeCandidate("happy");
      candIds.push(candId);
      const { plainToken, tokenRow } = await mintActivationToken(candId, null);
      ok(!!tokenRow.id && tokenRow.candidateId === candId, "mint returns row tied to candidate");
      ok(tokenRow.tokenHash === hashToken(plainToken), "stored hash matches plain token hash");
      const result = await consumeActivationToken(plainToken, "Test123!Strong");
      ok(result.candidateId === candId && !!result.userId, "consume happy-path returns candidate+user");
      const [postCand] = await db.select().from(candidates).where(eq(candidates.id, candId));
      ok(postCand.status === "available", "candidate status flipped to available");
      ok(postCand.userId === result.userId, "candidate.userId linked to created user");
    }

    // — Test 2: re-mint invalidates prior live token
    {
      const candId = await makeCandidate("remint");
      candIds.push(candId);
      const first = await mintActivationToken(candId, null);
      const second = await mintActivationToken(candId, null);
      ok(first.tokenRow.id !== second.tokenRow.id, "re-mint produces a different row");
      const [oldRow] = await db.select().from(candidateActivationTokens)
        .where(eq(candidateActivationTokens.id, first.tokenRow.id));
      ok(!!oldRow.invalidatedAt, "prior live row stamped invalidated_at");
      await expectThrows(
        "consuming the superseded token fails with CONSUMED",
        () => consumeActivationToken(first.plainToken, "Test123!Strong"),
        (e) => e instanceof ActivationError && (e as ActivationError).code === "CONSUMED",
      );
    }

    // — Test 3: concurrent re-mint never leaves two live rows
    {
      const candId = await makeCandidate("concurrent-mint");
      candIds.push(candId);
      // Fire 5 mints at the same tick. Each transaction first invalidates
      // any live row then inserts; the live partial-unique index makes any
      // overlap surface as 23505. Some calls may reject — that is the
      // intended outcome — but the live-row count must end at exactly 1.
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => mintActivationToken(candId, null)),
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      ok(succeeded >= 1, `at least one concurrent mint succeeded (got ${succeeded}/5)`);
      const liveRows = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(candidateActivationTokens)
        .where(sql`${candidateActivationTokens.candidateId} = ${candId}
                   AND ${candidateActivationTokens.consumedAt} IS NULL
                   AND ${candidateActivationTokens.invalidatedAt} IS NULL`);
      ok(liveRows[0].c === 1, "exactly one live token row remains after concurrent mints", `count=${liveRows[0].c}`);
    }

    // — Test 4: concurrent consume of same token — exactly one wins
    {
      const candId = await makeCandidate("race-consume");
      candIds.push(candId);
      const { plainToken } = await mintActivationToken(candId, null);
      const results = await Promise.allSettled([
        consumeActivationToken(plainToken, "Test123!Strong"),
        consumeActivationToken(plainToken, "Test123!Strong"),
        consumeActivationToken(plainToken, "Test123!Strong"),
      ]);
      const wins = results.filter((r) => r.status === "fulfilled").length;
      const losses = results.filter((r) => r.status === "rejected").length;
      ok(wins === 1, `exactly one consume wins (got ${wins} wins, ${losses} losses)`);
      const allLost = results
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .every((r) => r.reason instanceof ActivationError);
      ok(allLost, "all losing consumes throw ActivationError");
    }

    // — Test 5: expired token rejected with EXPIRED
    {
      const candId = await makeCandidate("expired");
      candIds.push(candId);
      const { plainToken, tokenRow } = await mintActivationToken(candId, null);
      // Force-expire by setting expires_at into the past.
      await db.update(candidateActivationTokens)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(candidateActivationTokens.id, tokenRow.id));
      await expectThrows(
        "expired token rejected with code=EXPIRED",
        () => consumeActivationToken(plainToken, "Test123!Strong"),
        (e) => e instanceof ActivationError && (e as ActivationError).code === "EXPIRED",
      );
    }

    // — Test 6: invalidateAllTokensForCandidate is idempotent
    {
      const candId = await makeCandidate("invalidate-all");
      candIds.push(candId);
      await mintActivationToken(candId, null);
      const first = await invalidateAllTokensForCandidate(candId);
      const second = await invalidateAllTokensForCandidate(candId);
      ok(first === 1, `first invalidate flips exactly 1 row (got ${first})`);
      ok(second === 0, `second invalidate flips 0 rows / idempotent (got ${second})`);
    }

    // — Test 7: invalid input shapes rejected without DB writes
    {
      await expectThrows(
        "consume rejects empty token",
        () => consumeActivationToken("", "Test123!Strong"),
        (e) => e instanceof ActivationError && (e as ActivationError).code === "INVALID",
      );
      await expectThrows(
        "consume rejects short password",
        () => consumeActivationToken("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "short"),
        (e) => e instanceof ActivationError && (e as ActivationError).code === "INVALID",
      );
    }
  } finally {
    await cleanup(candIds);
  }
}

(async () => {
  try {
    await runDbSuite();
  } catch (err) {
    fail++;
    console.error(`✗ DB suite crashed: ${(err as Error).message}`);
  }
  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
