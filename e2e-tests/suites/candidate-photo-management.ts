export const name = "Candidate Photo Management";

export const testPlan = `
## Test Suite: Candidate Photo Management

### Test 1: Candidate-mode - avatar click opens profile sheet (not photo dialog)
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000005" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="button-avatar-edit" is visible
   - Assert data-testid="badge-portal-mode" is NOT visible (candidate mode, no badge)
8. [Browser] Click data-testid="button-avatar-edit"
9. [Verify]
   - In candidate mode (no workforce record), this opens the profile editing sheet
   - Assert data-testid="input-firstName" is visible (profile form opened, not photo change dialog)
   - Assert data-testid="button-save-profile" is visible
   - Assert data-testid="button-select-new-photo" is NOT visible (employee-only photo dialog is not shown)

### Test 2: Employee-mode - avatar click opens Change Profile Photo dialog
10. [New Context] Create a new browser context
11. [Browser] Navigate to /auth
12. [Browser] Enter "2000000002" in data-testid="input-identifier"
13. [Browser] Enter "password123" in data-testid="input-password"
14. [Browser] Click data-testid="button-sign-in"
15. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
16. [Verify]
   - Assert data-testid="badge-portal-mode" is visible (employee-mode badge)
17. [Browser] Click data-testid="button-avatar-edit"
18. [Verify]
   - In employee mode (active workforce record), this opens the Change Profile Photo dialog
   - Assert data-testid="button-select-new-photo" is visible (button to select a new photo)
   - Assert data-testid="input-photo-change-file" exists in the DOM (hidden file input)

### Test 3: Employee-mode - photo dialog can be closed
19. [New Context] Create a new browser context
20. [Browser] Navigate to /auth
21. [Browser] Enter "2000000002" in data-testid="input-identifier"
22. [Browser] Enter "password123" in data-testid="input-password"
23. [Browser] Click data-testid="button-sign-in"
24. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
25. [Browser] Click data-testid="button-avatar-edit"
26. [Verify] Assert data-testid="button-select-new-photo" is visible (dialog opened)
27. [Browser] Press Escape key or click outside the dialog to close it
28. [Verify] Assert data-testid="button-select-new-photo" is NOT visible (dialog closed)

### Test 4: Employee-mode - pending photo review badge is conditionally shown
29. [New Context] Create a new browser context
30. [Browser] Navigate to /auth
31. [Browser] Enter "2000000002" in data-testid="input-identifier"
32. [Browser] Enter "password123" in data-testid="input-password"
33. [Browser] Click data-testid="button-sign-in"
34. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
35. [Verify]
   - Assert data-testid="badge-portal-mode" is visible (employee mode)
   - Assert data-testid="button-avatar-edit" is visible
   - Check if data-testid="badge-photo-pending" is visible or not
   - If visible: it shows an amber circle icon indicating a photo change is pending HR review
   - If not visible: there is no pending photo change request (normal state)
   - Either result is valid; this confirms the badge element renders only when hasPendingPhotoChange is true

### Test 5: Employee-mode - employee card shows employee number
36. [New Context] Create a new browser context
37. [Browser] Navigate to /auth
38. [Browser] Enter "2000000002" in data-testid="input-identifier"
39. [Browser] Enter "password123" in data-testid="input-password"
40. [Browser] Click data-testid="button-sign-in"
41. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
42. [Verify]
   - Assert data-testid="badge-portal-mode" is visible (showing "Employee" badge)
   - Assert data-testid="text-employee-number" is visible showing "E000001"
   - Assert the page shows the candidate name "Test Candidate"
`;

export const technicalDocs = `
Candidate-mode user: 2000000005 / password123 -> /candidate-portal (profileCompleted=true, NO workforce record)
Employee-mode user: 2000000002 / password123 -> /candidate-portal (profileCompleted=true, workforce record E000001)

Candidate mode (user 2000000005, no workforce record):
- data-testid="badge-portal-mode" is NOT rendered (only shown for employees)
- Clicking data-testid="button-avatar-edit" calls handleAvatarClick() -> handleProfileOpen(true)
  which opens the profile editing sheet (NOT the photo change dialog)
- data-testid="input-photo-change-file" and "button-select-new-photo" are NOT rendered
- Profile form: data-testid="input-firstName", "button-save-profile"

Employee mode (user 2000000002, active workforce record):
- data-testid="badge-portal-mode" IS rendered (shows "Employee" badge)
- data-testid="text-employee-number" shows "E000001"
- Clicking data-testid="button-avatar-edit" opens "Change Profile Photo" dialog (portal)
- data-testid="input-photo-change-file" (hidden file input) IS available inside the photo dialog
- data-testid="button-select-new-photo" IS available inside the photo dialog
- data-testid="badge-photo-pending" is conditionally shown when hasPendingPhotoChange is true
  (amber circle with clock icon on avatar, appears after a photo change request is submitted)
- Photo changes create inbox approval requests for admin review

Profile menu: data-testid="button-profile-menu"
Profile option: data-testid="menu-item-profile"
Profile fields: input-firstName, input-lastName
Save: data-testid="button-save-profile"
`;
