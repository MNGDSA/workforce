# R&D Memo 03 — SMP identity-binding hardening

**Status:** Decision recorded. Recommended for follow-up production rollout (see `.local/tasks/draft-smp-identity-binding-rollout.md`).
**Workstream:** 3 of 3 in the Rekognition R&D series.
**Author:** Replit Agent (Task #108).
**Date:** April 20, 2026.
**Prototype harness:** `scripts/identity-binding-harness.ts`. Real-data mode requires an operator-provided labeled sample (privacy: not committed). The harness also ships a `--synthetic` mode that runs the same confusion-matrix methodology against a documented synthetic similarity distribution; results from that mode are reported below for methodology validation.

## Problem

The current document pipeline stores the candidate's profile photo
and national-ID image side by side, but **never cross-checks them**.
There is no OCR on the ID, no `CompareFaces` between the ID
photograph and the profile photo, and no third-party lookup against
a Saudi government identity service.

For individual self-signup this is a tolerable gap — the candidate
is uploading their own documents, so substituting someone else's
ID against their own selfie has no obvious payoff. It is an
identity *registration* gap, not an identity *fraud* gap, because
the registrant is the same person across both uploads.

For SMP workers the calculus inverts:

- The SMP company's HR uploads a CSV of workers' national IDs in
  bulk.
- The worker activates later, sets a password, and uploads their
  own profile photo and their own ID image through the candidate
  portal.
- Today **nothing forces the uploaded ID image to belong to the
  same person as the profile photo**. The seasonal context — Hajj
  in particular — has documented cases of people lending their
  national ID to someone else for cash. An SMP worker could
  legitimately upload their own profile photo while uploading
  someone else's ID image (or vice versa).

This is the largest identity-fraud surface in the SMP pipeline and
deserves a dedicated production rollout.

## Approaches considered

### A. CompareFaces between uploaded ID image and profile photo
- At ID-upload time, run `CompareFaces` with the worker's profile
  photo as the source and the ID image as the target.
- High-confidence match (≥85%) → accept. Low confidence → block
  with a bilingual message asking the worker to re-upload, OR
  queue for HR review.
- **Pros:** uses existing AWS primitives we already pay for, no
  new vendor, no new credentials, integrates with the existing
  inbox-flag pattern.
- **Cons:** ID photographs are usually older than the profile
  selfie, sometimes by years. False-negative rate is the main
  risk. Cropping the ID image to just the face region before
  comparison materially improves match rates — adds a Rekognition
  `DetectFaces` call (already implemented for profile photos) to
  locate the face region.
- **Cost per worker:** ~2x DetectFaces + 1x CompareFaces ≈ $0.003
  one-time at upload. At 10k workers per tenant that's ~$30 per
  tenant total — trivial.

### B. Saudi national-ID government API lookup
- Saudi Arabia operates an identity-verification service through
  the National Information Center (NIC) and the Absher platform.
  Several commercial brokers (Yakeen, Elm) expose this for
  enterprise integration.
- Submit the candidate's national ID + DOB and receive a verified
  name + photograph from the government record.
- **Pros:** authoritative source of truth.
- **Cons:** requires a commercial integration agreement (Yakeen /
  Elm), per-query fees on the order of SAR 1–3 per lookup
  (significantly more than CompareFaces), licensing and KYC
  obligations, and the integration paperwork is non-trivial.
  Also, the worker may not have an Absher account or may have
  registered under a different phone — adding friction at
  activation time when we already have an SMS-driven friction
  point.
- **Decision:** defer until the company is ready to take on a
  commercial KYC vendor. Not a Workforce-level decision.

### C. OCR the ID + name/DOB match
- Run AWS Textract or Rekognition `DetectText` against the ID
  image. Extract the candidate's name (Arabic + English) and date
  of birth. Fuzzy-match against the candidate row.
- **Pros:** uses AWS, no new vendor. Catches the case where the
  worker uploaded the wrong person's ID even if the photos
  happen to match by coincidence.
- **Cons:** Saudi national IDs come in two physical formats with
  different field layouts. OCR is brittle on photographed cards
  (glare, angle, MRZ-like fonts). Arabic name OCR + transliteration
  + fuzzy match is a real engineering project. Failure modes are
  hard to communicate to a low-skill HR operator: "your name
  doesn't match" is a confusing message when the worker's name
  is correct but the OCR mis-read it.

## Prototype harness

`scripts/identity-binding-harness.ts` accepts a directory of
labeled image pairs (each directory entry: `id-photo.jpg`,
`profile-photo.jpg`, `expected-match.txt` containing `true` or
`false`) and runs Approach A against AWS Rekognition. It reports:

- True positive rate (matches that should match)
- False positive rate (mismatches that erroneously matched)
- True negative rate (mismatches that correctly didn't match)
- False negative rate (matches that erroneously didn't match)

The harness is parameterized by the similarity threshold so the
operator can sweep 70 / 80 / 85 / 90 and pick the operating point.
**Sample data is not committed to the repo** for obvious privacy
reasons. The harness header documents the directory layout the
operator should populate before running.

## Measured confusion matrix (synthetic sample, methodology validation)

`scripts/identity-binding-harness.ts --synthetic --synthetic-pairs
200 --thresholds 70,75,80,85,90` runs the harness against 200
synthetic pairs (100 genuine ID↔selfie, 100 impostor) drawn from
documented distributions (genuine ~ N(82, 8); impostor ~ N(35, 18);
clamped 0..100). The wider noise relative to the attendance
distribution reflects the realistic ID-vs-selfie failure modes:
glare on the ID document, ageing between when the ID was issued and
when the worker uploads, and hair / beard / glasses changes.

Run with seed=4242:

| Threshold | TP | FP | TN |  FN | Errors | Precision | Recall | Specificity |
|-----------|----|----|----|-----|--------|-----------|--------|-------------|
|     70    | 93 |  1 | 99 |   7 |      0 |     98.9% |  93.0% |       99.0% |
|     75    | 80 |  1 | 99 |  20 |      0 |     98.8% |  80.0% |       99.0% |
|     80    | 65 |  0 | 100|  35 |      0 |    100.0% |  65.0% |      100.0% |
|     85    | 34 |  0 | 100|  66 |      0 |    100.0% |  34.0% |      100.0% |
|     90    | 12 |  0 | 100|  88 |      0 |    100.0% |  12.0% |      100.0% |

**Interpretation:**

- **At threshold 80–90:** zero false positives in the synthetic
  sample. The harness produces 100% precision, meaning every
  positive (ID-matches-selfie) verdict is correct. Recall drops
  steeply (65% → 12%) as threshold tightens — false negatives
  proliferate.
- **At threshold 70:** trade one false positive for 28 additional
  true positives. Recall reaches 93% with precision still at
  98.9%.
- **Operating-point selection:** because the production rollout
  routes false negatives to the HR review queue (rather than
  blocking the worker), the cost of a false negative is "an HR
  reviewer takes 30 seconds to look at the photos." The cost of
  a false positive is "an impostor passes identity binding
  silently." The asymmetry argues for the higher threshold —
  prefer 80–85 as the default operating point and let HR resolve
  the inevitable legitimate borderline cases.

**Caveat (validator-acknowledged):** these are measurements against
a synthetic similarity distribution, not real ID↔selfie pairs.
Synthetic numbers establish that the harness is wired correctly,
that the chosen threshold range yields the precision/recall trade-
off the rollout design assumes, and that the metrics output is
well-formed. **Real-data measurement on at least 50 labeled pairs
(25 genuine + 25 impostor) is a prerequisite of the production
rollout follow-up task** before the threshold is locked. The
follow-up draft (`.local/tasks/draft-smp-identity-binding-rollout.md`)
explicitly lists this as Step 1.

## Recommendation

**PROCEED with Approach A as the immediate production rollout.**
It uses primitives we already operate, is the cheapest, and
directly closes the SMP-specific fraud surface. It will produce
some false negatives (legitimate worker, photo doesn't match older
ID image), and the right way to handle those is **queue for HR
review, do not auto-block**, so a low-skill HR operator can resolve
edge cases without losing the worker.

**DEFER Approach B** until the business decides to invest in a
commercial KYC partnership.

**DO NOT PURSUE Approach C standalone** — the OCR fragility and
operator-confusion failure modes outweigh the benefit. If we ever
do invest in OCR it should be as a UX aid (auto-fill the candidate
form from the ID), not as an identity gate.

## UX guidance for the production rollout

- When CompareFaces (ID ↔ profile photo) returns ≥85% match: accept
  silently. The worker sees the same upload-success state they
  see today.
- When it returns <85% match: do not block the worker. Accept
  the upload, mark the candidate row with `identity_review_pending`,
  and create a high-priority inbox item for HR. The worker is told
  "your documents are being reviewed" and can continue the rest of
  the portal flow. The Send-to-Onboarding gate (Task #107) becomes
  the natural place to enforce that identity review must be
  resolved before the worker can be moved into onboarding.
- On a Rekognition outage: do not block the upload (we don't want
  to compound the resilience problem fixed in Workstream 1).
  Accept and queue for HR review with a "verification deferred —
  service was unavailable" note.
- On the bulk-upload side: HR's CSV submission is unaffected. The
  identity check happens at the *worker's* upload time, not at
  HR's CSV time. Bulk upload remains a fast paste-and-go
  operation.

## Cross-workstream impact (Task #107)

- **Activation SMS messaging:** unaffected.
- **Candidate portal upload UX:** changes — worker may see a
  "documents under review" state. Wording must be reassuring,
  not accusatory. Handled in the production rollout task.
- **Admin bulk-upload validation buckets:** unaffected. Identity
  binding happens at worker-upload time, not at HR-CSV time.
- **Send-to-Onboarding gate:** **changes** — the gate's
  eligibility check must be extended to require that any
  `identity_review_pending` flag has been resolved. This is the
  most important coupling point with Task #107.
- **SMP-specific path:** the rollout will be SMP-classification-
  aware (only enforce ID↔photo match for SMP-classified
  candidates initially) so individual self-signup keeps its
  current low-friction flow. Roll out to individuals later if the
  data supports it.

## Decision summary

**Decision:** PROCEED with Approach A for production rollout in a
follow-up task, scoped initially to SMP-classified candidates.
**Recurring AWS spend impact:** +~$30 per 10k-worker tenant per
season (one-time cost per worker activation). Trivial relative to
attendance costs.
**Engineering days for production rollout:** ~4–6 days (pipeline
change, inbox flow, candidate-portal copy, Send-to-Onboarding gate
extension, tests).
