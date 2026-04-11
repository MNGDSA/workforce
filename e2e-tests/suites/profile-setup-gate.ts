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
33. [New Context] Create a new browser context
34. [Browser] Navigate to /auth
35. [Browser] Enter "2000000004" in data-testid="input-identifier"
36. [Browser] Enter "password123" in data-testid="input-password"
37. [Browser] Click data-testid="button-sign-in"
38. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
39. [Browser] Enter "Ahmed" in data-testid="input-firstName"
40. [Browser] Enter "Al-Harbi" in data-testid="input-lastName"
41. [Browser] Click data-testid="button-gender-male"
42. [Browser] In the nationality field, type and select "Saudi Arabian" from the dropdown
43. [Browser] In data-testid="input-dob", enter a valid date like "1995-01-15"
44. [Browser] In the marital status field, select "Single"
45. [Browser] In data-testid="select-region", select "Makkah Region"
46. [Browser] Click data-testid="button-step1-next"
47. [Browser] Wait for step 2 to load (data-testid="input-emergency-name" is visible)
48. [Browser] Clear data-testid="input-emergency-name"
49. [Browser] Clear data-testid="input-emergency-phone"
50. [Browser] Clear data-testid="input-iban"
51. [Browser] Click data-testid="button-step2-next"
52. [Verify]
   - Assert we remain on step 2 (data-testid="input-emergency-name" is still visible)
   - Assert validation errors appear for required fields (emergency contact name, phone, IBAN)

### Test 5: Fill step 2 required fields and advance to step 3
53. [New Context] Create a new browser context
54. [Browser] Navigate to /auth
55. [Browser] Enter "2000000004" in data-testid="input-identifier"
56. [Browser] Enter "password123" in data-testid="input-password"
57. [Browser] Click data-testid="button-sign-in"
58. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
59. [Browser] Enter "Ahmed" in data-testid="input-firstName"
60. [Browser] Enter "Al-Harbi" in data-testid="input-lastName"
61. [Browser] Click data-testid="button-gender-male"
62. [Browser] In the nationality field, type and select "Saudi Arabian" from the dropdown
63. [Browser] In data-testid="input-dob", enter a valid date like "1995-01-15"
64. [Browser] In the marital status field, select "Single"
65. [Browser] In data-testid="select-region", select "Makkah Region"
66. [Browser] Click data-testid="button-step1-next"
67. [Browser] Wait for step 2 to load
68. [Browser] Enter "Mohammed Al-Harbi" in data-testid="input-emergency-name"
69. [Browser] Enter "0512345678" in data-testid="input-emergency-phone"
70. [Browser] Enter "Ahmed" in data-testid="input-iban-first-name"
71. [Browser] Enter "Al-Harbi" in data-testid="input-iban-last-name"
72. [Browser] Enter "SA0380000000608010167519" in data-testid="input-iban"
73. [Browser] Click data-testid="button-step2-next"
74. [Verify]
   - Assert step 3 is now visible
   - Assert data-testid="button-step3-submit" is visible
   - Assert data-testid="button-step3-back" is visible

### Test 6: Complete full wizard (all 3 steps) and verify portal loads
75. [New Context] Create a new browser context
76. [Browser] Navigate to /auth
77. [Browser] Enter "2000000004" in data-testid="input-identifier"
78. [Browser] Enter "password123" in data-testid="input-password"
79. [Browser] Click data-testid="button-sign-in"
80. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
81. [Browser] Enter "Ahmed" in data-testid="input-firstName"
82. [Browser] Enter "Al-Harbi" in data-testid="input-lastName"
83. [Browser] Click data-testid="button-gender-male"
84. [Browser] In the nationality field, type and select "Saudi Arabian" from the dropdown
85. [Browser] In data-testid="input-dob", enter a valid date like "1995-01-15"
86. [Browser] In the marital status field, select "Single"
87. [Browser] In data-testid="select-region", select "Makkah Region"
88. [Browser] Click data-testid="button-step1-next"
89. [Browser] Wait for step 2
90. [Browser] Enter "Mohammed Al-Harbi" in data-testid="input-emergency-name"
91. [Browser] Enter "0512345678" in data-testid="input-emergency-phone"
92. [Browser] Enter "Ahmed" in data-testid="input-iban-first-name"
93. [Browser] Enter "Al-Harbi" in data-testid="input-iban-last-name"
94. [Browser] Enter "SA0380000000608010167519" in data-testid="input-iban"
95. [Browser] Click data-testid="button-step2-next"
96. [Browser] Wait for step 3
97. [Browser] Click one of the education level buttons (data-testid starting with "button-edu-")
98. [Browser] Click at least one language checkbox (data-testid starting with "checkbox-lang-")
99. [Browser] Click data-testid="button-step3-submit"
100. [Browser] Wait up to 5 seconds for the wizard to finish
101. [Verify]
   - Assert the wizard is gone
   - Assert portal content loads (data-testid="text-portal-title" is visible)
   - Assert URL is still /candidate-portal

### Test 7: Completed-profile employee skips wizard entirely
102. [New Context] Create a new browser context
103. [Browser] Navigate to /auth
104. [Browser] Enter "2000000002" in data-testid="input-identifier"
105. [Browser] Enter "password123" in data-testid="input-password"
106. [Browser] Click data-testid="button-sign-in"
107. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
108. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="text-portal-title" is visible (portal content, NOT wizard)
   - Assert data-testid="badge-portal-mode" is visible (employee mode badge)
   - Assert data-testid="input-firstName" is NOT visible on initial load (wizard not shown)
`;

export const technicalDocs = `
Incomplete profile candidate: 2000000004 / password123 -> /candidate-portal (profileCompleted=false, shows wizard)
Completed profile employee: 2000000002 / password123 -> /candidate-portal (profileCompleted=true, employee mode, skips wizard)

ProfileSetupGate wraps candidate portal content.
If profileCompleted=false: shows multi-step wizard (Step X of Y displayed)
If profileCompleted=true: renders children (portal content)

Step 1 required fields (all must be filled to advance):
- data-testid="input-firstName" (min 2 chars)
- data-testid="input-lastName" (min 2 chars)
- Gender: data-testid="button-gender-male" or "button-gender-female"
- Nationality: searchable dropdown
- data-testid="input-dob" (date picker, must be 18+)
- Marital status: radio/button group
- data-testid="select-region" (KSA region)

Step 2 required fields (validated by step2Schema):
- data-testid="input-emergency-name" (min 2 chars)
- data-testid="input-emergency-phone" (min 7 chars)
- data-testid="input-iban-first-name" (min 1 char)
- data-testid="input-iban-last-name" (min 1 char)
- data-testid="input-iban" (SA + 22 digits pattern)
- hasChronicDiseases: boolean (defaults false)
- isEmployedElsewhere: boolean (defaults false)

Step 3 required fields:
- Education level: data-testid="button-edu-*"
- Languages: data-testid="checkbox-lang-*"
`;
