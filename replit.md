# Event Workforce Hiring Management System

## Overview
This project is a full-stack, MAANG-scale event-based job hiring management platform for Saudi Arabia, capable of managing 70,000+ candidates. Its purpose is to digitize and streamline the entire event-based hiring lifecycle, from candidate intake and onboarding to workforce management, particularly for high-volume recruitment during events like Ramadan and Hajj. The system features a dual-interface: an admin back-office and a candidate self-service portal, supporting both public applicants and bulk-uploaded Sub-Manpower Provider (SMP) workers. The business vision is to replace traditional chaotic hiring methods with an efficient, scalable digital solution, tapping into the market for large-scale event staffing.

## User Preferences
I prefer detailed explanations.
I want iterative development.
Ask before making major changes.
Do not make changes to the folder `shared/`.
Do not make changes to the file `client/src/components/ui/date-picker-field.tsx`.
Do not make changes to the file `client/src/components/ui/dialog.tsx`.
Do not make changes to the file `client/src/lib/id-card-renderer.ts`.
Do not make changes to the file `client/src/hooks/use-mobile.tsx`.
Do not make changes to the file `client/src/hooks/use-debounce.ts`.
Do not make changes to the file `server/github.ts`.
Do not make changes to files under `/api/github/*`.

I will say "Napoleon" or "call Napoleon" before any feature request when I need a full impact analysis. This analysis should cover data ramifications, logic dependencies, prerequisites, a sync plan, and a risk assessment, without modifying any files.

When I say "don't x" (e.g., "don't execute", "don't ship it", "don't push") I always mean **don't execute / don't act**. Stop at planning or proposal. Never interpret it as anything else.

Any floating UI elements (dropdowns, tooltips, popovers, autocompletes) rendered inside a dialog, table, card, or any container with `overflow: hidden/auto/scroll` MUST use `createPortal(... , document.body)` with `position: fixed` and `z-index: 9999` to prevent clipping.

For tooltip info icons, use Lucide's `Info` icon directly without wrapping it in a `rounded-full border` button to avoid a double-circle effect. Use a plain unstyled button with only `text-muted-foreground hover:text-primary` classes.

## Operating principles

- **Optimize all flows for low-skill operators.** Assume admins miss
  dashboard signals, tooltips, and warning chips. Prefer self-healing
  server logic over UI affordances that require notice. Loud, helpful
  errors over silent fallbacks.

- **Two-table identity split for candidates and users.** A `candidates`
  row may exist without a `users` row — `candidates.userId` is nullable.
  SMP workers come into the system via bulk upload as candidates with
  no user record. The activation endpoint
  (`POST /api/auth/activate`) is the **only** code path that creates
  the `users` row for an SMP worker; it consumes a single-use 21-day
  activation token, creates the user, links it to the candidate, and
  flips `candidates.status` from `awaiting_activation` to `available`.

- **Scheduled-session and direct-hire/apply pipelines are
  individual-classification-only by hard rule.** SMP workers reach
  onboarding via the SMP commit + Send-to-Onboarding flow, never via
  these pipelines. The exclusion is enforced at both the listing/picker
  layer (so SMP candidates never appear) **and** every action layer
  that mutates invitee/applicant sets. The single authority for the
  check is the `assertIndividualPipelineEligible(candidateIds)` helper
  in `server/pipeline-eligibility.ts`. Historical note: `interviews.ts`
  serves both interview-labeled and training-labeled scheduled
  sessions through one code path — the file name is legacy, the code
  is shared.

## Release & Operations

- **Rekognition resilience (Task #108, Workstream 1):** profile-photo
  upload fails closed with `503` + bilingual `photo.verifyUnavailable`
  when AWS Rekognition is unreachable AND the candidate has no
  previously-validated photo on file. Re-uploads from candidates with
  an existing valid photo continue to fail open (the existing photo
  vouches for them). Fallback events are tracked in a process-local
  ring buffer (`server/rekognition-telemetry.ts`) and surfaced at
  `GET /api/admin/telemetry/rekognition-fallbacks` for early outage
  detection. R&D memos for the unshipped workstreams (attendance
  cost reduction, SMP identity binding) live in `docs/rd/`.

- **Rotation rescue telemetry (Task #166):** the photo-upload auto-
  rotation rescue (`server/lib/photo-rotation.ts`) increments a
  process-local ring-buffer counter on every persist outcome
  (`persisted_90`, `persisted_-90`, `persist_failed`). Surfaced to
  admins at `GET /api/admin/telemetry/rotation-rescue` and rendered as
  a 24h success-rate card in Settings → Security so SRE can detect
  deploy regressions (rate→0 with attempts), iOS-OS-induced cost
  spikes (attempts 10x baseline), and S3-write failures (rate→0%
  with attempts climbing). Same per-instance trade-off as the
  Rekognition fallback counter.

- **Android Play release readiness:** the workforce app's release-signing,
  crash-reporting, and Play Integrity wiring is scaffolded but the
  operational rollout is deferred until a Google Play Console account and a
  linked Google Cloud project are provisioned. The full playbook —
  keystore generation, Play App Signing enrolment, Crashlytics swap-in,
  Play Integrity device + server wire-up, staged rollout — lives in
  `docs/android-release-runbook.md`. Tracked under issue ISSUE-007.

- **CI test gate (Task #148, #150):** every push (any branch) and every
  pull request triggers `.github/workflows/test.yml`, which runs two
  parallel jobs after `npm install`:
  - `npm test` — the unified suite covering `server/__tests__`,
    `shared/__tests__`, and `client/src/lib/__tests__`.
  - `npm run check` — a full TypeScript typecheck (`tsc`) so compile
    errors surface as a red status check on the PR instead of slipping
    onto `main`.
  Configure both `Test suite / npm test` and
  `Test suite / npm run check` as required status checks on the `main`
  branch in GitHub → Settings → Branches so a red suite or a failing
  typecheck blocks merges. Contributors should run `npm test` and
  `npm run check` locally before opening a PR; the same commands are
  what CI executes, so green locally means green in CI.

## System Architecture

The system employs a modern, full-stack architecture designed for scalability and maintainability.

**Frontend**:
- Built with React 19, Vite, TypeScript, Tailwind CSS v4, Shadcn/UI, and TanStack Query, using `wouter` for routing.
- **UI/UX Decisions**: "Modern Industrial" theme with a dark forest green color scheme, Space Grotesk display font, Inter body font, and 0.25rem border radius. Modals and tooltips utilize portals to prevent clipping.
- **Internationalization**: Fully bilingual (Arabic default, English) with RTL support via Tailwind logical properties. Western digits 0-9 are enforced across the UI.

**Backend**:
- Powered by Express.js and Node.js with TypeScript for API, authentication, and business logic.
- **Authentication**: Session-based using `bcryptjs` for password hashing.
- **Internationalization**: Server-side localization with `i18n.ts` for consistent messaging and number formatting.

**Database**:
- PostgreSQL, managed with Drizzle ORM.
- **Schema Design**: Optimized for MAANG-scale with indexing for 70,000+ candidates. Key entities include `users`, `candidates`, `events`, `job_postings`, `applications`, `interviews`, `workforce`, `smp_contracts`, `automation_rules`, `notifications`, `inbox_items`, `departments`, `positions`, and ID card management.
- **Data Integrity**: Strict policy against `onConflictDoNothing()` and soft deletion for key entities.
- **Headcount Management**: "Filled positions" are computed live from the workforce table via `server/headcount.ts` for accuracy.
- **Work Schedules & Attendance**: Dedicated schema for `shifts`, `schedule_templates`, `schedule_assignments`, and `attendance_records`. Minute-based engine for attendance verification and payroll.
- **Departments & Positions**: Global catalog with parent-child hierarchy and soft-delete with deactivation safety guards.
- **Payroll Module**: Comprehensive system with pay runs, calculation engine, payment tracking, settlement snapshots, and payslip viewing.

**Core Workflow & Features**:
- **Unified Talent Pool**: Manages all individuals as candidates regardless of source.
- **End-to-End Workflow**: Covers event setup, job postings, SMP contracts, candidate intake, interviews, onboarding, conversion to employee, workforce management, and work schedule/attendance tracking.
- **SMP-Specifics**: Lighter onboarding checklist for bulk-uploaded SMP workers.
- **Onboarding Pipeline**: Phased document verification and contract signing.
- **Contract Engine**: Automated, templated contract generation and digital signing.
- **Automation Rules**: Database-backed, toggleable workflows.
- **Saudi-Specific Features**: Includes fields for National ID, Iqama, IBAN, Arabic names, and nationality.
- **Attendance Middleware**: Geofence zone management, mobile attendance API with GPS and AWS Rekognition face verification, and device trust signals.
- **Excuse Request System**: Employee portal for submitting absence excuses, with admin review via inbox.
- **Bulk Asset Assignment**: Admin functionality to assign assets to multiple employees.
- **Photo Change Control**: Subsequent photo changes require HR approval via an inbox review process.
- **Org Chart**: Interactive, read-only organizational chart displaying department and position hierarchies with employee counts.

**Mobile App (Android Native)**:
- Developed in Kotlin with Jetpack Compose, offering selfie check-in with CameraX, GPS verification, offline-first Room DB, encrypted data storage, auto-sync, and Google Maps geofence zones. Includes `DeviceTrustManager` for emulator and mock GPS detection. Supports excuse request submission and photo changes requiring HR approval.

## External Dependencies

- **PostgreSQL**: Primary database for all persistent data storage.
- **AWS Rekognition**: Facial recognition for mobile attendance verification and photo quality checks.
- **DigitalOcean Spaces**: S3-compatible object storage for file uploads in production (photos, documents, logos).
- **Zebra Browser Print SDK and Evolis Premium Suite plugins**: Planned for direct printing in the Employee ID Cards feature.
## Production Readiness Pass — April 2026

End-to-end production-readiness sweep completed against `workforce.tanaqolapp.com`'s codebase. Deliverables:

- **e2e (Playwright)** — Individual signup → Talent list passed; Recruitment flow (job → application → interview → onboarding hand-off, SMP excluded) passed. Both ran with the SMS gateway bypassed; zero real SMS fired.
- **Architect review** — verdict NO-GO until two items addressed: (a) the dev OTP gate could open in production via a single env flag, (b) `server/db.ts` used `rejectUnauthorized:false` in production. Both fixed in this branch.
- **Dev gate hardening** — `server/dev-otp-log.ts:devGateOpen()` now requires both `ENABLE_DEV_OTP_LOG=true` and `ALLOW_DEV_BYPASS_IN_PROD=true` when `NODE_ENV=production`; `LOAD_TEST_BYPASS_THROTTLE=1` is permanently rejected in prod; `assertDevGateSafe()` runs at boot in `server/index.ts` and fail-fasts the process on any misconfiguration.
- **DB TLS** — `server/db.ts` now defaults to `rejectUnauthorized:true`; operators paste DigitalOcean's CA into `DATABASE_CA_CERT`. `INSECURE_DB_TLS=true` exists as an audited escape hatch only.
- **Load test (Replit dev)** — measured 13–15 signups/sec end-to-end (single small dev container). Bottleneck is the `register` route: bcrypt cost-12 + atomic user/candidate insert tx (p95 ~5s under contention, ~3.4s steady-state). At concurrency 50 vs `pg.Pool` max=40, two flows hit the 2s connection-acquire timeout — confirms pool-size is the binding constraint, not raw concurrency.
- **Load drivers** — `scripts/load-test/local-burst.mjs` (Node, runs against the dev container) and `scripts/load-test/signup-burst.js` (k6, for DO staging) with built-in SLO thresholds. README documents the safe synthetic phone (`057XXXXXXX`) and NID (`2900XXXXXX`) pools and cleanup SQL.
- **Infra recommendation** — `docs/infra-recommendation.md` covers droplet sizing (2× CPU-Optimized 4 vCPU/8 GB behind a DO LB at launch), PgBouncer in transaction-pooling mode (server pool = 2 × droplets × app-pool-max = 160), `UV_THREADPOOL_SIZE=8` per droplet to widen the bcrypt thread pool, monitoring signals, and the deployment validation checklist.

**Documented medium follow-ups (do not block launch):** SMS outbox is at-least-once; auth cookie has no per-token `jti` rotation; outbox drainer runs on every droplet — verify the `FOR UPDATE SKIP LOCKED` claim path under dual drainers during deploy validation, fall back to leader election if drift observed.

## Candidate Document Types — April 2026

Two new individual-only candidate document types added: **Driver's License** (`driversLicense`) and **Vaccination Report** (`vaccinationReport`). Both are PII → private ACL (proxied via `toProxiedFileUrl`), shown only on individual candidate profiles (not SMP), and follow the same upload/delete plumbing as `nationalId` / `iban` / `resume`. Allowlists, `updatePayload`, `fileUrlMap`, server `doc.label.*` keys, and the `file.invalidDocType{,Short}` validator messages are all kept symmetric across `server/lib/photo-upload-handler.ts`, `server/routes.ts`, and `server/i18n.ts`. Frontend tiles + i18n live in `client/src/pages/candidate-portal.tsx` (gated `individualOnly: true`) and admin view buttons in `client/src/pages/talent.tsx`. New schema columns on `candidates`: `has_drivers_license`, `drivers_license_file_url`, `has_vaccination_report`, `vaccination_report_file_url`. The new docs are intentionally NOT mirrored into onboarding-record sync (they're not part of the SMP onboarding checklist).
