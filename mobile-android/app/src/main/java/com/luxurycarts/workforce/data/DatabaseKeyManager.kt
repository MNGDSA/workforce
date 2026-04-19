package com.luxurycarts.workforce.data

import android.content.Context
import android.util.Base64
import com.luxurycarts.workforce.services.EncryptionService
import java.security.SecureRandom

/**
 * Generates and persists the SQLCipher passphrase used to encrypt the local
 * Room database (`workforce.db`).
 *
 * Threat model: a stolen device with USB debugging enabled, an `adb backup`
 * dump, or a forensic `/data/data` extraction must not yield decrypted
 * attendance rows (timestamps, lat/lng, encrypted-photo paths). The Room
 * payload is already field-encrypted by [EncryptionService], but database-
 * level encryption closes the residual leakage of indices, sqlite_master
 * schema, row counts, and any column we forgot to wrap.
 *
 * Storage layout:
 *   - The on-disk artefact is a regular [android.content.SharedPreferences]
 *     value containing a Base64 string.
 *   - That string is the AES-256-GCM-wrapped form of a 32-byte random
 *     passphrase, sealed with the AndroidKeyStore-resident key
 *     `workforce_encryption_key` managed by [EncryptionService].
 *
 * The keystore key never leaves the secure element / TEE on devices that
 * support it, so even a full `/data/data` dump cannot recover the
 * passphrase without the device hardware. See
 * `mobile-android/docs/keystore-rotation.md` for the rotation runbook.
 */
internal object DatabaseKeyManager {
    private const val PREFS = "db_key_state"
    private const val KEY_WRAPPED = "wrapped_passphrase_v1"
    private const val PASSPHRASE_LEN = 32

    /**
     * Returns the raw 32-byte SQLCipher passphrase. Generated on first call
     * and persisted (wrapped) for every subsequent cold start.
     *
     * The returned [ByteArray] is consumed by `SupportFactory`, which zeroes
     * it after use, so callers must not retain the reference.
     */
    fun getOrCreatePassphrase(context: Context): ByteArray {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val wrapped = prefs.getString(KEY_WRAPPED, null)
        if (wrapped != null) {
            return Base64.decode(EncryptionService.decrypt(wrapped), Base64.NO_WRAP)
        }
        val raw = ByteArray(PASSPHRASE_LEN).also { SecureRandom().nextBytes(it) }
        val encoded = Base64.encodeToString(raw, Base64.NO_WRAP)
        val sealed = EncryptionService.encrypt(encoded)
        prefs.edit().putString(KEY_WRAPPED, sealed).apply()
        return raw
    }

    /**
     * Test/diagnostics helper: true iff a passphrase has already been
     * generated and persisted. Read-only — does NOT trigger generation.
     */
    fun hasPassphrase(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .contains(KEY_WRAPPED)
}
