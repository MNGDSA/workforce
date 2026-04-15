package com.luxurycarts.workforce.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.luxurycarts.workforce.R
import com.luxurycarts.workforce.ui.theme.ErrorRed
import com.luxurycarts.workforce.ui.theme.InfoBlue
import com.luxurycarts.workforce.ui.theme.SuccessGreen
import com.luxurycarts.workforce.ui.theme.TextPrimary
import com.luxurycarts.workforce.ui.theme.WarningAmber

@Composable
fun StatusBadge(status: String, modifier: Modifier = Modifier) {
    val (label, bgColor) = when (status.lowercase()) {
        "pending" -> stringResource(R.string.status_pending) to WarningAmber
        "synced" -> stringResource(R.string.status_synced) to InfoBlue
        "verified" -> stringResource(R.string.status_verified) to SuccessGreen
        "flagged" -> stringResource(R.string.status_flagged) to WarningAmber
        "rejected" -> stringResource(R.string.status_rejected) to ErrorRed
        "failed" -> stringResource(R.string.status_failed) to ErrorRed
        else -> status.replaceFirstChar { it.uppercase() } to InfoBlue
    }

    Text(
        text = label,
        color = TextPrimary,
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(bgColor.copy(alpha = 0.2f))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}
