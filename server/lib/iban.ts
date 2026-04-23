// Task #120 — server-side Saudi IBAN validator + bank registry.
//
// Mirrors `client/src/lib/saudi-banks.ts` so that EVERY API path that
// writes `ibanNumber` (POST/PATCH /api/candidates, /api/candidates/bulk,
// PATCH /api/workforce/:id/candidate-profile, candidate self-service
// PATCH on their own row, smp-* commits, etc.) goes through the same
// format checks. Without this, any non-browser caller (curl, mobile
// imports, malicious user) could persist garbage IBANs that the rest of
// the app — payroll exports, bank transfers, audits — silently relies on.
//
// Keep the bank registry in lockstep with the client copy: both files
// derive from the same SAMA SARIE bank-identifier list.

export const SAUDI_BANKS: Record<string, { name: string; code: string }> = {
  "01": { name: "Saudi Central Bank (SAMA)",        code: "SAMA"  },
  "05": { name: "Saudi National Bank (SNB)",        code: "SNB"   },
  "10": { name: "Saudi National Bank (SNB)",        code: "SNB"   },
  "15": { name: "Bank AlBilad",                     code: "ALBI"  },
  "20": { name: "Riyad Bank",                       code: "RIBL"  },
  "25": { name: "JPMorgan Chase Bank KSA",          code: "CHAS"  },
  "26": { name: "Bank of China (Saudi)",            code: "BCHI"  },
  "30": { name: "Arab National Bank (ANB)",         code: "ANB"   },
  "35": { name: "T.C. Ziraat Bankasi (Saudi)",      code: "TCZB"  },
  "36": { name: "ICBC (Saudi)",                     code: "ICBK"  },
  "40": { name: "Saudi Awwal Bank (SAB)",           code: "SABB"  },
  "45": { name: "Saudi Awwal Bank (SAB)",           code: "SABB"  },
  "50": { name: "Gulf International Bank (GIB)",    code: "GIB"   },
  "55": { name: "Banque Saudi Fransi (BSF)",        code: "BSFR"  },
  "60": { name: "Bank Aljazira",                    code: "BJAZ"  },
  "65": { name: "Saudi Investment Bank (SAIB)",     code: "SAIB"  },
  "70": { name: "National Bank of Pakistan (Saudi)", code: "NBP"  },
  "75": { name: "National Bank of Bahrain (Saudi)", code: "NBOB"  },
  "76": { name: "Deutsche Bank (Saudi)",            code: "DEUT"  },
  "78": { name: "BNP Paribas (Saudi)",              code: "BNPA"  },
  "80": { name: "Al Rajhi Bank",                    code: "RJHI"  },
  "85": { name: "Alinma Bank",                      code: "INMA"  },
  "86": { name: "JPMorgan Chase Bank KSA",          code: "CHAS"  },
  "90": { name: "Gulf International Bank (meem)",   code: "GHBS"  },
  "95": { name: "Emirates NBD KSA",                 code: "ENBD"  },
  "96": { name: "First Abu Dhabi Bank (Saudi)",     code: "FAB"   },
};

export type IbanValidationOk = {
  ok: true;
  canonical: string;                                      // 24-char SA + 22 digits
  bank: { ibanBankName: string; ibanBankCode: string } | null;
};
export type IbanValidationFail = {
  ok: false;
  reason: "missing_prefix" | "wrong_length" | "non_digit" | "bad_checksum";
  length?: number;
};
export type IbanValidationResult = IbanValidationOk | IbanValidationFail;

export function canonicalizeIban(input: string): string {
  return (input || "").replace(/\s+/g, "").toUpperCase();
}

// Standard IBAN mod-97 checksum (ISO 13616). Move the first four characters
// (country + check digits) to the end, replace letters with their numeric
// equivalents (A=10..Z=35), then compute mod 97. A valid IBAN yields 1.
// Expects an already-cleaned, uppercased IBAN. We process in 7-char chunks
// so the running remainder fits a JS Number — no BigInt needed.
export function validateIbanChecksum(iban: string): boolean {
  const clean = canonicalizeIban(iban);
  if (clean.length < 5) return false;
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  let numeric = "";
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      numeric += ch;
    } else if (code >= 65 && code <= 90) {
      numeric += (code - 55).toString();
    } else {
      return false;
    }
  }
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    const chunk = remainder.toString() + numeric.slice(i, i + 7);
    remainder = Number(chunk) % 97;
  }
  return remainder === 1;
}

export function validateSaudiIban(input: string): IbanValidationResult {
  const clean = canonicalizeIban(input);
  if (!clean.startsWith("SA")) return { ok: false, reason: "missing_prefix" };
  if (clean.length !== 24) return { ok: false, reason: "wrong_length", length: clean.length };
  if (!/^SA\d{22}$/.test(clean)) return { ok: false, reason: "non_digit" };
  // Mod-97 catches typos (transposed digits, single-digit slips) that the
  // format check above will happily pass. Banks reject these at payroll
  // time; we want to reject them at API time instead.
  if (!validateIbanChecksum(clean)) return { ok: false, reason: "bad_checksum" };
  const code = clean.substring(4, 6);
  const bank = SAUDI_BANKS[code];
  return {
    ok: true,
    canonical: clean,
    bank: bank ? { ibanBankName: bank.name, ibanBankCode: bank.code } : null,
  };
}

export function resolveSaudiBank(iban: string): { ibanBankName: string; ibanBankCode: string } | null {
  const clean = canonicalizeIban(iban);
  if (clean.length < 6 || !clean.startsWith("SA")) return null;
  const code = clean.substring(4, 6);
  const bank = SAUDI_BANKS[code];
  if (!bank) return null;
  return { ibanBankName: bank.name, ibanBankCode: bank.code };
}

export class IbanValidationError extends Error {
  status = 400;
  reason: IbanValidationFail["reason"];
  length?: number;
  constructor(fail: IbanValidationFail) {
    super(
      fail.reason === "missing_prefix"
        ? "IBAN must start with SA"
        : fail.reason === "wrong_length"
          ? `IBAN must be 24 characters (got ${fail.length ?? 0})`
          : fail.reason === "non_digit"
            ? "IBAN must contain only digits after SA"
            : "IBAN failed bank checksum check (likely a typo)",
    );
    this.name = "IbanValidationError";
    this.reason = fail.reason;
    this.length = fail.length;
  }
}

// ── Task #137 — IBAN holder-name validation (English-only) ─────────────────
// Saudi banks reject wire transfers when the beneficiary name on the wire
// does not match the name on the account, so the IBAN account first/last
// name must be entered in English exactly as it appears on the bank card.
// Allowed characters: A-Z, a-z, space, hyphen, apostrophe, period.
// Rejects: anything containing characters outside that set (Arabic, Hebrew,
// CJK, digits, emoji, etc.) plus empty / whitespace-only strings.
//
// Length cap of 64 characters mirrors typical SAMA SARIE name field limits
// and protects against accidental form-paste of the entire account profile.

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

export class IbanHolderNameValidationError extends Error {
  status = 400;
  reason: IbanHolderNameValidationFail["reason"];
  field: "ibanAccountFirstName" | "ibanAccountLastName";
  constructor(
    field: "ibanAccountFirstName" | "ibanAccountLastName",
    fail: IbanHolderNameValidationFail,
  ) {
    super(
      fail.reason === "empty"
        ? `${field} is required`
        : fail.reason === "too_long"
          ? `${field} is too long (max ${IBAN_HOLDER_NAME_MAX_LEN} characters)`
          : `${field} must contain English letters only (A-Z, a-z, space, hyphen, apostrophe, period)`,
    );
    this.name = "IbanHolderNameValidationError";
    this.reason = fail.reason;
    this.field = field;
  }
}

// Last-line-of-defence helper invoked by the storage layer for every
// candidate insert/update. For each of the two IBAN holder name fields:
//   - If the key is not present on `data`, leave it alone (PATCH-safe).
//   - If the value is null, allow it (clearing the field is fine).
//   - If the value is a non-empty string, validate. Throws
//     IbanHolderNameValidationError on failure (mapped to 400 by
//     handleError in routes.ts). On success, write back the canonicalised
//     (whitespace-collapsed, trimmed) form so the DB never stores two
//     shapes of the same name.
export function applyServerIbanHolderNameFields<
  T extends {
    ibanAccountFirstName?: string | null;
    ibanAccountLastName?: string | null;
  },
>(data: T): T {
  for (const field of ["ibanAccountFirstName", "ibanAccountLastName"] as const) {
    if (!Object.prototype.hasOwnProperty.call(data, field)) continue;
    const raw = data[field];
    if (raw === null || raw === undefined) {
      data[field] = null as any;
      continue;
    }
    if (typeof raw === "string" && raw.trim() === "") {
      // Treat whitespace-only as a clear (null) — same shape as the IBAN
      // helper. Required-ness is enforced by the route Zod schema, not
      // here, since some PATCH paths legitimately clear the field.
      data[field] = null as any;
      continue;
    }
    const result = validateIbanHolderName(raw);
    if (!result.ok) throw new IbanHolderNameValidationError(field, result);
    data[field] = result.canonical as any;
  }
  return data;
}

// Last-line-of-defence helper invoked by the storage layer for every
// candidate insert/update. If an `ibanNumber` is present and non-empty
// we:
//   1. Canonicalize it (strip whitespace, uppercase).
//   2. Validate format + checksum (throws IbanValidationError on fail).
//   3. Auto-fill ibanBankName / ibanBankCode from SAUDI_BANKS.
//   4. Mirror non-empty state into hasIban.
// If `ibanNumber` is explicitly cleared (null or empty) we normalise to
// null and clear the bank metadata + hasIban flag. If `ibanNumber` is
// not present at all, input is returned unchanged.
export function applyServerIbanFields<
  T extends {
    ibanNumber?: string | null;
    ibanBankName?: string | null;
    ibanBankCode?: string | null;
    hasIban?: boolean;
  },
>(data: T): T {
  if (!Object.prototype.hasOwnProperty.call(data, "ibanNumber")) return data;

  const raw = data.ibanNumber;
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
    data.ibanNumber = null;
    data.ibanBankName = null;
    data.ibanBankCode = null;
    data.hasIban = false;
    return data;
  }

  const result = validateSaudiIban(String(raw));
  if (!result.ok) throw new IbanValidationError(result);

  data.ibanNumber = result.canonical;
  data.ibanBankName = result.bank?.ibanBankName ?? null;
  data.ibanBankCode = result.bank?.ibanBankCode ?? null;
  data.hasIban = true;
  return data;
}
