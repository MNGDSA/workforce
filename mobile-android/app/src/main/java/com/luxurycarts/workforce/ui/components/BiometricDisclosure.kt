package com.luxurycarts.workforce.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.luxurycarts.workforce.R
import com.luxurycarts.workforce.ui.theme.ForestGreen
import com.luxurycarts.workforce.ui.theme.TextMuted
import com.luxurycarts.workforce.ui.theme.TextPrimary

@Composable
fun BiometricDisclosureDialog(
    onAccept: () -> Unit,
    onDecline: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDecline,
        title = {
            Text(
                stringResource(R.string.biometric_notice),
                style = MaterialTheme.typography.titleLarge,
                color = TextPrimary,
            )
        },
        text = {
            Column {
                Text(
                    stringResource(R.string.biometric_intro),
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextPrimary,
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    stringResource(R.string.biometric_usage),
                    style = MaterialTheme.typography.labelLarge,
                    color = TextPrimary,
                )
                Spacer(Modifier.height(4.dp))
                val points = listOf(
                    stringResource(R.string.biometric_point_1),
                    stringResource(R.string.biometric_point_2),
                    stringResource(R.string.biometric_point_3),
                    stringResource(R.string.biometric_point_4),
                )
                points.forEach { point ->
                    Text(
                        "\u2022 $point",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextMuted,
                        modifier = Modifier.padding(vertical = 2.dp),
                    )
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    stringResource(R.string.biometric_consent),
                    style = MaterialTheme.typography.bodySmall,
                    color = TextMuted,
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onAccept,
                colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
            ) {
                Text(stringResource(R.string.i_understand_accept))
            }
        },
        dismissButton = {
            OutlinedButton(onClick = onDecline) {
                Text(stringResource(R.string.decline))
            }
        },
        modifier = Modifier.fillMaxWidth(),
    )
}
