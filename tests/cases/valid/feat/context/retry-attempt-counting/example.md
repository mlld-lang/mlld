/exe @retryable() = when first [
  @ctx.try == 1 => retry "First attempt failed"
  @ctx.try == 2 => retry "Second attempt failed"
  * => "Success on attempt @ctx.try"
]

/var @result = @retryable()
/show @result