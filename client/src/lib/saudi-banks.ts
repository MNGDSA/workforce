export const SAUDI_BANKS: Record<string, { name: string; code: string }> = {
  "01": { name: "Saudi Central Bank (SAMA)",      code: "SAMA"  },
  "10": { name: "Saudi National Bank (SNB)",       code: "SNB"   },
  "15": { name: "Bank AlBilad",                    code: "ALBI"  },
  "20": { name: "Riyad Bank",                      code: "RIBL"  },
  "30": { name: "Arab National Bank (ANB)",        code: "ANB"   },
  "45": { name: "Saudi British Bank (SABB)",       code: "SABB"  },
  "50": { name: "Gulf International Bank (GIB)",   code: "GIB"   },
  "55": { name: "Banque Saudi Fransi (BSF)",       code: "BSFR"  },
  "60": { name: "Bank Aljazira",                   code: "BJAZ"  },
  "65": { name: "Saudi Investment Bank (SAIB)",    code: "SAIB"  },
  "80": { name: "Al Rajhi Bank",                   code: "RJHI"  },
  "85": { name: "Alinma Bank",                     code: "INMA"  },
  "86": { name: "JPMorgan Chase Bank KSA",         code: "CHAS"  },
  "90": { name: "Gulf International Bank (meem)",  code: "GHBS"  },
  "95": { name: "Emirates NBD KSA",                code: "ENBD"  },
};

export function resolveSaudiBank(iban: string): { ibanBankName: string; ibanBankCode: string } | null {
  const clean = (iban || "").replace(/\s+/g, "").toUpperCase();
  if (clean.length < 6 || !clean.startsWith("SA")) return null;
  const code = clean.substring(4, 6);
  const bank = SAUDI_BANKS[code];
  if (!bank) return null;
  return { ibanBankName: bank.name, ibanBankCode: bank.code };
}
