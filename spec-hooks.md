# mlld Evaluation Hooks Specification

## Overview

mlld implements **evaluation hooks** (pre-hooks and post-hooks) for cross-cutting concerns that need to execute before and after directive evaluation. This provides a centralized, composable way to implement security checks, metadata propagation, audit logging, and other concerns that apply consistently across all directives.

Evaluation hooks operate at the directive boundary - the point where mlld evaluates `/import`, `/run`, `/show`, `/var`, `/exe`, and other directives.

**Note:** These are interpreter-internal hooks, not userland-extensible hook. The hook system is part of the interpreter implementation.

## Core Concepts

### Pre-Hooks

Pre-hooks execute BEFORE a directive runs, with access to the directive and its evaluated inputs:

```typescript
type PreHook = (
  directive: DirectiveNode,
  inputs: any,
  env: Environment
) => Promise<HookDecision>;
```

**Use cases:**
- Security guards (prevent dangerous operations)
- Input validation
- Profiling (start timer)

**Important:** Only security hooks (guards) can override values. Generic hooks cannot override inputs to preserve security metadata and label integrity.

### Post-Hooks

Post-hooks execute AFTER a directive runs, with access to the result:

```typescript
type PostHook = (
  directive: DirectiveNode,
  result: any,
  inputs: any,
  env: Environment
) => Promise<any>;
```

**Use cases:**
- Metadata propagation (taint tracking)
- Result transformation
- Audit logging
- Profiling (stop timer)

### Hook Decisions

Pre-hooks return decisions that control execution:

```typescript
interface HookDecision {
  action: 'continue' | 'abort' | 'retry';
  value?: any;      // Override input value (guards only - Phase 4.1)
  metadata?: any;   // Attach metadata for downstream hooks
}
```

**Actions:**
- `continue` - Proceed with directive execution
- `abort` - Stop execution and throw error
- `retry` - Re-evaluate inputs and try again (must check retryability)
- `continue` with `value` - Override inputs with transformed value (guards only in Phase 4.1)

**Constraints:**
- **Retry must check retryability** - Cannot retry side-effectful directives without retryable sources
- **Value override is guard-specific** - Only security hooks (guards) can override values to preserve security metadata

Post-hooks can transform results but cannot abort execution.

## Ambient Context (@ctx) Namespace

The `@ctx` ambient variable provides execution context information throughout mlld scripts. The context is managed by the Environment (or a dedicated ContextManager) and organized into namespaces for different concerns. Token metrics flow through this namespace, so every variable exposes `ctx.tokens`/`ctx.tokest`, and guard helpers can aggregate the same metrics across inputs.

**Context Management:**

Context namespaces are managed centrally (not by the hook system):
- Environment (or ContextManager) owns @ctx state
- Hooks populate their namespace before execution
- Pipeline system populates @ctx.pipe
- Guard hooks populate @ctx.guard
- Operation context (@ctx.op) is populated for all directives

### Operation Context (@ctx.op)

**Available everywhere** - describes the current or pending operation:

```mlld
@ctx.op.type         # Directive type: "run", "show", "import", "output", "exec-invocation"
@ctx.op.labels       # Operation labels (implicit for built-ins, explicit for /exe)
@ctx.op.command      # For /run - the shell command
@ctx.op.path         # For /import - the import path
@ctx.op.name         # For /exe invocations - the function name
@ctx.op.domains      # Extracted domains from commands/imports (Phase 4.1+)
```

**Examples:**
```mlld
# In guards:
/guard for secret = when [
  @ctx.op.type == "run" => deny "No secrets in shell"
  @ctx.op.labels.includes("network") => deny "No secrets over network"
  * => allow
]

# In pipeline stages:
/exe @logger() = {
  echo "Current operation: @ctx.op.type"
}
```

### Pipeline Context (@ctx.pipe)

**Available in pipeline stages only** - describes pipeline execution state:

```mlld
@ctx.pipe.tries      # Array of previous attempts within active retry context
@ctx.pipe.try        # Current attempt number (1, 2, 3...)
@ctx.pipe.stage      # Current stage number (1-based)
@ctx.pipe.length     # Number of completed stages
@ctx.pipe.input      # Original pipeline input (alias to @p[0])
```

**Note:** `@input` is the primary way to access stage input. `@ctx.pipe.input` provides the original base input.

### Guard Context (@ctx.guard)

**Available in guard evaluation only** - describes guard-specific state:

```mlld
@ctx.guard.try       # Current attempt number (1, 2, 3...) - resets per guard check
@ctx.guard.tries     # Array of previous attempt results (if needed)
@ctx.guard.name      # Name of current guard (if named)
@ctx.guard.max       # Maximum retry limit for guards (default: 3)
```

**Implementation note:** Guard retry state reuses the pipeline retry infrastructure (`RetryContext` from `interpreter/eval/pipeline/state-machine.ts`) but surfaces through the `@ctx.guard` namespace for clarity. When guards retry, they create a retry context similar to pipelines, tracking `attemptNumber` and managing retry limits.

**Example:**
```mlld
/guard for llmjson = when first [
  @isValidJson(@input) => allow
  @ctx.guard.try < 3 => retry "Invalid JSON from LLM"
  * => deny "Invalid JSON after 3 attempts"
]
```

## Guard Trigger Scopes

Guards can be triggered per-input or per-operation, determined by their filter syntax:

### Per-Input Guards (Data Guards)

Data guards fire **individually for EACH input** with the specified label:

```mlld
/guard for secret = when [
  # @input is a SINGLE value with label "secret"
  @input.ctx.tokens > 5000 => deny "Secret too large"
  @ctx.op.type == "op:cmd" => deny "No secrets in shell"
  * => allow
]

/var secret @a = "key123"
/var secret @b = "token456"
/var pii @c = "user@email.com"

/run @myFunc(@a, @b, @c)
# Guard fires twice:
#   1. @input = @a (if allows, continue)
#   2. @input = @b (if allows, continue)
#   3. pii guard fires for @c
# First denial aborts entire operation
```

**Syntax:** `/guard [@name] for <data-label> = when [...]`

Data labels: `secret`, `pii`, `untrusted`, `public`, `trusted`, `destructive`, `network`

### Per-Operation Guards (Operation Guards)

Operation guards fire **ONCE per directive** with ALL inputs as an array:

```mlld
/guard for op:run = when [
  # @input is ARRAY of all inputs
  @input.any.ctx.labels.includes("secret") => deny "No secrets in shell"
  @input.all.ctx.labels.includes("trusted") => allow
  @input.totalTokens() > 50000 => deny "Total payload too large"
  * => allow
]

/run @myFunc(@a, @b, @c)
# Guard fires once:
#   @input = [@a, @b, @c]
```

**Syntax:** `/guard [for op:<type>] = when [...]`

**Operation type can be:**
- Directive type: `op:run`, `op:show`, `op:import`, `op:output`
- Execution context: `op:cmd`, `op:sh`, `op:bash`, `op:js`, `op:node`, `op:py`
- Operation label: `op:network`, `op:destructive` (from /exe labels)

**Execution context filters:**
```mlld
for op:cmd      # Bare shell: /run {...}
for op:sh       # Shell script: /run sh {...}
for op:bash     # Bash script: /run bash {...}
for op:js       # JavaScript: /run js {...}
for op:node     # Node.js: /run node {...}
for op:py       # Python: /run python {...}
```

These are shorthands for `op:run.cmd`, `op:run.sh`, etc.

### @input Helper Methods (Per-Operation Guards)

When `@input` is an array, helper methods check across all elements:

```mlld
@input.any.ctx.labels.includes("secret")     # ANY input has label
@input.all.ctx.labels.includes("trusted")    # ALL inputs have label
@input.none.ctx.labels.includes("untrusted") # NONE have label

@input.totalTokens()    # Sum of all token counts
@input.maxTokens()      # Maximum token count
```

**Property Access on Arrays:**

When accessing properties on `@input` (an array), the default behavior is to flatten/merge:

```mlld
@input.ctx.labels  # → ["secret", "pii", "public"] (flattened union from all inputs)
@input.ctx.tokens  # → [1234, 5678, 901] (array of token counts)
```

To access a specific input's properties:
```mlld
@input[0].ctx.labels  # → ["secret"] (just first input)
@input[0].ctx.tokens  # → 1234
```

### Guard Input Helper (Pre-Hook Helper Payload)

Pre-hooks receive a helper payload when every extracted input is a variable. Guards consume this payload to inspect aggregate properties without duplicating boilerplate:

```typescript
type HookInputHelpers = {
  guard?: {
    raw: Variable[];              // Original variables
    ctx: {
      labels: string[];
      tokens: number[];
      sources: string[];
      totalTokens(): number;
      maxTokens(): number;
    };
    totalTokens(): number;
    maxTokens(): number;
    any.ctx.labels.includes(label);
    all.ctx.labels.includes(label);
    none.ctx.labels.includes(label);
  };
};
```

- `helpers.guard` exists only when **all** directive inputs resolve to variables.
- `helpers.guard.ctx.tokens` prefers exact token counts when available and falls back to estimated counts (`tokest`).
- The quantifier helpers (`any`, `all`, `none`) evaluate predicates lazily, matching the semantics described in the Guard Helper section above.

### Operation Type Filters

Operation guards can filter by execution context:

**Shorthand syntax (common):**
```mlld
for op:cmd      # Bare shell commands: /run {...}
for op:sh       # Shell scripts: /run sh {...}
for op:bash     # Bash scripts: /run bash {...}
for op:js       # JavaScript: /run js {...}
for op:node     # Node.js: /run node {...}
for op:py       # Python: /run python {...}
```

**Full syntax (if needed):**
```mlld
for op:run.cmd   # Equivalent to op:cmd
for op:run.sh    # Equivalent to op:sh
for op:run.node  # Equivalent to op:node
```

**Example - Different Security Models:**
```mlld
# Per-input data guard that checks operation type
/guard for secret = when [
  @ctx.op.type == "op:cmd" => deny "No secrets in bare shell"
  @ctx.op.type == "op:node" => deny "No secrets in Node (network access)"
  @ctx.op.type == "op:js" => allow  # JS is sandboxed, safer
  * => allow
]

# Per-operation guard checking aggregate properties
/guard for op:cmd = when [
  @input.any.ctx.labels.includes("secret") => deny "No secrets in shell commands"
  @input.totalTokens() > 100000 => deny "Command payload too large"
  * => allow
]
```

### Filter Requirement

**All guards MUST have a filter** - no overbroad guards allowed:

```mlld
# ✅ Valid - filtered by data label (per-input)
/guard for secret = when [...]

# ✅ Valid - filtered by operation type (per-operation)
/guard for op:run = when [...]
/guard for op:cmd = when [...]
/guard for op:js = when [...]

# ✅ Valid - filtered by operation label (per-operation, from /exe)
/guard for op:network = when [...]
/guard for op:destructive = when [...]

# ❌ Invalid - no filter (would fire for everything)
/guard @tooBoard = when [...]
```

**Why filters are required:**
- Performance: Overbroad guards check every directive unnecessarily
- Clarity: Explicit filters show guard scope and intent
- Correctness: Prevents accidentally blocking valid operations

**Use cases requiring "broad" checks:**
- Rate limiting → Use `for op:network` (operation guard)
- Audit logging → Use dedicated audit hook (not guards)
- Development checks → Use dedicated dev hook

Guards are specifically for security policy and should always have well-defined scope.

### Other Ambient Context

```mlld
@ctx.labels          # Accumulated data labels from all inputs (in guards)
@ctx.sources         # Data provenance array (in guards)
@ctx.policy          # Active policy configuration
```

## Variable Context (@variable.ctx) Namespace

Every variable has a `.ctx` property providing metadata about that variable. This is the **primary way to inspect variable metadata** including security labels, taint tracking, and computed properties.

**Array Semantics:**

When accessing `.ctx` on an array of values, properties are flattened/merged:

```mlld
/var secret @a = "key1"
/var secret @b = "key2"
/var pii @c = "email"

/var @all = [@a, @b, @c]

@all.ctx.labels      # ["secret", "pii"] (flattened union)
@all.ctx.tokens      # [1234, 5678, 901] (array of token counts)

# Access specific element's metadata:
@all[0].ctx.labels   # ["secret"]
@all[0].ctx.tokens   # 1234
```

**Rule:** If you need a specific item's metadata, index first (`@array[0].ctx.*`). Otherwise, `.ctx` returns merged/flattened results.

### Security Metadata

Set during variable creation and propagated through operations:

```mlld
@myvar.ctx.labels    # Data labels array: ["secret", "pii"]
@myvar.ctx.taint     # Taint level: "networkLive", "userInput", etc.
@myvar.ctx.source    # Provenance: { path: "...", resolver: "...", operation: "..." }
```

**Example:**
```mlld
/var secret @apiKey = "abc123"
/var @message = `Key: @apiKey`

# Inspect security metadata
/show @message.ctx.labels  # ["secret"] - inherited from @apiKey
/show @apiKey.ctx.taint    # "literal" or "userInput"
```

### Lazy Computed Properties

Computed on-demand and cached:

```mlld
@myvar.ctx.tokens    # Token count (for LLM context windows)
@myvar.ctx.length    # String length or array size
@myvar.ctx.size      # Bytes/memory size
@myvar.ctx.type      # Type: "string" | "number" | "object" | "array" | "executable"
```

**Example:**
```mlld
/var @longText = @readFile("document.md")
/show @longText.ctx.tokens   # 15234 (computed lazily, then cached)

/var @data = [1, 2, 3]
/show @data.ctx.length       # 3
/show @data.ctx.type         # "array"
```

### Introspection Metadata

Static metadata about variable definition:

```mlld
@myvar.ctx.name      # Variable name: "apiKey"
@myvar.ctx.defined   # Source location where defined
@myvar.ctx.exported  # Boolean - is this exported from a module?
```

### Structured Data

For variables with structured content (already exists, integrated into .ctx):

```mlld
@myvar.ctx.text      # Text representation
@myvar.ctx.data      # Parsed data (JSON, etc.)
```

**Example:**
```mlld
/var @json = '{"name": "Alice", "age": 30}'
/show @json.ctx.data.name    # "Alice" (parsed JSON)
/show @json.ctx.text         # Original string
```

## Hook Architecture

### HookManager

Central manager for all evaluation hooks:

```typescript
// interpreter/hooks/HookManager.ts

export interface HookDecision {
  action: 'continue' | 'abort' | 'retry';
  value?: any;      // Override value
  metadata?: any;   // Attach metadata
}

export type PreHook = (
  directive: DirectiveNode,
  inputs: any,
  env: Environment
) => Promise<HookDecision>;

export type PostHook = (
  directive: DirectiveNode,
  result: any,
  inputs: any,
  env: Environment
) => Promise<any>;

export class HookManager {
  private preHooks: PreHook[] = [];
  private postHooks: PostHook[] = [];

  /**
   * Register pre-execution hook
   * Security hooks always registered first (hardcoded order)
   */
  registerPre(hook: PreHook): void {
    this.preHooks.push(hook);
  }

  /**
   * Register post-execution hook
   * Security hooks always registered first (hardcoded order)
   */
  registerPost(hook: PostHook): void {
    this.postHooks.push(hook);
  }

  /**
   * Execute pre-hook chain
   * First non-continue decision short-circuits
   */
  async executePre(
    directive: DirectiveNode,
    inputs: any,
    env: Environment
  ): Promise<HookDecision> {
    for (const hook of this.preHooks) {
      const decision = await hook(directive, inputs, env);
      if (decision.action !== 'continue') {
        return decision; // Short-circuit
      }
    }
    return { action: 'continue' };
  }

  /**
   * Execute post-hook chain
   * All hooks execute in order, each can transform result
   */
  async executePost(
    directive: DirectiveNode,
    result: any,
    inputs: any,
    env: Environment
  ): Promise<any> {
    let current = result;
    for (const hook of this.postHooks) {
      current = await hook(directive, current, inputs, env);
    }
    return current;
  }
}
```

### Input Extraction Contract

Before hook can execute, directive inputs must be extracted and evaluated:

```typescript
/**
 * Extract and evaluate inputs from a directive.
 * Returns Variables with metadata already populated.
 *
 * This function is directive-specific - each directive type
 * has its own input extraction logic that mirrors how the
 * directive would normally evaluate its operands.
 *
 * @returns Array of Variable objects (even for single-input directives)
 */
async function extractDirectiveInputs(
  directive: DirectiveNode,
  env: Environment
): Promise<Variable[]> {
  switch (directive.kind) {
    case 'show':
      // Evaluate the value to show
      const value = await evaluate(directive.values.variable, env);
      return [value];

    case 'run':
      // Evaluate command template or exec reference
      const cmd = await evaluate(directive.values.command, env);
      return [cmd];

    case 'import':
      // Path is already in AST, wrap as literal
      return [createLiteralVariable(directive.values.path)];

    case 'var':
      // Evaluate RHS expression
      const rhs = await evaluate(directive.values.value, env);
      return [rhs];

    // ... other directives
  }
}
```

**Key principles:**
- Evaluates expressions/templates to get Variable objects
- Does NOT re-evaluate if directive already evaluated (extracts from AST)
- Preserves lazy evaluation for streaming/large data
- Returns array for consistent hook interface

### Integration Point

Hook executes in `evaluateDirective()` before routing to specific evaluators:

```typescript
// interpreter/eval/directive.ts

async function evaluateDirective(
  directive: DirectiveNode,
  env: Environment,
  context?: EvaluationContext
): Promise<EvalResult> {
  const trace = extractTraceInfo(directive, env);

  env.pushDirective(trace.directive, trace.varName, directive.location);

  try {
    // 1. Extract inputs from directive
    const inputs = await extractDirectiveInputs(directive, env);

    // 2. PRE-MIDDLEWARE CHAIN
    const hookManager = env.getHookManager();
    const preDecision = await hookManager.executePre(directive, inputs, env);

    if (preDecision.action === 'abort') {
      throw new Error(preDecision.metadata?.reason || 'Operation aborted by hook');
    }

    if (preDecision.action === 'retry') {
      // Check if source is retryable (must be pipeline stage with function source)
      const retryableSource = findRetryableSource(directive, inputs, env);
      if (!retryableSource) {
        throw new GuardError(
          `Cannot retry: ${preDecision.metadata?.hint} (source not retryable)`
        );
      }

      // Delegate to pipeline retry infrastructure
      return env.retryWithHint(retryableSource, preDecision.metadata?.hint);
    }

    // Use override value if provided
    const effectiveInputs = preDecision.value ?? inputs;

    // 3. Execute directive with normal routing
    let result = await executeDirectiveByKind(directive, effectiveInputs, env, context);

    // 4. POST-MIDDLEWARE CHAIN
    result = await hookManager.executePost(directive, result, inputs, env);

    return result;
  } finally {
    env.popDirective();
  }
}
```

## Implementation Phases

### Phase 0: Hook Infrastructure (1 week)

**Objective:**
Implement core hook pattern without any specific hook yet.

**Deliverables:**
- `HookManager` class with registration and execution
- Integration in `evaluateDirective()`
- `extractDirectiveInputs()` helper to get inputs from directives
- Basic testing framework for hook
- Performance benchmarking baseline

**Acceptance criteria:**
- All existing tests pass unchanged
- No performance regression (hook overhead < 1% when no hook registered)
- Hook can be registered and executes in order
- Pre-hook can abort, retry, or override values
- Post-hook can transform results

### Phase 1: Variable .ctx Namespace (1 week)

**Objective:**
Implement `.ctx` property on all variables for metadata access.

**Deliverables:**
- Property accessor for `.ctx` on Variable types
- Initial metadata: `.labels`, `.taint`, `.source`
- Lazy computed properties: `.tokens`, `.length`, `.type`, `.size`
- Introspection properties: `.name`, `.defined`, `.exported`
- Integration with existing structured value `.text` and `.data`
- Update field access to support `.ctx.*` paths

**Acceptance criteria:**
- `@myvar.ctx.labels` returns security labels array
- `@myvar.ctx.taint` returns taint level
- `@myvar.ctx.tokens` computes token count lazily
- `.ctx` properties are read-only (immutable)
- All variable types support `.ctx` namespace
- Tests validate lazy evaluation and caching

### Phase 2: Taint Tracking as Post-Hook (1-2 weeks)

**Objective:**
Migrate taint tracking to post-hook for consistent metadata propagation.

**Deliverables:**
- Taint hook that propagates security descriptors
- Post-execution updates to `result.ctx.labels`, `result.ctx.taint`, `result.ctx.source`
- Integration with existing `TaintTracker` and `SecurityDescriptor` system
- Label merging from multiple inputs
- Taint level calculation (max taint from inputs)
- Source provenance tracking

**Hook implementation:**
```typescript
const taintHook: PostHook = async (directive, result, inputs, env) => {
  // Skip if result isn't a Variable
  if (!isVariable(result)) return result;

  // Collect labels from all inputs
  const allLabels = mergeLabels(inputs.map(i => i.ctx?.labels || []));

  // Calculate max taint level
  const maxTaint = calculateMaxTaint(inputs.map(i => i.ctx?.taint || 'unknown'));

  // Build source provenance
  const source = {
    operation: directive.kind,
    inputs: inputs.map(i => i.ctx?.source).filter(Boolean)
  };

  // Update result metadata
  result.ctx.labels = allLabels;
  result.ctx.taint = maxTaint;
  result.ctx.source = source;

  return result;
};
```

**Acceptance criteria:**
- All operations propagate labels correctly
- Taint levels merge according to taint lattice
- Source provenance tracks operation chains
- Existing security tests pass
- No performance regression

### Phase 3: @ctx Namespace Reorganization (3-5 days)

**Objective:**
Reorganize ambient `@ctx` into clear namespaces for pipeline, guard, and operation context.

**Changes:**

**Current @ctx (pipeline-focused):**
```mlld
@ctx.input
@ctx.try
@ctx.tries
@ctx.stage
@ctx.lastOutput
@ctx.isPipeline
@ctx.hint
@ctx.operation
```

**New @ctx (namespace-organized):**
```mlld
# Operation context (available everywhere)
@ctx.op.type         # "run" | "show" | "import" | ...
@ctx.op.labels       # Operation labels
@ctx.op.command      # For /run
@ctx.op.path         # For /import
@ctx.op.name         # For /exe
@ctx.op.domains      # Phase 4.1+ - extracted domains

# Pipeline context (pipelines only)
@ctx.pipe.tries      # Array of previous attempts
@ctx.pipe.try        # Current attempt number
@ctx.pipe.stage      # Stage number
@ctx.pipe.length     # Completed stages
@ctx.pipe.input      # Original input (@p[0] alias)

# Guard context (guards only)
@ctx.guard.retries   # Guard retry counter (resets per guard evaluation)
@ctx.guard.name      # Current guard name
@ctx.guard.max       # Max retry limit

# Shared/legacy (maintain compatibility)
@ctx.input           # Current input (pipeline stage or guard input)
@ctx.labels          # In guards - accumulated labels
@ctx.sources         # In guards - provenance
@ctx.hint            # In retries - hint from previous attempt
@ctx.isPipeline      # Boolean - are we in a pipeline?
```

**Deliverables:**
- Rename runtime fields to match new namespaces
- Maintain backward compatibility aliases where needed
- Update all documentation examples
- Update tests to use new namespace structure

**Acceptance criteria:**
- `@ctx.pipe.*` works in pipelines
- `@ctx.guard.*` works in guards
- `@ctx.op.*` works everywhere
- Backward compatibility maintained for transition
- All existing tests pass

### Phase 4: Guards as Pre-Hook (2-3 weeks)

**Objective:**
Implement guards as pre-hook that checks security before directive execution.

**Scope:**
See `plan-security.md` Phase 4.0 and 4.1 for detailed implementation plan.

**Key integration:**
```typescript
const guardHook: PreHook = async (directive, inputs, env) => {
  const guards = env.getGuardsForDirective(directive);
  if (guards.length === 0) {
    return { action: 'continue' };
  }

  // Create retry context for guard evaluation (reuses pipeline infrastructure)
  const retryContext = env.createRetryContext({
    operation: directive.kind,
    maxAttempts: 3
  });

  const opContext = buildOperationContext(directive, env);

  // Retry loop managed by retry context
  while (retryContext.canRetry()) {
    // Evaluate guards based on their scope
    for (const guard of guards) {
      let decision: GuardDecision;

      if (guard.scope === 'per-input') {
        // Data guard: fire individually for each labeled input
        for (const input of inputs) {
          if (!guard.matchesLabels(input.ctx.labels)) continue;

          // Populate guard context with retry state
          const guardContext = {
            input: input,  // Single Variable
            labels: input.ctx.labels,
            sources: [input.ctx.source],
            op: opContext,
            guard: {
              try: retryContext.attemptNumber,  // 1, 2, 3... from retry context
              tries: retryContext.allAttempts,   // Previous attempts
              name: guard.name,
              max: 3
            }
          };

          decision = await guard.evaluate(guardContext, env);

          if (decision.action === 'deny') {
            return { action: 'abort', metadata: { reason: decision.reason } };
          }

          if (decision.action === 'retry') {
            // Check source is retryable before incrementing
            if (!isInputRetryable(input, env)) {
              return {
                action: 'abort',
                metadata: { reason: `Cannot retry: ${decision.hint} (source not retryable)` }
              };
            }

            // Increment retry context and loop again
            retryContext.recordRetry(decision.hint);
            break; // Exit guard loop, re-evaluate inputs, try again
          }
        }

        // If we got a retry decision, break to outer loop
        if (decision?.action === 'retry') break;

      } else if (guard.scope === 'per-operation') {
        // Operation guard: fire once with all inputs as array
        const guardContext = {
          input: inputs,  // Array of Variables
          labels: collectAllLabels(inputs),
          sources: inputs.map(i => i.ctx.source),
          op: opContext,
          guard: {
            try: retryContext.attemptNumber,
            tries: retryContext.allAttempts,
            name: guard.name,
            max: 3
          }
        };

        decision = await guard.evaluate(guardContext, env);

        if (decision.action !== 'allow') {
          // Handle retry similar to per-input
          if (decision.action === 'retry') {
            retryContext.recordRetry(decision.hint);
            break;
          }
          return mapGuardDecision(decision);
        }
      }
    }

    // If no retry requested, all guards allowed - exit loop
    if (decision?.action !== 'retry') {
      break;
    }

    // Re-evaluate inputs for next attempt
    inputs = await extractDirectiveInputs(directive, env);
  }

  return { action: 'continue' };
};

function mapGuardDecision(guardDecision: GuardDecision): HookDecision {
  switch (guardDecision.action) {
    case 'allow':
      return { action: 'continue', value: guardDecision.value };
    case 'deny':
      return { action: 'abort', metadata: { reason: guardDecision.reason } };
    case 'retry':
      return { action: 'retry', metadata: { hint: guardDecision.hint } };
  }
}
```
```

**Deliverables:**
- Guard hook implementation
- Guard registration and lookup system
- `/guard` directive parsing and evaluation
- Guard helper functions (@opIs, @opHas, @inputHas)
- `@ctx.guard.*` population
- Integration tests

## Context Namespace Design Principles

### 1. Ambient @ctx is Scoped

Different namespaces are available in different contexts:

| Namespace | Available In |
|-----------|-------------|
| `@ctx.op.*` | Everywhere |
| `@ctx.pipe.*` | Pipelines only |
| `@ctx.guard.*` | Guards only |
| `@ctx.input` | Pipelines and guards |
| `@ctx.labels` | Guards only |

### 2. Variable .ctx is Always Available

`@myvar.ctx.*` works anywhere you have a variable reference:

```mlld
/var secret @key = "abc"

# In templates
`This key has labels: @key.ctx.labels`

# In conditions
@when @key.ctx.labels.includes("secret") [
  # Handle secret
]

# In guards
/guard for pii = when [
  @input.ctx.labels.includes("secret") => deny "Mixed PII and secret"
  * => allow
]
```

### 3. .ctx Managed by Runtime

Users cannot modify `.ctx` properties. The runtime updates metadata as values flow through operations.

```mlld
/var secret @key = "abc"
@key.ctx.labels = ["public"]  # ERROR - cannot modify .ctx properties
```

**Internal Updates:**

The runtime updates `.ctx` metadata as needed:
```typescript
// Post-hook updates metadata
result.ctx.labels = mergeLabels(inputs);
result.ctx.taint = maxTaint(inputs);
result.ctx.source = buildSource(directive);

// Lazy properties compute on first access
get tokens() {
  return this._tokensCache ??= countTokens(this.value);
}
```

Labels propagate through operations via hook/runtime, not through user assignment.

## Hook Execution Flow

```
User Script
    ↓
Parser → AST
    ↓
evaluate(AST, env)
    ↓
evaluateDirective(directive, env)
    ↓
1. Extract inputs
    ↓
2. PRE-MIDDLEWARE CHAIN
   - Guards check security
   - Caching checks for cached results
   - Profiling starts timer
    ↓
3. Execute Directive (if allowed)
    ↓
4. POST-MIDDLEWARE CHAIN
   - Taint tracking propagates metadata
   - Audit logging records result
   - Profiling stops timer
    ↓
5. Return result
```

## Built-in Hook (Future Phases)

### Audit Logging Hook

```typescript
const auditHook = {
  pre: async (directive, inputs, env) => {
    if (requiresAudit(directive, inputs)) {
      env.auditLog.recordOperation({
        directive: directive.kind,
        labels: collectLabels(inputs),
        timestamp: Date.now()
      });
    }
    return { action: 'continue' };
  },

  post: async (directive, result, inputs, env) => {
    if (requiresAudit(directive, inputs)) {
      env.auditLog.recordResult({
        directive: directive.kind,
        result: sanitizeForAudit(result)
      });
    }
    return result;
  }
};
```

### Profiling Hook

```typescript
const profilingHook = {
  pre: async (directive, inputs, env) => {
    env.profiler.start(directive.kind);
    return { action: 'continue' };
  },

  post: async (directive, result, inputs, env) => {
    env.profiler.stop(directive.kind);
    return result;
  }
};
```

### Caching Hook

```typescript
const cachingHook = {
  pre: async (directive, inputs, env) => {
    // Pre-hook doesn't serve cached values (would bypass guards)
    // Just log cache lookup for metrics
    if (directive.kind === 'import') {
      env.metrics.recordCacheLookup(directive);
    }
    return { action: 'continue' };
  },

  post: async (directive, result, inputs, env) => {
    // Cache results AFTER guards checked and execution succeeded
    if (directive.kind === 'import') {
      const cacheKey = computeCacheKey(directive, inputs);
      env.cache.set(cacheKey, result);
    }
    return result;
  }
};

// Note: Cache retrieval happens in directive evaluators, not hook,
// to ensure guards always see uncached values
```
```

## Examples

### Security Guard with Variable .ctx

```mlld
/guard @checkComplexity for secret = when [
  # Access input metadata
  @input.ctx.tokens > 10000 => deny "Secret too large for safe handling"

  # Check operation
  @ctx.op.type == "output" => deny "Cannot output secrets"

  # Check for mixed labels
  @input.ctx.labels.includes("pii") => deny "Cannot mix secret and PII"

  * => allow
]

/var secret @apiKey = "sk-..."
/show @apiKey  # Guard fires, checks @apiKey.ctx metadata
```

### Guard with Retry and Context

```mlld
/guard for llmjson = when first [
  @isValidJson(@input) => allow

  # Check we haven't retried too many times
  @ctx.guard.retries < @ctx.guard.max => retry "Invalid JSON from LLM"

  # Give up
  * => deny "Invalid JSON after @ctx.guard.max attempts"
]

/var llmjson @response = @claude("Generate user data") | @process
/show @response  # Guard can retry @claude if invalid
```

### Inspecting Variable Context

```mlld
# Create variable with labels
/var secret,pii @userData = @fetchFromDB()

# Inspect its metadata
/show `User data has labels: @userData.ctx.labels`
# Output: User data has labels: ["secret", "pii"]

/show `Taint level: @userData.ctx.taint`
# Output: Taint level: networkCached

/show `Token count: @userData.ctx.tokens`
# Output: Token count: 1523

# Use in conditionals
@when @userData.ctx.tokens > 1000 [
  /show "Warning: Large user data payload"
]

# Use in guards
/guard for secret = when [
  @input.ctx.tokens > 5000 => deny "Secret payload too large"
  * => allow
]
```

## Non-Goals

### What Hook Does NOT Cover

Hook applies **only to directives**, not to:

1. **Variable resolution** - Too fine-grained, performance-critical
2. **Template interpolation** - Happens too frequently
3. **Expression evaluation** - Not operations, just computations
4. **Text/comment nodes** - Not executable operations
5. **Pipeline stages** - Already has unified processor

These use existing patterns (Variable metadata, direct evaluation, etc).

## Performance Considerations

### Optimization: Skip When Disabled

```typescript
async executePre(directive, inputs, env) {
  // Early exit if no hook registered
  if (this.preHooks.length === 0) {
    return { action: 'continue' };
  }

  // Execute chain
  for (const mw of this.preHooks) {
    const decision = await mw(directive, inputs, env);
    if (decision.action !== 'continue') {
      return decision;
    }
  }
  return { action: 'continue' };
}
```

### Optimization: Lazy Input Extraction

Only extract inputs if hook actually needs them:

```typescript
async executePre(directive, inputs, env) {
  if (this.preHooks.length === 0) {
    return { action: 'continue' };
  }

  // Inputs already extracted by caller
  for (const mw of this.preHooks) {
    // Hook receives pre-extracted inputs
    const decision = await mw(directive, inputs, env);
    if (decision.action !== 'continue') {
      return decision;
    }
  }
  return { action: 'continue' };
}
```

## Testing Strategy

### Unit Tests

Test hook in isolation:

```typescript
describe('HookManager', () => {
  it('executes pre-hook in order', async () => {
    const manager = new HookManager();
    const calls: number[] = [];

    manager.registerPre(async () => { calls.push(1); return { action: 'continue' }; });
    manager.registerPre(async () => { calls.push(2); return { action: 'continue' }; });

    await manager.executePre(mockDirective, mockInputs, mockEnv);
    expect(calls).toEqual([1, 2]);
  });

  it('short-circuits on abort', async () => {
    const manager = new HookManager();

    manager.registerPre(async () => ({ action: 'abort', metadata: { reason: 'test' } }));
    manager.registerPre(async () => { throw new Error('Should not execute'); });

    const result = await manager.executePre(mockDirective, mockInputs, mockEnv);
    expect(result.action).toBe('abort');
  });
});
```

### Integration Tests

Test hook with actual directives:

```typescript
describe('Guard Hook Integration', () => {
  it('blocks secret data in /run directives', async () => {
    const env = new Environment();

    // Register guard hook
    env.getHookManager().registerPre(guardHook);

    // Evaluate script
    const script = '/var secret @key = "abc"\n/run {echo @key}';

    await expect(evaluate(script, env)).rejects.toThrow('No secrets in shell');
  });
});
```

## Migration Path

### Backward Compatibility

Maintain compatibility during transition:

1. **@ctx aliases**: Keep old names working during deprecation period
   ```mlld
   @ctx.try        # Alias to @ctx.pipe.try (deprecated)
   @ctx.tries      # Alias to @ctx.pipe.tries (deprecated)
   @ctx.operation  # Alias to @ctx.op (deprecated)
   ```

2. **Variable metadata**: `.ctx` is additive, existing code continues working

3. **Hook infrastructure**: Always present, security hook always registered

### Gradual Rollout

1. **Phase 0**: Infrastructure only, no behavioral changes
2. **Phase 1**: Variable .ctx available but optional to use
3. **Phase 2**: Taint tracking migrates, existing system deprecated
4. **Phase 3**: @ctx namespaces land with backward compat
5. **Phase 4**: Guards use new namespaces exclusively
6. **Future**: Remove deprecated aliases

## Design Rationale

### Why Hook?

**Cross-cutting concerns need consistent application:**
- Security checks must apply to ALL directives uniformly
- Taint propagation must never be forgotten
- Audit logging should capture everything

**Manual calls in each evaluator risk:**
- Forgetting to call in some directives
- Inconsistent implementation
- Fragile as new directives added

**Hook ensures:**
- ✅ Centralized logic
- ✅ Consistent application
- ✅ Composable concerns (guards + logging + profiling)
- ✅ Testable in isolation

### Why @ctx Namespaces?

**Avoids collisions and confusion:**
- `@ctx.pipe.tries` is clearly pipeline-related
- `@ctx.guard.retries` is clearly guard-related
- `@ctx.op.type` is clearly about the operation

**Enables context-specific features:**
- Pipeline context only available in pipelines
- Guard context only available in guards
- Operation context available everywhere

### Why Variable .ctx?

**Makes metadata introspectable:**
- Users can inspect security labels of any variable
- Guards can check input metadata explicitly
- Debugging becomes easier

**Consistent namespace:**
- All metadata under `.ctx.*` umbrella
- Familiar pattern (matches ambient `@ctx`)
- Extensible for future metadata types

## Configuration

Hook behavior can be controlled via configuration:

```json
{
  "security": {
    "guards": {
      "enabled": true,
      "maxRetries": 3
    },
    "taint": {
      "enabled": true,
      "strict": false
    }
  },
  "debug": {
    "profiling": false,
    "audit": {
      "enabled": false,
      "logPath": "./audit.log"
    }
  }
}
```

**Note:** Security hook (guards, taint tracking) is always active when enabled. Optional development hook (profiling, detailed audit logging) can be toggled via config. Hook is interpreter infrastructure, not userland code - users don't register or unregister hook.

## Summary

The hook pattern provides a clean, composable way to implement cross-cutting concerns in mlld while maintaining the interpreter's direct evaluation model. By limiting hook to directive boundaries and organizing context into clear namespaces, we gain the benefits of abstraction without sacrificing performance or debuggability.

The phased approach allows incremental adoption:
1. Infrastructure without behavioral changes
2. Variable .ctx for metadata access
3. Taint tracking migration
4. Guards implementation

Each phase delivers value independently while building toward a comprehensive security and observability system.
