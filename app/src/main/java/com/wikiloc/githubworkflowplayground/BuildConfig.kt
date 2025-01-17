package com.wikiloc.githubworkflowplayground

data class BuildConfig(
  val release: Boolean,
  val public: Boolean,
  val fakeBilling: Boolean,
)