package com.luxurycarts.workforce.ui.screens

import android.annotation.SuppressLint
import android.webkit.WebChromeClient
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
import org.json.JSONArray
import org.json.JSONObject

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
    val zonesJson = remember(zones) {
        val arr = JSONArray()
        zones.forEach { zone ->
            val obj = JSONObject()
            obj.put("name", zone.name)
            obj.put("lat", zone.centerLat.toDoubleOrNull() ?: 21.4225)
            obj.put("lng", zone.centerLng.toDoubleOrNull() ?: 39.8262)
            obj.put("radius", zone.radiusMeters)
            arr.put(obj)
        }
        arr.toString()
    }

    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                settings.allowFileAccess = true
                @Suppress("DEPRECATION")
                settings.allowUniversalAccessFromFileURLs = true
                webChromeClient = WebChromeClient()
                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        val escaped = zonesJson.replace("\\", "\\\\").replace("'", "\\'")
                        view?.evaluateJavascript("loadZones('$escaped');", null)
                    }
                }
                loadUrl("file:///android_asset/leaflet_map.html")
            }
        },
        modifier = modifier,
    )
}
