// Task #85 step 1 — canonical error-code catalog for the Android↔server
// security contract.
//
// EVERY error response on a route consumed by the Android client MUST
// include a `code` field whose value is one of the constants exported
// here. The Android client classifies outcomes by exact-match against
// this code; substring matching on the human-readable `message` field
// (e.g. body.contains("terminated")) is a forbidden anti-pattern.
//
// Reference doc: docs/api-error-codes.md
//
// Backwards compatibility: until the next Play release rotates out, we
// also keep the legacy `terminated: true` boolean on the responses that
// previously carried it, so older Android clients in the field continue
// to behave correctly.

import type { Response } from "express";

export const MobileErrorCodes = {
  // ── Session / account state ────────────────────────────────────────
  SESSION_EXPIRED: "SESSION_EXPIRED",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  ACCOUNT_TERMINATED: "ACCOUNT_TERMINATED",
  ACCOUNT_INACTIVE: "ACCOUNT_INACTIVE",
  WORKFORCE_NOT_FOUND: "WORKFORCE_NOT_FOUND",
  WORKFORCE_OWNERSHIP_MISMATCH: "WORKFORCE_OWNERSHIP_MISMATCH",

  // ── Attendance shift window / domain ──────────────────────────────
  BEFORE_SHIFT_WINDOW: "BEFORE_SHIFT_WINDOW",
  AFTER_SHIFT_WINDOW: "AFTER_SHIFT_WINDOW",
  MIN_DURATION_NOT_MET: "MIN_DURATION_NOT_MET",
  ATTENDANCE_COMPLETED: "ATTENDANCE_COMPLETED",
  DAILY_LIMIT_REACHED: "DAILY_LIMIT_REACHED",
  SHIFT_NOT_ASSIGNED: "SHIFT_NOT_ASSIGNED",

  // ── Submission tokens (Task #85 step 4) ───────────────────────────
  TOKEN_INVALID: "TOKEN_INVALID",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_USED: "TOKEN_USED",
  TOKEN_MISSING: "TOKEN_MISSING",

  // ── Server time (Task #85 step 6) ─────────────────────────────────
  TIME_TOKEN_INVALID: "TIME_TOKEN_INVALID",

  // ── Generic ───────────────────────────────────────────────────────
  RATE_LIMITED: "RATE_LIMITED",
  PHOTO_REQUIRED: "PHOTO_REQUIRED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type MobileErrorCode =
  (typeof MobileErrorCodes)[keyof typeof MobileErrorCodes];

/**
 * Helper that emits a JSON error response with both the canonical
 * `code` (machine-stable) and a human-readable `message` (already
 * localised by the caller via `tr(req, ...)`).
 *
 * Extra fields (e.g. `shiftStart`, `latestCheckOut`) are passed through
 * so callsites do not have to wrap their existing payloads. When
 * `legacyTerminated` is true the response also carries the legacy
 * `terminated: true` boolean for backward compatibility with Android
 * builds shipped before Task #85 — drop after one full release cycle.
 */
export function mobileError(
  res: Response,
  status: number,
  code: MobileErrorCode,
  message: string,
  extras: Record<string, unknown> = {},
  legacyTerminated = false,
): Response {
  const body: Record<string, unknown> = { code, message, ...extras };
  if (legacyTerminated) body.terminated = true;
  return res.status(status).json(body);
}
