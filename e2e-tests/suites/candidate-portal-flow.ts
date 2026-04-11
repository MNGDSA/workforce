export const name = "Candidate Portal Flow & Logout";

export const testPlan = `
## Test Suite: Candidate Portal Flow & Logout

### Test 1: Login and verify portal renders content
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000002" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="text-portal-title" is visible with WORKFORCE branding
   - Assert data-testid="badge-portal-mode" is visible
   - Assert data-testid="button-profile-menu" is visible

### Test 2: Verify candidate name appears in portal
8. [Verify]
   - Assert the page contains the text "Test Candidate" (the candidate's name from seed data)
   - Assert data-testid="button-avatar-edit" is visible (avatar area with photo controls)

### Test 3: Logout clears state and returns to auth
9. [Browser] Click data-testid="button-profile-menu"
10. [Browser] Click data-testid="menu-item-signout"
11. [Verify]
   - Assert URL changes to /auth
   - Assert data-testid="button-sign-in" is visible (login form shown)
   - Assert data-testid="text-portal-title" is NOT visible (portal is gone)
`;

export const technicalDocs = `
Candidate: 2000000002 / password123 -> /candidate-portal (profileCompleted=true, fullNameEn="Test Candidate")
Portal title: data-testid="text-portal-title"
Mode badge: data-testid="badge-portal-mode"
Profile menu: data-testid="button-profile-menu"
Sign out: data-testid="menu-item-signout"
Avatar edit: data-testid="button-avatar-edit"
Logout clears localStorage key "workforce_candidate" and navigates to /auth
`;
