export const name = "Candidate Photo Management";

export const testPlan = `
## Test Suite: Candidate Photo Management

### Test 1: Candidate mode - avatar click opens profile sheet (not photo dialog)
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000002" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="button-avatar-edit" is visible (avatar click area with camera icon on hover)
8. [Browser] Click data-testid="button-avatar-edit"
9. [Verify]
   - In candidate mode (no workforce record), this opens the profile editing sheet
   - Assert data-testid="input-firstName" is visible (profile form opened)
   - Assert data-testid="button-save-profile" is visible
   - Assert data-testid="photo-crop-dialog" is NOT visible (no direct photo crop in candidate mode)

### Test 2: Candidate mode - profile sheet shows candidate information
10. [New Context] Create a new browser context
11. [Browser] Navigate to /auth
12. [Browser] Enter "2000000002" in data-testid="input-identifier"
13. [Browser] Enter "password123" in data-testid="input-password"
14. [Browser] Click data-testid="button-sign-in"
15. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
16. [Browser] Click data-testid="button-profile-menu"
17. [Browser] Click data-testid="menu-item-profile"
18. [Verify]
   - Assert data-testid="input-firstName" is visible with "Test" (candidate first name)
   - Assert data-testid="input-lastName" is visible with "Candidate" (candidate last name)
   - Assert data-testid="button-save-profile" is visible
   - Assert data-testid="button-change-password" is visible

### Test 3: Candidate mode - avatar shows candidate initials or photo
19. [New Context] Create a new browser context
20. [Browser] Navigate to /auth
21. [Browser] Enter "2000000002" in data-testid="input-identifier"
22. [Browser] Enter "password123" in data-testid="input-password"
23. [Browser] Click data-testid="button-sign-in"
24. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
25. [Verify]
   - Assert data-testid="button-avatar-edit" is visible
   - Assert the avatar area contains either an image or initials fallback text
   - Assert the page shows the candidate name "Test Candidate"
`;

export const technicalDocs = `
Candidate: 2000000002 / password123 -> /candidate-portal (profileCompleted=true, fullNameEn="Test Candidate")

IMPORTANT: Test candidate 2000000002 is in CANDIDATE mode (no active workforce record).
In candidate mode:
- Clicking data-testid="button-avatar-edit" calls handleAvatarClick() which calls handleProfileOpen(true)
  opening the profile editing sheet — NOT the photo change dialog
- data-testid="input-photo-change-file" and "button-select-new-photo" are NOT rendered
  (they are inside an employee-only Dialog component: isEmployee && createPortal(...))
- data-testid="badge-portal-mode" is NOT rendered (only shown for employees)

In employee mode (requires active workforce record):
- Clicking avatar opens "Change Profile Photo" dialog with file input and crop
- data-testid="input-photo-change-file" (hidden file input) and "button-select-new-photo" are available
- Photo changes create inbox approval requests for admin review
- Pending photo change shows amber "Pending Review" badge

Avatar element: data-testid="button-avatar-edit" (always rendered)
Profile menu: data-testid="button-profile-menu"
Profile option: data-testid="menu-item-profile"
Profile fields: input-firstName, input-lastName
Save: data-testid="button-save-profile"
Change password: data-testid="button-change-password"
`;
