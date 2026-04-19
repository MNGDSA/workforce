package com.luxurycarts.workforce.services

import java.security.MessageDigest

/**
 * Canonical attendance payload-hash helper (Task #82, F-03 + Play Integrity).
 *
 * The Play Integrity token is bound to the attendance submit by passing
 * the SHA-256 hex of a fixed-order concatenation of the multipart fields
 * as the `nonce`. The server recomputes the same hash in
 * `server/play-integrity.ts :: computeAttendanceNonceHex` and rejects with
 * `INTEGRITY_NONCE_MISMATCH` if the two hexes diverge.
 *
 * The field order, separator, and stringification of [computeHex] MUST
 * stay byte-exactly in sync with the server. Task #89 locks this with
 * paired unit tests (`AttendanceNonceTest` here, `play-integrity.test.ts`
 * on the server) that share the same fixture values.
 */
object AttendanceNonce {
    fun computeHex(
        workforceId: String,
        timestamp: String,
        gpsLat: String,
        gpsLng: String,
        photoSha256Hex: String,
    ): String {
        val canon = listOf(
            workforceId,
            timestamp,
            gpsLat,
            gpsLng,
            photoSha256Hex,
        ).joinToString(separator = "|")
        val md = MessageDigest.getInstance("SHA-256")
        val digest = md.digest(canon.toByteArray(Charsets.UTF_8))
        val sb = StringBuilder(digest.size * 2)
        for (b in digest) {
            val v = b.toInt() and 0xff
            sb.append(HEX[v ushr 4])
            sb.append(HEX[v and 0x0f])
        }
        return sb.toString()
    }

    private val HEX = "0123456789abcdef".toCharArray()
}
