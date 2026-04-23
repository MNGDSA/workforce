// Task #127 — extracted helper used by the candidate write endpoints
// (POST /api/candidates, PATCH /api/candidates/:id, POST /api/candidates/bulk)
// to apply write-time IBAN -> bank-name/code resolution. The original
// inline blocks were added in task #121 to ensure that no candidate row
// can ever be persisted with `iban_number` set and `iban_bank_code`
// NULL (which is the exact data-quality drift task #118 had to clean
// up). Pulling this into one helper makes the behaviour testable
// (`server/__tests__/candidate-iban-resolution.test.ts`) and pins the
// regression so a future refactor cannot silently strip it out.
//
// Behaviour matrix (mirrors the original inline blocks byte-for-byte):
//
//   ibanNumber is non-empty string + known SARIE prefix
//     → write { ibanBankName, ibanBankCode } from the registry,
//       overriding any client-supplied values.
//
//   ibanNumber is non-empty string + unknown SARIE prefix
//     → leave bank fields untouched (row still saves; we deliberately
//       do not throw here — IBAN format/checksum validation is the
//       Zod schema's job, not this helper's).
//
//   ibanNumber === null  OR  ibanNumber === ""
//     → clear bank fields to null (the "remove IBAN" path).
//
//   ibanNumber omitted (undefined, key absent)
//     → no-op; safe to call unconditionally on partial PATCH payloads.

import { resolveSaudiBank } from "@shared/saudi-banks";

export type CandidateIbanWritable = {
  ibanNumber?: string | null;
  ibanBankName?: string | null;
  ibanBankCode?: string | null;
};

export function applyIbanBankResolution<T extends CandidateIbanWritable>(
  data: T,
): T {
  const iban = data.ibanNumber;
  if (typeof iban === "string" && iban.trim() !== "") {
    const resolved = resolveSaudiBank(iban);
    if (resolved) {
      data.ibanBankName = resolved.ibanBankName;
      data.ibanBankCode = resolved.ibanBankCode;
    }
  } else if (iban === null || iban === "") {
    data.ibanBankName = null;
    data.ibanBankCode = null;
  }
  return data;
}
