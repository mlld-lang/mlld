---
updated: 2025-11-13
tags: #arch, #hooks, #security
related-docs: docs/dev/DATA.md, docs/dev/INTERPRETER.md
related-code: interpreter/hooks/*.ts, interpreter/eval/directive.ts, interpreter/eval/directive-inputs.ts
related-types: HookManager { PreHook, PostHook, HookDecision, HookInputHelpers }, ContextManager { OperationContext }
---

# Evaluation Hooks

## tldr

mlld's hook system enables pre-execution and post-execution extensions at evaluation boundaries (directives and user-defined exe invocations). Pre-hooks inspect inputs and can abort operations (guard insertion point). Post-hooks transform results and propagate metadata (taint tracking). Hooks receive extracted inputs, operation context, and optional input helpers for analysis.

## Principles

- Hooks execute at evaluation boundaries (before/after directives and user-defined exe invocations)
- Pre-hooks run in registration order, first non-continue action stops chain
- Post-hooks run in registration order, transform results sequentially
- Hooks receive extracted inputs (any type), operation context, and optional helpers
- Non-reentrant per directive invocation (prevent infinite loops)

## Details

### Hook Types

Hook signatures accept a `HookableNode`, which is a discriminated union of `DirectiveNode` and `ExecInvocationNode`. Hooks see the same API regardless of which evaluation boundary triggered them; use type guards when node-specific data is required.

**PreHook** - Executes before directive or exe evaluation
```typescript
type PreHook = (
  node: HookableNode,
  inputs: readonly unknown[],
  env: Environment,
  operation?: OperationContext,
  helpers?: HookInputHelpers
) => Promise<HookDecision>;

type HookDecisionAction = 'continue' | 'abort' | 'retry';

interface HookDecision {
  action: HookDecisionAction;
  metadata?: Record<string, unknown>;
}
```

**PostHook** - Executes after directive or exe evaluation
```typescript
type PostHook = (
  node: HookableNode,
  result: EvalResult,
  inputs: readonly unknown[],
  env: Environment,
  operation?: OperationContext
) => Promise<EvalResult>;
```

**HookInputHelpers** - Optional helpers for input analysis (guard hooks)
```typescript
interface HookInputHelpers {
  guard?: GuardInputHelper;
}
```

**GuardInputHelper** - Provides quantifier-based analysis of input Variables
```typescript
interface GuardInputHelper {
  raw: readonly Variable[];    // Original input Variables
  mx: {
    labels: readonly DataLabel[];  // Union of all labels
    tokens: number[];              // Token counts per variable
    sources: readonly string[];    // Union of all sources
    totalTokens(): number;         // Sum of all tokens
    maxTokens(): number;           // Maximum token count
  };
  any: QuantifierHelper;   // Check if ANY input matches condition
  all: QuantifierHelper;   // Check if ALL inputs match condition
  none: QuantifierHelper;  // Check if NO inputs match condition
}

- Guard hooks only operate on Variables. `materializeGuardInputs()` (`interpreter/utils/guard-inputs.ts`) receives arbitrary values, passes existing Variables through, and uses `materializeExpressionValue()` to convert provenance-tagged primitives (from iterators, pipelines, etc.) into synthetic Variables. Plain values that lack provenance are filtered out, so guard logic always sees inputs with `mx.labels`, token counts, and source metadata. This is why iterators normalize user-facing data to plain arrays while still tagging each element via `ExpressionProvenance`.
```

### Key Components

**HookManager** (`interpreter/hooks/HookManager.ts`)
- Registers pre-hooks and post-hooks
- Executes hooks in registration order
- Builds HookInputHelpers when inputs are all Variables
- Returns first non-continue decision for pre-hooks

**ContextManager** (`interpreter/env/ContextManager.ts`)
- Manages @mx namespace state (@mx.op, @mx.pipe, @mx.guard)
- Push/pop context stacks for nested operations
- Builds ambient @mx object with security and pipeline state
- Provides guard context snapshots so denied handlers can access the guarded Variable via `@mx.guard.input` (alias `@mx.input`)

**extractDirectiveInputs** (`interpreter/eval/directive-inputs.ts`)
- Extracts inputs from directives (Variables or other values)
- Directive-specific extraction (show, output, append, run, var)
- Returns empty array for unsupported directives

### Integration Point

**directive.ts** - Directive integration in `evaluateDirective()`:
```typescript
// Build operation context and extract inputs
const operationContext = buildOperationContext(directive, traceInfo);
const extractedInputs = await extractDirectiveInputs(directive, env);

// Line 130: Pre-hooks
const preDecision = await hookManager.runPre(directive, extractedInputs, env, operationContext);
if (preDecision.action === 'abort') {
  throw new Error(preDecision.metadata?.reason ?? 'Operation aborted by hook');
}

// Directive evaluation happens here

// Line 149: Post-hooks
result = await hookManager.runPost(directive, result, extractedInputs, env, operationContext);
```

**exec-invocation.ts** - Expression integration in `evaluateExecInvocation()`:
```typescript
const guardInputs = originalVariables.filter(Boolean) as Variable[];
const operationContext: OperationContext = {
  type: 'exe',
  name: variable.name ?? commandName,
  labels: execDescriptor?.labels,
  location: node.location ?? null,
  metadata: { executableType: definition.type, command: commandName }
};

return env.withOpContext(operationContext, async () => {
  const preDecision = await hookManager.runPre(node, guardInputs, env, operationContext);
  await handleGuardDecision(preDecision, node, env, operationContext);

  // Execute user-defined /exe body...

  return hookManager.runPost(node, result, guardInputs, env, operationContext);
});
```
Hooks run only for user-defined `/exe` functions. Built-in helpers and guard helper executables short-circuit before hook execution to avoid recursion.

### Built-in Hooks

**taint-post-hook** (`interpreter/hooks/taint-post-hook.ts`)
- Registered automatically in Environment.registerBuiltinHooks()
- Collects security descriptors from inputs and result values
- Merges descriptors and records in environment
- Traverses nested objects/arrays to find all descriptors

**guard-before / guard-after** (`interpreter/hooks/guard-pre-hook.ts`, `interpreter/hooks/guard-post-hook.ts`)
- Implements `/guard ... before ...` and `/guard ... after ...` syntax; hook files keep pre/post names for lifecycle clarity.
- Enforces registered guards before and after directive execution; resolves per-input and per-operation guard definitions, injects guard helpers, and can abort or request retries.
- Guard helpers are reserved in guard contexts: `@prefixWith` and `@tagValue` are injected into guard environments, and guard envs inherit all parent variables/executables so user helpers stay visible.
- `PipelineExecutor.executeCommandVariable()` always passes `hookOptions.guard`, so every pipeline stage (including the synthetic `__source__`) runs through the guard hook path with an OperationContext seeded from the merged stage descriptor. Descriptor hints supplied to `processPipeline()` and the provenance assembled in `finalizeStageOutput()` flow into `@mx.op.labels`, giving guard rules the same label set that downstream stages receive even when Stage 0 started with a plain string.
- Because interpolation, iterators, pipelines, heredoc `/run`, and JS/Node returns all attach provenance handles through `ExpressionProvenance`, `materializeGuardInputs()` always materializes real Variables (with descriptors) before guard evaluation. Guard fixtures that sanitize secrets, block heredocs, or retry pipeline stages rely on this hook to surface `.mx.labels` even when the user-facing value is a primitive string produced by chained helpers.
- Guard trace exposure: every guard execution contributes a `GuardResult` to `@mx.guard.trace` alongside `@mx.guard.reasons` and `@mx.guard.hints`. These fields exist only while a guard is evaluating or while a denied handler runs; they are cleared before the main operation executes and reset to empty arrays by default to avoid null checks. A denied handler sees the aggregated trace, hints, and reasons for the whole operation.
- Pipeline guard history: when a pipeline context is active, each guard evaluation appends `{ stage, operation, decision, trace, hints, reasons }` to `@p.guards` (and `@mx.pipe.guards`), one entry per attempt. Retries append new entries instead of replacing earlier attempts, preserving a full audit trail across stages.
- Guard non-reentrancy: while a guard evaluates, all guards are suppressed for nested directive/exe operations. Helper executables invoked from guard actions run unguarded to prevent recursion loops; treat them as trusted.
- Retry shared budget: guard retries reuse the pipeline retry machinery; `@mx.guard.try` increments per attempt across the guard chain, and history is visible in `@p.guards` entries for each attempt. A retry on any guard in the chain causes the whole operation to be retried once; subsequent attempts see updated `@mx.guard.try` values.
- Streaming compatibility: guard-post-hook denies when streaming is enabled and after-timed guards are registered. After-guards require non-streaming execution so the hook can validate a stable output; streamed effects are not retractable.
- Effects: `runBuiltinEffect()` builds an `OperationContext` with the effect identifier as `type` (`output`/`show`/`append`/`log`) and `subtype: "effect"`, materializes the effect payload for guard inputs, and routes through guard pre/post hooks. `op:output`/`op:show`/`op:append`/`op:log` guard filters apply to both directives and inline effects. Guard retries on effects convert to a deny with a clear error because effect replay is not supported.

### OperationContext

Provides metadata to hooks about the pending/completed operation:
```typescript
interface OperationContext {
  type: string;              // Directive kind (e.g., "var", "run", "output")
  subtype?: string;          // Optional subtype (e.g., "runExec")
  labels?: readonly string[]; // Operation labels (data labels, op labels, etc.)
  name?: string;             // Friendly name or identifier
  command?: string;          // Command string (for /run) when statically known
  target?: string;           // Target path (for /import, /output) when statically known
  location?: SourceLocation | null;  // Original directive location
  metadata?: Readonly<Record<string, unknown>>;  // Additional directive-specific metadata
}
```

### Hook Lifecycle

```
Directive boundary
1. evaluateDirective() called
2. Build operation context (buildOperationContext)
3. Extract inputs (extractDirectiveInputs or prepareVarAssignment)
4. → Run pre-hooks (HookManager.runPre)
5.   ├─ guardPreHook evaluates guard definitions
6.   └─ First non-continue → abort or retry
7. → Evaluate directive (directive-specific evaluator)
8. → Run post-hooks (HookManager.runPost)
9.   └─ taint-post-hook collects and merges security descriptors

Exe boundary
1. evaluateExecInvocation() called
2. Collect original argument Variables (guardInputs)
3. Build operation context `{ type: 'exe', ... }`
4. → Run pre-hooks (HookManager.runPre)
5.   ├─ guardPreHook evaluates guard definitions
6.   └─ First non-continue → abort or retry
7. → Execute user-defined /exe implementation
8. → Run post-hooks (HookManager.runPost)
9.   └─ taint-post-hook propagates taint to exe result
```

### Input Extraction

Each directive kind has custom input extraction:

- **show**: Extracts displayed variable from invocation
- **output**: Extracts source variable (only for non-invocation forms)
- **append**: Same as output extraction logic
- **run**: Extracts command text or exec variable reference
- **var**: Special case - uses prepareVarAssignment instead
- **Others**: Return empty array (no extraction implemented)

For /var directives, the variable is pre-computed via prepareVarAssignment and passed as the single input.

## Gotchas

- Hooks are non-reentrant - if a hook triggers directive evaluation, hooks don't re-run for nested directive/exe
- Pre-hook first non-continue action stops chain (abort or retry)
- Post-hooks ALL run sequentially - each can transform the result
- Inputs can be any type (not just Variables) - check with isVariable()
- Operation context is optional in hook signatures - may be undefined
- HookInputHelpers only provided when ALL inputs are Variables (true for exe guard inputs that reference direct Variables)
- Hooks fire for user-defined `/exe` functions only; built-in helpers and guard helper executables bypass hook execution

## Debugging

**Key files**:
- Entry: `interpreter/hooks/HookManager.ts`
- Integration: `interpreter/eval/directive.ts:116-152`
- Taint: `interpreter/hooks/taint-post-hook.ts`
- Context: `interpreter/env/ContextManager.ts`
- Input extraction: `interpreter/eval/directive-inputs.ts`
 - Helpers: `core/types/variable/ArrayHelpers.ts`

**Debug approach**:
- Add logging in HookManager.runPre/runPost to trace hook execution
- Check extractDirectiveInputs output to verify correct extraction
- Inspect OperationContext built by buildOperationContext()
- Verify hook registration in Environment.registerBuiltinHooks()
- Check if HookInputHelpers built (when all inputs are Variables)
