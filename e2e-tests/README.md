# WORKFORCE E2E Test Suites

## Overview

End-to-end test suites for the WORKFORCE seasonal hiring management system.
Tests are executed via the Replit `runTest()` Playwright-based testing subagent
in the code_execution sandbox.

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

| Role | Identifier | Password |
|------|-----------|----------|
| Super Admin | 1000000001 | password123 |
| Candidate | 2000000002 | password123 |
| Candidate (phone) | 0500000002 | password123 |
| Recruiter | 1000000003 | password123 |

## Seeding the demo accounts

Every suite below signs in with one of the three demo accounts. They are
**topped up automatically at server boot** in non-production environments
(`NODE_ENV !== "production"`), so a freshly-checked-out dev DB is good to
go after the first `npm run dev`. The boot-time top-up is non-destructive:
it only restores the three demo users and never touches transactional
tables (candidates, attendance records, photos, etc.).

If you ever need to top them up without restarting the server, run:

```bash
npx tsx server/seed-demo-accounts.ts
```

To opt out of the boot-time seed (e.g. when reproducing a customer-facing
bug), set `SEED_DEMO_ACCOUNTS=false`.

> The full destructive reseed (`npx tsx server/reset.ts`) wipes
> transactional tables and is **not** required for tests — only use it
> when you genuinely want a clean slate.

## Suites

1. **Auth Validation** - Login validation, admin redirect, forgot password flow
2. **Candidate Portal Login** - Candidate authentication, portal redirect, profile gate
3. **Candidate Portal Flow** - Profile setup wizard, portal navigation, photo management
4. **Inbox Attendance Review** - Inbox filters, attendance/photo review, approve/reject
5. **Geofence Management** - Zone CRUD, map display, zone details
6. **Photo Upload Outage Toast** - Verifies the friendlier "Photo accepted —
   verification skipped" toast renders during a Rekognition outage on both
   the standard upload path and the photo-change dialog (locks Task #154)
