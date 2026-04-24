import type { FaceDetail } from "@aws-sdk/client-rekognition";

// `code` is a stable machine identifier the client uses to look up
// translated copy from `portal:photoCrop.checks.labels.<code>`.
// `tipReason`, when present, indexes into
// `portal:photoCrop.checks.tips.<tipReason>` for the failure hint.
// `name` and `tip` are kept as the English fallback so any older
// client that hasn't been updated still shows readable text.
export interface FaceQualityCheck {
  code: string;
  name: string;
  passed: boolean;
  tipReason?: string;
  tip?: string;
}

export interface FaceQualityResult {
  passed: boolean;
  checks: FaceQualityCheck[];
  qualityCheckSkipped?: boolean;
  // Task #153 — rotation rescue. When the first DetectFaces pass on
  // the original image found zero faces, we retry on copies rotated
  // 90° CW and 90° CCW (via sharp) and, if one of those passes, we
  // attach the rotated bytes here so the caller can overwrite the
  // stored file. `rotationApplied` records which rotation we kept so
  // it shows up in logs and gives downstream code a way to audit
  // how often we're correcting orientation.
  rotatedBuffer?: Buffer;
  rotationApplied?: 90 | -90;
}

// Pure orientation-picker — exported so it can be unit-tested
// without spinning up an AWS client or sharp. Called only when the
// first DetectFaces pass on the original image returned zero faces;
// the caller will have already run DetectFaces on rotated copies.
//
// Decision rules, in order:
//   1. If both +90° and -90° pass evaluateFaceDetails → keep the
//      orientation Rekognition is more confident about (the highest
//      face Confidence). Ties break to +90° (CW) since that matches
//      the most common phone-EXIF failure mode.
//   2. Else if only one passes → use that one.
//   3. Else if either rotated copy at least *found* a face (even
//      one that fails quality), the photo is almost certainly
//      sideways. Keep rotation=0 (so the caller doesn't overwrite
//      the file) but ask the caller to swap the "no face found"
//      tip for "rotate photo" — that's the actionable hint.
//   4. Otherwise no orientation found anything; return rotation=0
//      with the standard "no face found" tip.
export interface RotationDecision {
  rotation: 0 | 90 | -90;
  faces: FaceDetail[];
  suggestRotateTip: boolean;
}

// Highest face Confidence in a list. evaluateFaceDetails only
// passes when there's exactly one face, so in the common pass-pass
// tie-break case this reduces to faces[0].Confidence.
function topConfidence(faces: FaceDetail[]): number {
  let best = 0;
  for (const f of faces) {
    const c = f.Confidence ?? 0;
    if (c > best) best = c;
  }
  return best;
}

export function decideRotationOutcome(
  originalFaces: FaceDetail[],
  rotatedCwFaces: FaceDetail[],
  rotatedCcwFaces: FaceDetail[],
): RotationDecision {
  const cw = evaluateFaceDetails(rotatedCwFaces);
  const ccw = evaluateFaceDetails(rotatedCcwFaces);

  // Both rotations pass — keep the more confident face. CW wins
  // ties because it's the more common phone failure mode, so
  // log volume stays predictable.
  if (cw.passed && ccw.passed) {
    const cwScore = topConfidence(rotatedCwFaces);
    const ccwScore = topConfidence(rotatedCcwFaces);
    if (ccwScore > cwScore) {
      return { rotation: -90, faces: rotatedCcwFaces, suggestRotateTip: false };
    }
    return { rotation: 90, faces: rotatedCwFaces, suggestRotateTip: false };
  }
  if (cw.passed) {
    return { rotation: 90, faces: rotatedCwFaces, suggestRotateTip: false };
  }
  if (ccw.passed) {
    return { rotation: -90, faces: rotatedCcwFaces, suggestRotateTip: false };
  }
  // No rotation gives a clean pass. If a face appeared in any
  // rotated copy, the photo is rotated — surface that to the user.
  const someRotatedHadFace = rotatedCwFaces.length > 0 || rotatedCcwFaces.length > 0;
  return {
    rotation: 0,
    faces: originalFaces,
    suggestRotateTip: someRotatedHadFace,
  };
}

// Replace the `face_detected` tip on a failing result so it points
// the candidate at orientation rather than presence. We only swap
// the tip — `passed` stays false — because we still want the photo
// to be rejected; the user must retake or upload a fresh, upright
// photo.
function applyRotateTip(result: FaceQualityResult): FaceQualityResult {
  const rotateTip = "Photo appears to be rotated. Hold the phone upright and retake the photo.";
  return {
    ...result,
    checks: result.checks.map((c) =>
      c.code === "face_detected"
        ? { ...c, tipReason: "rotate_photo", tip: rotateTip }
        : c,
    ),
  };
}

// Orchestrates the rotation rescue with injected `rotate` and
// `detect` dependencies so it can be unit-tested without real
// sharp / AWS calls. Exported only for tests.
//
// Failure contract:
//   * `rotate` throws (sharp pipeline broke) → return the original
//     no-face result. The candidate still sees the standard
//     `no_face` tip; we never block the upload because of a
//     rotation pipeline bug.
//   * `detect` on a rotated copy throws (timeout / throttle on
//     the rescue-only call) → return the original no-face result.
//     Crucially we do NOT escalate to `qualityCheckSkipped: true`,
//     because the first DetectFaces already succeeded — flipping
//     to "service unavailable" here would change first-upload
//     candidates from a 422 (retry with a better photo) to a 503
//     (fail-closed) and active-employee photo changes from a 422
//     to an unintended fail-open.
export async function runRotationRescue(
  originalFaces: FaceDetail[],
  imageBytes: Buffer,
  deps: {
    rotate: (bytes: Buffer, degrees: 90 | -90) => Promise<Buffer>;
    detect: (bytes: Buffer) => Promise<FaceDetail[]>;
  },
): Promise<FaceQualityResult> {
  let cwBuffer: Buffer;
  let ccwBuffer: Buffer;
  try {
    [cwBuffer, ccwBuffer] = await Promise.all([
      deps.rotate(imageBytes, 90),
      deps.rotate(imageBytes, -90),
    ]);
  } catch (rotateErr) {
    console.warn("[Rekognition] sharp rotation failed — returning original no-face result", rotateErr);
    return evaluateFaceDetails(originalFaces);
  }

  let cwFaces: FaceDetail[];
  let ccwFaces: FaceDetail[];
  try {
    [cwFaces, ccwFaces] = await Promise.all([deps.detect(cwBuffer), deps.detect(ccwBuffer)]);
  } catch (rescueErr) {
    console.warn(
      "[Rekognition] Rescue DetectFaces call failed — keeping original no-face result",
      rescueErr,
    );
    return evaluateFaceDetails(originalFaces);
  }

  const decision = decideRotationOutcome(originalFaces, cwFaces, ccwFaces);

  if (decision.rotation === 90) {
    const result = evaluateFaceDetails(cwFaces);
    return { ...result, rotatedBuffer: cwBuffer, rotationApplied: 90 };
  }
  if (decision.rotation === -90) {
    const result = evaluateFaceDetails(ccwFaces);
    return { ...result, rotatedBuffer: ccwBuffer, rotationApplied: -90 };
  }

  const baseResult = evaluateFaceDetails(originalFaces);
  return decision.suggestRotateTip ? applyRotateTip(baseResult) : baseResult;
}

export async function validateFaceQuality(photoPath: string): Promise<FaceQualityResult> {
  const awsRegion = process.env.AWS_REGION ?? "me-south-1";
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKey || !secretKey) {
    console.warn("[Rekognition] AWS credentials not configured — skipping face quality check");
    return { passed: true, checks: [], qualityCheckSkipped: true };
  }

  try {
    const { RekognitionClient, DetectFacesCommand } = await import("@aws-sdk/client-rekognition");
    const { getFileBuffer } = await import("./file-storage");

    const imageBytes = await getFileBuffer(photoPath);

    const client = new RekognitionClient({
      region: awsRegion,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });

    // Single-shot DetectFaces helper with a 5s timeout. Reused for
    // the original image and for the rotated rescue copies.
    const detect = async (bytes: Buffer): Promise<FaceDetail[]> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const command = new DetectFacesCommand({
          Image: { Bytes: bytes },
          Attributes: ["ALL"],
        });
        const response = await client.send(command, { abortSignal: controller.signal });
        return response.FaceDetails ?? [];
      } finally {
        clearTimeout(timeout);
      }
    };

    const originalFaces = await detect(imageBytes);
    console.log("[Rekognition] DetectFaces returned", originalFaces.length, "face(s)");

    // Fast path: original had at least one face, evaluate as before.
    if (originalFaces.length >= 1) {
      return evaluateFaceDetails(originalFaces);
    }

    // Task #153 — rotation rescue. The original found nothing.
    // Try ±90° rotations (the common phone-EXIF-stripped failure
    // mode) before giving up. We only do this when the first call
    // returned zero faces, so the extra cost is bounded to "one
    // upload that probably won't pass anyway." `runRotationRescue`
    // owns the fall-open behaviour — see its docstring.
    console.log("[Rekognition] No face on first pass — attempting ±90° rotation rescue");
    const sharp = (await import("sharp")).default;
    const rescueResult = await runRotationRescue(originalFaces, imageBytes, {
      rotate: (bytes, degrees) => sharp(bytes).rotate(degrees).jpeg({ quality: 92 }).toBuffer(),
      detect,
    });
    if (rescueResult.rotationApplied) {
      console.log(`[Rekognition] Rotation rescue succeeded with ${rescueResult.rotationApplied}°`);
    }
    return rescueResult;
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : "unknown";
    const errName = err?.name ?? "";
    const httpCode = err?.$metadata?.httpStatusCode;

    const isTimeout = errMsg.includes("aborted") || errMsg.includes("AbortError") || errName === "AbortError";
    const isServiceError = httpCode >= 500 || errName === "ThrottlingException" || errName === "ProvisionedThroughputExceededException" || errMsg.includes("ECONNREFUSED") || errMsg.includes("ENOTFOUND") || errMsg.includes("ETIMEDOUT") || errMsg.includes("NetworkingError");

    if (isTimeout || isServiceError) {
      console.warn(`[Rekognition] DetectFaces unavailable (${isTimeout ? "timeout" : errName || errMsg}) — allowing photo through`);
      return { passed: true, checks: [], qualityCheckSkipped: true };
    }

    console.error("[Rekognition] DetectFaces FAILED (non-transient) —", errMsg);
    return {
      passed: false,
      checks: [{
        code: "photo_validation",
        name: "Photo validation",
        passed: false,
        tipReason: "invalid_image",
        tip: "Could not validate photo. Please ensure the file is a valid image (JPG or PNG).",
      }],
    };
  }
}

// Pure evaluator over Rekognition's FaceDetails — extracted from
// validateFaceQuality so the gating logic (sizes, sharpness, sunglasses,
// eyes-visible, etc.) can be unit-tested without spinning up an AWS
// client.
export function evaluateFaceDetails(faces: FaceDetail[]): FaceQualityResult {
  const checks: FaceQualityCheck[] = [];

  checks.push({
    code: "face_detected",
    name: "Face detected",
    passed: faces.length >= 1,
    tipReason: faces.length === 0 ? "no_face" : undefined,
    tip: faces.length === 0 ? "No face found. Make sure your face is clearly visible in the photo." : undefined,
  });

  checks.push({
    code: "single_face",
    name: "Single face",
    passed: faces.length === 1,
    tipReason: faces.length > 1 ? "multiple_faces" : faces.length === 0 ? "no_face" : undefined,
    tip: faces.length > 1 ? "Multiple faces detected. Use a photo with only your face." : faces.length === 0 ? "No face detected." : undefined,
  });

  if (faces.length === 1) {
    const face = faces[0];
    const faceConf = face.Confidence ?? 0;
    checks.push({
      code: "face_confidence",
      name: "Face confidence",
      passed: faceConf >= 90,
      tipReason: faceConf < 90 ? "low_confidence" : undefined,
      tip: faceConf < 90 ? "Face is not clearly recognisable. Use a well-lit photo showing your full face." : undefined,
    });

    const box = face.BoundingBox;
    const boxArea = (box?.Width ?? 0) * (box?.Height ?? 0);
    checks.push({
      code: "face_size",
      name: "Face size sufficient",
      passed: boxArea >= 0.04,
      tipReason: boxArea < 0.04 ? "too_small" : undefined,
      tip: boxArea < 0.04 ? "Face is too small. Move closer to the camera or crop tighter." : undefined,
    });

    const yaw = Math.abs(face.Pose?.Yaw ?? 0);
    const pitch = Math.abs(face.Pose?.Pitch ?? 0);
    checks.push({
      code: "face_pose",
      name: "Face facing forward",
      passed: yaw <= 30 && pitch <= 25,
      tipReason: yaw > 30 || pitch > 25 ? "bad_pose" : undefined,
      tip: yaw > 30 || pitch > 25 ? "Face the camera directly. Avoid turning or tilting your head." : undefined,
    });

    const landmarks = face.Landmarks ?? [];
    const nose = landmarks.find((l) => l.Type === "nose");
    const mouthLeft = landmarks.find((l) => l.Type === "mouthLeft");
    const mouthRight = landmarks.find((l) => l.Type === "mouthRight");
    const boxBottom = (box?.Top ?? 0) + (box?.Height ?? 0);
    const noseInBox = nose && box ? (nose.Y! <= boxBottom + 0.02) : false;
    const mouthInBox = mouthLeft && mouthRight && box
      ? (mouthLeft.Y! <= boxBottom + 0.05 && mouthRight.Y! <= boxBottom + 0.05)
      : false;
    checks.push({
      code: "full_face",
      name: "Full face visible",
      passed: noseInBox && mouthInBox,
      tipReason: !(noseInBox && mouthInBox) ? "partial_face" : undefined,
      tip: !(noseInBox && mouthInBox) ? "Your entire face must be visible — forehead to chin. Do not crop or cut off any part." : undefined,
    });

    const sharpness = face.Quality?.Sharpness ?? 0;
    checks.push({
      code: "sharpness",
      name: "Sharpness acceptable",
      passed: sharpness >= 40,
      tipReason: sharpness < 40 ? "too_blurry" : undefined,
      tip: sharpness < 40 ? "Photo is too blurry. Hold steady and ensure good focus." : undefined,
    });

    const brightness = face.Quality?.Brightness ?? 0;
    checks.push({
      code: "brightness",
      name: "Brightness acceptable",
      passed: brightness >= 30,
      tipReason: brightness < 30 ? "too_dark" : undefined,
      tip: brightness < 30 ? "Photo is too dark. Retake in better lighting." : undefined,
    });

    // Task #143 — explicit sunglasses gate. The DetectFaces request
    // already asks for `Attributes: ["ALL"]`, so reading Sunglasses
    // is free. We fail when Rekognition is reasonably confident
    // (>= 80%) that sunglasses are present. Below that we fall open
    // — the threshold matches the same "high-confidence rejection"
    // shape we use elsewhere (face confidence >= 90, eyes conf >=
    // 70). Lower confidence sunglasses readings often fire on tinted
    // glasses or heavy shadows, which we don't want to reject.
    const sunglassesValue = face.Sunglasses?.Value === true;
    const sunglassesConf = face.Sunglasses?.Confidence ?? 0;
    const sunglassesDetected = sunglassesValue && sunglassesConf >= 80;
    checks.push({
      code: "no_sunglasses",
      name: "No sunglasses",
      passed: !sunglassesDetected,
      tipReason: sunglassesDetected ? "remove_sunglasses" : undefined,
      tip: sunglassesDetected ? "Remove sunglasses and retake the photo." : undefined,
    });

    // Task #143 — tighten "Eyes visible". `EyesOpen.Value` is often
    // reported as true on sunglasses photos because the eye region
    // is occluded and Rekognition guesses. Force this check to fail
    // whenever the sunglasses gate fired so the candidate sees both
    // checks fail rather than a confusing pass on Eyes Visible while
    // the eyes are clearly hidden.
    const eyesOpen = face.EyesOpen?.Value ?? false;
    const eyesConf = face.EyesOpen?.Confidence ?? 0;
    const eyesPassed = eyesOpen && eyesConf >= 70 && !sunglassesDetected;
    checks.push({
      code: "eyes_visible",
      name: "Eyes visible",
      passed: eyesPassed,
      tipReason: !eyesPassed ? "eyes_not_visible" : undefined,
      tip: !eyesPassed ? "Eyes should be clearly open and visible. Remove sunglasses if worn." : undefined,
    });
  } else {
    const noSingleTip = "Cannot evaluate — no single face detected.";
    const noSingle = (code: string, name: string): FaceQualityCheck => ({
      code, name, passed: false, tipReason: "no_single_face", tip: noSingleTip,
    });
    checks.push(noSingle("face_confidence", "Face confidence"));
    checks.push(noSingle("face_size", "Face size sufficient"));
    checks.push(noSingle("face_pose", "Face facing forward"));
    checks.push(noSingle("full_face", "Full face visible"));
    checks.push(noSingle("sharpness", "Sharpness acceptable"));
    checks.push(noSingle("brightness", "Brightness acceptable"));
    checks.push(noSingle("no_sunglasses", "No sunglasses"));
    checks.push(noSingle("eyes_visible", "Eyes visible"));
  }

  const allPassed = checks.every(c => c.passed);
  return { passed: allPassed, checks };
}

export interface FaceCompareResult {
  confidence: number;
  matched: boolean;
  error?: string;
}

export async function compareFaces(
  sourcePhotoUrl: string,
  targetPhotoUrl: string
): Promise<FaceCompareResult> {
  if (!sourcePhotoUrl || !targetPhotoUrl) {
    return { confidence: 0, matched: false, error: "missing_photo" };
  }

  const awsRegion = process.env.AWS_REGION ?? "me-south-1";
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKey || !secretKey) {
    console.warn("[Rekognition] AWS credentials not configured — flagging for manual review");
    return {
      confidence: 0,
      matched: false,
      error: "rekognition_unavailable",
    };
  }

  try {
    const { RekognitionClient, CompareFacesCommand } = await import("@aws-sdk/client-rekognition");
    const { getFileBuffer } = await import("./file-storage");

    const client = new RekognitionClient({
      region: awsRegion,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });

    const [sourceBytes, targetBytes] = await Promise.all([
      getFileBuffer(sourcePhotoUrl),
      getFileBuffer(targetPhotoUrl),
    ]);

    const command = new CompareFacesCommand({
      SourceImage: { Bytes: sourceBytes },
      TargetImage: { Bytes: targetBytes },
      SimilarityThreshold: 70,
    });

    console.log("[Rekognition] Sending CompareFaces request to", awsRegion, "source size:", sourceBytes.length, "target size:", targetBytes.length);
    const response = await client.send(command);
    console.log("[Rekognition] Response received — FaceMatches:", response.FaceMatches?.length ?? 0, "UnmatchedFaces:", response.UnmatchedFaces?.length ?? 0);
    const topMatch = response.FaceMatches?.[0];
    const confidence = topMatch?.Similarity ?? 0;
    console.log("[Rekognition] Top match confidence:", confidence);

    return {
      confidence: Math.round(confidence * 100) / 100,
      matched: confidence >= 95,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "rekognition_error";
    const errName = err instanceof Error ? err.constructor.name : "Unknown";
    console.error("[Rekognition] CompareFaces FAILED —", errName, ":", errMsg);
    if (err instanceof Error && 'Code' in err) console.error("[Rekognition] AWS Error Code:", (err as any).Code);
    return {
      confidence: 0,
      matched: false,
      error: errMsg,
    };
  }
}
