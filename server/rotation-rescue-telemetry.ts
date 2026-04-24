// Task #166 — Rotation rescue telemetry.
//
// Tracks the outcome of each call to `persistRotationRescue` (the
// helper that writes the auto-rotated photo bytes back to S3 after
// `validateFaceQuality` reports a sideways portrait, and powers the
// "We straightened your photo" toast added in Task #155).
//
// Until this counter existed, the only signal that the rescue was
// firing in production was a `console.log("[photo-upload] Auto-
// rotated by ...°")` line. SRE could not answer:
//   - "How often does the rescue fire?"
//   - "Is rescue volume growing (phone-OS update?) or collapsing
//     (deploy regression?) week over week?"
//   - "Did persistence start failing after a recent S3 IAM change?"
//   - "Was anyone shown the toast yesterday?"
//
// Storage: process-local ring buffer of timestamps, mirroring the
// `server/rekognition-telemetry.ts` pattern. The current production
// deployment runs as a single Node instance, so this is accurate
// enough; if the deployment ever scales horizontally the counter
// becomes per-instance — at that point promote it to a
// `system_settings` JSON row or a dedicated table. The R&D memo at
// `docs/rd/01-rekognition-resilience.md` captures the same trade-off
// for the sibling rekognition-fallback counter.

const RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 10_000;

// `persisted_90` / `persisted_-90` — the rotated bytes were written
// back to storage successfully and the route surfaced
// `rotationApplied` to the client (i.e. the toast did fire and the
// cropper reload picks up the corrected file).
//
// `persist_failed` — the rescue produced rotated bytes but the
// `overwriteFile` call threw. The route does NOT surface
// `rotationApplied` in this case (per `persistRotationRescue`'s
// contract) so the file on storage stays in its original sideways
// orientation. A non-zero count here usually means an S3 IAM /
// permissions regression.
export type RotationRescueOutcome =
  | "persisted_90"
  | "persisted_-90"
  | "persist_failed";

interface RotationRescueEvent {
  at: number;
  kind: RotationRescueOutcome;
}

const events: RotationRescueEvent[] = [];

function prune(now: number): void {
  const cutoff = now - RETENTION_MS;
  while (events.length > 0 && events[0].at < cutoff) {
    events.shift();
  }
  while (events.length > MAX_EVENTS) {
    events.shift();
  }
}

export function recordRotationRescueOutcome(
  kind: RotationRescueOutcome,
): void {
  const now = Date.now();
  prune(now);
  events.push({ at: now, kind });
}

export interface RotationRescueSummary {
  windowHours: number;
  total: number;
  persisted90: number;
  persistedNeg90: number;
  persistFailed: number;
  // attempts = persisted90 + persistedNeg90 + persistFailed
  // (today total === attempts, but stating it explicitly future-
  // proofs adding new outcome kinds without breaking the rate maths).
  attempts: number;
  // Successful persists / total attempts, rounded to 4 decimals
  // (e.g. 0.9876). `null` when there have been zero attempts in the
  // window — distinct from "0% success" which would imply attempts
  // happened and all failed.
  successRate: number | null;
  oldestAt: string | null;
  mostRecentAt: string | null;
}

export function getRotationRescueSummary(): RotationRescueSummary {
  const now = Date.now();
  prune(now);
  let persisted90 = 0;
  let persistedNeg90 = 0;
  let persistFailed = 0;
  for (const e of events) {
    if (e.kind === "persisted_90") persisted90++;
    else if (e.kind === "persisted_-90") persistedNeg90++;
    else if (e.kind === "persist_failed") persistFailed++;
  }
  const attempts = persisted90 + persistedNeg90 + persistFailed;
  const successes = persisted90 + persistedNeg90;
  const successRate =
    attempts === 0 ? null : Math.round((successes / attempts) * 10_000) / 10_000;
  return {
    windowHours: 24,
    total: events.length,
    persisted90,
    persistedNeg90,
    persistFailed,
    attempts,
    successRate,
    oldestAt: events[0] ? new Date(events[0].at).toISOString() : null,
    mostRecentAt: events[events.length - 1]
      ? new Date(events[events.length - 1].at).toISOString()
      : null,
  };
}

// Test-only: clear the buffer so individual tests are independent.
export function __resetRotationRescueTelemetryForTests(): void {
  events.length = 0;
}
