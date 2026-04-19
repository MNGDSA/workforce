package com.luxurycarts.workforce

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import coil.request.CachePolicy
import com.luxurycarts.workforce.data.AppDatabase
import com.luxurycarts.workforce.services.CrashReporter
import com.luxurycarts.workforce.services.NtpTimeService
import com.luxurycarts.workforce.services.SessionManager
import com.luxurycarts.workforce.services.hashEmployeeNumberForCrashes

class WorkforceApp : Application(), ImageLoaderFactory {

    lateinit var database: AppDatabase
        private set

    lateinit var sessionManager: SessionManager
        private set

    lateinit var ntpTimeService: NtpTimeService
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        database = AppDatabase.getInstance(this)
        sessionManager = SessionManager(this)
        ntpTimeService = NtpTimeService(this)

        // Task #82, F-10: install crash reporter (NoOp by default; the
        // Crashlytics/Sentry swap happens here without touching callers).
        // The non-PII user tag is set the moment a session is restored
        // so any crash before the user re-logs in is still attributable.
        CrashReporter.get().install(this)
        CrashReporter.get().setUserHash(
            hashEmployeeNumberForCrashes(sessionManager.employeeNumber)
        )
    }

    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
        .memoryCache {
            MemoryCache.Builder(this)
                .maxSizePercent(0.25)
                .build()
        }
        .diskCache {
            DiskCache.Builder()
                .directory(cacheDir.resolve("image_cache"))
                .maxSizeBytes(50L * 1024 * 1024)
                .build()
        }
        .memoryCachePolicy(CachePolicy.ENABLED)
        .diskCachePolicy(CachePolicy.ENABLED)
        .respectCacheHeaders(true)
        .crossfade(true)
        .build()

    companion object {
        lateinit var instance: WorkforceApp
            private set
    }
}
