// Task #195 — multi-ID candidate search.
//
// Pins the parser used by both the front-end pill ("Searching N IDs")
// and the back-end's multi-token WHERE clause + missing-IDs report.
// A regression in either half — the separator handling, the 200-token
// cap, the dedupe rules, or the ID-shape filter that decides which
// unmatched tokens surface in the missing-IDs panel — would silently
// hand HR a wrong worklist, so we lock the contract here.
//
// The SQL helpers in storage.ts are exercised end-to-end by the
// existing /api/candidates integration suite; this file owns the
// pure-function contract that the helpers and the front-end share.
//
// Run with:
//   npx tsx --test server/__tests__/candidate-multi-id-search.test.ts

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  parseSearchTokens,
  looksLikeId,
  MAX_SEARCH_TOKENS,
} from "../../shared/candidate-search";

describe("parseSearchTokens", () => {
  it("returns empty result for empty / whitespace input", () => {
    for (const v of ["", "   ", "\n\n", "\t", undefined, null]) {
      const r = parseSearchTokens(v as any);
      assert.deepEqual(r, { tokens: [], truncated: false, isMulti: false });
    }
  });

  it("treats a single token (no separators) as single-mode", () => {
    const r = parseSearchTokens("Mohammed Al Fares");
    // Single space inside a name is preserved — only 2+ spaces split.
    assert.deepEqual(r.tokens, ["Mohammed Al Fares"]);
    assert.equal(r.isMulti, false);
    assert.equal(r.truncated, false);
  });

  it("splits on newlines, commas, semicolons, tabs, and 2+ spaces", () => {
    const cases: Array<[string, string[]]> = [
      ["1012345678\n1087654321", ["1012345678", "1087654321"]],
      ["1012345678,1087654321", ["1012345678", "1087654321"]],
      ["1012345678; 1087654321", ["1012345678", "1087654321"]],
      ["1012345678\t1087654321", ["1012345678", "1087654321"]],
      ["1012345678  1087654321", ["1012345678", "1087654321"]],
      [
        "1012345678 ,  1087654321 ;\n  1011112222",
        ["1012345678", "1087654321", "1011112222"],
      ],
    ];
    for (const [input, expected] of cases) {
      const r = parseSearchTokens(input);
      assert.deepEqual(r.tokens, expected, `parsing ${JSON.stringify(input)}`);
      assert.equal(r.isMulti, true);
    }
  });

  it("strips surrounding quotes and dedupes case-insensitively", () => {
    const r = parseSearchTokens(`"1012345678", '1012345678', mohammed, MOHAMMED, MoHaMMeD`);
    assert.deepEqual(r.tokens, ["1012345678", "mohammed"]);
  });

  it("dedupes numeric tokens case-sensitively (no leading-zero collapse)", () => {
    const r = parseSearchTokens("1012345678, 01012345678, 1012345678");
    // 1012345678 dedupes to itself; 01012345678 is a distinct numeric token.
    assert.deepEqual(r.tokens, ["1012345678", "01012345678"]);
  });

  it("caps tokens at MAX_SEARCH_TOKENS and reports truncation", () => {
    // Generate 250 unique numeric IDs.
    const ids = Array.from({ length: 250 }, (_, i) => String(2000000000 + i));
    const r = parseSearchTokens(ids.join("\n"));
    assert.equal(r.tokens.length, MAX_SEARCH_TOKENS);
    assert.equal(r.tokens.length, 200);
    assert.equal(r.truncated, true);
    assert.equal(r.isMulti, true);
    // The first 200 are kept in input order.
    assert.deepEqual(r.tokens.slice(0, 3), ids.slice(0, 3));
    assert.deepEqual(r.tokens[199], ids[199]);
  });

  it("does not flag truncated when exactly at the cap", () => {
    const ids = Array.from({ length: MAX_SEARCH_TOKENS }, (_, i) => String(2000000000 + i));
    const r = parseSearchTokens(ids.join(","));
    assert.equal(r.tokens.length, MAX_SEARCH_TOKENS);
    assert.equal(r.truncated, false);
  });

  it("preserves single-space names and ignores empty tokens between separators", () => {
    const r = parseSearchTokens("Mohammed Al Fares,, ,Khalid Al-Otaibi");
    assert.deepEqual(r.tokens, ["Mohammed Al Fares", "Khalid Al-Otaibi"]);
    assert.equal(r.isMulti, true);
  });
});

describe("looksLikeId", () => {
  it("accepts pure-digit identifiers ≥ 6 chars (national IDs, employee numbers, phones)", () => {
    assert.equal(looksLikeId("1012345678"), true); // Saudi national ID
    assert.equal(looksLikeId("0551234567"), true); // Saudi mobile
    assert.equal(looksLikeId("0000001"), true);    // 7-digit employee number
    assert.equal(looksLikeId("123456"), true);
  });

  it("accepts canonical UUIDs", () => {
    assert.equal(looksLikeId("550e8400-e29b-41d4-a716-446655440000"), true);
    assert.equal(looksLikeId("550E8400-E29B-41D4-A716-446655440000"), true);
  });

  it("accepts mostly-numeric mixed identifiers (≥60% digits)", () => {
    assert.equal(looksLikeId("EMP-00012345"), true); // 8 digits / 12 chars = 66%
    assert.equal(looksLikeId("ID2024-00099"), true); // 9 digits / 12 chars = 75%
  });

  it("rejects free-text searches that should not surface in missing-IDs", () => {
    assert.equal(looksLikeId("Mohammed"), false);
    assert.equal(looksLikeId("Riyadh"), false);
    assert.equal(looksLikeId("Al-Fares"), false);
    assert.equal(looksLikeId("manager"), false);
  });

  it("rejects too-short tokens regardless of shape", () => {
    assert.equal(looksLikeId(""), false);
    assert.equal(looksLikeId("123"), false);    // 3 digits
    assert.equal(looksLikeId("12345"), false);  // 5 digits
    assert.equal(looksLikeId("ab12"), false);
  });
});

describe("multi-ID search end-to-end (parse → bucket)", () => {
  // Mirrors the back-end flow: parse the paste, then split unmatched
  // tokens into "missing IDs" (worth chasing) and dropped free-text.
  it("buckets a mixed paste into ID-shaped vs free-text after parsing", () => {
    const paste = [
      "1012345678",            // ID-shaped, exists
      "1099999999",            // ID-shaped, missing
      "Mohammed Al Fares",     // free-text, missing
      "0551234567",            // ID-shaped, exists
      "EMP-00099999",          // ID-shaped, missing
      "Riyadh",                // free-text, missing
      "550e8400-e29b-41d4-a716-446655440000", // UUID, missing
    ].join("\n");

    const parsed = parseSearchTokens(paste);
    assert.equal(parsed.isMulti, true);
    assert.equal(parsed.tokens.length, 7);

    // Simulate the server: 1012345678 + 0551234567 matched, the rest unmatched.
    const matched = new Set(["1012345678", "0551234567"]);
    const unmatched = parsed.tokens.filter(t => !matched.has(t));
    const missingIds = unmatched.filter(looksLikeId);
    const droppedFreeText = unmatched.length - missingIds.length;

    assert.deepEqual(missingIds, [
      "1099999999",
      "EMP-00099999",
      "550e8400-e29b-41d4-a716-446655440000",
    ]);
    assert.equal(droppedFreeText, 2); // "Mohammed Al Fares", "Riyadh"
  });
});
