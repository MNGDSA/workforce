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
   - Assert the Inbox page loads with data-testid="text-inbox-title" showing "Inbox"
   - Assert filter controls are visible

### Test 2: Tab switching and type filter
8. [Browser] Click tab data-testid="tab-all"
9. [Verify] Tab switches without error
10. [Browser] Click data-testid="select-inbox-type" and select "Attendance" option
11. [Verify] Inbox filters to attendance items (or empty state)
12. [Browser] Click data-testid="select-inbox-type" and select "Photo Change" option
13. [Verify] Inbox filters to photo change items (or empty state)

### Test 3: Priority filter and sort
14. [Browser] Reset type filter to "All Types"
15. [Browser] Click data-testid="select-inbox-priority" and select "High"
16. [Verify] Inbox filters without error
17. [Browser] Click data-testid="select-inbox-sort" and select "Priority (high->low)"
18. [Verify] Inbox re-sorts without error

### Test 4: Expand inbox item (if any exist)
19. [Browser] Click tab data-testid="tab-pending"
20. [Browser] If any cards with data-testid starting with "row-inbox-" exist, click the first one
21. [Verify] If an item was clicked:
   - Detail section appears with data-testid starting with "detail-inbox-"
   - For attendance items: submitted photo, reference photo, confidence score, GPS status are visible
   - For photo items: current photo, new photo, employee info visible
   - Approve and Reject buttons are visible
`;

export const technicalDocs = `
Login: POST /api/auth/login { identifier: "1000000001", password: "password123" }
Inbox route: /inbox, API: GET /api/inbox
Tabs: data-testid="tab-all", "tab-pending", "tab-resolved", "tab-dismissed"
Type filter: data-testid="select-inbox-type" (attendance_verification, photo_change_request)
Priority filter: data-testid="select-inbox-priority"
Sort: data-testid="select-inbox-sort"
Inbox items: data-testid="row-inbox-{id}"
Expanded detail: data-testid="detail-inbox-{id}"
Attendance fields: img-submitted-photo-{id}, img-reference-photo-{id}, text-confidence-{id}, text-gps-status-{id}
Photo fields: img-current-photo-{id}, img-new-photo-{id}, text-photo-employee-{id}
`;
