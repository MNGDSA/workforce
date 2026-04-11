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
   - Assert wizard is displayed showing "Step 1 of" text
   - Assert data-testid="input-firstName" is visible
   - Assert data-testid="input-lastName" is visible
   - Assert data-testid="button-step1-next" is visible

### Test 2: Step 1 required field enforcement (empty fields)
8. [New Context] Create a new browser context
9. [Browser] Navigate to /auth
10. [Browser] Enter "2000000004" in data-testid="input-identifier"
11. [Browser] Enter "password123" in data-testid="input-password"
12. [Browser] Click data-testid="button-sign-in"
13. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
14. [Browser] Clear data-testid="input-firstName"
15. [Browser] Clear data-testid="input-lastName"
16. [Browser] Click data-testid="button-step1-next"
17. [Verify]
   - Assert we remain on step 1 (data-testid="input-firstName" is still visible)
   - Assert validation errors appear (form does not advance without required fields)

### Test 3: Fill all step 1 required fields and advance to step 2
18. [New Context] Create a new browser context
19. [Browser] Navigate to /auth
20. [Browser] Enter "2000000004" in data-testid="input-identifier"
21. [Browser] Enter "password123" in data-testid="input-password"
22. [Browser] Click data-testid="button-sign-in"
23. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
24. [Browser] Enter "Ahmed" in data-testid="input-firstName"
25. [Browser] Enter "Al-Harbi" in data-testid="input-lastName"
26. [Browser] Click data-testid="button-gender-male"
27. [Browser] In the nationality field, type and select "Saudi Arabian" from the dropdown
28. [Browser] In data-testid="input-dob", enter a valid date like "1995-01-15"
29. [Browser] In the marital status field, select "Single"
30. [Browser] In data-testid="select-region", select "Makkah Region" or first available option
31. [Browser] Click data-testid="button-step1-next"
32. [Verify]
   - Assert step 2 is now visible (data-testid="input-firstName" is no longer visible)
   - Assert data-testid="input-emergency-name" is visible (step 2 field)
   - Assert data-testid="input-emergency-phone" is visible (step 2 field)
   - Assert data-testid="input-iban" is visible (IBAN required field)
   - Assert data-testid="button-step2-next" is visible
   - Assert data-testid="button-step2-back" is visible

### Test 4: Step 2 required field enforcement (emergency + IBAN are required)
33. [Browser] Clear data-testid="input-emergency-name"
34. [Browser] Clear data-testid="input-emergency-phone"
35. [Browser] Clear data-testid="input-iban"
36. [Browser] Click data-testid="button-step2-next"
37. [Verify]
   - Assert we remain on step 2 (data-testid="input-emergency-name" is still visible)
   - Assert validation errors appear for required fields (emergency contact name, phone, IBAN)

### Test 5: Fill step 2 required fields and advance to step 3
38. [Browser] Enter "Mohammed Al-Harbi" in data-testid="input-emergency-name"
39. [Browser] Enter "0512345678" in data-testid="input-emergency-phone"
40. [Browser] Enter "Ahmed" in data-testid="input-iban-first-name"
41. [Browser] Enter "Al-Harbi" in data-testid="input-iban-last-name"
42. [Browser] Enter "SA0380000000608010167519" in data-testid="input-iban"
43. [Browser] Click data-testid="button-step2-next"
44. [Verify]
   - Assert step 3 is now visible
   - Assert data-testid="button-step3-submit" is visible
   - Assert data-testid="button-step3-back" is visible

### Test 6: Complete wizard and verify portal loads
45. [Browser] Click one of the education level buttons (data-testid starting with "button-edu-")
46. [Browser] Click at least one language checkbox (data-testid starting with "checkbox-lang-")
47. [Browser] Click data-testid="button-step3-submit"
48. [Browser] Wait up to 5 seconds for the wizard to finish
49. [Verify]
   - Assert the wizard is gone
   - Assert portal content loads (data-testid="text-portal-title" is visible)
   - Assert URL is still /candidate-portal

### Test 7: Completed-profile candidate skips wizard entirely
50. [New Context] Create a new browser context
51. [Browser] Navigate to /auth
52. [Browser] Enter "2000000002" in data-testid="input-identifier"
53. [Browser] Enter "password123" in data-testid="input-password"
54. [Browser] Click data-testid="button-sign-in"
55. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
56. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="text-portal-title" is visible (portal content, NOT wizard)
   - Assert data-testid="badge-portal-mode" is visible (employee mode badge - this user is an employee)
   - Assert data-testid="input-firstName" is NOT visible on initial load (wizard not shown)
`;

export const technicalDocs = `
Incomplete profile candidate: 2000000004 / password123 -> /candidate-portal (profileCompleted=false, shows wizard)
Completed profile candidate: 2000000002 / password123 -> /candidate-portal (profileCompleted=true, employee mode, skips wizard)

ProfileSetupGate wraps candidate portal content.
If profileCompleted=false: shows multi-step wizard (Step X of Y displayed)
If profileCompleted=true: renders children (portal content)

Step 1 required fields (all must be filled to advance):
- data-testid="input-firstName" (min 2 chars)
- data-testid="input-lastName" (min 2 chars)
- Gender: data-testid="button-gender-male" or "button-gender-female" (must select one)
- Nationality: searchable dropdown (must select a nationality like "Saudi Arabian")
- data-testid="input-dob" (date picker, must be 18+ years old)
- Marital status: radio/button group ("Single", "Married", "Divorced", "Widowed")
- data-testid="select-region" (select a KSA region)
- data-testid="input-email" (optional)

Step 2 required fields (validated by step2Schema):
- data-testid="input-emergency-name" (min 2 chars, "Emergency contact name is required")
- data-testid="input-emergency-phone" (min 7 chars, "Emergency contact phone is required")
- data-testid="input-iban-first-name" (min 1 char, "First name as on debit card is required")
- data-testid="input-iban-last-name" (min 1 char, "Last name as on debit card is required")
- data-testid="input-iban" (must match SA + 22 digits pattern, "IBAN number is required")
- hasChronicDiseases: boolean toggle (defaults to false)
- isEmployedElsewhere: boolean toggle (defaults to false, if true requires employer + role)
Optional: data-testid="input-iban-bank-name", "input-iban-bank-code", "input-employer", "input-current-role"

Step 3 required fields:
- Education level: data-testid="button-edu-*" (must select one: "High School and below" or "University and higher")
- Languages: data-testid="checkbox-lang-*" (must select at least one)
- data-testid="input-major" (required only if education = "University and higher")
- data-testid="button-step3-submit", "button-step3-back"

After submit: PATCH /api/candidates/:id updates profile, sets profileCompleted=true
Post-wizard portal title: data-testid="text-portal-title"
`;
