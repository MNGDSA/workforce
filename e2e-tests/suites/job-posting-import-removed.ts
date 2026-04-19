export const name = "Job Posting — Applicants Upload Removed (Export-Only)";

export const testPlan = `
## Test Suite: Job Posting — Applicants Upload Removed

Goal: confirm the applicants spreadsheet-upload control is fully removed
from both the job-posting list page (drawer) and the job-posting detail
page, while the export control still exists.

### Test 1: Admin login
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "1000000001" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Verify] Assert URL changes to /dashboard

### Test 2: Job posting list page — upload control absent
7. [Browser] Navigate to /job-posting
8. [Verify]
   - Assert no element with data-testid="button-import-applicants" exists anywhere on the page
   - Assert no input element with attribute accept=".xlsx" exists on the page

### Test 3: Job posting detail page — upload control absent, export present
9. [Browser] If at least one job row is visible, click the row to open the
   detail page (or navigate directly to a known job detail URL such as
   /job-posting/<id>). If no jobs exist, skip the rest of this test
   gracefully and report "no seed data" — do NOT mark the suite failed.
10. [Verify]
    - Assert no element with data-testid="button-import-applicants" exists
    - Assert no input element with attribute accept=".xlsx" exists
    - Assert an element with data-testid="button-export-applicants" IS present and visible
`;

export const technicalDocs = `
This suite verifies the hard-drop of the applicants spreadsheet-upload
feature from the job-posting backoffice (task #65 / ISSUE-002).

Pages exercised:
- /job-posting           — list page with an applicants drawer
- /job-posting/<id>      — detail page with the same applicants section

Test IDs that MUST be absent:
- button-import-applicants
- (and any <input type="file" accept=".xlsx">)

Test IDs that MUST still be present on the detail page:
- button-export-applicants

Admin credentials: 1000000001 / password123.

If the project has no seeded job postings, Test 3 should be reported as
"skipped — no seed data" rather than failed; the absence assertion in
Test 2 is sufficient to prove the upload control is gone from the list
page.
`;
