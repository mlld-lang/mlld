# Guard After Retry

/guard after @retryOutput for op:exe = when [
  * => retry "Retry output check"
]

/exe @emit(value) = js { return value; }

/show @emit("needs-retry")
