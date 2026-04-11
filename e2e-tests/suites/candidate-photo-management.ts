export const name = "Candidate Photo Management";

export const testPlan = `
## Test Suite: Candidate Photo Management

### Test 1: Candidate mode shows avatar edit button
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000002" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="button-avatar-edit" is visible (camera icon overlay on profile avatar)
   - Assert data-testid="badge-portal-mode" is visible showing the current mode

### Test 2: Avatar edit triggers photo upload controls
8. [Browser] Hover over or click the avatar area where data-testid="button-avatar-edit" is
9. [Verify]
   - Assert data-testid="button-avatar-edit" is clickable
   - Assert data-testid="input-photo-change-file" exists in the DOM (hidden file input for photo selection)
   - Assert data-testid="button-select-new-photo" is visible (or becomes visible upon interaction)

### Test 3: Profile section accessible with photo-related controls
10. [Browser] Click data-testid="button-profile-menu"
11. [Browser] Click data-testid="menu-item-profile"
12. [Verify]
   - Assert profile editing section is visible
   - Assert data-testid="button-save-profile" is visible
   - Assert the profile form contains the candidate's name and contact information
`;

export const technicalDocs = `
Candidate: 2000000002 / password123 -> /candidate-portal (profileCompleted=true)

Photo management elements:
- Avatar edit trigger: data-testid="button-avatar-edit" (camera icon overlay on profile photo)
- Photo change file input: data-testid="input-photo-change-file" (hidden file input, may be type="file")
- Select new photo button: data-testid="button-select-new-photo" (visible when clicking avatar edit)

Photo crop dialog (shown after selecting a photo file):
- Crop overlay: data-testid="photo-crop-overlay"
- Crop dialog: data-testid="photo-crop-dialog"
- Crop close: data-testid="button-crop-close"
- Zoom slider: data-testid="input-crop-zoom"
- Save crop: data-testid="button-crop-save"

Candidate mode behavior:
- In candidate mode (no active workforce record), photo upload is direct
- In employee mode (active workforce record), photo changes create inbox approval requests
- Employee mode shows "pending review" badge when a photo change is awaiting admin approval

Profile menu: data-testid="button-profile-menu"
Profile option: data-testid="menu-item-profile"
Save: data-testid="button-save-profile"
`;
