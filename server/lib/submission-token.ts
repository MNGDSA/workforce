// Task #85 step 4 — server-issued, HMAC-signed submission tokens.
//
// Threat model addressed:
//   A hostile client today can submit an attendance row with a
//   client-generated UUID `submissionToken`. Because the server's
//   dedup contract treats a known token as "this is a duplicate of
//   the previously-stored row", an attacker who pre-claims tokens
//   can deny-list legitimate submissions from a victim worker.
//
// Mitigation:
//   The server mints a one-shot, time-bound, HMAC-signed token bound
//   to a specific workforceId. The Android client receives the token
//   from `/api/attendance-mobile/status` and attaches it to the next
//   `/api/attendance-mobile/submit`. The server:
//     1. Verifies the HMAC against the same shared secret used for
//        auth tokens (single source of truth — see auth-token.ts).
//     2. Refuses tokens whose embedded workforceId ≠ the request's
//        workforceId (so a token issued for worker A cannot be
//        replayed against worker B's row).
//     3. Refuses tokens whose `exp` is in the past.
//     4. Falls back to the existing `submission_token` UNIQUE
//        constraint for replay detection — once a submission row is
//        persisted with this token, any later submit with the same
//        token is recognised as a duplicate (`TOKEN_USED`).
//
// Backward compatibility: the verifier accepts legacy raw-UUID tokens
// (for one release cycle) so Android builds that have not yet adopted
// the server-issued flow keep working. Legacy tokens are flagged in
// the parsed result so the route can record telemetry / age them out.

import crypto from "crypto";

// Shared with auth-token.ts — same SESSION_SECRET. We re-resolve here
// rather than importing the constant so that if the auth-token module
// fails fast on missing prod secret, the same failure surfaces here.
function resolveSecret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set (>=16 chars) in production. Refusing to mint submission tokens.",
    );
  }
  return crypto.randomBytes(32).toString("hex");
}

const SECRET = resolveSecret();

// 24-hour window: long enough that a worker who pulls status at the
// start of their shift can sync the captured submission later in the
// day even if they go offline; short enough that a leaked token
// cannot be hoarded across days.
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Legacy UUID v4 (8-4-4-4-12 hex). Accepted for backward compatibility
// with Android builds shipped before Task #85.
const LEGACY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TokenPayload {
  /** workforceId the token was minted for */
  wf: string;
  /** issued-at ms epoch */
  iat: number;
  /** expiry ms epoch */
  exp: number;
  /** random nonce so two tokens issued in the same ms are distinct */
  n: string;
}

export interface IssuedToken {
  /** the token string the client will echo back on /submit */
  token: string;
  /** ISO-8601 expiry — surface to the client so it can refresh proactively */
  expiresAt: string;
}

export function issueSubmissionToken(workforceId: string): IssuedToken {
  const now = Date.now();
  const payload: TokenPayload = {
    wf: workforceId,
    iat: now,
    exp: now + TOKEN_TTL_MS,
    n: crypto.randomBytes(8).toString("hex"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(encoded)
    .digest("base64url");
  return {
    token: `v1.${encoded}.${sig}`,
    expiresAt: new Date(payload.exp).toISOString(),
  };
}

export type TokenVerdict =
  | { ok: true; legacy: false; workforceId: string; expiresAt: number }
  | { ok: true; legacy: true; workforceId: string | null }
  | { ok: false; code: "TOKEN_INVALID" | "TOKEN_EXPIRED" };

/**
 * Verify a submission token. The caller MUST also check that the
 * verdict's workforceId matches the request's workforceId before
 * trusting the token (we only know the token's binding, not the
 * caller's identity). The caller is also responsible for replay
 * detection via the existing `submission_token` UNIQUE column.
 */
export function verifySubmissionToken(
  token: string | null | undefined,
): TokenVerdict {
  if (!token) return { ok: false, code: "TOKEN_INVALID" };

  // Backward-compat: pre-Task-#85 clients send a raw UUID. Accept it
  // as a legacy token with no workforce binding; the route is then
  // responsible for falling back to the previous "trust on first use"
  // behaviour and recording telemetry that surfaces field-version
  // adoption of the new flow.
  if (LEGACY_UUID_RE.test(token)) {
    return { ok: true, legacy: true, workforceId: null };
  }

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return { ok: false, code: "TOKEN_INVALID" };
  }
  const [, encoded, sig] = parts;
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(encoded)
    .digest("base64url");
  // constant-time compare to avoid timing side channel
  let bufA: Buffer;
  let bufB: Buffer;
  try {
    bufA = Buffer.from(sig);
    bufB = Buffer.from(expected);
  } catch {
    return { ok: false, code: "TOKEN_INVALID" };
  }
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return { ok: false, code: "TOKEN_INVALID" };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, code: "TOKEN_INVALID" };
  }

  if (
    !payload ||
    typeof payload.wf !== "string" ||
    typeof payload.exp !== "number" ||
    typeof payload.iat !== "number"
  ) {
    return { ok: false, code: "TOKEN_INVALID" };
  }

  if (Date.now() > payload.exp) {
    return { ok: false, code: "TOKEN_EXPIRED" };
  }

  return {
    ok: true,
    legacy: false,
    workforceId: payload.wf,
    expiresAt: payload.exp,
  };
}

// ── Signed /api/time payload (Task #85 step 6) ─────────────────────
//
// Lets the Android client periodically reconcile its NTP offset
// against an authenticated reference. The signed envelope is
// `<base64url(payload)>.<hmac>` so the client can verify the response
// did not come from a hostile NTP server / MITM proxy.

interface TimePayload {
  /** server epoch ms at the moment of signing */
  now: number;
  /** validity horizon — clients SHOULD discard stale envelopes */
  exp: number;
}

export interface SignedServerTime {
  /** server epoch ms */
  now: number;
  /** ISO-8601 of `now` for human inspection */
  nowIso: string;
  /** validity horizon */
  expiresAt: string;
  /** signed envelope clients verify offline */
  signature: string;
}

const TIME_TTL_MS = 60 * 1000;

export function signServerTime(): SignedServerTime {
  const now = Date.now();
  const payload: TimePayload = { now, exp: now + TIME_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(encoded)
    .digest("base64url");
  return {
    now,
    nowIso: new Date(now).toISOString(),
    expiresAt: new Date(payload.exp).toISOString(),
    signature: `v1.${encoded}.${sig}`,
  };
}
