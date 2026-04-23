// Task #137 — guard the server-side IBAN holder name validator against
// silent regressions. Covers `validateIbanHolderName`,
// `applyServerIbanHolderNameFields`, and the Zod refine wired into
// `insertCandidateSchema` for `ibanAccountFirstName` /
// `ibanAccountLastName`.
//
// Run with: `npx tsx --test server/__tests__/iban-holder-name.test.ts`

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  validateIbanHolderName,
  applyServerIbanHolderNameFields,
  IbanHolderNameValidationError,
} from "../lib/iban";
import { insertCandidateSchema } from "../../shared/schema";

// Minimal candidate payload shared across schema tests; exercise only
// the IBAN holder-name fields. Other required fields are filled with
// throw-away but valid values.
const baseCandidate = {
  fullName: "Ahmed Test",
  fullNameEn: "Ahmed Test",
  nationalId: "1234567890",
  phone: "0500000000",
  status: "available" as const,
};

// ── validateIbanHolderName ──────────────────────────────────────────────────
describe("validateIbanHolderName", () => {
  it("accepts a normal English first name", () => {
    const r = validateIbanHolderName("Ahmed");
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.canonical, "Ahmed");
  });

  it("accepts compound names with hyphen, apostrophe, period", () => {
    for (const name of ["Mary-Jane", "O'Connor", "Jr.", "John D."]) {
      const r = validateIbanHolderName(name);
      assert.equal(r.ok, true, `expected ${name} to pass`);
    }
  });

  it("collapses internal whitespace and trims edges", () => {
    const r = validateIbanHolderName("  John   Doe  ");
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.canonical, "John Doe");
  });

  it("rejects null/undefined as empty", () => {
    assert.deepEqual(validateIbanHolderName(null), { ok: false, reason: "empty" });
    assert.deepEqual(validateIbanHolderName(undefined), { ok: false, reason: "empty" });
  });

  it("rejects whitespace-only as empty", () => {
    assert.deepEqual(validateIbanHolderName("   "), { ok: false, reason: "empty" });
    assert.deepEqual(validateIbanHolderName(""), { ok: false, reason: "empty" });
  });

  it("rejects Arabic characters as non_latin", () => {
    for (const arabic of ["أحمد", "محمد", "Ahmed أحمد"]) {
      const r = validateIbanHolderName(arabic);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.reason, "non_latin", `expected ${arabic} → non_latin`);
    }
  });

  it("rejects digits, emoji, CJK, leading non-letter", () => {
    for (const bad of ["John1", "Ahmed😀", "李雷", "1Ahmed", "-Ahmed", " 'Ahmed"]) {
      const r = validateIbanHolderName(bad);
      assert.equal(r.ok, false, `expected ${bad} to fail`);
      if (!r.ok) assert.equal(r.reason, "non_latin");
    }
  });

  it("rejects names longer than 64 chars as too_long", () => {
    const longName = "A" + "b".repeat(64); // 65 chars
    const r = validateIbanHolderName(longName);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "too_long");
  });

  it("accepts exactly 64 characters", () => {
    const exact64 = "A" + "b".repeat(63);
    const r = validateIbanHolderName(exact64);
    assert.equal(r.ok, true);
  });
});

// ── applyServerIbanHolderNameFields ────────────────────────────────────────
describe("applyServerIbanHolderNameFields", () => {
  it("normalises both fields when both are valid", () => {
    const row: any = {
      ibanAccountFirstName: "  Ahmed  ",
      ibanAccountLastName: "Al-Saud",
    };
    applyServerIbanHolderNameFields(row);
    assert.equal(row.ibanAccountFirstName, "Ahmed");
    assert.equal(row.ibanAccountLastName, "Al-Saud");
  });

  it("clears empty/whitespace-only values to null (clear semantic)", () => {
    const row: any = {
      ibanAccountFirstName: "",
      ibanAccountLastName: "   ",
    };
    applyServerIbanHolderNameFields(row);
    assert.equal(row.ibanAccountFirstName, null);
    assert.equal(row.ibanAccountLastName, null);
  });

  it("leaves untouched fields alone (partial update)", () => {
    const row: any = { ibanAccountLastName: "Smith" };
    applyServerIbanHolderNameFields(row);
    assert.equal(row.ibanAccountFirstName, undefined);
    assert.equal(row.ibanAccountLastName, "Smith");
  });

  it("throws IbanHolderNameValidationError on Arabic in first name", () => {
    const row: any = { ibanAccountFirstName: "أحمد" };
    assert.throws(
      () => applyServerIbanHolderNameFields(row),
      (err: unknown) => {
        if (!(err instanceof IbanHolderNameValidationError)) return false;
        assert.equal(err.field, "ibanAccountFirstName");
        assert.equal(err.reason, "non_latin");
        return true;
      },
    );
  });

  it("throws IbanHolderNameValidationError on Arabic in last name", () => {
    const row: any = { ibanAccountLastName: "السعودي" };
    assert.throws(
      () => applyServerIbanHolderNameFields(row),
      (err: unknown) => {
        if (!(err instanceof IbanHolderNameValidationError)) return false;
        assert.equal(err.field, "ibanAccountLastName");
        assert.equal(err.reason, "non_latin");
        return true;
      },
    );
  });
});

// ── insertCandidateSchema (Zod refine) ──────────────────────────────────────
describe("insertCandidateSchema (IBAN holder name refine)", () => {
  it("accepts English first/last names", () => {
    const result = insertCandidateSchema.safeParse({
      ...baseCandidate,
      ibanAccountFirstName: "Ahmed",
      ibanAccountLastName: "Al-Saud",
    });
    assert.equal(result.success, true, JSON.stringify((result as any).error));
  });

  it("rejects Arabic in ibanAccountFirstName", () => {
    const result = insertCandidateSchema.safeParse({
      ...baseCandidate,
      ibanAccountFirstName: "أحمد",
      ibanAccountLastName: "Smith",
    });
    assert.equal(result.success, false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      assert.ok(
        paths.includes("ibanAccountFirstName"),
        `expected error on ibanAccountFirstName, got ${paths.join(", ")}`,
      );
    }
  });

  it("rejects Arabic in ibanAccountLastName", () => {
    const result = insertCandidateSchema.safeParse({
      ...baseCandidate,
      ibanAccountFirstName: "Ahmed",
      ibanAccountLastName: "السعودي",
    });
    assert.equal(result.success, false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      assert.ok(paths.includes("ibanAccountLastName"));
    }
  });

  it("accepts null/omitted holder names (clear semantic)", () => {
    const result = insertCandidateSchema.safeParse({
      ...baseCandidate,
      ibanAccountFirstName: null,
      ibanAccountLastName: null,
    });
    assert.equal(result.success, true);
  });

  it("rejects names longer than 64 chars", () => {
    const longName = "A" + "b".repeat(64);
    const result = insertCandidateSchema.safeParse({
      ...baseCandidate,
      ibanAccountFirstName: longName,
      ibanAccountLastName: "Smith",
    });
    assert.equal(result.success, false);
  });
});
