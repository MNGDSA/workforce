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
)

data class PhotoUploadResponse(
    val url: String? = null,
    @SerializedName("docType") val docType: String? = null,
    @SerializedName("pendingReview") val pendingReview: Boolean = false,
    @SerializedName("changeRequestId") val changeRequestId: String? = null,
    val message: String? = null,
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
    @SerializedName("userId") val userId: String,
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
