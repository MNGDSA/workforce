// Saudi bank lookup helpers — re-exported from the shared registry so the
// client form auto-fill and the server-side write-time persistence
// (task #121) cannot drift on the SARIE bank-identifier table.
export {
  SAUDI_BANKS,
  resolveSaudiBank,
  validateSaudiIban,
  validateIbanChecksum,
  type IbanValidationOk,
  type IbanValidationFail,
  type IbanValidationResult,
} from "@shared/saudi-banks";
