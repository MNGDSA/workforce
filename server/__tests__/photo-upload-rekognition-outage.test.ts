// Task #168 — backend integration coverage for the active-employee
// Rekognition outage fail-open path.
//
// Why this exists alongside the unit tests:
//
//   * `rekognition-telemetry.test.ts` pins the pure
//     `decideRekognitionFallbackAction` truth table.
//   * `rekognition-outer-catch.test.ts` pins the pure
//     `classifyDetectFacesError` boundaries.
//   * `e2e-tests/suites/photo-upload-outage-toast.ts` (Task #164) proves
//     the candidate portal renders the friendly toast — but it stubs
//     the network response with `page.route`, so it never exercises
//     the server's actual fail-open decision.
//
// None of those would catch a regression where the
// `POST /api/candidates/:id/documents` handler stopped emitting the
// exact response shape the candidate portal toast depends on
// (`qualityCheckSkipped: true`, `serviceUnavailableNotice` populated,
// `pendingReview: true`). This test drives the real handler with a
// real Rekognition outage (the AWS SDK `send` is patched to throw a
// transient `ServiceUnavailableException`), so the path that runs in
// production — `validateFaceQuality` outer catch →
// `classifyDetectFacesError` → `decideRekognitionFallbackAction` →
// route response shape — is exercised end-to-end.
//
// Run with:
//   npx tsx --test server/__tests__/photo-upload-rekognition-outage.test.ts

import { strict as assert } from "node:assert";
import { describe, it, before, beforeEach, after } from "node:test";
import { createServer, type Server } from "node:http";
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import express, { type Express, type Request, type Response } from "express";

let documentsHandler: (req: Request, res: Response) => Promise<void> | void;

// Captures every interaction the handler makes with the singleton
// storage / db so each test can assert on what the handler chose to
// persist (or not persist) without round-tripping a real database.
interface Captured {
  createdPhotoChangeRequests: Array<Record<string, any>>;
  createdInboxItems: Array<Record<string, any>>;
  updatedCandidates: Array<{ id: string; data: Record<string, any> }>;
  rekognitionSendCalls: number;
}
const captured: Captured = {
  createdPhotoChangeRequests: [],
  createdInboxItems: [],
  updatedCandidates: [],
  rekognitionSendCalls: 0,
};

const ACTIVE_CANDIDATE_ID = "cand-active-1";
const EXISTING_PHOTO_URL = "/uploads/existing-photo.jpg";

// Captured originals so `after()` can restore the singletons we
// patched. The current `node --test` invocation tears down the
// process at the end of the file so leaving them patched is harmless
// in practice — but a future shared-process runner (Vitest, jest's
// `--runInBand`, etc.) would silently inherit our patched
// RekognitionClient and storage stubs and cause spooky cross-suite
// failures. Restoring is cheap insurance.
const originals: {
  rekognitionSend: any;
  storageMethods: Record<string, any>;
  dbSelect: any;
  dbUpdate: any;
} = {
  rekognitionSend: undefined,
  storageMethods: {},
  dbSelect: undefined,
  dbUpdate: undefined,
};

// `validateFaceQuality` reads `req.file`'s uploaded bytes off disk
// (via `getFileBuffer`) BEFORE it ever calls Rekognition, so we
// stage real (but trivial) JPEG bytes at the path `uploadFile`
// returns in dev (`/uploads/<filename>`). The bytes are never sent
// over the wire because `RekognitionClient.prototype.send` is
// patched to throw before the SDK serialises them. We track the
// staged paths so `after()` can clean them up.
const stagedUploadPaths: string[] = [];
function stageUploadFile(filename: string): void {
  const uploadsDir = resolve("uploads");
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
  const fullPath = resolve(uploadsDir, filename);
  // 4 bytes of nothing — sharp / Rekognition would reject this for
  // real, but our patched `send` throws long before the bytes
  // matter.
  writeFileSync(fullPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  stagedUploadPaths.push(fullPath);
}

before(async () => {
  // The Pool() in db.ts requires a connection string at module-load
  // time but does NOT connect until first query. A placeholder is
  // enough; we stub `db.select`/`db.update` below so no real query
  // ever runs.
  process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
  // SESSION_SECRET prevents the auth-token module from emitting an
  // ephemeral-secret warning in dev; not strictly required since we
  // bypass requireAuth, but keeps the test logs quiet.
  process.env.SESSION_SECRET ||= "test-session-secret-min-16-chars";
  // Prevent file-storage and rekognition modules from believing we're
  // in production (which would try to talk to DO Spaces / require S3
  // env vars). uploadFile() returns a `/uploads/<filename>` path in
  // dev — exactly what we want.
  process.env.NODE_ENV = "development";

  // Force `validateFaceQuality` past its credentials-missing early
  // return so it actually constructs a RekognitionClient and calls
  // `client.send(...)`. The patched `send` below throws the simulated
  // outage error.
  process.env.AWS_ACCESS_KEY_ID = "test-access-key";
  process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.AWS_REGION = "me-south-1";

  // ── Force the AWS Rekognition outage ───────────────────────────────
  //
  // `validateFaceQuality` does `await import("@aws-sdk/client-rekognition")`
  // and then `new RekognitionClient(...).send(...)`. By pre-importing
  // the same module here and overwriting `RekognitionClient.prototype.send`,
  // the dynamic import inside `validateFaceQuality` resolves to the
  // same module instance and inherits our patch. Throwing a
  // `ServiceUnavailableException` (one of the names
  // `classifyDetectFacesError` recognises as transient) drives the
  // outer catch → `qualityCheckSkipped: true` → routes-layer fail-open.
  const rek = await import("@aws-sdk/client-rekognition");
  originals.rekognitionSend = (rek.RekognitionClient.prototype as any).send;
  (rek.RekognitionClient.prototype as any).send = async function patchedSend() {
    captured.rekognitionSendCalls++;
    const err: any = new Error("ServiceUnavailableException: simulated Rekognition outage");
    err.name = "ServiceUnavailableException";
    err.$metadata = { httpStatusCode: 503 };
    throw err;
  };

  // ── Stub the storage singleton ─────────────────────────────────────
  //
  // The handler's active-employee branch reads getCandidate +
  // getWorkforceByCandidateId, then writes a photo change request and
  // an inbox item. We pin all of those to deterministic values.
  const storageMod = await import("../storage");
  const stg = storageMod.storage as any;
  for (const key of [
    "getCandidate",
    "getWorkforceByCandidateId",
    "updatePhotoChangeRequest",
    "createPhotoChangeRequest",
    "createInboxItem",
    "updateCandidate",
    "getOnboardingRecords",
  ]) {
    originals.storageMethods[key] = stg[key];
  }

  stg.getCandidate = async (id: string) => {
    if (id !== ACTIVE_CANDIDATE_ID) return null;
    return {
      id,
      fullNameEn: "Active Worker",
      hasPhoto: true,
      photoUrl: EXISTING_PHOTO_URL,
      userId: "user-active-1",
      phone: null,
    };
  };

  stg.getWorkforceByCandidateId = async (id: string) => {
    if (id !== ACTIVE_CANDIDATE_ID) return null;
    return {
      id: "wf-active-1",
      candidateId: id,
      employeeNumber: "EMP-0001",
      isActive: true,
    };
  };

  stg.updatePhotoChangeRequest = async (id: string, data: Record<string, any>) => ({
    id,
    ...data,
  });

  stg.createPhotoChangeRequest = async (data: Record<string, any>) => {
    const row = { id: `pcr-${captured.createdPhotoChangeRequests.length + 1}`, ...data };
    captured.createdPhotoChangeRequests.push(row);
    return row;
  };

  stg.createInboxItem = async (data: Record<string, any>) => {
    const row = { id: `inbox-${captured.createdInboxItems.length + 1}`, ...data };
    captured.createdInboxItems.push(row);
    return row;
  };

  stg.updateCandidate = async (id: string, data: Record<string, any>) => {
    captured.updatedCandidates.push({ id, data });
    return { id, ...data };
  };

  stg.getOnboardingRecords = async () => [];

  // ── Stub the Drizzle `db` singleton's chained selects/updates ──────
  //
  // The active-employee branch runs:
  //   db.select({...}).from(photoChangeRequests).where(...)
  //   db.update(inboxItems).set(...).where(...)
  //
  // Returning `[]` from the select short-circuits the supersede loop,
  // so we never reach `db.update`. The update stub is defensive in
  // case future handler edits start writing unconditionally.
  const dbMod = await import("../db");
  const dbSingleton = dbMod.db as any;
  originals.dbSelect = dbSingleton.select;
  originals.dbUpdate = dbSingleton.update;
  dbSingleton.select = () => ({
    from: () => ({
      where: async () => [] as any[],
    }),
  });
  dbSingleton.update = () => ({
    set: () => ({
      where: async () => undefined,
    }),
  });

  // ── Mount registerRoutes onto a throwaway Express app ──────────────
  //
  // We don't `app.listen()` — we pull the terminal handler out of the
  // router stack and invoke it directly with a fake req/res. This
  // mirrors the pattern the smp-commit IBAN test already uses
  // (`server/__tests__/smp-commit-iban-resolution.test.ts`) and
  // bypasses the requireAuth + multer middleware that aren't part of
  // what we're testing here.
  const { registerRoutes } = await import("../routes");
  const app: Express = express();
  app.use(express.json());
  const httpServer: Server = createServer(app);
  await registerRoutes(httpServer, app);

  const router = (app as any).router ?? (app as any)._router;
  const stack = router?.stack ?? [];
  for (const layer of stack) {
    const route = layer.route;
    if (!route || route.path !== "/api/candidates/:id/documents") continue;
    if (!route.methods?.post) continue;
    const subStack = route.stack as Array<{ handle: any }>;
    documentsHandler = subStack[subStack.length - 1].handle;
    break;
  }
  assert.ok(
    documentsHandler,
    "could not locate POST /api/candidates/:id/documents handler in router stack",
  );
});

beforeEach(() => {
  captured.createdPhotoChangeRequests.length = 0;
  captured.createdInboxItems.length = 0;
  captured.updatedCandidates.length = 0;
  captured.rekognitionSendCalls = 0;
});

after(async () => {
  for (const p of stagedUploadPaths) {
    try {
      if (existsSync(p)) unlinkSync(p);
    } catch {
      // best-effort cleanup; CI should already be tearing down the
      // workspace, so leaving a 4-byte file behind on failure is
      // not a meaningful leak.
    }
  }

  // Restore the singletons we patched. See the `originals` declaration
  // at the top of the file for why this matters under shared-process
  // test runners.
  try {
    if (originals.rekognitionSend) {
      const rek = await import("@aws-sdk/client-rekognition");
      (rek.RekognitionClient.prototype as any).send = originals.rekognitionSend;
    }
    const storageMod = await import("../storage");
    const stg = storageMod.storage as any;
    for (const [key, original] of Object.entries(originals.storageMethods)) {
      if (original !== undefined) stg[key] = original;
    }
    const dbMod = await import("../db");
    const dbSingleton = dbMod.db as any;
    if (originals.dbSelect) dbSingleton.select = originals.dbSelect;
    if (originals.dbUpdate) dbSingleton.update = originals.dbUpdate;
  } catch {
    // Restoration is defensive; if a future module shape change makes
    // restoration impossible, swallowing here keeps the test outcome
    // clean rather than masking it with a teardown error.
  }
});

// ── Express response double — mirrors the shape used by smp-commit ──
function makeRes() {
  let statusCode = 200;
  let body: any = undefined;
  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(payload: any) {
      body = payload;
      return res;
    },
    setHeader() {
      return res;
    },
    send() {
      return res;
    },
  };
  return {
    res: res as Response,
    statusCode: () => statusCode,
    body: () => body,
  };
}

// Build a req that walks the active-employee photo-change branch.
// Matches the shape `requireAuth` and `multer` would produce for an
// admin upload — we bypass both middlewares and supply the populated
// fields directly.
function makeUploadReq(filename: string, candidateId = ACTIVE_CANDIDATE_ID): Request {
  stageUploadFile(filename);
  return {
    params: { id: candidateId },
    body: { docType: "photo" },
    headers: {},
    file: {
      path: resolve("uploads", filename),
      filename,
      mimetype: "image/jpeg",
      originalname: filename,
      size: 4,
    },
    // Admin auth so `assertCandidateOwnerOrAdmin` short-circuits
    // without hitting `storage.getCandidateByUserId`.
    authUserId: "user-admin-1",
    authIsSuperAdmin: true,
    authPermissions: new Set(["candidates:update"]),
  } as unknown as Request;
}

describe("POST /api/candidates/:id/documents — Task #168 active-employee Rekognition outage", () => {
  it("fails open with the exact response shape the candidate portal toast depends on", async () => {
    const { res, statusCode, body } = makeRes();
    await documentsHandler(makeUploadReq("task168-active-upload.jpg"), res);

    // 1. The simulated outage actually exercised the AWS SDK send
    //    path — i.e. we are testing the fail-open through the real
    //    `validateFaceQuality` outer catch, not a shortcut around it.
    assert.equal(
      captured.rekognitionSendCalls,
      1,
      "expected validateFaceQuality to call RekognitionClient.send once before failing open",
    );

    // 2. The handler returned 200 (NOT 503) — that's the active-
    //    employee fail-open branch in `decideRekognitionFallbackAction`.
    //    First-upload candidates with no prior photo would get 503
    //    here; that case is covered separately below.
    assert.equal(
      statusCode(),
      200,
      `expected 200 fail-open for active employee, got ${statusCode()} body=${JSON.stringify(body())}`,
    );

    const payload = body();
    assert.ok(payload, "handler must return a JSON body");

    // 3. `pendingReview: true` — the candidate portal reads this to
    //    decide whether to keep showing the existing photo and queue
    //    the new one for HR review (Task #154 toast contract).
    assert.equal(payload.pendingReview, true, "pendingReview must be true");
    assert.ok(
      typeof payload.changeRequestId === "string" && payload.changeRequestId.length > 0,
      "changeRequestId must be a non-empty string",
    );

    // 4. `qualityResult.qualityCheckSkipped: true` — the toast
    //    discriminator. Without this, the candidate portal
    //    misclassifies the response as a normal "verified" upload.
    assert.ok(payload.qualityResult, "qualityResult must be present");
    assert.equal(
      payload.qualityResult.qualityCheckSkipped,
      true,
      "qualityCheckSkipped must be true on the fail-open path",
    );

    // 5. `serviceUnavailableNotice` populated — this is the localized
    //    string the toast renders. Without it, the toast falls back to
    //    a generic "verified" message that misleads the worker into
    //    thinking the outage didn't happen.
    assert.ok(
      typeof payload.qualityResult.serviceUnavailableNotice === "string" &&
        payload.qualityResult.serviceUnavailableNotice.length > 0,
      "serviceUnavailableNotice must be populated on the fail-open path",
    );

    // 6. The handler also created a photo_change_request and an inbox
    //    item — the HR-review safety net the truth table relies on.
    //    If a regression dropped these, the worker's photo would
    //    silently bypass review during outages.
    assert.equal(
      captured.createdPhotoChangeRequests.length,
      1,
      "exactly one photo_change_request should be created",
    );
    assert.equal(captured.createdPhotoChangeRequests[0].status, "pending");
    assert.equal(captured.createdPhotoChangeRequests[0].candidateId, ACTIVE_CANDIDATE_ID);

    assert.equal(
      captured.createdInboxItems.length,
      1,
      "exactly one inbox item should be created for HR review",
    );
    assert.equal(captured.createdInboxItems[0].type, "photo_change_request");

    // 7. Critically, the handler MUST NOT have flipped the live
    //    candidate.photoUrl / hasPhoto. The previously-validated
    //    photo stays active until HR approves the change request —
    //    that's the whole reason we fail-open during outages.
    assert.equal(
      captured.updatedCandidates.length,
      0,
      "active-employee fail-open must not overwrite the live photoUrl",
    );
  });

  it("blocks first-upload candidates during the same outage (no prior validated photo)", async () => {
    // This is the other half of `decideRekognitionFallbackAction`'s
    // truth table — locking it here means a regression that flipped
    // the discriminator from "prior photo" to "any candidate"
    // (incorrectly letting unverified workers through during
    // outages) would surface as a failed assertion in this same file.
    const { res, statusCode, body } = makeRes();

    // Same handler, same patched RekognitionClient, but the candidate
    // has no prior photo on file.
    const FIRST_UPLOAD_ID = "cand-first-upload";
    const storageMod = await import("../storage");
    const stg = storageMod.storage as any;
    const originalGetCandidate = stg.getCandidate;
    stg.getCandidate = async (id: string) => {
      if (id === FIRST_UPLOAD_ID) {
        return {
          id,
          fullNameEn: "First-Time Worker",
          hasPhoto: false,
          photoUrl: null,
          userId: "user-first-1",
          phone: null,
        };
      }
      return originalGetCandidate(id);
    };

    try {
      const req = makeUploadReq("task168-first-upload.jpg", FIRST_UPLOAD_ID);
      await documentsHandler(req, res);

      assert.equal(
        statusCode(),
        503,
        `first-upload during outage must block with 503; got ${statusCode()} body=${JSON.stringify(body())}`,
      );
      const payload = body();
      assert.ok(payload, "handler must return a JSON body on 503");
      assert.ok(payload.qualityResult, "503 body must carry a qualityResult for the client");
      assert.equal(payload.qualityResult.qualityCheckSkipped, true);
      // No photo_change_request on the block path — the upload was
      // rejected outright; nothing to queue for HR.
      assert.equal(
        captured.createdPhotoChangeRequests.length,
        0,
        "blocked first uploads must not enqueue an HR review item",
      );
    } finally {
      stg.getCandidate = originalGetCandidate;
    }
  });
});
