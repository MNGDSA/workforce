/**
 * Locale-aware formatting helpers for WORKFORCE.
 *
 * RULE (absolute): all numeric and date output uses **Western Arabic
 * numerals** (0–9) regardless of UI locale. The Eastern Arabic digits
 * (٠١٢٣٤٥٦٧٨٩) and the Arabic separators (٫ ٬) MUST NEVER appear in    // i18n-numerals: allow
 * any rendered output — UI, PDFs, ID cards, SMS, exports, audit log.
 *
 * Every Intl call in this module forces `numberingSystem: 'latn'`. To
 * prevent regression, ALL numeric/date formatting in the app must go
 * through this module — never call `toLocaleString()` directly. A dev-
 * mode dependency-injected wrapper enforces this in tests.
 *
 * The base locale used internally is "en-US" so digits are guaranteed
 * Western. The `displayLocale` arg only affects month names, currency
 * codes, and other word-level localization — never the digit glyphs.
 */

const NUMBERING_SYSTEM = "latn" as const;

// Use en-US as the base because it guarantees Latin separators (',' and '.')
// in both languages — per spec, we never want '٬' '٫' separators.
const BASE_FORMATTER_LOCALE = "en-US";

export function formatNumber(
  value: number | string,
  optsOrLocale?: Intl.NumberFormatOptions | string,
): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "";
  // Per the module rule above, the locale never changes the digit glyphs
  // (we always force Latin via numberingSystem). When callers pass a locale
  // string instead of NumberFormatOptions we accept and ignore it so the
  // call sites stay clean.
  const opts =
    optsOrLocale && typeof optsOrLocale === "object" ? optsOrLocale : undefined;
  return new Intl.NumberFormat(BASE_FORMATTER_LOCALE, {
    numberingSystem: NUMBERING_SYSTEM,
    ...opts,
  }).format(num);
}

export function formatCurrency(
  value: number | string,
  currency: string = "SAR",
  locale: string = "en",
): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "";
  // For Arabic locale, use a manual format: "1,250.00 ر.س" so digits
  // and separators stay Latin while the symbol localizes.
  const formattedNum = new Intl.NumberFormat(BASE_FORMATTER_LOCALE, {
    numberingSystem: NUMBERING_SYSTEM,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
  if (locale.startsWith("ar")) {
    const symbol = currency === "SAR" ? "ر.س" : currency;
    return `${formattedNum} ${symbol}`;
  }
  return `${currency} ${formattedNum}`;
}

export function formatPercent(
  value: number,
  fractionDigits: number = 0,
): string {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat(BASE_FORMATTER_LOCALE, {
    numberingSystem: NUMBERING_SYSTEM,
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatDate(
  value: Date | string | number | null | undefined,
  locale: string = "en",
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  // Use the requested display locale for month name localization, but
  // ALWAYS force Latin digits via numberingSystem and Gregorian calendar.
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", {
    numberingSystem: NUMBERING_SYSTEM,
    calendar: "gregory",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(d);
}

export function formatDateTime(
  value: Date | string | number | null | undefined,
  locale: string = "en",
): string {
  return formatDate(value, locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatTime(
  value: Date | string | number | null | undefined,
  locale: string = "en",
): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", {
    numberingSystem: NUMBERING_SYSTEM,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * Bidi-isolation wrapper for inline content (IBAN, phone, email, ID)
 * that must render LTR even inside an Arabic paragraph. The `<bdi>`
 * tag isolates the content's directionality from its surroundings.
 *
 * Usage:
 *   <Bdi>{candidate.email}</Bdi>
 *   <Bdi>{candidate.ibanNumber}</Bdi>
 */
export const BIDI_ISOLATE_STYLE = "unicode-bidi: isolate" as const;
