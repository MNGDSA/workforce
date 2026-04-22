import { z } from "zod";

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXT_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

function toWesternDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EXT_ARABIC_INDIC.indexOf(d)));
}

function stripFormatting(s: string): string {
  return s.replace(/[\s\-().]/g, "");
}

export function normalizeSaPhone(input: unknown): string | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  s = toWesternDigits(stripFormatting(s));

  if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d+$/.test(s)) return null;

  if (s.startsWith("00966")) s = s.slice(5);
  else if (s.startsWith("966")) s = s.slice(3);

  if (s.length === 10 && s.startsWith("05")) {
    return s;
  }
  if (s.length === 9 && s.startsWith("5")) {
    return "0" + s;
  }
  return null;
}

export function cleanContactPhone(input: unknown): string | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;
  // Convert Arabic-Indic digits, then aggressively strip every non-digit
  // character except a single leading "+". This tolerates user input like
  // "058-123 4567 (mom)", "+966 58 123 4567", or copy-pasted contacts that
  // include name labels, dots, slashes, or stray punctuation.
  s = toWesternDigits(s);
  const hadPlus = s.trimStart().startsWith("+");
  s = s.replace(/[^\d]/g, "");
  if (hadPlus) s = "+" + s;
  if (!/^\+?\d{7,16}$/.test(s)) return null;
  return s;
}

export const saPhoneSchema = z
  .string({ required_error: "invalid_sa_mobile", invalid_type_error: "invalid_sa_mobile" })
  .transform((v, ctx) => {
    const n = normalizeSaPhone(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid_sa_mobile" });
      return z.NEVER;
    }
    return n;
  });

export const optionalSaPhoneSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v, ctx) => {
    if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
    const n = normalizeSaPhone(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid_sa_mobile" });
      return z.NEVER;
    }
    return n;
  });

// PATCH semantics: omitted key stays undefined (no DB write); null/empty clears
// the field; valid input is normalized.
export const patchSaPhoneSchema = optionalSaPhoneSchema.optional();

export const optionalContactPhoneSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v, ctx) => {
    if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
    const n = cleanContactPhone(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid_contact_phone" });
      return z.NEVER;
    }
    return n;
  });

export const SA_MOBILE_REGEX = /^05\d{8}$/;

/**
 * Convert a Saudi mobile to E.164 form (`966XXXXXXXXX`, no leading "+", no
 * leading "0"). Required by international SMS gateways (e.g. GoInfinito) which
 * accept local-format syntactically but the SMSC silently drops them.
 *
 * Idempotent — already-international numbers pass through unchanged.
 * Returns the input unchanged if it can't be normalized so callers stay safe.
 */
export function toE164SaPhone(input: string): string {
  if (!input) return input;
  let s = toWesternDigits(stripFormatting(String(input).trim()));
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("00966")) return s.slice(2); // 00966… → 966…
  if (s.startsWith("966") && s.length === 12) return s;
  if (s.startsWith("05") && s.length === 10) return "966" + s.slice(1);
  if (s.startsWith("5") && s.length === 9) return "966" + s;
  return input;
}
