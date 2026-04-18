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
    "otp.tooManyAttempts":        "Too many incorrect attempts. Please request a new OTP.",
    "otp.invalidSession":         "Invalid OTP session. Please verify your phone again.",
    "otp.phoneNotVerified":       "Phone number has not been verified. Please complete OTP verification.",
    "otp.alreadyUsed":            "This OTP has already been used. Please request a new code.",
    "otp.sessionExpired":         "OTP session expired. Please verify your phone again.",

    // Registration
    "register.allFieldsOtp":      "All fields including OTP verification are required",
    "register.nationalIdExists":  "An account with this National ID already exists",
    "common.allFieldsRequired":   "All fields are required",

    // Generic resource lookups
    "common.accessDenied":              "Access denied",
    "auth.requiredShort":               "Authentication required",
    "common.reviewerRequired":          "Reviewer identity required",
    "common.alreadyReviewed":           "Request already reviewed",
    "common.nationalIdRequired":        "National ID is required",
    "common.invalidEmail":              "Invalid email format",

    // Domain entities — not found
    "template.notFound":                "Template not found",
    "plugin.notFound":                  "Plugin not found",
    "event.notFound":                   "Event not found",
    "employee.notFound":                "Employee not found",
    "role.notFound":                    "Role not found",
    "assignment.notFound":              "Assignment not found",
    "job.notFound":                     "Job not found",
    "onboarding.notFound":              "Onboarding record not found",
    "adminUser.notFound":               "Admin user not found.",
    "asset.notFound":                   "Asset not found",
    "company.notFound":                 "Company not found",
    "questionSet.notFound":             "Question set not found",
    "shift.notFound":                   "Shift not found",
    "scheduleTemplate.notFound":        "Schedule template not found",
    "zone.notFound":                    "Zone not found",
    "interview.notFound":               "Interview not found",
    "contract.notFound":                "Contract not found",
    "scheduleAssignment.notFound":      "Schedule assignment not found",
    "attendance.notFound":              "Attendance record not found",
    "employeeRecord.notFound":          "Employee record not found",
    "inbox.notFoundOrResolved":         "Inbox item not found or already resolved",
    "excuse.notFound":                  "Excuse request not found",
    "workforce.notFound":               "Workforce record not found",
    "photoChange.notFound":             "Photo change request not found",
    "user.notFound":                    "User account not found",

    // Positions / org
    "position.parentNotFound":          "Parent position not found",
    "position.parentDeptMismatch":      "Parent position must be in the same department",

    // Auth / RBAC
    "auth.superAdminRequired":          "Super Admin access required.",
    "auth.superAdminReadOnly":          "The Super Admin record is read-only.",
    "auth.adminRequired":               "Admin access required",
    "auth.noAccount":                   "No account found.",
    "auth.noAccountForId":              "No account found with this ID number.",
    "auth.noPhoneOnFile":               "No phone number on file. Contact an administrator.",

    // Roles
    "role.invalidId":                   "Invalid roleId",
    "role.cannotAssignSuperAdmin":      "Cannot assign Super Admin via this endpoint.",
    "role.slugExists":                  "A role with this slug already exists",

    // Contracts / workforce ownership
    "contract.ownOnly":                 "You can only view your own contracts.",
    "workforce.ownershipMismatch":      "Workforce record does not belong to authenticated user.",
    "profile.ownOnly":                  "You can only update your own profile.",

    // Password
    "password.currentIncorrect":        "Current password is incorrect",
    "password.updated":                 "Password updated successfully",
    "passwordReset.allFieldsRequired":  "National ID, OTP verification, and new password are required",
    "passwordReset.success":            "Password has been reset successfully. You can now log in.",

    // OTP — short variants used by reset flow
    "otp.invalidSessionShort":          "Invalid OTP session. Please verify again.",
    "otp.phoneNotVerifiedShort":        "Phone number has not been verified.",
    "otp.sessionExpiredShort":          "OTP session expired. Please verify again.",

    // Candidate archive
    "candidate.notFoundOrArchived":     "Candidate not found or already archived",
    "candidate.archived":               "Candidate archived",
    "candidate.notFoundOrActive":       "Candidate not found or not archived",
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
    "otp.tooManyAttempts":        "محاولات خاطئة كثيرة جداً. يرجى طلب رمز تحقق جديد.",
    "otp.invalidSession":         "جلسة رمز التحقق غير صحيحة. يرجى التحقق من رقم جوالك مرة أخرى.",
    "otp.phoneNotVerified":       "لم يتم التحقق من رقم الجوال. يرجى إكمال عملية التحقق.",
    "otp.alreadyUsed":            "تم استخدام هذا الرمز بالفعل. يرجى طلب رمز جديد.",
    "otp.sessionExpired":         "انتهت صلاحية جلسة رمز التحقق. يرجى التحقق من رقم جوالك مرة أخرى.",

    // Registration
    "register.allFieldsOtp":      "جميع الحقول مطلوبة بما في ذلك التحقق برمز OTP",
    "register.nationalIdExists":  "يوجد حساب مسجل برقم الهوية هذا بالفعل",
    "common.allFieldsRequired":   "جميع الحقول مطلوبة",

    // Generic resource lookups
    "common.accessDenied":              "تم رفض الوصول",
    "auth.requiredShort":               "يلزم تسجيل الدخول",
    "common.reviewerRequired":          "هوية المراجع مطلوبة",
    "common.alreadyReviewed":           "تمت مراجعة الطلب مسبقاً",
    "common.nationalIdRequired":        "رقم الهوية مطلوب",
    "common.invalidEmail":              "صيغة البريد الإلكتروني غير صحيحة",

    // Domain entities — not found
    "template.notFound":                "القالب غير موجود",
    "plugin.notFound":                  "الإضافة غير موجودة",
    "event.notFound":                   "الحدث غير موجود",
    "employee.notFound":                "الموظف غير موجود",
    "role.notFound":                    "الدور غير موجود",
    "assignment.notFound":              "التكليف غير موجود",
    "job.notFound":                     "الوظيفة غير موجودة",
    "onboarding.notFound":              "سجل التأهيل غير موجود",
    "adminUser.notFound":               "المستخدم الإداري غير موجود.",
    "asset.notFound":                   "العهدة غير موجودة",
    "company.notFound":                 "الشركة غير موجودة",
    "questionSet.notFound":             "مجموعة الأسئلة غير موجودة",
    "shift.notFound":                   "الوردية غير موجودة",
    "scheduleTemplate.notFound":        "قالب الجدول غير موجود",
    "zone.notFound":                    "النطاق غير موجود",
    "interview.notFound":               "المقابلة غير موجودة",
    "contract.notFound":                "العقد غير موجود",
    "scheduleAssignment.notFound":      "تكليف الجدول غير موجود",
    "attendance.notFound":              "سجل الحضور غير موجود",
    "employeeRecord.notFound":          "سجل الموظف غير موجود",
    "inbox.notFoundOrResolved":         "العنصر غير موجود في الوارد أو تمت معالجته بالفعل",
    "excuse.notFound":                  "طلب العذر غير موجود",
    "workforce.notFound":               "سجل القوى العاملة غير موجود",
    "photoChange.notFound":             "طلب تغيير الصورة غير موجود",
    "user.notFound":                    "حساب المستخدم غير موجود",

    // Positions / org
    "position.parentNotFound":          "الوظيفة الأم غير موجودة",
    "position.parentDeptMismatch":      "يجب أن تكون الوظيفة الأم في نفس الإدارة",

    // Auth / RBAC
    "auth.superAdminRequired":          "يتطلب صلاحية مشرف عام.",
    "auth.superAdminReadOnly":          "سجل المشرف العام للقراءة فقط.",
    "auth.adminRequired":               "تتطلب صلاحية إدارية",
    "auth.noAccount":                   "لم يتم العثور على حساب.",
    "auth.noAccountForId":              "لم يتم العثور على حساب بهذا الرقم.",
    "auth.noPhoneOnFile":               "لا يوجد رقم جوال مسجل. يرجى التواصل مع المسؤول.",

    // Roles
    "role.invalidId":                   "معرّف الدور غير صحيح",
    "role.cannotAssignSuperAdmin":      "لا يمكن تعيين مشرف عام عبر هذه الواجهة.",
    "role.slugExists":                  "يوجد دور بنفس المعرّف بالفعل",

    // Contracts / workforce ownership
    "contract.ownOnly":                 "يمكنك عرض عقودك الشخصية فقط.",
    "workforce.ownershipMismatch":      "سجل القوى العاملة لا يخص المستخدم المسجل.",
    "profile.ownOnly":                  "يمكنك تحديث ملفك الشخصي فقط.",

    // Password
    "password.currentIncorrect":        "كلمة المرور الحالية غير صحيحة",
    "password.updated":                 "تم تحديث كلمة المرور بنجاح",
    "passwordReset.allFieldsRequired":  "رقم الهوية والتحقق برمز OTP وكلمة المرور الجديدة مطلوبة",
    "passwordReset.success":            "تمت إعادة تعيين كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.",

    // OTP — short variants used by reset flow
    "otp.invalidSessionShort":          "جلسة رمز التحقق غير صحيحة. يرجى التحقق مرة أخرى.",
    "otp.phoneNotVerifiedShort":        "لم يتم التحقق من رقم الجوال.",
    "otp.sessionExpiredShort":          "انتهت صلاحية جلسة رمز التحقق. يرجى التحقق مرة أخرى.",

    // Candidate archive
    "candidate.notFoundOrArchived":     "المرشح غير موجود أو مؤرشف بالفعل",
    "candidate.archived":               "تمت أرشفة المرشح",
    "candidate.notFoundOrActive":       "المرشح غير موجود أو ليس مؤرشفاً",
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
