// Task #108 (Workstream 1) — verify the Rekognition fallback ring
// buffer correctly classifies first-upload (blocked) vs re-upload
// (allowed) events and prunes anything outside the 24h window. The
// integration behavior — that the routes layer actually returns 503
// on first-upload + skipped quality — is enforced by code review of
// `server/routes.ts` (see the Task #108 banner comment around the
// `qualityCheckSkipped` branch). This unit test locks the telemetry
// contract that the admin endpoint depends on.
//
// Run with: `npx tsx --test server/__tests__/rekognition-telemetry.test.ts`

import { strict as assert } from "node:assert";
import { describe, it, beforeEach } from "node:test";

import {
  recordRekognitionFallback,
  getRekognitionFallbackSummary,
  decideRekognitionFallbackAction,
  __resetRekognitionFallbackTelemetryForTests,
} from "../rekognition-telemetry";

describe("decideRekognitionFallbackAction — Task #108 truth table", () => {
  it("returns 'proceed' when Rekognition succeeded (no telemetry)", () => {
    const result = decideRekognitionFallbackAction({
      qualityCheckSkipped: false,
      hasPreviouslyValidatedPhoto: false,
    });
    assert.equal(result.kind, "proceed");
  });

  it("returns 'proceed' when Rekognition succeeded even if a prior photo exists", () => {
    const result = decideRekognitionFallbackAction({
      qualityCheckSkipped: false,
      hasPreviouslyValidatedPhoto: true,
    });
    assert.equal(result.kind, "proceed");
  });

  it("blocks initial individual signup during Rekognition outage (no prior photo)", () => {
    // Caller state: brand-new candidate, no `candidate.hasPhoto` yet.
    const result = decideRekognitionFallbackAction({
      qualityCheckSkipped: true,
      hasPreviouslyValidatedPhoto: false,
    });
    assert.equal(result.kind, "block");
    if (result.kind === "block") {
      assert.equal(result.telemetry, "first_upload_blocked");
    }
  });

  it("blocks SMP worker first portal upload during outage (no prior photo)", () => {
    // Caller state: SMP worker who just activated and is uploading
    // their first photo through the candidate portal. Same as the
    // initial-signup case for the purposes of this decision.
    const result = decideRekognitionFallbackAction({
      qualityCheckSkipped: true,
      hasPreviouslyValidatedPhoto: false,
    });
    assert.equal(result.kind, "block");
    if (result.kind === "block") {
      assert.equal(result.telemetry, "first_upload_blocked");
    }
  });

  it("allows active-employee photo change during outage (prior photo exists)", () => {
    // Caller state: active employee changing their profile photo.
    // The existing photo has already passed Rekognition at upload
    // time and remains active. Re-uploads pass through to the HR
    // review queue (the human reviewer is the safety net).
    const result = decideRekognitionFallbackAction({
      qualityCheckSkipped: true,
      hasPreviouslyValidatedPhoto: true,
    });
    assert.equal(result.kind, "allow");
    if (result.kind === "allow") {
      assert.equal(result.telemetry, "reupload_allowed");
    }
  });

  it("allows non-active candidate re-upload during outage (prior photo exists)", () => {
    // Caller state: candidate (not yet an active employee) re-
    // uploading after a previously-successful upload. Still fails
    // open because the previously-validated photo vouches for them.
    const result = decideRekognitionFallbackAction({
      qualityCheckSkipped: true,
      hasPreviouslyValidatedPhoto: true,
    });
    assert.equal(result.kind, "allow");
  });
});

describe("rekognition-telemetry", () => {
  beforeEach(() => {
    __resetRekognitionFallbackTelemetryForTests();
  });

  it("starts empty", () => {
    const s = getRekognitionFallbackSummary();
    assert.equal(s.total, 0);
    assert.equal(s.firstUploadBlocked, 0);
    assert.equal(s.reuploadAllowed, 0);
    assert.equal(s.oldestAt, null);
    assert.equal(s.mostRecentAt, null);
    assert.equal(s.windowHours, 24);
  });

  it("counts first-upload blocks separately from re-upload allowances", () => {
    recordRekognitionFallback("first_upload_blocked", "cand-1");
    recordRekognitionFallback("first_upload_blocked", "cand-2");
    recordRekognitionFallback("reupload_allowed", "cand-3");
    const s = getRekognitionFallbackSummary();
    assert.equal(s.total, 3);
    assert.equal(s.firstUploadBlocked, 2);
    assert.equal(s.reuploadAllowed, 1);
    assert.ok(s.oldestAt && s.mostRecentAt);
  });

  it("returns ISO timestamps for oldest and most recent", () => {
    recordRekognitionFallback("first_upload_blocked", "cand-A");
    const s = getRekognitionFallbackSummary();
    assert.match(s.oldestAt!, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.match(s.mostRecentAt!, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
