export const name = "Candidate Portal Main View";

export const testPlan = `
## Test Suite: Candidate Portal Main View

### Test 1: Login and verify portal layout
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000002" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="text-portal-title" is visible with portal heading text
   - Assert data-testid="badge-portal-mode" is visible showing candidate mode badge

### Test 2: Verify sidebar profile card
8. [Verify]
   - Assert profile section is visible showing candidate name "Test Candidate"
   - Assert data-testid="button-profile-menu" is visible (profile dropdown trigger)
   - Assert data-testid="button-avatar-edit" exists (camera/edit icon on avatar)

### Test 3: Verify navigation menu items
9. [Verify]
   - Assert navigation items exist with data-testid starting with "nav-" (like nav-dashboard, nav-profile, etc.)
   - Assert at least 2 nav items are visible

### Test 4: Profile dropdown menu
10. [Browser] Click data-testid="button-profile-menu"
11. [Verify]
   - Assert data-testid="menu-item-profile" is visible (My Profile option)
   - Assert data-testid="menu-item-signout" is visible (Sign out option)
12. [Browser] Click elsewhere to close the dropdown

### Test 5: Navigate to profile section
13. [Browser] Click data-testid="menu-item-profile" (or the nav item for profile)
14. [Verify]
   - Assert profile editing section is visible with input fields
   - Assert data-testid="input-firstName" is visible with candidate first name
   - Assert data-testid="button-save-profile" is visible
`;

export const technicalDocs = `
Candidate: 2000000002 / password123 -> /candidate-portal (profileCompleted=true)
Portal layout elements:
- Title: data-testid="text-portal-title" (main portal heading)
- Mode badge: data-testid="badge-portal-mode" (shows "Candidate" or "Employee" mode)
- Avatar edit: data-testid="button-avatar-edit" (camera icon for photo upload)
- Profile menu trigger: data-testid="button-profile-menu"
- Profile menu items: data-testid="menu-item-profile", data-testid="menu-item-signout"
- Nav items: data-testid="nav-{key}" for sidebar navigation

Employee-specific elements (shown when candidate has active workforce record):
- Employee number: data-testid="text-employee-number"
- Salary: data-testid="text-employee-salary"
- Start date: data-testid="text-employee-start-date"
- Event: data-testid="text-employee-event"

Profile edit section:
- First name: data-testid="input-firstName"
- Last name: data-testid="input-lastName"
- Phone: data-testid="input-phone"
- Email: data-testid="input-email"
- Save: data-testid="button-save-profile"
- Password change: data-testid="button-change-password"
`;
