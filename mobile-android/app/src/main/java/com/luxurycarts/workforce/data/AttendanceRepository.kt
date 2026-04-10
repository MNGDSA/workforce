package com.luxurycarts.workforce.data

import com.luxurycarts.workforce.services.EncryptionService
import kotlinx.coroutines.flow.Flow
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

class AttendanceRepository(
    private val dao: AttendanceDao,
    private val apiService: ApiService,
    private val workforceId: String,
) {
    val submissions: Flow<List<AttendanceEntity>> = dao.getSubmissions(workforceId)
    val pendingCount: Flow<Int> = dao.getPendingCount(workforceId)

    suspend fun saveSubmission(
        photoFile: File,
        gpsLat: Double,
        gpsLng: Double,
        gpsAccuracy: Float?,
    ) {
        val id = UUID.randomUUID().toString()
        val now = Instant.now().toString()
        val date = LocalDate.now().toString()

        val encPhotoPath = photoFile.absolutePath + ".enc"
        EncryptionService.encryptFile(photoFile.absolutePath, encPhotoPath)
        photoFile.delete()

        val entity = AttendanceEntity(
            id = id,
            workforceId = EncryptionService.encrypt(workforceId),
            attendanceDate = date,
            encryptedTimestamp = EncryptionService.encrypt(now),
            encryptedGpsLat = EncryptionService.encrypt(gpsLat.toString()),
            encryptedGpsLng = EncryptionService.encrypt(gpsLng.toString()),
            gpsAccuracy = gpsAccuracy,
            encryptedPhotoPath = EncryptionService.encrypt(encPhotoPath),
            ownerWorkforceId = workforceId,
        )
        dao.insert(entity)
    }

    suspend fun syncPending() {
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

                val response = apiService.submitAttendance(
                    workforceId = plainWorkforceId.toRequestBody("text/plain".toMediaType()),
                    gpsLat = EncryptionService.decrypt(submission.encryptedGpsLat).toRequestBody("text/plain".toMediaType()),
                    gpsLng = EncryptionService.decrypt(submission.encryptedGpsLng).toRequestBody("text/plain".toMediaType()),
                    gpsAccuracy = (submission.gpsAccuracy?.toString() ?: "0").toRequestBody("text/plain".toMediaType()),
                    timestamp = EncryptionService.decrypt(submission.encryptedTimestamp).toRequestBody("text/plain".toMediaType()),
                    photo = photoPart,
                    mockLocationDetected = submission.mockLocationDetected.toString().toRequestBody("text/plain".toMediaType()),
                    isEmulator = submission.isEmulator.toString().toRequestBody("text/plain".toMediaType()),
                    locationProvider = (submission.locationProvider ?: "unknown").toRequestBody("text/plain".toMediaType()),
                    deviceFingerprint = (submission.deviceFingerprint ?: "").toRequestBody("text/plain".toMediaType()),
                )

                if (response.isSuccessful) {
                    val body = response.body()
                    val sub = body?.submission
                    dao.updateSyncResult(submission.id, sub?.status ?: "synced", sub?.id, sub?.flagReason, sub?.rekognitionConfidence)
                } else if (response.code() == 409) {
                    dao.updateSyncResult(submission.id, "synced", null, null)
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
}
