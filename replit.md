# Event Workforce Hiring Management System

## Overview
This project is a full-stack, MAANG-scale event-based job hiring management platform for Saudi Arabia, designed to manage 70,000+ candidates. Its primary purpose is to digitize and streamline the entire event-based hiring lifecycle, from candidate intake and onboarding to workforce management, particularly for high-volume recruitment during events like Ramadan and Hajj. The system features a dual-interface: an admin back-office and a candidate self-service portal, supporting both public applicants and bulk-uploaded Sub-Manpower Provider (SMP) workers. The business vision is to replace traditional chaotic hiring methods with an efficient, scalable digital solution, tapping into the market for large-scale event staffing.

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

Pushes to GitHub are always done by me manually from the Shell pane. The agent must not attempt `git push` itself — instead, when changes are ready to deploy, the agent stages/commits them locally and tells me the exact command to run (e.g. `git push github main`).

Any floating UI elements (dropdowns, tooltips, popovers, autocompletes) rendered inside a dialog, table, card, or any container with `overflow: hidden/auto/scroll` MUST use `createPortal(... , document.body)` with `position: fixed` and `z-index: 9999` to prevent clipping.

For tooltip info icons, use Lucide's `Info` icon directly without wrapping it in a `rounded-full border` button to avoid a double-circle effect. Use a plain unstyled button with only `text-muted-foreground hover:text-primary` classes.

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
- **Headcount Management**: "Filled positions" are computed live from the workforce table.
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
- **Org Chart**: Interactive, read-only organizational chart with two views: **Positions** (legacy department→position→employee tree) and **People** (manager-of-manager Reports To tree, with an "Unmanaged" pseudo-node grouping employees that have no `managerId`). The view toggle is a segmented control in the top-left panel; print-to-PDF is only available for the Positions view.
- **Management Module**: Standalone `managers` directory (separate from `users`) holds non-system managers with email/phone/department/position/`reportsToManagerId`. Workforce rows reference managers via `workforce.manager_id` (replacing the dropped `supervisor_id`). The `/management` page provides CRUD, deactivation (with reassign-or-orphan dialog when the manager has direct reports — server returns 409 `HAS_REPORTS` and the client retries with `?reassignTo=<id>` or `?orphan=true`), Excel import (template at `GET /api/managers/template`, registered before `/:id` to avoid Express path shadowing), and bulk reassignment. RBAC: `managers:read|write|assign` for the directory; reassigning a worker (single or bulk) requires `workforce:assign_manager` — the per-row guard on `PATCH /api/workforce/:id` mirrors the bulk endpoint so the dedicated permission cannot be bypassed via the general workforce update. Excel import contract (full docs in `server/lib/managers-import.ts`): validation pass is atomic; pass 1 (base create/update) is fail-fast and reports remaining rows as `skipped`; pass 2 (reports-to wiring) preserves the base row status and records failures as a per-row `reportsToWarning`. The route response splits these as `errors[]/errorCount` (row didn't land) vs `reportsToWarnings[]/reportsToWarningCount` (row landed, parent edge missing). True row-set atomicity is documented as future work — current implementation bounds the half-imported window via fail-fast and exposes everything that landed via the response. The Workforce page exposes a Reports To picker on each employee detail drawer and a "Reassign Manager" bulk action. The Org Chart People view includes employees whose `managerId` points to a missing/inactive manager in the "Unmanaged" group so they are never silently dropped. The mobile app surfaces "Reports To" in the employee profile via the joined `/api/workforce/all-by-candidate/:id` endpoint, with tap-to-call and long-press-to-WhatsApp on the row.
- **Welcome SMS Plumbing (stub)**: The `sms_outbox_kind` enum reserves `welcome_employee` (boot migration `ensureWelcomeEmployeeEnum`). The `convertOnboardingToEmployee` storage method logs a `[welcome-sms-stub]` line on every conversion but does NOT enqueue a message — the templated keys `welcome_employee_sms_template_ar` / `_en` exist only as documentation in the storage comment. Future work flips the stub to a real `sms_outbox` insert once ops sign off on the template.
- **Rekognition Resilience**: Profile photo uploads fail closed with `503` if AWS Rekognition is unreachable and no previously validated photo exists.
- **Rotation Rescue Telemetry**: Tracks photo upload auto-rotation outcomes for regression detection.
- **Candidate Document Types**: Supports Driver's License and Vaccination Report, which are individual-only, PII-protected, and not mirrored into SMP onboarding.
- **Onboarding Document Reminders**: Automated SMS reminders for candidates with missing required documents (photo, IBAN, national ID), with configurable cadence (first-after, repeat-every, max), quiet hours, final-warning window, and auto-elimination after a deadline. Per-row indicators (state-driven bell, missing-doc pip strip, "at risk" red border) and admin actions (send-now, pause, resume) live on the onboarding pipeline. Settings tab `إعدادات الإشعارات` on `/onboarding`. Race-safe (compare-and-swap on `reminder_count` for sweep + manual; transactional elimination).
- **Audit Log Actor Attribution**: Every audited mutation captures the real authenticated user via `req.authUserId` (set by `requireAuth`), and `actor_name` is rendered as a bilingual `"EN AR"` string by `formatActorName(user)` (server/lib/actor-name.ts) using `users.full_name` + `users.full_name_ar`. The legacy `(req as any).userId` field was never assigned anywhere and silently nulled the actor — a static regression test (`server/__tests__/audit-actor-id-no-regression.test.ts`) now fails the build if any callsite reads it again.

**Mobile App (Android Native)**:
- Developed in Kotlin with Jetpack Compose, offering selfie check-in with CameraX, GPS verification, offline-first Room DB, encrypted data storage, auto-sync, and Google Maps geofence zones. Includes `DeviceTrustManager` for emulator and mock GPS detection. Supports excuse request submission and photo changes requiring HR approval.

## Operations

### Database schema sync (dev → prod)

`npm run db:push` only syncs the **dev** Neon DB. The production database (DigitalOcean) must be migrated separately or new columns / tables will be missing on prod and queries that reference them will fail.

After any change to `shared/schema.ts`:

1. Sync dev: `npm run db:push`
2. Sync prod: `node scripts/migrate-prod.mjs`

The prod runner refuses to start unless `PROD_DATABASE_URL` is set and different from `DATABASE_URL`, prints the target host and DB, runs a connectivity probe, and requires the operator to type `APPLY` (uppercase) before invoking `drizzle-kit push` against prod. Drizzle's own interactive prompt still surfaces for any destructive change (drop / type change), so the apply step is double-gated.

## External Dependencies

- **PostgreSQL**: Primary database for all persistent data storage.
- **AWS Rekognition**: Facial recognition for mobile attendance verification and photo quality checks.
- **DigitalOcean Spaces**: S3-compatible object storage for file uploads in production (photos, documents, logos).
- **Zebra Browser Print SDK and Evolis Premium Suite plugins**: Planned for direct printing in the Employee ID Cards feature.