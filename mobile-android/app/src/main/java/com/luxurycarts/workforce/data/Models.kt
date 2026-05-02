package com.luxurycarts.workforce.data

import com.google.gson.annotations.SerializedName

data class User(
    val id: String,
    val username: String? = null,
    val email: String? = null,
    val role: String? = null,
    @SerializedName("fullName") val fullName: String? = null,
    val phone: String? = null,
    @SerializedName("nationalId") val nationalId: String? = null,
    @SerializedName("isActive") val isActive: Boolean = true,
)

data class Candidate(
    val id: String,
    @SerializedName("fullNameEn") val fullNameEn: String? = null,
    @SerializedName("fullNameAr") val fullNameAr: String? = null,
    @SerializedName("nationalId") val nationalId: String? = null,
    val phone: String? = null,
    @SerializedName("photoUrl") val photoUrl: String? = null,
    val status: String? = null,
)

data class WorkforceRecord(
    val id: String,
    @SerializedName("candidateId") val candidateId: String,
    @SerializedName("isActive") val isActive: Boolean = true,
    @SerializedName("employeeNumber") val employeeNumber: String? = null,
    @SerializedName("startDate") val startDate: String? = null,
    @SerializedName("endDate") val endDate: String? = null,
    @SerializedName("fullNameEn") val fullNameEn: String? = null,
    @SerializedName("photoUrl") val photoUrl: String? = null,
    @SerializedName("jobTitle") val jobTitle: String? = null,
    @SerializedName("eventName") val eventName: String? = null,
    @SerializedName("positionTitle") val positionTitle: String? = null,
    @SerializedName("positionId") val positionId: String? = null,
    // Task #281 — Reports To: manager fields joined server-side; null when unassigned.
    @SerializedName("managerId") val managerId: String? = null,
    @SerializedName("managerNameEn") val managerNameEn: String? = null,
    @SerializedName("managerNameAr") val managerNameAr: String? = null,
    @SerializedName("managerPhone") val managerPhone: String? = null,
    @SerializedName("managerWhatsapp") val managerWhatsapp: String? = null,
    @SerializedName("managerEmail") val managerEmail: String? = null,
)

data class QualityCheckItem(
    val name: String = "",
    val passed: Boolean = false,
    val tip: String? = null,
)

data class QualityResultResponse(
    val passed: Boolean = false,
    val checks: List<QualityCheckItem> = emptyList(),
    @SerializedName("qualityCheckSkipped") val qualityCheckSkipped: Boolean = false,
)

data class PhotoUploadResponse(
    val url: String? = null,
    @SerializedName("docType") val docType: String? = null,
    @SerializedName("pendingReview") val pendingReview: Boolean = false,
    @SerializedName("changeRequestId") val changeRequestId: String? = null,
    val message: String? = null,
    @SerializedName("qualityResult") val qualityResult: QualityResultResponse? = null,
)

data class PhotoChangeRequest(
    val id: String,
    @SerializedName("candidateId") val candidateId: String,
    @SerializedName("newPhotoUrl") val newPhotoUrl: String? = null,
    @SerializedName("previousPhotoUrl") val previousPhotoUrl: String? = null,
    val status: String,
    @SerializedName("reviewNotes") val reviewNotes: String? = null,
    @SerializedName("createdAt") val createdAt: String? = null,
)

data class LoginRequest(
    val identifier: String,
    val password: String,
)

data class LoginResponse(
    val user: User,
    val candidate: Candidate? = null,
)

data class ResetPasswordRequest(
    @SerializedName("nationalId") val nationalId: String,
)

data class ResetPasswordRequestResponse(
    @SerializedName("maskedPhone") val maskedPhone: String,
    val phone: String? = null,
    @SerializedName("expiresAt") val expiresAt: String? = null,
)

data class OtpVerifyRequest(
    val phone: String,
    val code: String,
)

data class OtpVerifyResponse(
    val success: Boolean,
    @SerializedName("otpId") val otpId: String? = null,
)

data class ResetPasswordFinalize(
    @SerializedName("nationalId") val nationalId: String,
    @SerializedName("otpId") val otpId: String,
    @SerializedName("newPassword") val newPassword: String,
)

data class MessageResponse(
    val message: String,
)

data class ScheduleEntry(
    val id: String,
    val date: String,
    @SerializedName("shiftStart") val shiftStart: String? = null,
    @SerializedName("shiftEnd") val shiftEnd: String? = null,
    @SerializedName("shiftName") val shiftName: String? = null,
    val location: String? = null,
)

data class GeofenceZone(
    val id: String,
    val name: String,
    @SerializedName("centerLat") val centerLat: String,
    @SerializedName("centerLng") val centerLng: String,
    @SerializedName("radiusMeters") val radiusMeters: Int,
    @SerializedName("isActive") val isActive: Boolean,
)

data class SubmissionResponse(
    val submission: SubmissionDetail? = null,
    val verification: VerificationResult? = null,
)

data class SubmissionDetail(
    val id: String,
    val status: String,
    @SerializedName("flagReason") val flagReason: String? = null,
    @SerializedName("rekognitionConfidence") val rekognitionConfidence: String? = null,
)

data class VerificationResult(
    val status: String,
    val confidence: Double = 0.0,
    @SerializedName("gpsInside") val gpsInside: Boolean = false,
    @SerializedName("flagReason") val flagReason: String? = null,
)

data class ErasureRequest(
    @SerializedName("workforceId") val workforceId: String,
    val reason: String? = null,
)

data class ErasureResponse(
    val message: String,
)

data class ErasureStatusResponse(
    @SerializedName("hasPendingRequest") val hasPendingRequest: Boolean,
    @SerializedName("requestDate") val requestDate: String? = null,
)

data class StatusCheckRequest(
    val ids: List<String>,
)

data class StatusCheckResult(
    val id: String,
    val status: String?,
    @SerializedName("flagReason") val flagReason: String? = null,
    @SerializedName("reviewNotes") val reviewNotes: String? = null,
    @SerializedName("rekognitionConfidence") val rekognitionConfidence: String? = null,
)

data class MobileConfigResponse(
    @SerializedName("ntp_server_url") val ntpServerUrl: String,
    @SerializedName("organization_timezone") val organizationTimezone: String,
    @SerializedName("config_version") val configVersion: Int,
)

data class ExcuseRequestSubmit(
    @SerializedName("workforceId") val workforceId: String,
    val date: String,
    val reason: String,
)

data class AttendanceStatusResponse(
    val state: String,
    @SerializedName("nextAllowedAction") val nextAllowedAction: String,
    @SerializedName("shiftAssigned") val shiftAssigned: Boolean = false,
    val shift: ShiftInfo? = null,
    @SerializedName("clockIn") val clockIn: String? = null,
    @SerializedName("clockOut") val clockOut: String? = null,
    @SerializedName("minutesWorked") val minutesWorked: Int? = null,
    @SerializedName("shiftWindowOpen") val shiftWindowOpen: Boolean = true,
    @SerializedName("windowMessage") val windowMessage: String? = null,
    @SerializedName("windowReason") val windowReason: WindowReason? = null,
    @SerializedName("cooldownUntil") val cooldownUntil: String? = null,
    val config: AttendanceConfig? = null,
    val date: String? = null,
    @SerializedName("currentTime") val currentTime: String? = null,
    // Task #85 step 4 — server-issued, HMAC-signed submission token.
    // The capture flow persists this onto the AttendanceEntity so that
    // /submit can verify the row was actually authorised at status-
    // check time (closing the pre-claim attack on client-generated
    // UUID tokens). Nullable so older server builds keep parsing.
    @SerializedName("submissionToken") val submissionToken: String? = null,
    @SerializedName("submissionTokenExpiresAt") val submissionTokenExpiresAt: String? = null,
)

data class ShiftInfo(
    @SerializedName("startTime") val startTime: String,
    @SerializedName("endTime") val endTime: String,
    @SerializedName("durationMinutes") val durationMinutes: Int,
)

data class WindowReason(
    val code: String,
    val params: Map<String, Any> = emptyMap(),
)

data class AttendanceConfig(
    @SerializedName("earlyBufferMinutes") val earlyBufferMinutes: Int = 30,
    @SerializedName("lateBufferMinutes") val lateBufferMinutes: Int = 30,
    @SerializedName("minShiftDurationMinutes") val minShiftDurationMinutes: Int = 240,
    @SerializedName("maxDailySubmissions") val maxDailySubmissions: Int = 2,
)

data class ExcuseRequest(
    val id: String,
    @SerializedName("workforceId") val workforceId: String,
    val date: String,
    val reason: String,
    @SerializedName("attachmentUrl") val attachmentUrl: String? = null,
    @SerializedName("submittedAt") val submittedAt: String? = null,
    @SerializedName("hadClockIn") val hadClockIn: Boolean = false,
    @SerializedName("effectiveClockOut") val effectiveClockOut: String? = null,
    val status: String = "pending",
    @SerializedName("reviewedBy") val reviewedBy: String? = null,
    @SerializedName("reviewedAt") val reviewedAt: String? = null,
    @SerializedName("reviewNotes") val reviewNotes: String? = null,
)
