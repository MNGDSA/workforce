package com.luxurycarts.workforce.services

import android.content.Context
import android.util.Log

/**
 * Play Integrity token provider (Task #82, F-03 + Play Integrity).
 *
 * Wraps the Play Integrity API so the rest of the app — specifically the
 * attendance submit pipeline in
 * [com.luxurycarts.workforce.data.AttendanceRepository] — can request a
 * token bound to a per-request payload hash without depending on the
 * concrete Play Services SDK at compile time.
 *
 * Default implementation is [NoOpPlayIntegrityProvider]: it returns
 * `null`, which the server treats as "no token attached". The server's
 * `PLAY_INTEGRITY_ENABLED` env flag is the gate — when false (dev /
 * pre-rollout), submissions without a token are accepted; when true
 * (production after rollout), they are rejected with `INTEGRITY_REQUIRED`.
 *
 * To enable real Play Integrity:
 *   1. Add `com.google.android.play:integrity:<latest>` to
 *      `app/build.gradle.kts`.
 *   2. Implement `RealPlayIntegrityProvider` that calls
 *      `IntegrityManagerFactory.create(context).requestIntegrityToken(
 *          IntegrityTokenRequest.builder()
 *              .setNonce(payloadHash)            // SHA-256 of the multipart body fields
 *              .setCloudProjectNumber(<gcp_project_number>)
 *              .build())`
 *   3. Swap `PlayIntegrityProvider.setInstance(...)` from
 *      `WorkforceApp.onCreate` (debug builds may keep NoOp).
 *   4. Server-side: enable `PLAY_INTEGRITY_ENABLED=true`, set
 *      `PLAY_INTEGRITY_PROJECT_NUMBER`, and provision the service-account
 *      JSON for verdict decoding (see `server/play-integrity.ts` and
 *      `docs/android-release-runbook.md`).
 *
 * The `payloadHash` parameter MUST be the SHA-256 of the canonical
 * concatenation of the multipart fields (workforceId | timestamp |
 * gpsLat | gpsLng | photo bytes hash) so the verdict is bound to the
 * specific attendance payload, defeating replay/forwarding attacks.
 */
interface PlayIntegrityProvider {
    /** True if this provider can return real tokens. NoOp returns false. */
    val isAvailable: Boolean

    /**
     * Request a Play Integrity token bound to [payloadHash]. Returns
     * `null` if the provider is NoOp, the API call fails, or the device
     * is offline. Callers must NOT block on this — call it inline in the
     * submit attempt and let the server reject when required.
     */
    suspend fun requestToken(context: Context, payloadHash: String): String?

    companion object {
        @Volatile
        private var current: PlayIntegrityProvider = NoOpPlayIntegrityProvider

        fun get(): PlayIntegrityProvider = current

        fun setInstance(provider: PlayIntegrityProvider) {
            current = provider
        }
    }
}

object NoOpPlayIntegrityProvider : PlayIntegrityProvider {
    private const val TAG = "PlayIntegrity"
    override val isAvailable: Boolean = false
    override suspend fun requestToken(context: Context, payloadHash: String): String? {
        Log.d(TAG, "NoOp provider — no integrity token attached (payloadHash=$payloadHash)")
        return null
    }
}
