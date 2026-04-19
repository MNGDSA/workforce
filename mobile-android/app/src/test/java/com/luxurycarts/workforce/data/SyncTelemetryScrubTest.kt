package com.luxurycarts.workforce.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Task #84: pure-JVM unit tests for [SyncTelemetry.scrubMessage].
 *
 * No Android, no Robolectric — these run in `./gradlew test` and gate the
 * release build via the standard JUnit 4 runner.
 */
class SyncTelemetryScrubTest {

    @Test
    fun `null input returns null`() {
        assertNull(SyncTelemetry.scrubMessage(null))
    }

    @Test
    fun `empty input returns empty`() {
        assertEquals("", SyncTelemetry.scrubMessage(""))
    }

    @Test
    fun `safe message passes through unchanged`() {
        val input = "HTTP 500 server error attempt=3"
        assertEquals(input, SyncTelemetry.scrubMessage(input))
    }

    @Test
    fun `data data path is redacted`() {
        val input = "open failed: ENOENT /data/data/com.luxurycarts.workforce/files/foo.enc"
        val out = SyncTelemetry.scrubMessage(input)
        assertNotNull(out)
        assertTrue("expected [path] token, got: $out", out!!.contains("[path]"))
        assertTrue("raw path must not survive", !out.contains("/data/data/"))
    }

    @Test
    fun `data user multi-profile path is redacted`() {
        val input = "FileNotFoundException: /data/user/0/com.luxurycarts.workforce/databases/workforce.db"
        val out = SyncTelemetry.scrubMessage(input)!!
        assertTrue(out.contains("[path]"))
        assertTrue(!out.contains("workforce.db"))
    }

    @Test
    fun `external storage path is redacted`() {
        val input = "open: /storage/emulated/0/Android/data/com.luxurycarts.workforce/cache/x.jpg"
        val out = SyncTelemetry.scrubMessage(input)!!
        assertTrue(out.contains("[ext-path]"))
    }

    @Test
    fun `keystore alias is redacted`() {
        val input = "KeyStoreException: workforce_encryption_key not found"
        val out = SyncTelemetry.scrubMessage(input)!!
        assertTrue(out.contains("[key]"))
        assertTrue(!out.contains("workforce_encryption_key"))
    }

    @Test
    fun `master key alias is redacted`() {
        val input = "alias _androidx_security_master_key_ unwrap failed"
        val out = SyncTelemetry.scrubMessage(input)!!
        assertTrue(out.contains("[mk]"))
        assertTrue(!out.contains("_androidx_security_master_key_"))
    }

    @Test
    fun `long base64 blob is redacted`() {
        // 64 base64-alphabet chars
        val blob = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHU="
        val input = "wrapped=$blob trail"
        val out = SyncTelemetry.scrubMessage(input)!!
        assertTrue("expected [b64] token, got: $out", out.contains("[b64]"))
        assertTrue(!out.contains(blob))
    }

    @Test
    fun `combined sensitive substrings are all redacted`() {
        val input = "fail at /data/data/com.x/y.bin alias workforce_encryption_key blob " +
            "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9w"
        val out = SyncTelemetry.scrubMessage(input)!!
        assertTrue(out.contains("[path]"))
        assertTrue(out.contains("[key]"))
        assertTrue(out.contains("[b64]"))
    }

    @Test
    fun `short base64-shaped strings are NOT over-aggressively redacted`() {
        // 32 chars — below 48-char threshold; harmless cookie / id segments
        // should survive scrubbing intact.
        val input = "X-Submission-Token=abcdef0123456789ABCDEF0123456789"
        val out = SyncTelemetry.scrubMessage(input)!!
        assertTrue("short tokens must survive scrubbing, got: $out", out.contains("abcdef0123456789"))
    }
}
