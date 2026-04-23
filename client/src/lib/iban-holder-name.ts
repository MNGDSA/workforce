// Task #137 — Client mirror of `validateIbanHolderName` from
// server/lib/iban.ts. Saudi banks reject wire transfers when the
// beneficiary name on the wire contains non-Latin characters that don't
// match the name on the account. Both client and server enforce the
// same rule so non-browser callers (curl, mobile, bulk imports) can't
// drift around the UI.
//
// Allowed characters: A-Z, a-z, space, hyphen, apostrophe, period.
// Rejects: Arabic, Hebrew, CJK, digits, emoji, empty/whitespace-only,
//   anything longer than 64 characters.

export const IBAN_HOLDER_NAME_MAX_LEN = 64;

export type IbanHolderNameValidationOk = { ok: true; canonical: string };
export type IbanHolderNameValidationFail = {
  ok: false;
  reason: "empty" | "non_latin" | "too_long";
};
export type IbanHolderNameValidationResult =
  | IbanHolderNameValidationOk
  | IbanHolderNameValidationFail;

const IBAN_HOLDER_NAME_ALLOWED_RE = /^[A-Za-z][A-Za-z\s\-'.]*$/;

export function validateIbanHolderName(
  input: string | null | undefined,
): IbanHolderNameValidationResult {
  if (input === null || input === undefined) return { ok: false, reason: "empty" };
  const collapsed = String(input).replace(/\s+/g, " ").trim();
  if (collapsed === "") return { ok: false, reason: "empty" };
  if (collapsed.length > IBAN_HOLDER_NAME_MAX_LEN) {
    return { ok: false, reason: "too_long" };
  }
  if (!IBAN_HOLDER_NAME_ALLOWED_RE.test(collapsed)) {
    return { ok: false, reason: "non_latin" };
  }
  return { ok: true, canonical: collapsed };
}

// Convenience: returns true if the input contains at least one Arabic
// (or other non-allowed) character. Used by inline form hints that want
// to react to typing without going through the full validator chain.
export function hasNonLatinIbanHolderName(input: string | null | undefined): boolean {
  if (input === null || input === undefined) return false;
  const collapsed = String(input).replace(/\s+/g, " ").trim();
  if (collapsed === "") return false;
  return !IBAN_HOLDER_NAME_ALLOWED_RE.test(collapsed);
}

// Task #138 — Strip every character that's not in the IBAN-holder-name
// allow-list (A-Z, a-z, space, hyphen, apostrophe, period). Used as an
// `onChange` transformer on the IBAN holder-name inputs so the user
// physically can't type Arabic / digits / emoji / punctuation that the
// validator would later reject. Saves a round-trip through the
// "wrong characters" error message and prevents a candidate from
// pasting an Arabic name they thought would be accepted.
//
// Notes:
//   - Allow-listing rather than block-listing keeps us future-proof:
//     anything new (Cyrillic, Devanagari, math-bold pseudo-Latin) is
//     stripped without needing a new release.
//   - We collapse runs of internal whitespace to ONE space but DO NOT
//     trim trailing space — the user might be mid-typing a second word.
//   - We do not enforce length here; the validator handles the 64-char
//     limit at submit so the user gets the full error message.
export function stripToIbanHolderName(input: string): string {
  if (!input) return "";
  // Step 1: drop everything that isn't a Latin letter, space, hyphen,
  // apostrophe, or period. The validator's allow-list is "letters and
  // [letters/space/-/'/.]"; while typing we accept the same set
  // anywhere (the leading-letter rule is checked at submit so the user
  // can paste/type freely without losing characters mid-edit).
  const filtered = input.replace(/[^A-Za-z\s\-'.]/g, "");
  // Step 2: normalise every whitespace variant (tab, NBSP, etc.) to a
  // plain space, then collapse runs to ONE space, then drop leading
  // whitespace. We keep a single trailing space so the user can finish
  // typing a second word naturally.
  return filtered
    .replace(/\s/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/^ +/, "")
    // Step 3 — match the validator's leading-letter requirement. The
    // validator rejects "-Ahmed" / ".Ahmed" / "'Ahmed" with a confusing
    // "non_latin" error; strip leading punctuation so the user never
    // gets to type those characters first.
    .replace(/^[-'.]+/, "");
}
