export const name = "Profile Setup Gate Wizard";

export const testPlan = `
## Test Suite: Profile Setup Gate Wizard

### Test 1: Incomplete-profile candidate sees wizard step 1
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000004" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert profile setup wizard is displayed showing Step 1 (Personal Information)
   - Assert data-testid="input-firstName" is visible
   - Assert data-testid="input-lastName" is visible
   - Assert data-testid="button-step1-next" is visible

### Test 2: Required field enforcement on step 1
8. [New Context] Create a new browser context
9. [Browser] Navigate to /auth
10. [Browser] Enter "2000000004" in data-testid="input-identifier"
11. [Browser] Enter "password123" in data-testid="input-password"
12. [Browser] Click data-testid="button-sign-in"
13. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
14. [Browser] Clear data-testid="input-firstName" (leave empty)
15. [Browser] Clear data-testid="input-lastName" (leave empty)
16. [Browser] Click data-testid="button-step1-next"
17. [Verify]
   - Assert we remain on step 1 (data-testid="input-firstName" is still visible)
   - Assert validation error appears or form prevents advancing

### Test 3: Complete step 1, advance to step 2, verify step 2 fields
18. [New Context] Create a new browser context
19. [Browser] Navigate to /auth
20. [Browser] Enter "2000000004" in data-testid="input-identifier"
21. [Browser] Enter "password123" in data-testid="input-password"
22. [Browser] Click data-testid="button-sign-in"
23. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
24. [Browser] Enter "Ahmed" in data-testid="input-firstName"
25. [Browser] Enter "Al-Harbi" in data-testid="input-lastName"
26. [Browser] Click data-testid="button-gender-male"
27. [Browser] Click data-testid="button-step1-next"
28. [Verify]
   - Assert step 2 is now visible
   - Assert data-testid="input-firstName" is no longer visible (we left step 1)
   - Assert data-testid="input-emergency-name" is visible (step 2 field)
   - Assert data-testid="input-emergency-phone" is visible (step 2 field)
   - Assert data-testid="button-step2-next" is visible
   - Assert data-testid="button-step2-back" is visible

### Test 4: Navigate step 2 to step 3, verify education fields
29. [Browser] Click data-testid="button-step2-next"
30. [Verify]
   - Assert step 3 is now visible
   - Assert data-testid="input-major" is visible (step 3 field)
   - Assert data-testid="button-step3-submit" is visible
   - Assert data-testid="button-step3-back" is visible

### Test 5: Complete profile wizard and verify portal loads
31. [Browser] Click data-testid="button-step3-submit"
32. [Browser] Wait up to 5 seconds for the wizard to complete
33. [Verify]
   - Assert the wizard is gone
   - Assert portal content loads (data-testid="text-portal-title" is visible)
   - Assert URL is still /candidate-portal

### Test 6: Completed-profile candidate skips wizard entirely
34. [New Context] Create a new browser context
35. [Browser] Navigate to /auth
36. [Browser] Enter "2000000002" in data-testid="input-identifier"
37. [Browser] Enter "password123" in data-testid="input-password"
38. [Browser] Click data-testid="button-sign-in"
39. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
40. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="text-portal-title" is visible (portal content, NOT wizard)
   - Assert data-testid="input-firstName" is NOT visible on initial load (wizard is not shown)
`;

export const technicalDocs = `
Incomplete profile candidate: 2000000004 / password123 -> /candidate-portal (profileCompleted=false, shows wizard)
Completed profile candidate: 2000000002 / password123 -> /candidate-portal (profileCompleted=true, skips wizard)

ProfileSetupGate wraps candidate portal content.
If profileCompleted=false: shows multi-step wizard
If profileCompleted=true: renders children (portal content)

Step 1 (Personal Information):
- data-testid="input-firstName" (required)
- data-testid="input-lastName" (required)
- data-testid="button-gender-male", "button-gender-female"
- data-testid="input-dob"
- data-testid="select-region"
- data-testid="input-email"
- data-testid="button-step1-next"

Step 2 (Medical & Financial):
- data-testid="input-chronic-diseases"
- data-testid="input-employer", "input-current-role"
- data-testid="input-iban", "input-iban-first-name", "input-iban-last-name"
- data-testid="input-bank-name", "input-bank-code"
- data-testid="input-emergency-name", "input-emergency-phone"
- data-testid="button-step2-next", "button-step2-back"

Step 3 (Education):
- data-testid="button-edu-*" (education level)
- data-testid="input-major"
- data-testid="checkbox-lang-*" (language checkboxes)
- data-testid="button-step3-submit", "button-step3-back"

After step 3 submit: PATCH /api/candidates/:id updates profile, sets profileCompleted=true
Portal title (post-wizard): data-testid="text-portal-title"
Wizard logout: data-testid="button-logout"
`;
