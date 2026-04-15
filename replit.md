# Event Workforce Hiring Management System

## Overview
This project is a full-stack, MAANG-scale event-based job hiring management platform designed for Saudi Arabia, capable of managing 70,000+ candidates. It aims to digitize and streamline the entire event-based hiring lifecycle, from candidate intake and onboarding to workforce management, particularly for high-volume recruitment during events like Ramadan and Hajj. The system features a dual-interface: an admin back-office and a candidate self-service portal. It supports both public applicants and bulk-uploaded Sub-Manpower Provider (SMP) workers, unifying them into a single talent pool. The business vision is to replace chaotic traditional hiring methods with an efficient, scalable digital solution, tapping into the market for large-scale event staffing.

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

Any floating UI elements (dropdowns, tooltips, popovers, autocompletes) rendered inside a dialog, table, card, or any container with `overflow: hidden/auto/scroll` MUST use `createPortal(... , document.body)` with `position: fixed` and `z-index: 9999` to prevent clipping.

For tooltip info icons, use Lucide's `Info` icon directly without wrapping it in a `rounded-full border` button to avoid a double-circle effect. Use a plain unstyled button with only `text-muted-foreground hover:text-primary` classes.

## System Architecture

The system employs a modern, full-stack architecture.

**Frontend**:
- Built with React 19, Vite, TypeScript, Tailwind CSS v4, Shadcn/UI, and TanStack Query, using `wouter` for routing.
- **UI/UX Decisions**: "Modern Industrial" theme with a dark forest green (`HSL: 155 45% 45%`), Space Grotesk display font, Inter body font, and 0.25rem border radius. Modals and tooltips utilize portals to prevent clipping.

**Backend**:
- Powered by Express.js and Node.js with TypeScript for API, authentication, and business logic.

**Database**:
- PostgreSQL, managed with Drizzle ORM.
- **Schema Design**: Optimized for MAANG-scale with indexing for 70,000+ candidates. Key entities include `users`, `candidates`, `events`, `job_postings`, `applications`, `interviews`, `workforce`, `smp_contracts`, `automation_rules`, `notifications`, `inbox_items`, `departments`, `positions`, and ID card management.
- **Candidate Data**: Identified by `national_id`; `skills`, `languages`, `certifications`, `tags` are array columns; `metadata` uses JSONB.
- **Data Integrity**: Strict policy against `onConflictDoNothing()` and soft deletion (`archivedAt`) for events and candidates.
- **Events**: Central entity, can be `duration_based` or `ongoing`.
- **Work Schedules & Attendance**: Dedicated schema for `shifts` (catalog), `schedule_templates` (weekly patterns), `schedule_assignments` (employee assignments with history), and `attendance_records` (daily status, clock-in/out, `minutesScheduled`, `minutesWorked`). Attendance status enum: `present`, `absent`, `late`, `excused` (no half_day). Navigation at `/attendance` (top-level sidebar), old `/schedules` redirects. Dashboard tab with stat cards, Most Late/Most Absent top-50 tables, CSV/Excel export. Minute-based engine: verification pipeline auto-detects lateness, manual edits auto-calculate minutes, settlement uses minute-based formula. Employee portal "My Shift" tab shows weekly schedule and recent attendance.
- **Departments & Positions**: Global position catalog with parent-child hierarchy within departments. Positions link to workforce records via `workforce.positionId`. Soft-delete with deactivation safety guards (blocks deactivation of positions with active employees or active children, blocks department deactivation with active positions). Settings page at `/departments`.
- **Org Chart**: Interactive canvas-style org chart at `/org-chart` (Workforce sidebar group). Uses React Flow + dagre for pan/zoom/auto-layout. Department silos expand to show position hierarchy; position cards show employee counts and expand to list employees. Collapsed by default for 5,000+ scale. Read-only, theme-matched (dark + forest green). API: `GET /api/org-chart` (authenticated, admin only).

**Authentication**:
- Session-based authentication using `bcryptjs` for password hashing.

**Core Workflow & Features**:
- **Unified Talent Pool**: Manages all individuals as candidates, regardless of source (`self` or `bulk_upload`).
- **End-to-End Workflow**: Covers event setup, job postings, SMP contracts, candidate intake, interviews, onboarding, conversion to employee, workforce management, and work schedule/attendance tracking.
- **SMP-Specifics**: Bulk-uploaded SMP workers have a lighter onboarding checklist (photo + national ID).
- **Onboarding Pipeline**: Phased document verification and contract signing.
- **Contract Engine**: Automated, templated contract generation, digital signing, and PDF rendering.
- **Automation Rules**: Database-backed, toggleable workflows.
- **Saudi-Specific Features**: Includes fields for National ID, Iqama, IBAN, Arabic names, and nationality.
- **Attendance Middleware**: Geofence zone management (CRUD with Leaflet/OSM), mobile attendance API (photo + GPS), AWS Rekognition face verification, and inbox flagging for unverified attendance. Device trust signals (mock location, emulator detection) are sent with each submission and auto-flag suspicious activity.
- **Excuse Request System**: Employees can submit excuse requests for absences via the portal "Excuses" tab. Requests go through inbox review (approve/reject by admin). Schema: `excuse_requests` table with `hadClockIn` (auto-detected from attendance), `effectiveClockOut` fields. Approval/rejection does NOT modify attendance records — resolved at payroll level only. Endpoints: POST/GET `/api/excuse-requests`, PATCH `/api/excuse-requests/:id/approve|reject`, GET `/api/excuse-requests/pending-count`. All endpoints require authentication; approve/reject require admin role.
- **Payroll Module**: Full payroll system with pay runs (full/split mode), payroll calculation engine (attendance → excuses → adjustments → assets → green/red breakdown), payment tracking (bank transfer via IBAN + cash with OTP), settlement snapshots on offboarding completion, CSV/bank exports, and payslip viewing in candidate portal. Schema: `pay_runs`, `pay_run_lines`, `payroll_adjustments`, `payroll_transactions` tables plus settlement snapshot fields on `workforce`. Split mode: Tranche 1/2 with configurable percentage; T2 blocked until offboarding complete. Payment method toggle (bank/cash) on employee profiles with required cash reason. Talent pool shows "Unpaid Settlement" badge. Offboarding page has Queue and Completed tabs with frozen settlement figures.
- **Bulk Asset Assignment**: Admins can assign an asset to many employees at once via the "Bulk Assign" button on the Assignments tab. Dialog includes asset selection, date picker, notes, and a filterable/searchable employee table with checkboxes (Select All). Filters: event, department, employment type. Backend skips duplicates (same asset+workforce with status="assigned"), batches inserts in 500s, and returns created/skipped counts. Confirmation AlertDialog required before submission.
- **Photo Change Control**: First photo upload goes through normally; subsequent photo changes create a pending review request sent to inbox. Previous photo stays active until HR approves the new one. Schema: `photo_change_requests` table.
- **Mobile App (Android Native)**: Developed in Kotlin with Jetpack Compose, offering selfie check-in with CameraX, GPS verification, offline-first Room DB (version 5), encrypted data storage, auto-sync, and Google Maps geofence zones. Includes `DeviceTrustManager` for emulator detection (Build fingerprint checks) and mock GPS location detection (`isFromMockProvider`/`isMock` flags). HomeScreen displays employee position, job title, event name, and profile photo (loaded via Coil). Photo change feature with gallery picker uploads to existing document API; active employees' photo changes require HR approval (pending indicator shown). Session restore fetches workforce records via `candidateId` stored in `SessionManager`. **Excuse Request**: "Excuse" action card on HomeScreen navigates to `ExcuseRequestScreen` — shows excuse request history with status badges, and a "New" button for submitting excuse requests (date defaults to today, auto-detects clock-in status).

## External Dependencies

- **GitHub**: Integrated via Replit OAuth using `@replit/connectors-sdk` and `@octokit/rest` for repository interactions.
- **PostgreSQL**: Primary database for all persistent data storage.
- **AWS Rekognition or Azure Face API**: Planned for facial recognition in the Mobile Attendance App.
- **Zebra Browser Print SDK and Evolis Premium Suite plugins**: Planned for direct printing in the Employee ID Cards feature.
- **DigitalOcean Spaces**: Used for object storage in production environments (S3-compatible).