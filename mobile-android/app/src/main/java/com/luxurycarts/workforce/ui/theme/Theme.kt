package com.luxurycarts.workforce.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val ForestGreen = Color(0xFF2D7A5F)
val ForestGreenLight = Color(0xFF3D9B78)
val ForestGreenDark = Color(0xFF1E5A43)
val Background = Color(0xFF0A1A14)
val Surface = Color(0xFF0F2A1F)
val Card = Color(0xFF1A3D2E)
val CardBorder = Color(0xFF2A5040)
val Border = Color(0xFF1E3A2C)
val TextPrimary = Color(0xFFE8F0EC)
val TextSecondary = Color(0xFFB0C8BC)
val TextMuted = Color(0xFF7A9B8A)
val ErrorRed = Color(0xFFEF4444)
val WarningAmber = Color(0xFFF59E0B)
val SuccessGreen = Color(0xFF10B981)
val InfoBlue = Color(0xFF3B82F6)

private val DarkColorScheme = darkColorScheme(
    primary = ForestGreen,
    onPrimary = TextPrimary,
    primaryContainer = ForestGreenDark,
    secondary = ForestGreenLight,
    background = Background,
    surface = Surface,
    surfaceVariant = Card,
    onBackground = TextPrimary,
    onSurface = TextPrimary,
    onSurfaceVariant = TextSecondary,
    error = ErrorRed,
    outline = CardBorder,
    outlineVariant = Border,
)

private val WorkforceTypography = Typography(
    headlineLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 22.sp,
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
    ),
)

@Composable
fun WorkforceTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = WorkforceTypography,
        content = content,
    )
}
