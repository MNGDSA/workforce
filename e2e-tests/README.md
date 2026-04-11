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

## Suites

1. **Auth Validation** - Login validation, admin redirect, forgot password flow
2. **Candidate Portal Login** - Candidate authentication, portal redirect, profile gate
3. **Candidate Portal Flow** - Profile setup wizard, portal navigation, photo management
4. **Inbox Attendance Review** - Inbox filters, attendance/photo review, approve/reject
5. **Geofence Management** - Zone CRUD, map display, zone details
