export const name = "Candidate Portal Flow & Logout";

export const testPlan = `
## Test Suite: Candidate Portal Flow & Logout

### Test 1: Login and verify employee-mode portal renders
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000002" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="text-portal-title" is visible showing portal title
   - Assert data-testid="badge-portal-mode" is visible (employee mode badge)
   - Assert data-testid="button-profile-menu" is visible
   - Assert the page contains the text "Test Candidate" (candidate name from seed)

### Test 2: Employee-mode avatar click opens photo change dialog
8. [New Context] Create a new browser context
9. [Browser] Navigate to /auth
10. [Browser] Enter "2000000002" in data-testid="input-identifier"
11. [Browser] Enter "password123" in data-testid="input-password"
12. [Browser] Click data-testid="button-sign-in"
13. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
14. [Browser] Click data-testid="button-avatar-edit"
15. [Verify]
   - In employee mode, this opens the "Change Profile Photo" dialog
   - Assert data-testid="button-select-new-photo" is visible (photo selection button)
   - Assert data-testid="input-photo-change-file" exists in the DOM (hidden file input)

### Test 3: Logout clears state and returns to auth
16. [New Context] Create a new browser context
17. [Browser] Navigate to /auth
18. [Browser] Enter "2000000002" in data-testid="input-identifier"
19. [Browser] Enter "password123" in data-testid="input-password"
20. [Browser] Click data-testid="button-sign-in"
21. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
22. [Browser] Click data-testid="button-profile-menu"
23. [Browser] Click data-testid="menu-item-signout"
24. [Verify]
   - Assert URL changes to /auth
   - Assert data-testid="button-sign-in" is visible (login form shown)
   - Assert data-testid="text-portal-title" is NOT visible (portal is gone)
`;

export const technicalDocs = `
Candidate: 2000000002 / password123 -> /candidate-portal (profileCompleted=true, fullNameEn="Test Candidate")
This user has an ACTIVE workforce record (employeeNumber="E000001") so they are in EMPLOYEE mode.

In employee mode:
- data-testid="text-portal-title" shows portal title
- data-testid="badge-portal-mode" IS rendered (shows "Employee" badge)
- Clicking data-testid="button-avatar-edit" opens photo change dialog (NOT profile sheet)
- data-testid="button-select-new-photo" and "input-photo-change-file" are available in dialog
- Profile menu: data-testid="button-profile-menu"
- Sign out: data-testid="menu-item-signout" -> clears localStorage and navigates to /auth
`;
