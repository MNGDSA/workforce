export const name = "Inbox - Attendance Verification & Photo Review";

export const testPlan = `
## Test Suite: Inbox - Attendance Verification & Photo Review (Admin)

### Test 1: Login and navigate to Inbox
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "1000000001" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait for redirect to /dashboard, then navigate to /inbox
7. [Verify]
   - Assert data-testid="text-inbox-title" shows "Inbox"
   - Assert filter controls are visible (select-inbox-type, select-inbox-priority, select-inbox-sort)

### Test 2: Tab switching and type filter
8. [Browser] Click tab data-testid="tab-all"
9. [Verify] Tab switches without error
10. [Browser] Click data-testid="select-inbox-type" and select "Attendance" option
11. [Verify] Inbox filters to attendance items (or shows empty state)
12. [Browser] Click data-testid="select-inbox-type" and select "Photo Change" option
13. [Verify] Inbox filters to photo change items (or shows empty state)

### Test 3: Expand pending item and verify approve/reject buttons
14. [Browser] Reset type filter to "All Types"
15. [Browser] Click tab data-testid="tab-pending"
16. [Browser] If any cards with data-testid starting with "row-inbox-" exist, click the first one
17. [Verify] If an item was expanded:
   - Detail section appears (data-testid starting with "detail-inbox-")
   - For attendance items: verify these elements exist:
     - Submitted photo (data-testid="img-submitted-photo-{id}")
     - Reference photo (data-testid="img-reference-photo-{id}")
     - Confidence score (data-testid="text-confidence-{id}")
     - GPS status (data-testid="text-gps-status-{id}")
     - Approve button (data-testid="button-approve-attendance-{id}")
     - Reject button (data-testid="button-reject-attendance-{id}")
   - For photo items: verify these elements exist:
     - Current photo (data-testid="img-current-photo-{id}")
     - New photo (data-testid="img-new-photo-{id}")
     - Approve Photo button (data-testid="button-approve-photo-{id}")
     - Reject Photo button (data-testid="button-reject-photo-{id}")
   - Resolution notes textarea exists (data-testid="textarea-notes-{id}")

### Test 4: Test approve confirmation dialog
18. [Browser] If an attendance or photo item is expanded with an Approve button visible:
   - Click the Approve button (data-testid starting with "button-approve-attendance-" or "button-approve-photo-")
19. [Verify]
   - Assert a confirmation dialog appears (data-testid="dialog-confirm-attendance")
   - Assert the dialog has a notes textarea (data-testid="textarea-confirm-notes")
   - Assert "Cancel" button exists (data-testid="button-confirm-cancel")
   - Assert "Confirm" action button exists (data-testid="button-confirm-action")
20. [Browser] Click "Cancel" (data-testid="button-confirm-cancel") to close the dialog
21. [Verify] Dialog closes and we return to the inbox list
`;

export const technicalDocs = `
Login: POST /api/auth/login { identifier: "1000000001", password: "password123" }
Inbox route: /inbox, API: GET /api/inbox

Tab elements:
- data-testid="tab-all", "tab-pending", "tab-resolved", "tab-dismissed"

Filter elements:
- Type: data-testid="select-inbox-type" (attendance_verification, photo_change_request)
- Priority: data-testid="select-inbox-priority"
- Sort: data-testid="select-inbox-sort"

Inbox item elements:
- Row: data-testid="row-inbox-{id}"
- Detail: data-testid="detail-inbox-{id}"

Attendance review fields:
- data-testid="img-submitted-photo-{id}" - submitted selfie
- data-testid="img-reference-photo-{id}" - reference photo
- data-testid="text-confidence-{id}" - face match confidence score
- data-testid="text-gps-status-{id}" - GPS location status
- data-testid="text-employee-name-{id}" - employee name
- data-testid="text-employee-number-{id}" - employee number
- data-testid="button-approve-attendance-{id}" - approve button
- data-testid="button-reject-attendance-{id}" - reject button

Photo review fields:
- data-testid="img-current-photo-{id}" - current photo
- data-testid="img-new-photo-{id}" - new photo
- data-testid="button-approve-photo-{id}" - approve photo
- data-testid="button-reject-photo-{id}" - reject photo

Resolution notes: data-testid="textarea-notes-{id}"

Confirmation dialog:
- Dialog: data-testid="dialog-confirm-attendance"
- Notes: data-testid="textarea-confirm-notes"
- Cancel: data-testid="button-confirm-cancel"
- Confirm: data-testid="button-confirm-action"

API: PATCH /api/inbox/:id with { status: "resolved"|"dismissed", resolutionNotes: "..." }
`;
