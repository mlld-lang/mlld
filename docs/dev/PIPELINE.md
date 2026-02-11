---
updated: 2025-11-13
tags: #arch, #pipeline, #retry, #interpreter
related-docs: PIPELINE-ARCHITECTURE.md, RETRY-PLAN.md, docs/slash/var.md
related-code: interpreter/eval/pipeline/*.ts, interpreter/eval/when-expression.ts
related-types: core/types { PipelineState, RetryContext, StructuredValue }
---

# Pipeline Architecture in mlld

## tldr

mlld's pipeline system enables composable data transformations with automatic retry capabilities. Key features:
- **Pipeline operator** (`|`) chains transformations
- **Retry mechanism** allows stages to retry previous stages
- **Context variables** (`@pipeline`, `@p`) provide execution state
- **Format support** for JSON, CSV, XML parsing
- **No nested retries** - simplified single-context model

## Overview

mlld's pipeline architecture consists of three complementary features:

1. **`foreach`** - Iteration and data transformation over arrays
2. **`@when`** - Conditional execution and branching logic
3. **`with` clauses** - Pipeline transformations and dependency management

Together, they enable complex data flows while maintaining mlld's declarative philosophy.

## Shared Architecture Patterns

### Two-Phase Processing

All three features follow the same two-phase approach:

1. **Parsing Phase**: Grammar rules create AST nodes with type-safe structures
2. **Evaluation Phase**: Interpreters process AST nodes lazily on demand

### Environment Management

All pipeline features use child environments with parent access:

```typescript
// Pipeline steps create child environments
const pipelineEnv = env.createChild();
// Set @INPUT for pipeline data
pipelineEnv.setVariable('INPUT', inputVar);
// Child can access parent variables
const result = await evaluate(node, pipelineEnv);
```

This enables access to variables and functions defined in parent scopes.

### Lazy Evaluation

Features are stored as complex variables and evaluated only when accessed:

```typescript
// foreach stores as complex data variable
@data results = foreach @command(@array)  // Not executed yet

// @when evaluates only when reached
@when @condition => @action              // Condition not checked until here

// with pipelines execute in sequence
run [cmd] with { pipeline: [@t1, @t2] } // Transformers run on demand
```

### Error Context

All features preserve source location for precise error reporting:
- Parser attaches location to AST nodes
- Evaluators pass location through to errors
- Errors show exact position in source file

## Pipeline Executor Module Layout

Pipeline execution uses a composition root plus focused collaborators:

- `interpreter/eval/pipeline/executor.ts`: Composition root that wires collaborators, keeps public execute overloads stable, and owns cross-cutting runtime services.
- `interpreter/eval/pipeline/executor/execution-loop-runner.ts`: State-machine loop orchestration, stage dispatch (`single` vs `parallel`), event ordering, retry-history refresh, and final-state handling.
- `interpreter/eval/pipeline/executor/streaming-lifecycle.ts`: Streaming enablement checks, stage streaming predicates, event emission to StreamBus, sink configuration, and teardown.
- `interpreter/eval/pipeline/executor/single-stage-runner.ts`: Single-stage environment construction, retry handling, while/inline dispatch, descriptor finalization, and inline effect sequencing.
- `interpreter/eval/pipeline/executor/parallel-stage-runner.ts`: Parallel branch orchestration, ordered branch aggregation, error-marker capture, retry-signal rejection, and descriptor merge for aggregated output.
- `interpreter/eval/pipeline/executor/inline-stage-executor.ts`: Inline value/command stage execution contracts.
- `interpreter/eval/pipeline/executor/while-stage-adapter.ts`: While-processor adaptation from expression form to pipeline command invocation shape.
- `interpreter/eval/pipeline/executor/command-invoker.ts`: Command invocation bridge with argument binding and hook context hand-off.
- `interpreter/eval/pipeline/executor/output-processor.ts`: Structured output normalization, source descriptor application, descriptor inheritance/finalization, and load-content wrapping.
- `interpreter/eval/pipeline/executor/stage-output-cache.ts`: Stage output cache for previous/current stage reads, retry clearing, and final output retrieval.
- `interpreter/eval/pipeline/executor/helpers.ts`: Shared helper logic for structured cloning, safe serialization, error marker formatting, previewing, and parallel error context updates.
- `interpreter/eval/pipeline/executor/types.ts`: Shared executor contracts (`StageExecutionResult`, `RetrySignal`, `ParallelStageError`, execution options, and context factory types).

The executor-local import graph remains acyclic (`executor.ts` + `executor/*`), and shared contracts stay centralized in `executor/types.ts`.

## Pipeline Operator Syntax

mlld supports two equivalent syntaxes for pipeline transformations:

### Shorthand Syntax
```mlld
/var @result = @input | @transformer1 | @transformer2
/var @output = @message | @upper | @trim
```

### Longhand Syntax  
```mlld
@data result = @input with { pipeline: [@transformer1, @transformer2] }
@text output = @message with { pipeline: [@upper, @trim] }
```

Both syntaxes produce identical AST structures and should behave identically.

### Grammar Implementation

The pipeline operator is parsed in `grammar/patterns/tail-modifiers.peggy`:

```peggy
PipelineShorthand
  = first:PipelineCommand rest:(HWS &{ 
      // Check if we're still on the same line
      const pos = peg$currPos;
      const beforePos = input.lastIndexOf('\n', pos - 1);
      const afterPos = input.indexOf('\n', pos);
      const hasNewlineBefore = beforePos >= 0 && !input.substring(beforePos + 1, pos).trim();
      return !hasNewlineBefore;
    } "|" HWS ref:PipelineCommand { return ref; })* {
      return [first, ...rest];
    }
```

**Critical**: The `"|" HWS` sequence must be present to capture multiple pipe operators. Without it, only the first transformer is parsed.

### Variable References with Pipelines

To support pipelines in assignment contexts, we use `VariableReferenceWithTail`:

```typescript
// AST structure for @data result = @msg | @upper
{
  type: 'VariableReferenceWithTail',
  variable: { identifier: 'msg' },
  withClause: {
    pipeline: [
      { identifier: [{ identifier: 'upper' }], args: [], fields: [] }
    ]
  }
}
```

This pattern is defined in `grammar/patterns/variables.peggy` and used by both `@data` and `@text` directives.

## Batch Pipelines for Collections

`for` and `foreach` collection expressions support a trailing batch pipeline. Grammar rules `ForBatchPipeline` and `ForeachBatchPipeline` extend the expression patterns so `=> | @stage` (and parallel variants like `=> || @a || @b`) produce the same `PipelineStage[]` structures returned by `PipelineShorthand`. The AST stores this data in:

- `ForExpression.meta.batchPipeline`
- `ForeachCommandExpression.value.batchPipeline`
- `ForeachCommandExpression.value.with.batchPipeline` (for option parsing)

During evaluation:

- `evaluateForExpression` gathers iteration results, wraps them with `createArrayVariable('for-batch-input', ...)`, and passes them to `processPipeline`. The return value may be an array, scalar, or object; the evaluator selects the appropriate variable factory so metadata and downstream resolution stay consistent.
- `evaluateForeachCommand` follows the same flow, returning the transformed value to every caller (core interpreter, lazy evaluation, `evaluateForeachAsText`, etc.). The dedicated data-value evaluator now delegates to this function to avoid drift.
- `createStageEnvironment` seeds `@input` with the original `StructuredValue`, giving batch stages (and `=> ||` branches) direct access to `.data` while `.text` remains available for string-oriented helpers.

Batch pipelines reuse the existing retry logic: they execute after iteration completes, never mark themselves retryable, and inherit parallel stage semantics (including `||` groups and caps). Tests under `tests/cases/feat/batch-pipeline/` cover flattening, scalar aggregation, mixed per-item/batch phases, and foreach ordering.

### Iterator-Sourced Pipelines

- `/for` and `foreach` evaluators run `normalizeIterableValue` (`interpreter/eval/for-utils.ts`) before storing iteration results or creating batch inputs. The helper unwraps StructuredValues and Variables into plain arrays/objects while tagging every normalized value with `ExpressionProvenance`. Loop bodies, `/for` expression arrays, foreach tuples, and the batch inputs built via `createArrayVariable('for-batch-input', …)` therefore expose ordinary JavaScript values to user code while provenance metadata stays available for guard hooks and ArrayHelpers.
- Guard and pipeline consumers materialize descriptors on demand. `materializeGuardInputs()` turns provenance-marked primitives back into Variables for guard evaluation, and `processPipeline()` receives the array variable produced by the iterator, so batch stages still see the structured wrapper when they call `asData()`/`asText()`.
- `@pipeline`/`@p` entries always hold `StructuredValue` wrappers. Indexing (`@p[0]`, `@p[-1]`, etc.) returns the wrapper, and interpolation relies on the wrapper’s coercion helpers to emit `.text`. Treat pipeline context values as structured even when an iterator upstream worked with plain JavaScript arrays.

## Built-in Transformers

mlld includes built-in transformers that integrate seamlessly with the pipeline system.

### Architecture

**File**: `interpreter/builtin/transformers.ts`

Transformers are implemented as special executable variables with metadata:

```typescript
interface TransformerDefinition {
  name: string;              // lowercase alias
  uppercase: string;         // canonical UPPERCASE name
  description: string;       // for help/documentation
  implementation: (input: string) => Promise<string> | string;
}
```

### Registration

Built-in transformers are registered in the root Environment:

```typescript
// In Environment constructor
if (!parent) {
  this.initializeBuiltinTransformers();
}

// Creates both UPPERCASE and lowercase versions
// @XML and @xml both work identically
```

### Pipeline Integration

Transformers work as executable variables in pipelines:

```typescript
// Special handling in pipeline.ts
if (commandVar?.internal?.isBuiltinTransformer) {
  const result = await commandVar.internal.transformerImplementation(input);
  const normalized = normalizeTransformerResult(commandVar.name, result);
  return finalizeResult(normalized.value, normalized.options);
}
```

### Available Transformers

1. **@XML / @xml** - Uses llmxml for SCREAMING_SNAKE_CASE conversion
2. **@JSON / @json** - Returns parsed JSON data (objects/arrays/primitives) while `.text` is pretty-printed with 2-space indentation
3. **@CSV / @csv** - Converts JSON arrays to CSV format
4. **@MD / @md** - Formats markdown using prettier

### LoadContentResult Metadata Preservation

Pipeline stages automatically preserve LoadContentResult metadata through JavaScript transformations:

```mlld
# Metadata (filename, frontmatter) preserved even after transformation
/var @result = <doc.md> | @uppercase | @addFooter
# @result still has .mx.filename, .mx.fm properties available
```

**Implementation**: Pipeline execution wraps JS functions with `AutoUnwrapManager.executeWithPreservation()` - arrays use exact content matching, single files get metadata auto-reattached to transformed content.

### Parallel Execution

Pipeline stages run in parallel when grouped with `||`.

- Grouping: `A || B || C` forms one stage that executes `A`, `B`, and `C` concurrently; results preserve command order.
- With-clause parity: Nested arrays in `with { pipeline: [...] }` represent a parallel stage. Example: `with { pipeline: [ [@left, @right], @combine ] }` is equivalent to `| @left || @right | @combine`.
- Leading groups: Pipelines can start with a leading `||` operator to execute parallel stages immediately. Examples:
  - `/var @result = || @a() || @b() || @c()` runs all three in parallel, returns `["resultA", "resultB", "resultC"]`
  - `/run || @fetch1() || @fetch2() || @fetch3()` executes in parallel, emits a structured array (`.text` prints as JSON)
  - `/var @out = || @func1() || @func2() | @combine` parallel group followed by combiner
  - `/exe @composed() = || @helper1() || @helper2() | @merge` works in exe definitions
  - Concurrency caps work with leading parallel: `|| @a() || @b() || @c() (2, 100ms)` caps at 2 concurrent with 100ms pacing
- Leading `||` syntax: The double-bar prefix explicitly enters pipeline mode with parallel execution, avoiding ambiguity with boolean OR (`||`) expressions. Only matches when followed by function calls (with parentheses), not plain variables.
- Equivalence: `|| @a() || @b() | @c` produces same AST as `"" with { pipeline: [[@a, @b], @c] }`
- Output: The next stage receives a StructuredValue array; `.data` preserves branch outputs in declaration order and `.text` is the JSON string form. The same wrapper is stored in `@p` for that stage.
- Error handling: Branch failures are best-effort. Errors are captured as markers `{ index, key?, message, error, value }` in the array and accumulated in `@mx.errors` (cleared per parallel group). Pipelines do not abort on a single branch failure; downstream stages decide how to repair or retry.
- Concurrency: Limited by `MLLD_PARALLEL_LIMIT` (default `4`).
- Caps and pacing: `(n, wait)` after the pipeline sets a per-pipeline concurrency cap and delay between starts, equivalent to `with { parallel: n, delay: wait }`.
- Effects: Inline effects attached before a parallel group run once per branch after that branch succeeds; effect failures abort the pipeline.
- Rate limits: 429/“rate limit” errors in a branch use exponential backoff.

See tests in `tests/pipeline/parallel-runtime.test.ts` for ordering, concurrency caps, failure behavior, and effects.

#### Related: /for Parallel
- Iterator parallelism uses the same concurrency utility as pipelines but has different semantics.
- `/for parallel` (see `docs/dev/ITERATORS.md`) streams directive outputs as iterations complete (order not guaranteed), while the collection form preserves input order.
- Pipeline groups always deliver a StructuredValue array to the next stage (declaration order maintained) and do not support `retry` from inside the group. `.text` exposes the JSON array for display; `.data` holds the native array for computation.

#### Nested Groups
- Nested parallel groups are not supported semantically. While AST arrays can nest syntactically, execution treats each array as a single stage boundary and does not introduce multi-level parallel orchestration.
- If you need multiple parallel phases, model them as separate stages with validation between them (e.g., parallel → combine/validate → parallel).

## Pipeline Retry Architecture

The pipeline retry system enables automatic retry of failed or invalid pipeline steps through a simplified state machine architecture.

### Core Principles

1. **No Self-Retry**: No stage can retry itself
2. **Upstream Retry Only**: Stage N can only request retry of stage N-1  
3. **Stage 0 Conditional**: Stage 0 can only be retried if its source is a function
4. **Context Isolation**: Each retry pattern gets its own context
5. **Single Active Context**: Only one retry context active at a time (no nested retries)

### State Machine Architecture

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

interface RetryContext {
  id: string;                    // Unique context ID
  requestingStage: number;       // Stage requesting retry
  retryingStage: number;         // Stage being retried
  attemptNumber: number;         // Current attempt (1-based)
  allAttempts: string[];         // All outputs from retry attempts
}
```

### @pipeline Context Variable

The `@p` (`@pipeline`) variable provides access to pipeline execution state:

```mlld
# Array indexing for stage outputs
@p[0]      # Input to the pipeline
@p[1]      # Output of first stage
@p[-1]     # Output of previous stage
@p[-2]     # Output two stages back

# Retry and attempt tracking (context-local)
@p.try     # Current attempt within active retry context (1, 2, 3...)
@p.tries   # Array of previous attempts within active retry context

# Global retry history
@p.retries.all  # All attempts from ALL retry contexts

# Stage information
@p.stage   # Current stage number (1-based)
@p.length  # Number of completed stages
```

**Critical**: `try` and `tries` are **local to the retry context**. Stages outside the active retry context see `try: 1` and `tries: []`. This is by design - each stage starts fresh unless part of an active retry.

#### History Structure

Pipeline history is attempt‑grouped. The history records attempts as an outer array, and each attempt contains a sequential list of stage entries for that attempt.

- Shape: `history: Attempt[]` where `Attempt` is `StageEntry[]`.
- Empty attempt group: `history: [[]]` represents a retry context that exists but has no recorded stage entries yet.
- No attempts: `history: []` represents no retry contexts.
- Parallel groups: a parallel stage contributes a single stage entry that encapsulates the group output as a StructuredValue array (branch outputs in `.data`, JSON string in `.text`) to preserve ordering and avoid ambiguity across retries. Stage environments and `@p` read the structured wrapper; the state machine tracks the `.text` channel for control flow and retry accounting.

This grouping aligns with shorthand `||` and with‑clause nested array syntax: `| @left || @right |` is equivalent to `with { pipeline: [[@left, @right], ...] }`, and history preserves attempt boundaries independently of intra‑stage parallelism.

#### Input Semantics

- `@p[0]` (and alias `@p[0]`) is the original/base input to the pipeline.
- The stage execution context exposes the current stage input via `@mx.input` (user-facing) and as the first bound parameter for executables where applicable.
- There is no `@pipeline.input` field; references to "pipeline input" in code refer to `@mx.input` for the current stage or `@p[0]` for the original/base input.

These semantics ensure that validators can reason about the current stage's input (`@mx.input`) while selection/aggregation patterns can reach back to the original input using `@p[0]`.

#### Structured Outputs and Helpers

- Stage outputs stored in `@p` are `StructuredValue` wrappers with both `.text` (string representation) and `.data` (structured payload) properties.
- Use `.text` (or the helper `asText(value)`) for string operations, and `.data` / `asData(value)` to inspect structured results and metadata.
- The synthetic `__source__` stage is omitted from history, so `@p[1]` always maps to the first user-defined stage.
- The helper utilities `asText`, `asData`, and `wrapStructured` live in `interpreter/utils/structured-value.ts`; import them when writing pipeline-aware code that needs consistent access to both representations.

```mlld
# Especially useful for accessing specific fields:
/exe @checker(input, try) = when: [
  @try < 3 => retry
  * => @input
]
/var @result = "data"|@checker(@p.try)

# Pass entire context to JavaScript functions:
/exe @analyzer(input, mx) = js {
  return `Stage ${mx.stage}: ${input} (attempt ${mx.try})`;
}
/var @result = "data"|@analyzer(@p)
```

### Retry Mechanism

Functions can return the `retry` keyword to re-execute the **previous** pipeline stage:

```mlld
/exe @validator(input) = when: [
  @isValid(@input) => @input
  @pipeline.try < 3 => retry    # Retries the previous stage, not current
  * => null
]

/var @result = @input | @transform | @validator | @process
#                        ↑            ↑
#                   Gets retried  Requests retry
```

#### How Retry Works

When stage N returns `retry`, it requests retry of stage N-1:

1. **Context Check**: System checks for existing retry context with same pattern
2. **Context Reuse**: If exists, reuses context and increments attempt counter
3. **Context Creation**: If not, creates new retry context
4. **Limit Check**: Verifies both per-context (10) and global per-stage (20) limits
5. **Stage Re-execution**: Re-executes stage N-1 with its original input
6. **Pipeline Continuation**: Continues from stage N-1 forward
7. **Context Cleanup**: Clears context when requesting stage completes

#### Retry Limits

Two independent limits prevent infinite loops:

1. **Per-Context Limit** (10): Maximum retries within a single context
2. **Global Per-Stage Limit** (20): Total retries for any stage across all contexts

#### Stage 0 Retryability

Stage 0 is special - it has no previous stage. When stage 1 requests retry of stage 0:
- If stage 0's input came from a function → Re-execute the function
- If stage 0's input is a literal value → Throw error

```mlld
# Retryable (function source)
/var @answer = @claude("explain quantum mechanics")
/var @result = @answer | @review | @validate
# @review can retry @answer because @claude() is a function

# Not Retryable (literal source)
/var @answer = "The capital of France is Paris"
/var @result = @answer | @review | @validate
# @review CANNOT retry @answer - will throw error
```

#### Stage 0 Provenance + Descriptor Hints

`processPipeline()` now accepts an explicit `descriptorHint`. Callers that materialize expression values into plain strings (e.g., `/show` display text, `/var` condensed pipes, interpolation, and the `VariableReferenceEvaluator`) forward descriptors from the original variable or interpolation context so Stage 0 never relies on AST fallbacks. The unified processor merges descriptor sources in this order:

1. `descriptorHint` supplied by the caller
2. Extracted descriptor from the value (including StructuredValues and Variables)
3. AST-derived descriptor (`extractDescriptorFromAst`)
4. Directive-level labels (`directive.meta.securityLabels`)

Every stage result flows through `finalizeStageOutput()`, which merges the stage input descriptor, raw output descriptor, existing wrapper metadata, inline labels, and the caller-provided hints before calling `setExpressionProvenance()`. Stage retries reuse the same descriptor: when Stage 0 re-executes its source function (`PipelineExecutor.executeCommand` → `applySourceDescriptor`), the freshly wrapped value is immediately tagged with the cached `pipelineDescriptor`. Even when the source rewraps a primitive (e.g., `/show` content string), `attachDescriptorToRetryInput()` promotes it to a `StructuredValue` so subsequent retries still carry the labels that guard hooks expect.

#### Why No Nested Retries?

Nested retries are not supported because they represent pathological cases. In pipeline A → B → C, if C retries B and then B requests retry of A:
- B receives the SAME input from A that it got before
- B's logic hasn't changed
- There's no legitimate reason for B to suddenly retry A
- This indicates non-deterministic or poorly designed functions

### Example Patterns

#### Validation with Retry

```mlld
/exe @requireValid(response) = when: [
  @response.valid => @response
  @pipeline.try < 5 => retry    # Retries @generate stage
  * => throw "Invalid after 5 attempts"
]

/var @result = @prompt | @generate | @requireValid
```

#### Best-of-N Selection

```mlld
/exe @selectBest(input) = when: [
  @input.score > 8 => @input
  @pipeline.try < 3 => retry    # Retries @claude stage
  * => @selectHighestScore(@pipeline.tries)
]

/var @result = @prompt | @claude | @selectBest
```

#### Context Behavior Example

```mlld
/exe @stage1(input) = `s1: @input`
/exe @stage2(input) = when: [
  @pipeline.try < 3 => retry    # Retry stage 1
  * => @input
]
/exe @stage3(input) = `s3: @input, try: @pipeline.try`

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
9. **Stage 3 executes (try: 1, NEW context)** ← Stage 3 is NOT part of the retry context

## Critical Gotchas and Debugging

### Critical Invariants

1. **Always Use VariableFactory for System Variables**
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
**Why**: Hand-rolled Variables violate type contracts and cause field access failures.

2. **Synthetic Source Stage (`@__source__`)**
When a pipeline has a retryable source (function), a synthetic stage is added internally. This affects stage numbering in debug output.

3. **Context Lifecycle**
Context should be cleared when the REQUESTING stage completes, not the retrying stage.

### Escaping

`/run` pipelines expect JSON-like shell output to stay parseable. Control characters inside string literals are sanitized in `parseStructuredJson`, and regression coverage lives in `tests/cases/integration/pipeline-shell-json-newline/`. 

### Debugging Techniques

```bash
# Full pipeline debug output
MLLD_DEBUG=true npm test <test-name>

# Specific debug flags
DEBUG_EXEC=true      # Execution details
DEBUG_WHEN=true      # When expression evaluation
DEBUG_PIPELINE=true  # Pipeline-specific debugging
```

### Common Failure Patterns

1. **"Field not found in object" Errors**
   - **Cause**: Variable not created through factory
   - **Fix**: Use proper Variable factories for all system variables

2. **Retry Attempts Stuck at 1**
   - **Cause**: Context popped too early or wrong attempt counter used
   - **Fix**: Ensure context lifecycle is correct

3. **Global Retry Limit Hit Immediately**
   - **Cause**: Double-counting retries or context not being created properly
   - **Fix**: Check retry counting logic

## Pipeline Format Feature (v1.4.10+)

The pipeline format feature allows specifying how data should be parsed when passed through pipelines, enabling functions to receive both raw text and parsed representations.

### Architecture Overview

**Key Components:**
1. **Grammar Extension**: `with { format: "json|csv|xml|text" }` syntax
2. **Pipeline Input Wrapper**: Creates lazy-parsed input objects
3. **Parameter Handling**: Passes wrapped inputs to JS/Node functions
4. **Format-Specific Parsers**: JSON, CSV, XML, and text handlers

### Grammar Implementation

In `grammar/patterns/with-clause.peggy`:

```peggy
WithProperty
  = "format" _ ":" _ format:StringLiteral {
      return ["format", format];
    }
```

The format property is parsed and passed through the evaluation chain.

### StructuredValue Wrapper

**File**: `interpreter/utils/pipeline-input.ts`

```typescript
export function buildPipelineStructuredValue(
  text: string,
  format: StructuredValueType = 'json'
): StructuredValue {
  const normalizedFormat = (format ?? 'json').toLowerCase();
  // Format-specific parsing that ultimately calls wrapStructured(...)
}
```

`buildPipelineStructuredValue()` centralizes format-aware parsing and always returns the result of `wrapStructured()`. The helper attaches extra metadata (format, parsed csv/xml payloads, structured type hints) and `wrapStructured()` now materializes `.mx` immediately, so provenance and security labels are available without lazy getters. The function eagerly parses when a structured representation exists, so stage code always receives a regular `StructuredValue`.

### Format Handling

- **JSON**: Trims the input, parses via `JSON.parse`, and records the detected structured type (array/object/primitive) in `metadata.structuredType`.
- **CSV**: Uses the local CSV parser to produce a 2D array, stores it as both `.data` and a non-enumerable `csv` helper property, and wraps the original text for `.text`.
- **XML**: Attempts to JSON-parse and convert via `jsonToXml()`, falling back to wrapping the literal text with minimal tagging; attaches the parsed tree via a non-enumerable `xml` helper property.
- **Text**: Returns `wrapStructured(text, 'text', text)` so downstream consumers still see a StructuredValue wrapper.
- **Empty strings**: Treated as text to avoid spurious JSON parse failures.

### Integration Points

1. **With Clause Evaluation** (`interpreter/eval/with-clause.ts`):
   - Extracts format from with properties
   - Passes to pipeline executor

2. **Pipeline Execution** (`interpreter/eval/pipeline.ts`):
   - Uses `buildPipelineStructuredValue()` to produce StructuredValue inputs
   - Stores wrappers in `structuredOutputs` and marks variables with `isPipelineInput` metadata for tracing

3. **JavaScript/Node Execution**:
   - `AutoUnwrapManager` passes `.data` into user functions (arrays/objects for structured formats, strings otherwise)
   - `.mx` remains available via the environment if functions need provenance or security metadata

### Format Implementations

**JSON (Default)**:
- Uses native `JSON.parse()`
- `.data` is the parsed JSON value; `.text` preserves the exact input
- Structured type hint stored in `metadata.structuredType`

**CSV**:
- Custom parser handling quoted values
- `.data` is a 2D array; `.csv` helper property mirrors the parsed rows
- Handles escaped quotes and commas

**XML**:
- Converts JSON payloads via `jsonToXml()` when possible
- Falls back to wrapping literal text with minimal tags
- Non-enumerable `.xml` helper exposes the parsed tree

**Text**:
- Returns `wrapStructured(text, 'text', text)`
- `.data` and `.text` both equal the original string for consistency

### Backwards Compatibility

Functions expecting strings still work:
- StructuredValue wrappers return `.text` from `toString()`, so implicit string coercion keeps working
- Existing modules that read plain strings continue to see the raw text when no `format` is specified
- Stage implementations can fall back to `.text` explicitly even when a structured `.data` view exists

### Error Handling

`buildPipelineStructuredValue()` throws `MlldInterpreterError` as soon as parsing fails (CSV, XML, JSON). Errors bubble before invoking the stage so retries and diagnostics reference the stage boundary instead of a later property access.

### Example Usage

```mlld
# JSON format (default)
@exec processUsers(users) = js [(
  // `users` is already parsed JSON (Array<{ name: string }>)
  return users.map(u => u.name).join(', ');
)]

@data names = @getUsers() with { format: "json", pipeline: [@processUsers] }

# CSV format
@exec analyzeCSV(rows) = js [(
  const headers = rows[0];
  return `${rows.length - 1} records with ${headers.length} fields`;
)]

@data analysis = @getCSV() with { format: "csv", pipeline: [@analyzeCSV] }
```

### Implementation Flow

1. **Grammar Parse**: `with { format: "json" }` → AST node
2. **With Clause Eval**: Extract format from properties
3. **Pipeline Setup**: Pass format to pipeline executor
4. **Parameter Wrapping**: Call `buildPipelineStructuredValue()` (delegates to `wrapStructured()`) when `with { format }` is present
5. **Function Execution**: JS receives StructuredValue-backed variables (or plain text when no format is provided)
6. **StructuredValue Reuse**: No lazy parsing—wrappers already contain parsed `.data`

### Testing Strategy

Test coverage includes:
- Each format type (JSON, CSV, XML, text)
- Parse error handling
- Backwards compatibility
- Multi-stage pipelines with format specified

## Variable Type System Integration

The pipeline system integrates with mlld's Variable type system, which wraps all values with metadata about their source, type, and context.

### Variable Extraction at Pipeline Boundaries

Pipelines operate on raw values, not Variable objects. The system automatically extracts values at pipeline boundaries:

```mlld
/var @data = `[{"name": "Alice"}, {"name": "Bob"}]`  # Creates a Variable<string>
/var @result = @data with { format: "json", pipeline: [@extractNames] }

# The pipeline receives the raw string value, not the Variable wrapper
```

### Resolution Context

The pipeline system uses `ResolutionContext.PipelineInput` to signal that Variables should be extracted:

```typescript
// In var.ts when processing pipelines
const stringValue = await resolveValue(variable.value, env, ResolutionContext.PipelineInput);
```

### Structured Pipeline Variables

Pipeline stages create `PipelineInputVariable` entries to preserve both the StructuredValue wrapper and the original text snapshot:

```typescript
export interface PipelineInputVariable extends BaseVariable {
  type: 'pipeline-input';
  value: StructuredValue;    // StructuredValue with format metadata
  format: 'json' | 'csv' | 'xml' | 'text';
  rawText: string;           // Original text for fallback
}
```

### Design Principles

1. **Variables flow through data structures** - Arrays and objects can contain Variables
2. **Extraction at boundaries** - Pipelines, display, and commands extract values
3. **Type preservation** - Variable metadata flows until extraction is needed
4. **No surprises** - Consistent behavior based on ResolutionContext

### Implementation Notes

When implementing pipeline features:
- Use `ResolutionContext.PipelineInput` when passing data to pipelines
- Preserve Variables in data structures (`ResolutionContext.ArrayElement`, etc.)
- Extract only at system boundaries (display, file output, command execution)
- Document extraction points with clear comments explaining WHY

### Resolution Context System

The Variable resolution system uses a context-aware approach to determine when to preserve Variables versus extract raw values:

```typescript
export enum ResolutionContext {
  // Preserve Variable wrapper
  VariableAssignment = 'variable-assignment',
  VariableCopy = 'variable-copy',
  ArrayElement = 'array-element',
  ObjectProperty = 'object-property',
  FunctionArgument = 'function-argument',
  DataStructure = 'data-structure',
  FieldAccess = 'field-access',
  ImportResult = 'import-result',
  
  // Extract raw value
  StringInterpolation = 'string-interpolation',
  CommandExecution = 'command-execution',
  FileOutput = 'file-output',
  Conditional = 'conditional',
  Display = 'display',
  PipelineInput = 'pipeline-input',
  Truthiness = 'truthiness',
  Equality = 'equality'
}
```

### Context-Aware Resolution API

The system provides three main resolution functions:

```typescript
// Primary API - context-aware resolution
export async function resolveVariable(
  variable: Variable,
  env: Environment,
  context: ResolutionContext
): Promise<Variable | any>

// Explicit extraction when needed
export async function extractVariableValue(
  variable: Variable,
  env: Environment  
): Promise<any>

// Helper for mixed values (Variable or raw)
export async function resolveValue(
  value: Variable | any,
  env: Environment,
  context: ResolutionContext
): Promise<Variable | any>
```

### StructuredValue Handling

Pipeline inputs rely on StructuredValue helpers:

```typescript
const input = buildPipelineStructuredValue(text, format);
console.log(input.text);             // Raw string view
console.log(input.data);             // Parsed JSON/CSV/XML when available
console.log(input.mx.filename);     // Metadata view (filename, provenance, tokens, etc.)
```

### String Interpolation Edge Case

When StructuredValue pipeline inputs are used in string interpolation, they must be handled specially to avoid JSON stringification:

```mlld
/exe @format() = {echo "Result: @input"}
/run cmd {echo "test"} with { pipeline: [@format] }
# Should output "Result: test" not "Result: {"text":"test","type":"text"}"
```

This is handled in interpolation code by checking for StructuredValue wrappers and calling `asText(value)` before JSON stringification, so wrapper metadata never leaks into display output.

### Variable Flow Example

```typescript
// 1. Variable created with metadata
/var @jsonData = `[{"id": 1}, {"id": 2}]`  // Variable<string>

// 2. Variable reference preserves wrapper
/var @copy = @jsonData  // Still Variable<string>

// 3. Pipeline boundary extracts value
/var @result = @jsonData with { 
  format: "json", 
  pipeline: [@extractIds]  // Receives raw string "[{"id": 1}, {"id": 2}]"
}

// 4. Arrays preserve Variables
/var @list = [@jsonData, @copy]  // Array<Variable<string>>

// 5. Display extracts for output
/show @jsonData  // Extracts string value for display
```

### Context Management

Pipeline context is managed through the Environment class:

```typescript
// Set at the start of each pipeline stage
env.setPipelineContext({
  stage: i + 1,
  totalStages: pipeline.length,
  currentCommand: command.rawIdentifier,
  input: currentOutput,
  previousOutputs: [...previousOutputs]
});

// Cleared when pipeline completes or errors
env.clearPipelineContext();
```

### Child Environment Inheritance

Pipeline stages execute in child environments that can access parent pipeline context:

```typescript
// Child environments check parent chain for pipeline context
let pipelineCtx = this.pipelineContext;
if (!pipelineCtx && this.parent) {
  let current = this.parent;
  while (current && !pipelineCtx) {
    pipelineCtx = current.getPipelineContext();
    current = current.parent;
  }
}
```

This ensures that nested operations (like @debug) can access pipeline context information.

### Error Context

All features provide detailed error messages with execution context:

```typescript
// foreach includes iteration details
"Error in foreach iteration 3 (topic: 'security', model: 'claude'): ..."

// @when includes modifier context
"MlldConditionError: Failed in 'all' modifier at condition 2..."

// with includes pipeline step
"Pipeline step 2 (@validate_json) failed: Invalid JSON"
```

## Integration Patterns

### Combining Features

The features are designed to work together seamlessly:

```meld
# Complex pipeline example
@data topics = ["security", "performance", "scalability"]
@data models = ["gpt-4", "claude"]

# Parameterized command with dependencies
@exec analyze(topic, model) = run [
  python analyze.py --topic @topic --model @model
] with {
  needs: { "python": { "openai": ">=1.0.0", "anthropic": ">=0.5.0" } }
}

# Conditional iteration with pipeline
@data results = foreach @analyze(@topics, @models)

@when @results all: [
  @result => @text summary = run [(echo "@result")] with {
    pipeline: [@extract_summary(@input), @format_markdown(@input)]
  }
]
```

### Shared Type System

All features use common type definitions:

```typescript
// Variable references used by all features
export interface VariableReference {
  type: 'VariableReference';
  identifier: string;
  fields?: FieldAccess[];
}

// Command references for foreach and with
export interface CommandReference {
  type: 'commandRef';
  identifier: string;
  fields?: FieldAccess[];
}

// Field access supports dot notation
export interface FieldAccess {
  type: 'field' | 'index';
  name?: string;
  value?: string | number;
}
```

## Primitive Types Support

mlld now supports primitive types (numbers, booleans, null) as first-class values:

```mlld
/var @count = 42          # Number primitive
/var @active = true       # Boolean primitive  
/var @empty = null        # Null primitive

# Type preservation in JavaScript
/exe @add(a, b) = js { return a + b; }
/var @sum = @add(@count, 8)  # Result: 50 (not "428")
```

### Architecture

**Variable Type**: Added `PrimitiveVariable` to the discriminated union:
```typescript
export interface PrimitiveVariable extends BaseVariable {
  type: 'primitive';
  value: number | boolean | null;
  primitiveType: 'number' | 'boolean' | 'null';
  metadata?: VariableMetadata;
}
```

**Key Integration Points**:
1. **Grammar**: `PrimitiveValue` added to `VarRHSContent`
2. **Interpreter**: `createPrimitiveVariable()` for type preservation
3. **Resolution**: `isPrimitive()` returns raw value, not stringified
4. **Interpolation**: Converts to string only in template contexts
5. **Exec Parameters**: Passes actual primitive values to JS/Node

### Type Coercion

JavaScript type coercion rules apply:
```mlld
/var @text = "ham"
/var @num = 5
/exe @concat(a, b) = js { return a + b; }
/var @result = @concat(@text, @num)  # "ham5"
```

## Data Flow Architecture

### Pipeline Execution Model

```
Input → foreach → @when → with pipeline → Output
         ↓          ↓           ↓
    Iteration   Branching  Transformation
```

1. **foreach** generates data streams
2. **@when** filters and routes data
3. **with pipelines** transform results

### Variable Binding Flow

Each feature introduces variables into child scopes:

```meld
# foreach binds iteration parameters
@exec process(item, index) = ...
@data results = foreach @process(@items, @indices)
# 'item' and 'index' are bound in process scope

# @when binds condition results
@when @check_status first: [
  @status => @add Status is @status  # 'status' bound here
]

# with pipeline binds @input
run [cmd] with { pipeline: [@transform(@input)] }
# '@input' available in transform scope
```

### Inline Effects in Pipelines (log/show/output)

Inline builtin effects are observability tools that attach to the preceding functional stage in a pipeline. They do not create stages themselves and therefore do not affect retry targeting or stage indexing.

Key points:

- Attachment: `@log`, `@show`, and `@output` in a pipeline are attached to the nearest preceding functional stage (including the synthetic `__source__` stage for retryable sources).
- Emission semantics: Effects are emitted immediately after their owning stage runs, for every attempt. If a downstream stage requests a retry, the previously emitted effects remain (they are not rolled back). This preserves progress visibility across attempts.
- Stage-neutral: Effects are not counted as stages. The state machine only sees functional stages, so retry requests (e.g., from `@validator`) continue to target upstream stages correctly.

Examples:

Shorthand pipe syntax:

```mlld
/exe @source() = js { return "v" + mx.try }
/exe @validator(input) = js { if (mx.try < 3) return "retry"; return input }

# Emits v1, v2, v3 (one per attempt), then final value
/show @source() | show | @validator
```

Longhand with-clause syntax (identical behavior):

```mlld
/show @source() with { pipeline: [ show, @validator ] }
```

Implementation:

- Grammar collects both pipe (`|`) and `with { pipeline: [...] }` formats into a unified pipeline structure (see `helpers.processPipelineEnding` and `detectPipeline`).
- `attachBuiltinEffects` groups effect commands with their preceding functional stage.
- `PipelineExecutor` emits effects immediately after stage execution, on every attempt, and never counts them as discrete stages.

Implications:

- Observability is consistent and immediate across retries.
- Effects on the synthetic `__source__` stage (e.g., directly after a retryable invocation) replay per attempt as expected.
- Document output reflects effects emission order; stderr `log` output is still not included in document content.

## Implementation Components

### Grammar Organization

```
grammar/
├── directives/
│   ├── data.peggy      # foreach expressions
│   ├── when.peggy      # @when conditionals
│   └── run.peggy       # with clause extensions
└── patterns/
    ├── with-clause.peggy
    └── command-reference.peggy
```

### Interpreter Structure

```
interpreter/
├── core/
│   ├── interpreter.ts                   # main AST evaluator + interpolate
│   └── interpolation-context.ts         # escaping strategies for interpolation
├── eval/
│   ├── data-value-evaluator.ts          # array/object evaluation; foreach/cartesian
│   ├── when.ts                          # /when directive dispatcher
│   ├── when-expression.ts               # boolean expressions for conditions
│   ├── run.ts                           # run/sh execution and with-clause plumbing
│   ├── exe.ts                           # /exe creation (command/code/template/section)
│   ├── exec-invocation.ts               # unified @fn(...) orchestration with tails
│   ├── exec/
│   │   ├── command-handler.ts           # command executable execution path
│   │   ├── code-handler.ts              # code executable execution path
│   │   ├── non-command-handlers.ts      # template/data/pipeline/ref/section/resolver paths
│   │   ├── guard-policy.ts              # guard + policy orchestration helpers
│   │   └── args.ts                      # invocation arg evaluation/binding helpers
│   ├── with-clause.ts                   # apply with { pipeline, format, ... }
│   └── pipeline/
│       ├── unified-processor.ts         # condensed and structured pipelines
│       └── stream-sinks/                # progress/full terminal sinks
└── utils/
    ├── cartesian-product.ts             # foreach utilities
    └── pipeline-input.ts                # pipeline input wrapper helpers
```

### Inline Effects

- Built-in inline effects can be added as pipeline stages without creating new functional stages:
  - `| log [args...]` → writes to stderr (debug output)
  - `| show [args...]` → writes to stdout and appends to document
  - `| output [source] to {file|stream|env: ...}` → writes to file/stream/env
- Effects attach to the preceding functional stage and run after it succeeds.
- Effects re-run on each retry attempt for the owning stage.
- File targets resolve `@base/...` prefixes and relative paths from the project root.

#### Retry + Stage Numbering Summary

| Case | Functional stages | When effects run | Retry behavior | Stage numbering impact |
| - | - | - | - | - |
| Functional stage with inline effects (`@fn | log | output`) | +1 | After the stage succeeds | Effects re-run on each retry of that stage | Effects do not create new stages |
| Inline-effects-only pipeline (no functional transforms) | +0 (synthetic identity stage) | After synthetic stage | Effects re-run if upstream retry triggers re-evaluation | Synthetic stage is not counted in user-facing stage numbers |
| Retry request from stage N (returns `retry`) | unchanged | N-1 re-executes, then effects fire | Effects attached to N-1 re-run; stage N re-evaluates after N-1 succeeds | Stages are counted by functional transforms only |

### Context Variables

- `@pipeline` (and alias `@p`) expose pipeline state:
  - Indexing: `@pipeline[0]` (input), `@pipeline[1]`, `@pipeline[-1]` (previous), etc.
- Retry: `@pipeline.try`, `@pipeline.tries`, `@pipeline.retries.all`
  - `@pipeline.tries` exposes the recorded outputs for the current retry scope. When downstream stages consume it, they receive an array of attempt outputs; outside the active scope, the value is grouped by retry context so later stages (or aggregators) can inspect the full history.
  - Stage: `@pipeline.stage`, `@pipeline.length`
- Ambient `@mx` is available during pipeline evaluation with per-stage info:
  - `@mx.try`, `@mx.tries`, `@mx.stage`, `@mx.input`, `@mx.lastOutput`, `@mx.isPipeline`
  - Retry hints: `retry "hint"` or `retry { ... }` make `@mx.hint` available to the next attempt

### Error Hierarchy

```
MlldError
├── MlldDirectiveError
│   ├── MlldConditionError     # @when failures
│   └── MlldWithClauseError    # with clause errors
│       ├── MlldDependencyError
│       └── MlldPipelineError
└── MlldIterationError         # foreach failures
```

## Performance Considerations

### Execution Strategies

1. **Sequential by Default**: Features execute in order, not parallel
2. **Short-Circuit Evaluation**: `when` stops early on the first match
3. **Lazy Loading**: Complex operations defer until needed
4. **Memory Limits**: Cartesian products capped at 10,000 combinations

### Optimization Opportunities

```typescript
// Future parallel execution
@data results = foreach @analyze(@topics, @models) with { parallel: 4 }

// Pipeline streaming for large data
run [cat huge.json] with { 
  pipeline: [@stream_parse(@input), @stream_filter(@input)],
  streaming: true
}

// Conditional caching
@when @expensive_check => @cached_action with { cache: "1h" }
```

## Security Model

### Execution Isolation

- Child environments prevent variable pollution
- Command execution through controlled interfaces
- No direct code evaluation in conditions

### Validation Layers

1. **Grammar**: Syntax validation at parse time
2. **Type Checking**: Parameter/array count validation
3. **Runtime**: Dependency and security checks

## Best Practices

### Design Patterns

1. **Named Operations**: Define reusable commands with `@exec`
```meld
@exec validate_json(data) = run [(jq . <<< "@data")]
@exec extract_field(data, field) = run [(jq .@field <<< "@data")]
```

2. **Composable Pipelines**: Build complex flows from simple parts
```meld
@text result = run [fetch_data] with {
  pipeline: [@validate_json(@input), @extract_field(@input, "users")]
}
```

3. **Error Boundaries**: Use @when for error handling
```meld
@when @risky_operation first: [
  @success => @add Operation succeeded: @success,
  true => @add Operation failed, using fallback
]
```

### Performance Guidelines

1. **Limit Cartesian Products**: Keep array combinations reasonable
2. **Pipeline Depth**: Avoid deeply nested transformations
3. **Early Termination**: Use empty output to stop pipelines

## Testing Strategy

### Fixture Organization

```
tests/cases/valid/
├── data/foreach-*/         # foreach iterations
├── when/*/                 # conditional logic
├── with/*/                 # pipeline tests
└── integration/*/          # combined features
```

### Test Patterns

1. **Isolated Feature Tests**: Test each feature independently
2. **Integration Tests**: Verify feature combinations
3. **Error Scenarios**: Validate error messages and context
4. **Performance Tests**: Check limits and optimizations

## Implementation Checklist

When implementing new pipeline features:

1. **Grammar First**: Define AST structure and parsing rules
2. **Type Safety**: Create TypeScript interfaces and guards
3. **Environment Handling**: Use child environments for isolation
4. **Error Context**: Include execution details in errors
5. **Lazy Evaluation**: Defer expensive operations
6. **Test Coverage**: Add grammar, unit, and integration tests
7. **Documentation**: Update user guides and examples

## GOTCHAS


## Summary

mlld's pipeline architecture provides a cohesive system for data processing through:

- **Iteration** with foreach for bulk operations
- **Branching** with @when for conditional flows  
- **Transformation** with pipelines for data processing
- **Validation** with dependency checking

These features share common patterns while maintaining distinct responsibilities, creating a powerful yet understandable system for building complex data pipelines in a declarative way.
### Hint Scoping (@mx.hint)

mlld treats `@mx` as ambient and amnesiac — it reflects only the truth about “this stage right now.” To keep retry payloads contained and to avoid leaking cross-stage state, hint visibility is precisely scoped:

- Visible only inside the retried stage body during its execution.
- Cleared before inline pipeline effects attached to the retried stage (e.g., `with { pipeline: [ show ... ] }`). Those effects see `@mx.hint == null`.
- Cleared before re-executing the requesting stage. The requester sees `@mx.hint == null`.
- Downstream stages and effects after the retried stage also see `@mx.hint == null`.

Examples:

```
/show @retriedStage() with { pipeline: [ show `hint in effect: @mx.hint` ] } | @requester
```

- Inside `@retriedStage` body: `@mx.hint` is available.
- In the inline `show` effect: `@mx.hint == null`.
- In `@requester`: `@mx.hint == null`.
