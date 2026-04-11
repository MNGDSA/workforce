export const INBOX_ATTENDANCE_REVIEW_SUITE = {
  name: "Inbox - Attendance Verification & Photo Change Review",
  testPlan: `
    ## Test Suite: Inbox - Attendance Verification & Photo Change Review (Admin)

    ### Test 1: Login and navigate to Inbox, verify controls
    1. [New Context] Create a new browser context
    2. [Browser] Navigate to /auth
    3. [Browser] Enter "1000000001" in the identifier input (data-testid="input-identifier")
    4. [Browser] Enter "password123" in the password input (data-testid="input-password")
    5. [Browser] Click the "Sign In" button (data-testid="button-sign-in")
    6. [Browser] Wait for redirect to /dashboard, then navigate to /inbox
    7. [Verify]
       - Assert the Inbox page loads (data-testid="text-inbox-title" shows "Inbox")
       - Assert filter controls are visible

    ### Test 2: Switch to All tab and filter by Attendance type
    8. [Browser] Click the "All" tab (data-testid="tab-all")
    9. [Verify] The tab switches without error
    10. [Browser] Click the type filter dropdown (data-testid="select-inbox-type")
    11. [Browser] Select "Attendance" from the dropdown
    12. [Verify]
       - The inbox filters to show only attendance items (or empty state if none exist)
       - No errors on the page

    ### Test 3: Filter by Photo Change type
    13. [Browser] Click the type filter dropdown (data-testid="select-inbox-type")
    14. [Browser] Select "Photo Change" from the dropdown
    15. [Verify]
       - The inbox filters to show only photo change request items (or empty state if none exist)
       - No errors on the page

    ### Test 4: Filter by priority
    16. [Browser] Click the type filter dropdown and reset to "All Types"
    17. [Browser] Click the priority filter (data-testid="select-inbox-priority")
    18. [Browser] Select "High" priority
    19. [Verify] The inbox filters without error
    20. [Browser] Reset priority filter to "All Priority"

    ### Test 5: Sort options work
    21. [Browser] Click the sort dropdown (data-testid="select-inbox-sort")
    22. [Browser] Select "Priority (high->low)"
    23. [Verify] The inbox re-sorts without error
    24. [Browser] Click sort dropdown again and select "Newest first" to reset

    ### Test 6: Expand an inbox item (if any exist)
    25. [Browser] Switch to "Pending" tab (data-testid="tab-pending")
    26. [Browser] If there are any inbox item cards visible (look for data-testid matching "row-inbox-*"), click the first one to expand
    27. [Verify] If an item was expanded:
       - An expanded detail section should appear (data-testid matching "detail-inbox-*")
       - If it is an attendance item, look for:
         - Submitted photo (data-testid matching "img-submitted-photo-*")
         - Reference photo (data-testid matching "img-reference-photo-*")
         - Confidence score (data-testid matching "text-confidence-*")
         - GPS status (data-testid matching "text-gps-status-*")
         - Employee name (data-testid matching "text-employee-name-*")
         - Employee number (data-testid matching "text-employee-number-*")
         - Approve and Reject buttons visible
       - If it is a photo change request, look for:
         - Current photo (data-testid matching "img-current-photo-*")
         - New photo (data-testid matching "img-new-photo-*")
         - Employee name (data-testid matching "text-photo-employee-*")
         - Employee number (data-testid matching "text-photo-empnum-*")
         - Approve Photo and Reject Photo buttons visible
       - Assert the section renders without errors
  `,
  technicalDocs: `
    - Login: POST /api/auth/login with { identifier: "1000000001", password: "password123" }
    - Inbox route: /inbox
    - Inbox API: GET /api/inbox
    - Tabs: data-testid="tab-all", "tab-pending", "tab-resolved", "tab-dismissed", "tab-history"
    - Type filter: data-testid="select-inbox-type" with options including "Attendance" (value: attendance_verification) and "Photo Change" (value: photo_change_request)
    - Priority filter: data-testid="select-inbox-priority"
    - Sort: data-testid="select-inbox-sort"
    - Inbox items: data-testid="row-inbox-{id}", expanded: data-testid="detail-inbox-{id}"
    - Attendance review section: data-testid="attendance-review-{id}"
    - Photo review section: data-testid="photo-review-{id}"
    - Attendance fields: img-submitted-photo-{id}, img-reference-photo-{id}, text-confidence-{id}, text-gps-status-{id}, text-employee-name-{id}, text-employee-number-{id}
    - Photo fields: img-current-photo-{id}, img-new-photo-{id}, text-photo-employee-{id}, text-photo-empnum-{id}
  `,
};
