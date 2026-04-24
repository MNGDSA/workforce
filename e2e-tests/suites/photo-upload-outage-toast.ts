export const name = "Photo Upload — Verification Outage Toast";

export const testPlan = `
## Test Suite: Candidate Portal Photo Upload — Verification Outage Toast

This suite locks the candidate-facing toast wiring added in Task #154.
When the photo upload endpoint reports the verification service was busy
(qualityResult.qualityCheckSkipped === true), the candidate must see the
friendlier "Photo accepted — verification skipped" toast — never the
misleading "Photo verified" / "Photo uploaded and verified" message.

Two upload entry points exist on the candidate portal and both must surface
the friendlier copy:
  • Standard photo row in the dashboard documents card (candidate-mode user)
  • "Change Profile Photo" dialog from the avatar (employee-mode user)

The Rekognition outage is simulated with a Playwright route handler that
rewrites the POST /api/candidates/:id/documents response so the test does
not depend on AWS credentials being unset on the server.

### Test 1: Standard photo upload — outage path renders friendlier toast

1. [New Context] Create a new browser context
2. [Browser] Navigate to /auth
3. [Browser] Enter "2000000005" in data-testid="input-identifier"
4. [Browser] Enter "password123" in data-testid="input-password"
5. [Browser] Click data-testid="button-sign-in"
6. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
7. [Verify]
   - Assert URL is /candidate-portal
   - Assert data-testid="row-doc-photo" is visible (the documents card on
     the candidate-mode dashboard renders the photo row)
   - Assert data-testid="input-file-photo" exists in the DOM
8. [Browser] Install a Playwright route handler on
   "**/api/candidates/*/documents" that, for POST requests only, calls
   route.fulfill() with status 200, contentType "application/json", and the
   following JSON body (this simulates an active Rekognition outage where
   the server fail-opens for a re-upload):
       {
         "url": "/uploads/stub-photo.jpg",
         "docType": "photo",
         "pendingReview": false,
         "candidate": {},
         "qualityResult": {
           "passed": true,
           "checks": [],
           "qualityCheckSkipped": true,
           "serviceUnavailableNotice": "Verification service was busy, so we couldn't double-check this photo. Your photo was accepted — please retry later if it doesn't look right."
         }
       }
   Non-POST requests on that path must call route.fallback().
9. [Browser] Bypass the OS file picker by calling setInputFiles directly on
   data-testid="input-file-photo" with an in-memory 200×200 PNG. Use the
   base64 string defined in the technical-docs section below — it must be
   large enough that react-easy-crop fires onCropComplete and enables the
   save button. setInputFiles arg shape:
   { name: "test.png", mimeType: "image/png", buffer: Buffer.from(<base64>, "base64") }
10. [Browser] Wait for data-testid="photo-crop-overlay" to appear (up to 5
    seconds). Then wait up to 8 seconds for data-testid="button-crop-save"
    to become enabled — react-easy-crop calls onCropComplete asynchronously
    once the image has loaded into the cropper, and only then is the save
    button enabled.
11. [Browser] Click data-testid="button-crop-save"
12. [Verify]
    - Wait up to 5 seconds for a Radix toast to appear (text rendered as
      plain DOM text, no specific data-testid)
    - Assert the page now contains the text "Photo accepted — verification skipped"
      (the new friendlier title from portal:docs.photoAcceptedUnverified)
    - Assert the page does NOT contain the text "Photo uploaded and verified"
      (portal:docs.photoVerified — the misleading control title)
    - Assert the toast description contains the phrase
      "verification service was busy" (case-insensitive) — this comes from
      qualityResult.serviceUnavailableNotice in the stubbed response

### Test 2: Photo-change dialog — outage path renders friendlier toast

13. [New Context] Create a new browser context
14. [Browser] Navigate to /auth
15. [Browser] Enter "2000000002" in data-testid="input-identifier"
16. [Browser] Enter "password123" in data-testid="input-password"
17. [Browser] Click data-testid="button-sign-in"
18. [Browser] Wait up to 5 seconds for navigation to /candidate-portal
19. [Verify]
    - Assert data-testid="badge-portal-mode" is visible (employee mode
      confirmed — the avatar opens the photo-change dialog in this mode)
    - Assert data-testid="button-avatar-edit" is visible
20. [Browser] Install the same Playwright route handler on
    "**/api/candidates/*/documents" as in step 8 (POST -> route.fulfill()
    with the qualityCheckSkipped + serviceUnavailableNotice response and
    pendingReview: false; other methods -> route.fallback()).
21. [Browser] Click data-testid="button-avatar-edit"
22. [Verify] Assert data-testid="button-select-new-photo" is visible
    (the "Change Profile Photo" dialog opened) and that
    data-testid="input-photo-change-file" exists in the DOM.
23. [Browser] Bypass the OS file picker by calling setInputFiles directly on
    data-testid="input-photo-change-file" with the same in-memory 200×200
    PNG used in Test 1 (the same png200Base64 from the technical-docs
    section — anything smaller than ~100×100 leaves the cropper save
    button permanently disabled).
24. [Browser] Wait for data-testid="photo-crop-overlay" to appear, then for
    data-testid="button-crop-save" to become enabled.
25. [Browser] Click data-testid="button-crop-save"
26. [Verify]
    - Wait up to 5 seconds for a Radix toast to appear
    - Assert the page now contains the text "Photo accepted — verification skipped"
      (from portal:photoChange.uploadedUnverified)
    - Assert the page does NOT contain the text "Photo uploaded and verified"
      (from portal:photoChange.uploaded — the misleading control title)
    - Assert the toast description contains the phrase
      "verification service was busy" (case-insensitive)
`;

export const technicalDocs = `
Test data dependencies (same as the existing candidate-photo-management suite):
  - 2000000005 / password123 -> /candidate-portal, candidate-mode (no workforce record).
    Dashboard renders <ProfileCompletionCard> which exposes:
      data-testid="row-doc-photo"      (the clickable photo row)
      data-testid="input-file-photo"   (hidden <input type="file">)
  - 2000000002 / password123 -> /candidate-portal, employee-mode (active workforce E000001).
    Avatar (data-testid="button-avatar-edit") opens the Change Profile Photo dialog with:
      data-testid="button-select-new-photo"
      data-testid="input-photo-change-file" (hidden <input type="file">)

Server contract (server/routes.ts — POST /api/candidates/:id/documents):
  - For docType="photo", the JSON response includes a top-level qualityResult.
  - When Rekognition is unreachable and a previously-validated photo exists
    (decideRekognitionFallbackAction returns "allow"), the route attaches
    qualityResult.qualityCheckSkipped: true and a localized
    qualityResult.serviceUnavailableNotice. For active employees the route
    also sets pendingReview: true (HR review queue is the safety net).
  - Stubbing the response with pendingReview: false in the test forces the
    frontend down the non-pendingReview branch where Task #154's friendly
    title is rendered. This is the path that is NOT covered today by any
    e2e test, so the test suite proves the toast wiring is correct.

Frontend wiring (client/src/pages/candidate-portal.tsx — Task #154):
  - Standard upload path (uploadFile inside ProfileCompletionCard, ~line 670):
      photoSkipped = key === "photo" && !!body.qualityResult?.qualityCheckSkipped
      skippedDescription = body.qualityResult?.serviceUnavailableNotice
                         ?? t("portal:docs.photoAcceptedUnverifiedDesc")
      When !body.pendingReview && photoSkipped:
        toast.title = t("portal:docs.photoAcceptedUnverified")
                    = "Photo accepted — verification skipped"
        toast.description = skippedDescription
      When !photoSkipped (control case, must NOT trigger here):
        toast.title = t("portal:docs.photoVerified")
                    = "Photo uploaded and verified"   ← assertion-NOT-visible
  - Photo-change dialog path (handlePhotoChangeUpload, ~line 2100):
      skipped = !!body.qualityResult?.qualityCheckSkipped
      skippedDescription = body.qualityResult?.serviceUnavailableNotice
                         ?? t("portal:photoChange.uploadedUnverifiedDesc")
      When !body.pendingReview && skipped:
        toast.title = t("portal:photoChange.uploadedUnverified")
                    = "Photo accepted — verification skipped"
        toast.description = skippedDescription
      When !skipped (control case, must NOT trigger here):
        toast.title = t("portal:photoChange.uploaded")
                    = "Photo uploaded and verified"   ← assertion-NOT-visible

i18n source of truth:
  - client/src/lib/i18n/locales/en/portal.json
      docs.photoAcceptedUnverified         = "Photo accepted — verification skipped"
      docs.photoVerified                   = "Photo uploaded and verified"
      photoChange.uploadedUnverified       = "Photo accepted — verification skipped"
      photoChange.uploaded                 = "Photo uploaded and verified"

Network interception (Playwright):
  await page.route("**/api/candidates/*/documents", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: "/uploads/stub-photo.jpg",
          docType: "photo",
          pendingReview: false,
          candidate: {},
          qualityResult: {
            passed: true,
            checks: [],
            qualityCheckSkipped: true,
            serviceUnavailableNotice:
              "Verification service was busy, so we couldn't double-check this photo. Your photo was accepted — please retry later if it doesn't look right.",
          },
        }),
      });
    } else {
      await route.fallback();
    }
  });

File-upload helper (avoid the OS file picker):
  // 200x200 light-blue PNG. Must be at least ~100x100 — anything smaller
  // tends to confuse react-easy-crop into never firing onCropComplete,
  // which leaves data-testid="button-crop-save" disabled forever.
  const png200Base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAIAAAAiOjnJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAD8klEQVR4nO2UAQnAQACE1j+ZIRbiI6zEhuwQTHDKXdwnWoC3M7jatAX44FwKq7BOYRXB+cu/9li+AxYpLN8BixSW74BFCst3wCKF5TtgkcLyHbBIYfkOWKSwfAcsUli+AxYpLN8BixSW74BFCst3wCKF5TtgkcLyHbBIYfkOWKSwfAcsUli+AxYpLN8BixSW74BFCst3wCKF5TtgkcLyHbBIYfkOWKSwfAcsUli+AxYpLN8BixSW74BFCst3wCKF5TtgkcLyHbBIYfkOWKSwfAcsUli+AxYpLN8BixSW74BFCst3wCKF5TtgkcLyHbBIYfkOWKSwfAcsUli+AxYpLN8BixSW74BFCst3wCKF5TtgkcLyHbBIYfkOWKSwfAcsUli+AxYpLN8BixSW74BFCst3wCKF5TtgkcLyHbBIYfkOWKSwfAcsUli+AxYpLN8BixSW74BFCst3wCKF5TtgkcLyHbBIYfkOWKSwfAcsUli+AxYpLN8BixSW74BFCst3wCKF5TtgkcLyHbBIYfkOWKSwfAcsUli+AxYpLN8BixSW74BFCst3wCKF5TtgkcLyHbBIYfkOWKSwfAcsUli+AxYpLN8BixSW74BFCst3wCKF5TtgkcLyHbBIYfkOWKSwfAcsUli+AxYpLN8BixSW74BFCst3wCKF5TtgkcLyHbBIYfkOWKSwfAcsUli+AxYpLN8BixSW74BFCst3wCKF5TtgkcLyHbBIYfkOWKSwfAcsUli+AxYpLN8BixSW74BFCst3wCKF5TtgkcLyHbBIYfkOWKSwfAcsUli+g0kKy3fAIoXlO2CRwvIdsEhh+Q5YpLB8ByxSWL4DFiks3wGLFJbvgEUKy3fAIoXlO2CRwvIdsEhh+Q5YpLB8ByxSWL4DFiks3wGLFJbvgEUKy3fAIoXlO2CRwvIdsEhh+Q5YpLB8ByxSWL4DFiks3wGLFJbvgEUKy3fAIoXlO2CRwvIdsEhh+Q5YpLB8ByxSWL4DFiks3wGLFJbvgEUKy3fAIoXlO2CRwvIdsEhh+Q5YpLB8ByxSWL4DFiks3wGLFJbvgEUKy3fAIoXlO2CRwvIdsEhh+Q5YpLB8ByxSWL4DFiks3wGLFJbvgEUKy3fAIoXlO2CRwvIdsEhh+Q5YpLB8ByxSWL4DFiks3wGLFJbvgEUKy3fAIoXlO2CRwvIdsEhh+Q5YpLB8ByxSWL4DFiks3wGLFJbvgEUKy3fAIoXlO2CRwvIdsEhh+Q5YpLB8ByxSWL4DFiks3wGLFJbvgEUKy3fAIoXlO2CRwvIdsEhh+Q5YpLB8ByxSWL4DFiks3wGLFJbvgEUKy3fAIoXlO2CRwvIdsMgDCavsj7Omb1cAAAAASUVORK5CYII=";
  await page
    .locator('[data-testid="input-file-photo"]')   // or input-photo-change-file
    .setInputFiles({
      name: "test.png",
      mimeType: "image/png",
      buffer: Buffer.from(png200Base64, "base64"),
    });

The PhotoCropDialog overlays the page at the top of the DOM; identify it
with data-testid="photo-crop-overlay" or data-testid="photo-crop-dialog".
The save button is data-testid="button-crop-save" and only becomes enabled
once react-easy-crop fires onCropComplete (typically within a few hundred
milliseconds of the image loading).

Toast assertions:
  - shadcn/ui's <Toaster> renders the toast title and description as plain
    DOM text. Asserting page.getByText(...) (or
    expect(page).toHaveText(...)) is sufficient — no specific data-testid is
    required for the toast itself.
`;
