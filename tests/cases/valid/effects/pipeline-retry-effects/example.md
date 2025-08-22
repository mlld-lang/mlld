# Pipeline Retry Effects Test

Testing that effects emit during retry attempts

/exe @source() = "starting"

/exe @flaky() = when first [
  @ctx.try == 1 => show "Attempt 0" | "retry1"
  @ctx.try == 2 => show "Attempt 1" | "retry2"
  @ctx.try == 3 => show "Attempt 2" | "success"
  * => "fallback"
]

/exe @retryHandler() = when first [
  @ctx.input == "retry1" => retry
  @ctx.input == "retry2" => retry
  * => "Success"
]

/var @result = @source() | @flaky | @retryHandler

/show "Result: @result"