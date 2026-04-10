package com.luxurycarts.workforce.ui.screens

import android.Manifest
import android.content.pm.PackageManager
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.luxurycarts.workforce.data.AttendanceDao
import com.luxurycarts.workforce.data.AttendanceEntity
import com.luxurycarts.workforce.services.EncryptionService
import com.luxurycarts.workforce.ui.theme.Background
import com.luxurycarts.workforce.ui.theme.ErrorRed
import com.luxurycarts.workforce.ui.theme.ForestGreen
import com.luxurycarts.workforce.ui.theme.TextMuted
import com.luxurycarts.workforce.ui.theme.TextPrimary
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import java.time.Instant
import java.time.LocalDate
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

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        hasCameraPermission = it
    }
    val locationLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        hasLocationPermission = it[Manifest.permission.ACCESS_FINE_LOCATION] == true
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) cameraLauncher.launch(Manifest.permission.CAMERA)
        if (!hasLocationPermission) locationLauncher.launch(
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
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
                "Position your face within the oval",
                color = Color.White.copy(alpha = 0.7f),
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 60.dp),
            )

            IconButton(
                onClick = onBack,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(16.dp),
            ) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White)
            }

            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
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
                            try {
                                val photoFile = File(context.filesDir, "att_${System.currentTimeMillis()}.jpg")
                                capturePhoto(imageCapture!!, photoFile)
                                val location = getLocation(context)

                                val encPhotoPath = photoFile.absolutePath + ".enc"
                                EncryptionService.encryptFile(photoFile.absolutePath, encPhotoPath)
                                photoFile.delete()

                                val entity = AttendanceEntity(
                                    id = UUID.randomUUID().toString(),
                                    workforceId = EncryptionService.encrypt(workforceId),
                                    attendanceDate = LocalDate.now().toString(),
                                    encryptedTimestamp = EncryptionService.encrypt(Instant.now().toString()),
                                    encryptedGpsLat = EncryptionService.encrypt(location.first.toString()),
                                    encryptedGpsLng = EncryptionService.encrypt(location.second.toString()),
                                    gpsAccuracy = location.third,
                                    encryptedPhotoPath = EncryptionService.encrypt(encPhotoPath),
                                    ownerWorkforceId = workforceId,
                                )
                                dao.insert(entity)
                                onComplete()
                            } catch (e: Exception) {
                                errorMessage = e.message ?: "Capture failed"
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
                        Icon(Icons.Filled.CameraAlt, "Capture", modifier = Modifier.size(32.dp))
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
                Text("Camera and location permissions are required", color = TextPrimary)
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
                    Text("Grant Permissions", fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(12.dp))
                Text("or", color = TextMuted)
                Spacer(Modifier.height(12.dp))
                Button(onClick = onBack, colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent)) {
                    Text("Go Back", color = TextMuted)
                }
            }
        }
    }
}

private suspend fun capturePhoto(imageCapture: ImageCapture, outputFile: File) =
    suspendCancellableCoroutine { cont ->
        val context = outputFile.parentFile!!.let { WorkforceApp.instance }
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

@android.annotation.SuppressLint("MissingPermission")
private suspend fun getLocation(context: android.content.Context): Triple<Double, Double, Float?> =
    suspendCancellableCoroutine { cont ->
        val client = LocationServices.getFusedLocationProviderClient(context)
        client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, CancellationTokenSource().token)
            .addOnSuccessListener { location ->
                if (location != null) {
                    cont.resume(Triple(location.latitude, location.longitude, location.accuracy))
                } else {
                    cont.resumeWithException(Exception("Location unavailable"))
                }
            }
            .addOnFailureListener { cont.resumeWithException(it) }
    }
