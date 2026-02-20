# Pipeline Retry Effects Test

Testing that effects emit during retry attempts

/exe @source() = "starting"

/exe @flaky(input, pipeline) = when [
  @pipeline.try == 1 => show "Attempt 1"
  @pipeline.try == 2 => show "Attempt 2"
  @pipeline.try == 3 => show "Attempt 3"
  * => "fallback"
]

/exe @retryHandler(input, pipeline) = when [
  @pipeline.try < 3 => retry
  * => "Success"
]

/var @result = @source() | @flaky(@p) | @retryHandler(@p)

/show "Result: @result"