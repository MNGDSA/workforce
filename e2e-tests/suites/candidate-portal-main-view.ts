export const name = "Candidate Portal Main View";

export const testPlan = `
## Test Suite: Candidate Portal Main View

### Test 1: Portal layout with title and mode badge
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000002" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="text-portal-title" is visible
   - Assert data-testid="badge-portal-mode" is visible
   - Assert data-testid="button-profile-menu" is visible
   - Assert data-testid="button-avatar-edit" is visible

### Test 2: Navigation menu items exist
8. [New Context] Create a new browser context
9. [Browser] Navigate to /auth
10. [Browser] Enter "2000000002" in data-testid="input-identifier"
11. [Browser] Enter "password123" in data-testid="input-password"
12. [Browser] Click data-testid="button-sign-in"
13. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
14. [Verify]
   - Assert at least 2 elements with data-testid starting with "nav-" are visible

### Test 3: Profile dropdown has My Profile and Sign Out
15. [New Context] Create a new browser context
16. [Browser] Navigate to /auth
17. [Browser] Enter "2000000002" in data-testid="input-identifier"
18. [Browser] Enter "password123" in data-testid="input-password"
19. [Browser] Click data-testid="button-sign-in"
20. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
21. [Browser] Click data-testid="button-profile-menu"
22. [Verify]
   - Assert data-testid="menu-item-profile" is visible
   - Assert data-testid="menu-item-signout" is visible

### Test 4: Profile editing section loads with editable fields
23. [New Context] Create a new browser context
24. [Browser] Navigate to /auth
25. [Browser] Enter "2000000002" in data-testid="input-identifier"
26. [Browser] Enter "password123" in data-testid="input-password"
27. [Browser] Click data-testid="button-sign-in"
28. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
29. [Browser] Click data-testid="button-profile-menu"
30. [Browser] Click data-testid="menu-item-profile"
31. [Verify]
   - Assert data-testid="input-firstName" is visible
   - Assert data-testid="button-save-profile" is visible
   - Assert data-testid="button-change-password" is visible
`;

export const technicalDocs = `
Candidate: 2000000002 / password123 -> /candidate-portal (profileCompleted=true)
Portal title: data-testid="text-portal-title"
Mode badge: data-testid="badge-portal-mode"
Avatar edit: data-testid="button-avatar-edit"
Profile menu: data-testid="button-profile-menu"
Menu items: data-testid="menu-item-profile", data-testid="menu-item-signout"
Nav items: data-testid="nav-{key}" (sidebar navigation links)
Profile fields: input-firstName, input-lastName, input-phone, input-email, input-city
Save: data-testid="button-save-profile"
Change password: data-testid="button-change-password"
`;
