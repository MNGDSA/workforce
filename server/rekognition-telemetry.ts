// Task #108 (Workstream 1) — Rekognition fallback telemetry.
//
// Tracks events where the photo-quality `validateFaceQuality` call
// returned `qualityCheckSkipped: true` because Rekognition was
// unreachable (timeout / 5xx / throttling / network error). The admin
// telemetry endpoint exposes the count over the trailing 24 hours so
// HR ops can spot a quiet outage before SMP bulk-activation surges
// quietly accumulate workers with unverified profile photos.
//
// Storage: process-local ring buffer of timestamps. The current
// production deployment runs as a single Node instance, so this is
// accurate enough. If the deployment ever scales horizontally the
// counter becomes per-instance — at that point promote it to a
// `system_settings` JSON row or a dedicated `rekognition_telemetry`
// table. The R&D memo at `docs/rd/01-rekognition-resilience.md`
// captures the trade-off.

const RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 10_000;

type FallbackKind = "first_upload_blocked" | "reupload_allowed";

interface FallbackEvent {
  at: number;
  kind: FallbackKind;
  candidateId: string;
}

const events: FallbackEvent[] = [];

function prune(now: number): void {
  const cutoff = now - RETENTION_MS;
  while (events.length > 0 && events[0].at < cutoff) {
    events.shift();
  }
  while (events.length > MAX_EVENTS) {
    events.shift();
  }
}

export function recordRekognitionFallback(
  kind: FallbackKind,
  candidateId: string,
): void {
  const now = Date.now();
  prune(now);
  events.push({ at: now, kind, candidateId });
}

export interface RekognitionFallbackSummary {
  windowHours: number;
  total: number;
  firstUploadBlocked: number;
  reuploadAllowed: number;
  oldestAt: string | null;
  mostRecentAt: string | null;
}

export function getRekognitionFallbackSummary(): RekognitionFallbackSummary {
  const now = Date.now();
  prune(now);
  let firstUploadBlocked = 0;
  let reuploadAllowed = 0;
  for (const e of events) {
    if (e.kind === "first_upload_blocked") firstUploadBlocked++;
    else if (e.kind === "reupload_allowed") reuploadAllowed++;
  }
  return {
    windowHours: 24,
    total: events.length,
    firstUploadBlocked,
    reuploadAllowed,
    oldestAt: events[0] ? new Date(events[0].at).toISOString() : null,
    mostRecentAt: events[events.length - 1]
      ? new Date(events[events.length - 1].at).toISOString()
      : null,
  };
}

// Test-only: clear the buffer so individual tests are independent.
export function __resetRekognitionFallbackTelemetryForTests(): void {
  events.length = 0;
}

// ─────────────────────────────────────────────────────────────────────
// Pure decision helper — extracted so route-layer logic can be unit
// tested without spinning up Express. The routes layer feeds this
// function the candidate state (does the candidate already have a
// previously-validated photo on file?) and the Rekognition outcome
// (was the quality check skipped because Rekognition was
// unreachable?). The function returns the action the routes layer
// should take and the telemetry kind to record.
//
// Truth table:
//   skipped=false                         → "proceed"             (no telemetry)
//   skipped=true,  hasValidatedPhoto=true → "allow"   ("reupload_allowed")
//   skipped=true,  hasValidatedPhoto=false → "block"  ("first_upload_blocked")
//
// Key invariant (Task #108): we DO NOT discriminate on `isPhotoChange`
// (active-employee changing photo). What matters is whether a
// previously-validated photo exists at all. Active-employee photo
// changes still flow through HR review on the happy path, so a
// fail-open during a Rekognition outage just routes the unverified
// photo into the same HR review queue — the human reviewer is the
// safety net. Blocking active-employee re-uploads during outages
// would be both wrong per spec and harmful: it would deny workers
// the ability to update a stale photo for the entire outage window.
export type RekognitionFallbackAction =
  | { kind: "proceed" }
  | { kind: "allow"; telemetry: "reupload_allowed" }
  | { kind: "block"; telemetry: "first_upload_blocked" };

export function decideRekognitionFallbackAction(opts: {
  qualityCheckSkipped: boolean;
  hasPreviouslyValidatedPhoto: boolean;
}): RekognitionFallbackAction {
  if (!opts.qualityCheckSkipped) return { kind: "proceed" };
  if (opts.hasPreviouslyValidatedPhoto) {
    return { kind: "allow", telemetry: "reupload_allowed" };
  }
  return { kind: "block", telemetry: "first_upload_blocked" };
}
