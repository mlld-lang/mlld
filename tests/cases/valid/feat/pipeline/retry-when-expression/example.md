# Retry in When Expression Test

/exe @validateScore(input) = when first [
  @input > 0.8 => "high-quality"
  @input > 0.5 => "medium-quality"
  @input > 0.2 => "low-quality"
  * => "invalid-score"
]

/exe @scoreGenerator(input) = js {
  // Simulate generating different scores based on attempt - @ctx.try is ambient
  if (ctx.try == 1) return 0.1; // Too low, should retry
  if (ctx.try == 2) return 0.3; // Low quality
  return 0.9; // High quality
}

/exe @qualityControl(input) = when first [
  @input.includes("high-quality") => @input
  @input.includes("medium-quality") => @input
  @pipeline.try < 3 => retry
  * => "quality-control-failed"
]

# Create a retryable source
/exe @getTestData() = "test-data"

# Test retry mechanism in when expressions
/var @result = @getTestData() with { pipeline: [@scoreGenerator, @validateScore, @qualityControl] }

/show @result