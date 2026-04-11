export const name = "Candidate Photo Management";

export const testPlan = `
## Test Suite: Candidate Photo Management

### Test 1: Employee-mode - avatar click opens Change Profile Photo dialog
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000002" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="badge-portal-mode" is visible (employee-mode badge)
   - Assert data-testid="button-avatar-edit" is visible
8. [Browser] Click data-testid="button-avatar-edit"
9. [Verify]
   - In employee mode (active workforce record), this opens the Change Profile Photo dialog
   - Assert data-testid="button-select-new-photo" is visible (button to select a new photo)
   - Assert data-testid="input-photo-change-file" exists in the DOM (hidden file input)

### Test 2: Employee-mode - photo dialog can be closed
10. [New Context] Create a new browser context
11. [Browser] Navigate to /auth
12. [Browser] Enter "2000000002" in data-testid="input-identifier"
13. [Browser] Enter "password123" in data-testid="input-password"
14. [Browser] Click data-testid="button-sign-in"
15. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
16. [Browser] Click data-testid="button-avatar-edit"
17. [Verify] Assert data-testid="button-select-new-photo" is visible (dialog opened)
18. [Browser] Press Escape key or click outside the dialog to close it
19. [Verify] Assert data-testid="button-select-new-photo" is NOT visible (dialog closed)

### Test 3: Employee-mode - profile sheet shows candidate information
20. [New Context] Create a new browser context
21. [Browser] Navigate to /auth
22. [Browser] Enter "2000000002" in data-testid="input-identifier"
23. [Browser] Enter "password123" in data-testid="input-password"
24. [Browser] Click data-testid="button-sign-in"
25. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
26. [Browser] Click data-testid="button-profile-menu"
27. [Browser] Click data-testid="menu-item-profile"
28. [Verify]
   - Assert data-testid="input-firstName" is visible with "Test" (candidate first name)
   - Assert data-testid="input-lastName" is visible with "Candidate" (candidate last name)
   - Assert data-testid="button-save-profile" is visible
   - Assert data-testid="button-change-password" is visible

### Test 4: Employee-mode - employee card shows employee number
29. [New Context] Create a new browser context
30. [Browser] Navigate to /auth
31. [Browser] Enter "2000000002" in data-testid="input-identifier"
32. [Browser] Enter "password123" in data-testid="input-password"
33. [Browser] Click data-testid="button-sign-in"
34. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
35. [Verify]
   - Assert data-testid="badge-portal-mode" is visible (showing "Employee" badge)
   - Assert data-testid="text-employee-number" is visible showing "E000001"
   - Assert the page shows the candidate name "Test Candidate"
`;

export const technicalDocs = `
Candidate: 2000000002 / password123 -> /candidate-portal (profileCompleted=true, fullNameEn="Test Candidate")

IMPORTANT: Test candidate 2000000002 now has an ACTIVE workforce record (employeeNumber="E000001",
event="Ramadan 2026", job="Golf Cart Operator"). This makes them an EMPLOYEE, NOT a candidate-mode user.

In employee mode:
- data-testid="badge-portal-mode" IS rendered (shows "Employee" or similar badge)
- data-testid="text-employee-number" shows "E000001"
- Clicking data-testid="button-avatar-edit" calls handleAvatarClick() which opens the photo change dialog
  (NOT the profile sheet - profile sheet is only opened in candidate mode)
- data-testid="input-photo-change-file" (hidden file input) IS available inside the photo dialog portal
- data-testid="button-select-new-photo" IS available inside the photo dialog
- Photo changes create inbox approval requests for admin review
- Pending photo change shows amber "Pending Review" badge

Profile menu: data-testid="button-profile-menu"
Profile option: data-testid="menu-item-profile"
Profile fields: input-firstName, input-lastName
Save: data-testid="button-save-profile"
Change password: data-testid="button-change-password"
Employee card: data-testid="text-employee-number" (shows employeeNumber)
`;
