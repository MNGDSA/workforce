package com.luxurycarts.workforce.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.Circle
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.rememberCameraPositionState
import com.luxurycarts.workforce.data.ApiService
import com.luxurycarts.workforce.data.GeofenceZone
import com.luxurycarts.workforce.ui.theme.Background
import com.luxurycarts.workforce.ui.theme.ForestGreen
import com.luxurycarts.workforce.ui.theme.Surface
import com.luxurycarts.workforce.ui.theme.TextMuted
import com.luxurycarts.workforce.ui.theme.TextPrimary

@Composable
fun MapScreen(
    apiService: ApiService?,
    onBack: () -> Unit,
) {
    var zones by remember { mutableStateOf<List<GeofenceZone>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        try {
            val response = apiService?.getGeofenceZones()
            if (response?.isSuccessful == true && response.body() != null) {
                zones = response.body()!!.filter { it.isActive }
            }
        } catch (_: Exception) {}
        isLoading = false
    }

    val defaultCenter = LatLng(21.4225, 39.8262)
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(
            if (zones.isNotEmpty()) LatLng(zones.first().centerLat.toDouble(), zones.first().centerLng.toDouble()) else defaultCenter,
            15f,
        )
    }

    LaunchedEffect(zones) {
        if (zones.isNotEmpty()) {
            cameraPositionState.position = CameraPosition.fromLatLngZoom(
                LatLng(zones.first().centerLat.toDouble(), zones.first().centerLng.toDouble()),
                15f,
            )
        }
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
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = TextPrimary)
            }
            Text(
                "Geofence Zones",
                style = MaterialTheme.typography.titleLarge,
                color = TextPrimary,
                modifier = Modifier.weight(1f),
            )
            Text(
                "${zones.size} zone${if (zones.size != 1) "s" else ""}",
                style = MaterialTheme.typography.bodySmall,
                color = TextMuted,
            )
        }

        if (isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ForestGreen)
            }
        } else {
            GoogleMap(
                modifier = Modifier.fillMaxSize(),
                cameraPositionState = cameraPositionState,
            ) {
                zones.forEach { zone ->
                    Marker(
                        state = MarkerState(position = LatLng(zone.centerLat.toDouble(), zone.centerLng.toDouble())),
                        title = zone.name,
                        snippet = "Radius: ${zone.radiusMeters}m",
                    )
                    Circle(
                        center = LatLng(zone.centerLat.toDouble(), zone.centerLng.toDouble()),
                        radius = zone.radiusMeters.toDouble(),
                        fillColor = ForestGreen.copy(alpha = 0.15f),
                        strokeColor = ForestGreen.copy(alpha = 0.5f),
                        strokeWidth = 2f,
                    )
                }
            }
        }
    }
}
