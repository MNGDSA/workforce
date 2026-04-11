export const name = "Geofence Management CRUD";

export const testPlan = `
## Test Suite: Geofence Management

### Test 1: Page loads with map and zones
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
   - Assert at least one card with data-testid starting with "card-zone-" is visible

### Test 2: Zone details panel opens on click
8. [New Context] Create a new browser context
9. [Browser] Navigate to /auth
10. [Browser] Enter "1000000001" in data-testid="input-identifier"
11. [Browser] Enter "password123" in data-testid="input-password"
12. [Browser] Click data-testid="button-sign-in"
13. [Browser] Wait for /dashboard, then navigate to /geofences
14. [Browser] Click the first card with data-testid starting with "card-zone-"
15. [Verify]
   - Assert a zone details section appears showing zone name, coordinates, radius, and active status

### Test 3: Create a new zone via form
16. [New Context] Create a new browser context
17. [Browser] Navigate to /auth
18. [Browser] Enter "1000000001" in data-testid="input-identifier"
19. [Browser] Enter "password123" in data-testid="input-password"
20. [Browser] Click data-testid="button-sign-in"
21. [Browser] Wait for /dashboard, then navigate to /geofences
22. [Browser] Click data-testid="button-add-zone"
23. [Verify]
   - Assert dialog opens with data-testid="input-zone-name" visible
   - Assert data-testid="input-zone-lat" is visible
   - Assert data-testid="input-zone-lng" is visible
   - Assert data-testid="input-zone-radius" is visible
   - Assert data-testid="button-save-zone" is visible
24. [Browser] Enter "Test Zone E2E" in data-testid="input-zone-name"
25. [Browser] Clear and enter "21.4300" in data-testid="input-zone-lat"
26. [Browser] Clear and enter "39.8300" in data-testid="input-zone-lng"
27. [Browser] Clear and enter "750" in data-testid="input-zone-radius"
28. [Browser] Click data-testid="button-save-zone"
29. [Verify]
   - Assert the dialog closes
   - Assert "Test Zone E2E" appears in the zone list

### Test 4: Delete the created zone
30. [Browser] Find the "Test Zone E2E" card and click its delete button (data-testid starting with "button-delete-zone-")
31. [Verify]
   - Assert "Test Zone E2E" is no longer visible in the zone list

### Test 5: Create zone with missing name shows validation error
32. [Browser] Click data-testid="button-add-zone"
33. [Verify] Assert dialog opens
34. [Browser] Leave data-testid="input-zone-name" empty
35. [Browser] Click data-testid="button-save-zone"
36. [Verify]
   - Assert validation error appears or the zone is not created
   - Assert the dialog remains open (save did not succeed)
`;

export const technicalDocs = `
Login: POST /api/auth/login { identifier: "1000000001", password: "password123" }
Geofences route: /geofences
API: GET /api/geofence-zones?includeInactive=true, POST /api/geofence-zones, DELETE /api/geofence-zones/:id

Title: data-testid="text-geofences-title"
Add button: data-testid="button-add-zone"
Map: data-testid="geofence-map"
Zone cards: data-testid="card-zone-{id}"
Edit: data-testid="button-edit-zone-{id}"
Toggle: data-testid="button-toggle-zone-{id}"
Delete: data-testid="button-delete-zone-{id}"
Form inputs: input-zone-name, input-zone-lat, input-zone-lng, input-zone-radius
Active switch: data-testid="switch-zone-active"
Save button: data-testid="button-save-zone"
Default coords near Masjid Al-Haram: 21.4225, 39.8262
Seeded zone: "Masjid Al-Haram Complex" with 800m radius
`;
