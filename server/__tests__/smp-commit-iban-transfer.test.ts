// Task #136 — behavioural test that drives an SMP phone-conflict row
// with resolution="transfer" through the POST /api/candidates/smp-commit
// handler and asserts the freshly-created candidate has matching
// ibanBankName / ibanBankCode populated by the server-side IBAN helper.
//
// Why this exists in addition to the NEW-row test in
// `smp-commit-iban-resolution.test.ts`: the smp-commit handler has a
// *second* create path — the phone_conflict resolution=transfer branch —
// that nulls the prior phone owner and creates a brand-new SMP candidate.
// Today only the wiring assertion (regex over routes.ts in
// `candidate-iban-resolution.test.ts`) covers that path. A behavioural
// test here catches a regression where `applyServerIbanFields` is called
// but its result is dropped before `storage.createCandidate` runs on the
// transfer branch (e.g. someone re-spreads the parsed payload after the
// helper, or moves the helper call onto a different object).
//
// Run with:
//   npx tsx --test server/__tests__/smp-commit-iban-transfer.test.ts

import { strict as assert } from "node:assert";
import { describe, it, before } from "node:test";
import { createServer, type Server } from "node:http";
import express, { type Express, type Request, type Response } from "express";

import { validateIbanChecksum } from "@shared/saudi-banks";

// Brute-force the two check digits to satisfy mod-97 — only 100
// candidates so it's instant. Mirrors the helper in the NEW-row sibling
// test; duplicated rather than exported to keep the two tests fully
// independent (they each mutate the storage singleton in different ways
// and shouldn't share helpers across that boundary).
function buildValidSaIban(prefix2: string, account18: string): string {
  assert.equal(prefix2.length, 2, "SARIE prefix must be 2 chars");
  assert.equal(account18.length, 18, "account portion must be 18 digits");
  const tail = prefix2 + account18;
  for (let c = 0; c < 100; c++) {
    const cd = c.toString().padStart(2, "0");
    const candidate = "SA" + cd + tail;
    if (validateIbanChecksum(candidate)) return candidate;
  }
  throw new Error(`no valid check digits for prefix ${prefix2}`);
}

// Al Rajhi Bank — SARIE prefix "80" → registry resolves to RJHI.
const VALID_IBAN_ALRAJHI = buildValidSaIban("80", "000000608010167519");

// ─── Storage stub state ───────────────────────────────────────────────────
//
// The transfer branch is more involved than the plain NEW-row create:
// the handler re-fetches the prior phone owner, compares phones, calls
// getCandidateByPhone to confirm the holder hasn't shifted, then nulls
// the owner's phone and creates a brand-new candidate. We capture every
// updateCandidate and createCandidate call so the test can assert on
// both the destructive mutation (phone -> null on the prior owner) and
// the new candidate's bank fields.

type CapturedCreate = {
  fullNameEn?: string;
  ibanNumber?: string | null;
  ibanBankName?: string | null;
  ibanBankCode?: string | null;
  classification?: string;
  status?: string;
  phone?: string | null;
};

type CapturedUpdate = { id: string; data: any };

const createdCandidates: CapturedCreate[] = [];
const updatedCandidates: CapturedUpdate[] = [];

const PRIOR_OWNER_ID = "prior-owner-1";
// Use a Saudi phone in the local 05xxxxxxxx form so it round-trips
// through the insertCandidateSchema's normaliser unchanged. The
// transfer branch compares `result.row.phone` (raw) against
// `owner.phone` (raw) and only later parses the row, so both sides of
// that comparison must use the same canonical value.
const TRANSFER_PHONE = "0500000001";

let smpCommitHandler: (req: Request, res: Response) => Promise<void> | void;

before(async () => {
  // Pool() in db.ts needs a string but does NOT connect until first
  // query — placeholder is enough to satisfy module load.
  process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";

  const storageMod = await import("../storage");
  const stg = storageMod.storage as any;

  // Blockers helper consults storage; nothing to stub there since the
  // transfer branch routes through `getCandidateBlockers` which has its
  // own storage dependencies. The simplest stub that lets the branch
  // proceed is to short-circuit blockers via getCandidate returning a
  // candidate with no blocking attributes; getCandidateBlockers is
  // imported dynamically inside the handler so we stub the underlying
  // storage methods it consults.

  // Owner lookup used twice in the transfer branch:
  //   1. owner = storage.getCandidate(ownerId) — must return phone === expected
  //   2. enqueueIfPhoneOnFile after createCandidate calls getCandidate
  //      on the *new* candidate id; we return phone:null there so the
  //      activation-token / SMS DB path is skipped.
  stg.getCandidate = async (id: string) => {
    if (id === PRIOR_OWNER_ID) {
      return { id, phone: TRANSFER_PHONE, userId: null, classification: "applicant", status: "active" };
    }
    return { id, phone: null, userId: null };
  };

  // The race-safety re-check in the transfer branch: the current holder
  // of the row's phone must still be the prior owner.
  stg.getCandidateByPhone = async (phone: string) => {
    if (phone === TRANSFER_PHONE) {
      return { id: PRIOR_OWNER_ID, phone, userId: null };
    }
    return null;
  };

  // National-id lookup is consulted by the broader handler for other
  // branches; the transfer branch doesn't hit it, but defensively
  // returning null avoids accidental DB queries if a future refactor
  // adds a pre-check.
  stg.getCandidateByNationalId = async () => null;

  // Capture the destructive mutation (phone nulled on prior owner) and
  // any other update made during the branch. Returning the merged row
  // satisfies callers that read the result.
  stg.updateCandidate = async (id: string, data: any) => {
    updatedCandidates.push({ id, data: { ...data } });
    return { id, ...data };
  };

  // Capture every create so the test can assert on the bank fields the
  // handler chose to persist.
  stg.createCandidate = async (data: CapturedCreate) => {
    createdCandidates.push({ ...data });
    return { id: `cand-${createdCandidates.length}`, ...data } as any;
  };

  // Audit-log writes are non-essential here; swallow them.
  stg.createAuditLog = async () => ({ id: "audit-stub" });

  // The transfer branch calls `invalidatePendingActivationSms` from the
  // sms-outbox module on the prior owner — that module talks to the DB.
  // We can't stub it via the storage singleton; instead we rely on the
  // fact that the handler wraps the call in try/catch and only logs on
  // failure, so a thrown DB error doesn't fail the request. The branch
  // continues to createCandidate either way.

  const { registerRoutes } = await import("../routes");

  const app: Express = express();
  app.use(express.json());
  const httpServer: Server = createServer(app);
  await registerRoutes(httpServer, app);

  // Locate the smp-commit handler and pull out the terminal layer
  // (the actual handler), bypassing the requirePermission middleware.
  // We're testing the handler's data path; auth has its own coverage.
  const router = (app as any).router ?? (app as any)._router;
  const stack = router?.stack ?? [];
  for (const layer of stack) {
    const route = layer.route;
    if (!route || route.path !== "/api/candidates/smp-commit") continue;
    if (!route.methods?.post) continue;
    const subStack = route.stack as Array<{ handle: any }>;
    smpCommitHandler = subStack[subStack.length - 1].handle;
    break;
  }
  assert.ok(smpCommitHandler, "could not locate POST /api/candidates/smp-commit handler in router stack");
});

// Minimal Express-shaped response double — only the methods the handler
// actually invokes.
function makeRes() {
  let statusCode = 200;
  let body: any = undefined;
  const res: any = {
    status(code: number) { statusCode = code; return res; },
    json(payload: any) { body = payload; return res; },
    setHeader() { return res; },
  };
  return {
    res: res as Response,
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
}

function pickRes() {
  const m = makeRes();
  return {
    res: m.res,
    statusCode: () => m.statusCode,
    body: () => m.body,
  };
}

describe("POST /api/candidates/smp-commit — IBAN drift on phone_conflict transfer branch", () => {
  it("populates ibanBankName/ibanBankCode on the new candidate created by the transfer resolution AND nulls the prior owner's phone", async () => {
    createdCandidates.length = 0;
    updatedCandidates.length = 0;

    const { res, body, statusCode } = pickRes();
    const req = {
      authUserId: "test-actor",
      authIsSuperAdmin: true,
      authPermissions: new Set(["candidates:smp_manage"]),
      body: {
        results: [
          {
            status: "phone_conflict",
            resolution: "transfer",
            row: {
              fullNameEn: "Worker Transfer Al Rajhi",
              nationalId: "5000000005",
              phone: TRANSFER_PHONE,
              ibanNumber: VALID_IBAN_ALRAJHI,
            },
            conflictCandidate: {
              id: PRIOR_OWNER_ID,
              fullNameEn: "Prior Phone Owner",
              nationalId: "9000000009",
            },
          },
        ],
      },
      headers: {},
    } as unknown as Request;

    await smpCommitHandler(req, res);

    assert.equal(statusCode(), 200, `expected 200, got ${statusCode()} body=${JSON.stringify(body())}`);
    assert.equal(body().created, 1, `expected created=1, body=${JSON.stringify(body())}`);

    // ── Destructive-step assertion: prior owner's phone was nulled ────
    // Without this, a future refactor could silently break the transfer
    // step itself (e.g. skip the updateCandidate) while still creating
    // the new candidate, and the IBAN assertion below would still pass.
    const phoneNullUpdate = updatedCandidates.find(
      (u) => u.id === PRIOR_OWNER_ID && u.data.phone === null,
    );
    assert.ok(
      phoneNullUpdate,
      `expected prior owner ${PRIOR_OWNER_ID} to have phone nulled; updates=${JSON.stringify(updatedCandidates)}`,
    );

    // ── IBAN-drift assertion: helper output reached storage on the
    // transfer-branch create path.
    assert.equal(createdCandidates.length, 1, "transfer branch must create exactly one candidate");
    const persisted = createdCandidates[0];
    assert.equal(persisted.ibanNumber, VALID_IBAN_ALRAJHI);
    assert.equal(persisted.ibanBankCode, "RJHI");
    assert.equal(persisted.ibanBankName, "Al Rajhi Bank");
    // And the row really did go through the SMP transfer create path.
    assert.equal(persisted.classification, "smp");
    assert.equal(persisted.status, "awaiting_activation");
    assert.equal(persisted.phone, TRANSFER_PHONE);
  });
});
