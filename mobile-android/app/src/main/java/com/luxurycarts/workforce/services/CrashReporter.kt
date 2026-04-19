package com.luxurycarts.workforce.services

import android.content.Context
import android.util.Log
import com.luxurycarts.workforce.BuildConfig

/**
 * Crash & non-fatal reporting abstraction (Task #82, F-10).
 *
 * The interface is wired into [com.luxurycarts.workforce.WorkforceApp.onCreate]
 * and [com.luxurycarts.workforce.data.AttendanceRepository] catch blocks so
 * the production swap to Crashlytics or Sentry is a one-line change in
 * [CrashReporter.install] — no callers need to be touched.
 *
 * Default implementation is [NoOpCrashReporter]: it logs to Android logcat
 * only. This keeps debug builds free of any third-party SDK weight and
 * means a fresh checkout does not require `google-services.json` /
 * Sentry DSN to compile.
 *
 * To enable Crashlytics (preferred — already on Google Play Services):
 *   1. Add the Firebase BOM + `firebase-crashlytics-ktx` dependency in
 *      `app/build.gradle.kts`.
 *   2. Drop `google-services.json` into `app/` (gitignored).
 *   3. Replace [NoOpCrashReporter] below with a `CrashlyticsCrashReporter`
 *      that delegates each method to `FirebaseCrashlytics.getInstance()`.
 *   4. Tag reports with `BuildConfig.VERSION_NAME`, `BuildConfig.VERSION_CODE`,
 *      `BuildConfig.BUILD_TYPE`, and a salted SHA-256 of the employee number
 *      via [setUserHash] — NEVER raw name, phone, or national ID.
 *
 * See `docs/android-release-runbook.md` § Crash & Error Reporting.
 */
interface CrashReporter {
    /** Initialise the underlying SDK. Called once from `Application.onCreate`. */
    fun install(context: Context)

    /** Tag subsequent reports with a non-PII user identifier (hashed). */
    fun setUserHash(employeeNumberHash: String?)

    /** Record a non-fatal exception (e.g. caught in attendance sync). */
    fun recordNonFatal(throwable: Throwable, message: String? = null)

    /** Drop a breadcrumb-style log line for context on the next crash. */
    fun log(message: String)

    companion object {
        @Volatile
        private var current: CrashReporter = NoOpCrashReporter

        fun get(): CrashReporter = current

        /**
         * Swap the active implementation. Call from `WorkforceApp.onCreate`
         * before [CrashReporter.install]. Production swap point for
         * Crashlytics / Sentry — see KDoc on the interface.
         */
        fun setInstance(reporter: CrashReporter) {
            current = reporter
        }
    }
}

/**
 * Default reporter — logs to logcat only. Safe for debug and for production
 * builds that haven't yet been wired to Crashlytics/Sentry. The crash
 * dashboard MUST be in place before the Play Store rollout (F-10).
 */
object NoOpCrashReporter : CrashReporter {
    private const val TAG = "CrashReporter"
    override fun install(context: Context) {
        Log.i(TAG, "NoOp crash reporter active — version=${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
    }
    override fun setUserHash(employeeNumberHash: String?) {
        Log.d(TAG, "setUserHash($employeeNumberHash)")
    }
    override fun recordNonFatal(throwable: Throwable, message: String?) {
        Log.w(TAG, "non-fatal: ${message ?: throwable.message}", throwable)
    }
    override fun log(message: String) {
        Log.d(TAG, message)
    }
}

/**
 * Hash an employee number for use as a non-PII identifier in crash reports.
 * Uses SHA-256 with a build-time-stable salt (the application id) so the
 * hash is consistent across sessions on the same app install but cannot be
 * reversed back to the original employee number.
 */
fun hashEmployeeNumberForCrashes(employeeNumber: String?): String? {
    if (employeeNumber.isNullOrBlank()) return null
    val md = java.security.MessageDigest.getInstance("SHA-256")
    md.update(BuildConfig.APPLICATION_ID.toByteArray(Charsets.UTF_8))
    val digest = md.digest(employeeNumber.toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { "%02x".format(it) }.take(16)
}
