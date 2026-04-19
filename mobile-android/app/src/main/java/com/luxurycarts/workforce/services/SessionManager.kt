package com.luxurycarts.workforce.services

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SessionManager(context: Context) {

    // Task #43 step 5: migrated from the deprecated `MasterKeys.getOrCreate`
    // to the modern `MasterKey.Builder` API. The underlying key material
    // (AES-256-GCM in the AndroidKeyStore) is identical, so existing
    // EncryptedSharedPreferences files keep decrypting without any
    // forced re-key step on upgrade.
    private val masterKey: MasterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "workforce_session",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var serverUrl: String
        get() = prefs.getString("server_url", "") ?: ""
        set(value) = prefs.edit().putString("server_url", value).apply()

    var userJson: String?
        get() = prefs.getString("user_json", null)
        set(value) = prefs.edit().putString("user_json", value).apply()

    var candidateJson: String?
        get() = prefs.getString("candidate_json", null)
        set(value) = prefs.edit().putString("candidate_json", value).apply()

    var workforceId: String?
        get() = prefs.getString("workforce_id", null)
        set(value) = prefs.edit().putString("workforce_id", value).apply()

    var employeeNumber: String?
        get() = prefs.getString("employee_number", null)
        set(value) = prefs.edit().putString("employee_number", value).apply()

    var candidateId: String?
        get() = prefs.getString("candidate_id", null)
        set(value) = prefs.edit().putString("candidate_id", value).apply()

    var loginTimestamp: Long
        get() = prefs.getLong("login_timestamp", 0)
        set(value) = prefs.edit().putLong("login_timestamp", value).apply()

    var authCookie: String?
        get() = prefs.getString("auth_cookie", null)
        set(value) = prefs.edit().putString("auth_cookie", value).apply()

    var cachedIdentifier: String?
        get() = prefs.getString("cached_identifier", null)
        set(value) = prefs.edit().putString("cached_identifier", value).apply()

    var cachedCredential: String?
        get() = prefs.getString("cached_password_hash", null)
        set(value) = prefs.edit().putString("cached_password_hash", value).apply()

    val isSessionValid: Boolean
        get() {
            if (userJson == null) return false
            val elapsed = System.currentTimeMillis() - loginTimestamp
            return elapsed < 7 * 24 * 60 * 60 * 1000
        }

    fun clear() {
        prefs.edit().clear().apply()
    }
}
