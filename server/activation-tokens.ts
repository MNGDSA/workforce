// Task #107 — SMP worker activation token service.
//
// Tokens are 32 random bytes encoded base64url; only the SHA-256 hash is
// persisted. The plain token is shown ONCE inside the activation SMS link
// (`/activate?token=<plain>`). Mint and consume are race-safe:
//
// * Mint runs inside a transaction that first stamps `invalidated_at` on
//   any prior live row for the candidate, then inserts the new row. The
//   live partial-unique index (`cand_activation_tokens_live_idx`) makes
//   concurrent double-mint a SQLSTATE 23505, which we surface as a 409.
//
// * Consume is a single atomic UPDATE with a WHERE clause that demands the
//   token row is still un-consumed, un-invalidated, and not expired. Only
//   if exactly one row was updated does the caller proceed to create the
//   user. This prevents two simultaneous activate requests from both
//   succeeding.
import { randomBytes, createHash } from "crypto";
import { eq, and, isNull, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db } from "./db";
import {
  candidateActivationTokens,
  candidates,
  users,
  type CandidateActivationToken,
} from "@shared/schema";

const TOKEN_TTL_DAYS = 21;
const PLAIN_TOKEN_BYTES = 32;
const BCRYPT_ROUNDS = 10;

export function generatePlainToken(): string {
  return randomBytes(PLAIN_TOKEN_BYTES).toString("base64url");
}

export function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export interface MintResult {
  plainToken: string;
  tokenRow: CandidateActivationToken;
}

/**
 * Mint a new activation token for `candidateId`. Invalidates any prior live
 * row in the same transaction. The returned `plainToken` is the only place
 * the un-hashed value will ever exist — the caller MUST enqueue it into the
 * SMS outbox before the function returns to the route.
 */
export async function mintActivationToken(
  candidateId: string,
  createdByUserId: string | null,
  ttlDays: number = TOKEN_TTL_DAYS,
): Promise<MintResult> {
  const plainToken = generatePlainToken();
  const tokenHash = hashToken(plainToken);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  const tokenRow = await db.transaction(async (tx) => {
    // 1. Invalidate any prior live token for this candidate.
    await tx
      .update(candidateActivationTokens)
      .set({ invalidatedAt: new Date() })
      .where(and(
        eq(candidateActivationTokens.candidateId, candidateId),
        isNull(candidateActivationTokens.consumedAt),
        isNull(candidateActivationTokens.invalidatedAt),
      ));

    // 2. Insert new row. The live partial-unique index will reject a
    //    concurrent double-mint with 23505 — surface as Error.
    const [row] = await tx.insert(candidateActivationTokens).values({
      candidateId,
      tokenHash,
      expiresAt,
      createdByUserId: createdByUserId,
    }).returning();
    return row;
  });

  return { plainToken, tokenRow };
}

/**
 * Mark the prior live token row's smsSentAt timestamp — called by the
 * outbox worker on successful SMS delivery. Best-effort; never throws.
 */
export async function markActivationSmsSent(tokenId: string): Promise<void> {
  try {
    await db.update(candidateActivationTokens)
      .set({ smsSentAt: new Date() })
      .where(eq(candidateActivationTokens.id, tokenId));
  } catch { /* swallow */ }
}

export interface ConsumeResult {
  candidateId: string;
  userId: string;
}

export class ActivationError extends Error {
  readonly code: "INVALID" | "EXPIRED" | "CONSUMED" | "RACE" | "BLOCKED";
  constructor(code: ActivationError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Atomically consume an activation token, create the user row, link it to
 * the candidate, and flip status to `available`. All-or-nothing inside a
 * single transaction. Returns `{ candidateId, userId }` on success; throws
 * ActivationError on any failure mode.
 */
export async function consumeActivationToken(
  plainToken: string,
  password: string,
): Promise<ConsumeResult> {
  if (!plainToken || plainToken.length < 16) {
    throw new ActivationError("INVALID", "Token is missing or malformed.");
  }
  if (!password || password.length < 8) {
    throw new ActivationError("INVALID", "Password must be at least 8 characters.");
  }
  const tokenHash = hashToken(plainToken);

  // ── Pre-validate the token row OUTSIDE the transaction and BEFORE bcrypt.
  //    This protects the public endpoint from an invalid-token CPU flood
  //    (each bcrypt hash is ~80ms on prod hardware; 30 concurrent floods
  //    would saturate one core). Real-world race window between this check
  //    and the atomic UPDATE below is harmless: the UPDATE is the source of
  //    truth, this is just an early-exit for the obvious invalid cases.
  {
    const [row] = await db
      .select({
        id: candidateActivationTokens.id,
        consumedAt: candidateActivationTokens.consumedAt,
        invalidatedAt: candidateActivationTokens.invalidatedAt,
        expiresAt: candidateActivationTokens.expiresAt,
      })
      .from(candidateActivationTokens)
      .where(eq(candidateActivationTokens.tokenHash, tokenHash));
    if (!row) throw new ActivationError("INVALID", "Activation link is invalid.");
    if (row.consumedAt) throw new ActivationError("CONSUMED", "Activation link has already been used.");
    if (row.invalidatedAt) throw new ActivationError("CONSUMED", "Activation link has been replaced.");
    if (row.expiresAt < new Date()) throw new ActivationError("EXPIRED", "Activation link has expired.");
  }

  // Pay the bcrypt cost ONLY after the cheap pre-check passed.
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  return await db.transaction(async (tx) => {
    // 1. Race-safe consume: single UPDATE that succeeds only if the row is
    //    still live. Returning row tells us the candidate id. This is the
    //    real source of truth — the pre-check above is just a fast path.
    const [consumed] = await tx
      .update(candidateActivationTokens)
      .set({ consumedAt: new Date() })
      .where(and(
        eq(candidateActivationTokens.tokenHash, tokenHash),
        isNull(candidateActivationTokens.consumedAt),
        isNull(candidateActivationTokens.invalidatedAt),
        sql`${candidateActivationTokens.expiresAt} > now()`,
      ))
      .returning();

    if (!consumed) {
      // Disambiguate by looking at the row directly (best-effort error msg).
      const [row] = await tx
        .select()
        .from(candidateActivationTokens)
        .where(eq(candidateActivationTokens.tokenHash, tokenHash));
      if (!row) throw new ActivationError("INVALID", "Activation link is invalid.");
      if (row.consumedAt) throw new ActivationError("CONSUMED", "Activation link has already been used.");
      if (row.invalidatedAt) throw new ActivationError("CONSUMED", "Activation link has been replaced.");
      if (row.expiresAt < new Date()) throw new ActivationError("EXPIRED", "Activation link has expired.");
      throw new ActivationError("RACE", "Activation could not complete — please try again.");
    }

    // 2. Load the candidate to determine identity (phone, optional email).
    const [cand] = await tx
      .select()
      .from(candidates)
      .where(eq(candidates.id, consumed.candidateId));
    if (!cand) {
      throw new ActivationError("INVALID", "Candidate associated with this activation no longer exists.");
    }
    if (cand.userId) {
      // Already activated — token shouldn't have been live but guard anyway.
      throw new ActivationError("CONSUMED", "This account is already activated.");
    }
    if (!cand.phone) {
      throw new ActivationError("BLOCKED", "Candidate has no phone on file — contact your administrator.");
    }

    // 3. Resolve the candidate role id (users.role_id is NOT NULL post-T10).
    const { storage } = await import("./storage");
    const candidateRole = await storage.getRoleBySlug("candidate");
    if (!candidateRole) {
      throw new ActivationError("BLOCKED", "Candidate role missing from RBAC seed.");
    }

    // 4. Create user row. Username = candidate's nationalId when present
    //    (mirrors /api/auth/register), else the phone. Email is optional.
    const username = (cand.nationalId?.trim() || cand.phone.replace(/[^0-9]/g, ""));
    const [createdUser] = await tx.insert(users).values({
      username,
      password: passwordHash,
      email: cand.email ?? null,
      phone: cand.phone,
      nationalId: cand.nationalId ?? null,
      isActive: true,
      roleId: candidateRole.id,
      fullName: cand.fullNameEn ?? username,
    } as any).returning();

    // 4. Link candidate → user, flip status, refresh lastLoginAt later.
    await tx.update(candidates)
      .set({ userId: createdUser.id, status: "available", updatedAt: new Date() })
      .where(eq(candidates.id, cand.id));

    return { candidateId: cand.id, userId: createdUser.id };
  });
}
