export const name = "Candidate Portal Main View";

export const testPlan = `
## Test Suite: Candidate Portal Main View

### Test 1: Login and verify portal layout elements
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000002" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="text-portal-title" is visible with portal heading text
   - Assert data-testid="badge-portal-mode" is visible (shows candidate or employee mode)
   - Assert data-testid="button-profile-menu" is visible (profile dropdown trigger)

### Test 2: Verify navigation menu items exist
8. [New Context] Create a new browser context
9. [Browser] Navigate to /auth
10. [Browser] Enter "2000000002" in data-testid="input-identifier"
11. [Browser] Enter "password123" in data-testid="input-password"
12. [Browser] Click data-testid="button-sign-in"
13. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
14. [Verify]
   - Assert at least 2 elements with data-testid starting with "nav-" are visible (sidebar navigation items)
   - Assert data-testid="button-avatar-edit" exists (camera icon for photo management)

### Test 3: Profile dropdown opens with My Profile and Sign Out options
15. [Browser] Click data-testid="button-profile-menu"
16. [Verify]
   - Assert data-testid="menu-item-profile" is visible (My Profile option)
   - Assert data-testid="menu-item-signout" is visible (Sign out option)

### Test 4: Navigate to profile editing section
17. [Browser] Click data-testid="menu-item-profile"
18. [Verify]
   - Assert profile editing section is visible
   - Assert data-testid="input-firstName" is visible with the candidate's first name
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
Nav items: data-testid="nav-{key}" (multiple sidebar navigation links)
Profile edit fields: input-firstName, input-lastName, input-phone, input-email, input-city
Save: data-testid="button-save-profile"
Change password: data-testid="button-change-password"
`;
