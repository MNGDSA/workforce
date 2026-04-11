export const name = "Candidate Portal Login & Redirect";

export const testPlan = `
## Test Suite: Candidate Portal Login & Redirect

### Test 1: Candidate login with national ID redirects to portal
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000002" in the input with data-testid="input-identifier"
4. [Browser] Enter "password123" in the input with data-testid="input-password"
5. [Browser] Click the button with data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation
7. [Verify]
   - Assert no "Invalid credentials" error at data-testid="login-error"
   - Assert URL changed to /candidate-portal (candidate has a linked record with profileCompleted=true)

### Test 2: Candidate login with phone number
8. [New Context] Create a new browser context
9. [Browser] Navigate to /auth
10. [Browser] Enter "0500000002" in the input with data-testid="input-identifier"
11. [Browser] Enter "password123" in the input with data-testid="input-password"
12. [Browser] Click the button with data-testid="button-sign-in"
13. [Browser] Wait up to 5 seconds
14. [Verify]
   - Assert no error message visible at data-testid="login-error"

### Test 3: Invalid credentials show error
15. [New Context] Create a new browser context
16. [Browser] Navigate to /auth
17. [Browser] Enter "9999999999" in data-testid="input-identifier"
18. [Browser] Enter "wrongpassword1" in data-testid="input-password"
19. [Browser] Click data-testid="button-sign-in"
20. [Verify]
   - Assert error visible at data-testid="login-error" containing "Invalid credentials"
   - Assert URL is still /auth
`;

export const technicalDocs = `
Auth endpoint: POST /api/auth/login with { identifier, password }
Candidate: nationalId=2000000002 or phone=0500000002, password=password123
Login returns { user, candidate } where candidate has id, profileCompleted etc.
Candidate with profileCompleted=true goes directly to /candidate-portal
Client stores candidate in localStorage key "workforce_candidate"
ProfileSetupGate checks localStorage for candidate data
Error display: data-testid="login-error"
`;
