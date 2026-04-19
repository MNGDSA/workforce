package com.luxurycarts.workforce.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Image
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.luxurycarts.workforce.R
import com.luxurycarts.workforce.data.ApiClient
import com.luxurycarts.workforce.data.AttendanceDao
import com.luxurycarts.workforce.data.AttendanceEntity
import com.luxurycarts.workforce.data.AttendanceRepository
import com.luxurycarts.workforce.WorkforceApp
import com.luxurycarts.workforce.services.EncryptionService
import com.luxurycarts.workforce.ui.components.StatusBadge
import com.luxurycarts.workforce.ui.theme.Background
import com.luxurycarts.workforce.ui.theme.Border
import com.luxurycarts.workforce.ui.theme.Card
import com.luxurycarts.workforce.ui.theme.CardBorder
import com.luxurycarts.workforce.ui.theme.ErrorRed
import com.luxurycarts.workforce.ui.theme.SuccessGreen
import com.luxurycarts.workforce.ui.theme.Surface
import com.luxurycarts.workforce.ui.theme.TextMuted
import com.luxurycarts.workforce.ui.theme.TextPrimary
import com.luxurycarts.workforce.ui.theme.TextSecondary
import com.luxurycarts.workforce.services.SyncWorker
import com.luxurycarts.workforce.ui.theme.WarningAmber
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun HistoryScreen(
    workforceId: String,
    dao: AttendanceDao,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val submissions by dao.getSubmissions(workforceId).collectAsState(initial = emptyList())

    androidx.compose.runtime.LaunchedEffect(Unit) {
        SyncWorker.syncNow(context)
    }
    var expandedId by remember { mutableStateOf<String?>(null) }
    val decryptedPhotos = remember { mutableStateMapOf<String, String>() }
    val scope = rememberCoroutineScope()

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
            Text(
                stringResource(R.string.attendance_history),
                style = MaterialTheme.typography.titleLarge,
                color = TextPrimary,
                modifier = Modifier.weight(1f),
            )
            Text(
                stringResource(R.string.records_count, submissions.size),
                style = MaterialTheme.typography.bodySmall,
                color = TextMuted,
            )
        }

        if (submissions.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Filled.Image, contentDescription = null, tint = TextMuted, modifier = Modifier.size(48.dp))
                    Spacer(Modifier.height(12.dp))
                    Text(stringResource(R.string.no_attendance_records), color = TextMuted)
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(submissions, key = { it.id }) { item ->
                    HistoryItem(
                        item = item,
                        isExpanded = expandedId == item.id,
                        onToggle = { expandedId = if (expandedId == item.id) null else item.id },
                        onRetry = {
                            scope.launch {
                                val app = WorkforceApp.instance
                                val session = app.sessionManager
                                val wfId = session.workforceId ?: return@launch
                                val serverUrl = session.serverUrl
                                if (serverUrl.isBlank()) return@launch
                                val apiService = ApiClient.create(serverUrl) { cookie ->
                                    session.authCookie = cookie
                                }
                                if (!session.authCookie.isNullOrBlank()) {
                                    ApiClient.restoreCookie(serverUrl, session.authCookie!!)
                                }
                                val repo = AttendanceRepository(
                                    app.database.attendanceDao(),
                                    apiService,
                                    wfId,
                                    app.ntpTimeService,
                                    context.applicationContext,
                                )
                                withContext(Dispatchers.IO) { repo.retryNow(item.id) }
                                // Kick the worker immediately so the user gets fast feedback
                                // instead of waiting for the next periodic cycle.
                                SyncWorker.syncNow(context.applicationContext)
                            }
                        },
                        decryptedPhotoPath = decryptedPhotos[item.id],
                        onLoadPhoto = {
                            scope.launch {
                                try {
                                    val encPath = withContext(Dispatchers.IO) {
                                        EncryptionService.decrypt(item.encryptedPhotoPath)
                                    }
                                    val tempFile = File(context.cacheDir, "preview_${item.id}.jpg")
                                    withContext(Dispatchers.IO) {
                                        EncryptionService.decryptFile(encPath, tempFile.absolutePath)
                                    }
                                    decryptedPhotos[item.id] = tempFile.absolutePath
                                } catch (_: Exception) {}
                            }
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun HistoryItem(
    item: AttendanceEntity,
    isExpanded: Boolean,
    onToggle: () -> Unit,
    onRetry: () -> Unit,
    decryptedPhotoPath: String?,
    onLoadPhoto: () -> Unit,
) {
    val dateFormatted = try {
        LocalDate.parse(item.attendanceDate)
            .format(DateTimeFormatter.ofPattern("EEEE, MMM d, yyyy"))
    } catch (_: Exception) {
        item.attendanceDate
    }

    val timeFormatted = try {
        val decrypted = EncryptionService.decrypt(item.encryptedTimestamp)
        val instant = Instant.parse(decrypted)
        val localTime = instant.atZone(ZoneId.systemDefault()).toLocalTime()
        localTime.format(DateTimeFormatter.ofPattern("hh:mm a"))
    } catch (_: Exception) {
        null
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Card)
            .border(1.dp, CardBorder, RoundedCornerShape(12.dp))
            .clickable(onClick = onToggle),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(dateFormatted, style = MaterialTheme.typography.bodyMedium, color = TextPrimary, fontWeight = FontWeight.SemiBold)
                if (timeFormatted != null) {
                    Text(stringResource(R.string.taken_at, timeFormatted), style = MaterialTheme.typography.bodySmall, color = TextMuted)
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                StatusBadge(status = item.syncStatus)
                if (item.needsAttention) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        stringResource(R.string.needs_attention_label),
                        style = MaterialTheme.typography.labelSmall,
                        color = ErrorRed,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                if (item.staleClock) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        stringResource(R.string.stale_clock_label),
                        style = MaterialTheme.typography.labelSmall,
                        color = WarningAmber,
                    )
                }
            }
        }

        if (item.needsAttention) {
            HorizontalDivider(color = Border)
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item.lastErrorCode?.let {
                    val reason = if (item.lastHttpStatus > 0) "$it (HTTP ${item.lastHttpStatus})" else it
                    Text(
                        stringResource(R.string.needs_attention_reason, reason),
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary,
                    )
                }
                if (item.lastAttemptAtMillis > 0L) {
                    val attemptStr = try {
                        Instant.ofEpochMilli(item.lastAttemptAtMillis)
                            .atZone(ZoneId.systemDefault())
                            .format(DateTimeFormatter.ofPattern("MMM d, hh:mm a"))
                    } catch (_: Exception) { "" }
                    if (attemptStr.isNotEmpty()) {
                        Text(
                            stringResource(R.string.last_sync_attempt, attemptStr),
                            style = MaterialTheme.typography.bodySmall,
                            color = TextMuted,
                        )
                    }
                }
                Button(
                    onClick = onRetry,
                    colors = ButtonDefaults.buttonColors(containerColor = ErrorRed),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.retry_now))
                }
            }
        }

        if (isExpanded) {
            HorizontalDivider(color = Border)
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                item.gpsAccuracy?.let { DetailLine(stringResource(R.string.gps_accuracy), "\u00B1${it.toInt()}m") }
                val hasRekError = item.flagReason?.contains("Face verification error") == true
                val rekLabel = when {
                    item.rekognitionConfidence == null && item.syncStatus == "pending" -> null
                    item.rekognitionConfidence == null -> stringResource(R.string.not_processed)
                    hasRekError -> stringResource(R.string.verification_error)
                    else -> {
                        val conf = item.rekognitionConfidence.toDoubleOrNull() ?: 0.0
                        when {
                            conf >= 95.0 -> stringResource(R.string.identical_confidence, String.format("%.1f", conf))
                            else -> stringResource(R.string.not_identical_confidence, String.format("%.1f", conf))
                        }
                    }
                }
                if (rekLabel != null) {
                    val rekColor = when {
                        rekLabel.contains("Identical") || rekLabel.contains("مطابق") -> SuccessGreen
                        rekLabel.contains("Not identical") || rekLabel.contains("غير مطابق") -> ErrorRed
                        rekLabel == stringResource(R.string.verification_error) -> ErrorRed
                        else -> TextMuted
                    }
                    DetailLine(stringResource(R.string.face_match), rekLabel, rekColor)
                }
                DetailLine(stringResource(R.string.sync_status), item.syncStatus)
                item.serverId?.let { DetailLine(stringResource(R.string.server_id), it.toString()) }
                item.flagReason?.let {
                    val sanitized = it.split(";")
                        .map { r -> r.trim() }
                        .filter { r ->
                            !r.contains("emulator", ignoreCase = true) &&
                            !r.contains("mock", ignoreCase = true) &&
                            !r.contains("spoofing", ignoreCase = true)
                        }
                        .joinToString("; ")
                    if (sanitized.isNotBlank()) {
                        Text(
                            "Flag: $sanitized",
                            style = MaterialTheme.typography.bodySmall,
                            color = ErrorRed,
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(ErrorRed.copy(alpha = 0.1f), RoundedCornerShape(6.dp))
                                .padding(8.dp),
                        )
                    }
                }
                item.reviewNotes?.let {
                    val isRejected = item.syncStatus.lowercase() == "rejected"
                    val noteColor = if (isRejected) ErrorRed else SuccessGreen
                    Text(
                        "${stringResource(R.string.hr_notes)}: $it",
                        style = MaterialTheme.typography.bodySmall,
                        color = noteColor,
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(noteColor.copy(alpha = 0.1f), RoundedCornerShape(6.dp))
                            .padding(8.dp),
                    )
                }
                if (item.retryCount > 0) DetailLine(stringResource(R.string.retries), item.retryCount.toString())

                if (decryptedPhotoPath != null) {
                    AsyncImage(
                        model = File(decryptedPhotoPath),
                        contentDescription = stringResource(R.string.tap_to_view_photo),
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp)
                            .clip(RoundedCornerShape(8.dp)),
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                            .border(1.dp, Border, RoundedCornerShape(8.dp))
                            .clickable(onClick = onLoadPhoto),
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(Icons.Filled.Image, contentDescription = null, tint = TextMuted, modifier = Modifier.size(18.dp))
                            Text(stringResource(R.string.tap_to_view_photo), style = MaterialTheme.typography.bodySmall, color = TextMuted)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailLine(label: String, value: String, valueColor: androidx.compose.ui.graphics.Color = TextSecondary) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = TextMuted)
        Text(value, style = MaterialTheme.typography.bodySmall, color = valueColor, fontWeight = FontWeight.SemiBold)
    }
}
