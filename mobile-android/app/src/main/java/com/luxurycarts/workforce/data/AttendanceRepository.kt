package com.luxurycarts.workforce.data

import android.content.Context
import com.luxurycarts.workforce.services.EncryptionService
import com.luxurycarts.workforce.services.NtpTimeService
import kotlinx.coroutines.flow.Flow
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Response
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

/**
 * Repository for attendance submissions.
 *
 * The sync pipeline is the highest-stakes data path in the app — workers'
 * wages depend on it. Every failure is classified, every transient failure
 * retries with exponential backoff, every permanent failure is recorded with
 * a reason, and submissions that cannot sync after [STUCK_THRESHOLD_MS] are
 * surfaced to the user as needing manual attention rather than silently dying.
 */
class AttendanceRepository(
    private val dao: AttendanceDao,
    private val apiService: ApiService,
    private val workforceId: String,
    private val ntpTimeService: NtpTimeService? = null,
    private val context: Context? = null,
) {
    val submissions: Flow<List<AttendanceEntity>> = dao.getSubmissions(workforceId)
    val pendingCount: Flow<Int> = dao.getPendingCount(workforceId)
    val needsAttentionCount: Flow<Int> = dao.getNeedsAttentionCount(workforceId)

    companion object {
        /** A submission stuck this long without success becomes "needs attention". */
        const val STUCK_THRESHOLD_MS: Long = 24L * 60L * 60L * 1000L

        /** NTP sync older than this is considered stale. */
        const val NTP_STALE_THRESHOLD_MS: Long = 6L * 60L * 60L * 1000L

        /**
         * Step 4 (F-17): rows that have been parked in `needs_attention`
         * for longer than this are eligible for the manual purge button
         * on the History screen and the periodic auto-purge inside
         * [purgeStuckNeedsAttention].
         */
        const val STUCK_NEEDS_ATTENTION_PURGE_MS: Long = 90L * 24L * 60L * 60L * 1000L
    }

    /**
     * Step 4 (F-17): how many `needs_attention` rows are currently
     * eligible for the 90-day purge. Surfaced on the History screen so
     * the user sees the actual recoverable count before tapping.
     */
    suspend fun countStuckPurgeable(): Int {
        val cutoff = System.currentTimeMillis() - STUCK_NEEDS_ATTENTION_PURGE_MS
        return dao.countStuckNeedsAttention(workforceId, cutoff)
    }

    /**
     * Step 4 (F-17): user-initiated purge of stuck rows older than 90
     * days. Returns the number of rows deleted.
     */
    suspend fun purgeStuckSubmissions(): Int {
        val cutoff = System.currentTimeMillis() - STUCK_NEEDS_ATTENTION_PURGE_MS
        val deleted = dao.purgeStuckNeedsAttention(workforceId, cutoff)
        if (deleted > 0) {
            SyncTelemetry.logEvent(
                context,
                "stuck_purge",
                "deleted=$deleted cutoff=$cutoff",
            )
        }
        return deleted
    }

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

        // Determine whether the local NTP sync is fresh enough that we trust
        // the captured timestamp. If not, we mark the submission so the server
        // (and any reviewer) knows the wall-clock may have been off.
        val staleClock = lastNtpSync == null ||
            (System.currentTimeMillis() - lastNtpSync.toEpochMilli()) > NTP_STALE_THRESHOLD_MS

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
            staleClock = staleClock,
        )
        dao.insert(entity)
        SyncTelemetry.logEvent(context, "submission_saved", "id=$id staleClock=$staleClock")
    }

    data class SyncResult(
        val terminated: Boolean = false,
        val sessionExpired: Boolean = false,
        val configChanged: Boolean = false,
    )

    /**
     * Reset the auto-retry state on a single submission so the next sync pass
     * picks it up immediately. Called when the user taps "retry" on an entry
     * that is in the "needs manual attention" state.
     */
    suspend fun retryNow(submissionId: String) {
        dao.clearNeedsAttention(submissionId)
        SyncTelemetry.logEvent(context, "user_retry", "id=$submissionId")
    }

    suspend fun syncPending(): SyncResult {
        var terminated = false
        var sessionExpired = false
        var configChanged = false
        var configFetchFailed = false

        // ── Config fetch (hardened) ────────────────────────────────────────
        // A failed config fetch must NOT silently corrupt subsequent NTP-based
        // timestamps. If it fails, we keep the existing config and proceed
        // only if our local NTP is still fresh enough.
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
                SyncTelemetry.logEvent(context, "config_fetch_session_expired")
                return SyncResult(sessionExpired = true)
            } else {
                configFetchFailed = true
                SyncTelemetry.logEvent(
                    context,
                    "config_fetch_non_success",
                    "http=${configResponse.code()} — keeping existing config",
                )
            }
        } catch (e: Exception) {
            configFetchFailed = true
            SyncTelemetry.logEvent(
                context,
                "config_fetch_failed",
                "${e.javaClass.simpleName}: ${e.message} — keeping existing config",
            )
        }

        // ── NTP freshness gate ─────────────────────────────────────────────
        // If we couldn't refresh config AND our local NTP sync is stale, we
        // can no longer trust that the captured timestamps line up with
        // server-side enforcement (shift windows, daily limits). Defer all
        // sync attempts as transient retries instead of risking a flood of
        // 4xx PermanentClientError verdicts that would mark good data bad.
        val ntpStale = ntpTimeService != null && !ntpTimeService.isNtpFresh(NTP_STALE_THRESHOLD_MS)
        if (configFetchFailed && ntpStale) {
            SyncTelemetry.logEvent(
                context,
                "sync_deferred_stale_ntp",
                "configFetchFailed=true ntpStale=true — submissions deferred",
            )
            // Push every currently-due pending row out to a backoff slot so
            // we don't busy-loop on stale clocks. The >24h promotion to
            // needs_attention is preserved here so a long stale-clock
            // outage still surfaces stuck rows to the user instead of
            // hiding them behind silent backoff forever.
            val nowMs = System.currentTimeMillis()
            val pendingDue = dao.getPendingDue(workforceId, nowMs)
            for (sub in pendingDue) {
                // sentinel -1 = user just tapped Retry on a stuck row; bypass
                // the >24h auto-stop gate for this single attempt so the user
                // can actually recover the submission.
                val userInitiated = sub.nextRetryAtMillis == -1L
                if (!userInitiated && sub.createdAtMillis > 0 && nowMs - sub.createdAtMillis > STUCK_THRESHOLD_MS) {
                    dao.markNeedsAttention(
                        sub.id,
                        nowMs,
                        sub.lastErrorCode ?: "STUCK_24H_NTP_STALE",
                        sub.lastHttpStatus,
                    )
                    SyncTelemetry.logAttempt(
                        context,
                        sub.id,
                        bucket = "NeedsAttention",
                        httpStatus = sub.lastHttpStatus,
                        attempt = sub.retryCount,
                        latencyMs = 0,
                        detail = "Stuck >24h on stale NTP, last=${sub.lastErrorCode ?: "unknown"}",
                    )
                    continue
                }
                val nextAt = computeNextRetryAtMillis(attemptCount = (sub.retryCount + 1).coerceAtLeast(1))
                dao.recordRetry(
                    id = sub.id,
                    nowMillis = nowMs,
                    nextRetryAtMillis = nextAt,
                    errorCode = "NTP_STALE",
                    httpStatus = 0,
                )
            }
            return SyncResult()
        }

        val now = System.currentTimeMillis()
        val pending = dao.getPendingDue(workforceId, now)

        for (submission in pending) {
            // If a submission has been pending past the stuck threshold, stop
            // auto-retrying and surface it to the user. They can tap retry.
            // Sentinel `next_retry_at_millis = -1` means the user just tapped
            // Retry on this row — bypass the auto-stop for this single
            // attempt so manual recovery actually works.
            val userInitiated = submission.nextRetryAtMillis == -1L
            if (!userInitiated && submission.createdAtMillis > 0 && now - submission.createdAtMillis > STUCK_THRESHOLD_MS) {
                dao.markNeedsAttention(
                    submission.id,
                    now,
                    submission.lastErrorCode ?: "STUCK_24H",
                    submission.lastHttpStatus,
                )
                SyncTelemetry.logAttempt(
                    context,
                    submission.id,
                    bucket = "NeedsAttention",
                    httpStatus = submission.lastHttpStatus,
                    attempt = submission.retryCount,
                    latencyMs = 0,
                    detail = "Stuck >24h, last=${submission.lastErrorCode ?: "unknown"}",
                )
                continue
            }

            val attempt = submission.retryCount + 1
            val attemptStartedAt = System.currentTimeMillis()
            val outcome = attemptSubmission(submission)
            val latency = System.currentTimeMillis() - attemptStartedAt

            when (outcome) {
                is SyncOutcome.Synced -> {
                    SyncTelemetry.logAttempt(context, submission.id, "Synced", 200, attempt, latency)
                }
                is SyncOutcome.AlreadySynced -> {
                    SyncTelemetry.logAttempt(context, submission.id, "AlreadySynced", 409, attempt, latency)
                }
                is SyncOutcome.SessionExpired -> {
                    SyncTelemetry.logAttempt(context, submission.id, "SessionExpired", 401, attempt, latency)
                    sessionExpired = true
                    break
                }
                is SyncOutcome.Terminated -> {
                    SyncTelemetry.logAttempt(context, submission.id, "Terminated", 403, attempt, latency)
                    terminated = true
                    // Abort the rest of the batch cleanly: the worker will
                    // do a single post-terminate flush, then clear the
                    // session. Continuing the loop would generate more 403s
                    // for the same account on the same already-revoked token.
                    break
                }
                is SyncOutcome.PermanentClientError -> {
                    dao.markPermanentlyRejected(submission.id, outcome.code)
                    SyncTelemetry.logAttempt(
                        context,
                        submission.id,
                        bucket = "PermanentClientError",
                        httpStatus = outcome.httpStatus,
                        attempt = attempt,
                        latencyMs = latency,
                        detail = outcome.code,
                    )
                }
                is SyncOutcome.RetryTransient -> {
                    val nextAt = computeNextRetryAtMillis(attemptCount = attempt)
                    dao.recordRetry(
                        id = submission.id,
                        nowMillis = System.currentTimeMillis(),
                        nextRetryAtMillis = nextAt,
                        errorCode = outcome.reason.take(64),
                        httpStatus = outcome.httpStatus,
                    )
                    SyncTelemetry.logAttempt(
                        context,
                        submission.id,
                        bucket = "RetryTransient",
                        httpStatus = outcome.httpStatus,
                        attempt = attempt,
                        latencyMs = latency,
                        detail = "next=${nextAt - System.currentTimeMillis()}ms — ${outcome.reason}",
                    )
                }
                is SyncOutcome.NeedsAttention -> {
                    dao.markNeedsAttention(
                        submission.id,
                        System.currentTimeMillis(),
                        outcome.code,
                        0,
                    )
                    SyncTelemetry.logAttempt(
                        context,
                        submission.id,
                        bucket = "NeedsAttention",
                        httpStatus = 0,
                        attempt = attempt,
                        latencyMs = latency,
                        detail = "${outcome.code}: ${outcome.detail}",
                    )
                }
            }
        }

        val cutoff = LocalDate.now().minusDays(30).toString()
        dao.purgeOld(workforceId, cutoff)

        // Step 4 (F-17): also auto-purge needs_attention rows older
        // than 90 days so abandoned-account stuck rows do not
        // accumulate forever across multi-season deployments.
        try {
            val stuckCutoff = System.currentTimeMillis() - STUCK_NEEDS_ATTENTION_PURGE_MS
            val deleted = dao.purgeStuckNeedsAttention(workforceId, stuckCutoff)
            if (deleted > 0) {
                SyncTelemetry.logEvent(
                    context,
                    "auto_stuck_purge",
                    "deleted=$deleted cutoff=$stuckCutoff",
                )
            }
        } catch (e: Exception) {
            SyncTelemetry.logEvent(
                context,
                "auto_stuck_purge_failed",
                "${e.javaClass.simpleName}: ${e.message}",
            )
        }

        refreshStatuses()
        return SyncResult(terminated = terminated, sessionExpired = sessionExpired, configChanged = configChanged)
    }

    /**
     * Attempt a single submission. The decrypted plaintext photo is **always**
     * deleted in a `finally` block so we never leak it on disk on any exit
     * path (including thrown exceptions, OOM, app kill mid-attempt).
     */
    private suspend fun attemptSubmission(submission: AttendanceEntity): SyncOutcome {
        var tempFile: File? = null
        var encPhotoPath: String = ""
        return try {
            encPhotoPath = try {
                EncryptionService.decrypt(submission.encryptedPhotoPath)
            } catch (e: Exception) {
                return SyncOutcome.NeedsAttention(
                    "PHOTO_PATH_DECRYPT_FAILED",
                    "${e.javaClass.simpleName}: ${e.message}",
                )
            }
            val encFile = File(encPhotoPath)
            if (!encFile.exists()) {
                return SyncOutcome.NeedsAttention("PHOTO_FILE_MISSING", encPhotoPath)
            }

            tempFile = File.createTempFile("sync_", ".jpg")
            try {
                EncryptionService.decryptFile(encPhotoPath, tempFile.absolutePath)
            } catch (e: SecurityException) {
                return SyncOutcome.NeedsAttention("PHOTO_DECRYPT_FAILED", e.message ?: "")
            } catch (e: java.io.IOException) {
                return SyncOutcome.RetryTransient("Photo IO: ${e.message}")
            }

            val photoBody = tempFile.asRequestBody("image/jpeg".toMediaType())
            val photoPart = MultipartBody.Part.createFormData("photo", "attendance.jpg", photoBody)
            val plainWorkforceId = try {
                EncryptionService.decrypt(submission.workforceId)
            } catch (e: Exception) {
                return SyncOutcome.NeedsAttention("ID_DECRYPT_FAILED", e.message ?: "")
            }
            val textType = "text/plain".toMediaType()

            val token = submission.submissionToken ?: run {
                val newToken = UUID.randomUUID().toString()
                dao.setSubmissionTokenIfMissing(submission.id, newToken)
                newToken
            }

            val response: Response<SubmissionResponse> = try {
                apiService.submitAttendance(
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
            } catch (t: Throwable) {
                return classifyThrowable(t)
            }

            // Inspect the body for terminated/disabled before classifying 403,
            // so the worker-termination path is reached when the server says so.
            var terminatedSignal = false
            val errBodyString = if (!response.isSuccessful) {
                try {
                    response.errorBody()?.string()
                } catch (e: Exception) {
                    SyncTelemetry.logEvent(
                        context,
                        "error_body_read_failed",
                        "id=${submission.id} ${e.javaClass.simpleName}: ${e.message}",
                    )
                    null
                }
            } else null

            if (response.code() == 403) {
                val parsedCode = parseErrorCode(errBodyString)
                if (parsedCode == "BEFORE_SHIFT_WINDOW" || parsedCode == "AFTER_SHIFT_WINDOW") {
                    return SyncOutcome.PermanentClientError(parsedCode, 403)
                }
                if (errBodyString != null && (errBodyString.contains("terminated") || errBodyString.contains("disabled"))) {
                    terminatedSignal = true
                }
            }

            // 422 is the single domain-specific permanent override:
            // "minimum on-shift duration not met" cannot succeed by retrying
            // the same payload, so we mark it permanently rejected instead
            // of consuming backoff slots.
            // 429 is intentionally NOT overridden here — per the task
            // contract it must flow through classifyResponse() and be
            // treated as RetryTransient with exponential backoff, so a
            // server-side throttle never silently drops a submission.
            if (response.code() == 422) {
                return SyncOutcome.PermanentClientError("MIN_DURATION_NOT_MET", 422)
            }

            val outcome = classifyResponse(response, terminatedSignal)
            if (outcome is SyncOutcome.Synced) {
                val body = response.body()
                val sub = body?.submission
                dao.updateSyncResult(
                    submission.id,
                    sub?.status ?: "synced",
                    sub?.id,
                    sub?.flagReason,
                    sub?.rekognitionConfidence,
                )
                deleteEncryptedSourceFile(submission.id, encPhotoPath)
            } else if (outcome is SyncOutcome.AlreadySynced) {
                dao.updateSyncResult(submission.id, "synced", null, null)
                deleteEncryptedSourceFile(submission.id, encPhotoPath)
            } else if (outcome is SyncOutcome.PermanentClientError) {
                deleteEncryptedSourceFile(submission.id, encPhotoPath)
            }
            outcome
        } catch (t: Throwable) {
            classifyThrowable(t)
        } finally {
            // CRITICAL: never leak the decrypted plaintext photo on disk.
            // Delete on every exit path including exceptions, app kill, etc.
            val tf = tempFile
            if (tf != null) {
                try {
                    tf.delete()
                } catch (e: Exception) {
                    SyncTelemetry.logEvent(
                        context,
                        "temp_file_delete_failed",
                        "id=${submission.id} ${e.javaClass.simpleName}: ${e.message}",
                    )
                }
            }
        }
    }

    private fun deleteEncryptedSourceFile(submissionId: String, path: String) {
        if (path.isBlank()) return
        try {
            File(path).delete()
        } catch (e: Exception) {
            SyncTelemetry.logEvent(
                context,
                "enc_file_delete_failed",
                "id=$submissionId ${e.javaClass.simpleName}: ${e.message}",
            )
        }
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
        } catch (e: Exception) {
            SyncTelemetry.logEvent(
                context,
                "refresh_statuses_failed",
                "${e.javaClass.simpleName}: ${e.message}",
            )
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
        } catch (e: Exception) {
            SyncTelemetry.logEvent(
                context,
                "error_code_parse_failed",
                "${e.javaClass.simpleName}: ${e.message}",
            )
            null
        }
    }
}
