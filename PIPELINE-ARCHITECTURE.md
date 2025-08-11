# Pipeline Architecture

## Overview

The mlld pipeline system enables composable data transformations through a chain of functions, with sophisticated retry capabilities for handling transient failures. This document describes the architecture, state machine, and retry mechanisms.

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
5. **Recursive Retries**: Retries can trigger more retries (nested contexts)

## State Machine Architecture

### Core Components

#### 1. Pipeline State Machine (`state-machine.ts`)

Manages pipeline execution state through an event-sourced architecture:

```typescript
interface PipelineState {
  status: 'IDLE' | 'RUNNING' | 'RETRYING' | 'COMPLETED' | 'FAILED';
  currentStage: number;
  currentInput: string;
  baseInput: string;
  events: PipelineEvent[];
  
  // Retry context management
  activeContexts: RetryContext[];
  contextRetryCount: Map<string, Map<number, number>>;
  globalStageRetryCount: Map<number, number>;
}
```

#### 2. Retry Context

Tracks nested retry requests:

```typescript
interface RetryContext {
  id: string;                    // Unique context ID
  requestingStage: number;       // Stage requesting retry (e.g., C)
  retryingStage: number;         // Stage being retried (e.g., B)
  attemptNumber: number;         // Attempt within this context
  parentContextId?: string;      // Parent context if nested
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

## Recursive Retry Mechanism

### How It Works

When stage N requests retry of stage N-1:

1. Create new retry context
2. Check retry limits (both per-context and global)
3. Push context onto active context stack
4. Re-execute stage N-1 with original input
5. Continue pipeline from stage N-1

### Nested Retry Example

Pipeline: A → B → C → D

1. Initial execution: A(base) → B(a1) → C(b1) → D(c1)
2. D requests retry of C (creates context ctx1)
3. C executes with b1
4. C requests retry of B (creates context ctx2, parent: ctx1)
5. B executes with a1
6. B requests retry of A (creates context ctx3, parent: ctx2)
7. A executes with base
8. Success chain unwinds: A → B → C → D

### Context Stack Management

```
Active Contexts Stack:
[
  { id: "ctx1", requesting: 3, retrying: 2 },  // D retrying C
  { id: "ctx2", requesting: 2, retrying: 1 },  // C retrying B
  { id: "ctx3", requesting: 1, retrying: 0 }   // B retrying A
]
```

When a stage succeeds and its requesting stage equals the top context's requesting stage, the context is popped from the stack.

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

### Local Context (`@pipeline` / `@p`)

Each stage receives a pipeline context object:

```javascript
@pipeline = {
  try: 2,                        // Current attempt (within context)
  tries: ["attempt1"],           // Previous attempts (within context)
  stage: 1,                      // Current stage number (1-indexed)
  0: "base",                     // Stage 0 input
  1: "stage0_output",           // Stage 1 input
  // ... array-style access to all previous outputs
}
```

### Global Context (`@pipeline.global`)

Lazy-evaluated accumulator across ALL contexts:

```javascript
@pipeline.global = {
  tries: [                       // All attempts across all contexts
    ["ctx1_attempt1", "ctx1_attempt2"],
    ["ctx2_attempt1"],
    // ...
  ]
}
```

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
2. **Nested Retries**: Test recursive retry contexts
3. **Limit Testing**: Verify both per-context and global limits
4. **Stage 0 Retryability**: Test function vs literal sources
5. **Context Isolation**: Verify try/tries stay context-local
6. **Global Accumulation**: Test @pipeline.global.tries

### Common Issues

1. **Infinite Loops**: Without proper limits, retries can loop forever
2. **Context Leakage**: Ensure contexts don't affect each other
3. **Stage 0 Assumptions**: Tests assuming stage 0 can always retry
4. **Limit Configuration**: Tests hitting limits with legitimate retry patterns

## Future Enhancements

### Planned Improvements

1. **Configurable Limits**: Allow per-pipeline limit configuration
2. **Retry Strategies**: Exponential backoff, jitter, etc.
3. **Partial Success**: Allow stages to return partial results
4. **Retry Metadata**: Pass retry reason/context to retried stage
5. **Observability**: Better logging and debugging for retry chains

### Under Consideration

1. **Conditional Retries**: Retry only on specific error types
2. **Circuit Breakers**: Stop retrying after repeated failures
3. **Retry Budgets**: Global retry budget across pipelines
4. **Async Pipelines**: Support for async stage functions
5. **Pipeline Composition**: Pipelines as stages in other pipelines