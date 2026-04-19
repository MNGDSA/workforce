package com.luxurycarts.workforce.services

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Task #89: lock the canonical attendance payload-hash output so the
 * device side cannot silently drift from the server's
 * `computeAttendanceNonceHex` (in `server/play-integrity.ts`).
 *
 * The fixture below is shared byte-for-byte with the server-side test
 * `server/__tests__/play-integrity.test.ts`. Any change to field order,
 * separator, or stringification on either side will break BOTH tests in
 * CI — that is intentional. Update both fixtures together or not at all.
 */
class AttendanceNonceTest {

    @Test
    fun `canonical hash matches the locked fixture`() {
        val hex = AttendanceNonce.computeHex(
            workforceId = FIXTURE_WORKFORCE_ID,
            timestamp = FIXTURE_TIMESTAMP,
            gpsLat = FIXTURE_GPS_LAT,
            gpsLng = FIXTURE_GPS_LNG,
            photoSha256Hex = FIXTURE_PHOTO_SHA,
        )
        assertEquals(FIXTURE_EXPECTED_HEX, hex)
    }

    @Test
    fun `empty photo hash still produces a stable hex`() {
        val hex = AttendanceNonce.computeHex(
            workforceId = FIXTURE_WORKFORCE_ID,
            timestamp = FIXTURE_TIMESTAMP,
            gpsLat = FIXTURE_GPS_LAT,
            gpsLng = FIXTURE_GPS_LNG,
            photoSha256Hex = "",
        )
        assertEquals(FIXTURE_EXPECTED_HEX_NO_PHOTO, hex)
    }

    companion object {
        // Shared fixture — keep in sync with server/__tests__/play-integrity.test.ts.
        const val FIXTURE_WORKFORCE_ID = "WF-12345"
        const val FIXTURE_TIMESTAMP = "2026-04-19T12:34:56.000Z"
        const val FIXTURE_GPS_LAT = "24.7136"
        const val FIXTURE_GPS_LNG = "46.6753"
        const val FIXTURE_PHOTO_SHA = "deadbeef"

        const val FIXTURE_EXPECTED_HEX =
            "2ddadb358339424b7aa8317f5401ceb241ef2e05df0b1c97ba5e005c95acfcba"
        const val FIXTURE_EXPECTED_HEX_NO_PHOTO =
            "4d8463b2ea0c7c74a31d638b5eaeef648775a356ba9dbedec635798b3230b79a"
    }
}
