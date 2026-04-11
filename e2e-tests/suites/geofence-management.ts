export const name = "Geofence Management CRUD";

export const testPlan = `
## Test Suite: Geofence Management

### Test 1: Page loads with map and seeded zones
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
   - Assert the page shows "Masjid Al-Haram" text (seeded zone)

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

### Test 3: Create and then delete a geofence zone
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
30. [Browser] Find the "Test Zone E2E" card and click its delete button (data-testid starting with "button-delete-zone-")
31. [Verify]
   - Assert "Test Zone E2E" is no longer visible in the zone list

### Test 4: Create zone with empty name fails validation
32. [New Context] Create a new browser context
33. [Browser] Navigate to /auth
34. [Browser] Enter "1000000001" in data-testid="input-identifier"
35. [Browser] Enter "password123" in data-testid="input-password"
36. [Browser] Click data-testid="button-sign-in"
37. [Browser] Wait for /dashboard, then navigate to /geofences
38. [Browser] Click data-testid="button-add-zone"
39. [Verify] Assert dialog opens
40. [Browser] Leave data-testid="input-zone-name" empty
41. [Browser] Click data-testid="button-save-zone"
42. [Verify]
   - Assert validation error appears or the dialog stays open (zone is not created without a name)
`;

export const technicalDocs = `
Login: POST /api/auth/login { identifier: "1000000001", password: "password123" }
Geofences route: /geofences
API: GET /api/geofence-zones?includeInactive=true, POST /api/geofence-zones, DELETE /api/geofence-zones/:id

Title: data-testid="text-geofences-title"
Add button: data-testid="button-add-zone"
Map: data-testid="geofence-map"
Zone cards: data-testid="card-zone-{id}"
Delete: data-testid="button-delete-zone-{id}"
Form: input-zone-name, input-zone-lat, input-zone-lng, input-zone-radius
Save: data-testid="button-save-zone"
Seeded zone: "Masjid Al-Haram Complex" (21.4225, 39.8262, 800m radius)
`;
