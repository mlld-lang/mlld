# Retry Implementation Plan - REVISED

## Current Status
- Pipeline consolidation: ✅ Complete
- Phase 1 (Core Retry Logic): ✅ Complete  
- Phase 2 (Context Scoping): ✅ Complete
- Phase 3 (Test Updates): ✅ Complete (tests updated to use retryable sources)
- Phase 4 (Source Function Bug): ❌ **Critical Issue Found**
  - Source functions not being re-executed on retry
  - Root cause: Pipeline architecture treats source as external to pipeline
- Phase 5 (Synthetic Stage Solution): 🚧 **In Progress**

## Problem Analysis

### The Core Issue
When we have `@getInput() | @testRetry`:
- Pipeline has only ONE stage: `@testRetry` (stage 0)
- `@getInput()` executes BEFORE pipeline starts (provides initial input)
- When `@testRetry` returns 'retry', it needs to retry the input generation
- BUT: Input generation isn't a pipeline stage, so retry mechanism doesn't work

### Current (Broken) Architecture
```
[External: @getInput()] → [Pipeline: @testRetry]
                           └─ Returns 'retry'
                           └─ Needs to re-execute external source (FAILS)
```

### Why It Fails
1. State machine doesn't push retry context for "stage 0 self-retry"
2. `contextAttempt` stays at 1 forever
3. Executor's condition `if (contextAttempt > 1)` never triggers
4. Source function never gets called again

## Chosen Solution: Synthetic Source Stage

Based on architectural analysis, we're implementing the **synthetic stage approach** which normalizes all pipelines to include the source as a real stage.

### New Architecture
```
[Pipeline: @__source__ | @testRetry]
           ↑ stage 0     ↑ stage 1
           └─ Returns fresh input on retry
```

### Benefits
1. **Eliminates ALL special cases** - Every retry is just "retry previous stage"
2. **Fixes the bug directly** - Normal retry → normal context push → sourceFunction executes
3. **Simplifies codebase** - Deletes special-case branches, not adds them
4. **Better debugging** - Clear event traces with no hidden "pre-pipeline" work
5. **Minimal code changes** - Compile-time transformation, reuses all existing infrastructure

## Implementation Plan

### Phase 1: Add Synthetic Source Stage 🚧
**File: `interpreter/eval/pipeline/unified-processor.ts`**
```typescript
// Create synthetic source stage
const SOURCE_STAGE: PipelineCommand = {
  rawIdentifier: '__source__',
  identifier: [],
  args: [],
  fields: [],
  rawArgs: []
};

// Prepend to pipeline when we have a retryable source
const normalizedPipeline = detected.isRetryable 
  ? [SOURCE_STAGE, ...detected.pipeline] 
  : detected.pipeline;
```

### Phase 2: Update Executor to Handle `@__source__` 🚧
**File: `interpreter/eval/pipeline/executor.ts`**
```typescript
// In executeStage, before normal command resolution:
if (command.rawIdentifier === '__source__') {
  const firstTime = !this.sourceExecutedOnce;
  this.sourceExecutedOnce = true;
  
  if (firstTime) {
    return { type: 'success', output: this.initialInput };
  }
  
  if (!this.isRetryable) {
    throw new Error('Cannot retry stage 0: Input is not a function and cannot be retried');
  }
  
  const fresh = await this.sourceFunction();
  return { type: 'success', output: fresh };
}
```

### Phase 3: Clean Up State Machine 🚧
**File: `interpreter/eval/pipeline/state-machine.ts`**
- DELETE the special "stage 0 self-retry" branch
- DELETE the "root context" hack
- Keep normal retry logic which now handles everything

### Phase 4: Adjust User-Facing Context 🚧
**File: `interpreter/eval/pipeline/context-builder.ts`**
- When `hasSourceStage` is true:
  - `@pipeline.stage` = actual stage - 1 (hide synthetic stage)
  - `@pipeline.length` = actual length - 1
  - `@pipeline[0]` = still the base input (not @__source__ output)
  - Filter out stage 0 from `previousOutputs`

### Phase 5: Update Tests 🚧
- All existing retry tests should pass WITHOUT modification
- Add tests for the synthetic stage behavior
- Add debug tracing tests

## Debugging Strategy

### Add Pipeline Trace
```typescript
// Set PIPELINE_TRACE=1 for debug output:
┌─ plan: __source__ → testRetry
├─ s0 start (attempt 1) mode=initial   output="success"
├─ s0 ok    output="success"
├─ s1 start (attempt 1) input="success"
├─ s1 retry request → retry s0
├─ s0 start (attempt 2) mode=fresh     output="success-new"
├─ s0 ok    output="success-new"
├─ s1 start (attempt 2) input="success-new"
└─ s1 ok    output="3"
```

### Enhanced Source Stage Tracing
Show whether `@__source__` is returning the initial cached value or executing the source function:
- `mode=initial` - First execution, returning the already-computed initial input (no double execution)
- `mode=fresh` - Retry execution, calling sourceFunction() for new input
- `mode=literal` - Non-retryable literal, would throw error if retried

This makes it crystal clear when the source function is actually being called vs returning cached input.

## Test Status

### Already Updated ✅
All test files have been updated to use retryable sources:
- `pipeline-retry-basic` → Uses `@getInput()` function
- `pipeline-retry-attempt-tracking` → Uses `@getBase()` function  
- `pipeline-retry-best-of-n` → Uses `@getPrompt()` function
- `pipeline-retry-complex-logic` → Uses `@getData()` function
- `pipeline-retry-conditional-fallback` → Uses `@getSeed()` function
- `pipeline-retry-when-expression` → Uses `@getTestData()` function
- `pipeline-multi-stage-retry` → Uses `@getInitial()` function
- `pipeline-context-preservation` → Uses `@getOriginalData()` function

### Expected Behavior After Fix
With synthetic source stage, all tests should pass because:
1. Source functions will be real pipeline stages
2. Retry will work through normal mechanism
3. No special cases needed

## Key Design Decisions

### Why Synthetic Stage Over Separate Abstractions
After architectural analysis, we chose the synthetic stage approach over creating separate `PipelineSource` and `PipelineStage` abstractions because:

1. **Sources ARE functionally stages** - They produce output, can fail, need retry
2. **Simpler implementation** - Compile-time transformation vs major refactoring
3. **Deletes complexity** - Removes special cases rather than adding abstractions
4. **Leverages existing infrastructure** - All retry logic just works
5. **Better debugging** - Uniform event traces with no hidden inputs

### Implementation Principles

1. **Normalize at compile time** - Transform pipelines before execution
2. **Hide from users** - Synthetic stage is internal implementation detail
3. **Preserve semantics** - User-facing `@pipeline` object unchanged
4. **Delete special cases** - No more "stage 0 self-retry" branches
5. **Uniform retry model** - Every retry is "retry previous stage"

## Timeline

- **Week 1**: Implement synthetic stage in unified-processor
- **Week 2**: Update executor and clean up state machine
- **Week 3**: Adjust context builder for user-facing compatibility
- **Week 4**: Complete testing and documentation

## Success Criteria

1. All pipeline retry tests pass without modification
2. Source functions re-execute on retry
3. Special-case code deleted from state machine
4. Debug traces show clear stage progression
5. No user-visible API changes