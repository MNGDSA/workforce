# Event Workforce Hiring Management System

## Overview
This project is a full-stack event-based job hiring management platform designed for Saudi Arabia operations, capable of handling 70,000+ candidates at MAANG-scale. It features a dual-interface system: an admin back-office and a candidate self-service portal. The primary purpose is to digitize and streamline the entire event-based hiring lifecycle, from candidate intake and onboarding to workforce management, particularly for high-volume recruitment during events like Ramadan and Hajj. The system aims to replace chaotic traditional paperwork with an efficient, scalable digital solution.

The system supports two recruitment tracks: regular candidates applying publicly and Sub-Manpower Provider (SMP) workers whose details are bulk-uploaded by their firms. A key design principle is a unified talent pool and pipeline, treating all individuals as candidates regardless of their entry method, with SMP contracts serving as business agreements rather than separate talent pipelines.

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
- Built with React 19, Vite, TypeScript, Tailwind CSS v4, Shadcn/UI, and TanStack Query.
- Utilizes `wouter` for client-side routing.
- **Design System**: "Modern Industrial" theme with a dark forest green (`HSL: 155 45% 45%`).
  - Display Font: Space Grotesk
  - Body Font: Inter
  - Border Radius: 0.25rem (industrial sharp)
- **UI/UX Decisions**: Emphasizes a consistent design, with specific patterns for modals and tooltips using portals to prevent clipping issues.

**Backend**:
- Powered by Express.js and Node.js with TypeScript.
- Handles API endpoints, authentication, and business logic.

**Database**:
- PostgreSQL, managed with Drizzle ORM.
- **Schema Design**: Tables are optimized for MAANG-scale with appropriate indexing for 70,000+ candidates. Key tables include `users`, `candidates`, `events`, `job_postings`, `applications`, `interviews`, `workforce`, `smp_contracts`, `automation_rules`, `notifications`, and tables for ID card management.
- **Candidate Table Decisions**: Candidates are primarily identified by `national_id`. `skills`, `languages`, `certifications`, `tags` are array columns. `metadata` uses JSONB for extensibility. Composite indexes are used for common query patterns. Bulk inserts are batched for performance.
- **Data Integrity Policy**: Strict policy against `onConflictDoNothing()` to ensure explicit handling of duplicates and uniqueness validation for business keys.
- **Soft Delete Policy**: Events and Candidates are never hard-deleted; instead, `archivedAt` timestamps are used for soft deletion, preserving all linked records.

**Authentication**:
- Session-based authentication using `bcryptjs` for password hashing.

**Core Workflow & Features**:
- **Unified Talent Pool**: All individuals are candidates in a single pool, differentiated by source (`self` or `bulk_upload`).
- **End-to-End Workflow**: Covers event setup, job postings, SMP contracts, candidate intake, interviews, onboarding, conversion to employee, and workforce management.
- **SMP-Specifics**: SMP workers are bulk-uploaded and skip interviews, requiring a lighter onboarding checklist (photo + national ID only). SMP contracts are assignment records, not data owners.
- **Onboarding Pipeline**: A phased approach for document verification and contract signing, ensuring all prerequisites are met before conversion to employee.
- **Contract Engine**: Automated contract generation and digital signing system with template management, variable injection, and PDF rendering using `jspdf`. Supports versioning and branding.
- **Profile Completeness**: Server-side validation ensures required fields are completed before a profile is marked complete.
- **Automation Rules**: Database-backed toggleable workflows for various processes.
- **Saudi-Specific Features**: Includes fields for National ID, Iqama, IBAN, Arabic names, and nationality (Saudi/Non-Saudi).
- **Planned Features**: Bilingual input (EN/AR), Employee ID Cards with a template engine, Mobile Attendance App (React Native with facial recognition and offline-first capabilities), Asset Management (tracking assignable assets and deductions), and an Employee Portal that flips from the candidate portal upon conversion.

## External Dependencies

- **GitHub**: Integrated via Replit OAuth using `@replit/connectors-sdk` and `@octokit/rest` for repository interactions.
- **PostgreSQL**: The primary database for all persistent data storage.
- **AWS Rekognition or Azure Face API**: Planned for the Mobile Attendance App for facial recognition and liveness detection.
- **Zebra Browser Print SDK and Evolis Premium Suite plugins**: Planned for direct printing capabilities within the Employee ID Cards feature.