# Event Workforce Hiring Management System

## Client & Business Context

**Client**: Luxury Carts Company Ltd — operates golf cart transportation inside Masjid Al-Haram (Makkah).

**Problem**: During Ramadan and Hajj events, the company needs to rapidly recruit 5,000–8,000+ temporary workers. Traditional paperwork is chaotic and unscalable at this volume.

**Solution**: This app digitizes the entire event-based hiring lifecycle — from candidate intake through onboarding to workforce management — with a dual-interface system (admin back-office + candidate self-service portal).

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
│   │   ├── events.tsx            ← Events-only management (CRUD)
│   │   ├── smp-contracts.tsx     ← SMP Contracts management (separate page)
│   │   ├── job-posting.tsx       ← Real API + CRUD actions + event filter
│   │   ├── roles-access.tsx      ← Business units, users, permissions matrix
│   │   ├── automation.tsx        ← Real API + toggle rules
│   │   ├── interviews.tsx        ← UI prototype
│   │   ├── workforce.tsx         ← Employee mgmt + ID card printing
│   │   ├── id-cards.tsx          ← Template designer, printer plugins, print audit
│   │   ├── notifications.tsx     ← UI prototype
│   │   ├── settings.tsx          ← UI prototype
│   │   ├── question-sets.tsx     ← Full CRUD question set builder
│   │   ├── candidate-portal.tsx  ← Contract preview + digital signing
│   │   └── auth-page.tsx         ← Login/Register
│   ├── components/
│   │   ├── layout.tsx            ← Sidebar navigation
│   │   └── ui/                   ← Shadcn components
│   ├── hooks/
│   │   ├── use-debounce.ts       ← For search inputs
│   │   └── use-mobile.tsx
│   └── lib/
│       ├── queryClient.ts        ← API fetch + TanStack Query
│       └── id-card-renderer.ts   ← CR-80 card rendering engine
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
| `events` | Hajj/Ramadan/events | status |
| `job_postings` | Open positions | status, event, region |
| `applications` | Candidate ↔ Job links | candidate+job (unique), status |
| `interviews` | Scheduled calls | candidate, scheduled_at, status |
| `workforce` | Employee records | employee_number (C000001), candidate, event, salary, active |
| `id_card_templates` | Card template designs | event_id, is_active |
| `printer_plugins` | Printer integrations (Zebra, etc.) | is_active |
| `id_card_print_logs` | Print audit trail | employee_id, template_id, printed_at |
| `automation_rules` | Workflow triggers | — |
| `notifications` | SMS/email/in-app | recipient, status, created_at |
| `id_card_templates` | Card design templates | event_id, is_active |
| `printer_plugins` | Printer integrations (Zebra etc.) | is_active |
| `id_card_print_logs` | Print audit log | employee_id, printed_by, printed_at |

### Candidate Table Design Decisions
- Candidates are identified primarily by their `national_id` (no candidate code)
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

GET    /api/jobs?status=&eventId=
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

GET    /api/workforce?eventId=&isActive=&search=
GET    /api/workforce/stats
GET    /api/workforce/history/:nationalId
GET    /api/workforce/by-candidate/:candidateId
GET    /api/workforce/:id
POST   /api/workforce
PATCH  /api/workforce/:id
POST   /api/workforce/:id/terminate
POST   /api/workforce/reinstate

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
**Recruitment**: Events → SMP Contracts → Question Sets → Job Applications → Interview & Training → Onboarding → Talent
**Management**: Dashboard → Workforce → Payroll
**System**: Rules & Automation → Documentation

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
- Is attached to an Event
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
  lastInterviewedAt persists across events (prevents repeat interviews)

EVENT SETUP
  Create Event (e.g., Hajj 2026)
  ├── Create Job Posts → attach to Event → optionally attach Question Set
  └── Create SMP Contracts → attach to Event → pick candidates/employees to link

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
  Convert → creates employee record, candidate.status → "hired"
  Status: active | terminated
  Termination: reason + date recorded, candidate.status → "active" (returns to talent pool)
  Reinstatement: reuses previous employee number, candidate.status → "hired"
  SMP contract: option to Remove worker and attach a replacement from pool
  Candidate record always preserved for future events

PORTAL SWITCHING (candidate-portal.tsx)
  candidate.status = "active" → Candidate Portal (job opportunities, applications)
  candidate.status = "hired"  → Employee Portal (employment details, salary, employee #)
  Termination reverts to Candidate Portal automatically
  Profile data stays in candidates table (single source of truth) across all transitions
  Workforce record fetched via /api/workforce/by-candidate/:candidateId

RETURN TO POOL
  Not-shortlisted → back to pool, can reapply
  Terminated → workforce closed, candidate.status → "active", candidate preserved
  SMP removed → detached from contract, candidate preserved
```

### Key Design Decisions

1. **One pool, one pipeline** — no separate tracks for SMP vs individual. Everyone is a candidate with the same profile and onboarding requirements.
2. **Bulk upload is in Talent, not in SMP contracts** — upload creates profiles, contracts are separate business groupings.
3. **SMP contract = assignment record** — links pool candidates or workforce employees to a company + event. Does not own candidate data.
4. **SMP transfers are simple** — remove from Contract A, attach to Contract B. No data loss.
5. **Deduplication** — bulk upload matches existing candidates by national ID/phone before creating new profiles.
6. **Event anchors everything** — job posts (`eventId` required/non-null) and SMP contracts both hang off an event. Job types: `seasonal_full_time` and `seasonal_part_time`.
7. **Sequential events only** — same candidate cannot be in two events simultaneously.
8. **`lastInterviewedAt` on candidate profile** — persists across events, badge + filter in interview scheduling.
9. **Application status `not_shortlisted`** — professional HR term for rejection.
10. **Source-aware onboarding** — Regular candidates: 4-item checklist (photo, IBAN, national ID, signed contract). SMP workers: 2-item checklist (photo + national ID only — no IBAN or contract since we deal with their firm).
11. **Profile activation required for all** — OTP verification regardless of entry method.
12. **Auto event tagging (PLANNED)** — When a candidate's signed contract onboarding item is marked complete, the system auto-appends an event tag (e.g. `"event:Hajj 2026"`) to the candidate profile `tags` array. Threshold is signed contract, not tenure — even one day of work qualifies. This enables instant "returning worker" identification in future seasons. Uses existing `tags` text array on candidates table.

---

### SMP Workflow Redesign (PLANNED — subject to adjustment before coding)

**Full SMP lifecycle flow:**
1. Create SMP contract first — contract is the anchor (company, contract number, dates, event).
2. Upload workers to Talent specifying a contract — no uploading SMP workers without selecting a contract. All created candidates get `source: "smp"` + `smpContractId` automatically.
3. SMS activation — send OTP to activate profiles. Workers who don't activate are marked inactive; no further pipeline actions allowed on them.
4. Express hiring scoped to one contract at a time — UI shows contract selector at top, filters worker list to only that contract's candidates. No cross-contract bulk actions.
5. Onboarding — SMP workers: 2-item checklist (photo + national ID only). Already designed and implemented.
6. Convert to employee — event is pre-filled from their SMP contract's `eventId` (admin can override).
7. Event ends — to keep a worker for the next event, update their workforce `eventId` to the new event. To release, trigger offboarding (section TBD). The `smpContractId` on candidate profile stays unchanged.
8. SMP Settlements (new section) — groups payments by contract/company, not by individual. Worker data (dailyRate × daysWorked) feeds into it; output is an invoice-style settlement to the SMP firm.

**Schema changes needed:**
- Add `smpContractId` FK on `candidates` table (replace loose JSON blob in `smpContracts.employees`)
- Add `eventId` on `smpContracts` table
- Add `dailyRate` + `rateType` (daily/monthly) on `workforce` table
- New SMP Settlements section (separate from regular payroll)
- Offboarding section (to be defined)

---

### Individual Candidate Lifecycle (PLANNED)

14-step flow for regular (non-SMP) candidates:
1. Self-register via portal
2. Complete profile
3. Apply to open jobs
4. Event must exist first as pre-requisite (annual operations event for long-stay employees; seasonal events for short-stay)
5. Admin reviews appliers per job post
6. Bulk invite to interview/training groups (capacity-based, e.g. 1000 per group per venue)
7. Thumbs up/down shortlisting at interview — or record on Excel for later office entry
8. Onboarding with automated SMS reminders every 12 hours for 5 days for missing documents; auto-push back to Talent if unresponsive; manual push-back button also available
9. Contract template with variables (name, phone, ID) generated per candidate after docs complete
10. 5-day signing window — if unsigned, auto-push back to interview shortlist or Talent
11. Convert to employee, issue Employee ID
12. Event ends → auto-move linked employees to Offboarding
13. Offboarding: asset return or payroll deduction; SMS warnings for 7 days
14. Payroll scoped per event with deductibles; handed off to finance for deposits

**Scheduler-dependent features (require background job infrastructure):**
- Step 8: SMS reminders every 12 hours for 5 days
- Step 10: 5-day contract signing window + auto-expiry
- Step 12: Auto-offboarding trigger on event end
- Step 13: 7-day SMS warning cycle

**Pending design decisions:**
- Annual operations event type vs seasonal event type (employees who work year-round should not auto-offboard)
- Default sort order for bulk interview selection (application date? rating? profile completeness?)
- Asset tracking table design (categories, serial numbers, issuer, issue date)
- Finance handoff format (export PDF/Excel or system integration?)

---

### Mobile Attendance App (PLANNED — separate React Native project)

**Facial recognition approach:**
- Native Face ID / Samsung biometrics cannot be used for custom server-side photo comparison (Apple/Samsung lock hardware biometrics to device auth only)
- Use AWS Rekognition or Azure Face API: 99%+ accuracy, built-in liveness detection (prevents spoofing with photos/screens), server-side comparison
- Current system's 65% client-side similarity threshold with no liveness detection is the root problem to fix

**Offline-first attendance with encrypted ledger:**
- Attendance is written to an encrypted local ledger on the device at the moment of clock-in/out (timestamp captured on device, not server)
- Ledger syncs to server when connectivity is restored, in chronological order
- Server enforces duplicate detection (idempotent sync — same record sent twice is safe)
- Ledger is permanent on device (not cleared after sync) — enables dispute resolution by comparing device ledger vs server record
- Encryption key tied to employee's authenticated session — stolen device cannot be read without login
- Sync-age warning triggers after 24 hours without a successful sync (alerts employee or supervisor before records are at risk)
- Factory reset / lost device risk acknowledged: offline records are unrecoverable if device is lost before sync

---

### Asset Management (PLANNED)

**Concept:** A catalogue of physical assets that can be assigned to employees, with monetary values attached. Upon offboarding, employees either return the asset or the value is deducted from their payment (individuals) or from the SMP settlement (SMP workers).

**Asset Catalogue (admin-defined):**
- Admin creates asset types with a name and a monetary value (e.g. Uniform = 100 SR, Radio = 50 SR, Access Badge = 25 SR)
- Assets are reusable definitions — not tied to a specific employee until assigned

**Asset Assignment:**
- At any point during employment (typically at onboarding or start of event), one or more assets are assigned to an employee
- Each assignment records: asset type, value at time of assignment, assigned date, assigned by (admin user)
- An employee can have multiple assets assigned simultaneously

**Offboarding Resolution:**
- When an employee enters offboarding, their assigned assets appear as a checklist
- For each asset, the admin marks: Returned or Not Returned
- Not-returned assets are flagged as deductions
- For individual employees: deduction applied to their final payroll calculation
- For SMP workers: deduction applied to the SMP company settlement for that contract

**Schema needed:**
- `assets` table: id, name, description, value (decimal), category, isActive, createdAt
- `employeeAssets` table: id, workforceId (FK), assetId (FK), assignedAt, assignedBy (FK → users), returnedAt (nullable), isReturned (boolean), deductionApplied (boolean), notes

**Work Schedule section (to be built in web app first):**
- Shift assignment per employee
- Workday calendar (weekly/monthly view)
- Attendance tracking tied to events
- Lives under the Workforce module


  ---

  ### Employee Portal — Candidate-to-Employee Portal Flip (PLANNED — build before Work Schedules)

  **Concept:** When a candidate is converted to an employee (workforce record created), their login portal should flip from the candidate-facing view to an employee-facing view. The same login credentials are used — the portal detects the user's status and renders accordingly.

  **Candidate portal shows:** Profile completion, job applications, onboarding checklist, document uploads.

  **Employee portal shows (to be defined together):** Shift and schedule (fed from Work Schedules module), employment details, attendance history, payroll summary, assets assigned, and other sections to be defined.

  **Key rule:** Task #5 (Work Schedules & Shifts) must be built AFTER the employee portal flip is complete. Task #5 delivers the schedule API endpoint that the employee portal will consume, but the employee portal UI for displaying shift info belongs to this portal flip task.

  **Dependency order:** Employee Portal Flip → Work Schedules & Shifts (Task #5)
  
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
- [x] Add `terminationReason`, `endDate` to `workforce` table + employee management with work history
- [ ] Bulk upload in Talent section with deduplication by national ID/phone
- [ ] SMP direct conversion from Talent pool (bypass interview + onboarding pipeline)

---

## Contract Engine (Planned)

The Contract Engine handles automated contract generation and digital signing for onboarding at scale (5,000–8,000+ candidates in 3 weeks).

### Architecture

1. **Document Upload Checklist (Candidate Self-Service)**
   - Candidate portal shows required document slots: ID copy, photo, IBAN proof, medical fitness, etc.
   - Each slot has status: `missing` → `uploaded` → `approved` / `rejected` (by recruiter)
   - Candidates see their progress; recruiters review and flag issues in bulk

2. **Contract Template System (Admin-Managed)**
   - Admin creates one contract template per job/event with placeholders: `{{fullName}}`, `{{nationalId}}`, `{{position}}`, `{{dailyRate}}`, `{{startDate}}`, `{{endDate}}`, etc.
   - System auto-generates a personalized PDF contract for each shortlisted candidate by pulling their data from the database
   - No manual data entry — one template serves all 8,000 candidates

3. **Digital Contract Signing (E-Signature)**
   - Candidate logs into portal, sees their generated contract as a PDF preview
   - Reviews articles, terms, and personal details
   - Clicks "I Agree & Sign" — system records digital consent with timestamp, IP, and user ID
   - Signed copy (with digital signature stamp on PDF) stored and downloadable by both candidate and admin
   - Legally valid under Saudi Arabia's Electronic Transactions Law (Royal Decree M/18)

4. **Admin Monitoring Dashboard**
   - Documents pipeline: how many uploaded all docs, incomplete, need review
   - Contracts pipeline: how many generated, signed, pending
   - Bulk actions: send SMS reminders to candidates who haven't completed docs or signed
   - Real-time progress tracking across the entire onboarding cohort

### Implementation Order
1. Document upload checklist for candidate portal
2. Contract template system with PDF generation
3. Digital e-signature flow with legal compliance
4. Admin monitoring dashboard for onboarding pipeline

### Phased Onboarding Pipeline
The onboarding checklist becomes a sequential pipeline instead of a flat list:
```
[Phase 1: Documents] ──→ [Phase 2: Contract] ──→ [Phase 3: Ready]
```
- **Phase 1 — Document Verification**: Candidate uploads docs → recruiter reviews each: Approve or Reject (with reason) → rejected items trigger re-upload notification. ALL required documents must be approved before Phase 2 unlocks.
- **Phase 2 — Contract Signing**: Locked until Phase 1 complete. System auto-generates personalized contract from template. Candidate sees contract in portal and signs digitally. Admin sees signing status.
- **Phase 3 — Ready for Conversion**: Auto-completes when Phase 1 + Phase 2 done. Eligible for bulk conversion to employee.
- Recruiter dashboard groups candidates by phase for bottleneck visibility.

### Technical Approach — Contract Generation
- **Template storage**: Structured data in DB (not Word/DOCX). JSONB array of articles, each with title + body text containing `{{variable}}` placeholders.
- **Variable injection**: System pulls candidate data from DB and replaces all `{{variables}}` with actual values at render time.
- **PDF rendering**: `jspdf` (already installed) — lightweight, server-side, zero external dependencies.
- **No Word/DOCX**: Avoids heavy rendering engines, formatting inconsistencies, and external dependencies.

### Available Template Variables (Auto-Populated)
| Variable | Source |
|---|---|
| `{{fullName}}` | candidate.fullName |
| `{{nationalId}}` | candidate.nationalId |
| `{{phone}}` | candidate.phone |
| `{{iban}}` | candidate.ibanNumber |
| `{{position}}` | jobPosting.title |
| `{{dailyRate}}` | jobPosting.salary or contract-specific |
| `{{startDate}}` / `{{endDate}}` | event dates |
| `{{eventName}}` | event.name |
| `{{contractDate}}` | today's date (generation date) |

### New Database Tables
- **`contract_templates`** — id, name, eventId, articles (JSONB array of `{title, body}`), variables list, createdBy, createdAt
- **`candidate_contracts`** — id, candidateId, templateId, status (`generated` | `sent` | `signed`), signedAt, signedIp, pdfPath, createdAt

### Contract Versioning (Immutable Signed Contracts)
- **Signed contracts are immutable.** Once signed, the contract content is frozen — no retroactive changes.
- **Template versioning**: Editing a template creates a new version (v1 → v2). Old version is preserved and locked.
- **Who gets what on update**:
  - Already signed v1 → contract stays as-is, record shows "Signed (v1)"
  - Haven't signed yet (pending) → pending contract auto-replaced with new version
  - Not yet generated → get latest version when contract is generated
- **Re-sign flow** (rare, explicit admin action): "Request Re-sign" resets signed candidates to pending on new version + sends SMS notification. Never automatic.
- **Admin visibility**: Breakdown per version — how many signed, how many pending per version.
- **DB**: `contract_templates` gets `version` (integer) + `parentTemplateId` (links version chain). `candidate_contracts` always points to exact template version signed.

### Contract Template Branding (Logo + Header)
- Template form includes: **logo upload** (image file), company name / header text, articles list, footer text (optional — legal disclaimers, stamp area)
- Logo stored as file (like candidate documents)
- `jspdf` renders logo at top of every generated PDF (top-left or top-center), company name beside it, articles flow below
- One logo per template — different events/entities can have different branding

### UI Layout (No New Pages)
- **Onboarding page gets two tabs**: `[Onboarding Pipeline]` and `[Contract Templates]`
- **Tab 1 — Pipeline**: Existing candidate list upgraded with 3-phase progress bar per card (Documents → Contract → Ready). Checklist side-sheet shows phased view with approve/reject per document, locked contract phase until docs approved, auto-ready when both complete.
- **Tab 2 — Contract Templates**: List of templates with "Create Template" button (same pattern as Question Sets page). Create/edit form: name, linked event, logo upload, articles builder, variable placeholders. Preview renders sample PDF with dummy data.
- **Candidate portal**: New "Your Employment Contract" section — Preview Contract button (PDF viewer), "I Agree & Sign" button with confirmation checkbox, download signed copy after signing.
- **No new sidebar items. No new pages.**

### Key Design Decisions
- Template-driven: one template → thousands of personalized contracts
- Self-service: candidates do their own uploads and signing from their phones
- Admin role: monitor dashboard, send reminders, review edge cases
- SMP workers: lighter checklist (photo + national ID only), no individual contract (firm-level agreement)
- Legal: compliant with Saudi Electronic Transactions Law (Royal Decree M/18)
- Signed contracts immutable — versioning for updates, explicit re-sign for critical changes

## Planned Features (Post-Testing)
- **Bilingual Input (EN/AR toggle)**: PrestaShop-style inline language switcher on text fields. A single `BilingualInput` component with an `EN | AR` pill toggle. Stores both `title` (English) and `titleAr` (Arabic) values, submits both, and the candidate portal renders the correct one based on user language preference. To be implemented after unit/system/regression/UAT/security testing is complete.
- **Employee ID Cards**: Full ID card design and print engine.
  - **Template engine**: Upload predesigned card backgrounds (PNG/JPG), then position data fields (photo, name, employee number, etc.) onto the card via drag-and-drop in an interactive canvas editor. Fields can be moved, resized, and styled (font size, weight, color) individually.
  - **Card format**: CR-80 standard (85.6mm × 54mm) — horizontal or vertical orientation. Front side only.
  - **Printer-agnostic**: Works with any card printer via browser print dialog. Optional Zebra Browser Print SDK and Evolis Premium Suite plugins for direct printing.
  - **Field placements**: Stored per-template in `layoutConfig.fieldPlacements`. Each field has x, y, width, height, fontSize, fontColor, fontWeight, and visibility.
  - **Dialog layout**: Cancel/Save buttons are pinned to the dialog footer (outside scrollable area) for consistent accessibility.
  - **Bulk/single print**: Print from employee profile or bulk-select from Workforce page.

## Key Features
- **Bulk Upload**: `/api/candidates/bulk` endpoint supports up to 70,000 candidates per request, batched in groups of 1,000
- **Paginated Search**: Talent page uses server-side pagination (50/page), debounced search, multiple sort options
- **e-Signature**: Candidate portal has draw + download PDF signature using `react-signature-canvas` + `jspdf`
- **Automation Rules**: Database-backed toggleable workflows
- **Saudi-specific**: National ID, Iqama, IBAN fields, Arabic name field, nationality (Saudi/Non-Saudi)
- **User↔Candidate Link**: `candidates.userId` FK → `users.id`. This is the primary link between auth accounts and candidate profiles. `nationalId` is kept as a data field but is NOT used as the join key. Login resolves candidate via `getCandidateByUserId(user.id)` with fallback to `getCandidateByNationalId` for legacy records. Registration stores `userId` on the candidate at creation time.

## Integrations
- **GitHub** — Connected via Replit OAuth (connection: `conn_github_01KMCD4T6871ZX6CKTKY6BG2YA`). Repo: `https://github.com/MNGDSA/workforce`. Permissions: `repo`, `read:org`, `read:project`, `read:user`, `user:email`. Service layer: `server/github.ts`. API routes under `/api/github/*`.

## UI/UX Patterns & Gotchas

### Portal Pattern for Dropdowns & Tooltips (MANDATORY)
Any floating UI rendered inside a dialog, table, card, or any container with `overflow: hidden/auto/scroll` MUST use `createPortal(... , document.body)` with `position: fixed` + `z-index: 9999`. Otherwise it WILL get clipped.

**DatePickerField** (`client/src/components/ui/date-picker-field.tsx`):
- Already fixed. Calendar dropdown renders via `createPortal` to `document.body` with fixed positioning calculated from `buttonRef.getBoundingClientRect()`.
- The portal div has `data-datepicker-portal` attribute and `style={{ pointerEvents: "auto" }}` to override Radix Dialog's body-level `pointer-events: none` on modal dialogs.
- The Dialog component (`client/src/components/ui/dialog.tsx`) globally intercepts `onPointerDownOutside` and `onInteractOutside` — if the click target is inside `[data-datepicker-portal]`, it calls `e.preventDefault()` to prevent dialog dismissal. This is applied AFTER `{...props}` spread so it always wins.

**InfoTooltip** (used in events.tsx, roles-access.tsx, and anywhere else):
- Must use `createPortal` to render the tooltip popup to `document.body` with `position: fixed`.
- Position is calculated from `btnRef.current.getBoundingClientRect()` on `mouseEnter`.
- Use `pointer-events-none` on the tooltip popup so it doesn't interfere with hover state.
- Do NOT use `position: absolute` with a `relative` parent — this gets clipped by table/card overflow.

**General rule**: If it floats (dropdown, tooltip, popover, autocomplete), it MUST portal to `document.body` with fixed positioning. No exceptions.

### Tooltip Info Icons
- Lucide's `Info` icon already renders as a circle with an "i" inside. Do NOT wrap it in a `rounded-full border` button — this creates a double-circle effect. Use a plain unstyled button with only `text-muted-foreground hover:text-primary` classes. No border, no rounded-full, no fixed h/w on the button wrapper.

## Data Integrity Policy (GLOBAL)
- **NEVER use `onConflictDoNothing()`** in production code. Duplicates must be caught, reported, and surfaced to the user — never silently swallowed.
- All insert paths (single and bulk) must validate uniqueness of business keys (nationalId, phone, email, contract numbers, etc.) BEFORE inserting and return explicit 409 errors.
- Bulk uploads pre-check against the DB AND within the batch itself, return HTTP 207 with a `duplicates` array listing row number + reason.
- `seed.ts` is the only place `onConflictDoNothing()` is acceptable (idempotent dev seeding).

## Event Archival (Soft Delete) Policy
- **Events are NEVER hard-deleted.** All "delete" operations replaced with soft-delete via `archivedAt` timestamp.
- Archived events are hidden from all active listings by default — but preserved with all linked records (job postings, SMP contracts, interviews, onboarding, workforce, contract templates).
- Routes: `POST /api/events/:id/archive`, `POST /api/events/:id/unarchive`. Query: `GET /api/events?archived=true` to include archived.
- Frontend: "Archive" button (amber) in per-row dropdown. "Show Archived" toggle in filter bar reveals archived events with "Restore" option.
- Events query filters with `isNull(archivedAt)` by default.

## Candidate Archival (Soft Delete) Policy
- **Candidates are NEVER hard-deleted.** All "delete" operations are soft-delete via `archivedAt` timestamp.
- Archived candidates are hidden from all active listings, searches, and stats — but their data and all linked records (applications, interviews, onboarding, workforce) are fully preserved.
- Routes: `POST /api/candidates/:id/archive`, `POST /api/candidates/:id/unarchive`. Bulk: `POST /api/candidates/bulk-action` with `action: "archive"`.
- Frontend: "Archive" button (amber) in per-row dropdown + bulk action bar. "Archived" status filter shows archived candidates with "Restore" option.
- All candidate queries (`getCandidates`, `getCandidateStats`, `getCandidateByPhone`, `getCandidateByNationalId`, `getDashboardStats`) filter with `isNull(archivedAt)` by default. Pass `archived=true` query param to view archived.

## Profile Completeness Validation (Server-Side)
- `profileCompleted: true` is **enforced server-side** — the PATCH endpoint and bulk upload both validate required fields before accepting.
- `validateProfileCompleteness()` helper in `server/routes.ts` checks: Full Name, DOB, Gender, Nationality, City, Marital Status, Education Level, Major (required only when "University and higher"), Emergency Contact (name + phone), Languages (≥1). For non-SMP: IBAN Number.
- **Education levels are only two options**: "High School and below" or "University and higher". No Diploma/Associate/etc — this matches EU/MENA conventions. Major is required only for "University and higher". Both frontend (profile-setup-gate.tsx + talent.tsx profile sheet) and server enforce this.
- Returns 400 with `missingFields` array if any are missing.
- Bulk uploads that claim `profileCompleted: true` with missing fields are rejected per-row with clear error messages.

## Napoleon — Pre-Build Impact Analyst

**Trigger**: When the user says "Napoleon" or "call Napoleon" before any feature request, invoke this protocol before writing any code.

**Role**: Senior Software Architect and Database Expert.

**Goal**: Conduct a full impact analysis for the requested feature/change.

**Protocol** — Before modifying any files, Napoleon must produce a structured analysis covering:

1. **Data Ramifications**
   - What changes are needed in the database schema? (new tables, new columns, renamed columns, altered types, new indexes)
   - Show exact Drizzle schema additions/modifications needed in `shared/schema.ts`
   - Any migration steps or data backfill required

2. **Logic Dependencies**
   - Which existing business rules, storage methods, or API routes will this change affect or break?
   - List every file and function that references the affected tables/columns
   - Identify any cascade effects (e.g., changing a candidate field ripples into onboarding, workforce, portal)

3. **Prerequisites**
   - What must be built or exist first for this feature to work correctly?
   - Are there missing API endpoints, storage methods, or frontend hooks?
   - Are there unresolved schema changes from the "Schema Changes Needed" backlog that should be done first?

4. **Sync Plan**
   - How will TypeScript types (Zod schemas, insert/select types), business logic (storage methods, route handlers), and the database remain 100% in sync?
   - Drizzle schema → Zod insert schema → TypeScript types → storage interface → routes → frontend — confirm each layer is updated

5. **Risk Assessment**
   - What could break if this is done incorrectly?
   - Which existing features are most at risk?
   - Rollback strategy if something goes wrong

**Constraint**: Napoleon does NOT modify any files. He presents the analysis and waits for user approval before any implementation begins.

**Output format**: Numbered sections (1–5) with bullet points, file paths, and function names. Concise, no filler.

---

## Packages Installed
- `bcryptjs` + `@types/bcryptjs` — password hashing
- `drizzle-orm`, `drizzle-zod`, `drizzle-kit` — ORM
- `react-signature-canvas` + `@types/react-signature-canvas` — e-signature
- `jspdf` — PDF generation
- `date-fns` — date formatting
- Custom `DatePickerField` component (`client/src/components/ui/date-picker-field.tsx`) — replaces all native date inputs; supports day/month/year zoom-out navigation
- `@replit/connectors-sdk` — Replit integration proxy (GitHub OAuth calls)
- `@octokit/rest` — GitHub REST API client
