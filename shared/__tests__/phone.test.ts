// Task #227 — unit tests for `canonicalSaMobileSuffix`, the helper that
// collapses any accepted Saudi-mobile input format into a stable 9-digit
// suffix so the interview multi-ID search can match phones regardless of
// how they were pasted vs how they happen to be stored on each invitee.
//
// Run with: `npx tsx --test shared/__tests__/phone.test.ts`

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { canonicalSaMobileSuffix } from "../phone";

describe("canonicalSaMobileSuffix — accepted formats collapse to the same 9-digit suffix", () => {
  // Same mobile, six different real-world spellings.
  const variants: Array<[string, string]> = [
    ["0550856257",        "550856257"],
    ["+966550856257",     "550856257"],
    ["966550856257",      "550856257"],
    ["00966550856257",    "550856257"],
    ["+966 55 085 6257",  "550856257"],
    ["+966-55-085-6257",  "550856257"],
    ["(966) 550 856 257", "550856257"],
    ["550856257",         "550856257"], // bare 9-digit, leading "5"
  ];
  for (const [input, expected] of variants) {
    it(`"${input}" → "${expected}"`, () => {
      assert.equal(canonicalSaMobileSuffix(input), expected);
    });
  }

  it("Arabic-Indic digits canonicalise the same as Western digits", () => {
    // ٠٥٥٠٨٥٦٢٥٧ === 0550856257
    assert.equal(canonicalSaMobileSuffix("٠٥٥٠٨٥٦٢٥٧"), "550856257");
  });

  it("two different mobiles produce two different suffixes", () => {
    const a = canonicalSaMobileSuffix("0550856257");
    const b = canonicalSaMobileSuffix("0568691660");
    assert.equal(a, "550856257");
    assert.equal(b, "568691660");
    assert.notEqual(a, b);
  });
});

describe("canonicalSaMobileSuffix — non-phones return null", () => {
  for (const input of [
    "1090117400",                              // 10-digit national ID (starts with 1)
    "2050858200",                              // 10-digit national ID (starts with 2)
    "7777777777",                              // 10-digit numeric, not a Saudi mobile
    "0490856257",                              // 10-digit starting with 04, not 05
    "12345",                                   // too short
    "abc123",                                  // mixed
    "Mohammed Al Fares",                       // a name
    "00000000-0000-0000-0000-000000000001",    // a UUID
    "",                                         // empty
    "   ",                                     // whitespace
    "+1-415-555-2671",                         // non-Saudi international
    "0150856257",                              // 10-digit landline-ish (not 05)
  ]) {
    it(`"${input}" → null`, () => {
      assert.equal(canonicalSaMobileSuffix(input), null);
    });
  }

  it("null / undefined / non-string inputs return null", () => {
    assert.equal(canonicalSaMobileSuffix(null), null);
    assert.equal(canonicalSaMobileSuffix(undefined), null);
    assert.equal(canonicalSaMobileSuffix(123 as unknown), null); // 3-digit number
  });
});
