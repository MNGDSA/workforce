package com.luxurycarts.workforce.services

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys

class SessionManager(context: Context) {

    private val masterKey = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)

    private val prefs = EncryptedSharedPreferences.create(
        "workforce_session",
        masterKey,
        context,
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

    var loginTimestamp: Long
        get() = prefs.getLong("login_timestamp", 0)
        set(value) = prefs.edit().putLong("login_timestamp", value).apply()

    val isSessionValid: Boolean
        get() {
            if (userJson == null) return false
            val elapsed = System.currentTimeMillis() - loginTimestamp
            return elapsed < 24 * 60 * 60 * 1000
        }

    fun clear() {
        prefs.edit().clear().apply()
    }
}
