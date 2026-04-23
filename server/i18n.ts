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
    "register.phoneExists":       "An account with this phone number already exists",
    "register.duplicate":         "An account with these details already exists",
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
    "common.invalidPayload":            "Invalid request payload.",
    "candidate.blockedByPipeline":      "This candidate is currently held by an active pipeline (workforce, onboarding, interview, or application). Resolve the pipeline before reclassifying.",
    "candidate.reclassifyReasonRequired": "A reason of at least 10 characters is required for the audit trail.",
    "candidate.reclassifyFailed":         "Reclassification could not complete safely. No changes were made — please try again.",
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
    "application.profileIncomplete":    "Please complete your profile before applying for jobs.",
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

    // Pay-run / OTP / SMP additions (Task #61 final pass)
    "error.alreadyConverted"              : "Already converted, rejected, or terminated",
    "error.candidateNotFound"             : "Candidate not found",
    "error.columnNamesNotFound"           : "Column names not found in file headers",
    "error.cashOtpNoPhone"                : "Employee has no phone number on file — required for cash payment OTP",
    "error.employeeNotFound"              : "Employee not found",
    "error.fileNeedsHeader"               : "File must have a header row and at least one data row",
    "error.fileRequired"                  : "File required",
    "error.invalidOtp"                    : "Invalid OTP code",
    "error.labelAndAmountRequired"        : "Label and amount required",
    "error.lineNotFound"                  : "Line not found",
    "error.payRunFieldsRequired"          : "Name, dateFrom, dateTo required",
    "error.otpExpired"                    : "OTP expired — request a new code",
    "error.overrideReasonRequired"        : "Override reason required",
    "error.payRunNotFound"                : "Pay run not found",
    "error.cashReasonRequired"            : "Reason required when setting payment method to cash",
    "error.recordNotFound"                : "Record not found",
    "error.smpNoContracts"                : "SMP workers do not get contracts",
    "error.splitPercent"                  : "Split percentage must be between 1 and 99",
    "error.superAdminOnly"                : "Super admin only",
    "error.tooManyOtpAttempts"            : "Too many attempts — request a new code",
    "error.tranche2Blocked"               : "Tranche 2 blocked — offboarding must be completed first",
    "error.unauthorized"                  : "Unauthorized",
    "error.updateFailed"                  : "Update failed",
    "smp.cannotApplyActiveSmp"            : "Cannot submit individual job application: this candidate is currently registered as an active SMP worker. Remove them from the SMP contract first.",
    "smp.cannotApplyOnboarding"           : "Cannot submit individual job application: this candidate is in an active SMP onboarding pipeline. Complete or reject the SMP onboarding first.",
    "smp.cannotSelfRegister"              : "This national ID is registered as an SMP-classified worker. Please use the activation link sent to your phone, or contact your employer.",

    // ─── SMS / Email recipient-facing templates ─────────────────────────────
    "sms.docRejected"                     : "Your {{docLabel}} has been rejected by the HR team. Please re-upload the correct one as soon as possible.",
    "sms.otpVerification"                 : "Workforce SA: Your verification code is {{code}}. Valid for 5 minutes. Do not share this code.",
    "sms.passwordResetCode"               : "Your password reset code is: {{code}}",
    "sms.contractReady"                   : "Your employment contract has been generated and is ready for your review and signature. Please log in to the candidate portal to view and sign it.",
    "sms.cashPaymentOtp"                  : "Your cash payment verification code is {{code}}. Amount: {{amount}} SAR. Provide this code to the cashier to confirm receipt. WORKFORCE",
    "sms.smpActivation"                   : "Welcome to Workforce. Your employer has registered you. Tap the link to set your password and activate your account: {{link}} (valid 21 days).",
    "sms.smpActivationReissue"            : "Workforce: Your previous activation link is no longer valid. Tap this new link to set your password: {{link}} (valid 21 days).",
    "pipeline.smpNotEligible"             : "One or more selected workers are SMP-classified and cannot be added to interviews, training sessions, or job applications. Use Send to Onboarding instead.",
    "smp.cannotApplyActiveSmp"            : "You are currently assigned through your employer (SMP) and cannot apply to jobs directly.",
    "smp.cannotRegisterSmp"               : "Your phone number is registered as part of an SMP batch. Please use the activation link sent to you by SMS.",
    "activation.invalid"                  : "This activation link is invalid.",
    "activation.expired"                  : "This activation link has expired. Ask your administrator to send you a new one.",
    "activation.consumed"                 : "This activation link has already been used. Try logging in instead.",
    "activation.success"                  : "Account activated. You can now log in.",
    "activation.passwordTooShort"         : "Password must be at least 8 characters.",
    "blocker.active_workforce"            : "Currently in active employment",
    "blocker.pending_onboarding"          : "Currently in onboarding",
    "blocker.scheduled_session"           : "Scheduled for an interview or training session",
    "blocker.pending_application"         : "Has a pending job application",
    "doc.label.photo"                     : "Personal Photo",
    "doc.label.nationalId"                : "National ID / Iqama",
    "doc.label.iban"                      : "IBAN Certificate",
    "doc.label.document"                  : "document",
    // Task #120 — server-side IBAN validation
    "iban.missing_prefix"                 : "Invalid IBAN: must start with SA",
    "iban.wrong_length"                   : "Invalid IBAN: must be 24 characters (SA + 22 digits)",
    "iban.non_digit"                      : "Invalid IBAN: must contain only digits after SA",
    "iban.bad_checksum"                   : "Invalid IBAN: failed bank checksum check. Please check for a typo.",
    // Task #137 — IBAN holder-name (English-only) validation
    "iban_holder_name.empty"              : "IBAN account holder name is required.",
    "iban_holder_name.non_latin"          : "IBAN account holder name must be in English exactly as it appears on the bank card (letters A-Z only, no Arabic).",
    "iban_holder_name.too_long"           : "IBAN account holder name is too long (max 64 characters).",

    // Final hardcoded message cleanup (Task #61)
    "common.jobIdRequired"                : "jobId is required",
    "payroll.bankTxnFieldsRequired"       : "bankTransactionId and depositDate required",
    "payroll.ibanMappingsRequired"        : "ibanColumn and txnIdColumn mappings required",
    "payroll.adjustmentFieldsRequired"    : "workforceId, date, reason required",
    "payroll.adjustmentBulkFieldsRequired": "date and reason required",
    "workforce.paymentMethodInvalid"      : "paymentMethod must be 'bank_transfer' or 'cash'",
    "ntp.invalidHostname"                 : "Invalid hostname",
    "ntp.internalAddressBlocked"          : "Internal addresses not allowed",
    "ntp.dnsResolutionFailed"             : "DNS resolution failed",
    "ntp.resolvesToInternal"              : "Resolves to internal address",
    "import.profileMissingFields"         : "Profile marked complete but missing: {{fields}}",
    "import.invalidRow"                   : "invalid",

    // Attendance status — windowMessage variants (mobile shows verbatim)
    "attendance.window.beforeShift"       : "Your shift starts at {{start}}. You can check in from {{earliest}} (in {{wait}}).",
    "attendance.window.afterShift"        : "Your shift ended at {{end}}. The check-out window has closed.",
    "attendance.window.minDuration"       : "Minimum shift duration is {{required}} minutes. You can check out in {{remaining}} more minute(s).",

    // Attendance flag/audit reasons (admin-visible)
    "attendance.flag.noShift"             : "No shift assigned to this employee",
    "attendance.flag.clockTamperDrift"    : "Clock tampering suspected — NTP and system clock diverge by {{minutes}} minute(s)",
    "attendance.flag.serverClockDrift"    : "NTP timestamp and server time diverge by {{minutes}} minute(s)",
    "attendance.flag.staleNtp"            : "Stale NTP offset — last sync {{days}} day(s) ago",
    "attendance.flag.pipelineError"       : "Pipeline error: {{detail}}",
    "attendance.flag.pipelineErrorShort"  : "Pipeline error",
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
    "register.phoneExists":       "يوجد حساب مسجل برقم الجوال هذا بالفعل",
    "register.duplicate":         "يوجد حساب مسجل بهذه البيانات بالفعل",
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
    "common.invalidPayload":            "بيانات الطلب غير صالحة.",
    "candidate.blockedByPipeline":      "هذا المرشح مرتبط حالياً بمسار نشط (عمالة أو تأهيل أو مقابلة أو طلب). أنهِ المسار قبل إعادة التصنيف.",
    "candidate.reclassifyReasonRequired": "يجب إدخال سبب لا يقل عن 10 أحرف لتسجيله في سجل التدقيق.",
    "candidate.reclassifyFailed":         "تعذّر إكمال إعادة التصنيف بأمان. لم يتم إجراء أي تغييرات — يُرجى المحاولة مرة أخرى.",
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
    "application.profileIncomplete":    "يرجى إكمال ملفك الشخصي قبل التقديم على الوظائف.",
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

    // Pay-run / OTP / SMP additions (Task #61 final pass)
    "error.alreadyConverted"              : "تم التحويل أو الرفض أو الإنهاء بالفعل",
    "error.candidateNotFound"             : "لم يتم العثور على المرشح",
    "error.columnNamesNotFound"           : "لم يتم العثور على أسماء الأعمدة في ترويسة الملف",
    "error.cashOtpNoPhone"                : "لا يوجد رقم جوال للموظف — مطلوب لرمز التحقق للدفع النقدي",
    "error.employeeNotFound"              : "لم يتم العثور على الموظف",
    "error.fileNeedsHeader"               : "يجب أن يحتوي الملف على صف ترويسة وصف بيانات واحد على الأقل",
    "error.fileRequired"                  : "الملف مطلوب",
    "error.invalidOtp"                    : "رمز التحقق غير صحيح",
    "error.labelAndAmountRequired"        : "التسمية والمبلغ مطلوبان",
    "error.lineNotFound"                  : "السطر غير موجود",
    "error.payRunFieldsRequired"          : "الاسم وتاريخ البدء وتاريخ الانتهاء مطلوبة",
    "error.otpExpired"                    : "انتهت صلاحية رمز التحقق — اطلب رمزاً جديداً",
    "error.overrideReasonRequired"        : "سبب التجاوز مطلوب",
    "error.payRunNotFound"                : "دورة الدفع غير موجودة",
    "error.cashReasonRequired"            : "السبب مطلوب عند تحديد طريقة الدفع نقداً",
    "error.recordNotFound"                : "السجل غير موجود",
    "error.smpNoContracts"                : "لا تُصدر عقود لعمال SMP",
    "error.splitPercent"                  : "نسبة التقسيم يجب أن تكون بين 1 و 99",
    "error.superAdminOnly"                : "للمسؤول الأعلى فقط",
    "error.tooManyOtpAttempts"            : "محاولات كثيرة — اطلب رمزاً جديداً",
    "error.tranche2Blocked"               : "الدفعة الثانية موقوفة — يجب إكمال إنهاء التعيين أولاً",
    "error.unauthorized"                  : "غير مصرح",
    "error.updateFailed"                  : "فشل التحديث",
    "smp.cannotApplyActiveSmp"            : "لا يمكن تقديم طلب وظيفة فردي: هذا المرشح مسجّل حالياً كعامل SMP نشط. قم بإزالته من عقد SMP أولاً.",
    "smp.cannotApplyOnboarding"           : "لا يمكن تقديم طلب وظيفة فردي: هذا المرشح ضمن مسار تأهيل SMP نشط. أكمل أو ارفض تأهيل SMP أولاً.",
    "smp.cannotSelfRegister"              : "رقم الهوية هذا مسجَّل كعامل ضمن شركة عمالة SMP. يرجى استخدام رابط التفعيل المرسل إلى هاتفك أو التواصل مع جهة العمل.",

    // ─── SMS / Email recipient-facing templates ─────────────────────────────
    "sms.docRejected"                     : "تم رفض {{docLabel}} الخاص بك من قِبل فريق الموارد البشرية. يرجى رفع المستند الصحيح في أقرب وقت ممكن.",
    "sms.otpVerification"                 : "وورك فورس: رمز التحقق الخاص بك هو {{code}}. صالح لمدة 5 دقائق. لا تشاركه مع أي شخص.",
    "sms.passwordResetCode"               : "رمز إعادة تعيين كلمة المرور: {{code}}",
    "sms.contractReady"                   : "تم إصدار عقد العمل الخاص بك وهو جاهز للمراجعة والتوقيع. يرجى تسجيل الدخول إلى بوابة المرشح لعرضه وتوقيعه.",
    "sms.cashPaymentOtp"                  : "رمز التحقق للدفع النقدي: {{code}}. المبلغ: {{amount}} ريال سعودي. قدّم هذا الرمز للمحاسب لتأكيد الاستلام. وورك فورس",
    "sms.smpActivation"                   : "أهلاً بك في وورك فورس. تم تسجيلك من قِبل شركتك. اضغط على الرابط لتعيين كلمة المرور وتفعيل حسابك: {{link}} (الرابط صالح لمدة 21 يوماً).",
    "sms.smpActivationReissue"            : "وورك فورس: رابط التفعيل السابق لم يعد صالحاً. اضغط على الرابط الجديد لتعيين كلمة المرور: {{link}} (صالح 21 يوماً).",
    "pipeline.smpNotEligible"             : "بعض العاملين المحددين مصنفون SMP ولا يمكن إضافتهم إلى المقابلات أو جلسات التدريب أو طلبات الوظائف. استخدم \"إرسال إلى التأهيل\" بدلاً من ذلك.",
    "smp.cannotApplyActiveSmp"            : "أنت معيّن حالياً عبر شركتك (SMP) ولا يمكنك التقدم إلى الوظائف مباشرة.",
    "smp.cannotRegisterSmp"               : "رقم هاتفك مسجل ضمن دفعة SMP. يُرجى استخدام رابط التفعيل المُرسل إليك عبر الرسائل القصيرة.",
    "activation.invalid"                  : "رابط التفعيل غير صالح.",
    "activation.expired"                  : "انتهت صلاحية رابط التفعيل. اطلب من الإدارة إرسال رابط جديد.",
    "activation.consumed"                 : "تم استخدام رابط التفعيل من قبل. حاول تسجيل الدخول مباشرة.",
    "activation.success"                  : "تم تفعيل الحساب. يمكنك الآن تسجيل الدخول.",
    "activation.passwordTooShort"         : "يجب ألا تقل كلمة المرور عن 8 أحرف.",
    "blocker.active_workforce"            : "في عمل نشط حالياً",
    "blocker.pending_onboarding"          : "في عملية تأهيل حالياً",
    "blocker.scheduled_session"           : "مجدول لمقابلة أو جلسة تدريب",
    "blocker.pending_application"         : "لديه طلب وظيفة قيد المراجعة",
    "doc.label.photo"                     : "الصورة الشخصية",
    "doc.label.nationalId"                : "بطاقة الهوية / الإقامة",
    "doc.label.iban"                      : "شهادة الآيبان",
    "doc.label.document"                  : "المستند",
    // Task #120 — server-side IBAN validation
    "iban.missing_prefix"                 : "آيبان غير صالح: يجب أن يبدأ بـ SA",
    "iban.wrong_length"                   : "آيبان غير صالح: يجب أن يتكون من 24 حرفًا (SA + 22 رقمًا)",
    "iban.non_digit"                      : "آيبان غير صالح: يجب أن يحتوي على أرقام فقط بعد SA",
    "iban.bad_checksum"                   : "آيبان غير صالح: فشل في التحقق من خانة المراجعة البنكية. يرجى التأكد من عدم وجود خطأ مطبعي.",
    // Task #137 — IBAN holder-name (English-only) validation
    "iban_holder_name.empty"              : "اسم صاحب حساب الآيبان مطلوب.",
    "iban_holder_name.non_latin"          : "يجب إدخال اسم صاحب حساب الآيبان بالإنجليزية كما هو مطبوع على بطاقة الصراف (حروف A-Z فقط، بدون عربي).",
    "iban_holder_name.too_long"           : "اسم صاحب حساب الآيبان طويل جدًا (حد أقصى 64 حرفًا).",

    // Final hardcoded message cleanup (Task #61)
    "common.jobIdRequired"                : "معرّف الوظيفة (jobId) مطلوب",
    "payroll.bankTxnFieldsRequired"       : "رقم العملية البنكية وتاريخ الإيداع مطلوبان",
    "payroll.ibanMappingsRequired"        : "تحديد عمودَي الآيبان ومعرّف العملية مطلوب",
    "payroll.adjustmentFieldsRequired"    : "معرّف الموظف والتاريخ والسبب مطلوبة",
    "payroll.adjustmentBulkFieldsRequired": "التاريخ والسبب مطلوبان",
    "workforce.paymentMethodInvalid"      : "طريقة الدفع يجب أن تكون 'bank_transfer' أو 'cash'",
    "ntp.invalidHostname"                 : "اسم المضيف غير صحيح",
    "ntp.internalAddressBlocked"          : "العناوين الداخلية غير مسموح بها",
    "ntp.dnsResolutionFailed"             : "فشل تحويل اسم المجال (DNS)",
    "ntp.resolvesToInternal"              : "يشير اسم المضيف إلى عنوان داخلي",
    "import.profileMissingFields"         : "تم وضع علامة اكتمال الملف ولكن تنقص الحقول التالية: {{fields}}",
    "import.invalidRow"                   : "غير صالح",

    // Attendance status — windowMessage variants (mobile shows verbatim)
    "attendance.window.beforeShift"       : "يبدأ شيفتك في {{start}}. يمكنك تسجيل الحضور من {{earliest}} (خلال {{wait}}).",
    "attendance.window.afterShift"        : "انتهى شيفتك في {{end}}. أُغلقت نافذة الانصراف.",
    "attendance.window.minDuration"       : "الحد الأدنى لمدة الشيفت {{required}} دقيقة. يمكنك الانصراف بعد {{remaining}} دقيقة.",

    // Attendance flag/audit reasons (admin-visible)
    "attendance.flag.noShift"             : "لا يوجد شيفت مُعيَّن لهذا الموظف",
    "attendance.flag.clockTamperDrift"    : "اشتباه في تلاعب بالساعة — اختلاف بين NTP وساعة النظام بمقدار {{minutes}} دقيقة",
    "attendance.flag.serverClockDrift"    : "اختلاف بين توقيت NTP وتوقيت الخادم بمقدار {{minutes}} دقيقة",
    "attendance.flag.staleNtp"            : "إزاحة NTP قديمة — آخر مزامنة قبل {{days}} يوم",
    "attendance.flag.pipelineError"       : "خطأ في خط التحقق: {{detail}}",
    "attendance.flag.pipelineErrorShort"  : "خطأ في خط التحقق",
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
  return trL(getLocale(req), key, params);
}

/**
 * Locale-explicit translator — used by background SMS / email senders that
 * have no Express request context but know the recipient's preferred locale
 * (e.g. from a candidate or user record).
 */
export function trL(locale: ServerLocale | string | null | undefined, key: string, params?: Record<string, string | number>): string {
  const loc: ServerLocale = locale === "en" ? "en" : locale === "ar" ? "ar" : DEFAULT_LOCALE;
  const template = MESSAGES[loc][key] ?? MESSAGES.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, name) => {
    const v = params[name];
    if (v === undefined || v === null) return "";
    return typeof v === "number" ? new Intl.NumberFormat("en-US").format(v) : String(v);
  });
}
