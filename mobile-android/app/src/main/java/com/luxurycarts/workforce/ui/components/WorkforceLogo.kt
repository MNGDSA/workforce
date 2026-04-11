package com.luxurycarts.workforce.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Composable
fun WorkforceLogo(size: Dp = 40.dp) {
    val slashLight = Color(0xFF7ECFA8)
    val slashMid = Color(0xFF2D9B68)
    val slashDark = Color(0xFF145E38)

    Canvas(modifier = Modifier.size(size)) {
        val w = size.toPx()
        val h = size.toPx()
        val s = w / 38f

        fun drawSlash(x1: Float, y1: Float, x2: Float, y2: Float, x3: Float, y3: Float, x4: Float, y4: Float, color: Color) {
            val path = Path().apply {
                moveTo(x1 * s, y1 * s)
                lineTo(x2 * s, y2 * s)
                lineTo(x3 * s, y3 * s)
                lineTo(x4 * s, y4 * s)
                close()
            }
            drawPath(path, color)
        }

        drawSlash(4f, 36f, 10f, 2f, 16f, 2f, 10f, 36f, slashLight)
        drawSlash(14f, 36f, 20f, 2f, 26f, 2f, 20f, 36f, slashMid)
        drawSlash(24f, 36f, 30f, 2f, 36f, 2f, 30f, 36f, slashDark)
    }
}
