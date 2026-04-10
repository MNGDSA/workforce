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
import androidx.compose.ui.unit.dp
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
                "Biometric Data Notice",
                style = MaterialTheme.typography.titleLarge,
                color = TextPrimary,
            )
        },
        text = {
            Column {
                Text(
                    "This app captures facial photographs for attendance verification purposes.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextPrimary,
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    "Your photo will be:",
                    style = MaterialTheme.typography.labelLarge,
                    color = TextPrimary,
                )
                Spacer(Modifier.height(4.dp))
                val points = listOf(
                    "Encrypted on your device before transmission",
                    "Used solely for identity verification at your assigned work site",
                    "Compared against your registered reference photo",
                    "Stored securely and deleted upon your request",
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
                    "By proceeding, you consent to the collection and processing of your facial biometric data for attendance purposes.",
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
                Text("I Understand & Accept")
            }
        },
        dismissButton = {
            OutlinedButton(onClick = onDecline) {
                Text("Decline")
            }
        },
        modifier = Modifier.fillMaxWidth(),
    )
}
