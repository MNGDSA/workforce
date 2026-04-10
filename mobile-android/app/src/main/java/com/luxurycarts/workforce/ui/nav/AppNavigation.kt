package com.luxurycarts.workforce.ui.nav

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.google.gson.Gson
import com.luxurycarts.workforce.WorkforceApp
import com.luxurycarts.workforce.data.ApiClient
import com.luxurycarts.workforce.data.ApiService
import com.luxurycarts.workforce.data.User
import com.luxurycarts.workforce.data.WorkforceRecord
import com.luxurycarts.workforce.services.SyncWorker
import com.luxurycarts.workforce.ui.components.BiometricDisclosureDialog
import com.luxurycarts.workforce.ui.screens.CaptureScreen
import com.luxurycarts.workforce.ui.screens.HistoryScreen
import com.luxurycarts.workforce.ui.screens.HomeScreen
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

    if (isLoggedIn && user == null) {
        app.sessionManager.userJson?.let {
            user = Gson().fromJson(it, User::class.java)
        }
        if (app.sessionManager.serverUrl.isNotEmpty()) {
            apiService = ApiClient.create(app.sessionManager.serverUrl)
        }
    }

    if (!isLoggedIn) {
        LoginScreen(
            onLoginSuccess = { u, wr, api ->
                user = u
                workforceRecord = wr
                apiService = api
                isLoggedIn = true
                SyncWorker.schedule(app)
            },
        )
    } else {
        NavHost(navController = navController, startDestination = "home") {
            composable("home") {
                HomeScreen(
                    user = user!!,
                    workforceRecord = workforceRecord,
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
                    onLogout = {
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
                    },
                )
            }
            composable("capture") {
                val wfId = workforceRecord?.id ?: app.sessionManager.workforceId ?: ""
                CaptureScreen(
                    workforceId = wfId,
                    dao = app.database.attendanceDao(),
                    apiService = apiService,
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
    }
}
