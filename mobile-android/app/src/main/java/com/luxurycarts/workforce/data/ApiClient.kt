package com.luxurycarts.workforce.data

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
        @Part("deviceFingerprint") deviceFingerprint: RequestBody,
        @Part("ntpTimestamp") ntpTimestamp: RequestBody,
        @Part("systemClockTimestamp") systemClockTimestamp: RequestBody,
        @Part("lastNtpSyncAt") lastNtpSyncAt: RequestBody,
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
            if (!isAuthRequest && !isSyncInProgress && (response.code == 403 || response.code == 401)) {
                val body = response.peekBody(1024).string()
                if (body.contains("terminated") || body.contains("disabled") || body.contains("Account is disabled")) {
                    onSessionTerminated?.invoke()
                }
            }
            response
        }

        val client = OkHttpClient.Builder()
            .cookieJar(jar)
            .addInterceptor(terminationInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .build()

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
}
