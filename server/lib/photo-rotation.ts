// Task #161 — extract the rotation-rescue persistence + response-field
// composition from the POST /api/candidates/:id/documents handler so
// it can be unit-tested without spinning up Express, multer, AWS or
// sharp.
//
// Context: Task #155 added a confirmation toast and cropper reload
// that fire when the server's rotation rescue corrects a sideways
// photo. The trigger is a single `rotationApplied` field on the
// upload route's JSON response. A regression in that field (e.g. an
// accidental `?? false`, or forgetting to assign it after the
// `overwriteFile` succeeds) would silently undo the trust-building
// UX without breaking any existing test. This helper locks the
// contract so a unit test can drive it with synthetic inputs.
//
// Decision logic (mirrors the original inline code in routes.ts):
//   - If the quality result has BOTH `rotatedBuffer` AND
//     `rotationApplied`, attempt to overwrite the stored file with
//     the rotated bytes.
//     - On success → return the applied rotation so the route can
//       surface it on the response.
//     - On failure → log a warning and return undefined. The file on
//       storage is still the original, so we must NOT claim a
//       rotation happened (the cropper reload would re-fetch the
//       sideways copy and the toast would lie).
//   - Otherwise → return undefined.

import type { FaceQualityResult } from "../rekognition";

export interface PhotoRotationDeps {
  overwriteFile: (
    fileUrl: string,
    buffer: Buffer,
    contentType: string,
  ) => Promise<unknown>;
  // Pluggable so tests don't pollute stdout.
  log?: (msg: string) => void;
  warn?: (msg: string, err: unknown) => void;
}

export interface PersistRotationRescueResult {
  rotationApplied?: 90 | -90;
}

export async function persistRotationRescue(
  qualityResult: Pick<FaceQualityResult, "rotatedBuffer" | "rotationApplied">,
  fileUrl: string,
  candidateId: string,
  deps: PhotoRotationDeps,
): Promise<PersistRotationRescueResult> {
  if (!qualityResult.rotatedBuffer || !qualityResult.rotationApplied) {
    return {};
  }
  try {
    await deps.overwriteFile(fileUrl, qualityResult.rotatedBuffer, "image/jpeg");
    deps.log?.(
      `[photo-upload] Auto-rotated by ${qualityResult.rotationApplied}° for candidate ${candidateId}`,
    );
    return { rotationApplied: qualityResult.rotationApplied };
  } catch (rotErr) {
    deps.warn?.(
      `[photo-upload] Failed to persist rotated bytes for candidate ${candidateId}; original orientation will remain`,
      rotErr,
    );
    return {};
  }
}
