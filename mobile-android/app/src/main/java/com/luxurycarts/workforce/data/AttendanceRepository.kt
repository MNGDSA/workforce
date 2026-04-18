package com.luxurycarts.workforce.data

import com.luxurycarts.workforce.services.EncryptionService
import com.luxurycarts.workforce.services.NtpTimeService
import kotlinx.coroutines.flow.Flow
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

class AttendanceRepository(
    private val dao: AttendanceDao,
    private val apiService: ApiService,
    private val workforceId: String,
    private val ntpTimeService: NtpTimeService? = null,
) {
    val submissions: Flow<List<AttendanceEntity>> = dao.getSubmissions(workforceId)
    val pendingCount: Flow<Int> = dao.getPendingCount(workforceId)

    suspend fun saveSubmission(
        photoFile: File,
        gpsLat: Double,
        gpsLng: Double,
        gpsAccuracy: Float?,
        trustReport: com.luxurycarts.workforce.services.DeviceTrustReport? = null,
    ) {
        val id = UUID.randomUUID().toString()
        val trustedInstant = ntpTimeService?.getTrustedInstant() ?: Instant.now()
        val systemClockInstant = Instant.now()
        val lastNtpSync = ntpTimeService?.getLastNtpSyncInstant()
        val timezone = ntpTimeService?.organizationTimezone ?: "Asia/Riyadh"
        val date = trustedInstant.atZone(ZoneId.of(timezone)).toLocalDate().toString()

        val encPhotoPath = photoFile.absolutePath + ".enc"
        EncryptionService.encryptFile(photoFile.absolutePath, encPhotoPath)
        photoFile.delete()

        val entity = AttendanceEntity(
            id = id,
            workforceId = EncryptionService.encrypt(workforceId),
            attendanceDate = date,
            encryptedTimestamp = EncryptionService.encrypt(trustedInstant.toString()),
            encryptedGpsLat = EncryptionService.encrypt(gpsLat.toString()),
            encryptedGpsLng = EncryptionService.encrypt(gpsLng.toString()),
            gpsAccuracy = gpsAccuracy,
            encryptedPhotoPath = EncryptionService.encrypt(encPhotoPath),
            ownerWorkforceId = workforceId,
            mockLocationDetected = trustReport?.mockLocationDetected ?: false,
            isEmulator = trustReport?.isEmulator ?: false,
            rootDetected = trustReport?.rootDetected ?: false,
            locationProvider = trustReport?.locationProvider,
            deviceFingerprint = trustReport?.deviceFingerprint,
            ntpTimestamp = trustedInstant.toString(),
            systemClockTimestamp = systemClockInstant.toString(),
            lastNtpSyncAt = lastNtpSync?.toString(),
        )
        dao.insert(entity)
    }

    data class SyncResult(
        val terminated: Boolean = false,
        val sessionExpired: Boolean = false,
        val configChanged: Boolean = false,
    )

    suspend fun syncPending(): SyncResult {
        var terminated = false
        var sessionExpired = false
        var configChanged = false

        try {
            val configResponse = apiService.getMobileConfig()
            if (configResponse.isSuccessful) {
                val config = configResponse.body()
                if (config != null && ntpTimeService != null) {
                    if (config.configVersion != ntpTimeService.configVersion) {
                        ntpTimeService.ntpServerUrl = config.ntpServerUrl
                        ntpTimeService.organizationTimezone = config.organizationTimezone
                        ntpTimeService.configVersion = config.configVersion
                        configChanged = true
                        ntpTimeService.syncNtp()
                    }
                }
            } else if (configResponse.code() == 401) {
                return SyncResult(sessionExpired = true)
            }
        } catch (_: Exception) { }

        val pending = dao.getPending(workforceId)
        for (submission in pending) {
            if (submission.retryCount >= 5) continue
            try {
                val encPhotoPath = EncryptionService.decrypt(submission.encryptedPhotoPath)
                val tempFile = File.createTempFile("sync_", ".jpg")
                EncryptionService.decryptFile(encPhotoPath, tempFile.absolutePath)

                val photoBody = tempFile.asRequestBody("image/jpeg".toMediaType())
                val photoPart = MultipartBody.Part.createFormData("photo", "attendance.jpg", photoBody)
                val plainWorkforceId = EncryptionService.decrypt(submission.workforceId)
                val textType = "text/plain".toMediaType()

                val token = submission.submissionToken ?: UUID.randomUUID().toString()
                val response = apiService.submitAttendance(
                    workforceId = plainWorkforceId.toRequestBody(textType),
                    gpsLat = EncryptionService.decrypt(submission.encryptedGpsLat).toRequestBody(textType),
                    gpsLng = EncryptionService.decrypt(submission.encryptedGpsLng).toRequestBody(textType),
                    gpsAccuracy = (submission.gpsAccuracy?.toString() ?: "0").toRequestBody(textType),
                    timestamp = EncryptionService.decrypt(submission.encryptedTimestamp).toRequestBody(textType),
                    photo = photoPart,
                    mockLocationDetected = submission.mockLocationDetected.toString().toRequestBody(textType),
                    isEmulator = submission.isEmulator.toString().toRequestBody(textType),
                    rootDetected = submission.rootDetected.toString().toRequestBody(textType),
                    locationProvider = (submission.locationProvider ?: "unknown").toRequestBody(textType),
                    deviceFingerprint = (submission.deviceFingerprint ?: "").toRequestBody(textType),
                    ntpTimestamp = (submission.ntpTimestamp ?: "").toRequestBody(textType),
                    systemClockTimestamp = (submission.systemClockTimestamp ?: "").toRequestBody(textType),
                    lastNtpSyncAt = (submission.lastNtpSyncAt ?: "").toRequestBody(textType),
                    locationSource = (submission.locationSource ?: "unknown").toRequestBody(textType),
                    submissionToken = token.toRequestBody(textType),
                )

                if (response.isSuccessful) {
                    val body = response.body()
                    val sub = body?.submission
                    dao.updateSyncResult(submission.id, sub?.status ?: "synced", sub?.id, sub?.flagReason, sub?.rekognitionConfidence)
                    try { File(encPhotoPath).delete() } catch (_: Exception) {}
                } else if (response.code() == 409) {
                    dao.updateSyncResult(submission.id, "synced", null, null)
                    try { File(encPhotoPath).delete() } catch (_: Exception) {}
                } else if (response.code() == 401) {
                    sessionExpired = true
                    break
                } else if (response.code() == 422) {
                    dao.markPermanentlyRejected(submission.id, "MIN_DURATION_NOT_MET")
                    try { File(encPhotoPath).delete() } catch (_: Exception) {}
                } else if (response.code() == 429) {
                    dao.markPermanentlyRejected(submission.id, "DAILY_LIMIT_REACHED")
                    try { File(encPhotoPath).delete() } catch (_: Exception) {}
                } else if (response.code() == 403) {
                    val errBody = try { response.errorBody()?.string() } catch (_: Exception) { null }
                    val code = parseErrorCode(errBody)
                    if (code == "BEFORE_SHIFT_WINDOW" || code == "AFTER_SHIFT_WINDOW") {
                        dao.markPermanentlyRejected(submission.id, code)
                        try { File(encPhotoPath).delete() } catch (_: Exception) {}
                    } else {
                        terminated = true
                    }
                } else {
                    dao.incrementRetry(submission.id)
                }

                tempFile.delete()
            } catch (_: Exception) {
                dao.incrementRetry(submission.id)
            }
        }

        val cutoff = LocalDate.now().minusDays(30).toString()
        dao.purgeOld(workforceId, cutoff)

        refreshStatuses()
        return SyncResult(terminated = terminated, sessionExpired = sessionExpired, configChanged = configChanged)
    }

    suspend fun refreshStatuses() {
        try {
            val serverIds = dao.getServerIdsForStatusCheck(workforceId)
            if (serverIds.isEmpty()) return

            val response = apiService.checkSubmissionStatuses(StatusCheckRequest(ids = serverIds))
            if (response.isSuccessful) {
                val results = response.body() ?: return
                for (result in results) {
                    val status = result.status ?: continue
                    if (status != "flagged") {
                        dao.updateStatusByServerId(result.id, status, result.flagReason, result.reviewNotes, result.rekognitionConfidence)
                    }
                }
            }
        } catch (_: Exception) {
        }
    }

    suspend fun clearUserData() {
        dao.deleteAllForUser(workforceId)
    }

    private fun parseErrorCode(body: String?): String? {
        if (body.isNullOrBlank()) return null
        return try {
            val obj = com.google.gson.Gson().fromJson(body, com.google.gson.JsonObject::class.java)
            obj?.get("code")?.takeIf { !it.isJsonNull }?.asString
        } catch (_: Exception) { null }
    }
}
