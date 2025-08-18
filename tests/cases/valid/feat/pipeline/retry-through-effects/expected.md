# Test Pipeline Retry Through Effect Stages

This test verifies that retry functionality works correctly through multiple effect stages (show, log, output) to reach retryable stages in the pipeline.

## Helper Functions

## Test 1: Retry through single effect stage

failed_attempt

failed_attempt

success_after_3_attempts

## Test 2: Retry through multiple effect stages  

failed_attempt

failed_attempt

success_after_3_attempts

## Test 3: Verify pipeline context is preserved through effects

failed_attempt

Stage 2: failed_attempt (try 1)

failed_attempt

Stage 2: failed_attempt (try 2)

Stage 2: failed_attempt (try 3)

success_after_3_attempts

## Test 4: Effect stages are pass-through

test_value

test_value