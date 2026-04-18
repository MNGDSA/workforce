/**
 * Server-side message i18n.
 *
 * The locale for an incoming request is resolved in this priority order:
 *   1. Accept-Language header (set by the SPA client; "ar" or "en")
 *   2. The authenticated user's stored `locale` column
 *   3. Project default — Arabic
 *
 * Only API error / status messages are localized here. Domain-specific
 * fields, IDs, and audit data remain language-neutral.
 *
 * Add new keys to BOTH `MESSAGES.en` and `MESSAGES.ar` in lock-step.
 * Never inline ad-hoc strings — all user-visible API messages must flow
 * through `tr(req, "key.name")`.
 */
import type { Request } from "express";

export type ServerLocale = "ar" | "en";
const DEFAULT_LOCALE: ServerLocale = "ar";

type MessageDict = Record<string, string>;

const MESSAGES: Record<ServerLocale, MessageDict> = {
  en: {
    // Auth middleware
    "auth.required":              "Authentication required.",
    "auth.inactive":              "Account inactive or not found.",
    "auth.noRole":                "Account has no role assigned.",
    "auth.noPermission":          "You do not have permission to perform this action.",
    "auth.ownershipOnly":         "You can only access your own resources.",
    "auth.sessionExpired":        "Session expired. Please sign in again.",
    "auth.accountDisabled":       "Account is disabled. Contact support.",

    // Validation / generic
    "common.validation":          "Validation error",
    "common.invalidInput":        "Invalid input",
    "common.serverError":         "An unexpected error occurred. Please try again.",
    "common.notFound":            "Resource not found.",

    // Files / uploads
    "file.notFound":              "File not found",
    "file.invalidPath":           "Invalid file path",
    "file.noPermission":          "You do not have permission to view this file.",
    "file.noUpload":              "No file uploaded",
    "file.invalidDocType":        "Invalid docType. Must be photo, nationalId, iban, or resume",
    "file.invalidDocTypeShort":   "Invalid docType. Must be photo, nationalId, or iban",
    "file.photoFormat":           "Photo must be a JPG or PNG image",

    // Candidates
    "candidate.notFound":         "Candidate not found",
    "candidate.profile.invalidLocale": "Invalid locale. Must be 'ar' or 'en'.",
    "candidate.profile.localeFailed":  "Failed to update locale",
    "candidate.profile.userNotFound":  "No user found",

    // Auth flow / login
    "auth.loginCreds":            "ID Number / Phone and password are required",
    "auth.invalidCreds":          "Invalid credentials",
    "auth.configFetchFailed":     "Failed to fetch config",

    // OTP
    "otp.tooMany":                "Too many OTP requests. Please wait 10 minutes before trying again.",
    "otp.smsNotConfigured":       "SMS service is not configured. Contact support.",
    "otp.sendFailed":             "Failed to send OTP. Please try again.",
    "otp.notFound":               "No OTP found for this phone number. Request a new code.",
    "otp.alreadyVerified":        "This OTP has already been verified.",
    "otp.expired":                "OTP has expired. Please request a new code.",
    "otp.invalid":                "Invalid OTP code.",
  },
  ar: {
    // Auth middleware
    "auth.required":              "يلزم تسجيل الدخول.",
    "auth.inactive":              "الحساب غير نشط أو غير موجود.",
    "auth.noRole":                "لم يتم تعيين دور لهذا الحساب.",
    "auth.noPermission":          "ليس لديك صلاحية لتنفيذ هذا الإجراء.",
    "auth.ownershipOnly":         "يمكنك الوصول إلى مواردك فقط.",
    "auth.sessionExpired":        "انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.",
    "auth.accountDisabled":       "تم تعطيل الحساب. يرجى التواصل مع الدعم.",

    // Validation / generic
    "common.validation":          "خطأ في التحقق من البيانات",
    "common.invalidInput":        "مدخلات غير صحيحة",
    "common.serverError":         "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
    "common.notFound":            "المورد غير موجود.",

    // Files / uploads
    "file.notFound":              "الملف غير موجود",
    "file.invalidPath":           "مسار الملف غير صحيح",
    "file.noPermission":          "ليس لديك صلاحية لعرض هذا الملف.",
    "file.noUpload":              "لم يتم رفع أي ملف",
    "file.invalidDocType":        "نوع المستند غير صحيح. يجب أن يكون photo أو nationalId أو iban أو resume",
    "file.invalidDocTypeShort":   "نوع المستند غير صحيح. يجب أن يكون photo أو nationalId أو iban",
    "file.photoFormat":           "يجب أن تكون الصورة بصيغة JPG أو PNG",

    // Candidates
    "candidate.notFound":         "المرشح غير موجود",
    "candidate.profile.invalidLocale": "اللغة غير صحيحة. يجب أن تكون 'ar' أو 'en'.",
    "candidate.profile.localeFailed":  "فشل تحديث اللغة",
    "candidate.profile.userNotFound":  "لم يتم العثور على المستخدم",

    // Auth flow / login
    "auth.loginCreds":            "رقم الهوية / الجوال وكلمة المرور مطلوبان",
    "auth.invalidCreds":          "بيانات الدخول غير صحيحة",
    "auth.configFetchFailed":     "فشل جلب الإعدادات",

    // OTP
    "otp.tooMany":                "عدد كبير جداً من طلبات رمز التحقق. يرجى الانتظار 10 دقائق قبل المحاولة مرة أخرى.",
    "otp.smsNotConfigured":       "خدمة الرسائل القصيرة غير مهيأة. يرجى التواصل مع الدعم.",
    "otp.sendFailed":             "فشل إرسال رمز التحقق. يرجى المحاولة مرة أخرى.",
    "otp.notFound":               "لا يوجد رمز تحقق لهذا الرقم. اطلب رمزاً جديداً.",
    "otp.alreadyVerified":        "تم التحقق من هذا الرمز بالفعل.",
    "otp.expired":                "انتهت صلاحية الرمز. يرجى طلب رمز جديد.",
    "otp.invalid":                "رمز التحقق غير صحيح.",
  },
};

/** Parse the Accept-Language header value into our supported set. */
function parseAcceptLanguage(header: string | undefined): ServerLocale | null {
  if (!header) return null;
  // Pick the first tag (we accept comma-separated weighted lists too)
  const first = header.split(",")[0]?.trim().toLowerCase() ?? "";
  if (first.startsWith("ar")) return "ar";
  if (first.startsWith("en")) return "en";
  return null;
}

/** Resolve the locale for a request. */
export function getLocale(req: Request): ServerLocale {
  const fromHeader = parseAcceptLanguage(
    (req.headers["accept-language"] as string | undefined) ??
    (req.headers["x-locale"] as string | undefined),
  );
  if (fromHeader) return fromHeader;
  const userLocale = (req as any).authUser?.locale as string | undefined;
  if (userLocale === "ar" || userLocale === "en") return userLocale;
  return DEFAULT_LOCALE;
}

/**
 * Translate a key for the active request locale. Falls back to English if the
 * key is missing in the requested locale, and finally to the key itself
 * (so missing keys are visible in logs without crashing the response).
 */
export function tr(req: Request, key: string): string {
  const locale = getLocale(req);
  return MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
}
