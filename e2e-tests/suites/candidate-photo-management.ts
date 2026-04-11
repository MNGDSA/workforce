export const name = "Candidate Photo Management";

export const testPlan = `
## Test Suite: Candidate Photo Management

### Test 1: Login and verify avatar edit button
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000002" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="button-avatar-edit" is visible (camera icon for photo management)

### Test 2: Verify photo management mode behavior
8. [Verify]
   - In candidate mode (no active workforce record), clicking the avatar edit button
     should show a file upload dialog or navigate to profile editing
   - Assert data-testid="button-avatar-edit" exists and is clickable
   - Look for the photo upload input (data-testid="input-photo-change-file")
     or "Select New Photo" button (data-testid="button-select-new-photo")

### Test 3: Profile section has photo-related controls
9. [Browser] Click data-testid="button-profile-menu"
10. [Browser] Click data-testid="menu-item-profile"
11. [Verify]
   - Assert profile editing section is visible
   - Assert data-testid="button-save-profile" is visible
   - The profile section shows the candidate's information
`;

export const technicalDocs = `
Candidate: 2000000002 / password123 -> /candidate-portal (profileCompleted=true)

Photo management elements:
- Avatar edit trigger: data-testid="button-avatar-edit" (camera icon overlay on profile photo)
- Photo change file input: data-testid="input-photo-change-file" (hidden file input)
- Select new photo button: data-testid="button-select-new-photo"

Photo crop dialog (shown after selecting a photo):
- Crop overlay: data-testid="photo-crop-overlay"
- Crop dialog: data-testid="photo-crop-dialog"
- Crop close: data-testid="button-crop-close"
- Zoom slider: data-testid="input-crop-zoom"
- Save crop: data-testid="button-crop-save"

Employee mode (with active workforce record):
- Shows employee-specific photo management
- Photo change requests go to admin inbox for approval
- Pending review shows badge on avatar

Candidate mode (no workforce record):
- Direct photo upload without approval workflow
- Photo updates profile immediately
`;
