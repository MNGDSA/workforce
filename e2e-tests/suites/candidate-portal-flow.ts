export const name = "Candidate Portal Flow & Profile Setup";

export const testPlan = `
## Test Suite: Candidate Portal Flow & Profile Setup

### Test 1: Login and verify portal loads
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000002" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert no error messages visible
   - Assert page renders candidate portal content (look for "WORKFORCE" branding or portal layout)

### Test 2: Candidate portal shows profile info or portal sections
8. [Verify]
   - Assert the portal page contains candidate-related content
   - Look for elements like profile info, applications section, or notifications
   - Assert no JavaScript errors or blank page

### Test 3: Logout from candidate portal
9. [Browser] Look for a sign-out or logout button (data-testid="button-logout" or similar)
10. [Browser] Click the logout button if found
11. [Verify]
   - Assert redirect to /auth
   - Assert the login form is visible again
`;

export const technicalDocs = `
Candidate: 2000000002 / password123 -> /candidate-portal
Candidate has profileCompleted=true so skips ProfileSetupGate wizard
Portal route: /candidate-portal (client/src/pages/candidate-portal.tsx)
ProfileSetupGate checks localStorage "workforce_candidate" for candidate data
If profileCompleted=true, renders children (portal content)
If profileCompleted=false, shows 4-step wizard: Personal > Medical > Education > Financial
Logout: removes localStorage "workforce_candidate" and navigates to /auth
Logout button: data-testid="button-logout"
`;
