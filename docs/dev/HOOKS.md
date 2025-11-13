---
updated: 2025-11-13
tags: #arch, #hooks, #security
related-docs: docs/dev/DATA.md, docs/dev/INTERPRETER.md
related-code: interpreter/hooks/*.ts, interpreter/eval/directive.ts, interpreter/eval/directive-inputs.ts
related-types: HookManager { PreHook, PostHook, HookDecision, HookInputHelpers }, ContextManager { OperationContext }
---

# Evaluation Hooks

## tldr

mlld's hook system enables pre-execution and post-execution extensions at directive boundaries. Pre-hooks inspect inputs and can abort operations (guard insertion point). Post-hooks transform results and propagate metadata (taint tracking). Hooks receive extracted inputs, operation context, and optional input helpers for analysis.

## Principles

- Hooks execute at directive boundaries (before/after each directive evaluation)
- Pre-hooks run in registration order, first non-continue action stops chain
- Post-hooks run in registration order, transform results sequentially
- Hooks receive extracted inputs (any type), operation context, and optional helpers
- Non-reentrant per directive invocation (prevent infinite loops)

## Details

### Hook Types

**PreHook** - Executes before directive evaluation
```typescript
type PreHook = (
  directive: DirectiveNode,
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

**PostHook** - Executes after directive evaluation
```typescript
type PostHook = (
  directive: DirectiveNode,
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
  ctx: {
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
```

### Key Components

**HookManager** (`interpreter/hooks/HookManager.ts`)
- Registers pre-hooks and post-hooks
- Executes hooks in registration order
- Builds HookInputHelpers when inputs are all Variables
- Returns first non-continue decision for pre-hooks

**ContextManager** (`interpreter/env/ContextManager.ts`)
- Manages @ctx namespace state (@ctx.op, @ctx.pipe, @ctx.guard)
- Push/pop context stacks for nested operations
- Builds ambient @ctx object with security and pipeline state

**extractDirectiveInputs** (`interpreter/eval/directive-inputs.ts`)
- Extracts inputs from directives (Variables or other values)
- Directive-specific extraction (show, output, append, run, var)
- Returns empty array for unsupported directives

### Integration Point

**directive.ts** - Main integration in `evaluateDirective()`:
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

### Built-in Hooks

**taint-post-hook** (`interpreter/hooks/taint-post-hook.ts`)
- Registered automatically in Environment.registerBuiltinHooks()
- Collects security descriptors from inputs and result values
- Merges descriptors and records in environment
- Traverses nested objects/arrays to find all descriptors

**guardPreHookStub** (`interpreter/hooks/stubs.ts`)
- Placeholder pre-hook that always returns continue
- Registered automatically in Environment.registerBuiltinHooks()
- Will be replaced with real guard evaluation in Phase 4.0

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
1. evaluateDirective() called
2. Build operation context (buildOperationContext)
3. Extract inputs (extractDirectiveInputs or prepareVarAssignment)
4. → Run pre-hooks (HookManager.runPre)
5.   ├─ guardPreHookStub (currently just returns continue)
6.   └─ First non-continue → abort or retry
7. → Evaluate directive (directive-specific evaluator)
8. → Run post-hooks (HookManager.runPost)
9.   └─ taint-post-hook collects and merges security descriptors
10. Return result (potentially transformed by post-hooks)
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

- Hooks are non-reentrant - if a hook triggers directive evaluation, hooks don't re-run for nested directive
- Pre-hook first non-continue action stops chain (abort or retry)
- Post-hooks ALL run sequentially - each can transform the result
- Inputs can be any type (not just Variables) - check with isVariable()
- Operation context is optional in hook signatures - may be undefined
- HookInputHelpers only provided when ALL inputs are Variables

## Debugging

**Key files**:
- Entry: `interpreter/hooks/HookManager.ts`
- Integration: `interpreter/eval/directive.ts:116-152`
- Taint: `interpreter/hooks/taint-post-hook.ts`
- Context: `interpreter/env/ContextManager.ts`
- Input extraction: `interpreter/eval/directive-inputs.ts`
- Helpers: `interpreter/hooks/input-array-helper.ts`

**Debug approach**:
- Add logging in HookManager.runPre/runPost to trace hook execution
- Check extractDirectiveInputs output to verify correct extraction
- Inspect OperationContext built by buildOperationContext()
- Verify hook registration in Environment.registerBuiltinHooks()
- Check if HookInputHelpers built (when all inputs are Variables)
