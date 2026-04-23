// Task #138 — exercise `stripToIbanHolderName` against the real
// patterns we expect users to type or paste into the IBAN holder-name
// inputs. The strip runs on every keystroke, so any character that
// would later trip `validateIbanHolderName` should NEVER reach the
// form state.
//
// Run with: `npx tsx --test client/src/lib/__tests__/iban-holder-name-strip.test.ts`

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { stripToIbanHolderName, validateIbanHolderName } from "../iban-holder-name";

describe("stripToIbanHolderName — keeps Latin characters intact", () => {
  for (const value of [
    "Ahmed",
    "Ahmed Al-Otaibi",
    "Sara O'Connor",
    "Jr.",
    "ab cd-ef'gh",
    "AB",
  ]) {
    it(`preserves "${value}"`, () => {
      assert.equal(stripToIbanHolderName(value), value);
    });
  }
});

describe("stripToIbanHolderName — strips disallowed input on the fly", () => {
  const cases: Array<[string, string]> = [
    ["Ahmed محمد",            "Ahmed "],            // Arabic stripped, trailing space kept
    ["Ahmed123",              "Ahmed"],             // digits removed
    ["Ahmed!@#$%",            "Ahmed"],             // punctuation outside allow-list removed
    ["Ahmed 🍂",              "Ahmed "],            // emoji removed, trailing space kept
    ["𝚃𝚄𝚁𝙺𝚈",                "",                   ], // math-bold pseudo-Latin not in [A-Za-z]
    ["Ahmed\u200BMohammed",   "AhmedMohammed"],     // zero-width joiner removed
    ["Ahmed\tMohammed",       "Ahmed Mohammed"],    // tab → single space
    ["  Ahmed",               "Ahmed"],             // leading whitespace trimmed
    ["Ahmed   Mohammed",      "Ahmed Mohammed"],    // internal whitespace collapsed
    ["",                      ""],                  // empty stays empty
    ["123-456",               ""],                  // digits dropped, leading "-" then stripped by leading-punct rule
    ["-Ahmed",                "Ahmed"],             // leading hyphen stripped (validator requires leading letter)
    [".Ahmed",                "Ahmed"],             // leading period stripped
    ["'Ahmed",                "Ahmed"],             // leading apostrophe stripped
    ["Al-Otaibi",             "Al-Otaibi"],         // hyphen mid-word kept
  ];
  for (const [input, expected] of cases) {
    it(`strips ${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      assert.equal(stripToIbanHolderName(input), expected);
    });
  }
});

describe("stripToIbanHolderName — output is always validator-safe (after trim)", () => {
  // Property: anything the strip returns, when trimmed and non-empty,
  // must pass `validateIbanHolderName`. We exercise a handful of
  // representative inputs.
  const inputs = [
    "Ahmed Al-Otaibi",
    "محمد بن سلمان",
    "Sara O'Connor",
    "Bandar 🌷 Al-Harbi",
    "Mohammed123 Al-Subaie",
    "𝚃𝚄𝚁𝙺𝚈 Al-Harthi",
  ];
  for (const input of inputs) {
    it(`validator-safe for ${JSON.stringify(input)}`, () => {
      const stripped = stripToIbanHolderName(input).trim();
      if (stripped === "") return; // empty is the user's problem to fix at submit
      const v = validateIbanHolderName(stripped);
      assert.equal(v.ok, true, `expected valid, got ${JSON.stringify(v)} for input "${input}" -> "${stripped}"`);
    });
  }
});
