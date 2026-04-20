# R&D Memo 01 — Rekognition resilience hardening

**Status:** Decision recorded. Production code shipped in Task #108.
**Workstream:** 1 of 3 in the Rekognition R&D series.
**Author:** Replit Agent (Task #108).
**Date:** April 20, 2026.

## Problem

The profile-photo upload path in `server/routes.ts` calls
`validateFaceQuality` (AWS Rekognition `DetectFaces`). When
Rekognition is unreachable — timeout, 5xx, throttling, or a network
error — the helper returns `{ passed: true, qualityCheckSkipped: true }`.

Before this task the routes layer treated `qualityCheckSkipped` as
"good enough" for first-time uploads, and only failed-closed when
the upload was a re-upload from an active employee changing their
photo. That asymmetry was deliberate for one-at-a-time individual
signup — losing a candidate's first upload to a transient outage is
worse UX than letting it through, because the candidate is sitting
on the page with their phone — but it breaks at SMP scale:

- Task #107 introduces SMP bulk activation. A single tenant brings
  5,000–10,000 workers online inside a 21-day activation window.
- Each activated worker uploads a profile photo from the candidate
  portal. That photo becomes the reference image for every
  subsequent attendance `CompareFaces` call.
- During a Rekognition outage of even modest duration, hundreds-to-
  thousands of workers can complete profile-photo upload with no
  quality verification. They look fine to the system today.
- Two weeks later, when the season starts and they begin clocking
  in via the Android APK, every single one of those workers fails
  attendance verification — `CompareFaces` returns low confidence
  against an unverified, possibly-poor-quality reference photo, the
  submission is flagged, and an inbox item is created. The HR ops
  team is buried under thousands of flagged submissions with no
  obvious root cause.

## Decision

**Fail-closed on first-time profile photo upload when Rekognition is
unreachable. Keep the existing fail-open behavior on re-uploads
where the candidate already has a previously-validated photo on
file.**

Rationale:

- First-time upload has no fallback reference photo. If we accept
  an unverified one, we're committing the worker to a broken
  attendance future. A `503 Service Temporarily Unavailable` with
  a "please try again in a few minutes" message preserves the
  worker's ability to retry — outages are rarely persistent.
- Re-upload has a working reference photo on file already. Losing
  the new upload to a transient outage means the worker keeps
  their existing valid photo. Failing the new upload would be
  pointless since the old one already passed quality at upload
  time.
- The change is contained to the existing branch in
  `server/routes.ts`; no schema change, no new endpoint contract,
  no UX change beyond the new 503 response (the candidate portal
  already surfaces the bilingual `photo.verifyUnavailable` message
  for the existing fail-closed branch).

## Implementation (shipped in Task #108)

1. New module `server/rekognition-telemetry.ts` — process-local ring
   buffer of fallback events (max 10k entries, 24h retention) with
   `recordRekognitionFallback(kind, candidateId)` and
   `getRekognitionFallbackSummary()`.
2. `server/routes.ts` photo upload branch — when
   `qualityResult.qualityCheckSkipped` is `true`, fail-closed unless
   the candidate has a previously-validated photo (`hasPhoto &&
   photoUrl`). Telemetry recorded on both branches so we can
   distinguish "outage-blocked first uploads" from "outage-allowed
   re-uploads".
3. New admin endpoint `GET /api/admin/telemetry/rekognition-
   fallbacks` — gated by the existing `settings:read` permission.
   Returns `{ windowHours, total, firstUploadBlocked,
   reuploadAllowed, oldestAt, mostRecentAt }`.
4. New unit test `server/__tests__/rekognition-telemetry.test.ts`
   covering empty state, classification, ISO timestamp shape.

## Multi-instance caveat

The telemetry counter is process-local. Replit's current deployment
runs as a single Node instance, so this is accurate today. If the
deployment ever scales horizontally the counter becomes per-
instance. Two acceptable upgrade paths:

- Promote the buffer to a `system_settings` JSON row keyed
  `rekognition_telemetry_24h` and update transactionally on each
  fallback. Good enough for our event volume (outages are rare).
- Add a dedicated `rekognition_telemetry` table with one row per
  fallback event. Cleaner reporting, supports per-tenant filtering,
  but requires a schema migration.

Pick whichever when horizontal scaling becomes real. Until then the
in-process buffer is intentional simplicity.

## Cross-workstream impact (Task #107)

- The new fail-closed branch returns the same 503 +
  `photo.verifyUnavailable` shape that the candidate portal already
  handles for the photo-change branch. **No portal UX change
  required.**
- The bulk-upload validation buckets in Task #107 are unaffected —
  bulk upload happens at admin-CSV time, before any worker activates
  or uploads a photo. Rekognition is only invoked when an activated
  worker uploads through the portal.
- The activation SMS messaging is unaffected — the SMS just delivers
  the activation link; the photo-upload step happens after the
  worker sets a password and lands in the portal.
- The Send-to-Onboarding gate is unaffected — its eligibility check
  is concerned with documents present and verified, not with whether
  the verification service was up.

## Decision summary

**Decision:** PROCEED. Code shipped in Task #108.
**Recurring AWS spend impact:** None. The fail-closed branch reduces
DetectFaces calls during outages (we delete the rejected upload
without retry).
**Engineering days:** ~½ day (delivered in this task).
