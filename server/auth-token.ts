// Shared HMAC token helpers used by both /api/auth/login (routes.ts) and the
// requireAuth middleware (auth-middleware.ts).
//
// CRITICAL: this module is the single source of truth for the signing secret.
// Importing the same secret value everywhere guarantees that a token minted by
// one module will validate in the other. If we ever duplicate the
// `process.env.SESSION_SECRET || crypto.randomBytes(...)` pattern in two
// places, those modules will each generate a different random fallback at
// import time and tokens silently 401 — exactly the bug T11 hit.

import crypto from "crypto";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function resolveSecret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    // Fail fast in prod — a missing secret means every cookie is invalidated
    // on every restart and every horizontally-scaled instance speaks a
    // different secret. Better to refuse to boot than to ship broken auth.
    throw new Error(
      "SESSION_SECRET must be set (>=16 chars) in production. Refusing to boot.",
    );
  }
  // Dev only: warn and use a stable per-process random fallback. Note this is
  // shared across all importers because module evaluation is singleton.
  const fallback = crypto.randomBytes(32).toString("hex");
  // eslint-disable-next-line no-console
  console.warn(
    "[auth-token] SESSION_SECRET not set; using ephemeral dev secret. Tokens will not survive restarts.",
  );
  return fallback;
}

const AUTH_SECRET = resolveSecret();

export function signAuthToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, iat: Date.now() }),
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export type VerifiedAuthToken = { uid: string; iat: number };

export function verifyAuthToken(token: string): VerifiedAuthToken | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(payload)
    .digest("base64url");
  if (sig !== expected) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.uid || typeof data.iat !== "number") return null;
    const age = Date.now() - data.iat;
    if (age > TOKEN_TTL_MS) return null;
    return { uid: data.uid, iat: data.iat };
  } catch {
    return null;
  }
}
