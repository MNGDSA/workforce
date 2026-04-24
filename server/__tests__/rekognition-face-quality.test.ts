// Task #143 — sunglasses gate + tightened "eyes_visible" check.
//
// `evaluateFaceDetails` is the pure portion of `validateFaceQuality`
// extracted so we can drive it with synthetic Rekognition responses
// and lock the gating thresholds without burning live AWS calls.
//
// Run with: `npm test` (primary entry point — runs every suite),
// or target this file alone via
// `npx tsx --test server/__tests__/rekognition-face-quality.test.ts`.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { FaceDetail } from "@aws-sdk/client-rekognition";
import { evaluateFaceDetails } from "../rekognition";

// A face that passes every check EXCEPT whatever the test overrides.
// All thresholds are pulled from the production gating logic so a
// future tweak to e.g. minimum brightness will fail loudly here.
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

// Look up a check by its stable `code` (the machine identifier the
// client uses to render translated copy). We deliberately key on
// `code` rather than the English `name` so these tests do not break
// if the English copy is reworded.
function findCheck(
  result: { checks: { code: string; name: string; passed: boolean; tipReason?: string; tip?: string }[] },
  code: string,
) {
  const c = result.checks.find((x) => x.code === code);
  if (!c) throw new Error(`check code "${code}" missing from result; got: ${result.checks.map((x) => x.code).join(", ")}`);
  return c;
}

describe("evaluateFaceDetails — Task #143 sunglasses gate", () => {
  it("baseline passing face passes overall and includes the new 'No sunglasses' check", () => {
    const result = evaluateFaceDetails([passingFace()]);
    assert.equal(result.passed, true, `expected pass; failures: ${result.checks.filter(c => !c.passed).map(c => c.code).join(", ")}`);
    const sunglasses = findCheck(result, "no_sunglasses");
    assert.equal(sunglasses.passed, true);
    assert.equal(sunglasses.tip, undefined);
  });

  it("rejects when Sunglasses.Value=true and Confidence>=80", () => {
    const result = evaluateFaceDetails([passingFace({ Sunglasses: { Value: true, Confidence: 95 } })]);
    assert.equal(result.passed, false);
    const sunglasses = findCheck(result, "no_sunglasses");
    assert.equal(sunglasses.passed, false);
    assert.equal(sunglasses.tipReason, "remove_sunglasses");
  });

  it("rejects right at the 80% confidence threshold", () => {
    const result = evaluateFaceDetails([passingFace({ Sunglasses: { Value: true, Confidence: 80 } })]);
    assert.equal(findCheck(result, "no_sunglasses").passed, false);
  });

  it("passes (fails open) when Sunglasses.Value=true but Confidence<80 — uncertain reading", () => {
    const result = evaluateFaceDetails([passingFace({ Sunglasses: { Value: true, Confidence: 79 } })]);
    assert.equal(findCheck(result, "no_sunglasses").passed, true);
    assert.equal(result.passed, true);
  });

  it("passes when Sunglasses.Value=false regardless of confidence", () => {
    const result = evaluateFaceDetails([passingFace({ Sunglasses: { Value: false, Confidence: 50 } })]);
    assert.equal(findCheck(result, "no_sunglasses").passed, true);
  });

  it("passes when Sunglasses attribute is missing from the response", () => {
    const f = passingFace();
    delete f.Sunglasses;
    const result = evaluateFaceDetails([f]);
    assert.equal(findCheck(result, "no_sunglasses").passed, true);
  });
});

describe("evaluateFaceDetails — Task #143 'Eyes visible' tightened by sunglasses", () => {
  it("Eyes visible fails when sunglasses are detected even if EyesOpen=true high-conf", () => {
    const result = evaluateFaceDetails([passingFace({
      EyesOpen: { Value: true, Confidence: 99 },
      Sunglasses: { Value: true, Confidence: 95 },
    })]);
    const eyes = findCheck(result, "eyes_visible");
    assert.equal(eyes.passed, false, "eyes-visible must fail whenever sunglasses fire");
    assert.equal(eyes.tipReason, "eyes_not_visible");
    // And the sunglasses check itself fails too — candidate sees both.
    assert.equal(findCheck(result, "no_sunglasses").passed, false);
  });

  it("Eyes visible still fails on EyesOpen=false even with no sunglasses", () => {
    const result = evaluateFaceDetails([passingFace({
      EyesOpen: { Value: false, Confidence: 99 },
    })]);
    assert.equal(findCheck(result, "eyes_visible").passed, false);
    assert.equal(findCheck(result, "no_sunglasses").passed, true);
  });

  it("Eyes visible still fails on low EyesOpen confidence", () => {
    const result = evaluateFaceDetails([passingFace({
      EyesOpen: { Value: true, Confidence: 50 },
    })]);
    assert.equal(findCheck(result, "eyes_visible").passed, false);
  });

  it("Eyes visible passes on EyesOpen=true high-conf and no sunglasses", () => {
    const result = evaluateFaceDetails([passingFace()]);
    assert.equal(findCheck(result, "eyes_visible").passed, true);
  });

  it("low-confidence sunglasses reading does NOT poison Eyes visible", () => {
    // Sunglasses.Value=true but conf<80 — sunglasses gate falls open,
    // therefore eyes-visible should also pass on its own merits.
    const result = evaluateFaceDetails([passingFace({
      Sunglasses: { Value: true, Confidence: 60 },
    })]);
    assert.equal(findCheck(result, "eyes_visible").passed, true);
    assert.equal(findCheck(result, "no_sunglasses").passed, true);
  });
});

describe("evaluateFaceDetails — no/multiple face fall-through", () => {
  it("no face → fails and includes a 'No sunglasses' placeholder check", () => {
    const result = evaluateFaceDetails([]);
    assert.equal(result.passed, false);
    assert.equal(findCheck(result, "face_detected").passed, false);
    assert.equal(findCheck(result, "no_sunglasses").passed, false);
  });

  it("multiple faces → fails the single-face gate", () => {
    const result = evaluateFaceDetails([passingFace(), passingFace()]);
    assert.equal(result.passed, false);
    assert.equal(findCheck(result, "single_face").passed, false);
  });
});
