# After guard retry non-pipeline non-retryable

/guard after @noRetry for secret = when [
  * => retry "cannot retry literal"
]

/var secret @data = "blocked"
/show @data
