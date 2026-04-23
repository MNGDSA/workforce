// Saudi bank registry, keyed by SARIE bank identifier (positions 5-6 of an SA IBAN).
// Source: SAMA SARIE bank-identifier list (publicly published bank assignments).
export const SAUDI_BANKS: Record<string, { name: string; code: string }> = {
  "01": { name: "Saudi Central Bank (SAMA)",        code: "SAMA"  },
  "05": { name: "Saudi National Bank (SNB)",        code: "SNB"   }, // legacy SAMBA range, now SNB after merger
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

export function resolveSaudiBank(iban: string): { ibanBankName: string; ibanBankCode: string } | null {
  const clean = (iban || "").replace(/\s+/g, "").toUpperCase();
  if (clean.length < 6 || !clean.startsWith("SA")) return null;
  const code = clean.substring(4, 6);
  const bank = SAUDI_BANKS[code];
  if (!bank) return null;
  return { ibanBankName: bank.name, ibanBankCode: bank.code };
}

// Structured validator used to drive specific user-facing error messages.
// Always operates on the whitespace-stripped, uppercased canonical form.
export type IbanValidationOk = {
  ok: true;
  canonical: string;                                      // 24-char SA + 22 digits
  bank: { ibanBankName: string; ibanBankCode: string } | null;
};
export type IbanValidationFail = {
  ok: false;
  reason: "empty" | "missing_prefix" | "wrong_length" | "non_digit";
  length?: number;                                        // length of cleaned input (for wrong_length)
};
export type IbanValidationResult = IbanValidationOk | IbanValidationFail;

export function validateSaudiIban(input: string): IbanValidationResult {
  const clean = (input || "").replace(/\s+/g, "").toUpperCase();
  if (!clean) return { ok: false, reason: "empty" };
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
