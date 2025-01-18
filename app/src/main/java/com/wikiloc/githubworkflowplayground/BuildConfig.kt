package com.wikiloc.githubworkflowplayground

data class BuildConfig(
  val release: Boolean,
  val public: Boolean,
  val fakeBilling: Boolean,
  val buildDate: String,
)

data class Variant(
  val name: String,
)