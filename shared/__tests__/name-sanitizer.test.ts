// Snapchat-pollution defence — exercise `sanitizeHumanName` with the
// actual real-world strings observed in the April 23 2026 incident, plus
// the obvious legitimate-name cases the sanitiser must NOT mangle.
//
// Run with: `npx tsx --test shared/__tests__/name-sanitizer.test.ts`

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { sanitizeHumanName, nameNeedsSanitization } from "../name-sanitizer";

describe("sanitizeHumanName — legitimate names pass unchanged", () => {
  for (const name of [
    "Ahmed Al-Otaibi",
    "Mohammed bin Salman",
    "Sara O'Connor",
    "John Smith Jr.",
    "أحمد محمد",                     // pure Arabic
    "Ahmed محمد",                    // mixed Latin + Arabic, valid
    "Maria José",                    // accented Latin
    "Jean-Luc Picard",
    "AB",                            // exactly min length
  ]) {
    it(`accepts "${name}"`, () => {
      const r = sanitizeHumanName(name);
      assert.equal(r.ok, true);
      if (r.ok) {
        assert.equal(r.canonical, name);
        assert.equal(r.changed, false);
      }
    });
  }
});

describe("sanitizeHumanName — Snapchat-pollution patterns", () => {
  const cases: Array<{ input: string; expected: string; label: string }> = [
    { input: "Bandar 🌷",                expected: "Bandar",          label: "trailing emoji"           },
    { input: "🌟 Ahmed",                 expected: "Ahmed",           label: "leading emoji"            },
    { input: "Sara 🍂🍁🍂",              expected: "Sara",            label: "multiple emojis"          },
    { input: "𝚃𝚄𝚁𝙺𝚈",                  expected: "TURKY",           label: "monospace pseudo-Latin"   },
    { input: "𝗘𝘆𝗮𝗱 𝗞𝗮𝗺𝗶𝗹",            expected: "Eyad Kamil",      label: "sans-serif bold pseudo-Latin" },
    { input: "𝓐𝓱𝓶𝓮𝓭",                  expected: "Ahmed",           label: "mathematical script"      },
    { input: "𝐀𝐡𝐦𝐞𝐝",                  expected: "Ahmed",           label: "math bold"                },
    { input: "Ahmed\u200B\u200C",        expected: "Ahmed",           label: "zero-width chars"         },
    { input: "Ahmed\tMohammed",          expected: "Ahmed Mohammed",  label: "tab → space collapse"     },
    { input: "  Ahmed   Mohammed  ",     expected: "Ahmed Mohammed",  label: "whitespace collapse + trim" },
    { input: "Mohammed\u0000Hassan",     expected: "MohammedHassan",  label: "embedded null byte"       },
    { input: "𝚃𝚄𝚁𝙺𝚈 ابراهيم الحارثي",  expected: "TURKY ابراهيم الحارثي", label: "mixed math-Latin + Arabic" },
  ];
  for (const tc of cases) {
    it(`folds/strips: ${tc.label} ("${tc.input}")`, () => {
      const r = sanitizeHumanName(tc.input);
      assert.equal(r.ok, true, `expected ok=true, got ${JSON.stringify(r)}`);
      if (r.ok) {
        assert.equal(r.canonical, tc.expected);
        assert.equal(r.changed, true);
      }
    });
  }
});

describe("sanitizeHumanName — rejections", () => {
  const cases: Array<{ input: string | null | undefined; reason: string; label: string }> = [
    { input: "",                reason: "empty",      label: "empty string"            },
    { input: "   ",             reason: "empty",      label: "whitespace-only"         },
    { input: null,              reason: "empty",      label: "null"                    },
    { input: undefined,         reason: "empty",      label: "undefined"               },
    { input: "🌷🌟🍂",          reason: "empty",      label: "all-emoji collapses to empty" },
    { input: "...",             reason: "no_letters", label: "all-punctuation"         },
    { input: "A",               reason: "too_short",  label: "single letter"           },
    { input: "x".repeat(81),    reason: "too_long",   label: "exceeds 80 chars"        },
  ];
  for (const tc of cases) {
    it(`rejects (${tc.reason}): ${tc.label}`, () => {
      const r = sanitizeHumanName(tc.input);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.reason, tc.reason);
    });
  }
});

describe("nameNeedsSanitization — predicate for the backfill script", () => {
  it("returns true for emoji-laden names", () => {
    assert.equal(nameNeedsSanitization("Bandar 🌷"), true);
  });
  it("returns true for math-bold pseudo-Latin", () => {
    assert.equal(nameNeedsSanitization("𝚃𝚄𝚁𝙺𝚈"), true);
  });
  it("returns false for plain ASCII names", () => {
    assert.equal(nameNeedsSanitization("Ahmed Mohammed"), false);
  });
  it("returns false for plain Arabic names", () => {
    assert.equal(nameNeedsSanitization("أحمد محمد"), false);
  });
  it("returns true for empty / null / unsalvageable input (callers must handle separately)", () => {
    assert.equal(nameNeedsSanitization(null), false); // null short-circuits in predicate
    assert.equal(nameNeedsSanitization(""), false);
    assert.equal(nameNeedsSanitization("🌷🌟🍂"), true);
  });
});
