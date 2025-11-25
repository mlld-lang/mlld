# Guard Retry Failed

/guard @showRetry for op:show = when [
  * => retry "Need pipeline context"
]

/var @value = "Hello"

/show @value
