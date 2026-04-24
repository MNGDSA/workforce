# WORKFORCE E2E Test Suites

## Overview

End-to-end test suites for the WORKFORCE seasonal hiring management system.
Tests are executed via the Replit `runTest()` Playwright-based testing subagent
in the code_execution sandbox.

## Preparing the Database

Every suite assumes the canonical demo accounts (and the workforce row
`E000001`) live in the database. Bring a fresh DB to that state with the
one-shot reset script — no manual SQL required:

```bash
tsx server/reset.ts
```

What the reset script guarantees, in this order:

1. Truncates every transactional table (events, candidates, workforce,
   inbox items, audit logs, etc.) but preserves config tables AND the RBAC
   tables (`roles`, `permissions`, `role_permissions`).
2. Re-runs the boot-time RBAC seed so the script also works on a brand-new
   database where the server has never been started.
3. Re-creates the four demo login accounts (super admin, two candidates,
   recruiter).
4. Provisions the candidate profile rows the portal expects:
   - `2000000002` → candidate (profileCompleted=true) **plus** a workforce
     record `employeeNumber=E000001`, salary `4000`, `isActive=true`.
     Drives EMPLOYEE-mode portal tests.
   - `2000000005` → candidate (profileCompleted=true) with **no** workforce
     record. Drives CANDIDATE-mode portal tests.
5. Restores the default automation rules.

Re-running the script is safe — every step is idempotent (UPSERT on
`roles.slug` / `permissions.key`, lookup-then-update on candidates and
workforce). After the script finishes you can run any suite below
back-to-back without further setup.

## Running Tests

Each suite is a standalone script that can be executed in the code_execution sandbox:

```javascript
const { testPlan, technicalDocs } = require('./suites/auth-validation');
await runTest({ testPlan, relevantTechnicalDocumentation: technicalDocs });
```

Or run all suites:

```javascript
const suites = require('./suites');
for (const s of suites) {
  const r = await runTest({ testPlan: s.testPlan, relevantTechnicalDocumentation: s.technicalDocs });
  console.log(`${s.name}: ${r.status}`);
}
```

## Test Credentials

| Role | Identifier | Password | Mode |
|------|-----------|----------|------|
| Super Admin | 1000000001 | password123 | Admin |
| Candidate (employee) | 2000000002 | password123 | Employee (workforce E000001, salary 4000 SAR) |
| Candidate (employee, phone login) | 0500000002 | password123 | Employee |
| Recruiter | 1000000003 | password123 | Candidate role (legacy) |
| Candidate (pure) | 2000000005 | password123 | Candidate (no workforce record) |

## Seeding the demo accounts

Every suite below signs in with one of the demo accounts. They are
**topped up automatically at server boot** in non-production environments
(`NODE_ENV !== "production"`), so a freshly-checked-out dev DB is good to
go after the first `npm run dev`. The boot-time top-up is non-destructive:
it only restores the demo users and never touches transactional
tables (candidates, attendance records, photos, etc.).

If you ever need to top them up without restarting the server, run:

```bash
npx tsx server/seed-demo-accounts.ts
```

To opt out of the boot-time seed (e.g. when reproducing a customer-facing
bug), set `SEED_DEMO_ACCOUNTS=false`.

> The full destructive reseed (`npx tsx server/reset.ts`) wipes
> transactional tables and provisions the candidate + workforce rows
> the suites depend on — use it when you want a clean slate ready for
> back-to-back e2e runs.

## Suites

1. **Auth Validation** - Login validation, admin redirect, forgot password flow
2. **Candidate Portal Login** - Candidate authentication, portal redirect, profile gate
3. **Candidate Portal Flow** - Profile setup wizard, portal navigation, photo management
4. **Inbox Attendance Review** - Inbox filters, attendance/photo review, approve/reject
5. **Geofence Management** - Zone CRUD, map display, zone details
6. **Photo Upload Outage Toast** - Verifies the friendlier "Photo accepted —
   verification skipped" toast renders during a Rekognition outage on both
   the standard upload path and the photo-change dialog (locks Task #154)
