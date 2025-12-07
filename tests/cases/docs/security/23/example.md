/guard @retryOnce before op:exe = when [
  @ctx.guard.try == 1 => retry "first attempt failed"
  @ctx.guard.try == 2 => retry "second attempt failed"
  * => allow
]