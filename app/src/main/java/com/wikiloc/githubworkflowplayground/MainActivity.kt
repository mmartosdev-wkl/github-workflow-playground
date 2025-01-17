package com.wikiloc.githubworkflowplayground

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.wikiloc.githubworkflowplayground.ui.theme.GithubWorkflowPlaygroundTheme

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    setContent {
      GithubWorkflowPlaygroundTheme {
        Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
          Box(modifier = Modifier.fillMaxSize().background(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.2f)), contentAlignment = Alignment.Center) {
            Greeting(
              name = "Wikiloc",
              modifier = Modifier.padding(innerPadding)
            )
          }
        }
      }
    }
  }
}

@Composable
fun Greeting(name: String, modifier: Modifier = Modifier) {
  Text(
    text = "Hello, $name!",
    modifier = modifier.border(1.dp, MaterialTheme.colorScheme.primary).padding(24.dp)
  )
}

@Preview(showBackground = true)
@Composable
fun GreetingPreview() {
  GithubWorkflowPlaygroundTheme {
    Greeting("Wikiloc")
  }
}