package com.luxurycarts.workforce.ui.screens

import android.annotation.SuppressLint
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
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
            LeafletMapView(zones = zones, modifier = Modifier.fillMaxSize())
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun LeafletMapView(zones: List<GeofenceZone>, modifier: Modifier = Modifier) {
    val defaultLat = 21.4225
    val defaultLng = 39.8262
    val centerLat = zones.firstOrNull()?.centerLat?.toDoubleOrNull() ?: defaultLat
    val centerLng = zones.firstOrNull()?.centerLng?.toDoubleOrNull() ?: defaultLng

    val zonesJs = zones.joinToString(",") { zone ->
        val lat = zone.centerLat.toDoubleOrNull() ?: defaultLat
        val lng = zone.centerLng.toDoubleOrNull() ?: defaultLng
        """{ name: "${zone.name.replace("\"", "\\\"")}", lat: $lat, lng: $lng, radius: ${zone.radiusMeters} }"""
    }

    val html = remember(zones) {
        buildString {
            append("<!DOCTYPE html>")
            append("<html><head>")
            append("<meta name='viewport' content='width=device-width, initial-scale=1.0, user-scalable=no'>")
            append("<link rel='stylesheet' href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'/>")
            append("<script src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'></script>")
            append("<style>*{margin:0;padding:0}html,body,#map{width:100%;height:100%}</style>")
            append("</head><body>")
            append("<div id='map'></div>")
            append("<script>")
            append("var map=L.map('map').setView([")
            append(centerLat)
            append(",")
            append(centerLng)
            append("],15);")
            append("L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{")
            append("attribution:'\\u00a9 OSM',maxZoom:19}).addTo(map);")
            append("var zones=[")
            append(zonesJs)
            append("];")
            append("zones.forEach(function(z){")
            append("L.circle([z.lat,z.lng],{radius:z.radius,color:'#3D8B67',fillColor:'#3D8B67',fillOpacity:0.15,weight:2})")
            append(".addTo(map).bindPopup('<b>'+z.name+'</b><br>Radius: '+z.radius+'m');")
            append("L.marker([z.lat,z.lng]).addTo(map).bindPopup('<b>'+z.name+'</b><br>Radius: '+z.radius+'m');")
            append("});")
            append("if(zones.length>0){var g=L.featureGroup(zones.map(function(z){return L.circle([z.lat,z.lng],{radius:z.radius})}));")
            append("map.fitBounds(g.getBounds().pad(0.2));}")
            append("</script></body></html>")
        }
    }

    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                webViewClient = WebViewClient()
                loadDataWithBaseURL("https://unpkg.com/", html, "text/html", "UTF-8", null)
            }
        },
        modifier = modifier,
    )
}
