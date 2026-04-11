export const GEOFENCE_MANAGEMENT_SUITE = {
  name: "Geofence Management",
  testPlan: `
    ## Test Suite: Geofence Management

    ### Test 1: Login and navigate to Geofences page
    1. [New Context] Create a new browser context
    2. [Browser] Navigate to /auth
    3. [Browser] Enter "1000000001" in the identifier input (data-testid="input-identifier")
    4. [Browser] Enter "password123" in the password input (data-testid="input-password")
    5. [Browser] Click the "Sign In" button (data-testid="button-sign-in")
    6. [Browser] Wait for redirect to /dashboard, then navigate to /geofences
    7. [Verify]
       - Assert the Geofences page loads
       - Assert the title "Geofence Zones" is visible (data-testid="text-geofences-title")
       - Assert the "Add Zone" button is visible (data-testid="button-add-zone")
       - Assert the map container is visible (data-testid="geofence-map")
       - Assert existing zones are listed in cards on the right side (each with data-testid="card-zone-*")

    ### Test 2: Verify existing zones display
    8. [Verify]
       - Assert there are zone cards visible (data-testid matching "card-zone-*")
       - Each zone card should show: zone name, Active/Inactive badge, coordinates, and radius
       - Each card should have edit, toggle, and delete buttons

    ### Test 3: Click a zone to see details
    9. [Browser] Click the first zone card
    10. [Verify]
       - Assert a "Zone Details" section appears below the zone list
       - Assert it shows zone name, center coordinates, radius in meters, and active status

    ### Test 4: Create a new geofence zone
    11. [Browser] Click the "Add Zone" button (data-testid="button-add-zone")
    12. [Verify]
       - Assert a dialog opens with title "New Geofence Zone"
       - Assert inputs are visible: zone name (data-testid="input-zone-name"), latitude (data-testid="input-zone-lat"), longitude (data-testid="input-zone-lng"), radius (data-testid="input-zone-radius")
       - Assert the active switch is visible (data-testid="switch-zone-active")
       - Assert "Create Zone" button is visible (data-testid="button-save-zone")
    13. [Browser] Enter "Test Zone E2E" in the zone name input (data-testid="input-zone-name")
    14. [Browser] Clear and enter "21.4300" in the latitude input (data-testid="input-zone-lat")
    15. [Browser] Clear and enter "39.8300" in the longitude input (data-testid="input-zone-lng")
    16. [Browser] Clear and enter "750" in the radius input (data-testid="input-zone-radius")
    17. [Browser] Click "Create Zone" button (data-testid="button-save-zone")
    18. [Verify]
       - Assert the dialog closes
       - Assert a success toast appears with "Zone created"
       - Assert the new zone "Test Zone E2E" appears in the zone list
       - Assert the zone shows coordinates approximately 21.4300, 39.8300 and radius 750m

    ### Test 5: Clean up - delete the test zone
    19. [Browser] Find the card for "Test Zone E2E" and click its delete button (data-testid matching "button-delete-zone-*" for that zone)
    20. [Verify]
       - Assert a success toast appears with "Zone deleted"
       - Assert the "Test Zone E2E" zone is no longer visible in the list
  `,
  technicalDocs: `
    - Login: POST /api/auth/login with { identifier: "1000000001", password: "password123" }
    - Geofences route: /geofences
    - Geofences API: GET /api/geofence-zones?includeInactive=true, POST /api/geofence-zones, PATCH /api/geofence-zones/:id, DELETE /api/geofence-zones/:id
    - Title: data-testid="text-geofences-title"
    - Add button: data-testid="button-add-zone"
    - Map: data-testid="geofence-map"
    - Zone cards: data-testid="card-zone-{id}"
    - Edit: data-testid="button-edit-zone-{id}"
    - Toggle: data-testid="button-toggle-zone-{id}"
    - Delete: data-testid="button-delete-zone-{id}"
    - Form inputs: input-zone-name, input-zone-lat, input-zone-lng, input-zone-radius
    - Active switch: data-testid="switch-zone-active"
    - Save button: data-testid="button-save-zone"
    - Default coords are near Masjid Al-Haram (21.4225, 39.8262)
  `,
};
