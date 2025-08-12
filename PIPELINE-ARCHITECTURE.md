# Pipeline Architecture

## Overview

The mlld pipeline system enables composable data transformations through a chain of functions, with retry capabilities for handling transient failures. This document describes the simplified architecture, state machine, and retry mechanisms.

## Core Concepts

### Pipeline Structure

A pipeline consists of stages that transform data sequentially:

```mlld
/var @result = @input | @stage1 | @stage2 | @stage3
```

Each stage:
- Receives input from the previous stage (or initial input for stage 0)
- Executes a transformation function
- Passes output to the next stage
- Can request retry of the previous stage

### Key Principles

1. **No Self-Retry**: No stage can retry itself
2. **Upstream Retry Only**: Stage N can only request retry of stage N-1
3. **Stage 0 Conditional**: Stage 0 can only be retried if its source is a function
4. **Context Isolation**: Each retry context maintains its own state
5. **Single Active Context**: Only one retry context is active at a time (no nested retries)

## State Machine Architecture

### Core Components

#### 1. Pipeline State Machine (`state-machine.ts`)

Manages pipeline execution state through a simplified event-sourced architecture:

```typescript
interface PipelineState {
  status: 'IDLE' | 'RUNNING' | 'RETRYING' | 'COMPLETED' | 'FAILED';
  currentStage: number;
  currentInput: string;
  baseInput: string;
  events: PipelineEvent[];
  
  // Simplified retry tracking
  activeRetryContext?: RetryContext;  // Just one active context
  globalStageRetryCount: Map<number, number>;   // Global safety limit
  
  // For @pipeline.retries.all accumulation
  allRetryHistory: Map<string, string[]>;       // contextId → all outputs
}
```

#### 2. Retry Context

Tracks retry requests (single active context):

```typescript
interface RetryContext {
  id: string;                    // Unique context ID
  requestingStage: number;       // Stage requesting retry
  retryingStage: number;         // Stage being retried
  attemptNumber: number;         // Current attempt (1-based)
  allAttempts: string[];         // All outputs from retry attempts
}
```

### Event Types

The state machine tracks these events:

- `PIPELINE_START`: Pipeline begins execution
- `STAGE_START`: Stage begins (includes contextId if in retry)
- `STAGE_SUCCESS`: Stage completes successfully
- `STAGE_RETRY_REQUEST`: Stage N requests retry of stage N-1
- `STAGE_FAILURE`: Stage encounters unrecoverable error
- `PIPELINE_COMPLETE`: Pipeline finishes successfully
- `PIPELINE_ABORT`: Pipeline aborted (e.g., retry limit exceeded)

### Retry Limits

Two independent limits prevent infinite loops:

1. **Per-Context Limit** (10): Maximum retries within a single context
2. **Global Per-Stage Limit** (20): Total retries for any stage across all contexts

## Simplified Retry Mechanism

### How It Works

When stage N requests retry of stage N-1:

1. Check if existing context for this retry pattern
2. If yes: reuse and increment attempt counter
3. If no: create new retry context
4. Check retry limits (both per-context and global)
5. Re-execute stage N-1 with original input
6. Continue pipeline from stage N-1
7. Clear context when requesting stage completes

### Retry Example

Pipeline: A → B → C → D

1. Initial execution: A(base) → B(a1) → C(b1) → D(c1)
2. D requests retry of C (creates context ctx1)
3. C re-executes with b1
4. C succeeds with c2
5. D re-executes with c2
6. D completes → context ctx1 is cleared

### Why No Nested Retries?

In the simplified model, nested retries are not supported because they represent pathological cases:

If C is retried by D and then C requests retry of B:
- B would receive the SAME input from A that it got before
- B's logic hasn't changed
- There's no legitimate reason for B to suddenly retry A
- This would indicate non-deterministic or poorly designed functions

### Context Management

```
// Single active context at a time
activeRetryContext: {
  id: "ctx1",
  requestingStage: 3,  // D requesting
  retryingStage: 2,    // C being retried  
  attemptNumber: 2,    // Second attempt
  allAttempts: ["c1"]  // Previous outputs
}
```

The context is cleared when the requesting stage completes successfully.

## Stage 0 Retryability

### The Challenge

Stage 0 is special because it has no previous stage. When stage 1 requests retry of stage 0:
- If stage 0's input came from a function → Re-execute the function
- If stage 0's input is a literal value → Throw error

### Examples

**Retryable** (function source):
```mlld
/var @answer = @claude("explain quantum mechanics")
/var @result = @answer | @review | @validate
# @review can retry @answer because @claude() is a function
```

**Not Retryable** (literal source):
```mlld
/var @answer = "The capital of France is Paris"
/var @result = @answer | @review | @validate
# @review CANNOT retry @answer - will throw error
```

### Implementation

The pipeline executor must:
1. Track whether stage 0's input is retryable
2. Store reference to the source function if applicable
3. Check retryability when retry is requested
4. Throw descriptive error for non-retryable inputs

## Pipeline Context Variables

### Context Scope and Lifecycle

**Critical Concept**: Pipeline context is scoped to the retry pattern, not the entire pipeline.

In the simplified model:
- Each retry context is independent (no nested retries)
- Stages **within** a retry context share context state
- Stages **outside** a retry context get fresh context
- Context is cleared when the requesting stage completes

### Local Context (`@pipeline` / `@p`)

Each stage receives a pipeline context object:

```javascript
@pipeline = {
  try: 2,                        // Current attempt (within active retry context)
  tries: ["attempt1"],           // Previous attempts (within active retry context)
  stage: 1,                      // Current stage number (1-indexed, user-visible)
  0: "base",                     // Stage 0 input
  1: "stage0_output",           // Stage 1 input
  // ... array-style access to all previous outputs
}
```

**Important**: 
- `try` and `tries` are **local to the retry context**
- Stages outside the retry loop see `try: 1` and `tries: []`
- This is by design - each stage starts fresh unless part of an active retry

### Global Context (`@pipeline.retries.all`)

For accessing retry history across all contexts:

```javascript
@pipeline.retries = {
  all: [                         // All attempts from ALL retry contexts
    ["attempt1", "attempt2"],    // Context 1 attempts
    ["attempt1", "attempt2", "attempt3"], // Context 2 attempts
  ]
}
```

### Example: Context Behavior

```mlld
/exe @stage1(input) = `s1: @input`
/exe @stage2(input) = when: [
  @pipeline.try < 3 => retry    # Retry stage 1
  * => @input
]
/exe @stage3(input) = `s3: @input, try: @pipeline.try, history: [@pipeline.tries]`

/var @result = @getData() | @stage1 | @stage2 | @stage3
```

Execution flow:
1. Stage 1 executes (try: 1)
2. Stage 2 executes (try: 1), returns retry
3. Stage 1 re-executes (try: 1, fresh context for stage 1)
4. Stage 2 re-executes (try: 2, within retry context)
5. Stage 2 returns retry again
6. Stage 1 re-executes (try: 2, within retry context)
7. Stage 2 re-executes (try: 3, within retry context)
8. Stage 2 succeeds, returns input
9. **Stage 3 executes (try: 1, tries: [], NEW context)** ← Key point!

Stage 3 is NOT part of the retry context between stages 1-2, so it gets a fresh context.

## Execution Flow

### Pipeline Executor (`executor.ts`)

1. Receives pipeline definition and initial input
2. Creates state machine with N stages
3. Starts pipeline with `START` action
4. For each `EXECUTE_STAGE` response:
   - Creates stage environment with context
   - Executes stage function
   - Handles result (success/retry/error)
   - Transitions state machine with result
5. Continues until `COMPLETE`, `ERROR`, or `ABORT`

### Stage Execution

Each stage:
1. Receives environment with `@input` and `@pipeline` variables
2. Executes its transformation function
3. Returns one of:
   - String output (success)
   - `"retry"` keyword (request retry)
   - Error (failure)

### Context Building (`context-builder.ts`)

For each stage execution:
1. Create child environment
2. Set `@input` variable with stage input
3. Build `@pipeline` context object:
   - Local retry information (try/tries)
   - Stage metadata
   - Array-style access to previous outputs
4. Provide lazy evaluation for `@pipeline.global`

## Error Handling

### Retry Limit Exceeded

When limits are hit:
- Per-context: "Stage X exceeded retry limit in context Y"
- Global: "Stage X exceeded global retry limit (20)"

### Non-Retryable Stage 0

When stage 1 requests retry of non-function stage 0:
- Error: "Input is not a function and cannot be retried"
- Includes source location and value information

### Stage Failures

Unrecoverable errors include:
- Stage number in error message
- Command that failed
- Full error details and stack trace

## Testing Considerations

### Test Patterns

1. **Basic Retry**: Test single-level retry behavior
2. **Context Reuse**: Test that same retry pattern reuses context
3. **Limit Testing**: Verify both per-context and global limits
4. **Stage 0 Retryability**: Test function vs literal sources
5. **Context Isolation**: Verify try/tries stay context-local
6. **Global Accumulation**: Test @pipeline.retries.all

### Common Issues

1. **Infinite Loops**: Without proper limits, retries can loop forever
2. **Context Isolation**: Stages outside retry context get fresh @pipeline state
3. **Stage 0 Assumptions**: Tests assuming stage 0 can always retry
4. **Context Reuse**: Same retry pattern should reuse existing context, not create new

## Critical Gotchas and Debugging Guide

### Critical Invariants (MUST Follow)

#### 1. **Always Use VariableFactory for System Variables**
```typescript
// ❌ WRONG - Hand-rolled Variable-like object
return {
  type: 'object',
  name: 'pipeline',
  value: contextData,
  metadata: { isPipelineContext: true }
};

// ✅ CORRECT - Use VariableFactory
return createObjectVariable(
  'pipeline',
  contextData,
  false, // isComplex
  source,
  { isPipelineContext: true, isSystem: true }
);
```

**Why this matters**: Hand-rolled Variables violate type contracts and cause mysterious field access failures. This single issue can cascade into:
- Field access errors ("Field 'try' not found")
- When conditions evaluating incorrectly
- Retry signals not being sent
- Hours of debugging across multiple layers

#### 2. **Synthetic Source Stage (`@__source__`)**
When a pipeline has a retryable source (function), a synthetic stage is added:
```mlld
# User writes:
/var @result = @getData() | @transform

# Internally becomes:
/var @result = @__source__ | @transform
# Where @__source__ returns @getData() on first run, re-executes on retry
```

**Impact**:
- Stage numbering shifts (user's stage 0 is internal stage 1)
- Context tracking must account for hidden stage
- Debug output shows different stage numbers than user expects

#### 3. **Context Lifecycle and Popping**
```typescript
// Context should be popped when REQUESTING stage completes, not retrying stage
if (currentContext && stage === currentContext.requestingStage) {
  // Pop context - requesting stage completed successfully
  this.state.activeContexts.pop();
}
```

**Common mistake**: Popping context when retrying stage completes causes:
- Context disappears before requesting stage can use it
- `@pipeline.try` stuck at 1
- Retry limits hit immediately

### Debugging Techniques

#### 1. **Enable Debug Output**
```bash
# Full pipeline debug output
MLLD_DEBUG=true npm test <test-name>

# Specific debug flags
DEBUG_EXEC=true      # Execution details
DEBUG_WHEN=true      # When expression evaluation
DEBUG_FOR=true       # For loop execution
DEBUG_PIPELINE=true  # Pipeline-specific debugging
```

#### 2. **Understanding Stage Numbers**
```
User View:           @getData() | @transform | @validate
                         ↓           ↓            ↓
Internal (no retry): stage 0      stage 1     stage 2

Internal (retryable): @__source__ | @transform | @validate
                         ↓            ↓            ↓
                      stage 0      stage 1     stage 2
                    (synthetic)   (user's 0)  (user's 1)
```

#### 3. **Tracking Retry Context Flow**
Look for these patterns in debug output:
```
🔄 RETRY DETECTED: { stage: 2, output: 'retry', willRetryFrom: 1 }
[StateMachine] handleStageRetry: {
  requestingStage: 1,    // Who's asking for retry
  targetStage: 0,        // Who will be retried
  activeContexts: 0      // Current context depth
}
```

### Common Failure Patterns

#### 1. **"Field not found in object" Errors**
**Symptom**: `@pipeline.try` or other fields fail to resolve
**Cause**: Variable not created through factory
**Fix**: Use proper Variable factories for all system variables

#### 2. **Retry Attempts Stuck at 1**
**Symptom**: `@pipeline.try` always equals 1
**Causes**:
- Context popped too early
- Wrong field used (`context.attempt` vs `context.contextAttempt`)
- `countRetriesInContextChain` not counting requesting stage

#### 3. **Global Retry Limit Hit Immediately**
**Symptom**: "Stage X exceeded global retry limit (20)"
**Causes**:
- Double-counting retries with synthetic source
- Context not being created properly
- Increment happening in wrong place

#### 4. **Pipeline Context Not Available in Functions**
**Symptom**: `@p` or `@pipeline` undefined in function calls
**Causes**:
- Context not being passed as parameter correctly
- Parameter binding issues with pipeline functions

### Architecture Decision Rationale

#### Why Synthetic Source Stage?
- **Problem**: Stage 0 needs to be retryable when source is a function
- **Alternative considered**: Separate abstractions for sources vs stages
- **Decision**: Normalize all pipelines to have source as stage 0
- **Benefits**: Uniform retry logic, no special cases
- **Trade-off**: Hidden complexity in stage numbering

#### Why Requesting vs Retrying Stage Distinction?
- **Problem**: Need to track which stage initiated retry and which is being retried
- **Purpose**: Proper context management and attempt counting
- **Complexity**: Both stages need tracking for attempt counts
- **Key insight**: Requesting stage also gets re-executed after retry

### Testing Gotchas

1. **Whitespace in Expected Output**: Many tests fail due to trailing spaces or extra newlines
2. **Global State Between Tests**: Ensure state machine is properly reset
3. **Synthetic Source Visibility**: Tests may see different stage numbers than expected
4. **Context Timing**: Verify contexts are active when expected

## Future Enhancements

### Planned Improvements

1. **Configurable Limits**: Allow per-pipeline limit configuration
2. **Retry Strategies**: Exponential backoff, jitter, etc.
3. **Partial Success**: Allow stages to return partial results
4. **Retry Metadata**: Pass retry reason/context to retried stage
5. **Observability**: Better logging and debugging for retry chains
6. **Contract Validation**: Runtime checks for Variable creation invariants

### Under Consideration

1. **Conditional Retries**: Retry only on specific error types
2. **Circuit Breakers**: Stop retrying after repeated failures
3. **Retry Budgets**: Global retry budget across pipelines
4. **Async Pipelines**: Support for async stage functions
5. **Pipeline Composition**: Pipelines as stages in other pipelines