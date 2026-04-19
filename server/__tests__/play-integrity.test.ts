// Task #89: lock the canonical attendance payload-hash output so the
// server's `computeAttendanceNonceHex` cannot silently drift from the
// device-side helper in
// `mobile-android/app/src/main/java/com/luxurycarts/workforce/services/AttendanceNonce.kt`.
//
// The fixture below is shared byte-for-byte with the device-side test
// `AttendanceNonceTest`. Any change to field order, separator, or
// stringification on either side will break BOTH tests in CI — that is
// intentional. Update both fixtures together or not at all.
//
// Run with: `npx tsx --test server/__tests__/play-integrity.test.ts`

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { computeAttendanceNonceHex } from "../play-integrity";

// Shared fixture — keep in sync with
// mobile-android/app/src/test/java/com/luxurycarts/workforce/services/AttendanceNonceTest.kt
const FIXTURE_WORKFORCE_ID = "WF-12345";
const FIXTURE_TIMESTAMP = "2026-04-19T12:34:56.000Z";
const FIXTURE_GPS_LAT = "24.7136";
const FIXTURE_GPS_LNG = "46.6753";
const FIXTURE_PHOTO_SHA = "deadbeef";

const FIXTURE_EXPECTED_HEX =
  "2ddadb358339424b7aa8317f5401ceb241ef2e05df0b1c97ba5e005c95acfcba";
const FIXTURE_EXPECTED_HEX_NO_PHOTO =
  "4d8463b2ea0c7c74a31d638b5eaeef648775a356ba9dbedec635798b3230b79a";

describe("computeAttendanceNonceHex", () => {
  it("matches the locked fixture for the full payload", () => {
    const hex = computeAttendanceNonceHex({
      workforceId: FIXTURE_WORKFORCE_ID,
      timestamp: FIXTURE_TIMESTAMP,
      gpsLat: FIXTURE_GPS_LAT,
      gpsLng: FIXTURE_GPS_LNG,
      photoSha256Hex: FIXTURE_PHOTO_SHA,
    });
    assert.equal(hex, FIXTURE_EXPECTED_HEX);
  });

  it("treats omitted photoSha256Hex as the empty string", () => {
    const withEmpty = computeAttendanceNonceHex({
      workforceId: FIXTURE_WORKFORCE_ID,
      timestamp: FIXTURE_TIMESTAMP,
      gpsLat: FIXTURE_GPS_LAT,
      gpsLng: FIXTURE_GPS_LNG,
      photoSha256Hex: "",
    });
    const omitted = computeAttendanceNonceHex({
      workforceId: FIXTURE_WORKFORCE_ID,
      timestamp: FIXTURE_TIMESTAMP,
      gpsLat: FIXTURE_GPS_LAT,
      gpsLng: FIXTURE_GPS_LNG,
    });
    assert.equal(withEmpty, FIXTURE_EXPECTED_HEX_NO_PHOTO);
    assert.equal(omitted, FIXTURE_EXPECTED_HEX_NO_PHOTO);
  });

  it("stringifies numeric gps coordinates the same way as the device", () => {
    const stringHex = computeAttendanceNonceHex({
      workforceId: FIXTURE_WORKFORCE_ID,
      timestamp: FIXTURE_TIMESTAMP,
      gpsLat: FIXTURE_GPS_LAT,
      gpsLng: FIXTURE_GPS_LNG,
      photoSha256Hex: FIXTURE_PHOTO_SHA,
    });
    const numericHex = computeAttendanceNonceHex({
      workforceId: FIXTURE_WORKFORCE_ID,
      timestamp: FIXTURE_TIMESTAMP,
      gpsLat: 24.7136,
      gpsLng: 46.6753,
      photoSha256Hex: FIXTURE_PHOTO_SHA,
    });
    assert.equal(stringHex, FIXTURE_EXPECTED_HEX);
    assert.equal(numericHex, FIXTURE_EXPECTED_HEX);
  });
});
