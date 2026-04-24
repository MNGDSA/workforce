// Task #161 — route-level test for POST /api/candidates/:id/documents
// (photo upload). Mounts the actual handler factory from
// `server/lib/photo-upload-handler.ts` on a real Express app with
// stub deps (no AWS, no DB, no auth gateway), and asserts the JSON
// response shape — specifically the rotation-rescue contract:
//
//   * When the rescue persisted rotated bytes, the response MUST
//     carry `rotationApplied: 90` (or `-90`) at top level.
//   * When the rescue produced nothing, the field MUST be absent
//     (or undefined → omitted from the JSON wire format).
//
// This complements `photo-rotation.test.ts`, which tests the
// `persistRotationRescue` helper in isolation, by locking the *route
// boundary* — i.e. that the helper's outcome is correctly composed
// into the response JSON the candidate portal actually receives. A
// regression where the route forgets to surface the field on either
// the pendingReview branch or the final-update branch would still
// pass the helper unit tests but would silently break the upright-
// crop confirmation toast added in Task #155.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import multer from "multer";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { createServer, type Server } from "node:http";
import { Buffer } from "node:buffer";

import { createUploadDocumentsHandler, type PhotoUploadDeps } from "../lib/photo-upload-handler";
import { persistRotationRescue } from "../lib/photo-rotation";

// ─── Stubs ────────────────────────────────────────────────────────────────
// `mkStorage` returns a fresh stub `storage` object each test. The defaults
// describe a non-pending-change candidate (no active workforce → final
// branch). Tests override individual methods to drive specific paths.
function mkStorage(overrides: Partial<PhotoUploadDeps["storage"]> = {}): PhotoUploadDeps["storage"] {
  return {
    async getCandidate(id: string) {
      return {
        id,
        fullNameEn: "Test Candidate",
        hasPhoto: false,
        photoUrl: null,
      };
    },
    async getWorkforceByCandidateId(_id: string) {
      return null;
    },
    async updateCandidate(id: string, payload: Record<string, any>) {
      return { id, ...payload };
    },
    async getOnboardingRecords(_args: { candidateId: string }) {
      return [];
    },
    async updateOnboardingRecord(id: string, payload: Record<string, any>) {
      return { id, ...payload };
    },
    async createPhotoChangeRequest(payload: any) {
      return { id: "change-req-1", ...payload };
    },
    ...overrides,
  };
}

interface HarnessOptions {
  storage?: Partial<PhotoUploadDeps["storage"]>;
  // Quality result returned by the stubbed `validateFaceQuality`.
  // Default: passes with no rotation rescue.
  qualityResult?: import("../rekognition").FaceQualityResult;
  // Set true to make `overwriteFile` throw, exercising the
  // "rescue produced bytes but persistence failed" path.
  overwriteFileThrows?: boolean;
  // Captures every overwrite call so tests can assert the
  // rotated bytes actually reached storage when expected.
  overwriteCalls?: Array<{ url: string; mime: string; bytes: number }>;
  // Captures the inbox item created for a pendingReview submission.
  inboxCalls?: Array<any>;
  // Captures the supersede call.
  supersedeCalls?: string[];
}

// Spin up a one-route Express app on a random port. Returns the
// base URL plus a `close` to tear down. We use a real listening
// server (not just `app.handle(req, res)`) so multipart parsing,
// content-type negotiation, and JSON encoding all match production.
async function startHarness(opts: HarnessOptions = {}): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const overwriteCalls = opts.overwriteCalls ?? [];
  const inboxCalls = opts.inboxCalls ?? [];
  const supersedeCalls = opts.supersedeCalls ?? [];
  const qualityResult = opts.qualityResult ?? {
    passed: true,
    checks: [],
  };

  const tmpUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "photo-upload-test-"));
  const upload = multer({ dest: tmpUploadDir });

  const handler = createUploadDocumentsHandler({
    storage: mkStorage(opts.storage),
    async uploadFile(_localPath, name, _mime, _opts) {
      return `https://test-bucket.example/${name}`;
    },
    async deleteFile(_url: string) {},
    async overwriteFile(url: string, buffer: Buffer, mime: string) {
      if (opts.overwriteFileThrows) throw new Error("simulated S3 failure");
      overwriteCalls.push({ url, mime, bytes: buffer.length });
    },
    getMimeType(name: string) {
      return name.endsWith(".png") ? "image/png" : "image/jpeg";
    },
    async validateFaceQuality(_fileUrl: string) {
      return qualityResult;
    },
    decideRekognitionFallbackAction(_args) {
      return { kind: "proceed" };
    },
    recordRekognitionFallback(_telemetry: any, _candidateId: string) {},
    persistRotationRescue,
    recordRotationRescueOutcome(_kind) {},
    tr(_req, key: string) {
      return key;
    },
    async assertCandidateOwnerOrAdmin(_req, _res, _id) {
      return true;
    },
    handleError(res, err) {
      res.status(500).json({ message: err instanceof Error ? err.message : "error" });
    },
    computeOnboardingStatus(_rec, _isSmpRec) {
      return "pending";
    },
    async supersedePendingPhotoChanges(candidateId: string) {
      supersedeCalls.push(candidateId);
    },
    async createPhotoChangeInboxItem(args) {
      inboxCalls.push(args);
    },
  });

  const app = express();
  // No-op auth — the test stubs assertCandidateOwnerOrAdmin to pass.
  app.post("/api/candidates/:id/documents", upload.single("file"), handler);

  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("server failed to bind");
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      try { fs.rmSync(tmpUploadDir, { recursive: true, force: true }); } catch {}
    },
  };
}

// Build a multipart request body the route accepts. Uses Node 20's
// global FormData + Blob so we don't pull in a polyfill.
function makePhotoForm(): FormData {
  const form = new FormData();
  // 1×1 JPEG header bytes — content doesn't matter, the route only
  // looks at the mime/extension; sharp is mocked out via the
  // injected `validateFaceQuality`.
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });
  form.set("docType", "photo");
  form.set("file", blob, "test.jpg");
  return form;
}

describe("POST /api/candidates/:id/documents — rotation response contract", () => {
  let harness: { baseUrl: string; close: () => Promise<void> } | null = null;

  after(async () => {
    if (harness) await harness.close();
  });

  test("rotationApplied=90 is set on the response JSON when rescue persists rotated bytes (final branch)", async () => {
    const overwriteCalls: Array<{ url: string; mime: string; bytes: number }> = [];
    harness = await startHarness({
      qualityResult: {
        passed: true,
        checks: [],
        rotatedBuffer: Buffer.from([0xde, 0xad, 0xbe, 0xef]),
        rotationApplied: 90,
      },
      overwriteCalls,
    });

    const res = await fetch(`${harness.baseUrl}/api/candidates/cand-1/documents`, {
      method: "POST",
      body: makePhotoForm(),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.rotationApplied, 90, "rotationApplied must be 90 on response");
    assert.equal(body.docType, "photo");
    assert.ok(body.url, "response must include the uploaded URL");
    assert.equal(overwriteCalls.length, 1, "rescue must overwrite the stored bytes");
    assert.equal(overwriteCalls[0].bytes, 4);
  });

  test("rotationApplied=-90 is set on the response JSON when rescue persists CCW rotated bytes (final branch)", async () => {
    if (harness) { await harness.close(); harness = null; }
    harness = await startHarness({
      qualityResult: {
        passed: true,
        checks: [],
        rotatedBuffer: Buffer.from([1, 2, 3]),
        rotationApplied: -90,
      },
    });

    const res = await fetch(`${harness.baseUrl}/api/candidates/cand-2/documents`, {
      method: "POST",
      body: makePhotoForm(),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.rotationApplied, -90);
  });

  test("rotationApplied is ABSENT from response when no rescue happened (final branch)", async () => {
    if (harness) { await harness.close(); harness = null; }
    harness = await startHarness({
      qualityResult: { passed: true, checks: [] },
    });

    const res = await fetch(`${harness.baseUrl}/api/candidates/cand-3/documents`, {
      method: "POST",
      body: makePhotoForm(),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(
      Object.prototype.hasOwnProperty.call(body, "rotationApplied"),
      false,
      "rotationApplied field must not appear when no rescue ran",
    );
  });

  test("rotationApplied is ABSENT from response when rescue produced bytes but overwrite failed (final branch)", async () => {
    if (harness) { await harness.close(); harness = null; }
    const warnCalls: any[] = [];
    const origWarn = console.warn;
    console.warn = (...args: any[]) => { warnCalls.push(args); };
    try {
      harness = await startHarness({
        qualityResult: {
          passed: true,
          checks: [],
          rotatedBuffer: Buffer.from([9, 9, 9]),
          rotationApplied: 90,
        },
        overwriteFileThrows: true,
      });

      const res = await fetch(`${harness.baseUrl}/api/candidates/cand-4/documents`, {
        method: "POST",
        body: makePhotoForm(),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      // Critical: route MUST NOT claim a rotation when storage still
      // holds the original sideways image. Otherwise the cropper
      // would reload the unrotated photo and the toast would lie.
      assert.equal(
        Object.prototype.hasOwnProperty.call(body, "rotationApplied"),
        false,
        "rotationApplied must be absent when persistence failed",
      );
      assert.ok(warnCalls.length > 0, "persistence failure should be warned about");
    } finally {
      console.warn = origWarn;
    }
  });

  test("rotationApplied=90 is set on the response JSON for the pendingReview branch (active employee re-upload)", async () => {
    if (harness) { await harness.close(); harness = null; }
    const inboxCalls: any[] = [];
    const supersedeCalls: string[] = [];
    harness = await startHarness({
      qualityResult: {
        passed: true,
        checks: [],
        rotatedBuffer: Buffer.from([7, 7]),
        rotationApplied: 90,
      },
      storage: {
        async getCandidate(id: string) {
          return {
            id,
            fullNameEn: "Active Employee",
            hasPhoto: true,
            photoUrl: "https://test-bucket.example/old.jpg",
          };
        },
        async getWorkforceByCandidateId(_id: string) {
          return { isActive: true, employeeNumber: "E-1234" };
        },
      },
      inboxCalls,
      supersedeCalls,
    });

    const res = await fetch(`${harness.baseUrl}/api/candidates/cand-5/documents`, {
      method: "POST",
      body: makePhotoForm(),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.pendingReview, true, "pendingReview branch should be exercised");
    assert.equal(body.rotationApplied, 90, "rotationApplied must be 90 on pendingReview response too");
    assert.ok(body.changeRequestId, "pendingReview should include changeRequestId");
    assert.equal(supersedeCalls.length, 1);
    assert.equal(inboxCalls.length, 1);
  });

  test("rotationApplied is ABSENT from pendingReview response when no rescue happened", async () => {
    if (harness) { await harness.close(); harness = null; }
    harness = await startHarness({
      qualityResult: { passed: true, checks: [] },
      storage: {
        async getCandidate(id: string) {
          return {
            id,
            fullNameEn: "Active Employee",
            hasPhoto: true,
            photoUrl: "https://test-bucket.example/old.jpg",
          };
        },
        async getWorkforceByCandidateId(_id: string) {
          return { isActive: true, employeeNumber: "E-9999" };
        },
      },
    });

    const res = await fetch(`${harness.baseUrl}/api/candidates/cand-6/documents`, {
      method: "POST",
      body: makePhotoForm(),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.pendingReview, true);
    assert.equal(
      Object.prototype.hasOwnProperty.call(body, "rotationApplied"),
      false,
      "rotationApplied field must not appear when no rescue ran",
    );
  });
});
