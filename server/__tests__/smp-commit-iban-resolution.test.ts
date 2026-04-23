// Task #134 — behavioural test that drives an actual SMP upload row
// carrying an IBAN through the POST /api/candidates/smp-commit handler
// and asserts the persisted candidate has matching ibanBankName /
// ibanBankCode.
//
// Why this exists on top of the wiring tests in
// `candidate-iban-resolution.test.ts`: those tests pin that
// `applyIbanBankResolution` is *called* at the smp-commit NEW-row create
// paths (regex over routes.ts source). They cannot catch a regression
// where the helper is called but its result is dropped before
// `storage.createCandidate` runs (e.g. someone destructures the parsed
// payload, spreads it into a new object after the helper, etc). This
// test invokes the real route handler with stubbed storage and asserts
// on what `createCandidate` actually sees.
//
// Run with:
//   npx tsx --test server/__tests__/smp-commit-iban-resolution.test.ts

import { strict as assert } from "node:assert";
import { describe, it, before } from "node:test";
import { createServer, type Server } from "node:http";
import express, { type Express, type Request, type Response } from "express";

import { validateIbanChecksum } from "@shared/saudi-banks";

// Construct an SA IBAN (24 chars total: SA + 2 check + 22 digits) where
// the SARIE prefix lives at positions 5-6 (the resolver in
// shared/saudi-banks reads `iban.substring(4, 6)`). Brute-force the two
// check digits to satisfy mod-97 — only 100 candidates so it's instant.
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

// Al Rajhi Bank — SARIE prefix "80" → registry resolves to RJHI / "Al Rajhi Bank"
const VALID_IBAN_ALRAJHI = buildValidSaIban("80", "000000608010167519");
// Saudi National Bank — prefix "10" → SNB
const VALID_IBAN_SNB = buildValidSaIban("10", "000000000000000000");
// Unknown prefix "99" — not in the SAUDI_BANKS registry, so the helper
// must NOT populate bank fields, and (per task spec) must NOT crash.
const VALID_IBAN_UNKNOWN = buildValidSaIban("99", "123456789012345678");

// ─── Storage stub ──────────────────────────────────────────────────────────
//
// We mutate the singleton `storage` object so the route's
// `import { storage } from "./storage"` binding resolves to our stubs.
// Only the handful of methods the smp-commit NEW-row path actually
// touches are overridden; everything else is left alone.

type CapturedCreate = {
  fullNameEn?: string;
  ibanNumber?: string | null;
  ibanBankName?: string | null;
  ibanBankCode?: string | null;
  classification?: string;
  status?: string;
};

const createdCandidates: CapturedCreate[] = [];

let smpCommitHandler: (req: Request, res: Response) => Promise<void> | void;

before(async () => {
  // Pool() in db.ts needs a string, but does NOT connect until first
  // query, so a placeholder is enough to satisfy module load.
  process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";

  const storageMod = await import("../storage");
  const stg = storageMod.storage as any;

  // Race-guard / matched-existing paths return null so the row falls
  // straight into the NEW-create branch.
  stg.getCandidateByNationalId = async () => null;
  stg.getCandidateByPhone = async () => null;

  // The handler calls storage.getCandidate(newCandidate.id) inside
  // `enqueueIfPhoneOnFile`. Returning a row with phone:null causes the
  // helper to early-return, avoiding the activation-token / SMS DB path.
  stg.getCandidate = async (id: string) => ({ id, phone: null, userId: null });

  // Capture every create so the test can assert on the bank fields the
  // handler chose to persist. Return an id so the rest of the handler
  // (audit log, enqueue) has something to work with.
  stg.createCandidate = async (data: CapturedCreate) => {
    createdCandidates.push({ ...data });
    return { id: `cand-${createdCandidates.length}`, ...data } as any;
  };
  // Audit log writes are non-essential; swallow them so a missing DB
  // doesn't surface as a 500 from the handler.
  stg.createAuditLog = async () => ({ id: "audit-stub" });

  // updateCandidate is only hit on phone_conflict / clean / matched-NID
  // paths — none of which our test rows trigger — but we stub it
  // defensively so a future test addition can't hit a real DB.
  stg.updateCandidate = async (id: string, data: any) => ({ id, ...data });

  const { registerRoutes } = await import("../routes");

  const app: Express = express();
  app.use(express.json());
  const httpServer: Server = createServer(app);
  await registerRoutes(httpServer, app);

  // Locate the smp-commit handler in the Express router stack and pull
  // out the *terminal* layer (the actual handler), bypassing the
  // requirePermission middleware. We are testing the handler's data
  // path, not auth; auth is covered by its own middleware tests.
  // Express 5 exposes `app.router`; Express 4 exposed `app._router`.
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

describe("POST /api/candidates/smp-commit — IBAN drift in bulk SMP uploads", () => {
  it("populates ibanBankName/ibanBankCode on a NEW row whose IBAN resolves to a known SARIE prefix", async () => {
    createdCandidates.length = 0;
    const { res, body, statusCode } = pickRes();
    const req = {
      authUserId: "test-actor",
      authIsSuperAdmin: true,
      authPermissions: new Set(["candidates:smp_manage"]),
      body: {
        results: [
          {
            status: "new",
            row: {
              fullNameEn: "Worker Al Rajhi",
              nationalId: "1000000001",
              // No phone → `enqueueIfPhoneOnFile` early-returns and we
              // don't need to stub the activation-token/SMS DB path.
              phone: "",
              ibanNumber: VALID_IBAN_ALRAJHI,
            },
          },
        ],
      },
      headers: {},
    } as unknown as Request;

    await smpCommitHandler(req, res);

    assert.equal(statusCode(), 200, `expected 200, got ${statusCode()} body=${JSON.stringify(body())}`);
    assert.equal(body().created, 1);
    assert.equal(createdCandidates.length, 1);
    const persisted = createdCandidates[0];
    // The behavioural assertion: helper output reached storage.
    assert.equal(persisted.ibanNumber, VALID_IBAN_ALRAJHI);
    assert.equal(persisted.ibanBankCode, "RJHI");
    assert.equal(persisted.ibanBankName, "Al Rajhi Bank");
    // And the row really did go through the SMP create path.
    assert.equal(persisted.classification, "smp");
    assert.equal(persisted.status, "awaiting_activation");
  });

  it("does not crash and continues processing the batch when one row's IBAN has an unknown SARIE prefix", async () => {
    createdCandidates.length = 0;
    const { res, body, statusCode } = pickRes();
    const req = {
      authUserId: "test-actor",
      authIsSuperAdmin: true,
      authPermissions: new Set(["candidates:smp_manage"]),
      body: {
        results: [
          // Row 1: unknown SARIE prefix — must NOT crash the commit;
          // the row is still persisted but its bank fields stay null
          // (per `applyIbanBankResolution`'s graceful path).
          {
            status: "new",
            row: {
              fullNameEn: "Worker Unknown Bank",
              nationalId: "2000000002",
              phone: "",
              ibanNumber: VALID_IBAN_UNKNOWN,
            },
          },
          // Row 2: known SARIE prefix — proves the batch keeps going
          // and the helper still resolves bank fields for siblings of
          // the unknown row.
          {
            status: "new",
            row: {
              fullNameEn: "Worker SNB",
              nationalId: "3000000003",
              phone: "",
              ibanNumber: VALID_IBAN_SNB,
            },
          },
          // Row 3: no IBAN at all — most common SMP upload shape today.
          // Proves the helper's "ibanNumber omitted" no-op branch keeps
          // the row creatable without bank fields being forced to null
          // (the omitted/undefined branch must leave them untouched).
          {
            status: "new",
            row: {
              fullNameEn: "Worker No IBAN",
              nationalId: "4000000004",
              phone: "",
            },
          },
        ],
      },
      headers: {},
    } as unknown as Request;

    await smpCommitHandler(req, res);

    assert.equal(statusCode(), 200, `expected 200, got ${statusCode()} body=${JSON.stringify(body())}`);
    assert.equal(body().created, 3, "all three rows should have been created");
    assert.equal(createdCandidates.length, 3);

    const [unknownRow, snbRow, noIbanRow] = createdCandidates;

    // Unknown SARIE prefix: helper's graceful path leaves bank fields
    // unset on the parsed payload, so storage.createCandidate sees no
    // bank-name/code keys (or sees them undefined). Critically, the
    // commit still succeeded.
    assert.equal(unknownRow.ibanNumber, VALID_IBAN_UNKNOWN);
    assert.notEqual(unknownRow.ibanBankCode, "RJHI");
    assert.notEqual(unknownRow.ibanBankCode, "SNB");
    assert.ok(
      unknownRow.ibanBankCode == null,
      `unknown-prefix row must not get a bank code; got ${unknownRow.ibanBankCode}`,
    );
    assert.ok(
      unknownRow.ibanBankName == null,
      `unknown-prefix row must not get a bank name; got ${unknownRow.ibanBankName}`,
    );

    // Known SARIE prefix sibling: bank fields populated by the helper.
    assert.equal(snbRow.ibanNumber, VALID_IBAN_SNB);
    assert.equal(snbRow.ibanBankCode, "SNB");
    assert.equal(snbRow.ibanBankName, "Saudi National Bank (SNB)");

    // No-IBAN sibling: bank fields stay unset (helper no-op for the
    // omitted branch — must NOT be coerced to null on the create path,
    // since `null` would mean "explicit clear" elsewhere).
    assert.equal(noIbanRow.ibanNumber ?? null, null);
    assert.ok(noIbanRow.ibanBankCode == null);
    assert.ok(noIbanRow.ibanBankName == null);
  });
});

// Tiny helper so each test's `res / statusCode / body` reads as
// callable accessors (mirrors how supertest exposes them).
function pickRes() {
  const m = makeRes();
  return {
    res: m.res,
    statusCode: () => m.statusCode,
    body: () => m.body,
  };
}
