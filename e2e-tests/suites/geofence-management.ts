export const name = "Geofence Management CRUD";

export const testPlan = `
## Test Suite: Geofence Management

### Test 1: Navigate to Geofences page
1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "1000000001" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait for /dashboard, then navigate to /geofences
7. [Verify]
   - Assert data-testid="text-geofences-title" shows "Geofence Zones"
   - Assert data-testid="button-add-zone" is visible
   - Assert data-testid="geofence-map" is visible
   - Assert zone cards (data-testid starting with "card-zone-") are listed

### Test 2: View zone details
8. [Browser] Click the first zone card (data-testid starting with "card-zone-")
9. [Verify] A zone details section appears with name, coordinates, radius, and active status

### Test 3: Create a new zone
10. [Browser] Click data-testid="button-add-zone"
11. [Verify] Dialog opens with inputs: input-zone-name, input-zone-lat, input-zone-lng, input-zone-radius
12. [Browser] Enter "Test Zone E2E" in data-testid="input-zone-name"
13. [Browser] Clear and enter "21.4300" in data-testid="input-zone-lat"
14. [Browser] Clear and enter "39.8300" in data-testid="input-zone-lng"
15. [Browser] Clear and enter "750" in data-testid="input-zone-radius"
16. [Browser] Click data-testid="button-save-zone"
17. [Verify]
   - Dialog closes
   - "Test Zone E2E" appears in the zone list

### Test 4: Delete the test zone
18. [Browser] Find "Test Zone E2E" card and click its delete button (data-testid matching "button-delete-zone-*")
19. [Verify] "Test Zone E2E" is no longer visible in the zone list
`;

export const technicalDocs = `
Login: POST /api/auth/login { identifier: "1000000001", password: "password123" }
Geofences route: /geofences
API: GET /api/geofence-zones?includeInactive=true, POST /api/geofence-zones, DELETE /api/geofence-zones/:id
Title: data-testid="text-geofences-title"
Add: data-testid="button-add-zone"
Map: data-testid="geofence-map"
Zone cards: data-testid="card-zone-{id}"
Delete: data-testid="button-delete-zone-{id}"
Form: input-zone-name, input-zone-lat, input-zone-lng, input-zone-radius
Save: data-testid="button-save-zone"
`;
