# Retry Implementation Plan

## Current Status
- Pipeline consolidation: ✅ Complete
- Retry tests failing: 9 tests need fixes
- State machine tests: 4 tests need updates

## Implementation Requirements

### 1. Stage 0 Retryability Check
When stage 1 requests retry of stage 0, the system must:
- Check if stage 0's input is retryable (came from a function)
- If retryable: Re-execute the source function
- If not retryable: Throw error "Input is not a function and cannot be retried"

**Examples:**
```mlld
# RETRYABLE - @claude() is a function call
/var @answer = @claude("explain quantum mechanics")
/var @new = @answer | @review | @crosscheck

# NOT RETRYABLE - literal string value
/var @answer = "The capital of France is Paris"
/var @new = @answer | @review | @crosscheck
```

### 2. Context-Scoped Pipeline Variables
The `@pipeline` object must be scoped to the current retry context:
- `@pipeline.try` - Current attempt number within this context
- `@pipeline.tries` - Array of previous attempts within this context
- `@pipeline.all.tries` - Lazy-evaluated accumulator of ALL retry attempts across ALL contexts

### 3. Variable Provenance Tracking
Variables need metadata to track their source:
- Add `isRetryable` flag to variable metadata
- Set to `true` when variable comes from function execution
- Set to `false` for literal values
- Pass this metadata to pipeline executor

## Files to Modify

### Pipeline Executor (`interpreter/eval/pipeline/executor.ts`)
- Add retryability check for stage 0
- Store original function reference for re-execution
- Implement clear error handling for non-retryable inputs

### State Machine (`interpreter/eval/pipeline/state-machine.ts`)
- Add special handling for stage 0 retry requests
- Track retryability of initial input
- Ensure proper error propagation

### Context Builder (`interpreter/eval/pipeline/context-builder.ts`)
- Implement `@pipeline.all.tries` with lazy evaluation
- Maintain context-local `@pipeline.tries`
- Properly accumulate retry history across contexts

### Variable System (`interpreter/env/Variable.ts` and related)
- Add `isRetryable` metadata field
- Set flag based on variable source
- Preserve metadata through pipeline transformations

## Test Updates Required

### Passing Tests (No Changes Needed)
- ✅ State machine basic retry tests
- ✅ Context building tests
- ✅ Event recording tests

### Tests Requiring Updates

#### State Machine Tests (4 tests)
- `should enforce per-stage retry limit`
- `should enforce global retry limit per stage`
- `should enforce per-context retry limit`
- `should provide accurate context information to stages`

**Changes needed**: Update expectations for new retry semantics and event types

#### Pipeline Retry Tests (7 tests)
- `pipeline-retry-basic`
- `pipeline-retry-attempt-tracking`
- `pipeline-retry-best-of-n`
- `pipeline-retry-complex-logic`
- `pipeline-retry-conditional-fallback`
- `pipeline-retry-when-expression`
- `pipeline-multi-stage-retry`

**Changes needed**: Account for upstream retry behavior and stage 0 handling

#### Other Pipeline Tests (2 tests)
- `pipeline-context-preservation`
- `pipeline-when-actions-pipes`

**Changes needed**: Update for new context scoping and pipeline behavior

## Implementation Order

### Phase 1: Core Retry Logic (2-3 hours)
1. **Add retryability tracking to variables**
   - Add `isRetryable` flag to variable metadata
   - Set based on source (function vs literal)
   - Preserve through pipeline execution

2. **Implement stage 0 retry handling**
   - Check retryability flag in executor
   - Re-execute source function if retryable
   - Throw clear error if not retryable

### Phase 2: Context Scoping (1-2 hours)
3. **Fix pipeline context variables**
   - Keep `@pipeline.tries` context-local
   - Add `@pipeline.all.tries` accumulator
   - Ensure proper lazy evaluation

### Phase 3: Test Updates (1-2 hours)
4. **Update state machine tests**
   - Fix retry limit expectations
   - Update event type expectations

5. **Fix pipeline retry tests**
   - Account for new retry semantics
   - Handle stage 0 special cases
   - Adjust global retry limits if needed

## Key Principles

1. **No self-retry**: No stage can retry itself
2. **Upstream retry only**: Stage N can only retry stage N-1
3. **Stage 0 conditional**: Stage 0 can only be retried if source is a function
4. **Context isolation**: Each retry context maintains its own try/tries
5. **Global tracking**: Global accumulator available via @pipeline.all.tries