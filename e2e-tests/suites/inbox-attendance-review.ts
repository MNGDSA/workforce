export const name = "Inbox - Attendance Verification & Photo Review";

export const testPlan = `
## Test Suite: Inbox - Attendance Verification & Photo Review (Admin)

### Test 1: Inbox page loads with filter controls
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
   - Assert visible items contain "attendance" or "Attendance verification" text

### Test 3: Expand a pending attendance item and verify employee identity and review fields
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
   - Assert a detail section is visible (data-testid starting with "detail-inbox-")
   - Assert data-testid starting with "text-employee-name-" is visible (shows employee full name)
   - Assert data-testid starting with "text-employee-number-" is visible (shows employee ID number)
   - Assert a submitted photo exists (data-testid starting with "img-submitted-photo-")
   - Assert a reference photo exists (data-testid starting with "img-reference-photo-")
   - Assert a confidence score element exists (data-testid starting with "text-confidence-")
   - Assert a GPS status element exists (data-testid starting with "text-gps-status-")
   - Assert an Approve button exists (data-testid starting with "button-approve-attendance-")
   - Assert a Reject button exists (data-testid starting with "button-reject-attendance-")

### Test 4: Approve triggers confirmation dialog with notes, then cancel
26. [New Context] Create a new browser context
27. [Browser] Navigate to /auth
28. [Browser] Enter "1000000001" in data-testid="input-identifier"
29. [Browser] Enter "password123" in data-testid="input-password"
30. [Browser] Click data-testid="button-sign-in"
31. [Browser] Wait for redirect to /dashboard, then navigate to /inbox
32. [Browser] Click tab data-testid="tab-pending"
33. [Browser] Wait for items to load
34. [Browser] Click the first card with data-testid starting with "row-inbox-"
35. [Browser] Click the Approve button (data-testid starting with "button-approve-attendance-")
36. [Verify]
   - Assert data-testid="dialog-confirm-attendance" is visible
   - Assert data-testid="textarea-confirm-notes" is visible (notes input inside dialog)
   - Assert data-testid="button-confirm-cancel" is visible
   - Assert data-testid="button-confirm-action" is visible
37. [Browser] Click data-testid="button-confirm-cancel"
38. [Verify]
   - Assert data-testid="dialog-confirm-attendance" is no longer visible

### Test 5: Reject triggers same confirmation dialog, then cancel
39. [New Context] Create a new browser context
40. [Browser] Navigate to /auth
41. [Browser] Enter "1000000001" in data-testid="input-identifier"
42. [Browser] Enter "password123" in data-testid="input-password"
43. [Browser] Click data-testid="button-sign-in"
44. [Browser] Wait for redirect to /dashboard, then navigate to /inbox
45. [Browser] Click tab data-testid="tab-pending"
46. [Browser] Wait for items to load
47. [Browser] Click the first card with data-testid starting with "row-inbox-"
48. [Browser] Click the Reject button (data-testid starting with "button-reject-attendance-")
49. [Verify]
   - Assert data-testid="dialog-confirm-attendance" is visible
   - Assert data-testid="textarea-confirm-notes" is visible
   - Assert data-testid="button-confirm-action" is visible
50. [Browser] Click data-testid="button-confirm-cancel"
51. [Verify]
   - Assert dialog closes

### Test 6: Full approve with notes and verify item resolves
52. [New Context] Create a new browser context
53. [Browser] Navigate to /auth
54. [Browser] Enter "1000000001" in data-testid="input-identifier"
55. [Browser] Enter "password123" in data-testid="input-password"
56. [Browser] Click data-testid="button-sign-in"
57. [Browser] Wait for redirect to /dashboard, then navigate to /inbox
58. [Browser] Click tab data-testid="tab-pending"
59. [Browser] Wait for items to load
60. [Browser] Click the first card with data-testid starting with "row-inbox-"
61. [Browser] Click the Approve button (data-testid starting with "button-approve-attendance-")
62. [Verify] Assert data-testid="dialog-confirm-attendance" is visible
63. [Browser] Enter "Verified by admin during E2E test" in data-testid="textarea-confirm-notes"
64. [Browser] Click data-testid="button-confirm-action"
65. [Verify]
   - Assert the dialog closes
   - Assert a success toast or notification appears
   - Assert the item is removed from the Pending tab list
`;

export const technicalDocs = `
Login: POST /api/auth/login { identifier: "1000000001", password: "password123" }
Inbox route: /inbox, API: GET /api/inbox

IMPORTANT: The inbox has real pending attendance_verification and photo_change_request items.
IMPORTANT: Every test starts with [New Context] and full login flow for complete independence.

Tab elements:
- data-testid="tab-all", "tab-pending", "tab-resolved", "tab-dismissed"

Filter elements:
- Type: data-testid="select-inbox-type" (attendance_verification, photo_change_request)
- Priority: data-testid="select-inbox-priority"
- Sort: data-testid="select-inbox-sort"

Item elements:
- Row card: data-testid="row-inbox-{id}" (click to expand)
- Detail section: data-testid="detail-inbox-{id}"

Employee identity fields (inside expanded detail):
- Employee name: data-testid="text-employee-name-{id}" (shows full name)
- Employee number: data-testid="text-employee-number-{id}" (shows employee ID)

Attendance review fields (inside expanded detail):
- Submitted photo: data-testid="img-submitted-photo-{id}"
- Reference photo: data-testid="img-reference-photo-{id}"
- Confidence: data-testid="text-confidence-{id}"
- GPS status: data-testid="text-gps-status-{id}"
- Approve: data-testid="button-approve-attendance-{id}"
- Reject: data-testid="button-reject-attendance-{id}"

IMPORTANT: data-testid="textarea-notes-{id}" is NOT rendered for attendance or photo items.
Notes are entered in the confirmation dialog instead.

Confirmation dialog (appears after clicking Approve or Reject):
- Dialog: data-testid="dialog-confirm-attendance"
- Notes: data-testid="textarea-confirm-notes"
- Cancel: data-testid="button-confirm-cancel"
- Confirm: data-testid="button-confirm-action"

API for resolving: PATCH /api/inbox/:id/resolve with { notes: "..." }
`;
