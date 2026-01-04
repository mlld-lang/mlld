# After guard retry non-pipeline budget exhausted

/guard after @budgetRetry for retryable = when [
  @mx.guard.try < 3 => retry "retrying until limit"
  * => deny "budget exhausted"
]

/exe @alwaysBad() = "bad"

/var retryable @value = @alwaysBad()
/show `value: @value`
