// Task #127 — pin the write-time IBAN -> bank-name/code resolution
// that task #121 wired into the three candidate write endpoints.
// Without these tests, a refactor could silently strip the helper
// call out of POST /api/candidates, PATCH /api/candidates/:id, or
// POST /api/candidates/bulk and the regression would only surface as
// a production data-quality drift (the exact gap task #118 cleaned up:
// rows with iban_number set and iban_bank_code NULL).
//
// Run with:
//   npx tsx --test server/__tests__/candidate-iban-resolution.test.ts

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  applyIbanBankResolution,
  type CandidateIbanWritable,
} from "../lib/candidate-iban-resolution";

// SARIE bank-identifier sits at positions 5-6 of an SA IBAN
// (substring(4, 6) — i.e. after "SA" + 2 check digits). The helper
// does not validate IBAN checksum (that's the Zod schema's job at
// the route layer); it only resolves bank fields from those two chars.
const VALID_SA_IBAN_ALRAJHI = "SA0380000000608010167519"; // prefix "80"
const VALID_SA_IBAN_SNB = "SA0310000000000000000000"; // prefix "10"
const UNKNOWN_PREFIX_IBAN = "SA0300000000000000000000"; // prefix "00", not registered

// Test payload type: a candidate-shaped object with the IBAN-related
// writable fields plus a permissive bag for unrelated fields like
// `fullNameEn` that the route handlers also pass through. Keeping
// this typed (rather than `Record<string, unknown>` + `as any`)
// surfaces real type regressions in the helper signature.
type TestCandidatePayload = CandidateIbanWritable & {
  fullNameEn?: string;
};

describe("applyIbanBankResolution — POST /api/candidates (create) shape", () => {
  it("auto-fills bank fields when client omits them on a valid SA IBAN", () => {
    // Regression vector task #121 closed: an API client posts an IBAN
    // without bank fields and expects the server to derive them.
    const data: TestCandidatePayload = {
      fullNameEn: "Test Worker",
      ibanNumber: VALID_SA_IBAN_ALRAJHI,
    };
    applyIbanBankResolution(data);
    assert.equal(data.ibanBankName, "Al Rajhi Bank");
    assert.equal(data.ibanBankCode, "RJHI");
  });

  it("overwrites client-supplied bank fields that disagree with the IBAN's SARIE prefix", () => {
    // Server is the source of truth; an out-of-date client cannot
    // persist an Al Rajhi IBAN tagged as SNB.
    const data: TestCandidatePayload = {
      ibanNumber: VALID_SA_IBAN_ALRAJHI,
      ibanBankName: "Saudi National Bank (SNB)",
      ibanBankCode: "SNB",
    };
    applyIbanBankResolution(data);
    assert.equal(data.ibanBankName, "Al Rajhi Bank");
    assert.equal(data.ibanBankCode, "RJHI");
  });

  it("resolves a different SARIE prefix (SNB) correctly", () => {
    const data: TestCandidatePayload = { ibanNumber: VALID_SA_IBAN_SNB };
    applyIbanBankResolution(data);
    assert.equal(data.ibanBankCode, "SNB");
    assert.equal(data.ibanBankName, "Saudi National Bank (SNB)");
  });
});

describe("applyIbanBankResolution — PATCH /api/candidates/:id (update) shape", () => {
  it("re-derives bank fields when the IBAN changes on a partial payload", () => {
    const data: TestCandidatePayload = { ibanNumber: VALID_SA_IBAN_ALRAJHI };
    applyIbanBankResolution(data);
    assert.equal(data.ibanBankCode, "RJHI");
    assert.equal(data.ibanBankName, "Al Rajhi Bank");
  });

  it("clears bank fields to null when the IBAN is set to null (the 'remove IBAN' path)", () => {
    // Stale bank fields must be cleared so we never end up with bank
    // code set and IBAN null (the inverse drift).
    const data: TestCandidatePayload = {
      ibanNumber: null,
      ibanBankName: "Al Rajhi Bank",
      ibanBankCode: "RJHI",
    };
    applyIbanBankResolution(data);
    assert.equal(data.ibanBankName, null);
    assert.equal(data.ibanBankCode, null);
  });

  it("clears bank fields when the IBAN is set to empty string", () => {
    const data: TestCandidatePayload = {
      ibanNumber: "",
      ibanBankName: "Al Rajhi Bank",
      ibanBankCode: "RJHI",
    };
    applyIbanBankResolution(data);
    assert.equal(data.ibanBankName, null);
    assert.equal(data.ibanBankCode, null);
  });

  it("is a no-op when ibanNumber is not part of the partial payload", () => {
    // The route layer calls the helper unconditionally on every PATCH;
    // it must not clobber the row's existing bank fields when the
    // client only sent unrelated fields.
    const data: TestCandidatePayload = { fullNameEn: "Renamed" };
    applyIbanBankResolution(data);
    assert.equal("ibanBankName" in data, false);
    assert.equal("ibanBankCode" in data, false);
  });

  it("is a no-op when ibanNumber is explicitly undefined", () => {
    const data: TestCandidatePayload = { ibanNumber: undefined };
    applyIbanBankResolution(data);
    assert.equal(data.ibanBankName, undefined);
    assert.equal(data.ibanBankCode, undefined);
  });
});

describe("applyIbanBankResolution — POST /api/candidates/bulk shape", () => {
  it("resolves bank fields independently for each row in a batch", () => {
    // The bulk endpoint loops parsed rows and calls the helper on
    // each one. Simulate that loop here so a future change cannot
    // accidentally share state across rows.
    const batch: TestCandidatePayload[] = [
      { fullNameEn: "Worker A", ibanNumber: VALID_SA_IBAN_ALRAJHI },
      { fullNameEn: "Worker B", ibanNumber: VALID_SA_IBAN_SNB },
      { fullNameEn: "Worker C" }, // no IBAN provided → no bank fields set
    ];
    for (const row of batch) applyIbanBankResolution(row);

    assert.equal(batch[0].ibanBankCode, "RJHI");
    assert.equal(batch[0].ibanBankName, "Al Rajhi Bank");
    assert.equal(batch[1].ibanBankCode, "SNB");
    assert.equal(batch[1].ibanBankName, "Saudi National Bank (SNB)");
    assert.equal("ibanBankCode" in batch[2], false);
    assert.equal("ibanBankName" in batch[2], false);
  });
});

describe("applyIbanBankResolution — unknown SARIE prefix (graceful path)", () => {
  it("does not throw and leaves bank fields untouched when the prefix is not in the registry", () => {
    // Task spec: an unknown SARIE prefix must NOT crash the request.
    // The row still saves; bank fields are simply not auto-filled.
    // (IBAN format/checksum validation belongs to the Zod layer.)
    const data: TestCandidatePayload = {
      fullNameEn: "Test Worker",
      ibanNumber: UNKNOWN_PREFIX_IBAN,
    };
    assert.doesNotThrow(() => applyIbanBankResolution(data));
    assert.equal("ibanBankName" in data, false);
    assert.equal("ibanBankCode" in data, false);
    assert.equal(data.ibanNumber, UNKNOWN_PREFIX_IBAN);
  });

  it("does not overwrite client-supplied bank fields on an unknown prefix", () => {
    // If the client hand-typed bank info for an exotic/new bank whose
    // SARIE code we don't yet know, we keep their values rather than
    // wiping them. The clearing path is gated on null/"" only.
    const data: TestCandidatePayload = {
      ibanNumber: UNKNOWN_PREFIX_IBAN,
      ibanBankName: "Brand New Bank",
      ibanBankCode: "BNEW",
    };
    applyIbanBankResolution(data);
    assert.equal(data.ibanBankName, "Brand New Bank");
    assert.equal(data.ibanBankCode, "BNEW");
  });

  it("treats whitespace-only IBAN as a no-op and preserves existing bank fields", () => {
    // ibanNumber: "   " is non-null and not the empty string, but the
    // helper's `iban.trim() !== ""` guard makes neither branch fire.
    // Net effect is a no-op: existing bank fields are preserved and
    // not cleared. This pins the inline behaviour byte-for-byte.
    const data: TestCandidatePayload = {
      ibanNumber: "   ",
      ibanBankName: "Existing Bank",
      ibanBankCode: "EXIS",
    };
    applyIbanBankResolution(data);
    assert.equal(data.ibanBankName, "Existing Bank");
    assert.equal(data.ibanBankCode, "EXIS");
  });
});

describe("applyIbanBankResolution — wiring into routes.ts", () => {
  // The unit tests above prove the helper behaves correctly. These
  // wiring tests prove the helper is actually called at each of the
  // three endpoints. If a future refactor inlines or strips any call
  // site, this test fails loudly instead of letting the regression
  // escape to production.
  const routesSrc = readFileSync(
    path.join(import.meta.dirname, "..", "routes.ts"),
    "utf8",
  );

  it("imports the helper from ./lib/candidate-iban-resolution", () => {
    assert.match(
      routesSrc,
      /import\s*\{\s*applyIbanBankResolution\s*\}\s*from\s*["']\.\/lib\/candidate-iban-resolution["']/,
    );
  });

  it("invokes the helper at the POST /api/candidates handler", () => {
    const block = sliceBetween(
      routesSrc,
      'app.post("/api/candidates",',
      'app.patch("/api/candidates/:id"',
    );
    assert.match(block, /applyIbanBankResolution\s*\(/);
  });

  it("invokes the helper at the PATCH /api/candidates/:id handler", () => {
    const block = sliceBetween(
      routesSrc,
      'app.patch("/api/candidates/:id"',
      'app.post("/api/candidates/:id/archive"',
    );
    assert.match(block, /applyIbanBankResolution\s*\(/);
  });

  it("invokes the helper at the POST /api/candidates/bulk handler", () => {
    const block = sliceBetween(
      routesSrc,
      'app.post("/api/candidates/bulk",',
      'app.post("/api/candidates/smp-validate"',
    );
    assert.match(block, /applyIbanBankResolution\s*\(/);
  });

  // Task #132 — extend wiring assertions to the remaining endpoints that
  // also write `ibanNumber`. Without these, a future refactor could drop
  // the helper from any of these handlers and the regression would only
  // surface as the same data-quality drift task #118 had to clean up
  // (rows with iban_number set and bank code NULL).

  it("invokes the helper at the PATCH /api/workforce/:id/candidate-profile handler", () => {
    const block = sliceBetween(
      routesSrc,
      'app.patch("/api/workforce/:id/candidate-profile"',
      'app.post("/api/workforce/bulk-update"',
    );
    assert.match(block, /applyIbanBankResolution\s*\(/);
  });

  it("invokes the helper at the POST /api/candidates/smp-commit handler (both NEW-row create paths)", () => {
    const block = sliceBetween(
      routesSrc,
      'app.post("/api/candidates/smp-commit",',
      'app.post("/api/candidates/activation-tokens/reissue"',
    );
    // smp-commit has two `storage.createCandidate(parsed)` call sites
    // (the phone_conflict→transfer branch and the plain NEW branch);
    // both must be guarded.
    const matches = block.match(/applyIbanBankResolution\s*\(/g) ?? [];
    assert.ok(
      matches.length >= 2,
      `expected applyIbanBankResolution to be called at least twice in smp-commit, got ${matches.length}`,
    );
  });
});

function sliceBetween(haystack: string, startMarker: string, endMarker: string): string {
  const start = haystack.indexOf(startMarker);
  assert.notEqual(start, -1, `start marker not found in routes.ts: ${startMarker}`);
  const end = haystack.indexOf(endMarker, start);
  assert.notEqual(end, -1, `end marker not found in routes.ts after start: ${endMarker}`);
  return haystack.slice(start, end);
}
