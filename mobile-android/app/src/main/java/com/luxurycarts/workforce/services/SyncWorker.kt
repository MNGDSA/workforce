package com.luxurycarts.workforce.services

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.luxurycarts.workforce.WorkforceApp
import com.luxurycarts.workforce.data.ApiClient
import com.luxurycarts.workforce.data.AttendanceRepository
import com.luxurycarts.workforce.data.SyncTelemetry
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class SyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as WorkforceApp
        val session = app.sessionManager
        val ntpService = app.ntpTimeService

        // Step 3 (F-16): cookie-restore-before-work gate. Force the
        // EncryptedSharedPreferences-backed session manager to fully
        // initialize before we touch any network code, so a cold-start
        // worker never races against in-flight key unwrapping and fires
        // an un-authenticated request that returns 401 → "session expired".
        awaitAuthCookieRestored(session)

        if (!session.isSessionValid || session.workforceId == null) {
            return Result.failure()
        }

        val snapshotWorkforceId = session.workforceId!!

        // Step 1 (F-07): process-wide single-flight guard keyed off the
        // workforceId. Even if the periodic and immediate unique work
        // names somehow co-execute, this mutex serialises them inside the
        // process so the manual-retry sentinel
        // (next_retry_at_millis = -1) is never observed by two workers
        // simultaneously and clearNeedsAttention can't be silently
        // overwritten by an overlapping recordRetry.
        val mutex = syncMutexes.getOrPut(snapshotWorkforceId) { Mutex() }
        return mutex.withLock {
            runSync(app, session, ntpService, snapshotWorkforceId)
        }
    }

    private suspend fun runSync(
        app: WorkforceApp,
        session: com.luxurycarts.workforce.services.SessionManager,
        ntpService: NtpTimeService,
        snapshotWorkforceId: String,
    ): Result {
        val apiService = ApiClient.create(com.luxurycarts.workforce.SERVER_URL) { cookie ->
            session.authCookie = cookie
        }
        if (session.authCookie != null) {
            ApiClient.restoreCookie(com.luxurycarts.workforce.SERVER_URL, session.authCookie!!)
        }

        ApiClient.isSyncInProgress = true
        try {
            return doSyncWork(app, session, ntpService, apiService, snapshotWorkforceId)
        } finally {
            ApiClient.isSyncInProgress = false
        }
    }

    /**
     * Touch the auth cookie under the EncryptedSharedPreferences master key
     * so that any first-time AndroidKeyStore unwrap completes synchronously
     * before any network request leaves the device. This makes the
     * cookie-restore order explicit and observable in tests.
     */
    private fun awaitAuthCookieRestored(session: SessionManager) {
        // Reading authCookie forces EncryptedSharedPreferences to fully
        // initialise (open the keystore, derive the AES-GCM key, decrypt
        // the prefs file). If the read returns null we still proceed — the
        // session validity check below will short-circuit cleanly.
        @Suppress("UNUSED_VARIABLE")
        val cookie = session.authCookie
    }

    private suspend fun doSyncWork(
        app: WorkforceApp,
        session: com.luxurycarts.workforce.services.SessionManager,
        ntpService: NtpTimeService,
        apiService: com.luxurycarts.workforce.data.ApiService,
        workforceId: String,
    ): Result {
        var isTerminated = false

        try {
            val configResp = apiService.getMobileConfig()
            if (configResp.isSuccessful) {
                val config = configResp.body()
                if (config != null) {
                    ntpService.ntpServerUrl = config.ntpServerUrl
                    ntpService.organizationTimezone = config.organizationTimezone
                    ntpService.configVersion = config.configVersion
                }
            } else if (configResp.code() == 403 || configResp.code() == 401) {
                isTerminated = true
            } else {
                // Non-success but not auth — keep existing config, log it.
                SyncTelemetry.logEvent(
                    applicationContext,
                    "worker_config_fetch_non_success",
                    "http=${configResp.code()}",
                )
            }
        } catch (e: Exception) {
            SyncTelemetry.logEvent(
                applicationContext,
                "worker_config_fetch_failed",
                "${e.javaClass.simpleName}: ${e.message}",
            )
        }

        val sixHoursMs = 6 * 60 * 60 * 1000L
        val sinceLastSync = System.currentTimeMillis() - ntpService.lastNtpSyncTimestamp
        if (sinceLastSync >= sixHoursMs || !ntpService.hasEverSynced) {
            ntpService.syncNtp()
        }

        val dao = app.database.attendanceDao()
        val repository = AttendanceRepository(dao, apiService, workforceId, ntpService, applicationContext)

        if (isTerminated) {
            val remaining = dao.getPending(workforceId)
            if (remaining.isNotEmpty()) {
                try {
                    repository.syncPending()
                } catch (e: Exception) {
                    SyncTelemetry.logEvent(
                        applicationContext,
                        "worker_terminated_flush_failed",
                        "${e.javaClass.simpleName}: ${e.message}",
                    )
                }
            }
            session.clear()
            ApiClient.reset()
            return Result.failure()
        }

        return try {
            val syncResult = repository.syncPending()
            val pendingNow = dao.getPending(workforceId).size
            val attentionNow = dao.getNeedsAttentionCountSync(workforceId)
            val bucket = when {
                syncResult.sessionExpired -> "session_expired"
                syncResult.terminated -> "terminated"
                pendingNow == 0 -> "ok"
                else -> "partial"
            }
            SyncTelemetry.recordLastSyncResult(
                applicationContext,
                bucket,
                pendingNow,
                attentionNow,
            )
            when {
                syncResult.sessionExpired -> {
                    session.clear()
                    ApiClient.reset()
                    Result.failure()
                }
                syncResult.terminated -> {
                    val remaining = dao.getPending(workforceId)
                    if (remaining.isNotEmpty()) {
                        try {
                            repository.syncPending()
                        } catch (e: Exception) {
                            SyncTelemetry.logEvent(
                                applicationContext,
                                "worker_post_terminate_flush_failed",
                                "${e.javaClass.simpleName}: ${e.message}",
                            )
                        }
                    }
                    session.clear()
                    ApiClient.reset()
                    Result.failure()
                }
                else -> Result.success()
            }
        } catch (e: Exception) {
            SyncTelemetry.logEvent(
                applicationContext,
                "worker_sync_failed",
                "${e.javaClass.simpleName}: ${e.message}",
            )
            SyncTelemetry.recordLastSyncResult(
                applicationContext,
                bucket = "failed",
                pendingCount = try { dao.getPending(workforceId).size } catch (_: Exception) { -1 },
                needsAttentionCount = try { dao.getNeedsAttentionCountSync(workforceId) } catch (_: Exception) { -1 },
                detail = "${e.javaClass.simpleName}: ${e.message}",
            )
            Result.retry()
        }
    }

    companion object {
        private const val PERIODIC_WORK_NAME = "attendance_sync_periodic"
        private const val IMMEDIATE_WORK_NAME = "attendance_sync_immediate"

        // Step 1 (F-07): process-wide mutex registry keyed by workforceId.
        // ConcurrentHashMap so concurrent first-touch from periodic and
        // immediate workers cannot race on the lookup itself.
        private val syncMutexes = ConcurrentHashMap<String, Mutex>()

        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<SyncWorker>(
                15, TimeUnit.MINUTES,
            )
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }

        fun syncNow(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                IMMEDIATE_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK_NAME)
            WorkManager.getInstance(context).cancelUniqueWork(IMMEDIATE_WORK_NAME)
        }
    }
}
