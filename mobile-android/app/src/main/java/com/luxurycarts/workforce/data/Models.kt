package com.luxurycarts.workforce.data

import com.google.gson.annotations.SerializedName

data class User(
    val id: Int,
    @SerializedName("workforce_id") val workforceId: String,
    val name: String,
    val role: String,
    val email: String? = null,
    val phone: String? = null,
)

data class Candidate(
    val id: Int,
    val name: String,
    @SerializedName("national_id") val nationalId: String? = null,
    val phone: String? = null,
)

data class WorkforceRecord(
    val id: String,
    @SerializedName("candidate_id") val candidateId: Int,
    val status: String,
    @SerializedName("job_title") val jobTitle: String? = null,
    @SerializedName("reference_photo_url") val referencePhotoUrl: String? = null,
)

data class LoginRequest(
    @SerializedName("workforce_id") val workforceId: String,
    val password: String,
)

data class LoginResponse(
    val user: User,
    val candidate: Candidate? = null,
)

data class ScheduleEntry(
    val id: Int,
    val date: String,
    @SerializedName("shift_start") val shiftStart: String? = null,
    @SerializedName("shift_end") val shiftEnd: String? = null,
    @SerializedName("shift_name") val shiftName: String? = null,
    val location: String? = null,
)

data class GeofenceZone(
    val id: Int,
    val name: String,
    @SerializedName("center_lat") val centerLat: Double,
    @SerializedName("center_lng") val centerLng: Double,
    @SerializedName("radius_meters") val radiusMeters: Double,
    @SerializedName("is_active") val isActive: Boolean,
)

data class SubmissionResponse(
    val id: Int,
    val status: String,
    @SerializedName("flag_reason") val flagReason: String? = null,
)

data class DeletionRequest(
    @SerializedName("workforce_id") val workforceId: String,
    val password: String,
    val reason: String,
)

data class DeletionResponse(
    val message: String,
)
