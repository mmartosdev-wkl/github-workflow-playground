package com.wikiloc.githubworkflowplayground.composables

import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview

@Composable
fun Chip(
  text: String,
  modifier: Modifier = Modifier,
) {
  Surface(modifier = modifier) {
    Text(text = text)
  }
}

@Preview
@Composable
private fun PreviewChip() {
  Chip(
    text = "halow"
  )
}