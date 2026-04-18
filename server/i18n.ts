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
    "candidate.restored":               "Candidate restored",
    "candidate.bulkActionLimit":        "Maximum 500 candidates per bulk action",
    "candidate.bulkActionInvalid":      "Invalid action. Must be: block, unblock, or archive",
    "candidate.bulkUploadLimit":        "Maximum 1,000 candidates per bulk upload",
    "candidate.noLinkedRecord":         "No linked candidate record",

    // Generic field validation
    "common.idsRequired":               "ids array is required",
    "common.candidatesRequired":        "candidates array is required",
    "common.startDateRequired":         "startDate is required",
    "common.endDateRequired":           "endDate is required",
    "common.dateRangeRequired":         "dateFrom and dateTo are required",
    "common.workforceIdRequired":       "Workforce ID is required",
    "common.resultsRequired":           "results array is required",
    "common.noFieldsToUpdate":          "No valid fields to update",
    "common.nationalIdAndStartRequired":"nationalId and startDate are required",
    "common.templateIdRequired":        "templateId is required",
    "common.logsRequired":              "logs array is required",
    "common.employeeIdsRequired":       "employeeIds array is required",
    "common.statusesRequired":          "statuses array is required",
    "common.recordsRequired":           "records array is required",
    "common.forbidden":                 "Forbidden",
    "common.endpointDeprecated":        "This endpoint has been replaced. Please update your app to the latest version.",

    // SMP / bulk import
    "smp.companyIdRequired":            "smpCompanyId is required for SMP workers",
    "smp.bulkNotAllowed":               "SMP workers cannot be added via the bulk endpoint. Use the SMP validation and commit flow instead.",
    "import.excelEmpty":                "Excel file is empty",
    "import.rowLimit":                  "Maximum 5,000 rows per upload",

    // Photo / verification
    "photo.verifyUnavailable":          "Photo verification is temporarily unavailable. Please try again in a few minutes.",
    "photo.qualityFailed":              "Photo quality check failed",
    "photo.submittedForReview":         "Photo submitted for HR review. Your current photo remains active.",

    // Application / job
    "job.notFoundOrArchived":           "Job not found or already archived",
    "application.ownOnly":              "You can only apply on your own behalf.",
    "application.notFound":             "Application not found",
    "onboarding.alreadyExists":         "Candidate is already in onboarding",

    // Notifications / rules
    "rule.notFound":                    "Rule not found",
    "notification.notFound":            "Notification not found",
    "alert.notFound":                   "Alert not found",

    // Org structure
    "businessUnit.notFound":            "Business unit not found",
    "department.notFound":              "Department not found",
    "position.selfParent":              "A position cannot be its own parent",
    "position.circularHierarchy":       "Circular parent hierarchy detected",
    "position.notFound":                "Position not found",

    // Users / Super-admin
    "auth.cannotCreateSuperAdmin":      "Cannot create another Super Admin.",
    "auth.cannotPromoteSuperAdmin":     "Cannot promote a user to Super Admin.",
    "auth.requiredRelogin":             "Authentication required. Please log in again.",
    "user.notFoundShort":               "User not found",
    "user.useCandidateFlow":            "Use the candidate registration flow for candidate users.",
    "user.nationalIdExists":            "A user with this National ID already exists.",
    "user.emailExists":                 "A user with this email already exists.",
    "user.usernameExists":              "A user with this username already exists.",
    "user.phoneExists":                 "A user with this phone already exists.",
    "user.nationalIdTaken":             "Another user already has this National ID.",
    "user.emailTaken":                  "Another user already has this email.",
    "user.usernameTaken":               "Another user already has this username.",
    "user.phoneTaken":                  "Another user already has this phone.",
    "user.cannotDeleteSelf":            "You cannot delete your own account.",
    "user.cannotDeleteSuperAdmin":      "Super Admin accounts cannot be deleted.",
    "user.hasReferences":               "This user is referenced by other records (audit logs, candidates, etc.). Deactivate them instead.",

    // Roles — system locks
    "role.systemReadOnly":              "System roles cannot be modified",
    "role.systemNoDelete":              "System roles cannot be deleted",
    "role.systemPermsReadOnly":         "System role permissions cannot be modified",

    // Documents / templates / contracts
    "document.fileFieldsRequired":      "fileUrl and fileName are required",
    "document.notFound":                "Document not found",
    "template.hasContracts":            "Cannot delete template that has generated contracts. Archive it instead.",
    "template.deleted":                 "Template deleted",
    "template.noneActive":              "No active template found",
    "contract.bulkFieldsRequired":      "templateId and onboardingIds[] are required",
    "contract.alreadySigned":           "Contract already signed",
    "contract.signOwnOnly":             "You can only sign your own contract.",

    // Plugins / scheduling
    "plugin.configRequired":            "pluginConfig is required",
    "plugin.noActivePrinter":           "No active printer plugin",
    "schedule.bulkFieldsRequired":      "workforceIds, templateId, startDate are required",
    "scheduleAssignment.overlap":       "Assignment date range overlaps with an existing assignment for this employee",

    // Assets
    "asset.statusInvalid":              "status must be 'returned' or 'not_returned'",

    // Data erasure
    "erasure.notAuthorized":            "You are not authorized to submit a request for this employee record.",
    "erasure.alreadyPending":           "A data erasure request is already pending review for this employee.",
    "erasure.submitted":                "Your data erasure request has been submitted and will be reviewed by HR. You will be notified once it has been processed.",

    // Final batch
    "excuse.alreadyExists":             "An excuse request already exists for this date",
    "assetAssignment.notFound":         "Asset assignment not found",
    "asset.priceImmutable":             "Asset price cannot be changed after creation",
    "broadcast.recipientRequired":      "At least one recipient is required",
    "broadcast.notFound":               "Broadcast not found",
    "broadcast.templateRequired":       "Message template is required",
    "broadcast.noValidPhones":          "None of the selected employees have a valid phone number.",
    "inbox.notFound":                   "Inbox item not found",
    "sms.notConfigured":                "No active SMS plugin configured. Go to Notifications > SMS Gateway to set one up.",
    "common.notAuthorized":             "Not authorized",
    "photo.required":                   "Photo is required",
    "submission.notFound":              "Submission not found",
    "user.deactivated":                 "User account is deactivated.",
    "workforce.inactive":               "Workforce record is inactive. Submission rejected.",
    "workforce.terminated":             "Workforce record terminated. Submission after termination date rejected.",
    "attendance.alreadyComplete":       "You have already completed check-in and check-out for today.",
    "assetAssignment.fieldsRequired":   "assetId, workforceIds (non-empty array), and assignedAt are required",
    "common.candidateIdRequired":       "candidateId is required",
    "common.eventIdRequired":           "eventId is required",
    "common.idsNonEmpty":               "ids must be a non-empty array",
    "common.workforceIdAndStatusRequired": "workforceId and valid status are required",

    // Dynamic / interpolated messages
    "auth.loginRateLimit":              "Too many failed login attempts. Try again in {{minutes}} minute(s).",
    "otp.incorrectRemaining":           "Incorrect code. {{remaining}} attempt(s) remaining.",
    "password.rules":                   "Password must contain: {{rules}}",
    "candidate.nationalIdExists":       "A candidate with National ID {{id}} already exists",
    "candidate.phoneExists":            "A candidate with phone {{phone}} already exists",
    "candidate.profileMissingFields":   "Cannot mark profile as complete. Missing required fields: {{fields}}",
    "import.validationFailed":          "Validation failed on {{count}} rows",
    "smp.unconfirmedClean":             "{{count}} CLEAN row(s) were not confirmed by the user. Confirm all CLEAN rows before committing.",
    "smp.batchCommitted":               "SMP batch committed: {{created}} new, {{attached}} existing attached, {{skipped}} blocked/skipped.",
    "termination.invalidCategory":      "Invalid terminationCategory. Must be one of: {{categories}}",
    "role.assignedToUsers":             "Role is assigned to {{count}} user(s). Reassign them before deleting.",
    "company.hasWorkforce":             "Cannot delete: {{count}} workforce record(s) are linked to this company. Deactivate the company instead.",
    "inbox.bulkProtected":              "{{count}} item(s) require individual review and cannot be bulk actioned ({{types}}). Please review them one by one.",
    "excuse.cannotApprove":             "Cannot approve a {{status}} request",
    "excuse.cannotReject":              "Cannot reject a {{status}} request",
    "attendance.dailyLimit":            "Daily submission limit reached ({{limit}}). You have already completed attendance for today.",
    "attendance.beforeShiftStart":      "Your shift starts at {{start}}. You can check in from {{earliest}}.",
    "attendance.afterShiftEnd":         "Your shift ended at {{end}}. The attendance window has closed.",
    "attendance.minShiftDuration":      "Minimum shift duration is {{required}} minutes. Please wait {{remaining}} more minutes before checking out.",
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
    "candidate.restored":               "تم استعادة المرشح",
    "candidate.bulkActionLimit":        "الحد الأقصى 500 مرشح لكل عملية جماعية",
    "candidate.bulkActionInvalid":      "إجراء غير صحيح. يجب أن يكون: حظر أو إلغاء حظر أو أرشفة",
    "candidate.bulkUploadLimit":        "الحد الأقصى 1,000 مرشح لكل رفع جماعي",
    "candidate.noLinkedRecord":         "لا يوجد سجل مرشح مرتبط",

    // Generic field validation
    "common.idsRequired":               "حقل ids المصفوفة مطلوب",
    "common.candidatesRequired":        "حقل candidates المصفوفة مطلوب",
    "common.startDateRequired":         "تاريخ البداية مطلوب",
    "common.endDateRequired":           "تاريخ النهاية مطلوب",
    "common.dateRangeRequired":         "تاريخ البداية والنهاية مطلوبان",
    "common.workforceIdRequired":       "معرّف القوى العاملة مطلوب",
    "common.resultsRequired":           "حقل results المصفوفة مطلوب",
    "common.noFieldsToUpdate":          "لا توجد حقول صالحة للتحديث",
    "common.nationalIdAndStartRequired":"رقم الهوية وتاريخ البداية مطلوبان",
    "common.templateIdRequired":        "معرّف القالب مطلوب",
    "common.logsRequired":              "حقل logs المصفوفة مطلوب",
    "common.employeeIdsRequired":       "حقل employeeIds المصفوفة مطلوب",
    "common.statusesRequired":          "حقل statuses المصفوفة مطلوب",
    "common.recordsRequired":           "حقل records المصفوفة مطلوب",
    "common.forbidden":                 "ممنوع",
    "common.endpointDeprecated":        "تم استبدال هذه الواجهة. يرجى تحديث التطبيق إلى أحدث إصدار.",

    // SMP / bulk import
    "smp.companyIdRequired":            "معرّف شركة SMP مطلوب لعمال SMP",
    "smp.bulkNotAllowed":               "لا يمكن إضافة عمال SMP عبر هذه الواجهة. استخدم تدفق التحقق والتثبيت لـ SMP.",
    "import.excelEmpty":                "ملف Excel فارغ",
    "import.rowLimit":                  "الحد الأقصى 5,000 صف لكل عملية رفع",

    // Photo / verification
    "photo.verifyUnavailable":          "خدمة التحقق من الصور غير متوفرة مؤقتاً. يرجى المحاولة بعد دقائق.",
    "photo.qualityFailed":              "فشل التحقق من جودة الصورة",
    "photo.submittedForReview":         "تم إرسال الصورة لمراجعة الموارد البشرية. صورتك الحالية لا تزال نشطة.",

    // Application / job
    "job.notFoundOrArchived":           "الوظيفة غير موجودة أو مؤرشفة بالفعل",
    "application.ownOnly":              "يمكنك التقديم باسمك الشخصي فقط.",
    "application.notFound":             "الطلب غير موجود",
    "onboarding.alreadyExists":         "المرشح موجود في عملية التأهيل بالفعل",

    // Notifications / rules
    "rule.notFound":                    "القاعدة غير موجودة",
    "notification.notFound":            "الإشعار غير موجود",
    "alert.notFound":                   "التنبيه غير موجود",

    // Org structure
    "businessUnit.notFound":            "وحدة الأعمال غير موجودة",
    "department.notFound":              "الإدارة غير موجودة",
    "position.selfParent":              "لا يمكن للوظيفة أن تكون والداً لنفسها",
    "position.circularHierarchy":       "تم اكتشاف تسلسل دائري للوظائف",
    "position.notFound":                "الوظيفة غير موجودة",

    // Users / Super-admin
    "auth.cannotCreateSuperAdmin":      "لا يمكن إنشاء مشرف عام آخر.",
    "auth.cannotPromoteSuperAdmin":     "لا يمكن ترقية مستخدم إلى مشرف عام.",
    "auth.requiredRelogin":             "يلزم تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى.",
    "user.notFoundShort":               "المستخدم غير موجود",
    "user.useCandidateFlow":            "استخدم تدفق تسجيل المرشحين لمستخدمي المرشحين.",
    "user.nationalIdExists":            "يوجد مستخدم مسجل برقم الهوية هذا بالفعل.",
    "user.emailExists":                 "يوجد مستخدم مسجل بهذا البريد الإلكتروني بالفعل.",
    "user.usernameExists":              "يوجد مستخدم بهذا اسم المستخدم بالفعل.",
    "user.phoneExists":                 "يوجد مستخدم مسجل بهذا الرقم بالفعل.",
    "user.nationalIdTaken":             "مستخدم آخر يحمل رقم الهوية نفسه.",
    "user.emailTaken":                  "مستخدم آخر يحمل البريد الإلكتروني نفسه.",
    "user.usernameTaken":               "مستخدم آخر يحمل اسم المستخدم نفسه.",
    "user.phoneTaken":                  "مستخدم آخر يحمل رقم الجوال نفسه.",
    "user.cannotDeleteSelf":            "لا يمكنك حذف حسابك الخاص.",
    "user.cannotDeleteSuperAdmin":      "لا يمكن حذف حسابات المشرفين العامين.",
    "user.hasReferences":               "هذا المستخدم مرتبط بسجلات أخرى (سجلات التدقيق، المرشحين، إلخ). قم بتعطيله بدلاً من الحذف.",

    // Roles — system locks
    "role.systemReadOnly":              "لا يمكن تعديل أدوار النظام",
    "role.systemNoDelete":              "لا يمكن حذف أدوار النظام",
    "role.systemPermsReadOnly":         "لا يمكن تعديل صلاحيات أدوار النظام",

    // Documents / templates / contracts
    "document.fileFieldsRequired":      "fileUrl و fileName مطلوبان",
    "document.notFound":                "المستند غير موجود",
    "template.hasContracts":            "لا يمكن حذف القالب الذي يحتوي على عقود مولدة. قم بأرشفته بدلاً من الحذف.",
    "template.deleted":                 "تم حذف القالب",
    "template.noneActive":              "لا يوجد قالب نشط",
    "contract.bulkFieldsRequired":      "templateId و onboardingIds[] مطلوبان",
    "contract.alreadySigned":           "العقد موقع بالفعل",
    "contract.signOwnOnly":             "يمكنك توقيع عقدك الشخصي فقط.",

    // Plugins / scheduling
    "plugin.configRequired":            "إعدادات الإضافة مطلوبة",
    "plugin.noActivePrinter":           "لا توجد إضافة طباعة نشطة",
    "schedule.bulkFieldsRequired":      "workforceIds و templateId و startDate مطلوبة",
    "scheduleAssignment.overlap":       "نطاق تاريخ التكليف يتداخل مع تكليف موجود لهذا الموظف",

    // Assets
    "asset.statusInvalid":              "يجب أن تكون الحالة 'returned' أو 'not_returned'",

    // Data erasure
    "erasure.notAuthorized":            "غير مصرح لك بتقديم طلب لسجل هذا الموظف.",
    "erasure.alreadyPending":           "يوجد طلب محو بيانات قيد المراجعة لهذا الموظف بالفعل.",
    "erasure.submitted":                "تم تقديم طلب محو البيانات وسيتم مراجعته من قِبل الموارد البشرية. سيتم إشعارك عند معالجته.",

    // Final batch
    "excuse.alreadyExists":             "يوجد طلب عذر مسجل لهذا التاريخ بالفعل",
    "assetAssignment.notFound":         "تكليف العهدة غير موجود",
    "asset.priceImmutable":             "لا يمكن تغيير سعر العهدة بعد إنشائها",
    "broadcast.recipientRequired":      "يلزم وجود مستلم واحد على الأقل",
    "broadcast.notFound":               "الرسالة الجماعية غير موجودة",
    "broadcast.templateRequired":       "قالب الرسالة مطلوب",
    "broadcast.noValidPhones":          "لا يوجد لدى الموظفين المختارين أرقام جوال صالحة.",
    "inbox.notFound":                   "العنصر غير موجود في الوارد",
    "sms.notConfigured":                "لا توجد إضافة رسائل قصيرة نشطة. اذهب إلى الإشعارات > بوابة الرسائل لإعدادها.",
    "common.notAuthorized":             "غير مصرح",
    "photo.required":                   "الصورة مطلوبة",
    "submission.notFound":              "السجل غير موجود",
    "user.deactivated":                 "حساب المستخدم معطل.",
    "workforce.inactive":               "سجل القوى العاملة غير نشط. تم رفض التسجيل.",
    "workforce.terminated":             "تم إنهاء سجل القوى العاملة. تم رفض التسجيل بعد تاريخ الإنهاء.",
    "attendance.alreadyComplete":       "لقد أكملت الحضور والانصراف لهذا اليوم بالفعل.",
    "assetAssignment.fieldsRequired":   "assetId و workforceIds (مصفوفة غير فارغة) و assignedAt مطلوبة",
    "common.candidateIdRequired":       "معرّف المرشح مطلوب",
    "common.eventIdRequired":           "معرّف الحدث مطلوب",
    "common.idsNonEmpty":               "يجب أن تكون ids مصفوفة غير فارغة",
    "common.workforceIdAndStatusRequired": "معرّف القوى العاملة وحالة صحيحة مطلوبان",

    // Dynamic / interpolated messages
    "auth.loginRateLimit":              "محاولات تسجيل دخول فاشلة كثيرة. يرجى المحاولة بعد {{minutes}} دقيقة.",
    "otp.incorrectRemaining":           "رمز غير صحيح. متبقي {{remaining}} محاولة.",
    "password.rules":                   "يجب أن تحتوي كلمة المرور على: {{rules}}",
    "candidate.nationalIdExists":       "يوجد مرشح مسجل برقم الهوية {{id}} بالفعل",
    "candidate.phoneExists":            "يوجد مرشح مسجل بالرقم {{phone}} بالفعل",
    "candidate.profileMissingFields":   "لا يمكن إكمال الملف. الحقول المطلوبة الناقصة: {{fields}}",
    "import.validationFailed":          "فشل التحقق في {{count}} صف",
    "smp.unconfirmedClean":             "{{count}} صف من النوع CLEAN لم يتم تأكيدها. يرجى تأكيد جميع صفوف CLEAN قبل التثبيت.",
    "smp.batchCommitted":               "تم تثبيت دفعة SMP: {{created}} جديد، {{attached}} مرتبط بالموجود، {{skipped}} محظور/متجاهل.",
    "termination.invalidCategory":      "فئة الإنهاء غير صحيحة. يجب أن تكون إحدى: {{categories}}",
    "role.assignedToUsers":             "الدور مُعيَّن لـ {{count}} مستخدم. أعد توزيعهم قبل الحذف.",
    "company.hasWorkforce":             "لا يمكن الحذف: {{count}} سجل قوى عاملة مرتبط بهذه الشركة. قم بتعطيل الشركة بدلاً من الحذف.",
    "inbox.bulkProtected":              "{{count}} عنصر يتطلب مراجعة فردية ولا يمكن تنفيذ الإجراء الجماعي عليه ({{types}}). يرجى مراجعتها فرداً فرداً.",
    "excuse.cannotApprove":             "لا يمكن اعتماد طلب بحالة {{status}}",
    "excuse.cannotReject":              "لا يمكن رفض طلب بحالة {{status}}",
    "attendance.dailyLimit":            "تم الوصول للحد اليومي ({{limit}}). لقد أكملت الحضور لهذا اليوم بالفعل.",
    "attendance.beforeShiftStart":      "ورديتك تبدأ الساعة {{start}}. يمكنك تسجيل الحضور من الساعة {{earliest}}.",
    "attendance.afterShiftEnd":         "انتهت ورديتك الساعة {{end}}. تم إغلاق نافذة تسجيل الحضور.",
    "attendance.minShiftDuration":      "الحد الأدنى لمدة الوردية {{required}} دقيقة. يرجى الانتظار {{remaining}} دقيقة قبل الانصراف.",
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
 *
 * Supports {{name}} placeholders interpolated from the optional params dict.
 * Numeric values are formatted with `en-US` so output remains Western digits
 * — this honours the project's absolute Western-numerals rule.
 */
export function tr(req: Request, key: string, params?: Record<string, string | number>): string {
  const locale = getLocale(req);
  const template = MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, name) => {
    const v = params[name];
    if (v === undefined || v === null) return "";
    return typeof v === "number" ? new Intl.NumberFormat("en-US").format(v) : String(v);
  });
}
