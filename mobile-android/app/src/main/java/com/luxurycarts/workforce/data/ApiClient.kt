package com.luxurycarts.workforce.data

import android.util.Log
import com.luxurycarts.workforce.BuildConfig
import okhttp3.CertificatePinner
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

interface ApiService {

    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>

    @POST("api/auth/reset-password/request")
    suspend fun requestPasswordReset(@Body request: ResetPasswordRequest): Response<ResetPasswordRequestResponse>

    @POST("api/auth/otp/verify")
    suspend fun verifyOtp(@Body request: OtpVerifyRequest): Response<OtpVerifyResponse>

    @POST("api/auth/reset-password")
    suspend fun resetPassword(@Body request: ResetPasswordFinalize): Response<MessageResponse>

    @GET("api/workforce/all-by-candidate/{candidateId}")
    suspend fun getWorkforceRecords(@Path("candidateId") candidateId: String): Response<List<WorkforceRecord>>

    @GET("api/portal/schedule/{workforceId}")
    suspend fun getSchedule(@Path("workforceId") workforceId: String): Response<List<ScheduleEntry>>

    @GET("api/config/mobile")
    suspend fun getMobileConfig(): Response<MobileConfigResponse>

    @GET("api/attendance-mobile/status")
    suspend fun getAttendanceStatus(@Query("workforceId") workforceId: String): Response<AttendanceStatusResponse>

    @Multipart
    @POST("api/attendance-mobile/submit")
    suspend fun submitAttendance(
        @Part("workforceId") workforceId: RequestBody,
        @Part("gpsLat") gpsLat: RequestBody,
        @Part("gpsLng") gpsLng: RequestBody,
        @Part("gpsAccuracy") gpsAccuracy: RequestBody,
        @Part("timestamp") timestamp: RequestBody,
        @Part photo: MultipartBody.Part,
        @Part("mockLocationDetected") mockLocationDetected: RequestBody,
        @Part("isEmulator") isEmulator: RequestBody,
        @Part("rootDetected") rootDetected: RequestBody,
        @Part("locationProvider") locationProvider: RequestBody,
        // Task #84: ADVISORY-ONLY signal. Built from `Build.MANUFACTURER`,
        // `Build.MODEL`, and `Settings.Secure.ANDROID_ID` (see
        // `DeviceTrustManager.getDeviceFingerprint`). Trivially spoofable
        // by any rooted device or Frida hook — the server MUST treat this
        // as a soft correlation hint only, NOT as a security boundary.
        // Replace with Play Integrity / hardware attestation before
        // relying on this for access control. Tracked as follow-up #92.
        @Part("deviceFingerprint") deviceFingerprint: RequestBody,
        @Part("ntpTimestamp") ntpTimestamp: RequestBody,
        @Part("systemClockTimestamp") systemClockTimestamp: RequestBody,
        @Part("lastNtpSyncAt") lastNtpSyncAt: RequestBody,
        @Part("locationSource") locationSource: RequestBody,
        @Part("submissionToken") submissionToken: RequestBody,
    ): Response<SubmissionResponse>

    @GET("api/geofence-zones")
    suspend fun getGeofenceZones(): Response<List<GeofenceZone>>

    @POST("api/attendance-mobile/submissions/statuses")
    suspend fun checkSubmissionStatuses(@Body request: StatusCheckRequest): Response<List<StatusCheckResult>>

    @POST("api/portal/data-erasure-request")
    suspend fun requestDataErasure(@Body request: ErasureRequest): Response<ErasureResponse>

    @GET("api/portal/data-erasure-status")
    suspend fun getErasureStatus(@Query("workforceId") workforceId: String): Response<ErasureStatusResponse>

    @Multipart
    @POST("api/candidates/{candidateId}/documents")
    suspend fun uploadPhoto(
        @Path("candidateId") candidateId: String,
        @Part("docType") docType: RequestBody,
        @Part file: MultipartBody.Part,
    ): Response<PhotoUploadResponse>

    @GET("api/photo-change-requests")
    suspend fun getPhotoChangeRequests(
        @Query("candidateId") candidateId: String,
        @Query("status") status: String? = null,
    ): Response<List<PhotoChangeRequest>>

    @POST("api/excuse-requests")
    suspend fun submitExcuseRequest(@Body request: ExcuseRequestSubmit): Response<ExcuseRequest>

    @GET("api/excuse-requests")
    suspend fun getExcuseRequests(@Query("workforceId") workforceId: String): Response<List<ExcuseRequest>>
}

class PersistentCookieJar(private val onCookieSaved: ((String) -> Unit)? = null) : CookieJar {
    private val store = mutableListOf<Cookie>()

    fun restoreCookie(baseUrl: String, cookieString: String) {
        try {
            val url = baseUrl.toHttpUrlOrNull() ?: return
            val cookie = Cookie.parse(url, cookieString) ?: return
            store.removeAll { it.name == cookie.name && it.domain == cookie.domain }
            store.add(cookie)
        } catch (_: Exception) { }
    }

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        store.removeAll { existing ->
            cookies.any { it.name == existing.name && it.domain == existing.domain }
        }
        store.addAll(cookies)
        val authCookie = cookies.find { it.name == "wf_auth" }
        if (authCookie != null) {
            onCookieSaved?.invoke("wf_auth=${authCookie.value}")
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        store.removeAll { it.expiresAt < System.currentTimeMillis() }
        return store.filter { it.matches(url) }
    }
}

object ApiClient {
    private var currentService: ApiService? = null
    private var currentBaseUrl: String? = null
    private var cookieJar: PersistentCookieJar? = null
    var onSessionTerminated: (() -> Unit)? = null
    @Volatile
    var isSyncInProgress: Boolean = false

    fun create(baseUrl: String, onCookieSaved: ((String) -> Unit)? = null): ApiService {
        if (currentService != null && currentBaseUrl == baseUrl) {
            return currentService!!
        }

        val url = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"

        val jar = PersistentCookieJar(onCookieSaved)
        cookieJar = jar

        val terminationInterceptor = Interceptor { chain ->
            val request = chain.request()
            val isAuthRequest = request.url.encodedPath.contains("/api/auth/")
            val response = chain.proceed(request)
            if (!isAuthRequest && (response.code == 403 || response.code == 401)) {
                val body = response.peekBody(1024).string()
                val terminated = body.contains("terminated") ||
                    body.contains("disabled") ||
                    body.contains("Account is disabled")
                if (terminated) {
                    // Task #43 step 2: previously the interceptor early-
                    // returned when isSyncInProgress was true, which
                    // meant a termination signal observed *during* a
                    // sync batch was silently dropped. We now wait
                    // (bounded) for the in-flight sync to drain so
                    // queued uploads finish *before* credentials are
                    // wiped. Anything still in flight after the
                    // deadline is force-aborted via session.clear() to
                    // avoid an indefinitely-zombied terminated account.
                    awaitSyncCompletion(SYNC_DRAIN_TIMEOUT_MS)
                    onSessionTerminated?.invoke()
                }
            }
            response
        }

        // Step 5 (F-18): snapshot the current locale ONCE at client
        // construction time. A mid-flight language toggle that flips
        // Locale.getDefault() must NOT cause a single sync batch to
        // emit mixed Accept-Language headers (which then produces
        // mixed-locale error messages, mixed-locale flag reasons, and
        // generally confuses the server-side localisation contract).
        // The caller MUST call ApiClient.reset() when the user changes
        // language so the next create() picks up the new locale.
        val snapshotLanguage = when (java.util.Locale.getDefault().language?.lowercase()) {
            "ar" -> "ar"
            else -> "en"
        }
        val localeInterceptor = Interceptor { chain ->
            val req = chain.request().newBuilder()
                .header("Accept-Language", snapshotLanguage)
                .build()
            chain.proceed(req)
        }

        // Task #43 step 1: SSL certificate pinning for the production
        // hostname. Pins are configured via BuildConfig fields populated
        // from gradle.properties so they can be rotated without a code
        // change. We pin the SubjectPublicKeyInfo SHA-256 of the leaf +
        // a backup intermediate so pin-rotation never bricks the field.
        //
        // Defensive fallback: if the pin set is empty (placeholder build
        // or rotation drill), we log a loud warning and proceed
        // unpinned rather than hard-crashing every worker mid-Hajj. The
        // log line is filterable via `adb logcat -s ApiClient` for
        // remote-triage.
        val pinHost = BuildConfig.CERT_PIN_HOST.takeIf { it.isNotBlank() }
        val rawPins = BuildConfig.CERT_PINS
            .split(',')
            .map { it.trim() }
            .filter { it.isNotEmpty() }

        val builder = OkHttpClient.Builder()
            .cookieJar(jar)
            .addInterceptor(localeInterceptor)
            .addInterceptor(terminationInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)

        if (pinHost != null && rawPins.isNotEmpty()) {
            val pinnerBuilder = CertificatePinner.Builder()
            for (pin in rawPins) {
                // Each pin is expected as "sha256/<base64>" per OkHttp
                // contract. We accept either the full string or just
                // the base64 portion for operator convenience.
                val normalized = if (pin.startsWith("sha256/")) pin else "sha256/$pin"
                pinnerBuilder.add(pinHost, normalized)
            }
            builder.certificatePinner(pinnerBuilder.build())
            Log.i("ApiClient", "TLS pinning enabled host=$pinHost pinCount=${rawPins.size}")
        } else {
            Log.w(
                "ApiClient",
                "TLS pinning DISABLED — CERT_PIN_HOST or CERT_PINS empty in BuildConfig. " +
                    "Re-populate gradle.properties (CERT_PIN_HOST, CERT_PINS) before production rollout.",
            )
        }

        val client = builder.build()

        val service = Retrofit.Builder()
            .baseUrl(url)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)

        currentService = service
        currentBaseUrl = baseUrl
        return service
    }

    fun restoreCookie(baseUrl: String, cookieString: String) {
        cookieJar?.restoreCookie(baseUrl, cookieString)
    }

    fun reset() {
        currentService = null
        currentBaseUrl = null
        cookieJar = null
    }

    /**
     * Task #43 step 2: block until any in-flight sync batch completes,
     * up to [timeoutMillis]. Used by the termination interceptor so
     * `session.clear()` never wipes credentials mid-upload. Polling is
     * used in preference to a Mutex/CountDownLatch because the sync
     * flag is already volatile and the wait is short-lived (≤ 5 s).
     */
    fun awaitSyncCompletion(timeoutMillis: Long) {
        if (!isSyncInProgress) return
        val deadline = System.currentTimeMillis() + timeoutMillis
        while (isSyncInProgress && System.currentTimeMillis() < deadline) {
            try {
                Thread.sleep(POLL_INTERVAL_MS)
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
                return
            }
        }
        if (isSyncInProgress) {
            Log.w(
                "ApiClient",
                "awaitSyncCompletion timed out after ${timeoutMillis}ms — proceeding with session clear",
            )
        }
    }

    private const val SYNC_DRAIN_TIMEOUT_MS: Long = 5_000L
    private const val POLL_INTERVAL_MS: Long = 50L
}
