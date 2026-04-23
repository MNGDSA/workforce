// Task #125 — guard the server-side Saudi IBAN logic against silent
// regressions. Covers the helpers in `server/lib/iban.ts`
// (`validateSaudiIban`, `canonicalizeIban`, `resolveSaudiBank`,
// `applyServerIbanFields`) and the Zod refine wired into
// `insertCandidateSchema` in `shared/schema.ts`.
//
// Run with: `npx tsx --test server/__tests__/iban.test.ts`

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  canonicalizeIban,
  validateSaudiIban,
  resolveSaudiBank,
  applyServerIbanFields,
  IbanValidationError,
} from "../lib/iban";
import { insertCandidateSchema, candidateBaseSchema } from "../../shared/schema";

// ── Fixtures ────────────────────────────────────────────────────────────────
// Real-world bank prefixes drawn from SAMA's SARIE registry. Check digits
// (positions 3-4) were computed offline so that each fixture passes the
// ISO-13616 mod-97 checksum that `validateSaudiIban` enforces. Without
// valid checksums these fixtures would be rejected before the
// bank-resolution branch is exercised. (Task #133 — fixtures repaired
// while consolidating the IBAN write helpers; the previous "03" check
// digits in this file did not satisfy mod-97.)
const IBAN_SAMA      = "SA3201" + "0".repeat(18);                 // 01 → SAMA
const IBAN_SNB       = "SA1510" + "1234567890123456".padEnd(18, "0"); // 10 → SNB
const IBAN_RAJHI     = "SA5180" + "1".repeat(18);                 // 80 → Al Rajhi
const IBAN_ALINMA    = "SA9185" + "2".repeat(18);                 // 85 → Alinma
const IBAN_RIYAD     = "SA4620" + "3".repeat(18);                 // 20 → Riyad Bank
const IBAN_UNKNOWN   = "SA0699" + "9".repeat(18);                 // 99 → not in registry

// ── canonicalizeIban ────────────────────────────────────────────────────────
describe("canonicalizeIban", () => {
  it("strips internal whitespace and uppercases", () => {
    assert.equal(
      canonicalizeIban("  sa03 8000 0000 6080 1016 7519  "),
      "SA0380000000608010167519",
    );
  });

  it("returns empty string for null/undefined/empty input", () => {
    assert.equal(canonicalizeIban(""), "");
    assert.equal(canonicalizeIban(null as unknown as string), "");
    assert.equal(canonicalizeIban(undefined as unknown as string), "");
  });
});

// ── validateSaudiIban ───────────────────────────────────────────────────────
describe("validateSaudiIban", () => {
  it("accepts a SAMA IBAN and resolves bank metadata", () => {
    const r = validateSaudiIban(IBAN_SAMA);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.canonical, IBAN_SAMA);
      assert.deepEqual(r.bank, { ibanBankName: "Saudi Central Bank (SAMA)", ibanBankCode: "SAMA" });
    }
  });

  it("accepts an SNB IBAN", () => {
    const r = validateSaudiIban(IBAN_SNB);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.bank?.ibanBankCode, "SNB");
  });

  it("accepts an Al Rajhi IBAN", () => {
    const r = validateSaudiIban(IBAN_RAJHI);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.bank?.ibanBankCode, "RJHI");
  });

  it("accepts an Alinma IBAN", () => {
    const r = validateSaudiIban(IBAN_ALINMA);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.bank?.ibanBankCode, "INMA");
  });

  it("accepts a Riyad Bank IBAN", () => {
    const r = validateSaudiIban(IBAN_RIYAD);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.bank?.ibanBankCode, "RIBL");
  });

  it("canonicalises whitespace + lowercase before validating", () => {
    const r = validateSaudiIban("  sa24 8000 0000 0000 0000 0000  ");
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.canonical, "SA2480000000000000000000");
  });

  it("returns ok=true with bank=null when prefix is unknown", () => {
    const r = validateSaudiIban(IBAN_UNKNOWN);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.bank, null);
  });

  it("rejects IBANs that do not start with SA", () => {
    const r = validateSaudiIban("GB29NWBK60161331926819");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "missing_prefix");
  });

  it("rejects IBANs with the wrong length", () => {
    const r = validateSaudiIban("SA12345");
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reason, "wrong_length");
      assert.equal(r.length, 7);
    }
  });

  it("rejects IBANs that contain non-digit characters after SA", () => {
    const r = validateSaudiIban("SA03ABCD0000000000000000");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "non_digit");
  });
});

// ── resolveSaudiBank ────────────────────────────────────────────────────────
describe("resolveSaudiBank", () => {
  it("returns metadata for a known prefix even on a partial IBAN", () => {
    assert.deepEqual(resolveSaudiBank("SA0380"), {
      ibanBankName: "Al Rajhi Bank",
      ibanBankCode: "RJHI",
    });
  });

  it("tolerates whitespace and lowercase", () => {
    assert.deepEqual(resolveSaudiBank("  sa 03 80  "), {
      ibanBankName: "Al Rajhi Bank",
      ibanBankCode: "RJHI",
    });
  });

  it("returns null for unknown prefixes", () => {
    assert.equal(resolveSaudiBank("SA0399"), null);
  });

  it("returns null for too-short input", () => {
    assert.equal(resolveSaudiBank("SA03"), null);
  });

  it("returns null for non-SA prefix", () => {
    assert.equal(resolveSaudiBank("GB29NW"), null);
  });
});

// ── applyServerIbanFields ───────────────────────────────────────────────────
describe("applyServerIbanFields", () => {
  it("canonicalises a whitespace+lowercase IBAN and fills bank fields + hasIban", () => {
    const out = applyServerIbanFields({
      ibanNumber: "  sa24 8000 0000 0000 0000 0000  ",
      ibanBankName: "wrong",
      ibanBankCode: "wrong",
      hasIban: false,
    });
    assert.equal(out.ibanNumber, "SA2480000000000000000000");
    assert.equal(out.ibanBankName, "Al Rajhi Bank");
    assert.equal(out.ibanBankCode, "RJHI");
    assert.equal(out.hasIban, true);
  });

  it("clears bank metadata + hasIban when ibanNumber is null", () => {
    const out = applyServerIbanFields({
      ibanNumber: null,
      ibanBankName: "stale",
      ibanBankCode: "STAL",
      hasIban: true,
    });
    assert.equal(out.ibanNumber, null);
    assert.equal(out.ibanBankName, null);
    assert.equal(out.ibanBankCode, null);
    assert.equal(out.hasIban, false);
  });

  it("clears bank metadata + hasIban when ibanNumber is an empty / whitespace string", () => {
    const out = applyServerIbanFields({
      ibanNumber: "   ",
      ibanBankName: "stale",
      ibanBankCode: "STAL",
      hasIban: true,
    });
    assert.equal(out.ibanNumber, null);
    assert.equal(out.ibanBankName, null);
    assert.equal(out.ibanBankCode, null);
    assert.equal(out.hasIban, false);
  });

  it("overwrites caller-supplied bank fields with the SARIE-derived values", () => {
    const out = applyServerIbanFields({
      ibanNumber: IBAN_RAJHI,
      ibanBankName: "Some Other Bank",
      ibanBankCode: "OTHR",
      hasIban: false,
    });
    assert.equal(out.ibanBankName, "Al Rajhi Bank");
    assert.equal(out.ibanBankCode, "RJHI");
    assert.equal(out.hasIban, true);
  });

  it("leaves the object untouched when ibanNumber is not present at all", () => {
    const input = { ibanBankName: "keep", ibanBankCode: "KEEP", hasIban: true };
    const out = applyServerIbanFields({ ...input });
    assert.deepEqual(out, input);
  });

  it("throws IbanValidationError for malformed IBANs", () => {
    assert.throws(
      () => applyServerIbanFields({ ibanNumber: "not-an-iban" }),
      (err: unknown) => err instanceof IbanValidationError && err.status === 400,
    );
    assert.throws(
      () => applyServerIbanFields({ ibanNumber: "SA03ABCD0000000000000000" }),
      (err: unknown) => err instanceof IbanValidationError && (err as IbanValidationError).reason === "non_digit",
    );
    assert.throws(
      () => applyServerIbanFields({ ibanNumber: "SA12345" }),
      (err: unknown) => err instanceof IbanValidationError && (err as IbanValidationError).reason === "wrong_length",
    );
  });

  it("nulls out bank fields when the IBAN prefix is not in the SARIE registry", () => {
    const out = applyServerIbanFields({
      ibanNumber: IBAN_UNKNOWN,
      ibanBankName: "stale",
      ibanBankCode: "STAL",
      hasIban: false,
    });
    assert.equal(out.ibanNumber, IBAN_UNKNOWN);
    assert.equal(out.ibanBankName, null);
    assert.equal(out.ibanBankCode, null);
    assert.equal(out.hasIban, true);
  });
});

// ── insertCandidateSchema Zod refine ────────────────────────────────────────
describe("insertCandidateSchema IBAN refine", () => {
  const partial = candidateBaseSchema.partial();

  it("accepts a valid IBAN on .partial()", () => {
    const r = partial.safeParse({ ibanNumber: IBAN_RAJHI });
    assert.equal(r.success, true);
  });

  it("accepts a valid IBAN with whitespace + lowercase on .partial()", () => {
    const r = partial.safeParse({ ibanNumber: "  sa24 8000 0000 0000 0000 0000  " });
    assert.equal(r.success, true);
  });

  it("accepts null and undefined IBAN on .partial()", () => {
    assert.equal(partial.safeParse({ ibanNumber: null }).success, true);
    assert.equal(partial.safeParse({ ibanNumber: undefined }).success, true);
    assert.equal(partial.safeParse({ ibanNumber: "" }).success, true);
  });

  it("rejects malformed IBANs on .partial() (the most common bypass attempt)", () => {
    for (const bad of [
      "not-an-iban",
      "GB29NWBK60161331926819",
      "SA12345",
      "SA03ABCD0000000000000000",
      "SA0380000000000000000000X",        // 25 chars
    ]) {
      const r = partial.safeParse({ ibanNumber: bad });
      assert.equal(r.success, false, `expected ${bad} to be rejected`);
      if (!r.success) {
        assert.match(r.error.issues[0]?.message ?? "", /Invalid IBAN/);
      }
    }
  });
});
