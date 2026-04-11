export const name = "Auth Validation & Forgot Password";

export const testPlan = `
## Test Suite: Auth Validation & Forgot Password

### Test 1: Invalid login shows error
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "9999999999" in the input with data-testid="input-identifier"
4. [Browser] Enter "wrongpassword1" in the input with data-testid="input-password"
5. [Browser] Click the button with data-testid="button-sign-in"
6. [Verify]
   - Assert an error message is visible at data-testid="login-error" containing "Invalid credentials"
   - Assert URL is still /auth

### Test 2: Admin login correctly redirects to /dashboard
7. [Browser] Clear the identifier input and type "1000000001"
8. [Browser] Clear the password input and type "password123"
9. [Browser] Click data-testid="button-sign-in"
10. [Verify]
   - Assert URL changes to /dashboard
   - Assert the page shows "Dashboard" text

### Test 3: Forgot password link and reset form
11. [New Context] Create a new browser context
12. [Browser] Navigate to /auth
13. [Browser] Click the link with data-testid="link-forgot-password"
14. [Verify]
   - Assert a reset form appears with input data-testid="input-reset-national-id"
   - Assert a "Back to login" link is visible at data-testid="link-back-to-login"
15. [Browser] Click data-testid="link-back-to-login"
16. [Verify] Assert the Sign In button is visible again
`;

export const technicalDocs = `
Auth endpoint: POST /api/auth/login with { identifier, password }
Admin: 1000000001 / password123 -> /dashboard
Error display: data-testid="login-error"
Forgot password: data-testid="link-forgot-password"
Reset input: data-testid="input-reset-national-id"
Back link: data-testid="link-back-to-login"
Password validation: min 8 chars
`;
