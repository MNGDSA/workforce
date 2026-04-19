package com.luxurycarts.workforce.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.SystemClock
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.luxurycarts.workforce.R
import com.luxurycarts.workforce.data.AttendanceDao
import com.luxurycarts.workforce.data.AttendanceEntity
import com.luxurycarts.workforce.services.DeviceTrustManager
import com.luxurycarts.workforce.services.EncryptionService
import com.luxurycarts.workforce.services.SyncWorker
import com.luxurycarts.workforce.ui.theme.Background
import com.luxurycarts.workforce.ui.theme.ErrorRed
import com.luxurycarts.workforce.ui.theme.ForestGreen
import com.luxurycarts.workforce.ui.theme.Surface
import com.luxurycarts.workforce.ui.theme.TextMuted
import com.luxurycarts.workforce.ui.theme.TextPrimary
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import android.graphics.BitmapFactory
import java.io.File
import java.time.Instant
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

@Composable
fun CaptureScreen(
    workforceId: String,
    dao: AttendanceDao,
    onComplete: () -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    // Task #84: live camera preview + captured selfie are biometric data;
    // block OS screenshots, recents thumbnails, and screen mirroring.
    com.luxurycarts.workforce.ui.components.SecureScreen()
    val scope = rememberCoroutineScope()
    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }
    var hasLocationPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        )
    }
    var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
    var isCapturing by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showBackConfirm by remember { mutableStateOf(false) }

    BackHandler(enabled = isCapturing) {
        showBackConfirm = true
    }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        hasCameraPermission = it
    }
    val locationLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        hasLocationPermission = it[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                it[Manifest.permission.ACCESS_COARSE_LOCATION] == true
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) cameraLauncher.launch(Manifest.permission.CAMERA)
        if (!hasLocationPermission) locationLauncher.launch(
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        )
    }

    if (showBackConfirm) {
        AlertDialog(
            onDismissRequest = { showBackConfirm = false },
            containerColor = Surface,
            title = { Text(stringResource(R.string.capture_in_progress), color = TextPrimary) },
            text = { Text(stringResource(R.string.capture_back_warning), color = TextMuted) },
            confirmButton = {
                TextButton(onClick = { showBackConfirm = false }) {
                    Text(stringResource(R.string.stay), color = ForestGreen)
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    showBackConfirm = false
                    onBack()
                }) {
                    Text(stringResource(R.string.leave), color = ErrorRed)
                }
            },
        )
    }

    if (hasCameraPermission && hasLocationPermission) {
        Box(modifier = Modifier.fillMaxSize()) {
            AndroidView(
                factory = { ctx ->
                    PreviewView(ctx).also { previewView ->
                        previewView.scaleType = PreviewView.ScaleType.FILL_CENTER
                        val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                        cameraProviderFuture.addListener({
                            val cameraProvider = cameraProviderFuture.get()
                            val preview = Preview.Builder().build().apply {
                                surfaceProvider = previewView.surfaceProvider
                            }
                            val capture = ImageCapture.Builder()
                                .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                                .build()
                            imageCapture = capture
                            try {
                                cameraProvider.unbindAll()
                                cameraProvider.bindToLifecycle(
                                    lifecycleOwner,
                                    CameraSelector.DEFAULT_FRONT_CAMERA,
                                    preview,
                                    capture,
                                )
                            } catch (_: Exception) {}
                        }, ContextCompat.getMainExecutor(ctx))
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )

            Canvas(modifier = Modifier.fillMaxSize()) {
                val ovalW = size.width * 0.6f
                val ovalH = size.height * 0.4f
                val left = (size.width - ovalW) / 2
                val top = size.height * 0.12f
                drawOval(
                    color = Color.White.copy(alpha = 0.4f),
                    topLeft = Offset(left, top),
                    size = Size(ovalW, ovalH),
                    style = Stroke(width = 3f),
                )
            }

            Text(
                stringResource(R.string.position_face),
                color = Color.White.copy(alpha = 0.7f),
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 60.dp),
            )

            IconButton(
                onClick = {
                    if (isCapturing) {
                        showBackConfirm = true
                    } else {
                        onBack()
                    }
                },
                modifier = Modifier
                    .align(Alignment.TopStart)
                    // Step 7 (F-26): keep the back button below the
                    // status bar on Android 15 edge-to-edge devices
                    // while leaving the camera preview full-screen.
                    .statusBarsPadding()
                    .padding(16.dp),
            ) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.back), tint = Color.White)
            }

            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    // Step 7 (F-26): keep the capture button above the
                    // navigation bar (gesture pill / 3-button nav) on
                    // Android 15 edge-to-edge devices.
                    .navigationBarsPadding()
                    .padding(bottom = 60.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                errorMessage?.let {
                    Text(it, color = ErrorRed, style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(12.dp))
                }

                Button(
                    onClick = {
                        if (isCapturing || imageCapture == null) return@Button
                        isCapturing = true
                        errorMessage = null
                        scope.launch {
                            var photoFile: File? = null
                            var encPhotoFile: File? = null
                            try {
                                photoFile = File(context.filesDir, "att_${System.currentTimeMillis()}.jpg")
                                capturePhoto(imageCapture!!, photoFile, context)

                                val fileSizeKb = photoFile.length() / 1024
                                val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                                BitmapFactory.decodeFile(photoFile.absolutePath, opts)
                                val imgW = opts.outWidth
                                val imgH = opts.outHeight

                                if (fileSizeKb < 30 || imgW < 400 || imgH < 400) {
                                    photoFile.delete()
                                    photoFile = null
                                    errorMessage = context.getString(R.string.photo_quality_low, imgW, imgH, fileSizeKb)
                                    isCapturing = false
                                    return@launch
                                }

                                val location = getLocationTiered(context)

                                val app = context.applicationContext as com.luxurycarts.workforce.WorkforceApp
                                val ntpService = app.ntpTimeService

                                if (!ntpService.hasEverSynced) {
                                    photoFile.delete()
                                    photoFile = null
                                    errorMessage = context.getString(R.string.internet_required_first_time)
                                    isCapturing = false
                                    return@launch
                                }

                                val trustReport = DeviceTrustManager.generateReport(context, location.rawLocation)
                                val trustedInstant = ntpService.getTrustedInstant() ?: Instant.now()
                                val systemClockInstant = Instant.now()
                                val lastNtpSync = ntpService.getLastNtpSyncInstant()
                                val timezone = ntpService.organizationTimezone
                                val attendanceDate = trustedInstant.atZone(java.time.ZoneId.of(timezone)).toLocalDate().toString()

                                val encPhotoPath = photoFile.absolutePath + ".enc"
                                encPhotoFile = File(encPhotoPath)
                                EncryptionService.encryptFile(photoFile.absolutePath, encPhotoPath)
                                photoFile.delete()
                                photoFile = null

                                val entity = AttendanceEntity(
                                    id = UUID.randomUUID().toString(),
                                    submissionToken = UUID.randomUUID().toString(),
                                    workforceId = EncryptionService.encrypt(workforceId),
                                    attendanceDate = attendanceDate,
                                    encryptedTimestamp = EncryptionService.encrypt(trustedInstant.toString()),
                                    encryptedGpsLat = EncryptionService.encrypt(location.latitude.toString()),
                                    encryptedGpsLng = EncryptionService.encrypt(location.longitude.toString()),
                                    gpsAccuracy = location.accuracy,
                                    encryptedPhotoPath = EncryptionService.encrypt(encPhotoPath),
                                    ownerWorkforceId = workforceId,
                                    mockLocationDetected = trustReport.mockLocationDetected,
                                    isEmulator = trustReport.isEmulator,
                                    rootDetected = trustReport.rootDetected,
                                    locationProvider = trustReport.locationProvider,
                                    deviceFingerprint = trustReport.deviceFingerprint,
                                    ntpTimestamp = trustedInstant.toString(),
                                    systemClockTimestamp = systemClockInstant.toString(),
                                    lastNtpSyncAt = lastNtpSync?.toString(),
                                    locationSource = location.source,
                                    createdAtMillis = System.currentTimeMillis(),
                                )
                                dao.insert(entity)
                                SyncWorker.syncNow(context)
                                onComplete()
                            } catch (e: Exception) {
                                photoFile?.let { if (it.exists()) it.delete() }
                                encPhotoFile?.let { if (it.exists()) it.delete() }
                                errorMessage = e.message ?: context.getString(R.string.capture_failed)
                                isCapturing = false
                            }
                        }
                    },
                    enabled = !isCapturing,
                    shape = CircleShape,
                    colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                    modifier = Modifier.size(80.dp),
                ) {
                    if (isCapturing) {
                        CircularProgressIndicator(color = TextPrimary, strokeWidth = 2.dp, modifier = Modifier.size(28.dp))
                    } else {
                        Icon(Icons.Filled.CameraAlt, stringResource(R.string.capture), modifier = Modifier.size(32.dp))
                    }
                }
            }
        }
    } else {
        Box(
            modifier = Modifier.fillMaxSize().background(Background),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(stringResource(R.string.permissions_required), color = TextPrimary)
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = {
                        if (!hasCameraPermission) cameraLauncher.launch(Manifest.permission.CAMERA)
                        if (!hasLocationPermission) locationLauncher.launch(
                            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
                        )
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                ) {
                    Text(stringResource(R.string.grant_permissions), fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(12.dp))
                Text(stringResource(R.string.or_text), color = TextMuted)
                Spacer(Modifier.height(12.dp))
                Button(onClick = onBack, colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent)) {
                    Text(stringResource(R.string.go_back), color = TextMuted)
                }
            }
        }
    }
}

private suspend fun capturePhoto(imageCapture: ImageCapture, outputFile: File, context: android.content.Context) =
    suspendCancellableCoroutine { cont ->
        val options = ImageCapture.OutputFileOptions.Builder(outputFile).build()
        imageCapture.takePicture(
            options,
            ContextCompat.getMainExecutor(context),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                    cont.resume(Unit)
                }
                override fun onError(e: ImageCaptureException) {
                    cont.resumeWithException(e)
                }
            },
        )
    }

data class LocationResult(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float?,
    val rawLocation: android.location.Location?,
    val source: String,
)

@android.annotation.SuppressLint("MissingPermission")
private suspend fun getLocationTiered(context: android.content.Context): LocationResult {
    val client = LocationServices.getFusedLocationProviderClient(context)

    val highAccuracy = withTimeoutOrNull(10_000L) {
        suspendCancellableCoroutine { cont ->
            val cts = CancellationTokenSource()
            cont.invokeOnCancellation { cts.cancel() }
            client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token)
                .addOnSuccessListener { location ->
                    if (location != null) {
                        cont.resume(LocationResult(location.latitude, location.longitude, location.accuracy, location, "gps"))
                    } else {
                        cont.resume(null)
                    }
                }
                .addOnFailureListener { cont.resume(null) }
        }
    }
    if (highAccuracy != null) return highAccuracy

    val lastKnown = suspendCancellableCoroutine<android.location.Location?> { cont ->
        client.lastLocation
            .addOnSuccessListener { location -> cont.resume(location) }
            .addOnFailureListener { cont.resume(null) }
    }
    if (lastKnown != null) {
        val ageMs = SystemClock.elapsedRealtime() - (lastKnown.elapsedRealtimeNanos / 1_000_000)
        val fiveMinMs = 5 * 60 * 1000L
        if (ageMs < fiveMinMs) {
            return LocationResult(lastKnown.latitude, lastKnown.longitude, lastKnown.accuracy, lastKnown, "last_known")
        }
    }

    val coarse = withTimeoutOrNull(15_000L) {
        suspendCancellableCoroutine { cont ->
            val cts = CancellationTokenSource()
            cont.invokeOnCancellation { cts.cancel() }
            client.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, cts.token)
                .addOnSuccessListener { location ->
                    if (location != null) {
                        cont.resume(LocationResult(location.latitude, location.longitude, location.accuracy, location, "network"))
                    } else {
                        cont.resume(null)
                    }
                }
                .addOnFailureListener { cont.resume(null) }
        }
    }
    if (coarse != null) return coarse

    throw Exception(context.getString(R.string.location_unavailable))
}
