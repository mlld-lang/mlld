# Retry Attempt Tracking Test

/exe @generateAttempt(input, pipeline) = `attempt-@pipeline.try: @input`

/exe @collectAttempts(input, pipeline) = `current: @input, history: [@pipeline.tries], try: @pipeline.try`

/exe @retryCollector(input, pipeline) = when: [
  @pipeline.try >= 3 => @input
  * => retry
]

# Test that @pipeline.tries collects all retry attempts
/var @result = "base" with { pipeline: [@generateAttempt(@p), @retryCollector(@p), @collectAttempts(@p)] }

/show @result