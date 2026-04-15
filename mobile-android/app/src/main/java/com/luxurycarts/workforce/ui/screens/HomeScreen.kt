package com.luxurycarts.workforce.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import java.io.File
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.HourglassTop
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.EventBusy
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.luxurycarts.workforce.R
import coil.request.ImageRequest
import com.luxurycarts.workforce.WorkforceApp
import com.luxurycarts.workforce.data.ApiService
import com.luxurycarts.workforce.data.User
import com.luxurycarts.workforce.data.WorkforceRecord
import com.luxurycarts.workforce.ui.theme.Background
import com.luxurycarts.workforce.ui.theme.CardBorder
import com.luxurycarts.workforce.ui.theme.ForestGreen
import com.luxurycarts.workforce.ui.theme.Surface
import com.luxurycarts.workforce.ui.theme.TextMuted
import com.luxurycarts.workforce.ui.theme.TextPrimary
import com.luxurycarts.workforce.ui.theme.TextSecondary
import com.luxurycarts.workforce.ui.theme.ErrorRed
import com.luxurycarts.workforce.ui.theme.WarningAmber
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.time.LocalDate
import java.time.format.DateTimeFormatter

data class QualityCheck(val name: String, val passed: Boolean, val tip: String?)

private const val STUCK_THRESHOLD_MS = 30 * 60 * 1000L

@Composable
fun HomeScreen(
    user: User,
    workforceRecord: WorkforceRecord?,
    apiService: ApiService?,
    onCheckIn: () -> Unit,
    onHistory: () -> Unit,
    onMap: () -> Unit,
    onPrivacy: () -> Unit,
    onExcuse: () -> Unit,
    onLogout: () -> Unit,
    onWorkforceRefresh: () -> Unit = {},
) {
    val app = WorkforceApp.instance
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val wfId = workforceRecord?.id ?: app.sessionManager.workforceId ?: ""
    val pendingCount by app.database.attendanceDao().getPendingCount(wfId)
        .collectAsState(initial = 0)
    val oldestPendingCreatedAt by app.database.attendanceDao().getOldestPendingCreatedAt(wfId)
        .collectAsState(initial = null)
    val hasStuckSubmissions = oldestPendingCreatedAt?.let {
        it > 0 && (System.currentTimeMillis() - it) > STUCK_THRESHOLD_MS
    } ?: false

    val today = LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE, MMMM d, yyyy"))

    var photoUploading by remember { mutableStateOf(false) }
    var photoMessage by remember { mutableStateOf<String?>(null) }
    var qualityChecks by remember { mutableStateOf<List<QualityCheck>?>(null) }
    var hasPendingPhotoChange by remember { mutableStateOf(false) }
    var showPhotoDialog by remember { mutableStateOf(false) }

    val strPhotoSubmittedReview = stringResource(R.string.photo_submitted_review)
    val strPhotoUpdated = stringResource(R.string.photo_updated)
    val strUploadFailed = stringResource(R.string.upload_failed)
    val strCameraPermRequired = stringResource(R.string.camera_permission_required)
    val strErrorOpeningCamera = stringResource(R.string.error_opening_camera, "")

    val candidateId = workforceRecord?.candidateId
    val serverUrl = app.sessionManager.serverUrl.trimEnd('/')

    LaunchedEffect(candidateId) {
        if (candidateId == null || apiService == null) return@LaunchedEffect
        while (true) {
            try {
                val pendingResp = apiService.getPhotoChangeRequests(candidateId, "pending")
                if (pendingResp.isSuccessful) {
                    val pendingList = pendingResp.body() ?: emptyList()
                    val wasPending = hasPendingPhotoChange
                    hasPendingPhotoChange = pendingList.isNotEmpty()

                    if (wasPending && !hasPendingPhotoChange) {
                        val allResp = apiService.getPhotoChangeRequests(candidateId, null)
                        if (allResp.isSuccessful) {
                            val mostRecent = (allResp.body() ?: emptyList())
                                .sortedByDescending { it.createdAt }
                                .firstOrNull()
                            when (mostRecent?.status) {
                                "approved" -> {
                                    photoMessage = strPhotoUpdated
                                    onWorkforceRefresh()
                                }
                                "rejected" -> {
                                    val reason = mostRecent.reviewNotes
                                    photoMessage = reason ?: strUploadFailed
                                }
                                else -> {
                                    photoMessage = strPhotoUpdated
                                }
                            }
                        }
                    }
                }
            } catch (_: Exception) {}
            delay(30_000L)
        }
    }

    var cameraPhotoUri by remember { mutableStateOf<Uri?>(null) }
    var pendingCameraLaunch by remember { mutableStateOf(false) }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success: Boolean ->
        if (success && cameraPhotoUri != null && candidateId != null && apiService != null) {
            scope.launch {
                photoUploading = true
                photoMessage = null
                qualityChecks = null
                try {
                    val inputStream = context.contentResolver.openInputStream(cameraPhotoUri!!)
                    val bytes = inputStream?.readBytes() ?: throw Exception("Cannot read file")
                    inputStream.close()

                    val requestBody = bytes.toRequestBody("image/jpeg".toMediaTypeOrNull())
                    val filePart = MultipartBody.Part.createFormData("file", "photo.jpg", requestBody)
                    val docTypePart = "photo".toRequestBody("text/plain".toMediaTypeOrNull())

                    val response = apiService.uploadPhoto(candidateId, docTypePart, filePart)
                    if (response.isSuccessful) {
                        val body = response.body()
                        val qr = body?.qualityResult
                        if (qr != null && qr.checks.isNotEmpty() && !qr.qualityCheckSkipped) {
                            qualityChecks = qr.checks.map { QualityCheck(it.name, it.passed, it.tip) }
                        }
                        if (body?.pendingReview == true) {
                            hasPendingPhotoChange = true
                            photoMessage = strPhotoSubmittedReview
                        } else {
                            photoMessage = strPhotoUpdated
                            onWorkforceRefresh()
                        }
                    } else {
                        val errJson = try { response.errorBody()?.string() } catch (_: Exception) { null }
                        val parsedChecks = try {
                            if (errJson != null) {
                                val gson = com.google.gson.Gson()
                                val obj = gson.fromJson(errJson, com.google.gson.JsonObject::class.java)
                                val qr = obj?.getAsJsonObject("qualityResult")
                                val arr = qr?.getAsJsonArray("checks")
                                arr?.map { el ->
                                    val c = el.asJsonObject
                                    QualityCheck(
                                        name = c.get("name")?.asString ?: "",
                                        passed = c.get("passed")?.asBoolean ?: false,
                                        tip = c.get("tip")?.takeIf { !it.isJsonNull }?.asString,
                                    )
                                }
                            } else null
                        } catch (_: Exception) { null }

                        if (!parsedChecks.isNullOrEmpty()) {
                            qualityChecks = parsedChecks
                            photoMessage = null
                        } else {
                            val errMsg = try {
                                if (errJson != null) {
                                    val obj = com.google.gson.Gson()
                                        .fromJson(errJson, com.google.gson.JsonObject::class.java)
                                    obj?.get("message")?.asString
                                } else null
                            } catch (_: Exception) { null }
                            photoMessage = errMsg ?: strUploadFailed
                        }
                    }
                } catch (e: Exception) {
                    photoMessage = "Error: ${e.message}"
                }
                photoUploading = false
            }
        }
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted: Boolean ->
        if (granted) {
            pendingCameraLaunch = true
        } else {
            photoMessage = strCameraPermRequired
        }
    }

    LaunchedEffect(pendingCameraLaunch) {
        if (pendingCameraLaunch) {
            try {
                val photoFile = File(context.cacheDir, "profile_photo_${System.currentTimeMillis()}.jpg")
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", photoFile)
                cameraPhotoUri = uri
                pendingCameraLaunch = false
                cameraLauncher.launch(uri)
            } catch (e: Exception) {
                photoMessage = "${strErrorOpeningCamera}${e.message}"
                pendingCameraLaunch = false
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
    ) {
        Spacer(Modifier.height(56.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.welcome_back),
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextMuted,
                )
                Text(
                    user.fullName ?: user.username ?: stringResource(R.string.worker_default_name),
                    style = MaterialTheme.typography.headlineMedium,
                    color = TextPrimary,
                    fontWeight = FontWeight.Bold,
                )
            }
            OutlinedButton(
                onClick = onLogout,
                shape = RoundedCornerShape(8.dp),
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.ExitToApp,
                    contentDescription = stringResource(R.string.logout),
                    tint = TextMuted,
                    modifier = Modifier.size(18.dp),
                )
            }
        }

        Spacer(Modifier.height(8.dp))
        Text(today, style = MaterialTheme.typography.bodySmall, color = TextMuted)

        Spacer(Modifier.height(24.dp))

        Card(
            colors = CardDefaults.cardColors(containerColor = Surface),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(contentAlignment = Alignment.BottomEnd) {
                    val photoUrl = workforceRecord?.photoUrl
                    if (photoUrl != null) {
                        AsyncImage(
                            model = ImageRequest.Builder(context)
                                .data("$serverUrl$photoUrl")
                                .crossfade(true)
                                .build(),
                            contentDescription = stringResource(R.string.change_profile_photo),
                            modifier = Modifier
                                .size(80.dp)
                                .clip(CircleShape)
                                .border(2.dp, ForestGreen, CircleShape)
                                .clickable { showPhotoDialog = true },
                            contentScale = ContentScale.Crop,
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .size(80.dp)
                                .clip(CircleShape)
                                .background(CardBorder)
                                .clickable { showPhotoDialog = true },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Filled.Person,
                                contentDescription = null,
                                tint = TextMuted,
                                modifier = Modifier.size(40.dp),
                            )
                        }
                    }
                    if (!photoUploading) {
                        IconButton(
                            onClick = { showPhotoDialog = true },
                            modifier = Modifier
                                .size(28.dp)
                                .background(ForestGreen, CircleShape),
                        ) {
                            Icon(
                                Icons.Filled.Edit,
                                contentDescription = stringResource(R.string.change_profile_photo),
                                tint = TextPrimary,
                                modifier = Modifier.size(14.dp),
                            )
                        }
                    } else {
                        CircularProgressIndicator(
                            modifier = Modifier.size(28.dp),
                            color = ForestGreen,
                            strokeWidth = 2.dp,
                        )
                    }
                }

                if (hasPendingPhotoChange) {
                    Spacer(Modifier.height(8.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        Icon(
                            Icons.Filled.HourglassTop,
                            contentDescription = null,
                            tint = WarningAmber,
                            modifier = Modifier.size(14.dp),
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            stringResource(R.string.photo_pending_approval),
                            style = MaterialTheme.typography.labelMedium,
                            color = WarningAmber,
                        )
                    }
                }

                Spacer(Modifier.height(16.dp))

                Text(stringResource(R.string.your_details), style = MaterialTheme.typography.titleMedium, color = TextPrimary)
                Spacer(Modifier.height(12.dp))
                DetailRow(stringResource(R.string.employee_number), workforceRecord?.employeeNumber ?: app.sessionManager.employeeNumber ?: "—")
                workforceRecord?.positionTitle?.let { DetailRow(stringResource(R.string.position), it) }
                workforceRecord?.jobTitle?.let { DetailRow(stringResource(R.string.job_title), it) }
                workforceRecord?.eventName?.let { DetailRow(stringResource(R.string.event), it) }
                workforceRecord?.startDate?.let { DetailRow(stringResource(R.string.start_date), it) }
                DetailRow(stringResource(R.string.status), if (workforceRecord?.isActive != false) stringResource(R.string.active) else stringResource(R.string.inactive))
            }
        }

        if (photoMessage != null) {
            Spacer(Modifier.height(12.dp))
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = if (hasPendingPhotoChange) WarningAmber.copy(alpha = 0.1f) else ForestGreen.copy(alpha = 0.1f)
                ),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    photoMessage!!,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (hasPendingPhotoChange) WarningAmber else ForestGreen,
                    modifier = Modifier.padding(12.dp),
                    textAlign = TextAlign.Center,
                )
            }
        }

        val checks = qualityChecks
        if (checks != null) {
            val allPassed = checks.all { it.passed }
            val headerColor = if (allPassed) androidx.compose.ui.graphics.Color(0xFF34D399) else androidx.compose.ui.graphics.Color(0xFFF87171)
            val cardBg = if (allPassed) ForestGreen.copy(alpha = 0.1f) else androidx.compose.ui.graphics.Color(0xFF3B0A0A)
            Spacer(Modifier.height(12.dp))
            Card(
                colors = CardDefaults.cardColors(containerColor = cardBg),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            if (allPassed) Icons.Filled.CheckCircle else Icons.Filled.Warning,
                            contentDescription = null,
                            tint = headerColor,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            if (allPassed) stringResource(R.string.photo_quality_verified) else stringResource(R.string.photo_quality_failed),
                            style = MaterialTheme.typography.labelMedium,
                            color = headerColor,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    checks.forEach { check ->
                        Row(
                            verticalAlignment = Alignment.Top,
                            modifier = Modifier.padding(vertical = 3.dp),
                        ) {
                            Icon(
                                if (check.passed) Icons.Filled.CheckCircle else Icons.Filled.Cancel,
                                contentDescription = null,
                                tint = if (check.passed)
                                    androidx.compose.ui.graphics.Color(0xFF34D399)
                                else
                                    androidx.compose.ui.graphics.Color(0xFFF87171),
                                modifier = Modifier.size(14.dp).padding(top = 1.dp),
                            )
                            Spacer(Modifier.width(6.dp))
                            Column {
                                Text(
                                    check.name,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (check.passed)
                                        androidx.compose.ui.graphics.Color(0xFF34D399)
                                    else
                                        androidx.compose.ui.graphics.Color(0xFFF87171),
                                )
                                if (!check.passed && check.tip != null) {
                                    Text(
                                        check.tip,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = TextMuted,
                                        fontSize = 10.sp,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        if (pendingCount > 0) {
            Card(
                colors = CardDefaults.cardColors(containerColor = WarningAmber.copy(alpha = 0.1f)),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Sync, contentDescription = null, tint = WarningAmber, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(12.dp))
                    Text(
                        stringResource(R.string.pending_submissions, pendingCount),
                        style = MaterialTheme.typography.bodyMedium,
                        color = WarningAmber,
                    )
                }
            }
            if (hasStuckSubmissions) {
                Spacer(Modifier.height(8.dp))
                Card(
                    colors = CardDefaults.cardColors(containerColor = ErrorRed.copy(alpha = 0.1f)),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Filled.Warning, contentDescription = null, tint = ErrorRed, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                stringResource(R.string.submissions_stuck),
                                style = MaterialTheme.typography.labelMedium,
                                color = ErrorRed,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                stringResource(R.string.submissions_stuck_detail),
                                style = MaterialTheme.typography.bodySmall,
                                color = ErrorRed.copy(alpha = 0.8f),
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }

        Button(
            onClick = onCheckIn,
            colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
            shape = CircleShape,
            modifier = Modifier
                .size(140.dp)
                .align(Alignment.CenterHorizontally),
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Filled.CameraAlt, contentDescription = null, modifier = Modifier.size(36.dp))
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.check_in_out), fontWeight = FontWeight.Bold, fontSize = 13.sp)
            }
        }

        Spacer(Modifier.height(32.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ActionCard(stringResource(R.string.history), Icons.Filled.History, Modifier.weight(1f), onHistory)
            ActionCard(stringResource(R.string.excuse), Icons.Filled.EventBusy, Modifier.weight(1f), onExcuse)
            ActionCard(stringResource(R.string.map), Icons.Filled.Map, Modifier.weight(1f), onMap)
            ActionCard(stringResource(R.string.privacy), Icons.Filled.Shield, Modifier.weight(1f), onPrivacy)
        }

        Spacer(Modifier.height(32.dp))
    }

    if (showPhotoDialog) {
        AlertDialog(
            onDismissRequest = { showPhotoDialog = false },
            containerColor = Surface,
            title = {
                Text(stringResource(R.string.change_profile_photo), color = TextPrimary)
            },
            text = {
                Column {
                    if (hasPendingPhotoChange) {
                        Text(
                            stringResource(R.string.pending_photo_warning),
                            style = MaterialTheme.typography.bodySmall,
                            color = WarningAmber,
                        )
                        Spacer(Modifier.height(8.dp))
                    }
                    Text(
                        stringResource(R.string.photo_change_instructions),
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary,
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        showPhotoDialog = false
                        val hasCameraPerm = androidx.core.content.ContextCompat.checkSelfPermission(
                            context, android.Manifest.permission.CAMERA
                        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
                        if (hasCameraPerm) {
                            pendingCameraLaunch = true
                        } else {
                            cameraPermissionLauncher.launch(android.Manifest.permission.CAMERA)
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                ) {
                    Text(stringResource(R.string.open_camera))
                }
            },
            dismissButton = {
                TextButton(onClick = { showPhotoDialog = false }) {
                    Text(stringResource(R.string.cancel), color = TextMuted)
                }
            },
        )
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = TextMuted)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = TextSecondary, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun ActionCard(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        colors = CardDefaults.cardColors(containerColor = Surface),
        shape = RoundedCornerShape(12.dp),
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(CardBorder, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = label, tint = TextPrimary, modifier = Modifier.size(20.dp))
            }
            Text(label, style = MaterialTheme.typography.labelMedium, color = TextSecondary)
        }
    }
}
