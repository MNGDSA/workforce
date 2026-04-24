// i18n parity check for the photo-quality response.
//
// `evaluateFaceDetails` (server/rekognition.ts) emits stable `code` /
// `tipReason` machine identifiers for every check and tip variant. The
// candidate portal looks those up under
//   portal:photoCrop.checks.labels.<code>
//   portal:photoCrop.checks.tips.<tipReason>
// in BOTH the English and Arabic locale files. If a future change adds
// a new code or tipReason on the server without touching the locale
// files, the Arabic UI silently falls back to the English `name`/`tip`
// strings — exactly the bug we just shipped a fix for. This test makes
// that drift fail loudly at build time instead.
//
// Run with: `npm test`, or
// `npx tsx --test server/__tests__/rekognition-i18n-parity.test.ts`.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FaceDetail } from "@aws-sdk/client-rekognition";
import { evaluateFaceDetails } from "../rekognition";

// Drive `evaluateFaceDetails` through every branch so we collect every
// possible (code, tipReason) pair it can ever emit. Each fixture is
// shaped to fail exactly the check we want to surface that tipReason
// for — see server/rekognition.ts thresholds.
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

function collectEmittedKeys(): { codes: Set<string>; tipReasons: Set<string> } {
  const codes = new Set<string>();
  const tipReasons = new Set<string>();
  const fixtures: FaceDetail[][] = [
    // Happy path — emits every code, no tipReasons.
    [passingFace()],
    // No face — emits no_face for face_detected/single_face plus
    // no_single_face for every downstream check.
    [],
    // Multiple faces — emits multiple_faces for single_face plus
    // no_single_face for every downstream check.
    [passingFace(), passingFace()],
    // Each individual failure mode (drives one tipReason at a time).
    [passingFace({ Confidence: 50 })],                                              // low_confidence
    [passingFace({ BoundingBox: { Left: 0.45, Top: 0.45, Width: 0.05, Height: 0.05 } })], // too_small
    [passingFace({ Pose: { Yaw: 60, Pitch: 0, Roll: 0 } })],                        // bad_pose
    [passingFace({ Landmarks: [] })],                                               // partial_face
    [passingFace({ Quality: { Sharpness: 10, Brightness: 70 } })],                  // too_blurry
    [passingFace({ Quality: { Sharpness: 90, Brightness: 10 } })],                  // too_dark
    [passingFace({ Sunglasses: { Value: true, Confidence: 95 } })],                 // remove_sunglasses + eyes_not_visible
    [passingFace({ EyesOpen: { Value: false, Confidence: 99 } })],                  // eyes_not_visible (no sunglasses path)
  ];
  for (const faces of fixtures) {
    const result = evaluateFaceDetails(faces);
    for (const c of result.checks) {
      codes.add(c.code);
      if (c.tipReason) tipReasons.add(c.tipReason);
    }
  }
  // These codes/tipReasons are emitted by callers OUTSIDE
  // evaluateFaceDetails (the Rekognition catch-block in
  // validateFaceQuality, the service-unavailable branch in
  // server/routes.ts, and the Task #153 rotation rescue that swaps
  // the face_detected tip when a sideways photo is detected). Add
  // them by hand so this parity check covers every code that can
  // reach the candidate portal.
  codes.add("photo_validation");
  tipReasons.add("invalid_image");
  codes.add("service_unavailable");
  tipReasons.add("service_unavailable");
  tipReasons.add("rotate_photo");
  return { codes, tipReasons };
}

function loadPortalChecks(lang: "en" | "ar") {
  const p = join(process.cwd(), "client", "src", "lib", "i18n", "locales", lang, "portal.json");
  const j = JSON.parse(readFileSync(p, "utf-8"));
  return j.photoCrop?.checks ?? {};
}

describe("portal:photoCrop.checks i18n parity", () => {
  const { codes, tipReasons } = collectEmittedKeys();

  for (const lang of ["en", "ar"] as const) {
    const checks = loadPortalChecks(lang);

    it(`${lang}: every emitted server code has a labels entry`, () => {
      const labels = checks.labels ?? {};
      const missing = [...codes].filter((c) => typeof labels[c] !== "string" || !labels[c]);
      assert.deepEqual(missing, [], `missing labels in ${lang}/portal.json: ${missing.join(", ")}`);
    });

    it(`${lang}: every emitted server tipReason has a tips entry`, () => {
      const tips = checks.tips ?? {};
      const missing = [...tipReasons].filter((r) => typeof tips[r] !== "string" || !tips[r]);
      assert.deepEqual(missing, [], `missing tips in ${lang}/portal.json: ${missing.join(", ")}`);
    });
  }
});
