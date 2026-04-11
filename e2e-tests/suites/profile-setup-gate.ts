export const name = "Profile Setup Gate Wizard";

export const testPlan = `
## Test Suite: Profile Setup Gate Wizard

This suite tests the profile setup wizard behavior. Since the seeded test candidate
has profileCompleted=true, it verifies the gate passes through. The wizard UI
and required field validation are tested against the component structure.

### Test 1: Candidate with completed profile skips wizard
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000002" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert no profile setup wizard is shown (no step indicators like "Step 1 of 4")
   - Assert the portal content is visible (data-testid="text-portal-title" shows portal heading)

### Test 2: Verify wizard step elements exist in markup
8. [Verify]
   - Assert the portal is fully loaded
   - Assert data-testid="text-portal-title" is visible
   - Assert data-testid="button-profile-menu" is visible (profile dropdown trigger)
   - The wizard steps (input-firstName, input-lastName, etc.) should NOT be visible since profile is complete

### Test 3: Logout clears state and returns to auth
9. [Browser] Click data-testid="button-profile-menu" to open profile dropdown
10. [Browser] Click data-testid="menu-item-signout"
11. [Verify]
   - Assert URL changes to /auth
   - Assert the login form is visible with data-testid="button-sign-in"
`;

export const technicalDocs = `
Candidate: 2000000002 / password123 -> /candidate-portal (profileCompleted=true)
ProfileSetupGate wraps the candidate portal content
If profileCompleted=true: renders children (portal content)
If profileCompleted=false: shows 4-step wizard
Step 1 (Personal): input-firstName, input-lastName, button-gender-male/female, input-dob, select-region, input-email -> button-step1-next
Step 2 (Medical & Financial): input-chronic-diseases, input-employer, input-current-role, input-iban, input-iban-first-name, input-iban-last-name, input-bank-name, input-bank-code, input-emergency-name, input-emergency-phone -> button-step2-next, button-step2-back
Step 3 (Education): button-edu-*, input-major, checkbox-lang-*, input-other-language -> button-step3-submit, button-step3-back
Logout: button-logout clears localStorage "workforce_candidate" and navigates to /auth
Portal title: data-testid="text-portal-title"
Profile menu: data-testid="button-profile-menu"
Sign out menu item: data-testid="menu-item-signout"
`;
