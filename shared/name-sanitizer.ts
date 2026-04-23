// Snapchat-pollution defence (response to the April 2026 Snapchat
// recruitment campaign that flooded the candidate intake with
// emoji-laden Snapchat display names like "Bandar 🍂",
// "𝚃𝚄𝚁𝙺𝚈 ابراهيم الحارثي", and Unicode mathematical-bold pseudo-Latin
// like "𝗘𝘆𝗮𝗱 𝗞𝗮𝗺𝗶𝗹"). Snapchat's in-app browser autofills the apply
// form's "Full Name" field with the user's profile display name, and
// our schema previously accepted any string of length ≥ 2.
//
// This module is the single source of truth for human-name sanitation,
// shared by `shared/schema.ts` (Zod refines on `insertCandidateSchema`)
// and the client apply form (`client/src/pages/candidate-portal.tsx`).
// Server, schema and client all run the exact same code so curl /
// mobile / bulk-import callers can't bypass the front-end sanitation.

// ── Unicode mathematical-bold / styled pseudo-Latin → plain ASCII ──────────
// Snapchat profile names heavily use the Mathematical Alphanumeric Symbols
// block (U+1D400-U+1D7FF) and a few legacy presentation blocks. These look
// identical to plain Latin letters but are NOT [A-Za-z], so they slip past
// the IBAN holder-name regex (Task #137) and any naïve charset filter.
//
// We fold the most common stylized ranges back to ASCII before any other
// processing. The mapping is exhaustive for the alphanumeric symbols that
// human-name fields can plausibly contain; non-letter math symbols
// (operators, arrows, etc.) are left for the emoji/symbol stripper below.
const STYLISED_LATIN_RANGES: Array<{ start: number; end: number; baseUpper?: number; baseLower?: number; baseDigit?: number }> = [
  // U+1D400-1D419 Mathematical Bold A-Z then U+1D41A-1D433 a-z
  { start: 0x1d400, end: 0x1d419, baseUpper: 0x41 },
  { start: 0x1d41a, end: 0x1d433, baseLower: 0x61 },
  // Mathematical Italic
  { start: 0x1d434, end: 0x1d44d, baseUpper: 0x41 },
  { start: 0x1d44e, end: 0x1d467, baseLower: 0x61 },
  // Mathematical Bold Italic
  { start: 0x1d468, end: 0x1d481, baseUpper: 0x41 },
  { start: 0x1d482, end: 0x1d49b, baseLower: 0x61 },
  // Mathematical Script
  { start: 0x1d49c, end: 0x1d4b5, baseUpper: 0x41 },
  { start: 0x1d4b6, end: 0x1d4cf, baseLower: 0x61 },
  // Mathematical Bold Script
  { start: 0x1d4d0, end: 0x1d4e9, baseUpper: 0x41 },
  { start: 0x1d4ea, end: 0x1d503, baseLower: 0x61 },
  // Mathematical Fraktur
  { start: 0x1d504, end: 0x1d51d, baseUpper: 0x41 },
  { start: 0x1d51e, end: 0x1d537, baseLower: 0x61 },
  // Mathematical Double-Struck
  { start: 0x1d538, end: 0x1d551, baseUpper: 0x41 },
  { start: 0x1d552, end: 0x1d56b, baseLower: 0x61 },
  // Mathematical Bold Fraktur
  { start: 0x1d56c, end: 0x1d585, baseUpper: 0x41 },
  { start: 0x1d586, end: 0x1d59f, baseLower: 0x61 },
  // Mathematical Sans-Serif
  { start: 0x1d5a0, end: 0x1d5b9, baseUpper: 0x41 },
  { start: 0x1d5ba, end: 0x1d5d3, baseLower: 0x61 },
  // Mathematical Sans-Serif Bold
  { start: 0x1d5d4, end: 0x1d5ed, baseUpper: 0x41 },
  { start: 0x1d5ee, end: 0x1d607, baseLower: 0x61 },
  // Mathematical Sans-Serif Italic
  { start: 0x1d608, end: 0x1d621, baseUpper: 0x41 },
  { start: 0x1d622, end: 0x1d63b, baseLower: 0x61 },
  // Mathematical Sans-Serif Bold Italic
  { start: 0x1d63c, end: 0x1d655, baseUpper: 0x41 },
  { start: 0x1d656, end: 0x1d66f, baseLower: 0x61 },
  // Mathematical Monospace (heavily used by Snapchat for "𝚃𝚄𝚁𝙺𝚈" style names)
  { start: 0x1d670, end: 0x1d689, baseUpper: 0x41 },
  { start: 0x1d68a, end: 0x1d6a3, baseLower: 0x61 },
  // Mathematical Bold Digits 0-9
  { start: 0x1d7ce, end: 0x1d7d7, baseDigit: 0x30 },
  // Mathematical Double-Struck Digits
  { start: 0x1d7d8, end: 0x1d7e1, baseDigit: 0x30 },
  // Mathematical Sans-Serif Digits
  { start: 0x1d7e2, end: 0x1d7eb, baseDigit: 0x30 },
  // Mathematical Sans-Serif Bold Digits
  { start: 0x1d7ec, end: 0x1d7f5, baseDigit: 0x30 },
  // Mathematical Monospace Digits
  { start: 0x1d7f6, end: 0x1d7ff, baseDigit: 0x30 },
];

function foldStylisedLatin(input: string): string {
  let out = "";
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    let mapped: string | null = null;
    for (const range of STYLISED_LATIN_RANGES) {
      if (cp < range.start || cp > range.end) continue;
      const offset = cp - range.start;
      if (range.baseUpper !== undefined) mapped = String.fromCharCode(range.baseUpper + offset);
      else if (range.baseLower !== undefined) mapped = String.fromCharCode(range.baseLower + offset);
      else if (range.baseDigit !== undefined) mapped = String.fromCharCode(range.baseDigit + offset);
      break;
    }
    out += mapped ?? ch;
  }
  return out;
}

// ── Emoji / symbol / control-character stripping ───────────────────────────
// Strips emoji presentation, pictographs, dingbats, regional indicators,
// VS-15/16 variation selectors, ZWJ sequences, control characters, and
// orphan surrogate halves. Keeps Latin, Arabic, common Latin/Arabic
// punctuation, spaces, hyphens, apostrophes, periods, and digits.
//
// Implementation: we walk by code point so 4-byte BMP-supplementary
// characters (emoji are mostly U+1F000+) are correctly identified and
// removed without leaving lone surrogate halves behind.
function isStrippableCodePoint(cp: number): boolean {
  // C0/C1 controls. Tab (0x09), LF (0x0A), CR (0x0D) are whitespace —
  // let them through so the `\s+ → " "` collapse downstream turns them
  // into a single space rather than stripping them and silently fusing
  // adjacent words ("Ahmed\tMohammed" → "AhmedMohammed").
  if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) return true;
  if (cp >= 0x7f && cp <= 0x9f) return true;
  // Soft hyphen + invisible formatting chars often pasted from rich UIs
  if (cp === 0xad) return true;
  // Zero-width / bidi / variation selectors / joiner controls
  if (cp >= 0x200b && cp <= 0x200f) return true; // ZWSP, ZWNJ, ZWJ, LRM, RLM
  if (cp >= 0x202a && cp <= 0x202e) return true; // explicit bidi formatting
  if (cp >= 0x2060 && cp <= 0x206f) return true; // word joiner & friends
  if (cp === 0xfeff) return true;                 // BOM / ZWNBSP
  if (cp >= 0xfe00 && cp <= 0xfe0f) return true;  // variation selectors 1-16
  if (cp >= 0xe0100 && cp <= 0xe01ef) return true; // variation selectors supplement
  // Tag characters (used in some flag emoji + invisible tag injections)
  if (cp >= 0xe0000 && cp <= 0xe007f) return true;
  // Emoji presentation / dingbats / pictographs / symbols blocks
  if (cp >= 0x2600 && cp <= 0x27bf) return true;   // misc symbols + dingbats
  if (cp >= 0x1f000 && cp <= 0x1faff) return true; // emoji + supplemental symbols
  if (cp >= 0x1f900 && cp <= 0x1f9ff) return true; // supplemental symbols & pictographs
  if (cp >= 0x1f300 && cp <= 0x1f5ff) return true; // misc symbols & pictographs
  if (cp >= 0x1f600 && cp <= 0x1f64f) return true; // emoticons
  if (cp >= 0x1f680 && cp <= 0x1f6ff) return true; // transport
  if (cp >= 0x1f700 && cp <= 0x1f77f) return true; // alchemical
  if (cp >= 0x1f780 && cp <= 0x1f7ff) return true; // geometric extended
  if (cp >= 0x1f800 && cp <= 0x1f8ff) return true; // supplemental arrows-c
  if (cp >= 0x1fa00 && cp <= 0x1faff) return true; // chess + extended
  // Regional indicator symbols (flag emoji halves)
  if (cp >= 0x1f1e6 && cp <= 0x1f1ff) return true;
  // Skin-tone modifiers
  if (cp >= 0x1f3fb && cp <= 0x1f3ff) return true;
  // Lone surrogate halves (cp range stays in 16-bit space — only relevant
  // if the input was already malformed UTF-16; defensive)
  if (cp >= 0xd800 && cp <= 0xdfff) return true;
  // Combining diacritics that arrive without a base (common in pasted
  // Snap-styled text). We don't strip in-place combining marks because
  // legitimate Arabic harakat live at U+064B-065F and U+0670; only
  // strip "combining grapheme joiner" and a few obvious abuse cases.
  if (cp === 0x034f) return true;   // CGJ
  if (cp === 0xfffc) return true;   // object replacement char
  if (cp === 0xfffd) return true;   // replacement char (mojibake)
  return false;
}

function stripSymbolsAndControls(input: string): string {
  let out = "";
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    if (isStrippableCodePoint(cp)) continue;
    out += ch;
  }
  return out;
}

// ── Public API ─────────────────────────────────────────────────────────────
export const HUMAN_NAME_MAX_LEN = 80;
export const HUMAN_NAME_MIN_LEN = 2;

export type NameSanitizationOk = { ok: true; canonical: string; changed: boolean };
export type NameSanitizationFail = {
  ok: false;
  reason: "empty" | "too_short" | "too_long" | "no_letters";
};
export type NameSanitizationResult = NameSanitizationOk | NameSanitizationFail;

// Sanitises a free-form human name (Latin, Arabic, or mixed) coming out
// of an untrusted form (apply page, profile-setup, bulk import).
//
// Pipeline:
//   1. NFC normalise (combine "e" + combining-acute → "é") to fix paste
//      from chat clients that ship decomposed forms.
//   2. Fold Unicode mathematical-bold / sans-serif / monospace pseudo-Latin
//      back to plain ASCII so "𝚃𝚄𝚁𝙺𝚈" becomes "TURKY".
//   3. Strip emoji, dingbats, regional indicators, variation selectors,
//      zero-width chars, controls — anything that isn't a printable
//      letter/digit/punctuation a human would put in a name.
//   4. Collapse internal whitespace runs to a single space and trim.
//   5. Reject if the result would be empty, all-symbols (no letter), or
//      shorter / longer than the configured bounds.
//
// `changed` is true when the cleaned output differs from the raw input —
// callers can use it to log / audit Snapchat-style pollution.
export function sanitizeHumanName(input: string | null | undefined): NameSanitizationResult {
  if (input === null || input === undefined) return { ok: false, reason: "empty" };
  const raw = String(input);
  if (raw.trim() === "") return { ok: false, reason: "empty" };

  // Steps 1-3: normalise → fold styled Latin → strip symbols.
  const normalised = raw.normalize("NFC");
  const folded = foldStylisedLatin(normalised);
  const stripped = stripSymbolsAndControls(folded);
  // Step 4: collapse whitespace.
  const collapsed = stripped.replace(/\s+/g, " ").trim();

  if (collapsed === "") return { ok: false, reason: "empty" };
  if (collapsed.length < HUMAN_NAME_MIN_LEN) return { ok: false, reason: "too_short" };
  if (collapsed.length > HUMAN_NAME_MAX_LEN) return { ok: false, reason: "too_long" };
  // Must contain at least one letter (Latin or Arabic) — rejects names
  // that turned into all-punctuation after stripping ("...", "---").
  if (!/[A-Za-z\u0600-\u06FF]/.test(collapsed)) return { ok: false, reason: "no_letters" };

  return { ok: true, canonical: collapsed, changed: collapsed !== raw };
}

// Convenience predicate for the audit / backfill script.
export function nameNeedsSanitization(input: string | null | undefined): boolean {
  if (!input) return false;
  const result = sanitizeHumanName(input);
  return result.ok ? result.changed : true;
}
