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
