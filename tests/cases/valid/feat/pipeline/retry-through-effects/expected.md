# Test Pipeline Retry Through Effect Stages

This test verifies that retry functionality works correctly through multiple effect stages (show, log, output) to reach retryable stages in the pipeline.

## Helper Functions

## Test 1: Retry through single effect stage

unstable_1

unstable_2

stable_data_3

## Test 2: Retry through multiple effect stages  

unstable_1

unstable_2

stable_data_3

## Test 3: Verify pipeline context works through effects

unstable_1

Stage 2: unstable_1 (try 1)

unstable_2

Stage 2: unstable_2 (try 2)

stable_data_3

Stage 2: stable_data_3 (try 3)

## Test 4: Effect stages are pass-through

test_value

test_value