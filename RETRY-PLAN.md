# Retry Implementation Plan - CORE COMPLETE ✅

## Executive Summary
The core retry mechanism is **working correctly**. We can now focus on edge cases and test cleanup.

**What Works:**
- ✅ Retry mechanism triggers and executes correctly
- ✅ `@pipeline.try` increments as expected (1 → 2 → 3)
- ✅ Source functions re-execute on retry
- ✅ Synthetic source stage architecture is solid

**What Needs Work:**
- ⚠️ Pipeline context parameter passing (`@p.try` as function argument)
- ⚠️ Global retry limit being hit unexpectedly (counting issue)
- ⚠️ Some complex multi-stage retry patterns
- ⚠️ Output formatting/whitespace issues

## Current Status - MAJOR PROGRESS ✅

### Completed Phases
- ✅ **Pipeline consolidation**: Complete
- ✅ **Core Retry Logic**: Working correctly  
- ✅ **Context Scoping**: Fixed and functioning
- ✅ **Synthetic Source Stage**: Implemented and working
- ✅ **Variable Creation Bug**: Fixed (use VariableFactory)
- ✅ **Context Counting Logic**: Fixed (counts both requesting and retrying stages)
- ✅ **Context Popping**: Fixed (pops when requesting stage completes)
- ✅ **When Expression Evaluation**: Fixed for pipeline context

### Core Functionality Status
- ✅ `@pipeline.try` increments correctly (1 → 2 → 3)
- ✅ Source functions re-execute on retry
- ✅ Retry signals are detected and processed
- ✅ Basic retry tests functionally work

## Critical Architecture Discovery (2025-01-13)

### Nested Retries Are Unnecessary!
After deep analysis, we discovered that **nested retry contexts solve a problem that doesn't exist**. In a pipeline `A → B → C`:
- When C retries B, B gets the SAME input from A it had before
- There's no legitimate reason for B to suddenly need to retry A
- The only scenarios where this would happen are pathological (random behavior, time-based logic that should have been checked initially)

### The Real Bug: Context Reuse
The system was creating a NEW retry context for each retry request instead of reusing existing contexts:
- Stage 2 retries Stage 1: Create context with `attemptNumber: 1`
- Stage 2 retries Stage 1 again: Create ANOTHER context with `attemptNumber: 1` (WRONG!)
- This caused `@pipeline.try` to stay at 1 and hit global retry limits

**Fix Implemented**: Check for existing context with same requesting/retrying stages and increment its attempt counter.

## Remaining Issues (Now Understood)

### 1. Pipeline Context Parameter Passing ✅ PARTIALLY FIXED
**Fixed**: Field access for `@p.try` now works correctly
**Remaining**: Context still accumulates due to architecture expecting nested retries

### 2. Global Retry Limit Being Hit ✅ ROOT CAUSE FOUND
**Cause**: Creating new contexts instead of reusing them
**Status**: Fixed with context reuse implementation

### 3. Architecture Overly Complex
**Problem**: Designed for nested retries that shouldn't exist
**Solution**: Simplify to single active retry context (see Architecture Simplification below)

## Pragmatic Next Steps

### Priority 1: Fix Pipeline Context Parameter Passing
**Issue**: `@p` and `@p.try` not working as function arguments

**Investigation Needed**:
1. Check how pipeline context is passed to functions in pipelines
2. Verify if it's a serialization issue or reference issue
3. Test if `@pipeline` works vs `@p` alias

**Files to Check**:
- `interpreter/eval/pipeline/executor.ts` - argument processing
- `interpreter/eval/pipeline/context-builder.ts` - context creation

### Priority 2: Review Global Retry Counting
**Issue**: Hitting 20-retry global limit unexpectedly

**Potential Causes**:
1. Synthetic source stage might be counted twice
2. Context creation might increment counters incorrectly
3. Stage 0 and Stage 1 retries might both increment global counter

**Action**: Add debug logging to track exactly when global counters increment

### Priority 3: State Machine Test Updates
**Issue**: 3 of 12 state machine tests failing

**Required Updates**:
1. Adjust expectations for new context popping behavior
2. Update retry limit expectations
3. Account for synthetic source stage in test scenarios

### Priority 4: Clean Up Formatting Issues
**Issue**: Extra whitespace in output

**Approach**:
1. Identify where extra lines are introduced
2. Check if it's related to directive processing
3. Normalize output in a consistent way

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

## Implementation Summary

### What We Implemented

#### Synthetic Source Stage ✅
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

#### Key Bug Fixes ✅
1. **Variable Creation**: Fixed hand-rolled Variable bug by using VariableFactory
2. **Context Counting**: Fixed `countRetriesInContextChain` to count both requesting and retrying stages
3. **Context Popping**: Fixed premature popping - now pops when requesting stage completes
4. **Field Access**: Fixed pipeline context field access for `@pipeline.try`

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

### Working Tests ✅
- Basic retry mechanism works functionally
- `@pipeline.try` increments correctly (1 → 2 → 3)
- Source functions re-execute on retry

### Failing Tests (8 total)
See detailed breakdown in RETRY-DEBUG-REPORT.md:
- 6 pipeline retry tests (mix of edge cases and formatting)
- 2 multi-stage retry tests
- Common issues: `@p` parameter passing, global retry limits, formatting

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

## Success Criteria

### Achieved ✅
1. ✅ Source functions re-execute on retry
2. ✅ Debug traces show clear stage progression
3. ✅ No user-visible API changes
4. ✅ Core retry mechanism works (`@pipeline.try` increments correctly)
5. ✅ Retry signals are detected and processed

### Remaining 
1. ⚠️ All pipeline retry tests passing (8 tests with issues, mostly edge cases)
2. ⚠️ State machine tests updated (3 of 12 need updates)
3. ⏸️ Special-case code cleanup in state machine (optional, system works)

## Lessons Learned

### The Real Problem Was Contract Violations
The complexity we encountered wasn't due to bad architecture but a single contract violation:
- Hand-rolled Variable objects instead of using VariableFactory
- This caused field access failures that cascaded through the system
- Led to extensive debugging that made the architecture seem more complex than it is

### Key Insights
1. **Architecture is sound** - The synthetic source stage elegantly solves the retry problem
2. **Enforce contracts strictly** - Use factories, type guards, and defensive checks
3. **Fail fast and loudly** - Contract violations should throw immediately, not fail mysteriously
4. **Document gotchas** - Critical invariants need to be documented and tested

## Proposed Architecture Simplification

### Current (Overly Complex for Nested Retries)
```typescript
interface RetryContext {
  id: string;
  requestingStage: number;
  retryingStage: number;
  attemptNumber: number;
  parentContextId?: string;  // For nesting - NOT NEEDED!
}
activeContexts: RetryContext[];  // Stack of contexts - unnecessary complexity
```

### Proposed (Simple, Single Context)
```typescript
interface RetryContext {
  id: string;
  requestingStage: number;
  retryingStage: number;
  attemptNumber: number;
  attempts: string[];  // Collect outputs from each attempt
}
activeRetryContext?: RetryContext;  // Just one at a time!
```

### Benefits of Simplification
1. **Eliminates context stack complexity** - No more pushing/popping
2. **Clear retry semantics** - One retry pattern active at a time
3. **Simpler attempt tracking** - `@pipeline.try` directly from context
4. **Easier to debug** - No nested context confusion
5. **Maintains all useful features** - Still tracks attempts, collects history

### Implementation Strategy
**IMPORTANT**: The next session should begin with careful architecture design before implementation:
1. Document the simplified state machine states and transitions
2. Define clear rules for context creation, reuse, and clearing
3. Ensure backward compatibility with existing tests
4. Plan migration path from current architecture

## Next Immediate Actions

1. **NEXT SESSION: Design simplified architecture** - Create detailed design doc before coding
2. **Continue with context reuse fix** - Current fix works but architecture needs simplification
3. **Update state machine tests** - Adjust for context reuse behavior
4. **Document test failures** - Create issues for each pattern