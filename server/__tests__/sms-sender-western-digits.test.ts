// Unit tests for the SMS-sender Western-digit sanitizer.
//
// Project rule: outbound SMS — Arabic OR English — must contain only Western
// Arabic numerals (0-9). The sanitizer in `server/sms-sender.ts` is the
// final-mile chokepoint that enforces this for every outbound SMS regardless
// of which caller built the string (admin-edited templates, candidate names,
// broadcast text, OTP codes, etc.).

import { test } from "node:test";
import assert from "node:assert/strict";
import { __test__ } from "../sms-sender";

const { toWesternDigitsForSms } = __test__;

test("ASCII passthrough — strings with only Latin digits are unchanged", () => {
  assert.equal(toWesternDigitsForSms("Deadline 2026-05-15 03:34"), "Deadline 2026-05-15 03:34");
  assert.equal(toWesternDigitsForSms(""), "");
  assert.equal(toWesternDigitsForSms("0123456789"), "0123456789");
});

test("Arabic-Indic digits (U+0660-U+0669) are converted to Latin", () => {
  // ٠١٢٣٤٥٦٧٨٩ → 0123456789  // i18n-numerals: allow
  assert.equal(toWesternDigitsForSms("\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669"), "0123456789");
});

test("Extended Arabic-Indic digits (U+06F0-U+06F9, Persian/Urdu) are converted to Latin", () => {
  // ۰۱۲۳۴۵۶۷۸۹ → 0123456789  // i18n-numerals: allow
  assert.equal(toWesternDigitsForSms("\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9"), "0123456789");
});

test("Mixed Arabic copy + Arabic-Indic digits — only digits are rewritten", () => {
  // Simulates `toLocaleString("ar-SA", ...)` output: "15 May 2026" with Arabic-Indic glyphs.
  // ١٥ مايو ٢٠٢٦  → "15 مايو 2026"  // i18n-numerals: allow
  const input = "\u0661\u0665 \u0645\u0627\u064A\u0648 \u0662\u0660\u0662\u0666";
  assert.equal(toWesternDigitsForSms(input), "15 مايو 2026");
});

test("Realistic Arabic onboarding-reminder body emits Latin digits only", () => {
  // What the live `ar-SA` formatter would have produced before the fix.
  const arabicTemplate = "وورك فورس: أحمد، آخر موعد \u0661\u0665 \u0645\u0627\u064A\u0648 \u0662\u0660\u0662\u0666\u060C \u0660\u0663:\u0663\u0664"; // i18n-numerals: allow
  const out = toWesternDigitsForSms(arabicTemplate);
  // No codepoint in the U+0660-U+0669 or U+06F0-U+06F9 range survives.
  for (const ch of out) {
    const cp = ch.charCodeAt(0);
    assert.ok(
      !(cp >= 0x0660 && cp <= 0x0669) && !(cp >= 0x06F0 && cp <= 0x06F9),
      `Leaked Arabic-Indic digit ${ch} (U+${cp.toString(16).padStart(4, "0")})`,
    );
  }
  assert.match(out, /15 مايو 2026/);
  assert.match(out, /03:34/);
});

test("Phone numbers pasted in Arabic-Indic digits are normalized", () => {
  // ٠٥٥٠٨٥٦٢٥٧ → 0550856257  // i18n-numerals: allow
  assert.equal(
    toWesternDigitsForSms("اتصل بـ \u0660\u0665\u0665\u0660\u0668\u0665\u0666\u0662\u0665\u0667"),
    "اتصل بـ 0550856257",
  );
});

test("Idempotent — running twice yields the same string", () => {
  const input = "موعد \u0661\u0665/\u0660\u0665"; // i18n-numerals: allow
  const once = toWesternDigitsForSms(input);
  const twice = toWesternDigitsForSms(once);
  assert.equal(once, "موعد 15/05");
  assert.equal(twice, once);
});
