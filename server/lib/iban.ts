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
  reason: "missing_prefix" | "wrong_length" | "non_digit";
  length?: number;
};
export type IbanValidationResult = IbanValidationOk | IbanValidationFail;

export function canonicalizeIban(input: string): string {
  return (input || "").replace(/\s+/g, "").toUpperCase();
}

export function validateSaudiIban(input: string): IbanValidationResult {
  const clean = canonicalizeIban(input);
  if (!clean.startsWith("SA")) return { ok: false, reason: "missing_prefix" };
  if (clean.length !== 24) return { ok: false, reason: "wrong_length", length: clean.length };
  if (!/^SA\d{22}$/.test(clean)) return { ok: false, reason: "non_digit" };
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
          : "IBAN must contain only digits after SA",
    );
    this.name = "IbanValidationError";
    this.reason = fail.reason;
    this.length = fail.length;
  }
}

// Last-line-of-defence helper invoked by the storage layer for every
// candidate insert/update. If an `ibanNumber` is present and non-empty
// we:
//   1. Canonicalize it (strip whitespace, uppercase) so the DB never
//      stores two different shapes of the same IBAN.
//   2. Validate format (SA + 22 digits). On failure throws
//      IbanValidationError so the caller returns 400.
//   3. Auto-fill ibanBankName / ibanBankCode from SAUDI_BANKS so future
//      backfills stop being necessary. Caller-supplied values are
//      overwritten — the SARIE registry is the source of truth.
//   4. Mirror the (now non-empty) state into hasIban so the boolean
//      flag stays consistent with the data.
//
// If `ibanNumber` is explicitly cleared (null or empty string) we
// normalise to null and clear the bank metadata + hasIban flag.
//
// If `ibanNumber` is not present at all, the input is returned
// unchanged.
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
