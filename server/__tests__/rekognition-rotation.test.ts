// Task #153 — pure rotation-rescue decision logic.
//
// `decideRotationOutcome` is the orientation-picker portion of
// `validateFaceQuality`. It runs only when the first DetectFaces
// pass on the original image found zero faces, then evaluates two
// rotated copies (90° CW and 90° CCW) and decides which orientation
// to keep. The decision is intentionally pure (no AWS, no Sharp,
// no I/O) so we can drive it with synthetic FaceDetail[] arrays
// and lock the rules without burning live AWS calls.
//
// Run with: `npm test`, or
// `npx tsx --test server/__tests__/rekognition-rotation.test.ts`.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { FaceDetail } from "@aws-sdk/client-rekognition";
import { decideRotationOutcome, evaluateFaceDetails, runRotationRescue } from "../rekognition";

function passingFace(overrides: Partial<FaceDetail> = {}): FaceDetail {
  return {
    Confidence: 99,
    BoundingBox: { Left: 0.3, Top: 0.2, Width: 0.4, Height: 0.5 },
    Pose: { Yaw: 0, Pitch: 0, Roll: 0 },
    Landmarks: [
      { Type: "nose", X: 0.5, Y: 0.5 },
      { Type: "mouthLeft", X: 0.45, Y: 0.6 },
      { Type: "mouthRight", X: 0.55, Y: 0.6 },
    ],
    Quality: { Sharpness: 90, Brightness: 70 },
    EyesOpen: { Value: true, Confidence: 99 },
    Sunglasses: { Value: false, Confidence: 99 },
    ...overrides,
  };
}

describe("decideRotationOutcome — orientation picker", () => {
  it("picks the +90° (CW) copy when it's the only one that finds a face", () => {
    const decision = decideRotationOutcome([], [passingFace()], []);
    assert.equal(decision.rotation, 90);
    assert.equal(decision.faces.length, 1);
    assert.equal(decision.suggestRotateTip, false);
  });

  it("picks the -90° (CCW) copy when it's the only one that finds a face", () => {
    const decision = decideRotationOutcome([], [], [passingFace()]);
    assert.equal(decision.rotation, -90);
    assert.equal(decision.faces.length, 1);
    assert.equal(decision.suggestRotateTip, false);
  });

  it("prefers the rotated copy that PASSES evaluateFaceDetails over one that just finds a face", () => {
    // CW finds a face but it's blurry → fails sharpness gate.
    // CCW finds a clean face → passes.
    const blurry = passingFace({ Quality: { Sharpness: 10, Brightness: 70 } });
    const clean = passingFace();
    const decision = decideRotationOutcome([], [blurry], [clean]);
    assert.equal(decision.rotation, -90, "should prefer the orientation that fully passes");
    assert.equal(decision.suggestRotateTip, false);
  });

  it("if a rotated copy finds a face but it doesn't pass quality, returns rotation=0 with the rotate-photo tip", () => {
    // Sideways photo where the face is visible but blurry — the photo
    // is rotated, but rotating it won't pass quality on its own.
    // The candidate should see the "rotate photo" tip rather than a
    // confusing "no face found" tip.
    const blurryFace = passingFace({ Quality: { Sharpness: 10, Brightness: 70 } });
    const decision = decideRotationOutcome([], [blurryFace], []);
    assert.equal(decision.rotation, 0);
    assert.equal(decision.suggestRotateTip, true);
  });

  it("if no orientation finds any face at all, returns rotation=0 and does NOT suggest rotation", () => {
    const decision = decideRotationOutcome([], [], []);
    assert.equal(decision.rotation, 0);
    assert.equal(decision.suggestRotateTip, false, "no rotation tip when no orientation found a face");
  });

  it("if multiple rotated copies find faces but none pass, still suggests the rotate-photo tip", () => {
    const blurryFace = passingFace({ Quality: { Sharpness: 10, Brightness: 70 } });
    const decision = decideRotationOutcome([], [blurryFace], [blurryFace]);
    assert.equal(decision.rotation, 0);
    assert.equal(decision.suggestRotateTip, true);
  });
});

describe("runRotationRescue — fall-open contract under partial failures", () => {
  const fakeBytes = Buffer.from([0xff, 0xd8, 0xff]);

  it("when sharp rotation throws, returns the original no-face result (does NOT mark service unavailable)", async () => {
    const result = await runRotationRescue([], fakeBytes, {
      rotate: async () => { throw new Error("sharp pipeline broken"); },
      detect: async () => { throw new Error("detect should never be called when rotate fails"); },
    });
    assert.equal(result.passed, false, "should still be a failed quality check, not a skipped one");
    assert.equal(result.qualityCheckSkipped, undefined, "must not flip to qualityCheckSkipped");
    assert.equal(result.rotatedBuffer, undefined);
    assert.equal(result.rotationApplied, undefined);
    const detected = result.checks.find((c) => c.code === "face_detected")!;
    assert.equal(detected.tipReason, "no_face", "no rotated copy was successfully detected, so the tip stays as no_face");
  });

  it("when a rotated DetectFaces call throws, returns the original no-face result (does NOT escalate to service unavailable)", async () => {
    const result = await runRotationRescue([], fakeBytes, {
      rotate: async () => fakeBytes,
      detect: async () => { throw new Error("Rekognition throttled"); },
    });
    assert.equal(result.passed, false);
    assert.equal(result.qualityCheckSkipped, undefined, "rescue-only AWS errors must NOT flip to qualityCheckSkipped");
    assert.equal(result.rotatedBuffer, undefined);
    assert.equal(result.rotationApplied, undefined);
  });

  it("happy path: when CW rotated copy passes, returns the rotated buffer and rotationApplied=90", async () => {
    const cwBytes = Buffer.from([0x01]);
    const ccwBytes = Buffer.from([0x02]);
    const result = await runRotationRescue([], fakeBytes, {
      rotate: async (_b, deg) => (deg === 90 ? cwBytes : ccwBytes),
      detect: async (b) => (b === cwBytes ? [passingFace()] : []),
    });
    assert.equal(result.passed, true);
    assert.equal(result.rotationApplied, 90);
    assert.equal(result.rotatedBuffer, cwBytes);
  });

  it("happy path: when CCW rotated copy passes, returns the rotated buffer and rotationApplied=-90", async () => {
    const cwBytes = Buffer.from([0x01]);
    const ccwBytes = Buffer.from([0x02]);
    const result = await runRotationRescue([], fakeBytes, {
      rotate: async (_b, deg) => (deg === 90 ? cwBytes : ccwBytes),
      detect: async (b) => (b === ccwBytes ? [passingFace()] : []),
    });
    assert.equal(result.passed, true);
    assert.equal(result.rotationApplied, -90);
    assert.equal(result.rotatedBuffer, ccwBytes);
  });

  it("rotated copy finds a face but it doesn't pass quality → no rotated buffer, but rotate_photo tip surfaces", async () => {
    const blurry = passingFace({ Quality: { Sharpness: 10, Brightness: 70 } });
    const result = await runRotationRescue([], fakeBytes, {
      rotate: async () => fakeBytes,
      detect: async () => [blurry],
    });
    assert.equal(result.passed, false);
    assert.equal(result.rotationApplied, undefined, "no rotation kept because no copy passes quality");
    const detected = result.checks.find((c) => c.code === "face_detected")!;
    assert.equal(detected.tipReason, "rotate_photo");
  });

  it("no copy finds any face → original result with the standard no_face tip (no rotate_photo tip)", async () => {
    const result = await runRotationRescue([], fakeBytes, {
      rotate: async () => fakeBytes,
      detect: async () => [],
    });
    assert.equal(result.passed, false);
    const detected = result.checks.find((c) => c.code === "face_detected")!;
    assert.equal(detected.tipReason, "no_face", "no rotation tip when no orientation found a face");
  });
});

describe("evaluateFaceDetails — rotate_photo tipReason wiring", () => {
  // The rotate-photo tip is plumbed through validateFaceQuality, not
  // evaluateFaceDetails directly. This test locks the contract that
  // the rotate-photo tip slot exists and is reachable through the
  // standard quality-check shape (so the i18n parity test sees it).
  it("when face_detected fails, the existing no_face tipReason is the default — rotate_photo is set by the rescue layer, not by the pure evaluator", () => {
    const result = evaluateFaceDetails([]);
    const detected = result.checks.find((c) => c.code === "face_detected")!;
    assert.equal(detected.passed, false);
    assert.equal(detected.tipReason, "no_face");
  });
});
