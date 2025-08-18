# Test Pipeline Retry Through Effect Stages

This test verifies that retry functionality works correctly through multiple effect stages (show, log, output) to reach retryable stages in the pipeline.

## Helper Functions

/exe @alwaysFails() = js {
  // Always returns the same value - forces retry to test the mechanism
  return "failed_attempt";
}

/exe @retryUntilMax(input, p) = when first [
  @p.try >= 3 => "success_after_3_attempts"
  * => retry
]

/exe @showContext(input, p) = js {
  // Shows the pipeline context at this stage
  return `Stage ${p.stage}: ${input} (try ${p.try})`;
}

## Test 1: Retry through single effect stage

>> Verifies retry works when there's a show effect between source and validator
/var @result1 = @alwaysFails() | show @input | @retryUntilMax(@p)

## Test 2: Retry through multiple effect stages  

>> Verifies retry works through multiple effects (show, log, output)
/var @result2 = @alwaysFails() | show @input | log @input | output @input to stdout | @retryUntilMax(@p)

## Test 3: Verify pipeline context is preserved through effects

>> Pipeline context (@p) should be accessible after effects
/var @result3 = @alwaysFails() | show @input | @showContext(@p) | show @input | @retryUntilMax(@p)

## Test 4: Effect stages are pass-through

>> Simple test that effects pass values through unchanged
/var @result4 = "test_value" | show @input | log @input | output @input to stdout