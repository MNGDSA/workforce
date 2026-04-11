package com.luxurycarts.workforce.data

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
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

    @GET("api/workforce/all-by-candidate/{candidateId}")
    suspend fun getWorkforceRecords(@Path("candidateId") candidateId: String): Response<List<WorkforceRecord>>

    @GET("api/portal/schedule/{workforceId}")
    suspend fun getSchedule(@Path("workforceId") workforceId: String): Response<List<ScheduleEntry>>

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
        @Part("locationProvider") locationProvider: RequestBody,
        @Part("deviceFingerprint") deviceFingerprint: RequestBody,
    ): Response<SubmissionResponse>

    @GET("api/geofence-zones")
    suspend fun getGeofenceZones(): Response<List<GeofenceZone>>

    @POST("api/attendance-mobile/submissions/statuses")
    suspend fun checkSubmissionStatuses(@Body request: StatusCheckRequest): Response<List<StatusCheckResult>>

    @POST("api/portal/data-deletion-request")
    suspend fun requestDataDeletion(@Body request: DeletionRequest): Response<DeletionResponse>

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

class InMemoryCookieJar : CookieJar {
    private val store = mutableListOf<Cookie>()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        store.removeAll { existing ->
            cookies.any { it.name == existing.name && it.domain == existing.domain }
        }
        store.addAll(cookies)
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        store.removeAll { it.expiresAt < System.currentTimeMillis() }
        return store.filter { it.matches(url) }
    }
}

object ApiClient {
    private var currentService: ApiService? = null
    private var currentBaseUrl: String? = null

    fun create(baseUrl: String): ApiService {
        if (currentService != null && currentBaseUrl == baseUrl) {
            return currentService!!
        }

        val url = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"

        val client = OkHttpClient.Builder()
            .cookieJar(InMemoryCookieJar())
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

    fun reset() {
        currentService = null
        currentBaseUrl = null
    }
}
