export const name = "Inbox - Attendance Verification & Photo Review";

export const testPlan = `
## Test Suite: Inbox - Attendance Verification & Photo Review (Admin)

### Test 1: Inbox page loads with controls
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "1000000001" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait for redirect to /dashboard, then navigate to /inbox
7. [Verify]
   - Assert data-testid="text-inbox-title" shows "Inbox"
   - Assert data-testid="select-inbox-type" is visible
   - Assert data-testid="select-inbox-priority" is visible
   - Assert data-testid="select-inbox-sort" is visible
   - Assert data-testid="tab-all" is visible
   - Assert data-testid="tab-pending" is visible

### Test 2: Filter by Attendance type
8. [New Context] Create a new browser context
9. [Browser] Navigate to /auth
10. [Browser] Enter "1000000001" in data-testid="input-identifier"
11. [Browser] Enter "password123" in data-testid="input-password"
12. [Browser] Click data-testid="button-sign-in"
13. [Browser] Wait for redirect to /dashboard, then navigate to /inbox
14. [Browser] Click data-testid="select-inbox-type" and select "Attendance" option
15. [Verify]
   - Assert the inbox list updates
   - Assert each visible item contains "attendance" or "Attendance verification" text

### Test 3: Expand pending attendance item and verify detail fields
16. [New Context] Create a new browser context
17. [Browser] Navigate to /auth
18. [Browser] Enter "1000000001" in data-testid="input-identifier"
19. [Browser] Enter "password123" in data-testid="input-password"
20. [Browser] Click data-testid="button-sign-in"
21. [Browser] Wait for redirect to /dashboard, then navigate to /inbox
22. [Browser] Click tab data-testid="tab-pending"
23. [Browser] Wait for items to load
24. [Browser] Click the first card with data-testid starting with "row-inbox-"
25. [Verify]
   - Assert a detail section appears (data-testid starting with "detail-inbox-")
   - Assert a submitted photo element exists (data-testid starting with "img-submitted-photo-")
   - Assert a reference photo element exists (data-testid starting with "img-reference-photo-")
   - Assert a confidence score element exists (data-testid starting with "text-confidence-")
   - Assert a GPS status element exists (data-testid starting with "text-gps-status-")
   - Assert an Approve button exists (data-testid starting with "button-approve-attendance-")
   - Assert a Reject button exists (data-testid starting with "button-reject-attendance-")
   - Assert a resolution notes textarea exists (data-testid starting with "textarea-notes-")

### Test 4: Approve triggers confirmation dialog, cancel closes it
26. [Browser] Click the Approve button (data-testid starting with "button-approve-attendance-")
27. [Verify]
   - Assert data-testid="dialog-confirm-attendance" is visible (confirmation dialog)
   - Assert data-testid="textarea-confirm-notes" is visible (required notes input)
   - Assert data-testid="button-confirm-cancel" is visible
   - Assert data-testid="button-confirm-action" is visible
28. [Browser] Click data-testid="button-confirm-cancel"
29. [Verify]
   - Assert data-testid="dialog-confirm-attendance" is no longer visible

### Test 5: Reject triggers confirmation dialog with notes requirement
30. [Browser] Click the Reject button (data-testid starting with "button-reject-attendance-")
31. [Verify]
   - Assert data-testid="dialog-confirm-attendance" is visible (same confirmation dialog)
   - Assert data-testid="textarea-confirm-notes" is visible
   - Assert data-testid="button-confirm-action" is visible
32. [Browser] Click data-testid="button-confirm-cancel"
33. [Verify]
   - Assert the dialog closes

### Test 6: Full approve workflow with notes
34. [Browser] Click the Approve button again (data-testid starting with "button-approve-attendance-")
35. [Verify] Assert data-testid="dialog-confirm-attendance" is visible
36. [Browser] Enter "Verified by admin during E2E test" in data-testid="textarea-confirm-notes"
37. [Browser] Click data-testid="button-confirm-action"
38. [Verify]
   - Assert the dialog closes
   - Assert a success toast or notification appears
   - Assert the item is removed from the Pending list
`;

export const technicalDocs = `
Login: POST /api/auth/login { identifier: "1000000001", password: "password123" }
Inbox route: /inbox, API: GET /api/inbox

The inbox contains real pending attendance_verification and photo_change_request items.

Tab elements:
- data-testid="tab-all", "tab-pending", "tab-resolved", "tab-dismissed"

Filter elements:
- Type: data-testid="select-inbox-type" (values: attendance_verification, photo_change_request)
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
- Notes textarea: data-testid="textarea-confirm-notes" (required for confirmation)
- Cancel: data-testid="button-confirm-cancel"
- Confirm: data-testid="button-confirm-action"

API: PATCH /api/inbox/:id/resolve or PATCH /api/inbox/:id/dismiss
`;
