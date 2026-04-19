package com.luxurycarts.workforce.data

import android.content.Context
import android.util.Log
import java.io.File
import java.io.IOException
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import retrofit2.Response

/**
 * Classification of an attendance-submission sync attempt outcome.
 *
 * The classifier is the single source of truth for "what should we do next?"
 * after each sync attempt. Splitting transient vs permanent failures is the
 * core of the hardened pipeline — there is no longer any silent-catch path.
 */
sealed class SyncOutcome {
    /** Server confirmed the submission. */
    object Synced : SyncOutcome()

    /** Server says we already have it (409). Treat as success, drop temp files. */
    object AlreadySynced : SyncOutcome()

    /** Auth cookie expired (401). Caller should drop session. */
    object SessionExpired : SyncOutcome()

    /** Worker terminated (403 with terminated/disabled body). */
    object Terminated : SyncOutcome()

    /**
     * Permanent server-side rejection (4xx other than 401/403/408/409/429).
     * We mark the row as permanently rejected so we don't loop on it.
     */
    data class PermanentClientError(val code: String, val httpStatus: Int) : SyncOutcome()

    /**
     * Transient failure — schedule a retry with backoff.
     * Includes network errors (no httpStatus), 5xx, 408, 429, decryption failure
     * we believe is recoverable, etc.
     */
    data class RetryTransient(val reason: String, val httpStatus: Int = 0) : SyncOutcome()

    /**
     * The local submission row is broken in a way that cannot be auto-recovered
     * (e.g. encrypted photo file gone from disk, decryption failed, malformed
     * stored ciphertext). Surfaced to the user as "needs manual attention".
     */
    data class NeedsAttention(val code: String, val detail: String) : SyncOutcome()
}

/**
 * Compute the next retry time using exponential backoff with jitter.
 *
 * Base 30 s, doubling per attempt, capped at 1 h, plus ±20% random jitter.
 * Pure function so it can be exercised by a unit test without Android.
 */
fun computeNextRetryAtMillis(
    attemptCount: Int,
    nowMillis: Long = System.currentTimeMillis(),
    baseMillis: Long = 30_000L,
    capMillis: Long = 60L * 60L * 1000L,
    jitterFraction: Double = 0.2,
    randomSource: () -> Double = { Math.random() },
): Long {
    val safeAttempt = attemptCount.coerceAtLeast(1)
    // Avoid Long overflow for large attempt counts.
    val exponent = (safeAttempt - 1).coerceAtMost(30)
    val raw = baseMillis * (1L shl exponent)
    val capped = if (raw <= 0L || raw > capMillis) capMillis else raw
    val jitter = ((randomSource() * 2.0 - 1.0) * jitterFraction)
    val withJitter = (capped * (1.0 + jitter)).toLong().coerceAtLeast(1_000L)
    return nowMillis + withJitter
}

/**
 * Map an HTTP response or thrown exception to a [SyncOutcome] bucket.
 * Used by [AttendanceRepository.syncPending].
 */
fun classifyResponse(response: Response<*>, terminatedSignal: Boolean): SyncOutcome = when {
    response.isSuccessful -> SyncOutcome.Synced
    response.code() == 409 -> SyncOutcome.AlreadySynced
    response.code() == 401 -> SyncOutcome.SessionExpired
    response.code() == 403 && terminatedSignal -> SyncOutcome.Terminated
    response.code() == 408 -> SyncOutcome.RetryTransient("HTTP 408 timeout", 408)
    response.code() == 429 -> SyncOutcome.RetryTransient("HTTP 429 throttled", 429)
    response.code() in 500..599 -> SyncOutcome.RetryTransient("HTTP ${response.code()} server error", response.code())
    else -> SyncOutcome.PermanentClientError("HTTP_${response.code()}", response.code())
}

fun classifyThrowable(t: Throwable): SyncOutcome = when (t) {
    is java.net.UnknownHostException,
    is java.net.SocketTimeoutException,
    is java.net.ConnectException,
    is java.io.InterruptedIOException,
    -> SyncOutcome.RetryTransient("Network: ${t.javaClass.simpleName} ${t.message ?: ""}")
    is IOException -> SyncOutcome.RetryTransient("IO: ${t.javaClass.simpleName} ${t.message ?: ""}")
    is SecurityException -> SyncOutcome.NeedsAttention("DECRYPTION_FAILED", t.message ?: "decryption failed")
    is IllegalStateException -> SyncOutcome.NeedsAttention("LOCAL_STATE", t.message ?: "local state invalid")
    else -> SyncOutcome.RetryTransient("Unknown: ${t.javaClass.simpleName} ${t.message ?: ""}")
}

/**
 * Append-only telemetry for sync attempts. Each line is a single JSON-ish
 * record. The file is rotated when it exceeds [MAX_LOG_BYTES] so it cannot
 * grow unbounded on disk.
 *
 * The user can later export this from Settings > Diagnostics (out of scope
 * for this task — for now Logcat is the primary surface and the file is the
 * fallback when no centralized log pipeline exists).
 */
object SyncTelemetry {
    private const val TAG = "AttendanceSync"
    private const val LOG_FILE = "attendance_sync.log"
    private const val MAX_LOG_BYTES = 256 * 1024L
    // DateTimeFormatter is immutable & thread-safe (unlike SimpleDateFormat).
    private val tsFormat: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSXXX").withZone(ZoneId.systemDefault())
    // Single global lock — file append + rotation must be atomic across the
    // worker thread, the UI thread (user-initiated retry), and any other
    // call site. Without this, concurrent appendText/rotate can interleave
    // and corrupt the log or lose lines.
    private val writeLock = Any()

    private fun nowTs(): String = try {
        tsFormat.format(Instant.now())
    } catch (_: Exception) {
        Instant.now().toString()
    }

    fun logAttempt(
        context: Context?,
        submissionId: String,
        bucket: String,
        httpStatus: Int,
        attempt: Int,
        latencyMs: Long,
        detail: String? = null,
    ) {
        val safeDetail = scrubMessage(detail)
        val line = buildString {
            append('{')
            append("\"ts\":\"").append(nowTs()).append('"')
            append(",\"id\":\"").append(submissionId).append('"')
            append(",\"bucket\":\"").append(bucket).append('"')
            append(",\"http\":").append(httpStatus)
            append(",\"attempt\":").append(attempt)
            append(",\"latencyMs\":").append(latencyMs)
            if (safeDetail != null) {
                append(",\"detail\":\"").append(safeDetail.replace("\"", "'").take(240)).append('"')
            }
            append('}')
        }
        Log.i(TAG, line)
        appendLine(context, line)
    }

    fun logEvent(context: Context?, event: String, detail: String? = null) {
        val safeDetail = scrubMessage(detail)
        val line = buildString {
            append('{')
            append("\"ts\":\"").append(nowTs()).append('"')
            append(",\"event\":\"").append(event).append('"')
            if (safeDetail != null) {
                append(",\"detail\":\"").append(safeDetail.replace("\"", "'").take(240)).append('"')
            }
            append('}')
        }
        Log.i(TAG, line)
        appendLine(context, line)
    }

    /**
     * Task #84: strip locally-identifying or secret-shaped substrings from
     * a telemetry detail before it reaches Logcat or the on-disk log file.
     *
     * Threat model: any `e.message` we forward (typically an
     * [java.io.IOException] or [SecurityException] thrown by the Android
     * crypto / filesystem stack) routinely contains:
     *   - absolute `/data/data/<package>/...` paths that disclose the
     *     internal storage layout to anyone with `adb logcat` access,
     *   - the literal AndroidKeyStore alias `workforce_encryption_key`
     *     which is a useful tell for an attacker triaging device images,
     *   - the EncryptedSharedPreferences master-key alias
     *     `_androidx_security_master_key_`,
     *   - long base64 blobs that may include wrapped key material.
     *
     * The scrub is deliberately permissive (returns the original string
     * unchanged when no sensitive substring matches) so day-to-day
     * debugging is unaffected. The replacement tokens are stable so a
     * developer reading a sanitised log can still recognise the shape of
     * the original error.
     *
     * Marked `@JvmStatic` and exposed at object scope so the pure-JVM
     * unit test in `app/src/test/.../SyncTelemetryScrubTest.kt` can
     * exercise it without Android infrastructure.
     */
    @JvmStatic
    fun scrubMessage(input: String?): String? {
        if (input.isNullOrEmpty()) return input
        var out = input
        // Filesystem paths under /data/data/<pkg>/... and /data/user/0/...
        out = out.replace(Regex("""/data/(?:data|user/\d+)/[\w./\-_]+"""), "[path]")
        // Per-app filesDir/cacheDir absolute paths often surfaced by Room
        // and by File.createTempFile on older OEM ROMs.
        out = out.replace(Regex("""/storage/emulated/\d+/[\w./\-_]+"""), "[ext-path]")
        // Known sensitive Keystore/key aliases.
        out = out.replace("workforce_encryption_key", "[key]")
        out = out.replace("_androidx_security_master_key_", "[mk]")
        // Long base64-shaped blobs (>=48 chars of base64 alphabet) — any
        // wrapped key material, IV+ciphertext blob, or token would match.
        out = out.replace(Regex("""[A-Za-z0-9+/]{48,}={0,2}"""), "[b64]")
        return out
    }

    /**
     * Persisted "last sync result" snapshot, surfaced on Home/History so
     * users always see whether the most recent sync attempt succeeded,
     * failed, or was deferred — independent of whether the device is
     * currently online.
     */
    data class LastSyncResult(
        val timestampMillis: Long,
        val bucket: String,
        val pendingCount: Int,
        val needsAttentionCount: Int,
        val detail: String?,
    )

    private const val PREFS = "sync_state"
    private const val KEY_TS = "last_sync_ts"
    private const val KEY_BUCKET = "last_sync_bucket"
    private const val KEY_PENDING = "last_sync_pending"
    private const val KEY_ATTENTION = "last_sync_attention"
    private const val KEY_DETAIL = "last_sync_detail"

    fun recordLastSyncResult(
        context: Context?,
        bucket: String,
        pendingCount: Int,
        needsAttentionCount: Int,
        detail: String? = null,
    ) {
        if (context == null) return
        try {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putLong(KEY_TS, System.currentTimeMillis())
                .putString(KEY_BUCKET, bucket)
                .putInt(KEY_PENDING, pendingCount)
                .putInt(KEY_ATTENTION, needsAttentionCount)
                .putString(KEY_DETAIL, detail)
                .apply()
        } catch (e: Exception) {
            Log.w(TAG, "recordLastSyncResult failed: ${e.message}")
        }
    }

    fun readLastSyncResult(context: Context?): LastSyncResult? {
        if (context == null) return null
        return try {
            val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val ts = p.getLong(KEY_TS, 0L)
            if (ts == 0L) return null
            LastSyncResult(
                timestampMillis = ts,
                bucket = p.getString(KEY_BUCKET, "unknown") ?: "unknown",
                pendingCount = p.getInt(KEY_PENDING, 0),
                needsAttentionCount = p.getInt(KEY_ATTENTION, 0),
                detail = p.getString(KEY_DETAIL, null),
            )
        } catch (e: Exception) {
            Log.w(TAG, "readLastSyncResult failed: ${e.message}")
            null
        }
    }

    private fun appendLine(context: Context?, line: String) {
        if (context == null) return
        synchronized(writeLock) {
            try {
                val file = File(context.filesDir, LOG_FILE)
                if (file.exists() && file.length() > MAX_LOG_BYTES) {
                    val rotated = File(context.filesDir, "$LOG_FILE.1")
                    if (rotated.exists()) rotated.delete()
                    file.renameTo(rotated)
                }
                file.appendText(line + "\n")
            } catch (e: Exception) {
                Log.w(TAG, "telemetry write failed: ${e.message}")
            }
        }
    }
}
