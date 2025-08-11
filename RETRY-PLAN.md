# Retry Implementation Plan

## Current Status
- Pipeline consolidation: ✅ Complete
- Phase 1 (Core Retry Logic): ✅ Complete
- Phase 2 (Context Scoping): ✅ Complete
- Phase 3 (Test Updates): 🔄 In Progress
  - State machine tests: ✅ All passing
  - Pipeline retry tests: ❌ 9 tests failing (need test case updates)

## Implementation Completed

### 1. Stage 0 Retryability Check ✅
When stage 1 requests retry of stage 0, the system now:
- Checks if stage 0's input is retryable (came from a function)
- If retryable: Re-executes the source function
- If not retryable: Throws error "Input is not a function and cannot be retried"

**Examples:**
```mlld
# RETRYABLE - @claude() is a function call
/var @answer = @claude("explain quantum mechanics")
/var @new = @answer | @review | @crosscheck

# NOT RETRYABLE - literal string value
/var @answer = "The capital of France is Paris"
/var @new = @answer | @review | @crosscheck
```

### 2. Context-Scoped Pipeline Variables ✅
The `@pipeline` object is now scoped to the current retry context:
- `@pipeline.try` - Current attempt number within this context
- `@pipeline.tries` - Array of previous attempts within this context (context-local)
- `@pipeline.all.tries` - Lazy-evaluated accumulator of ALL retry attempts across ALL contexts

### 3. Variable Provenance Tracking ✅
Variables now have metadata to track their source:
- Added `isRetryable` flag to variable metadata
- Set to `true` when variable comes from function execution (ExecInvocation, command, code)
- Set to `false` for literal values
- Metadata is passed through to pipeline executor with source function reference

## Files Modified

### Pipeline Executor (`interpreter/eval/pipeline/executor.ts`) ✅
- Added retryability check for stage 0
- Stores original function reference for re-execution
- Re-executes source function when stage 0 is retried
- Clear error handling for non-retryable inputs

### State Machine (`interpreter/eval/pipeline/state-machine.ts`) ✅
- Added special handling for stage 0 self-retry
- Tracks retryability of initial input
- Uses "root" context for stage 0 self-retries
- Proper retry limit enforcement for all scenarios

### Context Builder (`interpreter/eval/pipeline/context-builder.ts`) ✅
- Implemented `@pipeline.all.tries` with lazy evaluation
- Context-local `@pipeline.tries` (only attempts from current context)
- Properly accumulates retry history across all contexts

### Variable System (`core/types/variable/VariableTypes.ts`) ✅
- Added `isRetryable` and `sourceFunction` metadata fields
- Set in `interpreter/eval/var.ts` based on variable source
- Metadata preserved through pipeline transformations

## Test Updates

### Tests Updated and Passing ✅
- ✅ All state machine tests (12 tests)
  - Retry limit enforcement
  - Context tracking
  - Event recording
  - Cascade retry scenarios

### Tests Requiring Test Case Updates ❌

#### Pipeline Retry Tests (9 tests failing)
These tests are failing because they use literal values as pipeline inputs, which are not retryable:
- `pipeline-retry-basic` - Uses literal "success" which cannot be retried
- `pipeline-retry-attempt-tracking` - Uses literal string input
- `pipeline-retry-best-of-n` - Uses literal input
- `pipeline-retry-complex-logic` - Uses literal input
- `pipeline-retry-conditional-fallback` - Uses literal input
- `pipeline-retry-when-expression` - Uses literal input
- `pipeline-multi-stage-retry` - Uses literal input
- `pipeline-context-preservation` - Context scoping test
- `file-reference-interpolation` - Unrelated to retry, needs investigation

**Current Behavior**: When these tests run, they correctly produce error messages like:
- "Stage 0 cannot retry: Input is not a function and cannot be retried" (stage 0 self-retry)
- "Cannot retry stage 0: Input is not a function and cannot be retried" (stage 1 retrying stage 0)

**Solution**: Update test cases to:
1. Use retryable sources (`@exe` functions, `run` commands, `code` blocks) for tests that need retry to work
2. Add separate tests that verify the error messages when trying to retry non-retryable sources
3. Test a variety of retryable source types to ensure comprehensive coverage

## Summary of Changes

### What Was Implemented
1. **Retryability Tracking** - Variables now track whether they came from functions vs literals
2. **Stage 0 Retry Logic** - Stage 0 can retry itself if source was a function
3. **Context-Local Tries** - `@pipeline.tries` is now scoped to current retry context
4. **Global Accumulator** - `@pipeline.all.tries` provides access to all retry attempts
5. **State Machine Updates** - Proper handling of stage 0 self-retry with retry limits

### Remaining Work
1. **Update Test Cases** - Pipeline retry tests need to be updated to test realistic scenarios:
   - Use function sources (`@exe` invocations, `run` commands, `code` blocks) as pipeline inputs
   - Test both retryable sources (functions) and non-retryable sources (literals) 
   - Verify proper error messages when attempting to retry non-retryable inputs
   - Include variety of valid retryable sources to ensure comprehensive coverage
2. **Documentation** - Update docs to explain the retry behavior and limitations

## Key Principles

1. **No self-retry**: No stage can retry itself
2. **Upstream retry only**: Stage N can only retry stage N-1
3. **Stage 0 conditional**: Stage 0 can only be retried if source is a function
4. **Context isolation**: Each retry context maintains its own try/tries
5. **Global tracking**: Global accumulator available via @pipeline.all.tries