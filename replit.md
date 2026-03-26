# Seasonal Workforce Hiring Management System

## Overview
A full-stack seasonal job hiring management platform built for Saudi Arabia operations. Designed to handle 70,000+ candidates at MAANG-scale with dual interfaces: an admin back-office and a candidate portal.

## Architecture

### Stack
- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS v4 + Shadcn/UI + TanStack Query
- **Backend**: Express.js + Node.js + TypeScript
- **Database**: PostgreSQL (Drizzle ORM)
- **Auth**: bcryptjs password hashing (session-based)
- **Routing**: wouter (frontend)

### Design System
- **Theme**: Modern Industrial — dark forest green (`HSL: 155 45% 45%`)
- **Display Font**: Space Grotesk
- **Body Font**: Inter
- **Border Radius**: 0.25rem (industrial sharp)

## Project Structure

```
/
├── client/src/
│   ├── pages/           # All page components
│   │   ├── dashboard.tsx         ← Real API data
│   │   ├── talent.tsx            ← Real API + pagination (50/page)
│   │   ├── seasons.tsx           ← Real API + CRUD actions
│   │   ├── job-posting.tsx       ← Real API + CRUD actions
│   │   ├── roles-access.tsx      ← Business units, users, permissions matrix
│   │   ├── automation.tsx        ← Real API + toggle rules
│   │   ├── interviews.tsx        ← UI prototype
│   │   ├── workforce.tsx         ← UI prototype
│   │   ├── notifications.tsx     ← UI prototype
│   │   ├── settings.tsx          ← UI prototype
│   │   ├── question-sets.tsx     ← Full CRUD question set builder
│   │   ├── candidate-portal.tsx  ← With e-signature (jspdf)
│   │   └── auth-page.tsx         ← Login/Register
│   ├── components/
│   │   ├── layout.tsx            ← Sidebar navigation
│   │   └── ui/                   ← Shadcn components
│   ├── hooks/
│   │   ├── use-debounce.ts       ← For search inputs
│   │   └── use-mobile.tsx
│   └── lib/
│       └── queryClient.ts        ← API fetch + TanStack Query
├── server/
│   ├── index.ts          ← Express app entry
│   ├── routes.ts         ← All API endpoints (/api/*)
│   ├── storage.ts        ← DatabaseStorage class (implements IStorage)
│   ├── db.ts             ← Drizzle + PostgreSQL pool
│   └── seed.ts           ← Database seeder
├── shared/
│   └── schema.ts         ← Full Drizzle schema + Zod schemas + types
└── drizzle.config.ts
```

## Database Schema (MAANG-Scale)

Tables with indexes designed for 70k+ candidates:

| Table | Purpose | Key Indexes |
|-------|---------|-------------|
| `users` | Admin staff & auth | email, username |
| `candidates` | 70k+ candidate profiles | status+city, name, phone, national_id, rating |
| `seasons` | Hajj/Ramadan/events | status |
| `job_postings` | Open positions | status, season, region |
| `applications` | Candidate ↔ Job links | candidate+job (unique), status |
| `interviews` | Scheduled calls | candidate, scheduled_at, status |
| `workforce` | Hired placements | candidate, season, active |
| `automation_rules` | Workflow triggers | — |
| `notifications` | SMS/email/in-app | recipient, status, created_at |

### Candidate Table Design Decisions
- `candidate_code`: Short unique code (e.g., `C-001234`) for internal references
- `skills`, `languages`, `certifications`, `tags`: Array columns for flexible filtering
- `metadata`: JSONB for extensible attributes
- Composite index on `(status, city)` for the most common query pattern
- Bulk insert via batches of 1000 rows for 70k uploads

## API Endpoints

```
POST   /api/auth/login
POST   /api/auth/register

GET    /api/dashboard/stats

GET    /api/candidates?page=&limit=&search=&status=&city=&nationality=&sortBy=&sortOrder=
GET    /api/candidates/stats
GET    /api/candidates/:id
POST   /api/candidates
PATCH  /api/candidates/:id
DELETE /api/candidates/:id
POST   /api/candidates/bulk          ← Up to 70,000 per request

GET    /api/seasons
POST   /api/seasons
PATCH  /api/seasons/:id
DELETE /api/seasons/:id

GET    /api/jobs?status=&seasonId=
GET    /api/jobs/stats
POST   /api/jobs
PATCH  /api/jobs/:id
DELETE /api/jobs/:id

GET    /api/applications?jobId=&candidateId=&status=
GET    /api/applications/stats
POST   /api/applications
PATCH  /api/applications/:id

GET    /api/interviews?status=&candidateId=
GET    /api/interviews/stats
POST   /api/interviews
PATCH  /api/interviews/:id

GET    /api/workforce?seasonId=&isActive=
GET    /api/workforce/stats
POST   /api/workforce
PATCH  /api/workforce/:id

GET    /api/automation
POST   /api/automation
PATCH  /api/automation/:id

GET    /api/notifications?recipientId=&status=&limit=
POST   /api/notifications
PATCH  /api/notifications/:id/read
GET    /api/notifications/unread-count/:recipientId
```

## Demo Credentials
- **Admin**: `admin@workforce.sa` / `password123`
- **Candidate**: `candidate@workforce.sa` / `password123`

## Navigation Order
Dashboard → Job Posting → Seasons → Interview & Training → Onboarding → Workforce → Talent → Rules & Automation → Notification Center → System & Settings

## Workflow Design (Business Logic — Agreed with Client)

### Two Manpower Sources, One Unified Talent Pool

**Source 1: Individual Candidates** — self-register via candidate portal, apply to job posts
**Source 2: SMP Workers** — uploaded in bulk via SMP contract by manpower provider company

Every person in the system is a **candidate record** in the talent pool, regardless of source. The `source` field (`individual` | `smp`) tracks how they entered.

### Candidate Profile Activation

- **Individual**: Self-registers → OTP verification → questionnaire (if job post has one) → profile complete
- **SMP**: Profile auto-created from contract upload (basic info: name, phone, national ID) → worker must later activate via OTP → complete personal details (photo, ID) → no questionnaire (everything pre-agreed in contract)

### Season-First Flow (Season is the anchor)

```
SETUP
  Create Season (e.g., Hajj 2026)
  ├── Individual track: Create Job Posts → attach to Season → optionally attach Question Set
  └── SMP track: Create SMP Contract → attach to Season → upload worker list → auto-creates candidate profiles

INTAKE
  Individual: Candidate applies to job post → application record created
  SMP: Workers linked via contract upload (profiles pending activation)

PROCESSING (Individual only)
  Schedule Interview & Training
    → "Previously interviewed" badge shown if lastInterviewedAt exists
    → Filter toggle: "Hide previously interviewed" (on by default, can override)
  After interview: Shortlisted ✓ or Not Shortlisted ✗
    → Not Shortlisted = professional HR term for rejection
    → Candidate returns to talent pool, can apply to future jobs

PROCESSING (SMP)
  No interview, no training, no questionnaire
  Once profile activated → eligible for onboarding directly

ONBOARDING (THE DIVIDING LINE — pool → employee)
  Source-dependent checklists:
  ┌─────────────────────┬────────────┬─────┐
  │ Document            │ Individual │ SMP │
  ├─────────────────────┼────────────┼─────┤
  │ Personal Photo      │     ✓      │  ✓  │
  │ National ID / Iqama │     ✓      │  ✓  │
  │ Signed Contract     │     ✓      │  ✗  │ ← contract is at company level for SMP
  │ IBAN Certificate    │     ✓      │  ✗  │
  │ Medical Fitness     │     ✓      │  ✗  │
  │ Emergency Contact   │     ✓      │  ✗  │
  └─────────────────────┴────────────┴─────┘
  Individual: 6 items to be "ready"
  SMP: 2 items to be "ready"
  All complete → Convert to Employee (creates Workforce record)

WORKFORCE (post-onboarding)
  Active employee record
  Can be Terminated (reason + date recorded)
  SMP termination → option to Replace (new worker on same contract) or Leave Empty
  Candidate record stays in system for future seasons

RETURN TO POOL
  Not-shortlisted individuals → back to talent pool, can reapply future seasons
  Terminated workers → workforce record closed, candidate record preserved
  Replaced SMP workers → marked "replaced" on contract, candidate preserved
```

### Key Design Decisions

1. **Season anchors everything** — Job posts and SMP contracts both hang off a season. Every candidate journey traces back to one season.
2. **Sequential seasons only** — same candidate cannot be in two seasons simultaneously.
3. **`lastInterviewedAt` on candidate profile** — persists across seasons, prevents wasted repeat interviews. Admin sees badge + can filter.
4. **Application status `not_shortlisted`** — correct HR terminology for rejection (not "rejected").
5. **SMP contract worker status** — each worker on a contract has status: `active` | `replaced` | `terminated`.
6. **Onboarding `source` field** — drives which checklist (6 items vs 2 items) is enforced.
7. **SMP contract vs employee documents** — the contract is a company-level document (between client and SMP). Worker-level documents are only photo + ID.
8. **Profile activation required for all** — SMP workers must activate via OTP before they can be onboarded, same as individuals.

### Schema Changes Needed (Not Yet Implemented)

- [ ] Add `source` field to `candidates` table (`individual` | `smp`, default `individual`)
- [ ] Add `lastInterviewedAt` to `candidates` table
- [ ] Add `source` field to `onboarding` table to drive different checklists
- [ ] Rename application status `rejected` → `not_shortlisted`
- [ ] Add per-worker status to SMP contract employee list (`active` | `replaced` | `terminated`)
- [ ] Add `terminatedAt`, `terminationReason` to `workforce` table
- [ ] Make onboarding "ready" threshold dynamic (6/6 individual, 2/2 SMP)

---

## Planned Features (Post-Testing)
- **Bilingual Input (EN/AR toggle)**: PrestaShop-style inline language switcher on text fields. A single `BilingualInput` component with an `EN | AR` pill toggle. Stores both `title` (English) and `titleAr` (Arabic) values, submits both, and the candidate portal renders the correct one based on user language preference. To be implemented after unit/system/regression/UAT/security testing is complete.

## Key Features
- **Bulk Upload**: `/api/candidates/bulk` endpoint supports up to 70,000 candidates per request, batched in groups of 1,000
- **Paginated Search**: Talent page uses server-side pagination (50/page), debounced search, multiple sort options
- **e-Signature**: Candidate portal has draw + download PDF signature using `react-signature-canvas` + `jspdf`
- **Automation Rules**: Database-backed toggleable workflows
- **Saudi-specific**: National ID, Iqama, IBAN fields, Arabic name field, nationality (Saudi/Non-Saudi)

## Integrations
- **GitHub** — Connected via Replit OAuth (connection: `conn_github_01KMCD4T6871ZX6CKTKY6BG2YA`). Repo: `https://github.com/MNGDSA/workforce`. Permissions: `repo`, `read:org`, `read:project`, `read:user`, `user:email`. Service layer: `server/github.ts`. API routes under `/api/github/*`.

## Packages Installed
- `bcryptjs` + `@types/bcryptjs` — password hashing
- `drizzle-orm`, `drizzle-zod`, `drizzle-kit` — ORM
- `react-signature-canvas` + `@types/react-signature-canvas` — e-signature
- `jspdf` — PDF generation
- `date-fns` — date formatting
- `@replit/connectors-sdk` — Replit integration proxy (GitHub OAuth calls)
- `@octokit/rest` — GitHub REST API client
