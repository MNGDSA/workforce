import { SA_MOBILE_REGEX, normalizeSaPhone } from "@shared/phone";

export { SA_MOBILE_REGEX };

export function sanitizeSaMobileInput(raw: string): string {
  if (raw == null) return "";
  const n = normalizeSaPhone(raw);
  if (n) return n;
  return String(raw).replace(/\D/g, "").slice(0, 10);
}

export function normalizeSaMobileOnBlur(raw: string): string {
  if (!raw) return raw ?? "";
  const n = normalizeSaPhone(raw);
  return n ?? raw;
}

export function isValidSaMobile(raw: string | null | undefined): boolean {
  return !!raw && SA_MOBILE_REGEX.test(raw);
}
