package com.luxurycarts.workforce.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import java.io.File
import java.util.Locale
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.foundation.layout.systemBarsPadding
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
import androidx.compose.material.icons.filled.Login
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Schedule
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
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.luxurycarts.workforce.R
import coil.request.CachePolicy
import coil.request.ImageRequest
import coil.size.Scale
import com.luxurycarts.workforce.WorkforceApp
import com.luxurycarts.workforce.data.ApiService
import com.luxurycarts.workforce.data.AttendanceConfig
import com.luxurycarts.workforce.data.AttendanceStatusResponse
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
import com.luxurycarts.workforce.ui.theme.SuccessGreen
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
    // Task #84: home screen surfaces worker name, role, employee ID and
    // live attendance counters — protected against screenshots / mirroring.
    com.luxurycarts.workforce.ui.components.SecureScreen()
    val scope = rememberCoroutineScope()
    val wfId = workforceRecord?.id ?: app.sessionManager.workforceId ?: ""
    val pendingCount by app.database.attendanceDao().getPendingCount(wfId)
        .collectAsState(initial = 0)
    val needsAttentionCount by app.database.attendanceDao().getNeedsAttentionCount(wfId)
        .collectAsState(initial = 0)
    val oldestPendingCreatedAt by app.database.attendanceDao().getOldestPendingCreatedAt(wfId)
        .collectAsState(initial = null)
    val hasStuckSubmissions = oldestPendingCreatedAt?.let {
        it > 0 && (System.currentTimeMillis() - it) > STUCK_THRESHOLD_MS
    } ?: false

    var attendanceStatus by remember { mutableStateOf<AttendanceStatusResponse?>(null) }
    var nowTick by remember { mutableStateOf(System.currentTimeMillis()) }
    var showDailyCapDialog by remember { mutableStateOf(false) }
    var lastSync by remember {
        mutableStateOf<com.luxurycarts.workforce.data.SyncTelemetry.LastSyncResult?>(null)
    }
    LaunchedEffect(nowTick / 5_000L) {
        lastSync = com.luxurycarts.workforce.data.SyncTelemetry.readLastSyncResult(context)
    }

    LaunchedEffect(wfId, apiService) {
        if (wfId.isBlank() || apiService == null) return@LaunchedEffect
        while (true) {
            try {
                val resp = apiService.getAttendanceStatus(wfId)
                if (resp.isSuccessful) {
                    attendanceStatus = resp.body()
                }
            } catch (_: Exception) { }
            delay(60_000L)
        }
    }

    LaunchedEffect(Unit) {
        while (true) {
            nowTick = System.currentTimeMillis()
            delay(1_000L)
        }
    }

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
    val serverUrl = com.luxurycarts.workforce.SERVER_URL.trimEnd('/')

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
            // Step 7 (F-26): keep important controls (logout button,
            // welcome header) inside the safe area on Android 15 devices
            // where enableEdgeToEdge() makes the status/navigation bars
            // transparent and overlapping by default.
            .systemBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
    ) {
        Spacer(Modifier.height(16.dp))

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
                    val avatarSizePx = with(LocalDensity.current) { 80.dp.roundToPx() }
                    val placeholderPainter = rememberVectorPainter(Icons.Filled.Person)
                    if (photoUrl != null) {
                        val request = remember(photoUrl, serverUrl, avatarSizePx) {
                            ImageRequest.Builder(context)
                                .data("$serverUrl$photoUrl")
                                .size(avatarSizePx)
                                .scale(Scale.FILL)
                                .crossfade(true)
                                .memoryCachePolicy(CachePolicy.ENABLED)
                                .diskCachePolicy(CachePolicy.ENABLED)
                                .build()
                        }
                        AsyncImage(
                            model = request,
                            contentDescription = stringResource(R.string.change_profile_photo),
                            placeholder = placeholderPainter,
                            fallback = placeholderPainter,
                            error = placeholderPainter,
                            modifier = Modifier
                                .size(80.dp)
                                .clip(CircleShape)
                                .background(CardBorder)
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
                // Task #281 — Reports To. Pick the localized name; tap calls the manager
                // (or emails if no phone). Renders "Unassigned" muted when null.
                run {
                    val localeAr = Locale.getDefault().language == "ar"
                    val managerName = workforceRecord?.let {
                        if (localeAr) it.managerNameAr ?: it.managerNameEn else it.managerNameEn ?: it.managerNameAr
                    }
                    val phone = workforceRecord?.managerPhone?.takeIf { it.isNotBlank() }
                    val whatsapp = workforceRecord?.managerWhatsapp?.takeIf { it.isNotBlank() } ?: phone
                    val email = workforceRecord?.managerEmail?.takeIf { it.isNotBlank() }
                    val onTap: (() -> Unit)? = when {
                        phone != null -> {
                            {
                                val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                                runCatching { context.startActivity(intent) }
                            }
                        }
                        email != null -> {
                            {
                                val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$email"))
                                runCatching { context.startActivity(intent) }
                            }
                        }
                        else -> null
                    }
                    // Long-press on the Reports-To row opens WhatsApp with the
                    // manager's WhatsApp number (falls back to phone). Spec
                    // line 160: tap=dial, long-press=WhatsApp.
                    val onLongPress: (() -> Unit)? = whatsapp?.let { wa ->
                        {
                            val normalized = wa.removePrefix("+")
                            val intent = Intent(
                                Intent.ACTION_VIEW,
                                Uri.parse("https://wa.me/$normalized"),
                            )
                            runCatching { context.startActivity(intent) }
                        }
                    }
                    DetailRow(
                        label = stringResource(R.string.reports_to),
                        value = managerName ?: stringResource(R.string.reports_to_unassigned),
                        muted = managerName == null,
                        onClick = onTap,
                        onLongClick = onLongPress,
                    )
                }
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

        lastSync?.let { ls ->
            val labelRes = when (ls.bucket) {
                "ok" -> R.string.last_sync_ok
                "partial" -> R.string.last_sync_partial
                "failed" -> R.string.last_sync_failed
                "session_expired" -> R.string.last_sync_session_expired
                "terminated" -> R.string.last_sync_terminated
                else -> R.string.last_sync_unknown
            }
            val tint = when (ls.bucket) {
                "ok" -> SuccessGreen
                "partial" -> WarningAmber
                else -> ErrorRed
            }
            val tsLabel = remember(ls.timestampMillis) {
                java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault())
                    .format(java.util.Date(ls.timestampMillis))
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Sync, contentDescription = null, tint = tint, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(6.dp))
                Text(
                    stringResource(
                        R.string.last_sync_line,
                        stringResource(labelRes),
                        tsLabel,
                        ls.pendingCount,
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = tint,
                )
            }
            Spacer(Modifier.height(8.dp))
        }

        if (needsAttentionCount > 0) {
            Card(
                colors = CardDefaults.cardColors(containerColor = ErrorRed.copy(alpha = 0.1f)),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onHistory() },
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Warning, contentDescription = null, tint = ErrorRed, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            stringResource(R.string.submissions_need_attention, needsAttentionCount),
                            style = MaterialTheme.typography.labelMedium,
                            color = ErrorRed,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            stringResource(R.string.submissions_need_attention_detail),
                            style = MaterialTheme.typography.bodySmall,
                            color = ErrorRed.copy(alpha = 0.8f),
                        )
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }

        AttendanceStateBlock(
            status = attendanceStatus,
            nowMillis = nowTick,
            wfId = wfId,
            onCheckIn = {
                val cap = attendanceStatus?.config?.maxDailySubmissions ?: 2
                scope.launch {
                    val today = LocalDate.now().toString()
                    val countToday = app.database.attendanceDao().getCountForDate(wfId, today)
                    if (countToday >= cap) {
                        showDailyCapDialog = true
                    } else {
                        onCheckIn()
                    }
                }
            },
        )

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

    if (showDailyCapDialog) {
        AlertDialog(
            onDismissRequest = { showDailyCapDialog = false },
            containerColor = Surface,
            title = { Text(stringResource(R.string.daily_cap_reached_local_title), color = TextPrimary) },
            text = { Text(stringResource(R.string.daily_cap_reached_local), color = TextSecondary) },
            confirmButton = {
                TextButton(onClick = { showDailyCapDialog = false }) {
                    Text(stringResource(R.string.ok), color = ForestGreen)
                }
            },
        )
    }
}

@Composable
private fun AttendanceStateBlock(
    status: AttendanceStatusResponse?,
    nowMillis: Long,
    wfId: String,
    onCheckIn: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        if (status?.shiftAssigned == true && status.shift != null) {
            Card(
                colors = CardDefaults.cardColors(containerColor = Surface),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Schedule, contentDescription = null, tint = ForestGreen, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            stringResource(R.string.shift_today),
                            style = MaterialTheme.typography.labelMedium,
                            color = TextMuted,
                        )
                        Text(
                            stringResource(
                                R.string.shift_window_format,
                                status.shift.startTime,
                                status.shift.endTime,
                            ),
                            style = MaterialTheme.typography.bodyLarge,
                            color = TextPrimary,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            stringResource(R.string.shift_duration, status.shift.durationMinutes),
                            style = MaterialTheme.typography.labelSmall,
                            color = TextMuted,
                        )
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        } else if (status != null && !status.shiftAssigned) {
            Card(
                colors = CardDefaults.cardColors(containerColor = WarningAmber.copy(alpha = 0.1f)),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Warning, contentDescription = null, tint = WarningAmber, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(12.dp))
                    Text(
                        stringResource(R.string.window_no_shift),
                        style = MaterialTheme.typography.bodyMedium,
                        color = WarningAmber,
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
        }

        val cooldownRemaining = remember(status?.cooldownUntil, nowMillis) {
            val until = status?.cooldownUntil ?: return@remember 0L
            try {
                val end = java.time.Instant.parse(until).toEpochMilli()
                (end - nowMillis).coerceAtLeast(0L)
            } catch (_: Exception) { 0L }
        }
        val cooldownActive = cooldownRemaining > 0L

        val nextAction = status?.nextAllowedAction ?: "check_in"
        val state = status?.state ?: "not_checked_in"
        val windowOpen = status?.shiftWindowOpen ?: true

        val (label, color, icon, enabled) = when {
            state == "completed" -> Quad(
                stringResource(R.string.state_completed),
                TextMuted,
                Icons.Filled.CheckCircle,
                false,
            )
            cooldownActive -> Quad(
                stringResource(R.string.cooldown_wait, (cooldownRemaining / 1000).toInt()),
                TextMuted,
                Icons.Filled.HourglassTop,
                false,
            )
            !windowOpen || nextAction == "none" -> Quad(
                stringResource(R.string.action_disabled),
                TextMuted,
                Icons.Filled.HourglassTop,
                false,
            )
            nextAction == "check_out" -> Quad(
                stringResource(R.string.action_check_out),
                androidx.compose.ui.graphics.Color(0xFF3B82F6),
                Icons.Filled.Logout,
                true,
            )
            else -> Quad(
                stringResource(R.string.action_check_in),
                ForestGreen,
                Icons.Filled.Login,
                true,
            )
        }

        Button(
            onClick = onCheckIn,
            enabled = enabled,
            colors = ButtonDefaults.buttonColors(
                containerColor = if (enabled) color else CardBorder,
                disabledContainerColor = CardBorder,
            ),
            shape = CircleShape,
            modifier = Modifier.size(160.dp),
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(36.dp))
                Spacer(Modifier.height(6.dp))
                Text(label, fontWeight = FontWeight.Bold, fontSize = 13.sp, textAlign = TextAlign.Center)
            }
        }

        if (state == "checked_in" && status?.clockIn != null) {
            Spacer(Modifier.height(12.dp))
            Text(
                stringResource(R.string.clocked_in_at, status.clockIn),
                style = MaterialTheme.typography.bodySmall,
                color = TextSecondary,
            )
        }

        if (state == "completed") {
            val mins = status?.minutesWorked ?: 0
            val h = mins / 60
            val m = mins % 60
            Spacer(Modifier.height(12.dp))
            Text(
                stringResource(R.string.attendance_complete_summary, h, m),
                style = MaterialTheme.typography.bodySmall,
                color = TextSecondary,
            )
        }

        val reason = status?.windowReason
        if (reason != null && (!windowOpen || nextAction == "none")) {
            Spacer(Modifier.height(12.dp))
            val reasonText = renderReason(reason.code, reason.params, status?.config)
                ?: status?.windowMessage
            if (!reasonText.isNullOrBlank()) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = WarningAmber.copy(alpha = 0.1f)),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        reasonText,
                        style = MaterialTheme.typography.bodySmall,
                        color = WarningAmber,
                        modifier = Modifier.padding(12.dp),
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

private data class Quad<A, B, C, D>(val first: A, val second: B, val third: C, val fourth: D)

@Composable
private fun renderReason(code: String, params: Map<String, Any>, config: AttendanceConfig?): String? {
    fun s(key: String): String? = params[key]?.toString()
    return when (code) {
        "BEFORE_SHIFT_WINDOW" -> stringResource(
            R.string.window_before_shift,
            s("start") ?: "—",
            s("earliest") ?: "—",
            s("wait") ?: "—",
        )
        "AFTER_SHIFT_WINDOW" -> stringResource(R.string.window_after_shift, s("end") ?: "—")
        "MIN_DURATION_NOT_MET" -> stringResource(
            R.string.window_min_duration,
            (s("required") ?: config?.minShiftDurationMinutes?.toString() ?: "0").toIntOrNull() ?: 0,
            (s("remaining") ?: "0").toIntOrNull() ?: 0,
        )
        else -> null
    }
}

@Composable
@OptIn(ExperimentalFoundationApi::class)
private fun DetailRow(
    label: String,
    value: String,
    muted: Boolean = false,
    onClick: (() -> Unit)? = null,
    onLongClick: (() -> Unit)? = null,
) {
    val baseModifier = Modifier
        .fillMaxWidth()
        .padding(vertical = 4.dp)
    val rowModifier = when {
        // Task #281 — Reports To row uses long-press to open WhatsApp;
        // tap continues to dial. combinedClickable composes both gestures
        // without breaking the regular tap path used by other rows.
        onClick != null && onLongClick != null -> baseModifier.combinedClickable(
            onClick = onClick,
            onLongClick = onLongClick,
        )
        onClick != null -> baseModifier.clickable { onClick() }
        else -> baseModifier
    }
    val valueColor = if (muted) TextMuted else TextSecondary
    Row(
        modifier = rowModifier,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = TextMuted)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = valueColor, fontWeight = FontWeight.SemiBold)
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
