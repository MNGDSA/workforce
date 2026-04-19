// Play Integrity verdict verification (Task #82, F-03 + Play Integrity).
//
// This module is the single server-side gate for Play Integrity tokens
// attached to mobile attendance submissions. It is intentionally
// **toggleable by environment** so dev / staging / pre-rollout builds can
// continue accepting submissions without a token, while production
// (PLAY_INTEGRITY_ENABLED=true) hard-rejects any submit that is missing,
// malformed, or whose verdict fails app/device/account checks.
//
import { createHash } from "node:crypto";

// State of this module:
//   - The toggle and rejection contract are wired today (off by default).
//   - The actual verdict-decoding call to the Play Integrity API is
//     deferred until a Google Cloud project + service-account JSON are
//     available (see docs/android-release-runbook.md). Until that lands,
//     `PLAY_INTEGRITY_ENABLED=true` will conservatively accept any
//     non-empty token to avoid blocking a rollout — never enable in
//     production without first wiring `decodeVerdict()` to googleapis.

export type IntegrityCheckResult =
  | { ok: true; verdict?: PlayIntegrityVerdict }
  | { ok: false; code: IntegrityRejectCode; reason: string };

export type IntegrityRejectCode =
  | "INTEGRITY_REQUIRED"      // production gate: token missing
  | "INTEGRITY_MALFORMED"     // could not decode
  | "INTEGRITY_APP_FAIL"      // appRecognitionVerdict is not PLAY_RECOGNIZED
  | "INTEGRITY_DEVICE_FAIL"   // deviceRecognitionVerdict not MEETS_DEVICE_INTEGRITY
  | "INTEGRITY_ACCOUNT_FAIL"  // accountDetails not LICENSED (when enforced)
  | "INTEGRITY_NONCE_MISMATCH"; // payload hash on token does not match server-computed

export interface PlayIntegrityVerdict {
  appRecognitionVerdict?: string;
  deviceRecognitionVerdict?: string[];
  accountDetails?: string;
  requestHash?: string;
}

function isEnabled(): boolean {
  // Treat any string other than "true" / "1" as disabled, including unset.
  const v = (process.env.PLAY_INTEGRITY_ENABLED || "").toLowerCase().trim();
  return v === "true" || v === "1";
}

function shouldEnforceAccountLicensing(): boolean {
  const v = (process.env.PLAY_INTEGRITY_ENFORCE_LICENSING || "").toLowerCase().trim();
  return v === "true" || v === "1";
}

/**
 * Verify a Play Integrity token attached to an attendance submit.
 *
 * @param token            the raw integrity token string from the multipart body, or null
 * @param expectedNonceHex SHA-256 hex of the canonical request payload (server recomputes)
 */
export async function verifyAttendanceIntegrityToken(
  token: string | null | undefined,
  expectedNonceHex: string,
): Promise<IntegrityCheckResult> {
  if (!isEnabled()) {
    // Dev / staging / pre-rollout: do not block. The mobile NoOp provider
    // sends no token and we simply pass through. This is the safe default.
    return { ok: true };
  }

  if (!token || token.trim().length === 0) {
    return { ok: false, code: "INTEGRITY_REQUIRED", reason: "Missing Play Integrity token" };
  }

  // ── Deferred: real verdict decoding ──────────────────────────────────
  // When the GCP project + service-account JSON are provisioned, replace
  // this block with:
  //
  //   import { google } from "googleapis";
  //   const auth = new google.auth.GoogleAuth({ credentials: ..., scopes: [...] });
  //   const playintegrity = google.playintegrity({ version: "v1", auth });
  //   const resp = await playintegrity.v1.decodeIntegrityToken({
  //     packageName: "com.luxurycarts.workforce",
  //     requestBody: { integrityToken: token },
  //   });
  //   const payload = resp.data.tokenPayloadExternal;
  //   ...evaluate appRecognitionVerdict / deviceRecognitionVerdict /
  //   ...accountDetails / requestDetails.requestHash against expectedNonceHex.
  //
  // Until that is wired, we conservatively accept any non-empty token so
  // turning the flag on does not brick the fleet, but log a loud warning.
  console.warn(
    "[play-integrity] PLAY_INTEGRITY_ENABLED=true but decodeVerdict() is not " +
    "wired yet — accepting token without verdict check. Wire googleapis " +
    "before depending on this for production rollout.",
  );
  void expectedNonceHex;
  void shouldEnforceAccountLicensing;
  return { ok: true };
}

/**
 * Compute the canonical nonce that the device should have used when
 * requesting the Play Integrity token. Order of fields is significant
 * and MUST match the device-side concatenation exactly.
 */
export function computeAttendanceNonceHex(parts: {
  workforceId: string;
  timestamp: string;
  gpsLat: string | number;
  gpsLng: string | number;
  photoSha256Hex?: string;
}): string {
  const canon = [
    parts.workforceId,
    parts.timestamp,
    String(parts.gpsLat),
    String(parts.gpsLng),
    parts.photoSha256Hex ?? "",
  ].join("|");
  return createHash("sha256").update(canon, "utf8").digest("hex");
}
