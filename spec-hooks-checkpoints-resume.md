# Hooks, Checkpointing, and Resumable Execution

## Overview

Three features that compose into a resilience and observability stack for mlld workflows:

1. **Hooks** — a language-level directive for observing and modifying operations at evaluation boundaries, without blocking them. Like guards, but for instrumentation rather than enforcement.

2. **Checkpointing** — built-in memoization of `llm`-labeled invocations to disk. Any LLM call that has been executed is cached. Re-running a script with `--checkpoint` skips cached calls and only executes new or changed ones.

3. **Resumable execution** — re-enter a script at a named function, with cached LLM results filling in previously completed work. Supports fuzzy matching when the script has changed.

4. **Script forking** — start a different script using another script's checkpoint as the initial state. Pay for expensive LLM work once, branch into multiple analysis approaches.

### Why this matters

mlld orchestrators routinely run 100-1000+ parallel LLM calls that take hours and cost real money. Today, a crash at item 547 of 732 means starting over. A rate limit at 2am means waking up to nothing. Changing a prompt template means re-running every call, even the ones that didn't use that template.

These features make long-running workflows **survivable** — you can crash, resume, iterate, and branch without paying the full cost again.

### Design principles

- **Labels are the opt-in mechanism.** The `llm` label marks what gets checkpointed. No guessing, no heuristics.
- **Hooks observe and modify; guards enforce.** Hooks never deny or abort. They're safe instrumentation.
- **Checkpoint is just memoization.** No environment snapshots, no AST position tracking, no side-effect replay. Hash the arguments, cache the result.
- **Re-run the cheap stuff.** On resume, file loads, variable assignments, and sequential processing re-execute. Only the expensive LLM calls hit the cache. This avoids the hardest serialization problems entirely.
- **Commands re-run.** Shell commands, file writes, and other side effects are not cached. They execute normally on resume.

---

## User Guide

### Hooks

Hooks let you observe and modify operations without blocking them. They fire at evaluation boundaries — before or after directives, function calls, or data labeling — and are triggered by operation types, labels, or specific function names.

#### Declaring hooks

```mlld
# Log every LLM call
hook @logLLM after op:exe = when [
  @mx.op.labels.includes("llm") => [
    append `@now | @mx.op.name | @output.length chars` to "llm-calls.log"
  ]
  * => pass
]

# Track cost on a specific function
hook @trackCost after @claudePoll = [
  append `@now | @output.usage.totalTokens tokens` to "costs.log"
]

# Progress reporting for parallel loops
hook @progress after op:for:iteration = [
  show `  [@mx.for.index/@mx.for.total] @mx.for.key`
]

# Transform data when it receives a label
hook @normalizeUntrusted before untrusted = [
  => @input.trim()
]
```

#### Hook triggers

Hooks support four trigger types:

| Trigger | Example | Fires when |
|---------|---------|------------|
| Operation type | `hook after op:exe` | Any exe invocation completes |
| Label | `hook before secret` | Data receives the `secret` label |
| Function name | `hook before @claudePoll` | `@claudePoll` is about to be called |
| Function + argument | `hook before @claudePoll("review")` | `@claudePoll` called with first arg matching "review" |

#### How hooks differ from guards

| | Guards | Hooks |
|---|---|---|
| Can deny/abort | Yes | No |
| Can retry | Yes | No |
| Can modify values | Yes | Yes |
| Error behavior | Propagates (aborts operation) | Caught and logged (operation continues) |
| Chain behavior | First non-continue wins (pre) | All hooks run |
| Purpose | Enforcement | Instrumentation |

Hooks are not guarded themselves, but functions they call are subject to guards.

#### Hook ordering and transforms

All hooks run in declaration order. For `after` hooks that return a value, transforms chain — each hook receives the previous hook's output. For observation-only hooks that don't return a value, the operation result passes through unchanged.

```mlld
# These chain: output flows through normalize, then sanitize
hook @normalize after op:exe = [ => @output.trim() ]
hook @sanitize after op:exe = [ => @output.replace("SECRET", "[REDACTED]") ]
```

#### Error isolation

A hook that throws does not crash the operation. The error is collected and visible via `@mx.hooks.errors`, but execution continues. This is critical — a logging failure should never kill a 2-hour pipeline.

#### External services and state emission

Hook bodies are regular mlld blocks with access to the full directive set — `/output`, `/run`, `/append`, `state://`, MCP tools, exe calls. No special external call mechanism is needed. The existing `state://` protocol is the natural fit for structured observability:

```mlld
# Emit structured telemetry to state channel
hook @telemetry after @claudePoll = [
  output {
    event: "llm_complete",
    fn: @mx.op.name,
    tokens: @output.usage.totalTokens,
    cached: @mx.checkpoint.hit,
    ts: @now
  } to "state://telemetry"
]

# Notify external service via shell
hook @notifyBatch after op:for:batch = when [
  @mx.for.parallel => [
    run {curl -s -X POST https://hooks.slack.com/... -d '{"text":"Batch @mx.for.batchIndex complete"}'}
  ]
]

# Log to file for later aggregation
hook @costLog after op:exe = when [
  @mx.op.labels.includes("llm") => [
    append `@now | @mx.op.name | @output.usage.totalTokens tokens` to "costs.jsonl"
  ]
]
```

Error isolation wraps all of this — if a `state://` write fails, a curl times out, or a file append errors, the hook error is caught and logged, and the pipeline continues. An external monitoring system reading the state channel gets a structured event stream; the pipeline never depends on that system being available.

### Checkpointing

Checkpointing caches the results of `llm`-labeled invocations to disk. Enable it with `--checkpoint`.

#### Basic usage

```bash
# Run with checkpointing enabled
mlld run pipeline --checkpoint

# Crashes after 200 of 732 LLM calls
# Re-run the same command — 200 cached, 532 execute
mlld run pipeline --checkpoint

# After full completion, re-run is instant (all cached)
mlld run pipeline --checkpoint
```

#### What gets cached

Any invocation with the `llm` label:

```mlld
# Cached — has llm label
var llm @summary = @claudePoll(@prompt, "sonnet")
exe llm @decide(prompt) = @claudePoll(@prompt, "opus")
var @decision = @decide(@decisionPrompt)

# Cached — inside a parallel loop, each call independently cached
exe llm @review(prompt) = @claudePoll(@prompt, "sonnet")
var @results = for parallel(20) @file in @files [
  var @result = @review(@reviewPrompt(@file))
  => @result
]

# NOT cached — no llm label
var @files = <src/**/*.ts>
var @parsed = @data | @json
```

The cache key is `sha256(functionName + serializedArguments)`. If the prompt changes, the hash changes, and the call re-executes. If the prompt is the same, the cached result is returned without calling the LLM.

#### Checkpoint patterns: why labels live on `exe`/`var`, not `let`

The `llm` label belongs on immutable declarations (`var`, `exe`) because checkpoint taint tracking on mutable `let` bindings is not feasible — a `let` variable can be reassigned, so the system cannot guarantee the cached value still corresponds to the original LLM call.

The correct pattern is to define an `exe llm` wrapper at module level, then call it from blocks:

```mlld
# Define the labeled wrapper once
exe llm @review(prompt) = @claudePoll(@prompt, "sonnet")

# Call it anywhere — each call is independently cached
var @results = for parallel(20) @file in @files [
  var @result = @review(@reviewPrompt(@file))
  => @result
]
```

For one-off calls, use `var llm` directly:

```mlld
var llm @summary = @claudePoll(@prompt, "sonnet")
```

Do **not** use `let llm` — it will not parse. Labels are only valid on `var` and `exe` declarations.

#### What re-runs

Everything that isn't `llm`-labeled re-executes normally:
- File loads (`<path>`)
- Variable assignments
- Shell commands (`/run`)
- File writes (`/output`, `/append`)
- Sequential processing

This is intentional. File loads are fast, commands may have side effects that need to happen, and variable assignments are trivial. Only the expensive LLM calls are worth caching.

#### Cache busting

```bash
# Ignore existing cache, rebuild from scratch
mlld run pipeline --checkpoint --fresh

# Clear checkpoint files
mlld checkpoint clean pipeline
```

#### Inspecting checkpoints

```bash
# List cached calls
mlld checkpoint list pipeline

# Show details for a specific checkpoint
mlld checkpoint inspect pipeline
```

### Resumable execution

Resume from a named function when a script changes between runs.

#### Basic resume

```bash
# Resume from where it left off (uses checkpoint cache)
mlld run pipeline --resume

# Resume from a specific function
mlld run pipeline --resume @processFiles

# If multiple functions with same name, specify index (0-based)
mlld run pipeline --resume @processFiles:0
```

#### Fuzzy resume for parallel loops

When a function contains a parallel loop iterating over an array, you can resume from a specific item using a fuzzy match on the start of the array value:

```bash
# Resume the parallel loop at the item matching "tests/cases/docs"
mlld run pipeline --resume @processFiles("tests/cases/docs")
```

The fuzzy match finds the first item in the iteration array whose string representation starts with the given value. Items before it use cached results (if available). Items from that point forward re-execute.

This is useful when:
- You know a specific item produced bad output and want to redo from there
- The script changed and you want to re-run from a specific point
- You want to skip ahead in a long iteration

#### How resume works

1. Re-evaluate the script from the top (cheap — file loads, variable assignments)
2. When reaching the target function, enter it normally
3. For any `llm`-labeled call inside the function, check the checkpoint cache
4. Cached results are returned without execution; uncached calls execute and are cached

Resume composes with checkpointing — `--resume` implies `--checkpoint`. The difference is that `--resume @fn` tells the interpreter "I want to re-enter at this function" rather than just "use the cache."

### Script forking

Start a new script using another script's checkpoint as seed state.

```bash
# Run expensive data collection
mlld run collect --checkpoint
# Completes: 732 LLM calls, all cached

# Branch into different analyses using the same cached LLM results
mlld run analyze-v1 --fork collect
mlld run analyze-v2 --fork collect
mlld run analyze-v3 --fork collect
```

#### How forking works

The `--fork` flag loads checkpoint files from another script and makes them available to the current script. If the new script calls the same functions with the same arguments, those calls hit the forked cache.

```mlld
# analyze-v1/index.mld
# This script calls @claudePoll with the same review prompts as collect,
# so those calls are instant. But it does different post-processing.

var @files = <src/**/*.ts>
var @results = for parallel(20) @file in @files [
  let llm @review = @claudePoll(@reviewPrompt(@file), "sonnet")  # Cache hit from collect
  => @review
]

# Different analysis from here — only this part executes
var llm @synthesis = @claudePoll(@synthesisPrompt(@results), "opus")
output @synthesis to "analysis-v1.json"
```

This is powerful for iterative development: pay for data collection once, experiment with analysis approaches using cached results.

#### Forking with different models

If your forked script uses a different model or different prompt for some calls, those calls miss the cache and execute normally. Only calls with identical arguments hit the cache.

```bash
# Original used sonnet for reviews
mlld run collect --checkpoint

# Fork but use opus for reviews — all calls re-execute (different args)
mlld run collect-opus --fork collect
```

---

## Detailed Specification

### Part 1: Hooks Directive

#### Grammar

The `hook` directive mirrors the existing `guard` directive grammar (`grammar/directives/guard.peggy`). Guards parse two forms: a modern timing-required form and a legacy `for` form. Hooks use only the modern form.

```peggy
SlashHook
  = DirectiveContext HookKeyword _ nameTiming:(name __)? timing _ filter _ "=" _ hookBody ending?
  {
    return {
      kind: 'hook',
      name: nameTiming?.[0] ?? null,
      timing: timing,
      filter: filter,
      body: hookBody
    };
  }

HookKeyword = "hook"

HookTiming = "before" / "after"

HookFilter
  = HookFunctionFilter
  / HookOperationFilter
  / HookDataFilter

HookFunctionFilter
  = "@" id:BaseIdentifier args:("(" QuotedString ")")? {
    return { kind: 'function', name: id, argPattern: args?.[1] ?? null };
  }

HookOperationFilter
  = "op:" type:OperationTypeIdentifier {
    return { kind: 'operation', type: type };
  }

HookDataFilter
  = label:DataLabelIdentifier {
    return { kind: 'data', label: label };
  }
```

**New operation types** for hooks (extending existing `OperationTypeIdentifier`):

| Type | Fires at |
|------|----------|
| `op:for` | Before/after entire for loop |
| `op:for:iteration` | Before/after each for iteration |
| `op:for:batch` | Before/after parallel batch (concurrency window) |
| `op:loop` | Before/after each loop() iteration |
| `op:import` | Before/after module import |

These extend the existing operation types already handled: `op:var`, `op:run`, `op:exe`, `op:show`, `op:output`, `op:append`.

#### AST Node

```typescript
interface HookDirectiveNode extends BaseDirectiveNode {
  kind: 'hook';
  values: {
    name: string | null;
    timing: 'before' | 'after';
    filter: HookFilter;
    body: WhenBlock | DirectiveBlock;
  };
}

type HookFilter =
  | { kind: 'function'; name: string; argPattern: string | null }
  | { kind: 'operation'; type: string }
  | { kind: 'data'; label: string };
```

#### HookRegistry

Parallel to `GuardRegistry` (`interpreter/guards/GuardRegistry.ts:60`). Stores hook definitions indexed by trigger type for fast lookup.

```typescript
// interpreter/hooks/HookRegistry.ts

export interface HookDefinition {
  id: string;
  name: string | null;
  timing: 'before' | 'after';
  filter: HookFilter;
  body: WhenBlock | DirectiveBlock;
  registrationOrder: number;
  sourceLocation: SourceLocation | null;
}

export class HookRegistry {
  private readonly hooks: HookDefinition[] = [];
  private readonly functionIndex: Map<string, HookDefinition[]>;   // keyed by function name
  private readonly operationIndex: Map<string, HookDefinition[]>;  // keyed by op:type
  private readonly dataIndex: Map<string, HookDefinition[]>;       // keyed by label

  register(node: HookDirectiveNode): void;

  getFunctionHooks(fnName: string, timing: 'before' | 'after'): HookDefinition[];
  getOperationHooks(opType: string, timing: 'before' | 'after'): HookDefinition[];
  getDataHooks(label: string, timing: 'before' | 'after'): HookDefinition[];
}
```

The registry lives on `Environment`, shared across the family tree (same pattern as `GuardRegistry`).

#### Hook Execution

Hooks execute at the same lifecycle points as guards, but with different semantics. In the evaluation flow defined in `interpreter/eval/directive.ts` (lines ~130-149) and `interpreter/eval/exec/guard-policy.ts` (lines ~525, ~656):

```
Pre-hooks  →  Guard pre-hooks  →  [execute]  →  Guard post-hooks  →  Post-hooks
   ↑                                                                      ↑
   user hooks                                                        user hooks
   (can transform)                                                   (can transform)
```

User-defined hooks run OUTSIDE the guard lifecycle:
- `before` hooks run before guard pre-hooks
- `after` hooks run after guard post-hooks and taint-post-hook

This means hooks see the raw inputs (before guards transform them) and the final outputs (after guards and taint tracking are done).

**Execution rules:**
- All matching hooks run in registration order (no short-circuiting)
- Each hook runs in a try/catch — errors are collected, not propagated
- `after` hooks that return a value chain sequentially (each receives the prior hook's output)
- `before` hooks that return a value chain similarly (final value becomes the operation input)
- Hooks are non-reentrant per invocation (prevent loops), same as guards

#### Function-targeted hooks

Function hooks (`hook before @claudePoll`) fire when the named executable is invoked. They integrate into `evaluateExecInvocation` (`interpreter/eval/exec-invocation.ts:~1275`).

The optional argument pattern (`hook before @claudePoll("review")`) performs a `startsWith` match on the string representation of the first argument. This is intentionally simple — it's a filter for observation, not a full pattern matcher.

**Context available in function hooks:**

| Variable | Available in | Description |
|----------|-------------|-------------|
| `@input` | before | Array of arguments to the function |
| `@output` | after | Return value of the function |
| `@mx.op.name` | both | Function name |
| `@mx.op.labels` | both | Labels on the function/invocation |
| `@mx.op.type` | both | Always `"exe"` for function hooks |

#### Integration with existing HookManager

The existing `HookManager` (`interpreter/hooks/HookManager.ts:43`) manages built-in pre/post hooks. User-defined hooks are a separate concern — they're evaluated as mlld code (like guard blocks), not as TypeScript callbacks.

The integration point is in the directive evaluation lifecycle. The evaluator calls user-defined hooks before/after the built-in hook chain:

```typescript
// In evaluateDirective (interpreter/eval/directive.ts)

// 1. Run user-defined before hooks (from HookRegistry)
const hookBeforeResult = await runUserHooks('before', node, inputs, env, operationContext);
const effectiveInputs = hookBeforeResult.transformedInputs ?? inputs;

// 2. Run built-in pre-hooks (guard-pre-hook) via HookManager.runPre
const preDecision = await hookManager.runPre(node, effectiveInputs, env, operationContext);

// 3. Execute directive
const result = await dispatchDirective(directive, env, context);

// 4. Run built-in post-hooks (guard-post-hook, taint-post-hook) via HookManager.runPost
let finalResult = await hookManager.runPost(node, result, inputs, env, operationContext);

// 5. Run user-defined after hooks (from HookRegistry)
finalResult = await runUserHooks('after', node, finalResult, env, operationContext);
```

**New operation context emission points.** To support `op:for:iteration` and `op:for:batch`, the for-loop evaluator (`interpreter/eval/for.ts:~270-313`) needs to emit OperationContext at iteration and batch boundaries. Currently, only top-level directives and exe invocations create operation contexts. The `runOne` callback in the for evaluator would wrap each iteration with:

```typescript
const iterationContext: OperationContext = {
  type: 'for:iteration',
  name: varName,
  labels: sourceDescriptor?.labels,
  location: directive.location,
  metadata: {
    index: idx,
    total: iterableArray.length,
    key: entry[0],
    parallel: !!effective?.parallel
  }
};
```

Similarly, `runWithConcurrency` (`interpreter/utils/parallel.ts:19`) would need a batch callback for `op:for:batch` events.

### Part 2: Checkpointing

#### Architecture

Checkpointing is a **labeled-invocation memoization cache** persisted to disk. It operates as a pair of built-in hooks (like taint-post-hook) that intercept `llm`-labeled operations.

```
llm-labeled invocation
  → checkpoint-pre-hook: compute args hash, check cache → hit? return cached result
  → (on miss) execute normally
  → checkpoint-post-hook: write result to cache file
```

#### Label-based targeting

The `llm` label is already supported as a `DataLabel` (`core/types/security.ts:28`) — labels are just strings. Variables declared with the `llm` label have it in their `mx.labels` array (`core/types/variable/VariableTypes.ts:~103`). The checkpoint system checks `operation.labels?.includes('llm')` on the `OperationContext` (`interpreter/env/ContextManager.ts:7-28`) to decide whether to cache.

Labels propagate through the existing security descriptor system (`core/types/security.ts:72-78`). When a variable with `llm` label is passed to a function, the operation's labels include `llm` via the descriptor merge in `directive-inputs.ts`. This means:

```mlld
var llm @result = @claudePoll(...)     # Direct: llm label on the var → cached
let @x = @process(@result)             # Indirect: @result carries llm taint,
                                       # but @process itself isn't llm-labeled → NOT cached
```

Only direct `llm`-labeled invocations are cached. Taint propagation does not trigger caching — this is intentional to avoid caching cheap operations that merely touch LLM-produced data.

#### Cache key computation

```typescript
function computeCacheKey(functionName: string, args: readonly unknown[]): string {
  const payload = JSON.stringify({ fn: functionName, args: args });
  return sha256(payload);
}
```

Arguments are serialized to JSON for hashing. This means:
- Same prompt + same model + same args → same hash → cache hit
- Changed prompt → different hash → cache miss → re-executes
- Changed model → different hash → cache miss (model is typically an argument)
- Same args, different order → different hash (order matters)

For non-JSON-serializable arguments, fall back to a string representation. In practice, LLM call arguments are always serializable (strings, arrays, objects).

#### Cache storage

```
.mlld/checkpoints/
  <script-name>/
    llm-cache.jsonl          # Append-only cache entries
    manifest.json            # Metadata about the cache
```

**Cache entry format** (one JSONL line per cached invocation):

```jsonl
{"key":"sha256:a1b2c3","fn":"claudePoll","argsHash":"sha256:d4e5f6","argsPreview":"Review this file for security...","resultSize":4521,"ts":"2026-02-17T10:30:00Z","durationMs":2340}
{"key":"sha256:g7h8i9","fn":"claudePoll","argsHash":"sha256:j0k1l2","argsPreview":"Assess whether this test cov...","resultSize":1203,"ts":"2026-02-17T10:30:03Z","durationMs":1870}
```

Results are stored separately (they can be large):

```
.mlld/checkpoints/<script-name>/
  results/
    sha256-a1b2c3.json       # Full result for each cache entry
    sha256-g7h8i9.json
```

**Manifest format:**

```json
{
  "scriptName": "pipeline",
  "scriptPath": "llm/run/pipeline/index.mld",
  "created": "2026-02-17T10:00:00Z",
  "lastUpdated": "2026-02-17T12:30:00Z",
  "totalCached": 732,
  "totalSizeBytes": 3421000
}
```

#### Built-in checkpoint hooks

Registered alongside guard hooks and taint hook in `Environment.registerBuiltinHooks()` (`interpreter/env/Environment.ts:1686-1690`):

```typescript
private registerBuiltinHooks(): void {
  this.hookManager.registerPre(guardPreHook);
  this.hookManager.registerPre(checkpointPreHook);    // NEW
  this.hookManager.registerPost(guardPostHook);
  this.hookManager.registerPost(taintPostHook);
  this.hookManager.registerPost(checkpointPostHook);  // NEW
}
```

**checkpoint-pre-hook:**

```typescript
// interpreter/hooks/checkpoint-pre-hook.ts

export const checkpointPreHook: PreHook = async (
  node: HookableNode,
  inputs: readonly unknown[],
  env: Environment,
  operation?: OperationContext
): Promise<HookDecision> => {
  // Only active when --checkpoint is enabled
  if (!env.getCheckpointManager()) return { action: 'continue' };

  // Only cache llm-labeled operations
  if (!operation?.labels?.includes('llm')) return { action: 'continue' };

  const cacheKey = computeCacheKey(operation.name, inputs);
  const cached = await env.getCheckpointManager().get(cacheKey);

  if (cached) {
    // Return cached result — the operation is skipped
    return {
      action: 'continue',
      metadata: { checkpointHit: true, cachedResult: cached }
    };
  }

  // Cache miss — mark for post-hook caching
  return {
    action: 'continue',
    metadata: { checkpointKey: cacheKey }
  };
};
```

Note: the pre-hook returns `'continue'` even on cache hit — it doesn't `'abort'`. The cached result is conveyed via metadata, and the directive evaluator checks for `checkpointHit` to short-circuit execution. This keeps the hook protocol clean (hooks don't block) while still enabling the memoization behavior.

Alternatively, this could use a new `HookDecisionAction` value like `'fulfill'` that means "I have the result, skip execution." This is semantically distinct from `'abort'` (which is an error) and `'deny'` (which is a guard concept).

**checkpoint-post-hook:**

```typescript
// interpreter/hooks/checkpoint-post-hook.ts

export const checkpointPostHook: PostHook = async (
  node: HookableNode,
  result: EvalResult,
  inputs: readonly unknown[],
  env: Environment,
  operation?: OperationContext
): Promise<EvalResult> => {
  if (!env.getCheckpointManager()) return result;
  if (!operation?.labels?.includes('llm')) return result;

  const cacheKey = operation.metadata?.checkpointKey as string | undefined;
  if (!cacheKey) return result;  // Was a cache hit, already handled

  // Write to cache
  await env.getCheckpointManager().put(cacheKey, {
    fn: operation.name,
    argsPreview: truncate(JSON.stringify(inputs), 100),
    result: result.value,
    ts: new Date().toISOString(),
    durationMs: operation.metadata?.durationMs
  });

  return result;
};
```

#### CheckpointManager

New service on Environment, created when `--checkpoint` is passed:

```typescript
// interpreter/checkpoint/CheckpointManager.ts

export class CheckpointManager {
  private readonly cacheDir: string;
  private readonly index: Map<string, CacheEntry>;  // In-memory index loaded from JSONL

  constructor(scriptName: string, options: CheckpointOptions);

  async load(): Promise<void>;           // Read existing cache from disk
  async get(key: string): Promise<unknown | null>;  // Cache lookup
  async put(key: string, entry: CacheEntry): Promise<void>;  // Append to cache
  async invalidateFrom(pattern: string): Promise<number>;     // For --resume fuzzy match
  async clear(): Promise<void>;          // For --fresh

  getStats(): { totalCached: number; totalSize: number };
}
```

The `CheckpointManager` is instantiated in the CLI layer when `--checkpoint` or `--resume` flags are present, and passed into the `Environment` constructor.

#### Integration with for-parallel

No special integration needed. Each LLM call inside a for-parallel loop independently hits or misses the cache. The `runWithConcurrency` function (`interpreter/utils/parallel.ts:19`) doesn't change at all.

```mlld
exe llm @review(prompt) = @claudePoll(@prompt, "sonnet")
var @results = for parallel(20) @file in @files [
  # Each @review call:
  #   1. checkpoint-pre-hook computes hash of (review, @reviewPrompt(@file))
  #   2. If cached: result injected, @claudePoll not called
  #   3. If not cached: @claudePoll executes, checkpoint-post-hook writes result
  var @result = @review(@reviewPrompt(@file))
  => @result
]
```

200 of 732 items completed before a crash? Those 200 LLM calls are in the cache. Re-run the script, the first 200 resolve instantly, the remaining 532 execute normally.

#### CLI integration

New flags in `CLIOptions` (`cli/index.ts:~43-127`) and `RunOptions` (`cli/commands/run.ts:~24-28`):

```typescript
interface RunOptions {
  timeoutMs?: number;
  debug?: boolean;
  inject?: Record<string, string>;
  checkpoint?: boolean;      // NEW: enable checkpoint cache
  fresh?: boolean;           // NEW: clear cache before run
  resume?: string | true;    // NEW: resume target (true = auto, string = function pattern)
  fork?: string;             // NEW: fork from another script's cache
}
```

```bash
mlld run pipeline --checkpoint              # Enable caching
mlld run pipeline --checkpoint --fresh      # Clear cache, rebuild
mlld run pipeline --resume                  # Resume with auto-detection
mlld run pipeline --resume @processFiles    # Resume at specific function
mlld run pipeline --resume @processFiles:0  # First function with that name
mlld run pipeline --resume @processFiles("tests/cases/docs")  # Fuzzy item match
mlld run pipeline --fork collect            # Use collect's cache
mlld checkpoint list pipeline               # List cached calls
mlld checkpoint inspect pipeline            # Show cache details
mlld checkpoint clean pipeline              # Delete cache files
```

### Part 3: Resumable Execution

#### Resume semantics

`--resume` re-evaluates the script from the top. It does NOT skip or fast-forward past directives. The script runs normally, and checkpointed LLM calls resolve from cache.

The `--resume @functionName` form adds **selective cache invalidation**: it invalidates cached entries that were produced inside the named function, forcing them to re-execute. Everything before that function still uses the cache.

```bash
# Full cache — all 732 calls cached
mlld run pipeline --checkpoint

# Re-run with different analysis for @processFiles
# Invalidates cache entries from @processFiles, keeps everything else
mlld run pipeline --resume @processFiles
```

#### Fuzzy matching for parallel items

`--resume @processFiles("tests/cases/docs")` is a cursor into a parallel iteration:

1. Find the function named `@processFiles`
2. Inside that function, find the for-parallel loop
3. In the iteration array, find the first item whose string representation starts with `"tests/cases/docs"`
4. Invalidate cache entries for that item and all subsequent items
5. Re-run the script — items before the cursor hit cache, items from the cursor forward re-execute

Implementation: the `CheckpointManager.invalidateFrom(pattern)` method matches cache entries by their `argsPreview` field. Entries whose preview starts with the pattern (or whose input value starts with it) are removed from the cache.

#### Function name resolution

When `--resume @processFiles` is specified, the interpreter needs to map the function name to its cache entries. Cache entries already store `fn` (the function name), so invalidation is:

```typescript
// In CheckpointManager
async invalidateFunction(fnName: string): Promise<number> {
  let removed = 0;
  for (const [key, entry] of this.index) {
    if (entry.fn === fnName) {
      this.index.delete(key);
      removed++;
    }
  }
  await this.rewriteCache();  // Compact JSONL without invalidated entries
  return removed;
}
```

The `:0` suffix for disambiguating multiple functions with the same name refers to the Nth invocation site in the script, tracked by a counter during evaluation.

### Part 4: Script Forking

#### Fork semantics

`--fork <script>` loads checkpoint files from another script's cache directory and makes them available to the current script.

```bash
mlld run analyze --fork collect
```

This means:
1. Load `collect`'s cache from `.mlld/checkpoints/collect/`
2. Create `analyze`'s cache directory `.mlld/checkpoints/analyze/`
3. Start evaluating `analyze/index.mld`
4. For any `llm`-labeled call, check `collect`'s cache first, then `analyze`'s cache
5. Cache hits from `collect` are used directly
6. New calls are cached in `analyze`'s cache (not `collect`'s)

The forked cache is read-only. The current script's cache accumulates new entries. This means:
- `collect`'s cache is never modified by forking
- Multiple scripts can fork from the same source simultaneously
- The fork inherits results, not variable state — the new script computes its own variables

#### When forking hits vs misses

Cache hits require identical function name + arguments. This means:

```mlld
# In collect/index.mld:
exe llm @review(prompt) = @claudePoll(@prompt, "sonnet")
var @result = @review(@reviewPrompt(@file))

# In analyze/index.mld — HITS if @reviewPrompt(@file) produces same string:
exe llm @review(prompt) = @claudePoll(@prompt, "sonnet")
var @result = @review(@reviewPrompt(@file))

# MISSES — different model:
exe llm @review(prompt) = @claudePoll(@prompt, "opus")
var @result = @review(@reviewPrompt(@file))

# MISSES — different prompt:
exe llm @review(prompt) = @claudePoll(@prompt, "sonnet")
var @result = @review(@deepReviewPrompt(@file))
```

This is the correct behavior: you only get cached results when you're asking the same question.

### Part 5: Interaction Between Features

#### Hooks + Checkpointing

User-defined hooks run alongside checkpoint hooks. The execution order for an `llm`-labeled invocation:

```
1. User before hooks (from HookRegistry)
2. checkpoint-pre-hook (check cache)
   → cache hit: result injected, skip to step 6
   → cache miss: continue
3. guard-pre-hook (enforce guards)
4. [execute function]
5. guard-post-hook + taint-post-hook
6. checkpoint-post-hook (write to cache, on miss only)
7. User after hooks (from HookRegistry)
```

User hooks always run — even on cache hits. This means observability hooks see every invocation, cached or not:

```mlld
hook @logLLM after @claudePoll = [
  # This fires for both cached and fresh calls
  # @mx.checkpoint.hit tells you which
  when @mx.checkpoint.hit [
    true => show `  [cached] @mx.op.name`
    false => show `  [fresh] @mx.op.name (@output.durationMs ms)`
  ]
]
```

#### Hooks + Guards

Hooks fire outside the guard lifecycle. A guard can deny an operation, and the `after` hooks still fire (with the denial as the result). This means hooks can observe guard decisions:

```mlld
hook @auditDenials after op:exe = when [
  @mx.guard.denied => [
    append `@now | DENIED | @mx.op.name | @mx.guard.reason` to "audit.log"
  ]
]
```

#### Checkpointing + Guards

Guards run on cache misses (when the function actually executes). On cache hits, guards are skipped — the cached result was already guard-validated on its original execution.

If guard rules change between runs, previously cached results may no longer comply. The `--fresh` flag handles this (rebuild cache under new guard rules). For finer control, `--resume @fn` invalidates specific function caches.

### Appendix A: New Context Variables

| Variable | Scope | Description |
|----------|-------|-------------|
| `@mx.hooks.errors` | After hooks run | Array of errors from hooks that threw |
| `@mx.checkpoint.hit` | After checkpoint check | Boolean: was this a cache hit? |
| `@mx.checkpoint.key` | After checkpoint check | Cache key for this invocation |
| `@mx.for.index` | In for:iteration hooks | Current iteration index (0-based) |
| `@mx.for.total` | In for:iteration hooks | Total items in iteration |
| `@mx.for.key` | In for:iteration hooks | Current item key |
| `@mx.for.parallel` | In for:iteration hooks | Boolean: is this a parallel loop? |
| `@mx.for.batchIndex` | In for:batch hooks | Current batch number |
| `@mx.for.batchSize` | In for:batch hooks | Items in current batch |

### Appendix B: Architecture Map

```
Grammar
  grammar/directives/hook.peggy          # NEW: hook directive grammar
  grammar/directives/guard.peggy         # Existing: template for hook grammar

AST
  core/types/ast/HookDirectiveNode.ts    # NEW: hook AST node type

Registry
  interpreter/hooks/HookRegistry.ts      # NEW: stores user-defined hooks
  interpreter/guards/GuardRegistry.ts    # Existing: template for HookRegistry

Evaluation
  interpreter/eval/hook.ts               # NEW: evaluateHookDirective (register hooks)
  interpreter/eval/directive.ts          # MODIFIED: call user hooks in lifecycle
  interpreter/eval/for.ts               # MODIFIED: emit for:iteration/batch operation contexts
  interpreter/eval/exec-invocation.ts   # MODIFIED: call function-targeted hooks

Hook execution
  interpreter/hooks/user-hook-runner.ts  # NEW: evaluates user hook bodies (like guard block evaluation)
  interpreter/hooks/HookManager.ts       # Existing: built-in hook orchestration (unchanged)

Checkpointing
  interpreter/checkpoint/CheckpointManager.ts    # NEW: cache read/write/invalidation
  interpreter/hooks/checkpoint-pre-hook.ts       # NEW: cache lookup before execution
  interpreter/hooks/checkpoint-post-hook.ts      # NEW: cache write after execution

Environment
  interpreter/env/Environment.ts         # MODIFIED: add HookRegistry, CheckpointManager
  interpreter/env/ContextManager.ts      # MODIFIED: new context variables (@mx.for, @mx.checkpoint)

CLI
  cli/index.ts                           # MODIFIED: new flags
  cli/commands/run.ts                    # MODIFIED: checkpoint/resume/fork initialization
  cli/commands/checkpoint.ts             # NEW: mlld checkpoint list/inspect/clean
```

### Appendix C: Existing Code References

| Component | File | Key Lines | Relevance |
|-----------|------|-----------|-----------|
| HookManager class | `interpreter/hooks/HookManager.ts` | 43-95 | Hook orchestration; user hooks integrate alongside |
| PreHook / PostHook types | `interpreter/hooks/HookManager.ts` | 23-37 | Type signatures for built-in hooks |
| HookDecision / HookDecisionAction | `interpreter/hooks/HookManager.ts` | 12-17 | Decision protocol; may need new `'fulfill'` action |
| GuardRegistry | `interpreter/guards/GuardRegistry.ts` | 60-283 | Template for HookRegistry (indexed storage, timing match) |
| guard.peggy | `grammar/directives/guard.peggy` | 8-229 | Template for hook.peggy grammar |
| OperationContext | `interpreter/env/ContextManager.ts` | 7-28 | Context passed to hooks; needs new fields for for-loop metadata |
| evaluateDirective lifecycle | `interpreter/eval/directive.ts` | 130-149 | Where user hooks integrate (before/after built-in hooks) |
| evaluateExecInvocation hooks | `interpreter/eval/exec/guard-policy.ts` | 525, 656 | Where function-targeted hooks fire |
| registerBuiltinHooks | `interpreter/env/Environment.ts` | 1686-1690 | Registration point for checkpoint hooks |
| taint-post-hook | `interpreter/hooks/taint-post-hook.ts` | 14+ | Template for checkpoint-post-hook pattern |
| guard-pre-hook | `interpreter/hooks/guard-pre-hook.ts` | 61-67 | Template for checkpoint-pre-hook pattern |
| runWithConcurrency | `interpreter/utils/parallel.ts` | 19-24 | Parallel runner; NO changes needed for checkpoint |
| For-parallel evaluation | `interpreter/eval/for.ts` | 270-313 | runOne callback; needs OperationContext emission for iteration hooks |
| DataLabel type | `core/types/security.ts` | 28 | `llm` is a standard DataLabel |
| SecurityDescriptor | `core/types/security.ts` | 72-78 | Labels field carries `llm` through operations |
| Variable types | `core/types/variable/VariableTypes.ts` | 26-34, 103-133, 429-444 | Variable structure, mx.labels for checkpoint targeting |
| CLI options | `cli/index.ts` | 43-127 | Where --checkpoint/--resume/--fork flags are added |
| Run command | `cli/commands/run.ts` | 24-52 | Where flags are threaded to execution |
| Var label grammar | `grammar/directives/var.peggy` | 9 | How `var llm @x = ...` is parsed |
