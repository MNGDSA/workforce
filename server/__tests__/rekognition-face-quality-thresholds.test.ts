// Task #145 — regression tests that lock the *legacy* photo-quality
// thresholds in `evaluateFaceDetails`. Task #143 already covers the
// new sunglasses gate and the tightened "eyes_visible" rule. These
// tests pin the older checks (face confidence, face size, pose
// pitch/yaw, sharpness, brightness, eyes-open confidence, full-face
// landmarks) at their just-passes / just-fails boundaries so a
// future refactor can't silently move them.
//
// Run with: `npm test` (primary entry point — runs every suite),
// or target this file alone via
// `npx tsx --test server/__tests__/rekognition-face-quality-thresholds.test.ts`.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { FaceDetail } from "@aws-sdk/client-rekognition";
import { evaluateFaceDetails } from "../rekognition";

// Same baseline as the sunglasses test file — every check passes
// unless the individual test overrides one attribute. Keep the two
// helpers in sync if either drifts.
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

// Look up by stable `code` rather than English `name` so these
// threshold tests survive any future copy reword.
function findCheck(
  result: { checks: { code: string; name: string; passed: boolean; tipReason?: string; tip?: string }[] },
  code: string,
) {
  const c = result.checks.find((x) => x.code === code);
  if (!c) {
    throw new Error(
      `check code "${code}" missing from result; got: ${result.checks.map((x) => x.code).join(", ")}`,
    );
  }
  return c;
}

describe("evaluateFaceDetails — Face confidence threshold (>= 90)", () => {
  it("passes at exactly 90", () => {
    const result = evaluateFaceDetails([passingFace({ Confidence: 90 })]);
    assert.equal(findCheck(result, "face_confidence").passed, true);
  });

  it("fails just below 90", () => {
    const result = evaluateFaceDetails([passingFace({ Confidence: 89.999 })]);
    const c = findCheck(result, "face_confidence");
    assert.equal(c.passed, false);
    assert.match(c.tip ?? "", /clearly recognisable|well-lit/i);
    assert.equal(result.passed, false);
  });
});

describe("evaluateFaceDetails — Face size threshold (boxArea >= 0.04)", () => {
  it("passes at exactly area = 0.04", () => {
    // 0.2 * 0.2 = 0.04
    const result = evaluateFaceDetails([
      passingFace({ BoundingBox: { Left: 0.4, Top: 0.4, Width: 0.2, Height: 0.2 } }),
    ]);
    assert.equal(findCheck(result, "face_size").passed, true);
  });

  it("fails just below area = 0.04", () => {
    // 0.2 * 0.19 = 0.038
    const result = evaluateFaceDetails([
      passingFace({ BoundingBox: { Left: 0.4, Top: 0.4, Width: 0.2, Height: 0.19 } }),
    ]);
    const c = findCheck(result, "face_size");
    assert.equal(c.passed, false);
    assert.match(c.tip ?? "", /too small|move closer/i);
  });

  it("treats a missing BoundingBox as area=0 (fails)", () => {
    const f = passingFace();
    delete f.BoundingBox;
    // Without a box, the landmarks-vs-box check also fails — we only
    // assert the size check here because that's what this suite locks.
    const result = evaluateFaceDetails([f]);
    assert.equal(findCheck(result, "face_size").passed, false);
  });
});

describe("evaluateFaceDetails — Pose threshold (|yaw| <= 30 AND |pitch| <= 25)", () => {
  it("passes at exactly yaw=30, pitch=25", () => {
    const result = evaluateFaceDetails([
      passingFace({ Pose: { Yaw: 30, Pitch: 25, Roll: 0 } }),
    ]);
    assert.equal(findCheck(result, "face_pose").passed, true);
  });

  it("passes at the negative boundary too (yaw=-30, pitch=-25)", () => {
    const result = evaluateFaceDetails([
      passingFace({ Pose: { Yaw: -30, Pitch: -25, Roll: 0 } }),
    ]);
    assert.equal(findCheck(result, "face_pose").passed, true);
  });

  it("fails just past yaw boundary (yaw=30.01)", () => {
    const result = evaluateFaceDetails([
      passingFace({ Pose: { Yaw: 30.01, Pitch: 0, Roll: 0 } }),
    ]);
    const c = findCheck(result, "face_pose");
    assert.equal(c.passed, false);
    assert.match(c.tip ?? "", /face the camera|turning|tilting/i);
  });

  it("fails just past pitch boundary (pitch=25.01)", () => {
    const result = evaluateFaceDetails([
      passingFace({ Pose: { Yaw: 0, Pitch: 25.01, Roll: 0 } }),
    ]);
    assert.equal(findCheck(result, "face_pose").passed, false);
  });

  it("does NOT gate on Roll — heavy roll alone still passes the pose check", () => {
    // Locks the current behaviour: roll is intentionally not gated.
    // If we ever decide to gate roll, this test must be updated and
    // the change made deliberately.
    const result = evaluateFaceDetails([
      passingFace({ Pose: { Yaw: 0, Pitch: 0, Roll: 89 } }),
    ]);
    assert.equal(findCheck(result, "face_pose").passed, true);
  });
});

describe("evaluateFaceDetails — Sharpness threshold (>= 40)", () => {
  it("passes at exactly 40", () => {
    const result = evaluateFaceDetails([
      passingFace({ Quality: { Sharpness: 40, Brightness: 70 } }),
    ]);
    assert.equal(findCheck(result, "sharpness").passed, true);
  });

  it("fails just below 40", () => {
    const result = evaluateFaceDetails([
      passingFace({ Quality: { Sharpness: 39.999, Brightness: 70 } }),
    ]);
    const c = findCheck(result, "sharpness");
    assert.equal(c.passed, false);
    assert.match(c.tip ?? "", /blurry|focus/i);
  });
});

describe("evaluateFaceDetails — Brightness threshold (>= 30)", () => {
  it("passes at exactly 30", () => {
    const result = evaluateFaceDetails([
      passingFace({ Quality: { Sharpness: 90, Brightness: 30 } }),
    ]);
    assert.equal(findCheck(result, "brightness").passed, true);
  });

  it("fails just below 30", () => {
    const result = evaluateFaceDetails([
      passingFace({ Quality: { Sharpness: 90, Brightness: 29.999 } }),
    ]);
    const c = findCheck(result, "brightness");
    assert.equal(c.passed, false);
    assert.match(c.tip ?? "", /dark|lighting/i);
  });
});

describe("evaluateFaceDetails — EyesOpen threshold (>= 70 confidence)", () => {
  it("passes at exactly EyesOpen confidence = 70", () => {
    const result = evaluateFaceDetails([
      passingFace({ EyesOpen: { Value: true, Confidence: 70 } }),
    ]);
    assert.equal(findCheck(result, "eyes_visible").passed, true);
  });

  it("fails just below 70 even with EyesOpen=true", () => {
    const result = evaluateFaceDetails([
      passingFace({ EyesOpen: { Value: true, Confidence: 69.999 } }),
    ]);
    assert.equal(findCheck(result, "eyes_visible").passed, false);
  });
});

describe("evaluateFaceDetails — Full face visibility (nose & mouth landmarks within bounding box)", () => {
  it("passes when nose and both mouth corners are inside the box", () => {
    const result = evaluateFaceDetails([passingFace()]);
    assert.equal(findCheck(result, "full_face").passed, true);
  });

  it("fails when the nose lands well below the bounding box (chin cropped)", () => {
    // Box bottom = 0.2 + 0.5 = 0.7. The check tolerates +0.02 slack,
    // so place the nose at 0.95 to clearly bust the gate.
    const result = evaluateFaceDetails([
      passingFace({
        BoundingBox: { Left: 0.3, Top: 0.2, Width: 0.4, Height: 0.5 },
        Landmarks: [
          { Type: "nose", X: 0.5, Y: 0.95 },
          { Type: "mouthLeft", X: 0.45, Y: 0.6 },
          { Type: "mouthRight", X: 0.55, Y: 0.6 },
        ],
      }),
    ]);
    const c = findCheck(result, "full_face");
    assert.equal(c.passed, false);
    assert.match(c.tip ?? "", /entire face|forehead to chin|cut off/i);
  });

  it("fails when mouth corners are missing entirely", () => {
    const result = evaluateFaceDetails([
      passingFace({
        Landmarks: [{ Type: "nose", X: 0.5, Y: 0.5 }],
      }),
    ]);
    assert.equal(findCheck(result, "full_face").passed, false);
  });

  it("fails when landmarks array is missing", () => {
    const f = passingFace();
    delete f.Landmarks;
    const result = evaluateFaceDetails([f]);
    assert.equal(findCheck(result, "full_face").passed, false);
  });
});

describe("evaluateFaceDetails — overall pass requires every check", () => {
  it("a single failing legacy check (e.g. low brightness) flips overall.passed=false", () => {
    const result = evaluateFaceDetails([
      passingFace({ Quality: { Sharpness: 90, Brightness: 10 } }),
    ]);
    assert.equal(result.passed, false);
    // Sanity: only the brightness check should be the one failing.
    const failing = result.checks.filter((c) => !c.passed).map((c) => c.code);
    assert.deepEqual(failing, ["brightness"]);
  });
});
