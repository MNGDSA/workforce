package com.luxurycarts.workforce.services

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class NtpTimeService(context: Context) {

    private val masterKey = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)

    private val prefs = EncryptedSharedPreferences.create(
        "workforce_ntp",
        masterKey,
        context,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var ntpServerUrl: String
        get() = prefs.getString("ntp_server_url", "time.google.com") ?: "time.google.com"
        set(value) = prefs.edit().putString("ntp_server_url", value).apply()

    var organizationTimezone: String
        get() = prefs.getString("organization_timezone", "Asia/Riyadh") ?: "Asia/Riyadh"
        set(value) = prefs.edit().putString("organization_timezone", value).apply()

    var configVersion: Int
        get() = prefs.getInt("config_version", 0)
        set(value) = prefs.edit().putInt("config_version", value).apply()

    var ntpOffset: Long
        get() = prefs.getLong("ntp_offset", Long.MIN_VALUE)
        private set(value) = prefs.edit().putLong("ntp_offset", value).apply()

    var lastNtpSyncTimestamp: Long
        get() = prefs.getLong("last_ntp_sync_timestamp", 0)
        private set(value) = prefs.edit().putLong("last_ntp_sync_timestamp", value).apply()

    val hasEverSynced: Boolean
        get() = ntpOffset != Long.MIN_VALUE

    /**
     * Returns true if the local NTP offset was last refreshed within the
     * supplied window. Used by the sync pipeline to decide whether a
     * config-fetch failure should still allow new submissions through.
     */
    fun isNtpFresh(thresholdMillis: Long = 6L * 60L * 60L * 1000L): Boolean {
        if (!hasEverSynced) return false
        val ts = lastNtpSyncTimestamp
        if (ts == 0L) return false
        return (System.currentTimeMillis() - ts) <= thresholdMillis
    }

    fun getTrustedInstant(): Instant? {
        if (!hasEverSynced) return null
        val correctedMillis = System.currentTimeMillis() + ntpOffset
        return Instant.ofEpochMilli(correctedMillis)
    }

    fun getSystemClockInstant(): Instant = Instant.now()

    fun getLastNtpSyncInstant(): Instant? {
        val ts = lastNtpSyncTimestamp
        if (ts == 0L) return null
        return Instant.ofEpochMilli(ts)
    }

    suspend fun syncNtp(): Boolean = withContext(Dispatchers.IO) {
        try {
            val ntpTime = queryNtpTime(ntpServerUrl)
            if (ntpTime != null) {
                ntpOffset = ntpTime - System.currentTimeMillis()
                lastNtpSyncTimestamp = System.currentTimeMillis()
                true
            } else {
                false
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun queryNtpTime(server: String): Long? {
        return try {
            val address = InetAddress.getByName(server)
            val socket = DatagramSocket()
            socket.soTimeout = 5000

            val ntpData = ByteArray(48)
            ntpData[0] = 0x1B

            val request = DatagramPacket(ntpData, ntpData.size, address, 123)
            socket.send(request)

            val response = DatagramPacket(ntpData, ntpData.size)
            socket.receive(response)
            socket.close()

            val transmitTimestamp = extractTimestamp(ntpData, 40)
            transmitTimestamp
        } catch (_: Exception) {
            null
        }
    }

    private fun extractTimestamp(data: ByteArray, offset: Int): Long {
        var seconds = 0L
        for (i in 0..3) {
            seconds = (seconds shl 8) or (data[offset + i].toLong() and 0xFF)
        }
        var fraction = 0L
        for (i in 4..7) {
            fraction = (fraction shl 8) or (data[offset + i].toLong() and 0xFF)
        }
        val ntpEpochOffset = 2208988800L
        val milliseconds = ((seconds - ntpEpochOffset) * 1000) + ((fraction * 1000) / 0x100000000L)
        return milliseconds
    }
}
