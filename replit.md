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

**Database Schema — Work Schedules & Shifts**:
- `shifts`: Catalog of shift types with name, start/end times, and color.
- `schedule_templates`: Weekly patterns linking each day-of-week to an optional shift. Optionally linked to an event.
- `schedule_assignments`: Employee → template assignments with date ranges, supporting history. Overlap-prevention on create (ends current assignment before creating a new one).
- `attendance_records`: One row per employee per date with status (present/absent/late/half_day/excused), clock-in/out times, source, and unique constraint on (workforceId, date).

**Core Workflow & Features**:
- **Unified Talent Pool**: All individuals are candidates in a single pool, differentiated by source (`self` or `bulk_upload`).
- **End-to-End Workflow**: Covers event setup, job postings, SMP contracts, candidate intake, interviews, onboarding, conversion to employee, workforce management, and work schedule/attendance tracking.
- **Work Schedules & Shifts**: New module under `/schedules` (sidebar: Workforce section). Supports shift definitions (name, times, color), weekly schedule templates, employee roster grid (assign/reassign/end), daily attendance marking (Present/Absent/Late/Half Day/Excused), and summary worked-day totals. Employee detail dialog includes a Schedule tab for inline assignment and history. Employee portal read-only endpoint available at `/api/portal/schedule/:workforceId`.
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

---

## DigitalOcean PreProd / Production Deployment Notes

> Full source: `attached_assets/DO-Deployment-Guide_1775338207310.md` — read it when deployment time comes.

### Architecture
```
Replit (Dev) → GitHub (main branch) → DO App Platform
                                          ├── Web Service (Express serves API + Vite static build)
                                          ├── Managed PostgreSQL
                                          └── DO Spaces (object storage, S3-compatible)
```
Push to `github main` → triggers auto-redeploy on DO.

### GitHub Push Protocol (from Replit)
The remote is named **`github`**, not `origin`. The integration token expires — always refresh before pushing:
```javascript
// Run in code_execution sandbox:
const conns = await listConnections('github');
const token = conns[0].settings.access_token;
// Then: git remote set-url github https://x-access-token:{token}@github.com/ORG/REPO.git
// Then: git push github main
```

### #1 Blocker — SSL Fix for DO Managed PostgreSQL
DO injects `DATABASE_URL` with `?sslmode=require`. The `pg` driver interprets this as `verify-full` and throws `self-signed certificate in certificate chain`. Fix in both `server/db.ts` and `drizzle.config.ts`:
```typescript
function getConnectionString() {
  const url = process.env.DATABASE_URL || "";
  return url.replace(/[\?&]sslmode=[^&]*/, "").replace(/\?$/, "");
}
// In Pool / dbCredentials:
ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
```

### Express Requirements for DO
- Must read `PORT` from env: `const port = parseInt(process.env.PORT || "8080");`
- Must serve the Vite build and provide SPA fallback:
```typescript
app.use(express.static(path.join(__dirname, "../public")));
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) res.sendFile(path.join(__dirname, "../public/index.html"));
});
```

### File Storage: Replit Object Storage → DO Spaces
Replit's `DEFAULT_OBJECT_STORAGE_BUCKET_ID` does not exist on DO. Replace with **DO Spaces** (S3-compatible, use `@aws-sdk/client-s3`). Abstract the storage layer via env var — dev uses Replit, prod uses Spaces. **CORS on the Space is mandatory** or browser downloads will fail.

Required DO Spaces env vars: `SPACES_ENDPOINT`, `SPACES_BUCKET`, `SPACES_KEY`, `SPACES_SECRET`, `SPACES_REGION`.

### Required Environment Variables on DO
| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Auto-injected if DB attached — must apply SSL fix above |
| `NODE_ENV` | Set to `production` |
| `SESSION_SECRET` | 64-char random hex — set permanently, never rotate or sessions break on each deploy |
| `PORT` | Auto-injected by DO — app must read from env |
| `SPACES_*` (5 vars) | DO Spaces credentials |
| All SMS/API keys | Copy from Replit secrets |

## Audit Log System

A comprehensive audit trail capturing every significant backoffice action.

**Database**: `audit_logs` table with columns: `id`, `actorId`, `actorName`, `action`, `entityType`, `entityId`, `employeeNumber`, `subjectName`, `description`, `metadata` (JSONB), `createdAt`.

**Instrumented Actions**:
- `onboarding.admit` — Candidate admitted to onboarding
- `workforce.converted` — Single convert to employee
- `workforce.bulk_converted` — Bulk convert
- `workforce.updated` — Employee field update (with field-level diff: salary from/to, status, notes, event, end date, performance)
- `workforce.bulk_updated` — Excel bulk update
- `workforce.terminated` — Employee termination (with reason)
- `workforce.reinstated` — Employee reinstatement
- `attendance.corrected` — Manual attendance correction
- `assets.assigned` / `assets.returned` / `assets.updated` — Asset lifecycle
- `schedule.assigned` — Schedule template assignment

**API**: `GET /api/audit-logs` with pagination (`page`, `limit`), `search`, `entityType`, `actorId` filters.

**Frontend**: `/audit-log` page in sidebar under Reports section — activity feed with actor avatar, action badge, description, employee number chip, timestamp, entity-type filter tabs, full-text search, and pagination.

**Helper**: `logAudit(req, params)` async function in routes.ts — fire-and-forget (never breaks main operation on failure). Resolves actor name via `storage.getUser(actorId)`.

Generate SESSION_SECRET: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

### Public Routes Must Come Before Auth Middleware
Candidate portal and public job listings must be registered before `requireAuth` or unauthenticated users are blocked.

### Session Cookie Settings for HTTPS
```typescript
cookie: { secure: true, httpOnly: true, sameSite: "lax", maxAge: 86400000 }
```

### Startup Schema Safety Net
Alongside `drizzle-kit push` at build time, add an `ensureTables()` function running raw `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` before `app.listen()`. Guards against schema drift without requiring manual migrations.

### Debugging on DO
Check **Runtime Logs** first — most failures (SSL, missing env vars, port) happen at startup, not at build time. Build Logs only show compile/install errors.

### Key Lessons (from the full guide)
1. SSL strip is mandatory — `rejectUnauthorized: false` in production
2. `SESSION_SECRET` must be permanent — sessions break on every redeploy otherwise
3. Replit Object Storage ≠ DO Spaces — abstract the storage layer before deploying
4. Remote is named `github` not `origin` — always refresh the token before pushing
5. Read `PORT` from env — hardcoded ports prevent DO from routing traffic
6. Public routes must be registered before auth middleware
7. Check Runtime Logs first, not Build Logs
8. Add `ensureTables()` startup safety net alongside Drizzle push