// Task #161 — e2e coverage for the auto-rotation toast + cropper
// reload UX (Task #155). Mocks the upload POST so the test is
// deterministic regardless of AWS Rekognition behaviour.

export const name = "Candidate Photo Auto-Rotation Toast";

export const testPlan = `
## Test Suite: Candidate Photo Auto-Rotation Toast

Background:
  We mock the upload POST to deterministically return rotationApplied
  so this test does NOT depend on AWS Rekognition behaviour or on
  having a sideways JPEG that actually triggers the rescue path. The
  mock returns a real GET-able URL pointing at the candidate's
  existing photo, and we also intercept that GET to return a known
  1x1 JPEG so the cropper reload (loadServerPhotoForCropper) succeeds
  reliably.

Helpers (run once at the start of each context, before any uploads):

  // 1x1 white JPEG — minimal valid bytes for the cropper reload
  const TINY_JPEG_BASE64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/AABEIAAEAAQMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/2gAMAwEAAhEDEQA/AP38ooooAKKKKACiiigD/9k=";

  async function setUpRotationMock(page) {
    // Intercept the upload POST and force a rotated response.
    await page.route("**/api/candidates/*/documents", async (route, request) => {
      if (request.method() !== "POST") return route.continue();
      // Use a stable in-test URL for the cropper reload to fetch.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: "/__test/rotated.jpg",
          docType: "photo",
          pendingReview: true,
          changeRequestId: "test-change-id",
          rotationApplied: 90,
          qualityResult: { passed: true, checks: [] },
          message: "Photo submitted for review (mocked).",
        }),
      });
    });
    // Intercept the cropper's reload fetch so loadServerPhotoForCropper
    // gets a real, decodable JPEG (otherwise it returns null and the
    // cropper closes instead of reloading).
    await page.route("**/__test/rotated.jpg*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/jpeg",
        body: Buffer.from(TINY_JPEG_BASE64, "base64"),
      });
    });
  }

  async function uploadFakeSidewaysPhoto(page) {
    // Set the photo input to a tiny PNG (bytes don't matter — we
    // mocked the route). Use page.setInputFiles to drive the hidden
    // file input directly.
    const tinyPngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    await page.setInputFiles('[data-testid="input-photo-change-file"]', {
      name: "sideways.png",
      mimeType: "image/png",
      buffer: Buffer.from(tinyPngBase64, "base64"),
    });
  }

### Test 1: EN — toast and cropper reload after server rotation rescue
1. [New Context] Create a new browser context
2. [Browser] Run setUpRotationMock(page) BEFORE navigating, so the mocks are armed.
3. [Browser] Navigate to /auth
4. [Browser] Enter "2000000002" in data-testid="input-identifier"
5. [Browser] Enter "password123" in data-testid="input-password"
6. [Browser] Click data-testid="button-sign-in"
7. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
8. [Verify] Assert URL is /candidate-portal and data-testid="badge-portal-mode" is visible
9. [Browser] Click data-testid="button-avatar-edit" to open the Change Profile Photo dialog
10. [Verify] Assert data-testid="button-select-new-photo" is visible (dialog open)
11. [Browser] Run uploadFakeSidewaysPhoto(page) — this sets the hidden file input.
    The portal will open the cropper automatically once the file is read.
12. [Verify]
    - Wait up to 5 seconds for data-testid="photo-crop-dialog" to be visible
13. [Browser] Click data-testid="button-crop-save" to submit the cropped photo
14. [Verify]
    - Wait up to 5 seconds for a toast containing the EN title text
      "We rotated your photo to fit upright" to appear anywhere on the page
    - Assert the toast description contains "Your camera uploaded the photo sideways"
    - Assert data-testid="photo-crop-dialog" is STILL visible — the cropper
      reloaded with the saved upright copy rather than closing. This proves
      loadServerPhotoForCropper ran successfully against /__test/rotated.jpg.

### Test 2: AR — same flow, asserts the Arabic toast strings
15. [New Context] Create a new browser context
16. [Browser] Run setUpRotationMock(page) BEFORE navigating.
17. [Browser] Navigate to /auth
18. [Browser] Enter "2000000002" in data-testid="input-identifier"
19. [Browser] Enter "password123" in data-testid="input-password"
20. [Browser] Click data-testid="button-sign-in"
21. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
22. [Browser] Click data-testid="button-language-switcher" to switch the locale to AR.
    (The button shows the OPPOSITE language label — when on EN it says "AR", click
    it once to switch the portal to Arabic.)
23. [Verify] Wait up to 3 seconds for the page to re-render in Arabic
    (e.g. data-testid="badge-portal-mode" still visible but with Arabic text).
24. [Browser] Click data-testid="button-avatar-edit"
25. [Verify] Assert data-testid="button-select-new-photo" is visible
26. [Browser] Run uploadFakeSidewaysPhoto(page)
27. [Verify] Wait up to 5 seconds for data-testid="photo-crop-dialog" to be visible
28. [Browser] Click data-testid="button-crop-save"
29. [Verify]
    - Wait up to 5 seconds for a toast containing the AR title text
      "قمنا بتدوير صورتك لتظهر بشكل صحيح" to appear anywhere on the page
    - Assert the toast description contains the Arabic substring
      "رُفعت الصورة من الكاميرا بشكل مائل"
    - Assert data-testid="photo-crop-dialog" is STILL visible (cropper reloaded)

### Test 3: regression guard — when the server omits rotationApplied, NO rotation toast appears and the cropper closes
30. [New Context] Create a new browser context
31. [Browser] BEFORE navigating, install a different mock that omits rotationApplied:

    await page.route("**/api/candidates/*/documents", async (route, request) => {
      if (request.method() !== "POST") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: "/__test/no-rotate.jpg",
          docType: "photo",
          pendingReview: true,
          changeRequestId: "test-change-id-2",
          qualityResult: { passed: true, checks: [] },
          message: "Photo submitted for review (mocked, no rotation).",
        }),
      });
    });

32. [Browser] Navigate to /auth, sign in as 2000000002 / password123, wait for /candidate-portal
33. [Browser] Click data-testid="button-avatar-edit"
34. [Browser] Run uploadFakeSidewaysPhoto(page) (same helper as Test 1)
35. [Verify] Wait up to 5 seconds for data-testid="photo-crop-dialog" to be visible
36. [Browser] Click data-testid="button-crop-save"
37. [Verify]
    - Wait up to 3 seconds for ANY toast to appear (the "Photo submitted for
      review" toast is still expected — that's the existing pendingReview UX).
    - Assert NO toast contains the text "We rotated your photo to fit upright"
      — this is the regression guard: if the upload route ever starts sending
      rotationApplied unconditionally, this assertion will fail.
    - Assert data-testid="photo-crop-dialog" is NO LONGER visible — without
      rotationApplied the cropper should close as before.
`;

export const technicalDocs = `
Test user: 2000000002 / password123 (employee mode, photo-change dialog enabled).

Wired in:
  - server/lib/photo-upload-handler.ts → returns rotationApplied: 90|-90 when rescue persists.
  - client/src/pages/candidate-portal.tsx → handlePhotoChangeUpload + uploadFile both fire
    toast({ title: t("portal:docs.photoAutoRotatedTitle"), description: t("portal:docs.photoAutoRotatedDesc") })
    when body.rotationApplied is truthy, then call loadServerPhotoForCropper(body.url).

Strings:
  EN title: "We rotated your photo to fit upright"
  EN desc:  begins with "Your camera uploaded the photo sideways"
  AR title: "قمنا بتدوير صورتك لتظهر بشكل صحيح"
  AR desc:  begins with "رُفعت الصورة من الكاميرا بشكل مائل"

Selectors: input-identifier, input-password, button-sign-in, badge-portal-mode,
button-avatar-edit, button-language-switcher, button-select-new-photo,
input-photo-change-file, photo-crop-dialog, button-crop-save.

Toasts have no data-testid — locate by visible text (Radix portal).
page.route() must be installed BEFORE navigation. Cropper reload appends
"?t=<ms>", so the GET mock uses "**/__test/rotated.jpg*".
`;
