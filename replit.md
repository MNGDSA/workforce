# Event Workforce Hiring Management System

## Client & Business Context

**Client**: Luxury Carts Company Ltd — operates golf cart transportation inside Masjid Al-Haram (Makkah).

**Problem**: During Ramadan and Hajj seasons, the company needs to rapidly recruit 5,000–8,000+ temporary workers. Traditional paperwork is chaotic and unscalable at this volume.

**Solution**: This app digitizes the entire seasonal hiring lifecycle — from candidate intake through onboarding to workforce management — with a dual-interface system (admin back-office + candidate self-service portal).

### Two Recruitment Tracks (Same Pipeline)

1. **Regular candidates** — recruited publicly. They find a job post URL (shared via WhatsApp groups), sign up with OTP-verified phone, fill their profile, apply to jobs, get invited to interview/training groups, get shortlisted (thumbs up/down), go through onboarding document checks, and convert to employees.

2. **SMP (Sub-Manpower Provider)** — the company contracts with external manpower firms. Cannot contact SMP workers directly — deal with their firm only. Tell the firm "we need 200 people," they provide a list. Admin bulk-uploads that list into the Talent pool. SMP workers then visit the portal to activate their profiles and upload required documents (photo + national ID only — no IBAN or contract since we deal with their company, not them individually). SMP workers can be converted to employees directly from the Talent pool, skipping interviews entirely.

### End-to-End Workflow
```
1. EVENT SETUP     → Create event bucket (e.g., "Ramadan 2026")
2. JOB POSTS       → Create public job URLs attached to event
3. SMP CONTRACTS   → Create contract with firm, link to event, bulk-upload workers
4. CANDIDATE INTAKE → Self-registration via job post OR bulk upload into Talent
5. INTERVIEW       → Create groups, select applicants, send SMS invites, shortlist (👍/👎)
6. ONBOARDING      → Admit shortlisted candidates, track document uploads, auto-status
7. CONVERSION      → All docs complete → convert to employee (individual or bulk)
8. WORKFORCE       → Active employee management, termination tracking, SMP transfers
```

### SMP-Specific Rules
- SMP contract = business agreement with manpower firm (contract name, number, dates, notes)
- SMP workers are bulk-uploaded into Talent pool, marked with SMP source + contract reference
- SMP workers only need: personal photo + national ID copy (no IBAN, no individual contract)
- SMP workers skip interview/training — pre-agreed terms with their firm
- SMP workers can be converted to employees directly from Talent (bypass onboarding pipeline)
- SMP transfers: remove from Contract A, attach to Contract B — no data loss

### Regular Candidate Document Requirements (Onboarding)
- Personal photo
- National ID / Iqama copy
- IBAN certificate
- Signed job contract (admin uploads, candidate signs)

## Overview
A full-stack event-based job hiring management platform built for Saudi Arabia operations. Designed to handle 70,000+ candidates at MAANG-scale with dual interfaces: an admin back-office and a candidate portal.

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
POST   /api/candidates/:id/documents  ← File upload (photo, nationalId, iban, resume)

GET    /api/events
POST   /api/events
PATCH  /api/events/:id
DELETE /api/events/:id

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
- **Super Admin**: ID `1000000001` / phone `0500000001` / password `password123`
- **Candidate (Faisal)**: ID `2000000002` / phone `0500000002` / password `password123`
- **Recruiter**: ID `1000000003` / phone `0500000003` / password `password123`

## Navigation Order
Dashboard → Job Posting → Events & SMP → Interview & Training → Onboarding → Workforce → Talent → Rules & Automation → Notification Center → System & Settings

## Workflow Design (Business Logic — Agreed with Client)

### Simplified Design Principle: One Pool, One Pipeline

**Every person is a candidate in the talent pool. Period.**

There are no "SMP workers" vs "individual candidates" at the pipeline level. The only difference is how they entered the system. Once in the pool, everyone follows the same pipeline, same profile requirements, same onboarding checklist.

### How People Enter the Pool

1. **Self-registration** — candidate signs up via portal, goes through OTP, fills profile
2. **Bulk upload** — admin uploads a list via the Talent section (could be SMP worker list or any other bulk source). Profiles are created. Workers activate later via OTP.

The bulk upload in Talent is **completely disconnected** from SMP contracts. Upload creates profiles. Contracts are a separate business concept.

### What is an SMP Contract?

An SMP contract is purely a **business agreement** between your company and a manpower provider. It:
- Is attached to a Season
- Links to candidates from the pool (not-yet-employees) OR existing workforce members (already employees)
- Each linked person has a status on the contract: `active` | `removed`
- Workers can be detached from one contract and attached to another (SMP transfer) without breaking anything

**The contract does NOT own candidate data.** It's just a grouping/assignment record.

### Candidate Profile (Same for Everyone)

Every candidate has the same profile and requirements regardless of how they entered:
- Personal photo, IBAN, National ID, phone, etc.
- OTP activation required for all
- Question sets only apply when attached to a job post (not required for all candidates)

### The Complete Pipeline

```
TALENT POOL (unified, permanent)
  All candidates live here with full profiles
  source field tracks origin: "self" | "bulk_upload" (for reporting only, no logic difference)
  lastInterviewedAt persists across seasons (prevents repeat interviews)

SEASON SETUP
  Create Season (e.g., Hajj 2026)
  ├── Create Job Posts → attach to Season → optionally attach Question Set
  └── Create SMP Contracts → attach to Season → pick candidates/employees to link

INTAKE
  Individual: applies to job post → application created
  SMP: workers already in pool, linked to contract

PROCESSING
  Schedule Interview & Training for individual applicants
    → "Previously interviewed" badge if lastInterviewedAt exists
    → Filter: "Hide previously interviewed" (on by default, can override)
  After interview: Shortlisted ✓ or Not Shortlisted ✗
    → Not Shortlisted = correct HR term (not "rejected")
    → Candidate returns to talent pool, can apply to future jobs
  SMP-linked candidates: skip interview/training (pre-agreed terms)

ONBOARDING (THE DIVIDING LINE — pool → employee)
  Same checklist for EVERYONE (no split logic):
    ☐ Personal Photo (pulled from candidate profile)
    ☐ IBAN Number (pulled from candidate profile)
    ☐ National ID / Iqama (pulled from candidate profile)
    ☐ Signed Contract (manual admin verification)
    ☐ Emergency Contact (pulled from candidate profile)
  All 5 complete → status = "ready" → eligible for conversion
  Each item is browsable — admin can see actual data/document from candidate profile
  Bulk convert: convert all "ready" candidates at once with shared employment details
  Candidate schema: emergencyContactName + emergencyContactPhone fields
  Profile-setup-gate Step 2 collects emergency contact during sign-up questionnaire

WORKFORCE (post-onboarding)
  Convert → creates employee record
  Status: active | terminated
  Termination: reason + date recorded
  SMP contract: option to Remove worker and attach a replacement from pool
  Candidate record always preserved for future seasons

RETURN TO POOL
  Not-shortlisted → back to pool, can reapply
  Terminated → workforce closed, candidate preserved
  SMP removed → detached from contract, candidate preserved
```

### Key Design Decisions

1. **One pool, one pipeline** — no separate tracks for SMP vs individual. Everyone is a candidate with the same profile and onboarding requirements.
2. **Bulk upload is in Talent, not in SMP contracts** — upload creates profiles, contracts are separate business groupings.
3. **SMP contract = assignment record** — links pool candidates or workforce employees to a company + season. Does not own candidate data.
4. **SMP transfers are simple** — remove from Contract A, attach to Contract B. No data loss.
5. **Deduplication** — bulk upload matches existing candidates by national ID/phone before creating new profiles.
6. **Season anchors everything** — job posts and SMP contracts both hang off a season.
7. **Sequential seasons only** — same candidate cannot be in two seasons simultaneously.
8. **`lastInterviewedAt` on candidate profile** — persists across seasons, badge + filter in interview scheduling.
9. **Application status `not_shortlisted`** — professional HR term for rejection.
10. **Source-aware onboarding** — Regular candidates: 4-item checklist (photo, IBAN, national ID, signed contract). SMP workers: 2-item checklist (photo + national ID only — no IBAN or contract since we deal with their firm).
11. **Profile activation required for all** — OTP verification regardless of entry method.

### Implementation Status

#### Completed
- [x] Onboarding document prerequisites: photo, IBAN, national ID are read-only flags driven by actual uploads (admin cannot manually toggle)
- [x] Only `hasSignedContract` is admin-toggleable (handled in-person)
- [x] Document delete from onboarding checklist with confirmation dialog
- [x] Server hardening: PATCH onboarding strips hasPhoto/hasIban/hasNationalId from request body; status is always server-computed
- [x] Dormant candidate logic: based on `lastLoginAt` > 1 year (or createdAt if never logged in)
- [x] Login stamps `lastLoginAt` on candidate record
- [x] Onboarding rejection flow with `rejectedAt`, `rejectedBy`, `rejectionReason`
- [x] Candidates query on onboarding page uses `staleTime: 0` for always-fresh data
- [x] SMP-aware onboarding: SMP workers see 2-item checklist (photo + national ID); regular candidates see 4-item checklist
- [x] Server `computeOnboardingStatus()` helper is SMP-aware — used in all 4 status computation points (upload, delete, create, patch)
- [x] SMP badge displayed on onboarding list cards
- [x] SMP info banner in checklist sheet ("SMP worker — lighter checklist")

#### Schema Changes Needed (Not Yet Implemented)
- [ ] Add `source` field to `candidates` table (`self` | `bulk_upload`, default `self`) — reporting only
- [ ] Add `lastInterviewedAt` to `candidates` table
- [ ] Rename application status `rejected` → `not_shortlisted`
- [ ] Redesign SMP contract to link to candidates/workforce by reference (pick from pool) instead of embedded employee data
- [ ] Add per-link status on SMP contract: `active` | `removed`
- [ ] Add `terminatedAt`, `terminationReason` to `workforce` table
- [ ] Bulk upload in Talent section with deduplication by national ID/phone
- [ ] SMP direct conversion from Talent pool (bypass interview + onboarding pipeline)

---

## Planned Features (Post-Testing)
- **Bilingual Input (EN/AR toggle)**: PrestaShop-style inline language switcher on text fields. A single `BilingualInput` component with an `EN | AR` pill toggle. Stores both `title` (English) and `titleAr` (Arabic) values, submits both, and the candidate portal renders the correct one based on user language preference. To be implemented after unit/system/regression/UAT/security testing is complete.
- **Employee ID Cards**: Printable ID cards generated from the app.
  - **Card format**: CR-80 standard (85.6mm × 54mm) — same as any bank/access card.
  - **Printer-agnostic approach**: Generate the card as a precisely sized HTML print layout or PDF. Works with any card printer brand (Zebra ZC300, Matica, Evolis, HID Fargo, Entrust, etc.) as long as the printer's Windows driver is installed. No vendor SDK lock-in — user selects printer from browser print dialog.
  - **Single print**: "Print ID Card" button on employee profile → opens browser print with card-sized layout.
  - **Bulk print / Multi-card PDF**: Generate a multi-page PDF (one card per page, CR-80 sized) for batch printing — e.g., 600 cards in one go, sent to the printer once.
  - **Optional future enhancement**: If a specific printer brand is locked in (e.g., Zebra), can add Zebra Browser Print SDK agent for "click-and-print" without dialog — but this is an optimization, not the default approach.

## Key Features
- **Bulk Upload**: `/api/candidates/bulk` endpoint supports up to 70,000 candidates per request, batched in groups of 1,000
- **Paginated Search**: Talent page uses server-side pagination (50/page), debounced search, multiple sort options
- **e-Signature**: Candidate portal has draw + download PDF signature using `react-signature-canvas` + `jspdf`
- **Automation Rules**: Database-backed toggleable workflows
- **Saudi-specific**: National ID, Iqama, IBAN fields, Arabic name field, nationality (Saudi/Non-Saudi)

## Integrations
- **GitHub** — Connected via Replit OAuth (connection: `conn_github_01KMCD4T6871ZX6CKTKY6BG2YA`). Repo: `https://github.com/MNGDSA/workforce`. Permissions: `repo`, `read:org`, `read:project`, `read:user`, `user:email`. Service layer: `server/github.ts`. API routes under `/api/github/*`.

## UI/UX Patterns & Gotchas
- **Tooltip info icons**: Lucide's `Info` icon already renders as a circle with an "i" inside. Do NOT wrap it in a `rounded-full border` button — this creates a double-circle effect. Use a plain unstyled button with only `text-muted-foreground hover:text-primary` classes. No border, no rounded-full, no fixed h/w on the button wrapper.

## Packages Installed
- `bcryptjs` + `@types/bcryptjs` — password hashing
- `drizzle-orm`, `drizzle-zod`, `drizzle-kit` — ORM
- `react-signature-canvas` + `@types/react-signature-canvas` — e-signature
- `jspdf` — PDF generation
- `date-fns` — date formatting
- Custom `DatePickerField` component (`client/src/components/ui/date-picker-field.tsx`) — replaces all native date inputs; supports day/month/year zoom-out navigation
- `@replit/connectors-sdk` — Replit integration proxy (GitHub OAuth calls)
- `@octokit/rest` — GitHub REST API client
