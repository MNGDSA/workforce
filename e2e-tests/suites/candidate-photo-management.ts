export const name = "Candidate Photo Management";

export const testPlan = `
## Test Suite: Candidate Photo Management

### Test 1: Candidate mode shows avatar edit button and photo controls
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000002" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="button-avatar-edit" is visible (camera icon for photo management)
   - Assert data-testid="badge-portal-mode" is visible showing current mode

### Test 2: Avatar edit area has photo input and select button
8. [New Context] Create a new browser context
9. [Browser] Navigate to /auth
10. [Browser] Enter "2000000002" in data-testid="input-identifier"
11. [Browser] Enter "password123" in data-testid="input-password"
12. [Browser] Click data-testid="button-sign-in"
13. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
14. [Browser] Look at the avatar/photo section of the page
15. [Verify]
   - Assert data-testid="button-avatar-edit" exists and is interactable
   - Assert data-testid="input-photo-change-file" exists in the DOM (hidden file input element with type="file")
   - Assert data-testid="button-select-new-photo" is visible or exists (button to trigger file selection)

### Test 3: Profile section accessible from photo area
16. [New Context] Create a new browser context
17. [Browser] Navigate to /auth
18. [Browser] Enter "2000000002" in data-testid="input-identifier"
19. [Browser] Enter "password123" in data-testid="input-password"
20. [Browser] Click data-testid="button-sign-in"
21. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
22. [Browser] Click data-testid="button-profile-menu"
23. [Browser] Click data-testid="menu-item-profile"
24. [Verify]
   - Assert profile editing section is visible
   - Assert data-testid="input-firstName" is visible with the candidate's first name
   - Assert data-testid="button-save-profile" is visible
   - Assert data-testid="button-change-password" is visible
`;

export const technicalDocs = `
Candidate (no workforce record): 2000000002 / password123 -> /candidate-portal (profileCompleted=true)

In candidate mode (no active workforce record):
- data-testid="button-avatar-edit" shows camera icon for direct photo upload
- data-testid="input-photo-change-file" is a hidden file input (type="file") for photo selection
- data-testid="button-select-new-photo" triggers the file picker
- After selecting a photo, photo-crop-dialog appears for cropping
- Crop dialog: data-testid="photo-crop-overlay", "photo-crop-dialog", "button-crop-close", "input-crop-zoom", "button-crop-save"
- Photo upload is direct without approval workflow

In employee mode (with active workforce record):
- Camera icon triggers "Change Profile Photo" dialog instead of direct upload
- Photo changes create inbox approval requests for admin review
- While a change request is pending, an amber "Pending Review" badge appears on the avatar
- Test candidate 2000000002 does not have a workforce record, so employee-mode cannot be tested
  with this seed data. Employee-mode behavior is verified through the inbox attendance review suite
  which tests the admin-side approval workflow for photo change requests.

Profile menu: data-testid="button-profile-menu"
Profile option: data-testid="menu-item-profile"
Save: data-testid="button-save-profile"
Change password: data-testid="button-change-password"
`;
