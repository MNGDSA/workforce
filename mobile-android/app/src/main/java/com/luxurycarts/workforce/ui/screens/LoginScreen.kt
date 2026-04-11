package com.luxurycarts.workforce.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.luxurycarts.workforce.R
import com.google.gson.Gson
import com.luxurycarts.workforce.WorkforceApp
import com.luxurycarts.workforce.data.ApiClient
import com.luxurycarts.workforce.data.ApiService
import com.luxurycarts.workforce.data.LoginRequest
import com.luxurycarts.workforce.data.User
import com.luxurycarts.workforce.data.WorkforceRecord
import com.luxurycarts.workforce.services.SyncWorker
import com.luxurycarts.workforce.ui.components.WorkforceLogo
import com.luxurycarts.workforce.ui.theme.Background
import com.luxurycarts.workforce.ui.theme.Card
import com.luxurycarts.workforce.ui.theme.CardBorder
import com.luxurycarts.workforce.ui.theme.ErrorRed
import com.luxurycarts.workforce.ui.theme.ForestGreen
import com.luxurycarts.workforce.ui.theme.TextMuted
import com.luxurycarts.workforce.ui.theme.TextPrimary
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    onLoginSuccess: (User, WorkforceRecord?, ApiService) -> Unit,
    onForgotPassword: (ApiService) -> Unit = {},
) {
    val app = WorkforceApp.instance
    val scope = rememberCoroutineScope()

    var serverUrl by remember { mutableStateOf(app.sessionManager.serverUrl.ifEmpty { "https://" }) }
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = ForestGreen,
        unfocusedBorderColor = CardBorder,
        focusedContainerColor = Card,
        unfocusedContainerColor = Card,
        focusedTextColor = TextPrimary,
        unfocusedTextColor = TextPrimary,
        focusedLabelColor = ForestGreen,
        unfocusedLabelColor = TextMuted,
        cursorColor = ForestGreen,
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .padding(32.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            val spaceGrotesk = FontFamily(Font(R.font.space_grotesk_bold, FontWeight.Bold))

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier.fillMaxWidth(),
            ) {
                WorkforceLogo(size = 40.dp)

                Spacer(Modifier.width(10.dp))

                Text(
                    text = "WORKFORCE",
                    fontFamily = spaceGrotesk,
                    fontWeight = FontWeight.Bold,
                    fontSize = 28.sp,
                    color = TextPrimary,
                    letterSpacing = 2.sp,
                )
            }

            Spacer(Modifier.height(16.dp))

            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it },
                label = { Text("Server URL") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                colors = fieldColors,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = identifier,
                onValueChange = { identifier = it },
                label = { Text("ID Number / Phone Number") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                colors = fieldColors,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                colors = fieldColors,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth(),
            )

            errorMessage?.let {
                Text(it, color = ErrorRed, style = MaterialTheme.typography.bodySmall)
            }

            Button(
                onClick = {
                    if (serverUrl.isBlank() || identifier.isBlank() || password.isBlank()) {
                        errorMessage = "All fields are required"
                        return@Button
                    }
                    isLoading = true
                    errorMessage = null
                    scope.launch {
                        try {
                            val api = ApiClient.create(serverUrl.trim()) { cookie ->
                                app.sessionManager.authCookie = cookie
                            }
                            ApiClient.onSessionTerminated = {
                                SyncWorker.cancel(app)
                                app.sessionManager.clear()
                                ApiClient.reset()
                            }
                            val response = api.login(LoginRequest(identifier.trim(), password))
                            if (response.isSuccessful && response.body() != null) {
                                val body = response.body()!!

                                if (body.candidate == null) {
                                    errorMessage = "Access denied. This app is for active employees only."
                                    return@launch
                                }

                                val records = api.getWorkforceRecords(body.candidate.id)
                                val allRecords = if (records.isSuccessful) records.body() ?: emptyList() else emptyList()
                                val activeRecord = allRecords.firstOrNull { it.isActive }

                                if (activeRecord == null) {
                                    errorMessage = "Access denied. No active employment record found. Contact HR if you believe this is an error."
                                    return@launch
                                }

                                app.sessionManager.serverUrl = serverUrl.trim()
                                app.sessionManager.userJson = Gson().toJson(body.user)
                                app.sessionManager.candidateJson = Gson().toJson(body.candidate)
                                app.sessionManager.candidateId = body.candidate.id
                                app.sessionManager.loginTimestamp = System.currentTimeMillis()
                                app.sessionManager.workforceId = activeRecord.id
                                app.sessionManager.employeeNumber = activeRecord.employeeNumber
                                app.sessionManager.cachedIdentifier = identifier.trim()
                                app.sessionManager.cachedCredential = password

                                try {
                                    val configResp = api.getMobileConfig()
                                    if (configResp.isSuccessful) {
                                        val config = configResp.body()
                                        if (config != null) {
                                            app.ntpTimeService.ntpServerUrl = config.ntpServerUrl
                                            app.ntpTimeService.organizationTimezone = config.organizationTimezone
                                            app.ntpTimeService.configVersion = config.configVersion
                                        }
                                    }
                                } catch (_: Exception) { }
                                app.ntpTimeService.syncNtp()

                                onLoginSuccess(body.user, activeRecord, api)
                            } else {
                                errorMessage = "Invalid credentials"
                            }
                        } catch (e: Exception) {
                            errorMessage = "Connection failed: ${e.message?.take(80)}"
                        } finally {
                            isLoading = false
                        }
                    }
                },
                enabled = !isLoading,
                colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth().height(52.dp),
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        color = TextPrimary,
                        strokeWidth = 2.dp,
                        modifier = Modifier.height(20.dp).width(20.dp),
                    )
                } else {
                    Text("Sign In", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                }
            }

            Spacer(Modifier.height(12.dp))

            Text(
                text = "Forgot Password?",
                color = ForestGreen,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .clickable(enabled = serverUrl.length > 8) {
                        val api = try {
                            ApiClient.create(serverUrl.trim().trimEnd('/'))
                        } catch (_: Exception) { null }
                        if (api != null) onForgotPassword(api)
                    },
            )

            Spacer(Modifier.height(16.dp))

            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = "Powered by",
                    fontFamily = spaceGrotesk,
                    fontWeight = FontWeight.Bold,
                    fontSize = 11.sp,
                    color = TextMuted,
                    letterSpacing = 1.sp,
                )
                Spacer(Modifier.height(6.dp))
                Image(
                    painter = painterResource(R.drawable.ic_aws_logo),
                    contentDescription = "AWS Logo",
                    modifier = Modifier.height(28.dp).wrapContentWidth(),
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Amazon AWS Rekognition",
                    fontFamily = spaceGrotesk,
                    fontWeight = FontWeight.Bold,
                    fontSize = 11.sp,
                    color = TextMuted,
                    letterSpacing = 1.sp,
                )
            }
        }
    }
}
