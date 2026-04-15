package com.luxurycarts.workforce.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.HourglassTop
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.AlertDialog
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
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.luxurycarts.workforce.R
import com.luxurycarts.workforce.data.ApiService
import com.luxurycarts.workforce.data.ErasureRequest
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
    var reason by remember { mutableStateOf("") }
    var isSubmitting by remember { mutableStateOf(false) }
    var resultMessage by remember { mutableStateOf<String?>(null) }
    var isError by remember { mutableStateOf(false) }
    var hasPendingRequest by remember { mutableStateOf(false) }
    var isLoadingStatus by remember { mutableStateOf(true) }
    var showConfirmDialog by remember { mutableStateOf(false) }
    var showSubmittedSuccess by remember { mutableStateOf(false) }

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

    val erasureAlreadyPending = stringResource(R.string.erasure_already_pending)
    val requestFailedStr = stringResource(R.string.request_failed)

    LaunchedEffect(workforceId) {
        if (workforceId.isNotEmpty() && apiService != null) {
            try {
                val resp = apiService.getErasureStatus(workforceId)
                if (resp.isSuccessful) {
                    hasPendingRequest = resp.body()?.hasPendingRequest == true
                }
            } catch (_: Exception) {}
            isLoadingStatus = false
        } else {
            isLoadingStatus = false
        }
    }

    if (showConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showConfirmDialog = false },
            containerColor = Card,
            titleContentColor = TextPrimary,
            textContentColor = TextSecondary,
            title = { Text(stringResource(R.string.confirm_data_erasure)) },
            text = {
                Text(stringResource(R.string.confirm_erasure_body))
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showConfirmDialog = false
                        isSubmitting = true
                        resultMessage = null
                        scope.launch {
                            try {
                                val response = apiService?.requestDataErasure(
                                    ErasureRequest(workforceId, reason = reason.ifBlank { null })
                                )
                                if (response?.isSuccessful == true) {
                                    showSubmittedSuccess = true
                                    hasPendingRequest = true
                                    reason = ""
                                } else {
                                    val errorBody = response?.errorBody()?.string()
                                    val msg = if (response?.code() == 409) {
                                        erasureAlreadyPending
                                    } else {
                                        errorBody ?: requestFailedStr
                                    }
                                    resultMessage = msg
                                    isError = true
                                    if (response?.code() == 409) hasPendingRequest = true
                                }
                            } catch (e: Exception) {
                                resultMessage = "Connection error: ${e.message?.take(60)}"
                                isError = true
                            } finally {
                                isSubmitting = false
                            }
                        }
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = ErrorRed),
                ) { Text(stringResource(R.string.submit_request)) }
            },
            dismissButton = {
                TextButton(
                    onClick = { showConfirmDialog = false },
                    colors = ButtonDefaults.textButtonColors(contentColor = TextMuted),
                ) { Text(stringResource(R.string.cancel)) }
            },
        )
    }

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
                Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.back), tint = TextPrimary)
            }
            Text(stringResource(R.string.privacy_data), style = MaterialTheme.typography.titleLarge, color = TextPrimary)
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(stringResource(R.string.privacy_policy), style = MaterialTheme.typography.titleMedium, color = TextPrimary)

            val policyItems = listOf(
                stringResource(R.string.data_collection) to stringResource(R.string.data_collection_desc),
                stringResource(R.string.data_encryption) to stringResource(R.string.data_encryption_desc),
                stringResource(R.string.data_storage) to stringResource(R.string.data_storage_desc),
                stringResource(R.string.data_access) to stringResource(R.string.data_access_desc),
                stringResource(R.string.your_rights) to stringResource(R.string.your_rights_desc),
            )

            policyItems.forEach { (title, description) ->
                Column {
                    Text(title, style = MaterialTheme.typography.labelLarge, color = TextSecondary, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(4.dp))
                    Text(description, style = MaterialTheme.typography.bodySmall, color = TextMuted)
                }
            }

            HorizontalDivider(color = Border, modifier = Modifier.padding(vertical = 8.dp))

            Text(stringResource(R.string.request_data_erasure), style = MaterialTheme.typography.titleMedium, color = TextPrimary)
            Text(
                stringResource(R.string.data_erasure_info),
                style = MaterialTheme.typography.bodySmall,
                color = TextMuted,
            )

            if (isLoadingStatus) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    CircularProgressIndicator(color = ForestGreen, strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
                }
            } else if (hasPendingRequest) {
                if (showSubmittedSuccess) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFF1A2E1A), RoundedCornerShape(8.dp))
                            .border(1.dp, SuccessGreen, RoundedCornerShape(8.dp))
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            stringResource(R.string.erasure_submitted),
                            style = MaterialTheme.typography.bodySmall,
                            color = SuccessGreen,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF2D2A1F), RoundedCornerShape(8.dp))
                        .border(1.dp, Color(0xFF8B7E3A), RoundedCornerShape(8.dp))
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.HourglassTop, stringResource(R.string.pending), tint = Color(0xFFD4A843), modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(12.dp))
                    Text(
                        stringResource(R.string.erasure_pending),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFFD4A843),
                    )
                }
            } else {
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    label = { Text(stringResource(R.string.reason_optional)) },
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
                    onClick = { showConfirmDialog = true },
                    enabled = !isSubmitting,
                    colors = ButtonDefaults.buttonColors(containerColor = ErrorRed),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                ) {
                    if (isSubmitting) {
                        CircularProgressIndicator(color = TextPrimary, strokeWidth = 2.dp, modifier = Modifier.height(20.dp).width(20.dp))
                    } else {
                        Text(stringResource(R.string.submit_data_erasure), fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Card, RoundedCornerShape(8.dp))
                    .border(1.dp, CardBorder, RoundedCornerShape(8.dp))
                    .padding(12.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Icon(Icons.Filled.Info, stringResource(R.string.privacy), tint = TextMuted, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    stringResource(R.string.compliance_info),
                    style = MaterialTheme.typography.bodySmall,
                    color = TextMuted,
                )
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}
