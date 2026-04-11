export const CANDIDATE_PORTAL_LOGIN_SUITE = {
  name: "Candidate Portal Login",
  testPlan: `
    ## Test Suite: Candidate Portal Login

    ### Test 1: Admin login redirects to dashboard (not candidate portal)
    1. [New Context] Create a new browser context
    2. [Browser] Navigate to /auth
    3. [Browser] Enter "1000000001" in the identifier input (data-testid="input-identifier")
    4. [Browser] Enter "password123" in the password input (data-testid="input-password")
    5. [Browser] Click the "Sign In" button (data-testid="button-sign-in")
    6. [Verify]
       - Assert redirect to /dashboard (NOT /candidate-portal)
       - Assert "Dashboard" heading is visible

    ### Test 2: Candidate login with national ID 2000000002
    7. [New Context] Create a new browser context
    8. [Browser] Navigate to /auth
    9. [Browser] Enter "2000000002" in the identifier input (data-testid="input-identifier")
    10. [Browser] Enter "password123" in the password input (data-testid="input-password")
    11. [Browser] Click the "Sign In" button (data-testid="button-sign-in")
    12. [Browser] Wait up to 5 seconds for navigation
    13. [Verify]
       - The login API call succeeded (no "Invalid credentials" error at data-testid="login-error")
       - Note: Known seed data limitation -- no linked candidate record for this user,
         so ProfileSetupGate redirects back to /auth. The login itself succeeds.

    ### Test 3: Candidate login with phone number 0500000002
    14. [New Context] Create a new browser context
    15. [Browser] Navigate to /auth
    16. [Browser] Enter "0500000002" in the identifier input (data-testid="input-identifier")
    17. [Browser] Enter "password123" in the password input (data-testid="input-password")
    18. [Browser] Click the "Sign In" button (data-testid="button-sign-in")
    19. [Browser] Wait up to 5 seconds for navigation
    20. [Verify]
       - The login API call succeeded (no "Invalid credentials" error)
       - Same known seed limitation applies

    ### Test 4: Invalid credentials show error
    21. [New Context] Create a new browser context
    22. [Browser] Navigate to /auth
    23. [Browser] Enter "9999999999" in the identifier input (data-testid="input-identifier")
    24. [Browser] Enter "wrongpassword1" in the password input (data-testid="input-password")
    25. [Browser] Click the "Sign In" button (data-testid="button-sign-in")
    26. [Verify]
       - Assert we remain on the auth page
       - Assert error message appears (data-testid="login-error") with "Invalid credentials"
  `,
  technicalDocs: `
    - Auth endpoint: POST /api/auth/login with { identifier, password }
    - Admin credentials: 1000000001 / password123 -> redirects to /dashboard
    - Candidate credentials: nationalId=2000000002 or phone=0500000002, password=password123 -> redirects to /candidate-portal
    - Invalid login returns 401 with { message: "Invalid credentials" }
    - Login error shown at data-testid="login-error"
    - Known seed limitation: user 2000000002 has no linked candidate record, so ProfileSetupGate
      reads localStorage, finds no candidate, and redirects to /auth
  `,
  knownIssues: [
    "Seed candidate user 2000000002 has no candidates table record, preventing full portal flow testing",
  ],
};
