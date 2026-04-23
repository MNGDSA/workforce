// Task #133 — consolidated IBAN write-time helper: behaviour + wiring.
//
// History: tasks #121/#127/#132 wired a pure auto-fill helper
// (`applyIbanBankResolution` in `server/lib/candidate-iban-resolution.ts`)
// into every candidate write endpoint to stop rows being persisted with
// `iban_number` set and `iban_bank_code` NULL (the data-quality drift
// task #118 had to clean up). In parallel, task #120 added a
// validating helper (`applyServerIbanFields` in `server/lib/iban.ts`)
// that canonicalises, mod-97 validates, fills bank metadata, and
// mirrors `hasIban`. The header comment in `server/lib/iban.ts`
// called for EVERY API path that writes ibanNumber to go through the
// same gate — two near-identical helpers were the maintenance footgun.
//
// Task #133 collapsed the two helpers into one source of truth:
// `applyServerIbanFields` from `server/lib/iban.ts`. Every IBAN write
// endpoint now imports and calls that helper directly; storage.ts
// keeps calling it as defence-in-depth (idempotent on canonicalised
// IBANs).
//
// This file pins both halves of the consolidation:
//   1. The HELPER itself behaves correctly on the candidate write
//      shapes (POST/PATCH /api/candidates, /bulk, smp-commit,
//      /api/workforce/:id/candidate-profile). Behaviour tests below
//      mirror the call shapes those endpoints use, so a regression
//      surfaces here even if the route handler is otherwise untouched.
//   2. The WIRING: every candidate write endpoint actually calls the
//      consolidated helper, the deleted wrapper is not silently
//      re-introduced, and storage.ts continues to call it as
//      defence-in-depth.
//
// Run with:
//   npx tsx --test server/__tests__/candidate-iban-resolution.test.ts

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { applyServerIbanFields, IbanValidationError } from "../lib/iban";

// ── Fixtures ────────────────────────────────────────────────────────────────
// Real Saudi IBANs with check digits computed offline so they pass the
// ISO-13616 mod-97 checksum that the consolidated helper enforces. The
// 5th and 6th characters carry the SARIE bank prefix the helper resolves.
const IBAN_RAJHI         = "SA2480000000000000000000"; // prefix 80 → RJHI
const IBAN_RAJHI_LOOSE   = "  sa24 8000 0000 0000 0000 0000  "; // same, loose
const IBAN_SNB           = "SA1510123456789012345600"; // prefix 10 → SNB
const IBAN_UNKNOWN_OK    = "SA0699999999999999999999"; // prefix 99, valid checksum
const IBAN_BAD_CHECKSUM  = "SA9980000000000000000000"; // valid format, wrong mod-97 (real check digits would be 24)
const IBAN_WRONG_LENGTH  = "SA1234";

// Shape of the payloads the candidate write endpoints hand to the helper.
// Matches the structural type the helper accepts; passing this avoids any
// `as any` casts at call sites and pins the public contract.
type CandidateIbanWritePayload = {
  ibanNumber?: string | null;
  ibanBankName?: string | null;
  ibanBankCode?: string | null;
  hasIban?: boolean;
  fullNameEn?: string;
  classification?: string;
  status?: string;
};

// ── Behaviour: mirrors POST /api/candidates ─────────────────────────────────
describe("applyServerIbanFields — POST /api/candidates payload shape", () => {
  it("auto-fills bank fields and sets hasIban=true on a valid IBAN with no client-supplied bank", () => {
    // Regression vector task #121 closed: an API client posts an IBAN
    // without bank fields and expects the server to derive them.
    // After consolidation in task #133 we also canonicalise + mirror
    // hasIban in the same call.
    const data: CandidateIbanWritePayload = {
      fullNameEn: "Test Worker",
      ibanNumber: IBAN_RAJHI,
    };
    applyServerIbanFields(data);
    assert.equal(data.ibanNumber, IBAN_RAJHI);
    assert.equal(data.ibanBankName, "Al Rajhi Bank");
    assert.equal(data.ibanBankCode, "RJHI");
    assert.equal(data.hasIban, true);
  });

  it("canonicalises a whitespace+lowercase IBAN before persisting", () => {
    // Whitespace and lowercase-SA were the two most common drift
    // sources before task #120/#133. Pin that the route layer
    // produces a single canonical shape regardless of input quirks.
    const data: CandidateIbanWritePayload = { ibanNumber: IBAN_RAJHI_LOOSE };
    applyServerIbanFields(data);
    assert.equal(data.ibanNumber, IBAN_RAJHI);
    assert.equal(data.ibanBankCode, "RJHI");
  });

  it("overwrites client-supplied bank fields that disagree with the IBAN's SARIE prefix", () => {
    // Server is the source of truth; an out-of-date client cannot
    // persist an Al Rajhi IBAN tagged as SNB.
    const data: CandidateIbanWritePayload = {
      ibanNumber: IBAN_RAJHI,
      ibanBankName: "Saudi National Bank (SNB)",
      ibanBankCode: "SNB",
    };
    applyServerIbanFields(data);
    assert.equal(data.ibanBankName, "Al Rajhi Bank");
    assert.equal(data.ibanBankCode, "RJHI");
  });

  it("resolves a different SARIE prefix (SNB) correctly", () => {
    const data: CandidateIbanWritePayload = { ibanNumber: IBAN_SNB };
    applyServerIbanFields(data);
    assert.equal(data.ibanBankCode, "SNB");
    assert.equal(data.ibanBankName, "Saudi National Bank (SNB)");
  });

  it("rejects a malformed IBAN with IbanValidationError (route layer surfaces 400)", () => {
    // Before consolidation, only some endpoints validated; others
    // relied on Zod or shipped through. After task #133 the helper
    // throws the same way at every endpoint, so every endpoint
    // returns 400 via handleError consistently.
    assert.throws(
      () => applyServerIbanFields({ ibanNumber: IBAN_BAD_CHECKSUM }),
      (e: unknown) => e instanceof IbanValidationError && e.reason === "bad_checksum",
    );
    assert.throws(
      () => applyServerIbanFields({ ibanNumber: IBAN_WRONG_LENGTH }),
      (e: unknown) => e instanceof IbanValidationError && e.reason === "wrong_length",
    );
  });
});

// ── Behaviour: mirrors PATCH /api/candidates/:id ────────────────────────────
describe("applyServerIbanFields — PATCH /api/candidates/:id payload shape", () => {
  it("re-derives bank fields and hasIban when the IBAN changes on a partial payload", () => {
    const data: CandidateIbanWritePayload = { ibanNumber: IBAN_RAJHI };
    applyServerIbanFields(data);
    assert.equal(data.ibanBankCode, "RJHI");
    assert.equal(data.ibanBankName, "Al Rajhi Bank");
    assert.equal(data.hasIban, true);
  });

  it("clears bank fields and hasIban when the IBAN is set to null (the 'remove IBAN' path)", () => {
    // Stale bank fields must be cleared so we never end up with bank
    // code set and IBAN null (the inverse drift). hasIban must also
    // flip to false so the boolean stays consistent with the data.
    const data: CandidateIbanWritePayload = {
      ibanNumber: null,
      ibanBankName: "Al Rajhi Bank",
      ibanBankCode: "RJHI",
      hasIban: true,
    };
    applyServerIbanFields(data);
    assert.equal(data.ibanNumber, null);
    assert.equal(data.ibanBankName, null);
    assert.equal(data.ibanBankCode, null);
    assert.equal(data.hasIban, false);
  });

  it("clears bank fields when the IBAN is set to empty string", () => {
    const data: CandidateIbanWritePayload = {
      ibanNumber: "",
      ibanBankName: "Al Rajhi Bank",
      ibanBankCode: "RJHI",
      hasIban: true,
    };
    applyServerIbanFields(data);
    assert.equal(data.ibanNumber, null);
    assert.equal(data.ibanBankName, null);
    assert.equal(data.ibanBankCode, null);
    assert.equal(data.hasIban, false);
  });

  it("is a no-op when ibanNumber is not part of the partial payload", () => {
    // The route layer calls the helper unconditionally on every PATCH;
    // it must not clobber the row's existing bank fields when the
    // client only sent unrelated fields.
    const data: CandidateIbanWritePayload = { fullNameEn: "Renamed" };
    applyServerIbanFields(data);
    assert.equal("ibanBankName" in data, false);
    assert.equal("ibanBankCode" in data, false);
    assert.equal("hasIban" in data, false);
  });
});

// ── Behaviour: mirrors POST /api/candidates/bulk ────────────────────────────
describe("applyServerIbanFields — POST /api/candidates/bulk row shape", () => {
  it("resolves bank fields independently for each row in a batch", () => {
    // The bulk endpoint loops parsed rows and calls the helper on
    // each one. Simulate that loop here so a future change cannot
    // accidentally share state across rows.
    const batch: CandidateIbanWritePayload[] = [
      { fullNameEn: "Worker A", ibanNumber: IBAN_RAJHI },
      { fullNameEn: "Worker B", ibanNumber: IBAN_SNB },
      { fullNameEn: "Worker C" }, // no IBAN provided → no bank fields set
    ];
    for (const row of batch) applyServerIbanFields(row);

    assert.equal(batch[0].ibanBankCode, "RJHI");
    assert.equal(batch[0].ibanBankName, "Al Rajhi Bank");
    assert.equal(batch[0].hasIban, true);
    assert.equal(batch[1].ibanBankCode, "SNB");
    assert.equal(batch[1].ibanBankName, "Saudi National Bank (SNB)");
    assert.equal(batch[1].hasIban, true);
    assert.equal("ibanBankCode" in batch[2], false);
    assert.equal("hasIban" in batch[2], false);
  });

  it("isolates a malformed IBAN to the offending row (caller catches IbanValidationError)", () => {
    // The /api/candidates/bulk catch block branches on
    // IbanValidationError to record a per-row IBAN message instead of
    // collapsing it into the generic 'invalid row'. This pins the
    // exception shape that branch relies on.
    const goodRow: CandidateIbanWritePayload = { fullNameEn: "OK", ibanNumber: IBAN_RAJHI };
    const badRow: CandidateIbanWritePayload = { fullNameEn: "BAD", ibanNumber: IBAN_BAD_CHECKSUM };

    applyServerIbanFields(goodRow);
    assert.equal(goodRow.ibanBankCode, "RJHI");

    let caught: unknown = null;
    try {
      applyServerIbanFields(badRow);
    } catch (e) {
      caught = e;
    }
    assert.ok(caught instanceof IbanValidationError);
    assert.equal((caught as IbanValidationError).reason, "bad_checksum");
    assert.equal((caught as IbanValidationError).status, 400);
  });
});

// ── Behaviour: prefix in IBAN format but not in SARIE registry ──────────────
describe("applyServerIbanFields — unknown SARIE prefix on a valid-checksum IBAN", () => {
  it("nulls bank fields when the prefix is unknown (does not preserve stale client values)", () => {
    // Consolidation note: the OLD `applyIbanBankResolution` left
    // bank fields untouched on an unknown prefix (so a stale client
    // value survived). The canonical helper nulls them — that is the
    // safer behaviour because it prevents shipping a wrong bank
    // name/code paired with an unrecognised IBAN. Pin the new
    // behaviour explicitly so a future regression to the old
    // semantics is visible.
    const data: CandidateIbanWritePayload = {
      ibanNumber: IBAN_UNKNOWN_OK,
      ibanBankName: "Brand New Bank",
      ibanBankCode: "BNEW",
      hasIban: false,
    };
    applyServerIbanFields(data);
    assert.equal(data.ibanNumber, IBAN_UNKNOWN_OK);
    assert.equal(data.ibanBankName, null);
    assert.equal(data.ibanBankCode, null);
    assert.equal(data.hasIban, true);
  });
});

// ── Wiring: every IBAN write endpoint calls the consolidated helper ─────────
const routesSrc = readFileSync(
  path.join(import.meta.dirname, "..", "routes.ts"),
  "utf8",
);
const storageSrc = readFileSync(
  path.join(import.meta.dirname, "..", "storage.ts"),
  "utf8",
);

describe("Task #133 wiring — single source of truth in routes.ts", () => {
  it("does not re-introduce the deleted candidate-iban-resolution wrapper", () => {
    // The pure auto-fill helper was a wrapper around the same SARIE
    // registry the validating helper uses. Keeping both files left a
    // drift surface (validation vs. resolution) that this task closed.
    // If a future change re-introduces the wrapper, this assertion
    // fails so the consolidation decision is revisited deliberately.
    assert.doesNotMatch(
      routesSrc,
      /from\s*["']\.\/lib\/candidate-iban-resolution["']/,
      "routes.ts must not import from the deleted candidate-iban-resolution module",
    );
    assert.doesNotMatch(
      routesSrc,
      /\bapplyIbanBankResolution\s*\(/,
      "routes.ts must not call the deleted applyIbanBankResolution helper",
    );
  });

  it("imports the canonical applyServerIbanFields from ./lib/iban", () => {
    assert.match(
      routesSrc,
      /import\s*\{[^}]*\bapplyServerIbanFields\b[^}]*\}\s*from\s*["']\.\/lib\/iban["']/,
    );
  });

  it("calls the helper at the POST /api/candidates handler", () => {
    const block = sliceBetween(
      routesSrc,
      'app.post("/api/candidates",',
      'app.patch("/api/candidates/:id"',
    );
    assert.match(block, /\bapplyServerIbanFields\s*\(/);
  });

  it("calls the helper at the PATCH /api/candidates/:id handler", () => {
    const block = sliceBetween(
      routesSrc,
      'app.patch("/api/candidates/:id"',
      'app.post("/api/candidates/:id/archive"',
    );
    assert.match(block, /\bapplyServerIbanFields\s*\(/);
  });

  it("calls the helper at the POST /api/candidates/bulk handler", () => {
    const block = sliceBetween(
      routesSrc,
      'app.post("/api/candidates/bulk",',
      'app.post("/api/candidates/smp-validate"',
    );
    assert.match(block, /\bapplyServerIbanFields\s*\(/);
  });

  it("calls the helper at the PATCH /api/workforce/:id/candidate-profile handler", () => {
    const block = sliceBetween(
      routesSrc,
      'app.patch("/api/workforce/:id/candidate-profile"',
      'app.post("/api/workforce/bulk-update"',
    );
    assert.match(block, /\bapplyServerIbanFields\s*\(/);
  });

  it("calls the helper at both NEW-row create paths inside POST /api/candidates/smp-commit", () => {
    const block = sliceBetween(
      routesSrc,
      'app.post("/api/candidates/smp-commit",',
      'app.post("/api/candidates/activation-tokens/reissue"',
    );
    // smp-commit has two `storage.createCandidate(parsed)` call sites
    // (the phone_conflict→transfer branch and the plain NEW branch);
    // both must be guarded.
    const matches = block.match(/\bapplyServerIbanFields\s*\(/g) ?? [];
    assert.ok(
      matches.length >= 2,
      `expected applyServerIbanFields to be called at least twice in smp-commit, got ${matches.length}`,
    );
  });

  it("the /api/candidates/bulk catch block branches on IbanValidationError so per-row errors surface", () => {
    // After consolidation, IBAN problems thrown by
    // applyServerIbanFields must not be collapsed into the generic
    // "import.invalidRow" message — otherwise the importer cannot
    // tell which IBAN was bad.
    const block = sliceBetween(
      routesSrc,
      'app.post("/api/candidates/bulk",',
      'app.post("/api/candidates/smp-validate"',
    );
    assert.match(block, /e\s+instanceof\s+IbanValidationError/);
  });
});

describe("Task #133 wiring — storage layer keeps the helper as defence-in-depth", () => {
  // Even with the route layer now calling applyServerIbanFields, the
  // storage layer must keep its own call to it. Reasons:
  //   1. Internal callers that bypass routes (admin scripts, future
  //      services) still get the same IBAN gate.
  //   2. The route-layer call is idempotent on already-canonicalised
  //      IBANs, so calling twice is safe.
  // If a future change strips the storage-layer call thinking the
  // route layer is enough, this test fails so the trade-off is made
  // deliberately.

  it("storage.ts imports applyServerIbanFields from ./lib/iban", () => {
    assert.match(
      storageSrc,
      /import\s*\{[^}]*\bapplyServerIbanFields\b[^}]*\}\s*from\s*["']\.\/lib\/iban["']/,
    );
  });

  it("storage.ts calls applyServerIbanFields in createCandidate, updateCandidate, and bulkInsertCandidates", () => {
    const matches = storageSrc.match(/\bapplyServerIbanFields\s*\(/g) ?? [];
    assert.ok(
      matches.length >= 3,
      `expected applyServerIbanFields to be called at least 3 times in storage.ts, got ${matches.length}`,
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
