package com.luxurycarts.workforce.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.luxurycarts.workforce.R
import com.luxurycarts.workforce.data.ApiService
import com.luxurycarts.workforce.data.OtpVerifyRequest
import com.luxurycarts.workforce.data.ResetPasswordFinalize
import com.luxurycarts.workforce.data.ResetPasswordRequest
import com.luxurycarts.workforce.ui.components.WorkforceLogo
import com.luxurycarts.workforce.ui.theme.Background
import com.luxurycarts.workforce.ui.theme.Card
import com.luxurycarts.workforce.ui.theme.CardBorder
import com.luxurycarts.workforce.ui.theme.ErrorRed
import com.luxurycarts.workforce.ui.theme.ForestGreen
import com.luxurycarts.workforce.ui.theme.SuccessGreen
import com.luxurycarts.workforce.ui.theme.TextMuted
import com.luxurycarts.workforce.ui.theme.TextPrimary
import kotlinx.coroutines.launch

@Composable
fun ForgotPasswordScreen(
    apiService: ApiService?,
    onBack: () -> Unit,
    onResetComplete: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val spaceGrotesk = FontFamily(Font(R.font.space_grotesk_bold, FontWeight.Bold))

    var step by remember { mutableIntStateOf(1) }
    var nationalId by remember { mutableStateOf("") }
    var maskedPhone by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var otpCode by remember { mutableStateOf("") }
    var otpId by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var successMessage by remember { mutableStateOf<String?>(null) }

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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .padding(32.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = TextPrimary)
            }
        }

        Spacer(Modifier.height(24.dp))

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
            modifier = Modifier.fillMaxWidth(),
        ) {
            WorkforceLogo(size = 36.dp)
            Spacer(Modifier.width(10.dp))
            Text(
                text = "WORKFORCE",
                fontFamily = spaceGrotesk,
                fontWeight = FontWeight.Bold,
                fontSize = 24.sp,
                color = TextPrimary,
                letterSpacing = 2.sp,
            )
        }

        Spacer(Modifier.height(32.dp))

        Text(
            text = "Reset Password",
            style = MaterialTheme.typography.titleLarge,
            color = TextPrimary,
            fontWeight = FontWeight.Bold,
        )

        Spacer(Modifier.height(8.dp))

        Text(
            text = when (step) {
                1 -> "Enter your National ID / Iqama number to receive a verification code on your registered phone."
                2 -> "Enter the 6-digit code sent to $maskedPhone"
                3 -> "Create your new password"
                else -> "Password reset complete"
            },
            style = MaterialTheme.typography.bodyMedium,
            color = TextMuted,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 16.dp),
        )

        Spacer(Modifier.height(24.dp))

        errorMessage?.let {
            Text(it, color = ErrorRed, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
        }

        successMessage?.let {
            Text(it, color = SuccessGreen, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
        }

        when (step) {
            1 -> {
                OutlinedTextField(
                    value = nationalId,
                    onValueChange = { nationalId = it },
                    label = { Text("National ID / Iqama Number") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = fieldColors,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                )

                Spacer(Modifier.height(16.dp))

                Button(
                    onClick = {
                        if (nationalId.isBlank()) {
                            errorMessage = "National ID is required"
                            return@Button
                        }
                        isLoading = true
                        errorMessage = null
                        scope.launch {
                            try {
                                val resp = apiService?.requestPasswordReset(
                                    ResetPasswordRequest(nationalId.trim())
                                )
                                if (resp?.isSuccessful == true) {
                                    val body = resp.body()!!
                                    maskedPhone = body.maskedPhone
                                    phone = body.phone ?: ""
                                    step = 2
                                } else {
                                    val errBody = resp?.errorBody()?.string()
                                    errorMessage = try {
                                        com.google.gson.Gson().fromJson(errBody, com.luxurycarts.workforce.data.MessageResponse::class.java).message
                                    } catch (_: Exception) { "Request failed. Please try again." }
                                }
                            } catch (e: Exception) {
                                errorMessage = "Connection error: ${e.message?.take(60)}"
                            } finally {
                                isLoading = false
                            }
                        }
                    },
                    enabled = !isLoading,
                    colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(color = TextPrimary, strokeWidth = 2.dp, modifier = Modifier.height(20.dp).width(20.dp))
                    } else {
                        Text("Send Verification Code", fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            2 -> {
                OutlinedTextField(
                    value = otpCode,
                    onValueChange = { if (it.length <= 6) otpCode = it },
                    label = { Text("6-Digit Code") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = fieldColors,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                )

                Spacer(Modifier.height(16.dp))

                Button(
                    onClick = {
                        if (otpCode.length != 6) {
                            errorMessage = "Please enter the 6-digit code"
                            return@Button
                        }
                        isLoading = true
                        errorMessage = null
                        scope.launch {
                            try {
                                val resp = apiService?.verifyOtp(
                                    OtpVerifyRequest(phone, otpCode.trim())
                                )
                                if (resp?.isSuccessful == true && resp.body()?.success == true) {
                                    val receivedOtpId = resp.body()!!.otpId
                                    if (receivedOtpId.isNullOrBlank()) {
                                        errorMessage = "Verification failed. Please try again."
                                        return@launch
                                    }
                                    otpId = receivedOtpId
                                    step = 3
                                } else {
                                    val errBody = resp?.errorBody()?.string()
                                    errorMessage = try {
                                        com.google.gson.Gson().fromJson(errBody, com.luxurycarts.workforce.data.MessageResponse::class.java).message
                                    } catch (_: Exception) { "Invalid code. Please try again." }
                                }
                            } catch (e: Exception) {
                                errorMessage = "Connection error: ${e.message?.take(60)}"
                            } finally {
                                isLoading = false
                            }
                        }
                    },
                    enabled = !isLoading,
                    colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(color = TextPrimary, strokeWidth = 2.dp, modifier = Modifier.height(20.dp).width(20.dp))
                    } else {
                        Text("Verify Code", fontWeight = FontWeight.SemiBold)
                    }
                }

                Spacer(Modifier.height(12.dp))

                Button(
                    onClick = {
                        otpCode = ""
                        errorMessage = null
                        step = 1
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = CardBorder),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth().height(40.dp),
                ) {
                    Text("Resend Code", fontWeight = FontWeight.SemiBold, color = TextPrimary, fontSize = 13.sp)
                }
            }

            3 -> {
                val pwRules = listOf(
                    Pair(newPassword.length >= 8, "At least 8 characters"),
                    Pair(newPassword.any { it.isUpperCase() }, "One uppercase letter"),
                    Pair(newPassword.any { it.isLowerCase() }, "One lowercase letter"),
                    Pair(newPassword.any { it.isDigit() }, "One number"),
                    Pair(newPassword.any { !it.isLetterOrDigit() }, "One special character"),
                )
                val allRulesMet = pwRules.all { it.first }

                OutlinedTextField(
                    value = newPassword,
                    onValueChange = { newPassword = it },
                    label = { Text("New Password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    colors = fieldColors,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                )

                if (newPassword.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        pwRules.forEach { (met, label) ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Text(
                                    text = if (met) "\u2713" else "\u2717",
                                    color = if (met) SuccessGreen else TextMuted,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    text = label,
                                    color = if (met) SuccessGreen else TextMuted,
                                    fontSize = 12.sp,
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))

                OutlinedTextField(
                    value = confirmPassword,
                    onValueChange = { confirmPassword = it },
                    label = { Text("Confirm New Password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    colors = fieldColors,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                )

                Spacer(Modifier.height(16.dp))

                Button(
                    onClick = {
                        if (!allRulesMet) {
                            errorMessage = "Please meet all password requirements"
                            return@Button
                        }
                        if (newPassword != confirmPassword) {
                            errorMessage = "Passwords do not match"
                            return@Button
                        }
                        isLoading = true
                        errorMessage = null
                        scope.launch {
                            try {
                                val resp = apiService?.resetPassword(
                                    ResetPasswordFinalize(nationalId.trim(), otpId, newPassword)
                                )
                                if (resp?.isSuccessful == true) {
                                    successMessage = resp.body()?.message ?: "Password reset successfully"
                                    step = 4
                                } else {
                                    val errBody = resp?.errorBody()?.string()
                                    errorMessage = try {
                                        com.google.gson.Gson().fromJson(errBody, com.luxurycarts.workforce.data.MessageResponse::class.java).message
                                    } catch (_: Exception) { "Reset failed. Please try again." }
                                }
                            } catch (e: Exception) {
                                errorMessage = "Connection error: ${e.message?.take(60)}"
                            } finally {
                                isLoading = false
                            }
                        }
                    },
                    enabled = !isLoading && allRulesMet && newPassword == confirmPassword && confirmPassword.isNotEmpty(),
                    colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(color = TextPrimary, strokeWidth = 2.dp, modifier = Modifier.height(20.dp).width(20.dp))
                    } else {
                        Text("Reset Password", fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            4 -> {
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = onResetComplete,
                    colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                ) {
                    Text("Back to Login", fontWeight = FontWeight.SemiBold)
                }
            }
        }

        Spacer(Modifier.height(32.dp))
    }
}
