package com.luxurycarts.workforce.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.HourglassTop
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.luxurycarts.workforce.R
import com.luxurycarts.workforce.data.ApiService
import com.luxurycarts.workforce.data.ExcuseRequest
import com.luxurycarts.workforce.data.ExcuseRequestSubmit
import com.luxurycarts.workforce.ui.theme.Background
import com.luxurycarts.workforce.ui.theme.CardBorder
import com.luxurycarts.workforce.ui.theme.ErrorRed
import com.luxurycarts.workforce.ui.theme.ForestGreen
import com.luxurycarts.workforce.ui.theme.InfoBlue
import com.luxurycarts.workforce.ui.theme.SuccessGreen
import com.luxurycarts.workforce.ui.theme.Surface
import com.luxurycarts.workforce.ui.theme.TextMuted
import com.luxurycarts.workforce.ui.theme.TextPrimary
import com.luxurycarts.workforce.ui.theme.TextSecondary
import com.luxurycarts.workforce.ui.theme.WarningAmber
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable
fun ExcuseRequestScreen(
    workforceId: String,
    apiService: ApiService?,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var excuseRequests by remember { mutableStateOf<List<ExcuseRequest>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var showSubmitDialog by remember { mutableStateOf(false) }
    var submitReason by remember { mutableStateOf("") }
    var isSubmitting by remember { mutableStateOf(false) }
    var submitError by remember { mutableStateOf<String?>(null) }
    var submitSuccess by remember { mutableStateOf<String?>(null) }

    fun loadRequests() {
        if (apiService == null || workforceId.isEmpty()) {
            isLoading = false
            return
        }
        scope.launch {
            isLoading = true
            try {
                val resp = apiService.getExcuseRequests(workforceId)
                if (resp.isSuccessful) {
                    excuseRequests = (resp.body() ?: emptyList())
                        .sortedByDescending { it.submittedAt ?: it.date }
                }
            } catch (_: Exception) {}
            isLoading = false
        }
    }

    LaunchedEffect(workforceId) { loadRequests() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 48.dp, start = 8.dp, end = 16.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.back),
                    tint = TextPrimary,
                )
            }
            Text(
                stringResource(R.string.excuse_requests),
                style = MaterialTheme.typography.titleLarge,
                color = TextPrimary,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            Button(
                onClick = {
                    submitReason = ""
                    submitError = null
                    submitSuccess = null
                    showSubmitDialog = true
                },
                colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                shape = RoundedCornerShape(8.dp),
            ) {
                Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text(stringResource(R.string.new_label), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            }
        }

        if (isLoading) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = ForestGreen)
            }
        } else if (excuseRequests.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize().padding(32.dp),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Filled.CalendarToday,
                        contentDescription = null,
                        tint = TextMuted,
                        modifier = Modifier.size(48.dp),
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        stringResource(R.string.no_excuse_requests),
                        style = MaterialTheme.typography.titleMedium,
                        color = TextSecondary,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        stringResource(R.string.excuse_empty_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = TextMuted,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                excuseRequests.forEach { request ->
                    ExcuseRequestCard(request)
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }

    if (submitSuccess != null) {
        Spacer(Modifier.height(0.dp))
    }

    val pleaseProvideReason = stringResource(R.string.please_provide_reason)
    val notConnected = stringResource(R.string.not_connected)
    val partialMidShift = stringResource(R.string.partial_mid_shift)
    val fullDayStr = stringResource(R.string.full_day)
    val submitFailedStr = stringResource(R.string.submit_failed)

    if (showSubmitDialog) {
        AlertDialog(
            onDismissRequest = {
                if (!isSubmitting) showSubmitDialog = false
            },
            containerColor = Surface,
            title = {
                Text(stringResource(R.string.request_excuse), color = TextPrimary, fontWeight = FontWeight.Bold)
            },
            text = {
                Column {
                    Text(
                        stringResource(R.string.excuse_today_info, LocalDate.now().format(DateTimeFormatter.ofPattern("MMM d, yyyy"))),
                        style = MaterialTheme.typography.bodySmall,
                        color = TextMuted,
                    )
                    Spacer(Modifier.height(16.dp))
                    OutlinedTextField(
                        value = submitReason,
                        onValueChange = { submitReason = it },
                        label = { Text(stringResource(R.string.reason), color = TextMuted) },
                        placeholder = { Text(stringResource(R.string.reason_placeholder), color = TextMuted.copy(alpha = 0.5f)) },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 3,
                        maxLines = 5,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextSecondary,
                            focusedBorderColor = ForestGreen,
                            unfocusedBorderColor = CardBorder,
                            cursorColor = ForestGreen,
                        ),
                        enabled = !isSubmitting,
                    )
                    if (submitError != null) {
                        Spacer(Modifier.height(8.dp))
                        Text(submitError!!, style = MaterialTheme.typography.bodySmall, color = ErrorRed)
                    }
                    if (submitSuccess != null) {
                        Spacer(Modifier.height(8.dp))
                        Text(submitSuccess!!, style = MaterialTheme.typography.bodySmall, color = SuccessGreen)
                    }
                }
            },
            confirmButton = {
                if (submitSuccess != null) {
                    Button(
                        onClick = { showSubmitDialog = false },
                        colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                    ) {
                        Text(stringResource(R.string.done))
                    }
                } else {
                    Button(
                        onClick = {
                            if (submitReason.isBlank()) {
                                submitError = pleaseProvideReason
                                return@Button
                            }
                            if (apiService == null || workforceId.isEmpty()) {
                                submitError = notConnected
                                return@Button
                            }
                            scope.launch {
                                isSubmitting = true
                                submitError = null
                                try {
                                    val today = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE)
                                    val resp = apiService.submitExcuseRequest(
                                        ExcuseRequestSubmit(
                                            workforceId = workforceId,
                                            date = today,
                                            reason = submitReason.trim(),
                                        )
                                    )
                                    if (resp.isSuccessful) {
                                        val body = resp.body()
                                        val typeText = if (body?.hadClockIn == true) partialMidShift else fullDayStr
                                        submitSuccess = "Excuse request submitted ($typeText). HR will review it."
                                        loadRequests()
                                    } else {
                                        val errBody = try { resp.errorBody()?.string() } catch (_: Exception) { null }
                                        val msg = try {
                                            val obj = com.google.gson.Gson().fromJson(errBody, com.google.gson.JsonObject::class.java)
                                            obj?.get("message")?.asString
                                        } catch (_: Exception) { null }
                                        submitError = msg ?: submitFailedStr
                                    }
                                } catch (e: Exception) {
                                    submitError = "Network error: ${e.message}"
                                }
                                isSubmitting = false
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                        enabled = !isSubmitting,
                    ) {
                        if (isSubmitting) {
                            CircularProgressIndicator(
                                color = TextPrimary,
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                            )
                            Spacer(Modifier.width(8.dp))
                        }
                        Icon(Icons.Filled.Send, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(stringResource(R.string.submit))
                    }
                }
            },
            dismissButton = {
                if (submitSuccess == null) {
                    TextButton(
                        onClick = { showSubmitDialog = false },
                        enabled = !isSubmitting,
                    ) {
                        Text(stringResource(R.string.cancel), color = TextMuted)
                    }
                }
            },
        )
    }
}

@Composable
private fun ExcuseRequestCard(request: ExcuseRequest) {
    val statusColor = when (request.status) {
        "approved" -> SuccessGreen
        "rejected" -> ErrorRed
        else -> WarningAmber
    }
    val statusIcon = when (request.status) {
        "approved" -> Icons.Filled.CheckCircle
        "rejected" -> Icons.Filled.Cancel
        else -> Icons.Filled.HourglassTop
    }
    val statusLabel = when (request.status) {
        "approved" -> stringResource(R.string.approved)
        "rejected" -> stringResource(R.string.rejected)
        else -> stringResource(R.string.pending)
    }

    val dateFormatted = try {
        LocalDate.parse(request.date).format(DateTimeFormatter.ofPattern("MMM d, yyyy"))
    } catch (_: Exception) {
        request.date
    }

    val typeLabel = if (request.hadClockIn) stringResource(R.string.partial_label) else stringResource(R.string.full_day_label)
    val typeColor = if (request.hadClockIn) InfoBlue else WarningAmber

    Card(
        colors = CardDefaults.cardColors(containerColor = Surface),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Filled.CalendarToday,
                        contentDescription = null,
                        tint = TextMuted,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        dateFormatted,
                        style = MaterialTheme.typography.titleMedium,
                        color = TextPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .background(statusColor.copy(alpha = 0.1f), RoundedCornerShape(6.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                ) {
                    Icon(
                        statusIcon,
                        contentDescription = null,
                        tint = statusColor,
                        modifier = Modifier.size(14.dp),
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        statusLabel,
                        style = MaterialTheme.typography.labelSmall,
                        color = statusColor,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            Spacer(Modifier.height(8.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .background(typeColor, CircleShape),
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    typeLabel,
                    style = MaterialTheme.typography.labelMedium,
                    color = typeColor,
                )
                if (request.hadClockIn && request.effectiveClockOut != null) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        stringResource(R.string.left_at, request.effectiveClockOut),
                        style = MaterialTheme.typography.labelSmall,
                        color = TextMuted,
                    )
                }
            }

            Spacer(Modifier.height(8.dp))

            Text(
                request.reason,
                style = MaterialTheme.typography.bodySmall,
                color = TextSecondary,
                maxLines = 3,
            )

            if (request.status == "rejected" && !request.reviewNotes.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                Card(
                    colors = CardDefaults.cardColors(containerColor = ErrorRed.copy(alpha = 0.1f)),
                    shape = RoundedCornerShape(6.dp),
                ) {
                    Text(
                        stringResource(R.string.review_reason, request.reviewNotes),
                        style = MaterialTheme.typography.bodySmall,
                        color = ErrorRed,
                        modifier = Modifier.padding(8.dp),
                    )
                }
            }

            if (request.status == "approved" && !request.reviewNotes.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                Card(
                    colors = CardDefaults.cardColors(containerColor = SuccessGreen.copy(alpha = 0.1f)),
                    shape = RoundedCornerShape(6.dp),
                ) {
                    Text(
                        stringResource(R.string.review_note, request.reviewNotes),
                        style = MaterialTheme.typography.bodySmall,
                        color = SuccessGreen,
                        modifier = Modifier.padding(8.dp),
                    )
                }
            }
        }
    }
}
