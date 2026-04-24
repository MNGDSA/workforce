// Smoke test for the EXIF-orientation normaliser used by
// candidate-portal. The full happy path needs a real browser (the
// helper relies on `createImageBitmap` and `<canvas>`), so this
// suite only locks the fail-open contract: if those browser APIs
// aren't available, the helper must return the original File
// unchanged so we never block an upload.
//
// Run with: `npm test`, or
// `npx tsx --test client/src/lib/__tests__/image-orientation.test.ts`.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { normalizePhotoOrientation, _isSupported } from "../image-orientation";

describe("normalizePhotoOrientation", () => {
  it("returns the original file unchanged when createImageBitmap is unavailable (Node test env)", async () => {
    // Node 20 exposes File but not createImageBitmap, so this is the
    // exact path we want to lock — older browsers get the same fallback.
    assert.equal(_isSupported(), false, "this test assumes createImageBitmap is NOT available");
    const original = new File([new Uint8Array([0xff, 0xd8, 0xff])], "selfie.jpg", { type: "image/jpeg" });
    const out = await normalizePhotoOrientation(original);
    assert.strictEqual(out, original, "expected the same File reference back");
  });

  it("returns non-image files unchanged", async () => {
    const txt = new File([new Uint8Array([1, 2, 3])], "notes.txt", { type: "text/plain" });
    const out = await normalizePhotoOrientation(txt);
    assert.strictEqual(out, txt);
  });
});
