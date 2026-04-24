// Task #161 — pin the contract that the rotation rescue's
// `rotationApplied` field reaches the upload route's JSON response
// when (and only when) the rotated bytes were successfully persisted
// back to storage.
//
// Why this matters: Task #155 added a confirmation toast plus a
// cropper reload on the client, both of which fire only when the
// upload response carries `rotationApplied: 90` or `-90`. A
// regression in the route's response composition (e.g. forgetting to
// assign after `overwriteFile`, or accidentally sending the field
// even when persistence failed) would silently undo the
// trust-building UX without breaking any existing rotation-rescue
// test in `rekognition-rotation.test.ts` — those cover the
// orientation picker, not the route wiring.
//
// `persistRotationRescue` is the wiring helper extracted from
// `server/routes.ts`. It's pure-ish (only side effect is the
// injected `overwriteFile`) so we can drive it with synthetic
// FaceQualityResult inputs and lock the contract without spinning
// up Express, multer, AWS or sharp.
//
// Run with: `npm test`, or
// `npx tsx --test server/__tests__/photo-rotation.test.ts`.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { persistRotationRescue } from "../lib/photo-rotation";

const FILE_URL = "https://test-bucket.nyc3.digitaloceanspaces.com/uploads/photo-abc.jpg";
const CANDIDATE_ID = "candidate-123";
const ROTATED_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

type OverwriteCall = { fileUrl: string; buffer: Buffer; contentType: string };

function makeOverwriteSpy(behaviour: "ok" | "throw" = "ok") {
  const calls: OverwriteCall[] = [];
  const fn = async (
    fileUrl: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> => {
    calls.push({ fileUrl, buffer, contentType });
    if (behaviour === "throw") throw new Error("S3 PutObject failed");
  };
  return { calls, fn };
}

describe("persistRotationRescue — JSON response field for the rotation toast", () => {
  it("returns rotationApplied=90 and persists the rotated bytes when the rescue produced a CW (+90°) copy", async () => {
    const overwrite = makeOverwriteSpy("ok");
    const result = await persistRotationRescue(
      { rotatedBuffer: ROTATED_BYTES, rotationApplied: 90 },
      FILE_URL,
      CANDIDATE_ID,
      { overwriteFile: overwrite.fn },
    );
    assert.equal(result.rotationApplied, 90);
    assert.equal(overwrite.calls.length, 1, "overwriteFile should be called exactly once");
    assert.equal(overwrite.calls[0].fileUrl, FILE_URL);
    assert.equal(overwrite.calls[0].buffer, ROTATED_BYTES);
    assert.equal(
      overwrite.calls[0].contentType,
      "image/jpeg",
      "rotated bytes are always re-saved as JPEG (sharp output)",
    );
  });

  it("returns rotationApplied=-90 when the rescue produced a CCW (-90°) copy", async () => {
    const overwrite = makeOverwriteSpy("ok");
    const result = await persistRotationRescue(
      { rotatedBuffer: ROTATED_BYTES, rotationApplied: -90 },
      FILE_URL,
      CANDIDATE_ID,
      { overwriteFile: overwrite.fn },
    );
    assert.equal(result.rotationApplied, -90);
    assert.equal(overwrite.calls.length, 1);
  });

  it("returns no rotationApplied (and skips overwrite) when the quality result has no rotated buffer", async () => {
    // The standard pass: original orientation was fine, no rescue
    // was needed. The route must not announce a rotation toast.
    const overwrite = makeOverwriteSpy("ok");
    const result = await persistRotationRescue(
      { rotatedBuffer: undefined, rotationApplied: undefined },
      FILE_URL,
      CANDIDATE_ID,
      { overwriteFile: overwrite.fn },
    );
    assert.equal(result.rotationApplied, undefined);
    assert.equal(overwrite.calls.length, 0, "overwriteFile must NOT be called when there's nothing to persist");
  });

  it("returns no rotationApplied when only one half of the contract is set (defensive)", async () => {
    // Either-or shape (rotatedBuffer without rotationApplied, or
    // vice versa) shouldn't happen in practice, but the helper must
    // refuse to claim a rotation it can't fully describe.
    const overwrite = makeOverwriteSpy("ok");

    const onlyBuffer = await persistRotationRescue(
      { rotatedBuffer: ROTATED_BYTES, rotationApplied: undefined },
      FILE_URL,
      CANDIDATE_ID,
      { overwriteFile: overwrite.fn },
    );
    assert.equal(onlyBuffer.rotationApplied, undefined);

    const onlyDegrees = await persistRotationRescue(
      { rotatedBuffer: undefined, rotationApplied: 90 },
      FILE_URL,
      CANDIDATE_ID,
      { overwriteFile: overwrite.fn },
    );
    assert.equal(onlyDegrees.rotationApplied, undefined);

    assert.equal(overwrite.calls.length, 0);
  });

  it("does NOT claim rotationApplied when the persistence step throws — the file on storage is still the original", async () => {
    // Critical: if we said rotationApplied=90 here, the cropper
    // would re-fetch the URL and show the (unchanged) sideways
    // photo, and the toast would lie about what happened.
    const overwrite = makeOverwriteSpy("throw");
    const warns: Array<{ msg: string; err: unknown }> = [];
    const result = await persistRotationRescue(
      { rotatedBuffer: ROTATED_BYTES, rotationApplied: 90 },
      FILE_URL,
      CANDIDATE_ID,
      {
        overwriteFile: overwrite.fn,
        warn: (msg, err) => warns.push({ msg, err }),
      },
    );
    assert.equal(result.rotationApplied, undefined);
    assert.equal(overwrite.calls.length, 1, "we still tried");
    assert.equal(warns.length, 1, "the failure should surface as a warning");
    assert.match(warns[0].msg, /Failed to persist rotated bytes/);
    assert.match(warns[0].msg, new RegExp(CANDIDATE_ID));
  });

  it("emits a structured success log so SRE can audit how often rescue persists rotated bytes", async () => {
    const overwrite = makeOverwriteSpy("ok");
    const logs: string[] = [];
    await persistRotationRescue(
      { rotatedBuffer: ROTATED_BYTES, rotationApplied: -90 },
      FILE_URL,
      CANDIDATE_ID,
      { overwriteFile: overwrite.fn, log: (msg) => logs.push(msg) },
    );
    assert.equal(logs.length, 1);
    assert.match(logs[0], /Auto-rotated by -90°/);
    assert.match(logs[0], new RegExp(CANDIDATE_ID));
  });

  // Task #166 — the rolling rotation-rescue counter sees its inputs
  // through the optional `recordOutcome` dep on `persistRotationRescue`.
  // Lock the mapping here so a future refactor of the helper doesn't
  // silently change the telemetry kinds the dashboard groups by.
  it("emits recordOutcome=persisted_90 when a +90° rescue is persisted", async () => {
    const overwrite = makeOverwriteSpy("ok");
    const outcomes: string[] = [];
    await persistRotationRescue(
      { rotatedBuffer: ROTATED_BYTES, rotationApplied: 90 },
      FILE_URL,
      CANDIDATE_ID,
      { overwriteFile: overwrite.fn, recordOutcome: (k) => outcomes.push(k) },
    );
    assert.deepEqual(outcomes, ["persisted_90"]);
  });

  it("emits recordOutcome=persisted_-90 when a -90° rescue is persisted", async () => {
    const overwrite = makeOverwriteSpy("ok");
    const outcomes: string[] = [];
    await persistRotationRescue(
      { rotatedBuffer: ROTATED_BYTES, rotationApplied: -90 },
      FILE_URL,
      CANDIDATE_ID,
      { overwriteFile: overwrite.fn, recordOutcome: (k) => outcomes.push(k) },
    );
    assert.deepEqual(outcomes, ["persisted_-90"]);
  });

  it("emits recordOutcome=persist_failed when overwriteFile throws (and only once)", async () => {
    const overwrite = makeOverwriteSpy("throw");
    const outcomes: string[] = [];
    await persistRotationRescue(
      { rotatedBuffer: ROTATED_BYTES, rotationApplied: 90 },
      FILE_URL,
      CANDIDATE_ID,
      { overwriteFile: overwrite.fn, recordOutcome: (k) => outcomes.push(k) },
    );
    assert.deepEqual(
      outcomes,
      ["persist_failed"],
      "the rate denominator must include failures, but only one event per call",
    );
  });

  it("does NOT call recordOutcome when there was nothing to rescue", async () => {
    // The standard pass: rotation rescue wasn't needed. The counter
    // tracks rescue *attempts*; calling it here would tank the
    // success rate by inflating the denominator with non-events.
    const overwrite = makeOverwriteSpy("ok");
    const outcomes: string[] = [];
    await persistRotationRescue(
      { rotatedBuffer: undefined, rotationApplied: undefined },
      FILE_URL,
      CANDIDATE_ID,
      { overwriteFile: overwrite.fn, recordOutcome: (k) => outcomes.push(k) },
    );
    assert.deepEqual(outcomes, []);
  });

  it("does not throw when log/warn callbacks are not provided (route plumbing optional)", async () => {
    const overwrite = makeOverwriteSpy("ok");
    const result = await persistRotationRescue(
      { rotatedBuffer: ROTATED_BYTES, rotationApplied: 90 },
      FILE_URL,
      CANDIDATE_ID,
      { overwriteFile: overwrite.fn },
    );
    assert.equal(result.rotationApplied, 90);

    const overwriteThrows = makeOverwriteSpy("throw");
    const failed = await persistRotationRescue(
      { rotatedBuffer: ROTATED_BYTES, rotationApplied: 90 },
      FILE_URL,
      CANDIDATE_ID,
      { overwriteFile: overwriteThrows.fn },
    );
    assert.equal(failed.rotationApplied, undefined);
  });
});
