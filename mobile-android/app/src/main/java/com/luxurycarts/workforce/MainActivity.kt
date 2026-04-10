package com.luxurycarts.workforce

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.luxurycarts.workforce.ui.nav.AppNavigation
import com.luxurycarts.workforce.ui.theme.WorkforceTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            WorkforceTheme {
                AppNavigation()
            }
        }
    }
}
