export const name = "Inbox - Attendance Verification & Photo Review";

export const testPlan = `
## Test Suite: Inbox - Attendance Verification & Photo Review (Admin)

### Test 1: Login and navigate to Inbox, verify page structure
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "1000000001" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait for redirect to /dashboard, then navigate to /inbox
7. [Verify]
   - Assert data-testid="text-inbox-title" shows "Inbox"
   - Assert data-testid="select-inbox-type" is visible (type filter dropdown)
   - Assert data-testid="select-inbox-priority" is visible (priority filter dropdown)
   - Assert data-testid="select-inbox-sort" is visible (sort dropdown)
   - Assert data-testid="tab-all" is visible
   - Assert data-testid="tab-pending" is visible

### Test 2: Filter by Attendance type
8. [Browser] Click data-testid="select-inbox-type" and select the "Attendance" option
9. [Verify]
   - Assert the inbox list updates (loading completes)
   - Assert each visible inbox item card contains text related to "attendance" or "Attendance verification"

### Test 3: Switch to Pending tab and expand an attendance item
10. [Browser] Click tab data-testid="tab-pending"
11. [Browser] Wait for items to load
12. [Browser] Click the first card with data-testid starting with "row-inbox-" to expand it
13. [Verify]
   - Assert a detail section appears with data-testid starting with "detail-inbox-"
   - Assert the expanded item shows:
     - A submitted photo element (data-testid starting with "img-submitted-photo-")
     - A reference photo element (data-testid starting with "img-reference-photo-")
     - A confidence score element (data-testid starting with "text-confidence-")
     - A GPS status element (data-testid starting with "text-gps-status-")
     - An Approve button (data-testid starting with "button-approve-attendance-")
     - A Reject button (data-testid starting with "button-reject-attendance-")
     - A resolution notes textarea (data-testid starting with "textarea-notes-")

### Test 4: Click Approve, verify confirmation dialog with required notes, then cancel
14. [Browser] Click the Approve button (data-testid starting with "button-approve-attendance-")
15. [Verify]
   - Assert a confirmation dialog appears (data-testid="dialog-confirm-attendance")
   - Assert the dialog contains a notes textarea (data-testid="textarea-confirm-notes")
   - Assert a Cancel button exists (data-testid="button-confirm-cancel")
   - Assert a Confirm/action button exists (data-testid="button-confirm-action")
16. [Browser] Click the Cancel button (data-testid="button-confirm-cancel")
17. [Verify]
   - Assert the confirmation dialog closes (data-testid="dialog-confirm-attendance" is no longer visible)
   - Assert we are back to the inbox list view

### Test 5: Execute full approve workflow with notes
18. [Browser] Click the same Approve button again (data-testid starting with "button-approve-attendance-")
19. [Verify] Assert the confirmation dialog appears again (data-testid="dialog-confirm-attendance")
20. [Browser] Enter "Verified by admin during E2E test" in data-testid="textarea-confirm-notes"
21. [Browser] Click the Confirm button (data-testid="button-confirm-action")
22. [Verify]
   - Assert the dialog closes
   - Assert a success toast or notification appears
   - Assert the item is no longer in the Pending tab (it should move to Resolved)
`;

export const technicalDocs = `
Login: POST /api/auth/login { identifier: "1000000001", password: "password123" }
Inbox route: /inbox, API: GET /api/inbox

The inbox contains real data: attendance_verification and photo_change_request items created
by mobile app submissions. There are pending items available for testing.

Tab elements:
- data-testid="tab-all", "tab-pending", "tab-resolved", "tab-dismissed"

Filter elements:
- Type: data-testid="select-inbox-type" (attendance_verification, photo_change_request)
- Priority: data-testid="select-inbox-priority"
- Sort: data-testid="select-inbox-sort"

Inbox item elements:
- Row card: data-testid="row-inbox-{id}" (click to expand)
- Detail section: data-testid="detail-inbox-{id}"

Attendance review fields (inside expanded detail):
- Submitted photo: data-testid="img-submitted-photo-{id}"
- Reference photo: data-testid="img-reference-photo-{id}"
- Confidence: data-testid="text-confidence-{id}"
- GPS status: data-testid="text-gps-status-{id}"
- Employee name: data-testid="text-employee-name-{id}"
- Employee number: data-testid="text-employee-number-{id}"
- Approve button: data-testid="button-approve-attendance-{id}"
- Reject button: data-testid="button-reject-attendance-{id}"
- Notes textarea: data-testid="textarea-notes-{id}"

Photo review fields:
- Current photo: data-testid="img-current-photo-{id}"
- New photo: data-testid="img-new-photo-{id}"
- Approve: data-testid="button-approve-photo-{id}"
- Reject: data-testid="button-reject-photo-{id}"

Confirmation dialog (appears after clicking Approve or Reject):
- Dialog container: data-testid="dialog-confirm-attendance"
- Notes textarea: data-testid="textarea-confirm-notes"
- Cancel: data-testid="button-confirm-cancel"
- Confirm: data-testid="button-confirm-action"

API for resolving: PATCH /api/inbox/:id with { status: "resolved", resolutionNotes: "..." }
`;
