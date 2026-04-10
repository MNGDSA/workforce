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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.luxurycarts.workforce.data.ApiService
import com.luxurycarts.workforce.data.DeletionRequest
import com.luxurycarts.workforce.ui.theme.Background
import com.luxurycarts.workforce.ui.theme.Border
import com.luxurycarts.workforce.ui.theme.Card
import com.luxurycarts.workforce.ui.theme.CardBorder
import com.luxurycarts.workforce.ui.theme.ErrorRed
import com.luxurycarts.workforce.ui.theme.ForestGreen
import com.luxurycarts.workforce.ui.theme.SuccessGreen
import com.luxurycarts.workforce.ui.theme.Surface
import com.luxurycarts.workforce.ui.theme.TextMuted
import com.luxurycarts.workforce.ui.theme.TextPrimary
import com.luxurycarts.workforce.ui.theme.TextSecondary
import kotlinx.coroutines.launch

@Composable
fun PrivacyScreen(
    workforceId: String,
    apiService: ApiService?,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var password by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var isSubmitting by remember { mutableStateOf(false) }
    var resultMessage by remember { mutableStateOf<String?>(null) }
    var isError by remember { mutableStateOf(false) }

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
            .background(Background),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Surface)
                .padding(top = 48.dp, bottom = 16.dp, start = 16.dp, end = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = TextPrimary)
            }
            Text("Privacy & Data", style = MaterialTheme.typography.titleLarge, color = TextPrimary)
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Privacy Policy", style = MaterialTheme.typography.titleMedium, color = TextPrimary)

            val policyItems = listOf(
                "Data Collection" to "We collect attendance photos, GPS coordinates, and timestamps solely for workforce management purposes.",
                "Data Encryption" to "All sensitive data is encrypted on your device using AES-256-GCM before transmission. Photos are encrypted at rest.",
                "Data Storage" to "Your data is stored securely on company servers and on your device. Local data older than 30 days is automatically purged.",
                "Data Access" to "Only authorized HR personnel and system administrators can access your attendance records.",
                "Your Rights" to "You may request deletion of your personal data at any time using the form below.",
            )

            policyItems.forEach { (title, description) ->
                Column {
                    Text(title, style = MaterialTheme.typography.labelLarge, color = TextSecondary, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(4.dp))
                    Text(description, style = MaterialTheme.typography.bodySmall, color = TextMuted)
                }
            }

            HorizontalDivider(color = Border, modifier = Modifier.padding(vertical = 8.dp))

            Text("Request Data Deletion", style = MaterialTheme.typography.titleMedium, color = TextPrimary)
            Text(
                "Submit a request to permanently delete all your personal data from company systems.",
                style = MaterialTheme.typography.bodySmall,
                color = TextMuted,
            )

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Confirm Password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                colors = fieldColors,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it },
                label = { Text("Reason (optional)") },
                minLines = 2,
                maxLines = 4,
                colors = fieldColors,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth(),
            )

            resultMessage?.let {
                Text(
                    it,
                    color = if (isError) ErrorRed else SuccessGreen,
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            Button(
                onClick = {
                    if (password.isBlank()) {
                        resultMessage = "Password is required"
                        isError = true
                        return@Button
                    }
                    isSubmitting = true
                    resultMessage = null
                    scope.launch {
                        try {
                            val response = apiService?.requestDataDeletion(
                                DeletionRequest(workforceId, password = password, reason = reason.ifBlank { "User requested deletion" })
                            )
                            if (response?.isSuccessful == true) {
                                resultMessage = response.body()?.message ?: "Request submitted successfully"
                                isError = false
                                password = ""
                                reason = ""
                            } else {
                                resultMessage = "Request failed. Check your password."
                                isError = true
                            }
                        } catch (e: Exception) {
                            resultMessage = "Connection error: ${e.message?.take(60)}"
                            isError = true
                        } finally {
                            isSubmitting = false
                        }
                    }
                },
                enabled = !isSubmitting,
                colors = ButtonDefaults.buttonColors(containerColor = ErrorRed),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                if (isSubmitting) {
                    CircularProgressIndicator(color = TextPrimary, strokeWidth = 2.dp, modifier = Modifier.height(20.dp).width(20.dp))
                } else {
                    Text("Submit Deletion Request", fontWeight = FontWeight.SemiBold)
                }
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}
