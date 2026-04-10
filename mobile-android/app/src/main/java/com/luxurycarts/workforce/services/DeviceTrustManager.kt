package com.luxurycarts.workforce.services

import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.provider.Settings

data class DeviceTrustReport(
    val mockLocationDetected: Boolean,
    val isEmulator: Boolean,
    val locationProvider: String,
    val deviceFingerprint: String,
    val trustScore: Int,
) {
    val isTrusted: Boolean get() = !mockLocationDetected && !isEmulator
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

    fun getLocationProvider(location: Location?): String {
        return location?.provider ?: "unknown"
    }

    fun getDeviceFingerprint(): String {
        return "${Build.MANUFACTURER}|${Build.MODEL}|${Build.PRODUCT}|${Build.HARDWARE}|${Build.FINGERPRINT.take(80)}"
    }

    fun generateReport(context: Context, location: Location?): DeviceTrustReport {
        val isEmulator = checkEmulator()
        val mockLocation = checkMockLocation(context, location)
        val provider = getLocationProvider(location)
        val fingerprint = getDeviceFingerprint()

        var score = 100
        if (isEmulator) score -= 50
        if (mockLocation) score -= 40
        if (provider == "unknown") score -= 10

        return DeviceTrustReport(
            mockLocationDetected = mockLocation,
            isEmulator = isEmulator,
            locationProvider = provider,
            deviceFingerprint = fingerprint,
            trustScore = score.coerceAtLeast(0),
        )
    }
}
