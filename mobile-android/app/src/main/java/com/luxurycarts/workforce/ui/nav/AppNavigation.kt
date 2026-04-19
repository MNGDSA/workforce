package com.luxurycarts.workforce.ui.nav

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.google.gson.Gson
import com.luxurycarts.workforce.SERVER_URL
import com.luxurycarts.workforce.WorkforceApp
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.luxurycarts.workforce.R
import com.luxurycarts.workforce.data.ApiClient
import com.luxurycarts.workforce.data.ApiService
import com.luxurycarts.workforce.data.LoginRequest
import com.luxurycarts.workforce.data.User
import com.luxurycarts.workforce.data.WorkforceRecord
import com.luxurycarts.workforce.services.SyncWorker
import com.luxurycarts.workforce.ui.theme.ErrorRed
import com.luxurycarts.workforce.ui.theme.ForestGreen
import com.luxurycarts.workforce.ui.theme.Surface
import com.luxurycarts.workforce.ui.theme.TextMuted
import com.luxurycarts.workforce.ui.theme.TextPrimary
import com.luxurycarts.workforce.ui.theme.WarningAmber
import com.luxurycarts.workforce.ui.components.BiometricDisclosureDialog
import com.luxurycarts.workforce.ui.screens.CaptureScreen
import com.luxurycarts.workforce.ui.screens.ExcuseRequestScreen
import com.luxurycarts.workforce.ui.screens.HistoryScreen
import com.luxurycarts.workforce.ui.screens.HomeScreen
import com.luxurycarts.workforce.ui.screens.ForgotPasswordScreen
import com.luxurycarts.workforce.ui.screens.LoginScreen
import com.luxurycarts.workforce.ui.screens.MapScreen
import com.luxurycarts.workforce.ui.screens.PrivacyScreen
import kotlinx.coroutines.launch

@Composable
fun AppNavigation() {
    val app = WorkforceApp.instance
    val scope = rememberCoroutineScope()
    val navController = rememberNavController()

    var isLoggedIn by remember { mutableStateOf(app.sessionManager.isSessionValid) }
    var user by remember { mutableStateOf<User?>(null) }
    var workforceRecord by remember { mutableStateOf<WorkforceRecord?>(null) }
    var apiService by remember { mutableStateOf<ApiService?>(null) }
    var showBiometricDisclosure by remember { mutableStateOf(false) }
    var biometricConsentGiven by remember { mutableStateOf(false) }
    var showForgotPassword by remember { mutableStateOf(false) }
    var forgotPasswordApi by remember { mutableStateOf<ApiService?>(null) }
    var showLogoutConfirm by remember { mutableStateOf(false) }
    var logoutPendingCount by remember { mutableStateOf(0) }
    var logoutSyncing by remember { mutableStateOf(false) }

    if (isLoggedIn && user == null) {
        app.sessionManager.userJson?.let {
            user = Gson().fromJson(it, User::class.java)
        }
        val api = ApiClient.create(SERVER_URL) { cookie ->
            app.sessionManager.authCookie = cookie
        }
        ApiClient.onSessionTerminated = {
            SyncWorker.cancel(app)
            app.sessionManager.clear()
            ApiClient.reset()
            isLoggedIn = false
            user = null
            workforceRecord = null
            apiService = null
        }
        val savedCookie = app.sessionManager.authCookie
        if (savedCookie != null) {
            ApiClient.restoreCookie(SERVER_URL, savedCookie)
        }
        apiService = api
    }

    LaunchedEffect(isLoggedIn, apiService) {
        if (isLoggedIn && apiService != null) {
            if (app.sessionManager.authCookie == null) {
                val cachedId = app.sessionManager.cachedIdentifier
                val cachedPw = app.sessionManager.cachedCredential
                if (cachedId != null && cachedPw != null) {
                    try {
                        val resp = apiService!!.login(LoginRequest(cachedId, cachedPw))
                        if (!resp.isSuccessful) {
                            app.sessionManager.clear()
                            ApiClient.reset()
                            isLoggedIn = false
                            user = null
                            workforceRecord = null
                            apiService = null
                            return@LaunchedEffect
                        }
                    } catch (_: Exception) {
                        app.sessionManager.clear()
                        ApiClient.reset()
                        isLoggedIn = false
                        user = null
                        workforceRecord = null
                        apiService = null
                        return@LaunchedEffect
                    }
                } else {
                    app.sessionManager.clear()
                    ApiClient.reset()
                    isLoggedIn = false
                    user = null
                    workforceRecord = null
                    apiService = null
                    return@LaunchedEffect
                }
            }

            if (workforceRecord == null) {
                val candidateId = app.sessionManager.candidateId
                if (candidateId != null) {
                    try {
                        val resp = apiService!!.getWorkforceRecords(candidateId)
                        if (resp.isSuccessful) {
                            val records = resp.body() ?: emptyList()
                            workforceRecord = records.firstOrNull { it.isActive } ?: records.firstOrNull()
                        }
                    } catch (_: Exception) {}
                }
            }
            try {
                val configResp = apiService!!.getMobileConfig()
                if (configResp.isSuccessful) {
                    val config = configResp.body()
                    if (config != null) {
                        app.ntpTimeService.ntpServerUrl = config.ntpServerUrl
                        app.ntpTimeService.organizationTimezone = config.organizationTimezone
                        app.ntpTimeService.configVersion = config.configVersion
                    }
                }
            } catch (_: Exception) {}
            app.ntpTimeService.syncNtp()
        }
    }

    if (!isLoggedIn) {
        if (showForgotPassword) {
            ForgotPasswordScreen(
                apiService = forgotPasswordApi,
                onBack = { showForgotPassword = false },
                onResetComplete = { showForgotPassword = false },
            )
        } else {
            LoginScreen(
                onLoginSuccess = { u, wr, api ->
                    user = u
                    workforceRecord = wr
                    apiService = api
                    isLoggedIn = true
                    wr?.candidateId?.let { app.sessionManager.candidateId = it }
                    SyncWorker.schedule(app)
                },
                onForgotPassword = { api ->
                    forgotPasswordApi = api
                    showForgotPassword = true
                },
            )
        }
    } else {
        NavHost(navController = navController, startDestination = "home") {
            composable("home") {
                HomeScreen(
                    user = user!!,
                    workforceRecord = workforceRecord,
                    apiService = apiService,
                    onWorkforceRefresh = {
                        scope.launch {
                            val cId = app.sessionManager.candidateId ?: return@launch
                            try {
                                val resp = apiService?.getWorkforceRecords(cId)
                                if (resp?.isSuccessful == true) {
                                    val records = resp.body() ?: emptyList()
                                    workforceRecord = records.firstOrNull { it.isActive } ?: records.firstOrNull()
                                }
                            } catch (_: Exception) {}
                        }
                    },
                    onCheckIn = {
                        if (!biometricConsentGiven) {
                            showBiometricDisclosure = true
                        } else {
                            navController.navigate("capture")
                        }
                    },
                    onHistory = { navController.navigate("history") },
                    onMap = { navController.navigate("map") },
                    onPrivacy = { navController.navigate("privacy") },
                    onExcuse = { navController.navigate("excuse") },
                    onLogout = {
                        scope.launch {
                            val wfId = app.sessionManager.workforceId
                            val pending = if (wfId != null) {
                                try { app.database.attendanceDao().getPending(wfId).size } catch (_: Exception) { 0 }
                            } else 0
                            logoutPendingCount = pending
                            showLogoutConfirm = true
                        }
                    },
                )
            }
            composable("capture") {
                val wfId = workforceRecord?.id ?: app.sessionManager.workforceId ?: ""
                CaptureScreen(
                    workforceId = wfId,
                    dao = app.database.attendanceDao(),
                    onComplete = { navController.popBackStack() },
                    onBack = { navController.popBackStack() },
                )
            }
            composable("history") {
                val wfId = workforceRecord?.id ?: app.sessionManager.workforceId ?: ""
                HistoryScreen(
                    workforceId = wfId,
                    dao = app.database.attendanceDao(),
                    onBack = { navController.popBackStack() },
                )
            }
            composable("map") {
                MapScreen(
                    apiService = apiService,
                    onBack = { navController.popBackStack() },
                )
            }
            composable("privacy") {
                val wfId = workforceRecord?.id ?: app.sessionManager.workforceId ?: ""
                PrivacyScreen(
                    workforceId = wfId,
                    apiService = apiService,
                    onBack = { navController.popBackStack() },
                )
            }
            composable("excuse") {
                val wfId = workforceRecord?.id ?: app.sessionManager.workforceId ?: ""
                ExcuseRequestScreen(
                    workforceId = wfId,
                    apiService = apiService,
                    onBack = { navController.popBackStack() },
                )
            }
        }

        if (showBiometricDisclosure) {
            BiometricDisclosureDialog(
                onAccept = {
                    biometricConsentGiven = true
                    showBiometricDisclosure = false
                    navController.navigate("capture")
                },
                onDecline = { showBiometricDisclosure = false },
            )
        }

        if (showLogoutConfirm) {
            val hasPending = logoutPendingCount > 0
            AlertDialog(
                onDismissRequest = {
                    if (!logoutSyncing) {
                        showLogoutConfirm = false
                    }
                },
                containerColor = Surface,
                title = {
                    if (hasPending) {
                        Text(stringResource(R.string.sign_out_blocked_title), color = WarningAmber)
                    } else {
                        Text(stringResource(R.string.sign_out), color = TextPrimary)
                    }
                },
                text = {
                    Column {
                        if (hasPending) {
                            Text(
                                stringResource(R.string.sign_out_blocked_message, logoutPendingCount),
                                color = TextMuted,
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                stringResource(R.string.sign_out_blocked_message_ar, logoutPendingCount),
                                color = TextMuted,
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                stringResource(R.string.sign_out_connect_hint),
                                color = WarningAmber,
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                stringResource(R.string.sign_out_connect_hint_ar),
                                color = WarningAmber,
                            )
                        } else {
                            Text(
                                stringResource(R.string.sign_out_confirm),
                                color = TextMuted,
                            )
                        }
                    }
                },
                confirmButton = {
                    if (hasPending) {
                        TextButton(
                            enabled = !logoutSyncing,
                            onClick = {
                                logoutSyncing = true
                                scope.launch {
                                    try {
                                        SyncWorker.syncNow(app)
                                        kotlinx.coroutines.delay(3000)
                                        val wfId = app.sessionManager.workforceId
                                        val newPending = if (wfId != null) {
                                            try { app.database.attendanceDao().getPending(wfId).size } catch (_: Exception) { logoutPendingCount }
                                        } else 0
                                        logoutPendingCount = newPending
                                        if (newPending == 0) {
                                            showLogoutConfirm = false
                                            app.sessionManager.workforceId?.let { wfId2 ->
                                                app.database.attendanceDao().deleteAllForUser(wfId2)
                                            }
                                            SyncWorker.cancel(app)
                                            ApiClient.reset()
                                            app.sessionManager.clear()
                                            isLoggedIn = false
                                            user = null
                                            workforceRecord = null
                                            apiService = null
                                            biometricConsentGiven = false
                                        }
                                    } catch (_: Exception) {}
                                    logoutSyncing = false
                                }
                            }
                        ) {
                            Text(stringResource(R.string.sync_now), color = ForestGreen)
                        }
                    } else {
                        TextButton(onClick = {
                            showLogoutConfirm = false
                            scope.launch {
                                app.sessionManager.workforceId?.let { wfId ->
                                    app.database.attendanceDao().deleteAllForUser(wfId)
                                }
                            }
                            SyncWorker.cancel(app)
                            ApiClient.reset()
                            app.sessionManager.clear()
                            isLoggedIn = false
                            user = null
                            workforceRecord = null
                            apiService = null
                            biometricConsentGiven = false
                        }) {
                            Text(stringResource(R.string.sign_out), color = ErrorRed)
                        }
                    }
                },
                dismissButton = {
                    TextButton(
                        enabled = !logoutSyncing,
                        onClick = { showLogoutConfirm = false }
                    ) {
                        Text(stringResource(R.string.cancel), color = ForestGreen)
                    }
                },
            )
        }
    }
}
