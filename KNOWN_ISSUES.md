# Known Issues Log

A running log of observed problems across the WORKFORCE system (mobile app, backend, admin panel, infrastructure, database). This file is **distinct from the project tasks list**:

- **Project tasks** track *work to be done* (features, refactors, milestones).
- **This log** tracks *problems observed* and their resolution status.

An issue may or may not have a corresponding project task. When it does, link it via the **Related Tasks** field.

---

## How to use this log

**When to add an entry**
- A bug is reproduced (in dev, staging, or production).
- A user / operator reports a defect that needs follow-up.
- A regression is spotted during QA or code review.
- An infrastructure or third-party-service problem is observed and is likely to recur.

Do *not* log here: feature requests, design questions, performance optimization ideas — those belong in the project tasks system.

**How to add an entry**
1. Pick the next sequential ID (`ISSUE-NNN`, zero-padded to 3 digits).
2. Fill in every field of the template below.
3. Place the entry under **Open**.

**How to update status**
- Move the entry to **Investigating** once someone is actively diagnosing it. Add a dated note under **Status notes** when ownership changes.
- Move the entry to **Resolved** when the fix is merged and verified. Add a final dated note: what fixed it, the commit / task ref, and how it was verified.
- Never delete entries — historical context is the whole point of this log.

**How to link to project tasks**
- Use the task ref format `#NN` (e.g. `#62`) in the **Related Tasks** field.
- One issue can reference multiple tasks (e.g. `#47, #51`).
- If a task is created later to fix an existing issue, edit the entry to add the ref.

---

## Severity guide

| Level | Definition (this project) |
|---|---|
| **Critical** | Production is down, data is being lost or corrupted, or a security vulnerability is being actively exploited. All hands stop and fix immediately. |
| **High** | A core flow is broken for a meaningful subset of users (e.g. login, attendance check-in, payroll run, ID-card issuance). Workaround may exist but is painful. Fix within days. |
| **Medium** | A non-core flow is broken or degraded, OR a core flow is broken for a small subset only. App is usable. Fix within the current sprint. |
| **Low** | Cosmetic, minor UX, edge-case, or quality-of-life issue. No user is blocked. Fix when convenient. |

---

## Entry template

```markdown
### ISSUE-NNN — <short one-line title>

- **Logged:** YYYY-MM-DD
- **Severity:** Critical | High | Medium | Low
- **Component:** Mobile | Backend | Admin Panel | Infrastructure | Database | (free text)
- **Description:** What was observed. Steps to reproduce if known.
- **Impact:** Who is affected and how.
- **Workaround:** Temporary mitigation, or "None".
- **Related Tasks:** #NN, #NN — or "None".
- **Status notes:**
  - YYYY-MM-DD — first note
  - YYYY-MM-DD — next update
```

---

## Open

Issues that have been logged but no one is actively investigating yet.

_None at the moment._

---

## Investigating

Issues that someone has picked up and is actively diagnosing or working on a fix for.

### ISSUE-007 — Android Play release readiness blocked on Play Console access

- **Logged:** 2026-04-19
- **Severity:** High
- **Component:** Mobile + Backend + Infrastructure
- **Description:** Three production-rollout prerequisites for the Android workforce app cannot be fully closed today because we have neither a Google Play Console account nor a linked Google Cloud project: (1) signed release AAB upload to Play (F-09), (2) live Crashlytics/Sentry crash dashboard (F-10), and (3) Play Integrity verdict enforcement on the attendance submit endpoint (F-03 + Play Integrity). Without these, distributing to ~10K devices is not viable: we cannot ship via Play, we have no crash telemetry on rollout, and the attendance submit endpoint can be called by any HTTP client that holds a session cookie.
- **Impact:** Blocks production rollout of the Android workforce app to the worker fleet.
- **Workaround:** Sideloaded debug builds during pre-rollout testing only. The in-app scaffolding (env-driven Gradle signing config, `CrashReporter` interface with NoOp default, `PlayIntegrityProvider` interface with NoOp default, server-side `play-integrity.ts` toggleable verifier) is already in place so the operational swap is a small, well-bounded change once Play access exists.
- **Related Tasks:** #82
- **Status notes:**
  - 2026-04-19 — Logged under task #82. Landed: env-driven release signing in `mobile-android/app/build.gradle.kts` (with debug-signing fallback so fresh checkouts compile, and a loud warning so debug-signed AABs are not mistakenly uploaded), `keystore.properties.example` template, `.gitignore` entries for keystore / Firebase / service-account JSON, `CrashReporter` abstraction with `NoOpCrashReporter` and salted-SHA256 employee-number hashing for non-PII tagging, `PlayIntegrityProvider` abstraction with `NoOpPlayIntegrityProvider`, server-side `server/play-integrity.ts` with `PLAY_INTEGRITY_ENABLED` env toggle (off by default; pass-through behaviour preserves the existing submit contract), and a comprehensive `docs/android-release-runbook.md` covering keystore generation, Play App Signing enrolment, Crashlytics swap-in, Play Integrity wire-up (device + server), staged rollout playbook, and an end-to-end verification checklist. Operational follow-ups (actual keystore creation, Crashlytics SDK swap-in, Play Integrity SDK wire-up, server googleapis decode call) are blocked on Play Console + GCP provisioning and tracked in the runbook.

---

## Resolved

Issues that have been fixed and verified. Kept for historical reference. Each entry should end with a dated note describing what fixed it.

### ISSUE-008 — Attendance selfies upload to private DO Spaces ACL but admin UI renders them as plain `<img>` (403 in production)

- **Logged:** 2026-04-25
- **Severity:** High
- **Component:** Backend + Admin Panel
- **Description:** `POST /api/attendance-mobile/submit` (server/routes.ts:7715) called `uploadFile(...)` without `{ isPublic: true }`. In production this stored the worker selfie on DigitalOcean Spaces with the default "private" ACL. The admin inbox at `client/src/pages/inbox.tsx` rendered the photo via plain `<img src={item.metadata.submittedPhotoUrl}>` with no proxy or signed URL — so every flagged attendance review showed a broken image. Same root-cause class as ISSUE-009 (contract template logos) and Task #198 (ID card backgrounds), but explicitly *not* fixed in Task #200 because attendance selfies are more sensitive than template assets and the privacy-vs-convenience tradeoff deserved an explicit decision.
- **Impact:** Reviewers could not see the submitted selfie when triaging flagged attendance submissions in production. Approve/reject decisions were made blind. Dev was unaffected because dev serves files from local disk via `/uploads`.
- **Workaround:** Approve/reject without visual confirmation (not safe), or reviewers temporarily generate a presigned URL out-of-band.
- **Related Tasks:** #200, #201
- **Status notes:**
  - 2026-04-25 — Logged. Decision pending between (a) flipping the upload to public-read with opaque random filenames (matches the existing candidate-photo pattern in `server/lib/photo-upload-handler.ts:80` for `docType === "photo"`, lowest-effort fix), or (b) keeping ACL private and adding a server-side admin-only image proxy (or short-lived presigned URL) that requires `attendance_mobile:review_read`. Option (b) is the privacy-correct choice but requires both backend and frontend work.
  - 2026-04-25 — Resolved under task #201 with **option (b)** — privacy-correct. Attendance selfies are biometric/PII and stay private at rest on DO Spaces (default ACL — deliberately *not* flipped to `public-read`). Added a new admin-only image proxy `GET /api/attendance-mobile/submissions/:id/photo` in `server/routes.ts`, gated on the existing `attendance_mobile:review_read` permission (same gate already used by `GET /api/attendance-mobile/submissions/:id`), which streams bytes via `getFileBuffer(submission.photoUrl)` with `Content-Type` derived from `getMimeType(...)` and `Cache-Control: private, max-age=300`. The admin inbox at `client/src/pages/inbox.tsx` now renders the submitted-photo `<img>` from `/api/attendance-mobile/submissions/${item.entityId}/photo` (which falls under the inbox item's `entityType === "attendance_submission"` / `entityId === submissionId` set by `server/verification-pipeline.ts`) instead of the raw private Spaces URL. The reference (candidate) photo URL still renders directly because candidate photos are already uploaded with `{ isPublic: true }` (see `server/lib/photo-upload-handler.ts:80`). **No backfill needed** — already-uploaded photos remain private and are served through the new proxy. Updated the explanatory comment at the upload site to point at the new proxy. In dev (no `NODE_ENV=production`) `getFileBuffer` reads from local `/uploads`, so this works end-to-end in dev too.

### ISSUE-009 — Contract template logos upload to private DO Spaces ACL — invisible on contract preview / PDF in production

- **Logged:** 2026-04-25
- **Severity:** High
- **Component:** Backend + Admin Panel
- **Description:** `POST /api/contract-templates/:id/logo` (server/routes.ts:5230) called `uploadFile(...)` without `{ isPublic: true }`. In production the logo file landed on DigitalOcean Spaces with the default "private" ACL, so the browser got 403 every time it tried to render `template.logoUrl` in the onboarding contract preview, the candidate portal, and embedded contract PDFs. The URL persisted in `contract_templates.logo_url`, so the admin saw "logo saved" but it never appeared anywhere downstream. Dev was unaffected because dev serves files from local disk via `/uploads`. Same root-cause class as Task #198 (ID card backgrounds).
- **Impact:** Every contract template uploaded in production had a broken logo on the preview screen, the candidate portal preview, and the generated PDF. Branding-critical defect for any operator who set a logo since DO Spaces was wired up.
- **Workaround:** None.
- **Related Tasks:** #200
- **Status notes:**
  - 2026-04-25 — Logged.
  - 2026-04-25 — Fixed in task #200. Forward fix: `POST /api/contract-templates/:id/logo` now passes `{ isPublic: true }` to `uploadFile`, mirroring the existing fix in `POST /api/id-card-templates/:id/background` and the candidate-photo upload in `server/lib/photo-upload-handler.ts:80`. Backfill: added `scripts/backfill-public-logos.ts` (dry-run by default, `--apply` flips ACLs in place via `PutObjectAclCommand` so existing URLs keep resolving — no re-upload needed). Operator runs the backfill once on production to recover already-uploaded logos. Verified: type-check clean (`npx tsc --noEmit`); inline code comment at the upload site documents the dev-vs-prod ACL drift to prevent regressions.

### ISSUE-002 — Job posting applicants import — hard drop

- **Logged:** 2026-04-19
- **Severity:** Medium
- **Component:** Admin Panel
- **Description:** The job-posting backoffice exposed a spreadsheet upload control on both the job-posting list page (applicants drawer) and the job-posting detail page. That upload path consumed a previously exported workbook, read the "New Status" column, and bulk-updated application statuses. It bypassed the proper recruitment pipeline (applications, screening, interviews) and was a recurring source of dirty data. Operators occasionally re-uploaded stale exports, silently reverting decisions made elsewhere in the app.
- **Impact:** Recruitment data integrity. Admin operators on the job-posting screens.
- **Workaround:** None — the only safe path was to instruct operators not to use the button.
- **Related Tasks:** #65
- **Status notes:**
  - 2026-04-19 — Logged.
  - 2026-04-19 — Resolved by task #65. The upload control, file input, status banner, parser, and the associated mutation were removed from both job-posting screens. All applicant-upload translation strings were stripped from the EN and AR `jobPosting` namespaces. The export button is unchanged. The previous generic `/api/applications/bulk-status` endpoint was retired and replaced by a dedicated, status-locked `/api/applications/bulk-shortlist` endpoint that only supports the interviews flow's bulk-shortlist action; the matching permission key was renamed from `applications:bulk_status` to `applications:bulk_shortlist` and the interviews page was updated to call the new path. A Playwright suite (`e2e-tests/suites/job-posting-import-removed.ts`) asserts the upload button is absent on both screens and that the export button is still present. Verification: zero matches across non-doc files for the removed identifiers; `tsc` clean for the touched files (only pre-existing unrelated errors remain).

### ISSUE-003 — Android home screen profile photo slow to render after login

- **Logged:** 2026-04-19
- **Severity:** Medium
- **Component:** Mobile
- **Description:** After login, the worker profile photo on the Android home screen took a noticeable delay to render, leaving a blank/grey circle visible. Root cause was three-fold: (1) the `AsyncImage` on `HomeScreen.kt` had no size hint, no explicit memory/disk cache policy, no placeholder, and rebuilt the `ImageRequest` on every recomposition; (2) Coil had no application-level `ImageLoader`, so the disk cache was effectively non-persistent; (3) the backend served photo bytes without `Cache-Control`, so OkHttp's HTTP cache never validated stored copies.
- **Impact:** All workers using the Android app — slow visual feedback on the home screen, especially on cold start or weak networks.
- **Workaround:** None.
- **Related Tasks:** #66
- **Status notes:**
  - 2026-04-19 — Fixed under Task #66. Stabilized the `ImageRequest` with `remember(photoUrl, serverUrl)`, added explicit `size(80dp)`, enabled memory + disk cache policies, and added a Person vector painter as both `placeholder` and `fallback`. Configured a global Coil `ImageLoader` via `WorkforceApp : ImageLoaderFactory` (25% RAM memory cache, 50 MB disk cache, `respectCacheHeaders=true`). Added a fire-and-forget `Coil.imageLoader(ctx).enqueue(...)` prefetch in `LoginScreen.kt` immediately after a successful login. On the backend, the dev `/uploads` static handler and the production DO Spaces `PutObjectCommand` now both emit `Cache-Control: ... max-age=86400, must-revalidate` for photos, with ETag/Last-Modified left enabled so subsequent requests return 304. Verified visually that warm-cache loads render essentially instantly and cold-cache loads show the placeholder icon over the brand circle until the photo crossfades in.

### ISSUE-004 — Attendance submissions could silently disappear after sync failures

- **Logged:** 2026-04-19
- **Severity:** Critical
- **Component:** Mobile (mobile-android / AttendanceRepository sync pipeline)
- **Description:** Workers reported successful capture but attendance never appeared on the server. Pending rows occasionally got stuck without surfacing to the user, decrypted temp photo files leaked into cache, and the 5-strike retry cap could permanently abandon submissions after a transient outage. Mobile config fetch failures could also corrupt NTP server settings. Root cause: broad `catch (_: Exception)` blocks in the submit loop swallowed all errors without classification or telemetry; temp files were not cleaned via `finally`; retries used a hard cap rather than exponential backoff with operator visibility; the config fetch overwrote NTP fields even when the response was missing/invalid.
- **Impact:** Workers using the Android app could lose attendance submissions silently after transient network/server outages.
- **Workaround:** None.
- **Related Tasks:** #67
- **Status notes:**
  - 2026-04-19 — Fixed under task-67. Rewrote `AttendanceRepository.submitOne()` to classify errors per-attempt (`SyncOutcome` in `SyncTelemetry.kt`), persist HTTP status / error code per row, switch to exponential backoff with jitter via `computeNextRetryAtMillis`, and auto-promote rows older than 24h to `needs_attention`. Temp photo files are deleted in a `finally` block. The mobile config fetch now keeps existing NTP config on failure and writes a telemetry event instead of overwriting fields with nulls. Added `getNeedsAttentionCount` / `retryNow()` plumbing, a Home banner, and per-row Retry buttons in History so workers can recover stuck submissions manually. DB upgraded to v9 with migration 8→9 adding `next_retry_at_millis`, `last_attempt_at_millis`, `last_error_code`, `last_http_status`, `needs_attention`, `stale_clock`. Bilingual strings added in `values/` and `values-ar/`.

### ISSUE-005 — Role identifier (slug) field validation behaves inconsistently

- **Logged:** 2026-04-19
- **Severity:** Low
- **Component:** Admin Panel
- **Description:** In Settings → Roles & Access → New Role, the slug/identifier field had three small inconsistencies: (1) the regex permitted `-` but the auto-`slugify()` helper only ever emitted `_`, sending mixed signals to the user, (2) auto-sync from the name field shut off permanently after the user touched the slug field once (`dirtyFields.slug`) — even if they reverted their change, and (3) on edit the slug field was hidden but the same schema still enforced a `min(2)` rule against the form's stale state, which could block a PATCH-only edit in edge cases.
- **Impact:** Confusing UX when creating new roles. No data loss; existing slugs unaffected.
- **Workaround:** Type the slug manually.
- **Related Tasks:** #68
- **Status notes:**
  - 2026-04-19 — Fixed in task #68. Aligned slug regex, slugify helper (kept underscore as canonical join character to match existing `super_admin`/`candidate` slugs), and on-screen helper text. Split `useRoleSchema` into `useRoleCreateSchema` (validates slug) and `useRoleEditSchema` (omits slug entirely). Replaced `dirtyFields.slug` check with a `useRef`-tracked "last auto value" so clearing the slug re-engages auto-sync. Added bilingual (EN/AR) helper text under the slug field. Pure non-Latin name input no longer overwrites the slug with empty.

### ISSUE-006 — Audit Log lacks export and uses page-based pagination — won't scale

- **Logged:** 2026-04-19
- **Severity:** Medium
- **Component:** Admin Panel + Backend
- **Description:** The Audit Log page used fixed page-based pagination (50 rows per page) and offered no export. Paging through thousands of pages becomes unusable as the table grows, and operators routinely need to share filtered audit slices with auditors / regulators / internal investigations.
- **Impact:** Operators could not extract audit slices for compliance review, and deep navigation through large result sets was effectively impossible.
- **Workaround:** None.
- **Related Tasks:** #69
- **Status notes:**
  - 2026-04-19 — Fixed via task #69. Added Excel/CSV export endpoint at `/api/audit-logs?format=csv|xlsx&export=true` (server-side keyset pagination, streamed CSV, chunked XLSX, capped at 500K rows). Replaced page-based pagination with `useInfiniteQuery` + `@tanstack/react-virtual` virtualized infinite scroll keyed by `createdAt` cursor with an IntersectionObserver sentinel. The existing `audit_logs_created_at_idx` index already supports the keyset pagination path.

---

## Audits

Standing reference notes from systematic codebase sweeps. These are not bugs — they document what *was already true* after a sweep so a future engineer can extend or verify without redoing the whole search.

### AUDIT-001 — File-upload ACL intent for every `uploadFile(...)` call site (Task #202)

- **Audited:** 2026-04-25
- **Trigger:** Same private-ACL upload bug hit three times in a row — Task #198 (ID card backgrounds), Task #200 (contract template logos), and ISSUE-008 (attendance selfies, deferred). The pattern is always identical: `uploadFile(...)` is called without `{ isPublic: true }`, the URL is then rendered directly by the browser via `<img>` (or fetched cross-origin), and the bug is invisible in dev because dev serves `/uploads` from local disk.
- **Scope:** Every call site of `uploadFile(...)` under `server/`. Re-find with `rg -n "uploadFile\(" server/`.

| # | Call site | Asset | Intent | Why | Status |
|---|---|---|---|---|---|
| 1a | `server/lib/photo-upload-handler.ts` (`POST /api/candidates/:id/documents`, `docType === "photo"`) | Candidate photo | **public-read** | Rendered directly via plain `<img src={photoUrl}>` across the admin panel (talent, workforce, dashboard, org-chart, job-posting-detail, schedules) and the candidate portal, and embedded in printed ID cards (`client/src/lib/id-card-renderer.ts`, `client/src/lib/card-renderer.tsx`). Random filenames, low enumeration risk. | OK — passes `{ isPublic: docType === "photo" }`. |
| 1b | `server/lib/photo-upload-handler.ts` (same route, `docType ∈ {nationalId, iban, resume, driversLicense, vaccinationReport}`) | Candidate PII attachments (national ID copy, IBAN certificate, resume, driver's license, vaccination report) | **private** | PII; must never be served from a public CDN. Every consumer routes through `toProxiedFileUrl(...)` → `GET /api/files/uploads/...` (`server/routes.ts:609`), which is gated by `requireAuth` + an owner-or-`candidates:read` check. Flipping these to public-read would silently leak ID copies / bank certificates / medical records. | OK — passes `{ isPublic: false }` via the same ternary. |
| 2 | `server/routes.ts:5240` (`POST /api/contract-templates/:id/logo`) | Contract template logo | **public-read** | Rendered directly via `<img src={template.logoUrl}>` in onboarding contract preview, candidate portal, and embedded in generated contract PDFs. | OK — fixed in Task #200; see ISSUE-009. |
| 3 | `server/routes.ts:5671` (`POST /api/id-card-templates/:id/background`) | ID card template background image | **public-read** | Rendered via CSS `background-image: url(...)` in the card designer preview and the print window (`client/src/lib/id-card-renderer.ts`). | OK — fixed in Task #198. |
| 4 | `server/routes.ts:7719` (`POST /api/attendance-mobile/submit`) | Worker attendance selfie | **private** | Biometric / PII; must stay private at rest on DO Spaces. Admin reviewers fetch the photo through the admin-only proxy `GET /api/attendance-mobile/submissions/:id/photo` (gated on `attendance_mobile:review_read`), which streams bytes via `getFileBuffer(...)`. The admin inbox at `client/src/pages/inbox.tsx` renders the proxy URL, never the raw Spaces URL. | OK — fixed in Task #201; see ISSUE-008 (Resolved). |
| 5 | `server/routes.ts:8104` (`POST /api/admin/candidates/:id/photo`) | Admin-side candidate photo replacement | **public-read** | Same end-state as 1a — writes to `candidates.photo_url`, which is rendered directly via `<img>` in every admin/portal screen above. Flipping this to private would re-introduce the bug for any photo replaced by an admin. | OK — passes `{ isPublic: true }`. |

- **Routes that take a multipart upload but DO NOT call `uploadFile(...)`** (intentionally — bytes are parsed in-memory and discarded, so there is no ACL to set):
  - `server/routes.ts:3954` — `POST /api/workforce/bulk-update` (XLSX is parsed via `uploadXlsx` for bulk row updates).
  - `server/routes.ts:8583` — `POST /api/pay-runs/:id/import-bank-response` (bank response file is parsed into rows, not stored as an asset).
- **Backfill posture:** Every public-read site has either an existing one-off backfill (e.g. `scripts/backfill-public-logos.ts` for ISSUE-009) or is fed by a write path that produces fresh URLs each upload. The previously deferred attendance selfies (ISSUE-008) needed no backfill because Task #201 chose to keep them private and added an admin-only proxy — already-uploaded selfies remain valid through the new proxy.
- **How to extend this audit if you add a new `uploadFile(...)` call site:** add a row above with the same shape, add a one-line comment at the call site referencing this audit, and confirm whether the URL is consumed via direct `<img>` / `<a href>` (→ public-read) or via the authenticated `/api/files/...` proxy (→ private).
