package com.luxurycarts.workforce.ui.components

import android.app.Activity
import android.view.WindowManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalView

/**
 * Task #84: marks the current screen as containing PII or biometric content
 * that must not be captured by the OS screenshot pipeline, the recents-app
 * thumbnail (the "ghost" frame Android renders behind the app switcher), or
 * any third-party screen-recording / Cast / mirroring service.
 *
 * Implemented by toggling [WindowManager.LayoutParams.FLAG_SECURE] on the
 * hosting [Activity]'s window for the lifetime of this composable. The flag
 * is added in [DisposableEffect]'s `onEnter` body and removed in `onDispose`,
 * so other screens (e.g. the public Login screen, where a screenshot is
 * harmless) keep the normal Android behaviour and the user can still hand
 * the device to a peer for screen-share help on those surfaces.
 *
 * Apply to every composable that renders:
 *   - the live camera preview or a captured selfie (CaptureScreen)
 *   - prior attendance photos or row-level metadata (HistoryScreen)
 *   - personal profile / payroll details (HomeScreen profile area)
 *
 * No-op outside of an Activity context (e.g. previews) so the helper is
 * safe to call from anywhere in the navigation graph.
 */
@Composable
fun SecureScreen() {
    val view = LocalView.current
    DisposableEffect(view) {
        val window = (view.context as? Activity)?.window
        window?.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE,
        )
        onDispose {
            window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}
