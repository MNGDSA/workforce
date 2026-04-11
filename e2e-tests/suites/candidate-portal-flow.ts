export const name = "Candidate Portal Flow & Logout";

export const testPlan = `
## Test Suite: Candidate Portal Flow & Logout

### Test 1: Login and verify portal renders candidate content
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000002" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="text-portal-title" is visible showing "Candidate Portal"
   - Assert data-testid="button-profile-menu" is visible
   - Assert the page contains the text "Test Candidate" (candidate name from seed)

### Test 2: Candidate mode avatar click opens profile (not photo dialog)
8. [New Context] Create a new browser context
9. [Browser] Navigate to /auth
10. [Browser] Enter "2000000002" in data-testid="input-identifier"
11. [Browser] Enter "password123" in data-testid="input-password"
12. [Browser] Click data-testid="button-sign-in"
13. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
14. [Browser] Click data-testid="button-avatar-edit"
15. [Verify]
   - Assert a profile editing section or sheet opens
   - Assert data-testid="input-firstName" is visible (profile form opened, not photo change dialog)
   - Assert data-testid="button-save-profile" is visible

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
This is candidate mode (no workforce record), NOT employee mode.
- data-testid="text-portal-title" shows "Candidate Portal"
- data-testid="badge-portal-mode" is NOT rendered in candidate mode
- Clicking data-testid="button-avatar-edit" opens profile sheet (handleProfileOpen), not photo change dialog
- Profile menu: data-testid="button-profile-menu"
- Sign out: data-testid="menu-item-signout" -> clears localStorage and navigates to /auth
- Profile form: input-firstName, button-save-profile
`;
