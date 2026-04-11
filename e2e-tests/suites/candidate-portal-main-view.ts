export const name = "Candidate Portal Main View";

export const testPlan = `
## Test Suite: Candidate Portal Main View

### Test 1: Employee-mode portal layout with title and badge
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000002" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="text-portal-title" is visible (shows portal title)
   - Assert data-testid="badge-portal-mode" is visible (employee mode badge)
   - Assert data-testid="button-profile-menu" is visible (profile dropdown trigger)
   - Assert data-testid="button-avatar-edit" is visible (avatar click area)

### Test 2: Navigation menu items exist
8. [New Context] Create a new browser context
9. [Browser] Navigate to /auth
10. [Browser] Enter "2000000002" in data-testid="input-identifier"
11. [Browser] Enter "password123" in data-testid="input-password"
12. [Browser] Click data-testid="button-sign-in"
13. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
14. [Verify]
   - Assert at least 2 elements with data-testid starting with "nav-" are visible (sidebar navigation)

### Test 3: Profile dropdown opens with My Profile and Sign Out
15. [New Context] Create a new browser context
16. [Browser] Navigate to /auth
17. [Browser] Enter "2000000002" in data-testid="input-identifier"
18. [Browser] Enter "password123" in data-testid="input-password"
19. [Browser] Click data-testid="button-sign-in"
20. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
21. [Browser] Click data-testid="button-profile-menu"
22. [Verify]
   - Assert data-testid="menu-item-profile" is visible (My Profile option)
   - Assert data-testid="menu-item-signout" is visible (Sign out option)

### Test 4: Employee card shows employee number and salary
23. [New Context] Create a new browser context
24. [Browser] Navigate to /auth
25. [Browser] Enter "2000000002" in data-testid="input-identifier"
26. [Browser] Enter "password123" in data-testid="input-password"
27. [Browser] Click data-testid="button-sign-in"
28. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
29. [Verify]
   - Assert data-testid="text-employee-number" is visible showing "E000001"
   - Assert data-testid="text-employee-salary" is visible showing "4,000 SAR"
`;

export const technicalDocs = `
Candidate: 2000000002 / password123 -> /candidate-portal (profileCompleted=true, EMPLOYEE mode)
Note: This test candidate has an ACTIVE workforce record (employeeNumber="E000001", salary=4000,
event="Ramadan 2026", job="Golf Cart Operator"). So they are in EMPLOYEE mode.

In employee mode:
- data-testid="text-portal-title" shows the portal title
- data-testid="badge-portal-mode" IS rendered (shows "Employee" badge)
- data-testid="text-employee-number" shows "E000001"
- data-testid="text-employee-salary" shows "4,000 SAR"
- Clicking data-testid="button-avatar-edit" opens Change Photo dialog (NOT profile sheet)
- Profile menu: data-testid="button-profile-menu"
- Menu items: data-testid="menu-item-profile", data-testid="menu-item-signout"
- Nav items: data-testid="nav-{key}" (sidebar navigation links)
`;
