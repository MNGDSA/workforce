export const name = "Profile Setup Gate Wizard";

export const testPlan = `
## Test Suite: Profile Setup Gate Wizard

### Test 1: Candidate with incomplete profile sees wizard
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000004" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert a profile setup wizard is displayed (NOT the main portal content)
   - Assert the wizard shows Step 1 heading (look for "Personal" or "Personal Information" text)
   - Assert data-testid="input-firstName" is visible (first name input for step 1)
   - Assert data-testid="input-lastName" is visible (last name input for step 1)

### Test 2: Wizard step 1 requires first and last name
8. [Browser] Clear data-testid="input-firstName" and leave it empty
9. [Browser] Clear data-testid="input-lastName" and leave it empty
10. [Browser] Click data-testid="button-step1-next"
11. [Verify]
   - Assert form validation prevents advancing (validation error appears or we remain on step 1)
   - Assert data-testid="input-firstName" is still visible (we did not advance)

### Test 3: Fill step 1 and verify gender selection
12. [Browser] Enter "Ahmed" in data-testid="input-firstName"
13. [Browser] Enter "Al-Harbi" in data-testid="input-lastName"
14. [Browser] Click data-testid="button-gender-male" to select male gender
15. [Verify]
   - Assert data-testid="button-gender-male" appears selected (has active/highlighted styling)
   - Assert first name and last name are populated

### Test 4: Candidate with completed profile skips wizard
16. [New Context] Create a new browser context
17. [Browser] Navigate to /auth
18. [Browser] Enter "2000000002" in data-testid="input-identifier"
19. [Browser] Enter "password123" in data-testid="input-password"
20. [Browser] Click data-testid="button-sign-in"
21. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
22. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="text-portal-title" is visible (main portal content, NOT wizard)
   - Assert data-testid="input-firstName" is NOT visible (wizard is not shown)
`;

export const technicalDocs = `
Incomplete profile candidate: 2000000004 / password123 -> /candidate-portal (profileCompleted=false, shows wizard)
Completed profile candidate: 2000000002 / password123 -> /candidate-portal (profileCompleted=true, skips wizard)

ProfileSetupGate checks localStorage "workforce_candidate" for profileCompleted flag.
If false: shows 4-step wizard
If true: renders children (portal content)

Step 1 (Personal Information) elements:
- data-testid="input-firstName" (required)
- data-testid="input-lastName" (required)
- data-testid="button-gender-male", "button-gender-female"
- data-testid="input-dob" (date picker)
- data-testid="select-region"
- data-testid="input-email"
- data-testid="button-step1-next" (advance to step 2)

Step 2 (Medical & Financial):
- data-testid="input-chronic-diseases"
- data-testid="input-employer"
- data-testid="input-current-role"
- data-testid="input-iban", "input-iban-first-name", "input-iban-last-name"
- data-testid="input-bank-name", "input-bank-code"
- data-testid="input-emergency-name", "input-emergency-phone"
- data-testid="button-step2-next", "button-step2-back"

Step 3 (Education):
- data-testid="button-edu-*" (education level buttons)
- data-testid="input-major"
- data-testid="checkbox-lang-*" (language checkboxes)
- data-testid="button-step3-submit", "button-step3-back"

Portal title (shown when profile is complete): data-testid="text-portal-title"
Wizard logout: data-testid="button-logout"
`;
