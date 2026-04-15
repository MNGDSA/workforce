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
import androidx.compose.ui.res.stringResource
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

    val nationalIdRequired = stringResource(R.string.national_id_required)
    val enterSixDigit = stringResource(R.string.enter_six_digit)
    val verificationFailed = stringResource(R.string.verification_failed)
    val invalidCode = stringResource(R.string.invalid_code)
    val passwordRequirements = stringResource(R.string.password_requirements)
    val passwordsNotMatch = stringResource(R.string.passwords_not_match)
    val passwordResetSuccess = stringResource(R.string.password_reset_success)
    val resetFailed = stringResource(R.string.reset_failed)

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
                Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.back), tint = TextPrimary)
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
                text = stringResource(R.string.app_name),
                fontFamily = spaceGrotesk,
                fontWeight = FontWeight.Bold,
                fontSize = 24.sp,
                color = TextPrimary,
                letterSpacing = 2.sp,
            )
        }

        Spacer(Modifier.height(32.dp))

        Text(
            text = stringResource(R.string.reset_password),
            style = MaterialTheme.typography.titleLarge,
            color = TextPrimary,
            fontWeight = FontWeight.Bold,
        )

        Spacer(Modifier.height(8.dp))

        Text(
            text = when (step) {
                1 -> stringResource(R.string.enter_national_id_hint)
                2 -> stringResource(R.string.enter_code_hint, maskedPhone)
                3 -> stringResource(R.string.create_new_password)
                else -> stringResource(R.string.password_reset_complete)
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
                    label = { Text(stringResource(R.string.national_id_iqama)) },
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
                            errorMessage = nationalIdRequired
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
                                    } catch (_: Exception) { resetFailed }
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
                        Text(stringResource(R.string.send_verification_code), fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            2 -> {
                OutlinedTextField(
                    value = otpCode,
                    onValueChange = { if (it.length <= 6) otpCode = it },
                    label = { Text(stringResource(R.string.six_digit_code)) },
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
                            errorMessage = enterSixDigit
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
                                        errorMessage = verificationFailed
                                        return@launch
                                    }
                                    otpId = receivedOtpId
                                    step = 3
                                } else {
                                    val errBody = resp?.errorBody()?.string()
                                    errorMessage = try {
                                        com.google.gson.Gson().fromJson(errBody, com.luxurycarts.workforce.data.MessageResponse::class.java).message
                                    } catch (_: Exception) { invalidCode }
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
                        Text(stringResource(R.string.verify_code), fontWeight = FontWeight.SemiBold)
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
                    Text(stringResource(R.string.resend_code), fontWeight = FontWeight.SemiBold, color = TextPrimary, fontSize = 13.sp)
                }
            }

            3 -> {
                val pwRules = listOf(
                    Pair(newPassword.length >= 8, stringResource(R.string.at_least_8_chars)),
                    Pair(newPassword.any { it.isUpperCase() }, stringResource(R.string.one_uppercase)),
                    Pair(newPassword.any { it.isLowerCase() }, stringResource(R.string.one_lowercase)),
                    Pair(newPassword.any { it.isDigit() }, stringResource(R.string.one_number)),
                    Pair(newPassword.any { !it.isLetterOrDigit() }, stringResource(R.string.one_special)),
                )
                val allRulesMet = pwRules.all { it.first }

                OutlinedTextField(
                    value = newPassword,
                    onValueChange = { newPassword = it },
                    label = { Text(stringResource(R.string.new_password)) },
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
                    label = { Text(stringResource(R.string.confirm_new_password)) },
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
                            errorMessage = passwordRequirements
                            return@Button
                        }
                        if (newPassword != confirmPassword) {
                            errorMessage = passwordsNotMatch
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
                                    successMessage = resp.body()?.message ?: passwordResetSuccess
                                    step = 4
                                } else {
                                    val errBody = resp?.errorBody()?.string()
                                    errorMessage = try {
                                        com.google.gson.Gson().fromJson(errBody, com.luxurycarts.workforce.data.MessageResponse::class.java).message
                                    } catch (_: Exception) { resetFailed }
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
                        Text(stringResource(R.string.reset_password), fontWeight = FontWeight.SemiBold)
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
                    Text(stringResource(R.string.back_to_login), fontWeight = FontWeight.SemiBold)
                }
            }
        }

        Spacer(Modifier.height(32.dp))
    }
}
