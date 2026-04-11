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
30. [Browser] In data-testid="select-city", select "Makkah"
31. [Browser] In data-testid="select-region", select "Makkah"
32. [Browser] Click data-testid="button-step1-next"
33. [Verify]
   - Assert step 2 is now visible (data-testid="input-firstName" is no longer visible)
   - Assert data-testid="input-emergency-name" is visible (step 2 field)
   - Assert data-testid="input-emergency-phone" is visible (step 2 field)
   - Assert data-testid="input-iban" is visible (IBAN required field)
   - Assert data-testid="button-step2-next" is visible
   - Assert data-testid="button-step2-back" is visible

### Test 4: Step 2 required field enforcement (emergency + IBAN are required)
34. [New Context] Create a new browser context
35. [Browser] Navigate to /auth
36. [Browser] Enter "2000000004" in data-testid="input-identifier"
37. [Browser] Enter "password123" in data-testid="input-password"
38. [Browser] Click data-testid="button-sign-in"
39. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
40. [Browser] Enter "Ahmed" in data-testid="input-firstName"
41. [Browser] Enter "Al-Harbi" in data-testid="input-lastName"
42. [Browser] Click data-testid="button-gender-male"
43. [Browser] In the nationality field, type and select "Saudi Arabian" from the dropdown
44. [Browser] In data-testid="input-dob", enter a valid date like "1995-01-15"
45. [Browser] In the marital status field, select "Single"
46. [Browser] In data-testid="select-city", select "Makkah"
47. [Browser] In data-testid="select-region", select "Makkah"
48. [Browser] Click data-testid="button-step1-next"
49. [Browser] Wait for step 2 to load (data-testid="input-emergency-name" is visible)
50. [Browser] Clear data-testid="input-emergency-name"
51. [Browser] Clear data-testid="input-emergency-phone"
52. [Browser] Clear data-testid="input-iban"
53. [Browser] Click data-testid="button-step2-next"
54. [Verify]
   - Assert we remain on step 2 (data-testid="input-emergency-name" is still visible)
   - Assert validation errors appear for required fields (emergency contact name, phone, IBAN)

### Test 5: Fill step 2 required fields and advance to step 3
55. [New Context] Create a new browser context
56. [Browser] Navigate to /auth
57. [Browser] Enter "2000000004" in data-testid="input-identifier"
58. [Browser] Enter "password123" in data-testid="input-password"
59. [Browser] Click data-testid="button-sign-in"
60. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
61. [Browser] Enter "Ahmed" in data-testid="input-firstName"
62. [Browser] Enter "Al-Harbi" in data-testid="input-lastName"
63. [Browser] Click data-testid="button-gender-male"
64. [Browser] In the nationality field, type and select "Saudi Arabian" from the dropdown
65. [Browser] In data-testid="input-dob", enter a valid date like "1995-01-15"
66. [Browser] In the marital status field, select "Single"
67. [Browser] In data-testid="select-city", select "Makkah"
68. [Browser] In data-testid="select-region", select "Makkah"
69. [Browser] Click data-testid="button-step1-next"
70. [Browser] Wait for step 2 to load
71. [Browser] Enter "Mohammed Al-Harbi" in data-testid="input-emergency-name"
72. [Browser] Enter "0512345678" in data-testid="input-emergency-phone"
73. [Browser] Enter "Ahmed" in data-testid="input-iban-first-name"
74. [Browser] Enter "Al-Harbi" in data-testid="input-iban-last-name"
75. [Browser] Enter "SA0380000000608010167519" in data-testid="input-iban"
76. [Browser] Click data-testid="button-step2-next"
77. [Verify]
   - Assert step 3 is now visible
   - Assert data-testid="button-step3-submit" is visible
   - Assert data-testid="button-step3-back" is visible

### Test 6: Complete full wizard (all 3 steps) and verify portal loads
78. [New Context] Create a new browser context
79. [Browser] Navigate to /auth
80. [Browser] Enter "2000000004" in data-testid="input-identifier"
81. [Browser] Enter "password123" in data-testid="input-password"
82. [Browser] Click data-testid="button-sign-in"
83. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
84. [Browser] Enter "Ahmed" in data-testid="input-firstName"
85. [Browser] Enter "Al-Harbi" in data-testid="input-lastName"
86. [Browser] Click data-testid="button-gender-male"
87. [Browser] In the nationality field, type and select "Saudi Arabian" from the dropdown
88. [Browser] In data-testid="input-dob", enter a valid date like "1995-01-15"
89. [Browser] In the marital status field, select "Single"
90. [Browser] In data-testid="select-city", select "Makkah"
91. [Browser] In data-testid="select-region", select "Makkah"
92. [Browser] Click data-testid="button-step1-next"
93. [Browser] Wait for step 2
94. [Browser] Enter "Mohammed Al-Harbi" in data-testid="input-emergency-name"
95. [Browser] Enter "0512345678" in data-testid="input-emergency-phone"
96. [Browser] Enter "Ahmed" in data-testid="input-iban-first-name"
97. [Browser] Enter "Al-Harbi" in data-testid="input-iban-last-name"
98. [Browser] Enter "SA0380000000608010167519" in data-testid="input-iban"
99. [Browser] Click data-testid="button-step2-next"
100. [Browser] Wait for step 3
101. [Browser] Click one of the education level buttons (data-testid starting with "button-edu-")
102. [Browser] Click at least one language checkbox (data-testid starting with "checkbox-lang-")
103. [Browser] Click data-testid="button-step3-submit"
104. [Browser] Wait up to 5 seconds for the wizard to finish
105. [Verify]
   - Assert the wizard is gone
   - Assert portal content loads (data-testid="text-portal-title" is visible)
   - Assert URL is still /candidate-portal

### Test 7: Completed-profile employee skips wizard entirely
106. [New Context] Create a new browser context
107. [Browser] Navigate to /auth
108. [Browser] Enter "2000000002" in data-testid="input-identifier"
109. [Browser] Enter "password123" in data-testid="input-password"
110. [Browser] Click data-testid="button-sign-in"
111. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
112. [Verify]
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
- data-testid="input-dob" (date picker, must be 15+)
- Marital status: radio/button group ("Single", "Married", "Divorced", "Widowed")
- data-testid="select-city" (KSA city: "Makkah", "Madinah", "Jeddah", "Riyadh", etc.)
- data-testid="select-region" (KSA region: "Riyadh", "Makkah", "Madinah", "Eastern Province", etc.)
- data-testid="input-email" (optional)

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
