package com.luxurycarts.workforce.ui.screens

import android.graphics.Color as AndroidColor
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.zIndex
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.luxurycarts.workforce.data.ApiService
import com.luxurycarts.workforce.data.GeofenceZone
import com.luxurycarts.workforce.ui.theme.Background
import com.luxurycarts.workforce.ui.theme.ForestGreen
import com.luxurycarts.workforce.ui.theme.Surface
import com.luxurycarts.workforce.ui.theme.TextMuted
import com.luxurycarts.workforce.ui.theme.TextPrimary
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon

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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .zIndex(1f)
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
            OsmMapView(zones = zones, modifier = Modifier.fillMaxSize().clipToBounds())
        }
    }
}

@Composable
private fun OsmMapView(zones: List<GeofenceZone>, modifier: Modifier = Modifier) {
    val context = LocalContext.current

    val mapView = remember {
        Configuration.getInstance().userAgentValue = context.packageName
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            controller.setZoom(15.0)
            controller.setCenter(GeoPoint(21.4225, 39.8262))
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            mapView.onDetach()
        }
    }

    LaunchedEffect(zones) {
        mapView.overlays.clear()

        val greenFill = AndroidColor.argb(38, 61, 139, 103)
        val greenStroke = AndroidColor.rgb(61, 139, 103)

        zones.forEach { zone ->
            val lat = zone.centerLat.toDoubleOrNull() ?: 21.4225
            val lng = zone.centerLng.toDoubleOrNull() ?: 39.8262
            val center = GeoPoint(lat, lng)

            val circle = Polygon(mapView)
            circle.points = Polygon.pointsAsCircle(center, zone.radiusMeters.toDouble())
            circle.fillPaint.color = greenFill
            circle.outlinePaint.color = greenStroke
            circle.outlinePaint.strokeWidth = 3f
            circle.title = zone.name
            circle.snippet = "Radius: ${zone.radiusMeters}m"
            mapView.overlays.add(circle)

            val marker = Marker(mapView)
            marker.position = center
            marker.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
            marker.title = zone.name
            marker.snippet = "Radius: ${zone.radiusMeters}m"
            mapView.overlays.add(marker)
        }

        if (zones.isNotEmpty()) {
            val points = zones.mapNotNull { zone ->
                val lat = zone.centerLat.toDoubleOrNull()
                val lng = zone.centerLng.toDoubleOrNull()
                if (lat != null && lng != null) GeoPoint(lat, lng) else null
            }
            if (points.size == 1) {
                mapView.controller.setCenter(points[0])
                mapView.controller.setZoom(16.0)
            } else if (points.size > 1) {
                val north = points.maxOf { it.latitude }
                val south = points.minOf { it.latitude }
                val east = points.maxOf { it.longitude }
                val west = points.minOf { it.longitude }
                val padding = 0.005
                mapView.zoomToBoundingBox(
                    BoundingBox(north + padding, east + padding, south - padding, west - padding),
                    true
                )
            }
        }

        mapView.invalidate()
    }

    AndroidView(
        factory = { mapView },
        modifier = modifier,
    )
}
