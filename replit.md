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
Dashboard → Job Posting → Seasons → Interview Calls → Workforce → Talent → Rules & Automation → Notification Center → System & Settings

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
