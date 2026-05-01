// Regression coverage for the AR/EN legal copy split + merge helpers.
//
// Operators historically pasted both Arabic and English copy into a
// single `privacy_policy` (or `terms_conditions`) field separated by
// `\n---\n`. The new admin Settings UI writes per-locale keys
// (`privacy_policy_ar`, `privacy_policy_en`, etc.) instead, and the
// legal page picks one based on the user's UI language. These helpers
// power that resolution: `splitLegacyByLanguage` buckets the legacy
// combined text, and `mergeWithLegacyFallback` lets a partially-filled
// new key set fall back to the legacy split for missing sides.
//
// If these regress, AR users could see English copy on their privacy
// page (or vice versa), or operators could lose access to legacy text
// they never re-entered. Keep them honest.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { splitLegacyByLanguage, mergeWithLegacyFallback } from "../lib/legal-copy";

describe("splitLegacyByLanguage", () => {
  it("returns nulls for empty / nullish input", () => {
    assert.deepEqual(splitLegacyByLanguage(null), { ar: null, en: null });
    assert.deepEqual(splitLegacyByLanguage(undefined), { ar: null, en: null });
    assert.deepEqual(splitLegacyByLanguage(""), { ar: null, en: null });
    assert.deepEqual(splitLegacyByLanguage("   \n\n   "), { ar: null, en: null });
  });

  it("buckets a two-segment EN-then-AR doc correctly", () => {
    const legacy = "# Privacy Policy\n\nEnglish body here.\n---\n# سياسة الخصوصية\n\nنص عربي هنا.";
    const out = splitLegacyByLanguage(legacy);
    assert.ok(out.en && out.en.startsWith("# Privacy Policy"), "EN bucket missing");
    assert.ok(out.ar && out.ar.startsWith("# سياسة الخصوصية"), "AR bucket missing");
    assert.equal(out.en?.includes("سياسة"), false, "EN bucket leaked AR");
    assert.equal(out.ar?.includes("Privacy"), false, "AR bucket leaked EN");
  });

  it("buckets AR-then-EN order just as well", () => {
    const legacy = "# عربي\n\nمحتوى\n---\n# English\n\nContent";
    const out = splitLegacyByLanguage(legacy);
    assert.ok(out.ar?.startsWith("# عربي"));
    assert.ok(out.en?.startsWith("# English"));
  });

  it("ignores leading markdown punctuation when sniffing language", () => {
    // Heading prefixes like `### ` and list bullets must not fool the detector.
    const legacy = "### English heading\n\nbody\n---\n### عنوان عربي\n\nمحتوى";
    const out = splitLegacyByLanguage(legacy);
    assert.ok(out.en?.includes("English"));
    assert.ok(out.ar?.includes("عربي"));
  });

  it("joins multiple same-language segments with a blank line", () => {
    const legacy = "First English block.\n---\nأول مقطع عربي\n---\nSecond English block.";
    const out = splitLegacyByLanguage(legacy);
    assert.equal(out.en, "First English block.\n\nSecond English block.");
    assert.equal(out.ar, "أول مقطع عربي");
  });

  it("returns one side null when only one language is present", () => {
    assert.deepEqual(splitLegacyByLanguage("Only English here."), { ar: null, en: "Only English here." });
    assert.deepEqual(splitLegacyByLanguage("نص عربي فقط."), { ar: "نص عربي فقط.", en: null });
  });
});

describe("mergeWithLegacyFallback", () => {
  it("returns new keys verbatim when both sides are filled", () => {
    const out = mergeWithLegacyFallback("ar new", "en new", "ignored\n---\nlegacy");
    assert.deepEqual(out, { ar: "ar new", en: "en new" });
  });

  it("falls back to legacy split for missing sides", () => {
    const legacy = "English fallback.\n---\nاحتياطي عربي.";
    const out = mergeWithLegacyFallback(null, null, legacy);
    assert.equal(out.en, "English fallback.");
    assert.equal(out.ar, "احتياطي عربي.");
  });

  it("merges partial new with legacy fallback for the missing side", () => {
    const legacy = "Old English copy.\n---\nقديم بالعربية.";
    const out = mergeWithLegacyFallback("نص عربي جديد", "", legacy);
    assert.equal(out.ar, "نص عربي جديد", "AR should use the new key");
    assert.equal(out.en, "Old English copy.", "EN should fall back to legacy split");
  });

  it("treats whitespace-only new keys as empty", () => {
    const legacy = "English fallback.\n---\nاحتياطي.";
    const out = mergeWithLegacyFallback("   ", "\n\n", legacy);
    assert.equal(out.en, "English fallback.");
    assert.equal(out.ar, "احتياطي.");
  });

  it("returns nulls when neither new keys nor legacy are populated", () => {
    assert.deepEqual(mergeWithLegacyFallback(null, null, null), { ar: null, en: null });
    assert.deepEqual(mergeWithLegacyFallback("", "", ""), { ar: null, en: null });
  });
});
