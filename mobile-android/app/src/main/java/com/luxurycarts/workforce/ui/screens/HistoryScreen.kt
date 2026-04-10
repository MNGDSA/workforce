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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.luxurycarts.workforce.data.AttendanceDao
import com.luxurycarts.workforce.data.AttendanceEntity
import com.luxurycarts.workforce.services.EncryptionService
import com.luxurycarts.workforce.ui.components.StatusBadge
import com.luxurycarts.workforce.ui.theme.Background
import com.luxurycarts.workforce.ui.theme.Border
import com.luxurycarts.workforce.ui.theme.Card
import com.luxurycarts.workforce.ui.theme.CardBorder
import com.luxurycarts.workforce.ui.theme.ErrorRed
import com.luxurycarts.workforce.ui.theme.Surface
import com.luxurycarts.workforce.ui.theme.TextMuted
import com.luxurycarts.workforce.ui.theme.TextPrimary
import com.luxurycarts.workforce.ui.theme.TextSecondary
import com.luxurycarts.workforce.services.SyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.time.LocalDate
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
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = TextPrimary)
            }
            Text(
                "Attendance History",
                style = MaterialTheme.typography.titleLarge,
                color = TextPrimary,
                modifier = Modifier.weight(1f),
            )
            Text(
                "${submissions.size} records",
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
                    Text("No attendance records yet", color = TextMuted)
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
    decryptedPhotoPath: String?,
    onLoadPhoto: () -> Unit,
) {
    val dateFormatted = try {
        LocalDate.parse(item.attendanceDate)
            .format(DateTimeFormatter.ofPattern("EEEE, MMM d, yyyy"))
    } catch (_: Exception) {
        item.attendanceDate
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
            }
            StatusBadge(status = item.syncStatus)
        }

        if (isExpanded) {
            HorizontalDivider(color = Border)
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                item.gpsAccuracy?.let { DetailLine("GPS Accuracy", "\u00B1${it.toInt()}m") }
                DetailLine("Sync Status", item.syncStatus)
                item.serverId?.let { DetailLine("Server ID", it.toString()) }
                item.flagReason?.let {
                    Text(
                        "Flag: $it",
                        style = MaterialTheme.typography.bodySmall,
                        color = ErrorRed,
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(ErrorRed.copy(alpha = 0.1f), RoundedCornerShape(6.dp))
                            .padding(8.dp),
                    )
                }
                if (item.retryCount > 0) DetailLine("Retries", item.retryCount.toString())

                if (decryptedPhotoPath != null) {
                    AsyncImage(
                        model = File(decryptedPhotoPath),
                        contentDescription = "Attendance photo",
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
                            Text("Tap to view photo", style = MaterialTheme.typography.bodySmall, color = TextMuted)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailLine(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = TextMuted)
        Text(value, style = MaterialTheme.typography.bodySmall, color = TextSecondary, fontWeight = FontWeight.SemiBold)
    }
}
