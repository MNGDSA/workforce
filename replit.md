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