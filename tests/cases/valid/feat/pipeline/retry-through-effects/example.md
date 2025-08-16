# Test Pipeline Retry Through Effect Stages

This test verifies that retry functionality works correctly through multiple effect stages (show, log, output) to reach retryable stages in the pipeline.

## Helper Functions

/exe @generateData(p) = js {
  // Simulate an unstable function that fails first few times
  const attempt = p.try || 1;
  if (attempt <= 2) {
    return `unstable_${attempt}`;
  }
  return `stable_data_${attempt}`;
}

/exe @validator(input) = when first [
  @input == "stable_data_3" => @input
  @pipeline.try < 4 => retry
  * => "failed_validation"
]

## Test 1: Retry through single effect stage

/var @result1 = @generateData(@pipeline) | show @input | @validator

## Test 2: Retry through multiple effect stages  

/var @result2 = @generateData(@pipeline) | show @input | log @input | output @input to stdout | @validator

## Test 3: Verify pipeline context works through effects

/exe @contextChecker(input, p) = js {
  return `Stage ${p.stage}: ${input} (try ${p.try})`;
}

/var @result3 = @generateData(@pipeline) | show @input | @contextChecker(@pipeline) | show @input

## Test 4: Effect stages are pass-through

/var @result4 = "test_value" | show @input | log @input | output @input to stdout
