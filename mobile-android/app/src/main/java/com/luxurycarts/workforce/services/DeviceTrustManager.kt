package com.luxurycarts.workforce.services

import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.provider.Settings
import java.io.File

data class DeviceTrustReport(
    val mockLocationDetected: Boolean,
    val isEmulator: Boolean,
    val rootDetected: Boolean,
    val locationProvider: String,
    val deviceFingerprint: String,
    val trustScore: Int,
) {
    val isTrusted: Boolean get() = !mockLocationDetected && !isEmulator && !rootDetected
}

object DeviceTrustManager {

    fun checkEmulator(): Boolean {
        val dominated = listOf(
            Build.FINGERPRINT.startsWith("generic"),
            Build.FINGERPRINT.startsWith("unknown"),
            Build.MODEL.contains("google_sdk"),
            Build.MODEL.contains("Emulator"),
            Build.MODEL.contains("Android SDK built for x86"),
            Build.MANUFACTURER.contains("Genymotion"),
            Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"),
            "google_sdk" == Build.PRODUCT,
            "sdk_gphone" in Build.PRODUCT,
            "vbox86p" in Build.PRODUCT,
            "emulator" in Build.PRODUCT,
            "simulator" in Build.PRODUCT,
            Build.HARDWARE.contains("goldfish"),
            Build.HARDWARE.contains("ranchu"),
            Build.HARDWARE.contains("nox"),
            Build.HARDWARE == "vbox86",
            Build.BOARD.lowercase().contains("nox"),
            Build.BOOTLOADER.lowercase().contains("nox"),
        )
        return dominated.any { it }
    }

    fun checkMockLocation(context: Context, location: Location?): Boolean {
        if (location?.isFromMockProvider == true) return true

        @Suppress("DEPRECATION")
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            try {
                val mockSetting = Settings.Secure.getString(
                    context.contentResolver,
                    Settings.Secure.ALLOW_MOCK_LOCATION
                )
                if (mockSetting == "1") return true
            } catch (_: Exception) { }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (location?.isMock == true) return true
        }

        try {
            val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val providers = lm.allProviders
            for (provider in providers) {
                if (provider.contains("mock", ignoreCase = true)) return true
            }
        } catch (_: Exception) { }

        return false
    }

    fun checkRoot(): Boolean {
        val suPaths = listOf(
            "/system/bin/su", "/system/xbin/su", "/sbin/su",
            "/data/local/xbin/su", "/data/local/bin/su", "/data/local/su",
            "/system/sd/xbin/su", "/system/bin/failsafe/su",
            "/su/bin/su", "/su/bin", "/magisk/.core/bin/su",
        )
        for (path in suPaths) {
            if (File(path).exists()) return true
        }

        val magiskPackages = listOf(
            "com.topjohnwu.magisk",
            "io.github.vvb2060.magisk",
            "de.robv.android.xposed.installer",
            "eu.chainfire.supersu",
            "com.koushikdutta.superuser",
            "com.noshufou.android.su",
            "com.thirdparty.superuser",
        )
        try {
            val pm = Runtime.getRuntime()
            for (pkg in magiskPackages) {
                try {
                    val process = pm.exec(arrayOf("pm", "list", "packages", pkg))
                    val output = process.inputStream.bufferedReader().readText()
                    if (output.contains(pkg)) return true
                } catch (_: Exception) { }
            }
        } catch (_: Exception) { }

        if (Build.TAGS?.contains("test-keys") == true) return true

        try {
            val process = Runtime.getRuntime().exec(arrayOf("which", "su"))
            val output = process.inputStream.bufferedReader().readText()
            if (output.isNotBlank()) return true
        } catch (_: Exception) { }

        return false
    }

    fun getLocationProvider(location: Location?): String {
        return location?.provider ?: "unknown"
    }

    fun getDeviceFingerprint(): String {
        return "${Build.MANUFACTURER}|${Build.MODEL}|${Build.PRODUCT}|${Build.HARDWARE}|${Build.FINGERPRINT.take(80)}"
    }

    fun generateReport(context: Context, location: Location?): DeviceTrustReport {
        val isEmulator = checkEmulator()
        val mockLocation = checkMockLocation(context, location)
        val rootDetected = checkRoot()
        val provider = getLocationProvider(location)
        val fingerprint = getDeviceFingerprint()

        var score = 100
        if (isEmulator) score -= 50
        if (mockLocation) score -= 40
        if (rootDetected) score -= 30
        if (provider == "unknown") score -= 10

        return DeviceTrustReport(
            mockLocationDetected = mockLocation,
            isEmulator = isEmulator,
            rootDetected = rootDetected,
            locationProvider = provider,
            deviceFingerprint = fingerprint,
            trustScore = score.coerceAtLeast(0),
        )
    }
}
