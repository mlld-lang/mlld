/guard @retryOnce before op:exe = when [
  @mx.guard.try == 1 => retry "first attempt failed"
  @mx.guard.try == 2 => retry "second attempt failed"
  * => allow
]