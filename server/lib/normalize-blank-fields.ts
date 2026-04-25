// Task #183 — write-boundary helper that turns "" / whitespace-only
// dropdown values into `null` for the per-model field lists below.
// Extracted into its own module in task #184 so the helper and its
// per-model field lists can be imported by `server/__tests__/` without
// pulling in the full `server/routes.ts` dependency graph (db, storage,
// auth, file storage, etc).
//
// The helper itself preserves the original semantics:
//   - operates in-place on the same object reference and returns it
//   - touches only keys present in `fields`; missing keys stay missing
//   - normalises `""` and whitespace-only strings to `null`
//   - leaves non-string values (numbers, booleans, null, arrays, nested
//     objects, undefined) untouched
//   - returns non-object/`null` bodies unchanged so callers can pipe
//     unparsed payloads through without first guarding the type
//
// Many display sites use `x ?? fallback`, which treats `""` as a present
// value and hides the fallback (the original symptom on
// `job.region ?? job.location`). Several Zod-derived insert schemas
// also reject `""` for nullable enum-like text columns (gender,
// nationality, maritalStatus, region) where the form sends "" for an
// unselected dropdown. Applied to every form-driven create/edit
// handler that touches optional text columns on job_postings,
// smp_companies, events, workforce, applications, and candidates.
export function normalizeBlankFields<T>(body: T, fields: readonly string[]): T {
  if (body === null || typeof body !== "object") return body;
  const target = body as Record<string, unknown>;
  for (const key of fields) {
    if (key in target) {
      const v = target[key];
      if (typeof v === "string" && v.trim() === "") {
        target[key] = null;
      }
    }
  }
  return body;
}

// Per-model lists of optional text/varchar columns whose form values
// may legitimately be left empty. Kept narrow on purpose: only fields
// that are nullable in shared/schema.ts AND are surfaced through a
// form input or dropdown on the admin/candidate UIs. Required columns
// (e.g. event.name, job.title) are intentionally absent — clearing
// them to null is a validation error, not a normalization.
export const EVENT_BLANK_FIELDS = ["region", "description", "endDate"] as const;
export const JOB_BLANK_FIELDS = [
  "region",
  "location",
  "department",
  "deadline",
  "description",
  "requirements",
] as const;
export const SMP_COMPANY_BLANK_FIELDS = [
  "region",
  "crNumber",
  "contactPerson",
  "contactPhone",
  "contactEmail",
  "bankName",
  "bankIban",
  "notes",
] as const;
export const WORKFORCE_BLANK_FIELDS = [
  "endDate",
  "terminationReason",
  "terminationCategory",
  "notes",
  "offboardingStatus",
  "settlementPaidBy",
  "settlementReference",
  "paymentMethodReason",
] as const;
export const APPLICATION_BLANK_FIELDS = ["notes"] as const;
export const CANDIDATE_BLANK_FIELDS = [
  "candidateCode",
  "gender",
  "dateOfBirth",
  "nationality",
  "email",
  "phone",
  "whatsapp",
  "city",
  "region",
  "nationalId",
  "iqamaNumber",
  "passportNumber",
  "currentRole",
  "currentEmployer",
  "educationLevel",
  "university",
  "major",
  "nationalityText",
  "maritalStatus",
  "chronicDiseases",
  "emergencyContactName",
  "emergencyContactPhone",
  "notes",
] as const;

// Task #185 — the workforce candidate-profile patch route accepts the
// CANDIDATE columns plus the IBAN overlay introduced in task #133.
// Keeping the merged list as a single named constant in this module
// (rather than an inline `[...CANDIDATE_BLANK_FIELDS, "ibanNumber", …]`
// at the call site) means the wiring test can match the route by name
// instead of by multi-line-array regex, and a future audit of "which
// fields can the API normalise on workforce candidate-profile?" is a
// one-file read.
export const WORKFORCE_PROFILE_BLANK_FIELDS = [
  ...CANDIDATE_BLANK_FIELDS,
  "ibanNumber",
  "ibanBankName",
  "ibanBankCode",
  "ibanAccountFirstName",
  "ibanAccountLastName",
] as const;

// Task #185 — the settlement payment-tracking route only normalises
// the `reference` field on the payload. Promoted from an inline
// `["reference"]` literal so the per-model surface lives entirely in
// this module.
export const PAYROLL_SETTLEMENT_BLANK_FIELDS = ["reference"] as const;

// Task #185 — the workforce payment-method route normalises the cash
// `reason` field on the payload (the cash-reason guard depends on
// "  " being coerced to null before validation, otherwise a form
// submitting whitespace would silently bypass the guard). Promoted
// from an inline `["reason"]` literal for the same reason as above.
// Named for the route surface (payment-method), not the field, since
// other future routes may also normalise a `reason` column.
export const WORKFORCE_PAYMENT_METHOD_BLANK_FIELDS = ["reason"] as const;
