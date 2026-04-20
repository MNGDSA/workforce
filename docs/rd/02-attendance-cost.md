# R&D Memo 02 — Attendance Rekognition cost reduction

**Status:** Decision recorded. Recommended for follow-up production rollout (see `.local/tasks/draft-rekognition-cost-rollout.md`).
**Workstream:** 2 of 3 in the Rekognition R&D series.
**Author:** Replit Agent (Task #108).
**Date:** April 20, 2026.
**Prototype:** `scripts/rekognition-cost-model.ts` (run via `npx tsx scripts/rekognition-cost-model.ts`).

## Problem

`server/verification-pipeline.ts` calls AWS Rekognition
`CompareFaces` on every attendance submission, which today is every
clock event from every worker. Workers normally clock in and clock
out at least twice per workday (one shift, two events). At a
realistic seasonal load:

- 10,000 workers per tenant
- 2 clock events per worker per day
- 30 days per Ramadan / Hajj season

= **600,000 CompareFaces calls per tenant per season**.

At the AWS Rekognition list price for the Riyadh region
(`me-south-1`) of approximately **$0.001 per CompareFaces call**,
that is **~$600 of Rekognition spend per tenant per season**, plus
the egress cost of two ~150 KB image fetches from DigitalOcean
Spaces per call (one reference photo + one submitted selfie). With
multiple tenants running concurrently during the same season the
line item starts to matter.

The bigger issue is that most of these calls are redundant. Once a
worker has clocked in successfully and started a verified shift,
their identity for the rest of that shift is high-confidence — the
risk model that demands face verification on every event is
mismatched to the actual fraud surface (someone clocking in for
their friend at the start of a shift, not someone swapping bodies
mid-shift).

## Approaches considered

### A. Status quo — per-clock-event verification
- **Calls/season/tenant:** 600,000
- **Cost/season/tenant:** ~$600
- **False-accept estimate:** baseline (one buddy-clock-in is one
  CompareFaces call away from being caught)
- **Implementation complexity:** none (already in production)

### B. Once-per-shift verification with a session token
- Verify CompareFaces on the first event of a shift (clock-in).
  Issue a short-lived `attendance_session_token` bound to
  `(workforceId, shiftDate)` after success.
- Subsequent events within the same shift (clock-out, breaks,
  multi-clock corrections) accept the token in lieu of CompareFaces.
- **Calls/season/tenant:** 300,000 (one per shift, not per event)
- **Cost/season/tenant:** ~$300 (50% reduction)
- **False-accept estimate:** slight increase — a buddy could clock
  out for someone who clocked in legitimately. Mitigated by
  geofence + device fingerprint on the clock-out event (still
  enforced server-side), and by the existing daily-submission cap.
- **Implementation complexity:** medium. New
  `attendance_session_tokens` table, token issuance in
  `verification-pipeline.ts` on first verified event, token
  validation in `/api/attendance-mobile/submit`. Needs careful
  thinking about late edits to the previous day's record.

### C. On-device face embedding cached in the APK
- The APK enrolls the worker's face once (cold start / shift start)
  and caches a face embedding locally.
- Subsequent clock events compute a local embedding from the live
  selfie and compare against the cached one on-device. Only
  embeddings that fall below a confidence threshold are escalated
  to a server-side CompareFaces call.
- **Calls/season/tenant:** ~30,000 (only the ~5% that fall below
  on-device threshold + a periodic re-enrollment)
- **Cost/season/tenant:** ~$30 (95% reduction)
- **False-accept estimate:** depends entirely on the on-device
  embedding model quality. ML Kit Face Detection is free but ships
  embeddings only for similarity, not identity. TensorFlow Lite
  with a FaceNet-style model can do identity but adds ~10 MB to
  the APK and burns battery on every clock event.
- **Implementation complexity:** high. Significant Android work
  (model bundling, ABI variants, device-trust integration so a
  rooted device can't fake the on-device verdict), plus a
  fallback path for older devices that can't run the model.

### D. Sampled CompareFaces (every Nth event)
- Verify on the first event of a shift, then on every Nth event
  thereafter (e.g. every 10th). Combine with random sampling so
  the worker can't predict which events will be verified.
- **Calls/season/tenant:** ~150,000 (75% reduction with N=4)
- **Cost/season/tenant:** ~$150
- **False-accept estimate:** moderate increase — a buddy can clock
  for several events before being caught. Detection still happens,
  just delayed. May be acceptable if combined with strong
  geofence + device-fingerprint signals on every event.
- **Implementation complexity:** low. Feature flag in the
  verification pipeline plus a deterministic sampler.

## Cost model output

The `scripts/rekognition-cost-model.ts` prototype runs the four
strategies against synthetic event streams for tenant sizes of
1k / 5k / 10k workers across a 30-day season.

Selected output (10k workers, 30-day season, 2 events/day):

| Strategy                       | CompareFaces calls | $ at $0.001/call |
| ------------------------------ | ------------------:| ----------------:|
| A — per-event (status quo)     |            600,000 |          $600.00 |
| B — once-per-shift token       |            300,000 |          $300.00 |
| C — on-device + 5% escalation  |             30,000 |           $30.00 |
| D — sampled, N=4               |            150,000 |          $150.00 |

Run the script for other tenant sizes — it accepts CLI args.

## Recommendation

**PROCEED with Approach B (once-per-shift token) as the production
rollout.** It captures 50% of the savings with low implementation
risk and minimal increase in false-accept rate. Approach C is
strategically attractive but the Android-side ML work, model
bundling, and device-trust integration are all substantial efforts
that should not be bundled with a cost-engineering task.

Approach D is **not recommended** as a primary lever — it trades
detection latency for cost, which is the wrong axis to give up
when the fraud is buddy-clocking at shift boundaries (i.e.
exactly the events Approach B still verifies).

Once Approach B has been in production for a season and we have
real data on the actual fraud surface, re-evaluate whether
Approach C is worth the Android investment.

## Cross-workstream impact (Task #107)

- **Activation SMS messaging:** unaffected.
- **Candidate portal upload UX:** unaffected.
- **Admin bulk-upload validation buckets:** unaffected.
- **Send-to-Onboarding gate:** unaffected.
- **SMP worker attendance:** SMP workers benefit identically to
  individuals — they use the same Android APK and the same
  verification pipeline. The 50% cost savings apply to SMP
  attendance volumes (which dominate during seasonal peaks).

## Decision summary

**Decision:** PROCEED with Approach B for production rollout in a
follow-up task. Defer Approach C to a future season's
post-mortem-driven decision.
**Recurring AWS spend impact:** -50% Rekognition CompareFaces spend
per tenant per season (~$300 saved per 10k-worker tenant per
season). Modest egress savings on top.
**Engineering days for production rollout:** ~5–7 days (schema
migration, pipeline change, mobile-app token caching, tests, staged
rollout per the Android release runbook).
