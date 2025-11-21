---
updated: 2025-11-13
tags: #arch, #data, #pipeline
related-docs: docs/dev/PIPELINE.md, docs/dev/ALLIGATOR.md, docs/dev/INTERPRETER.md
related-code: interpreter/utils/structured-value.ts, interpreter/eval/pipeline/*.ts
related-types: core/types { StructuredValue, PipelineInput }
---

# Data Handling

## tldr

mlld treats structured data (arrays, objects, JSON) as first-class values via `StructuredValue` wrappers. All pipeline stages, variables, and content loaders preserve both `.text` (string view) and `.data` (parsed structure). Templates and display automatically stringify; computations access native values.

## Principles

- Structured values flow end-to-end through pipelines, contexts, and variables
- Display boundaries (templates, CLI, `/show`) coerce to `.text` automatically
- Computation boundaries (foreach, JS stages, comparisons) access `.data`
- Runtime metadata (filenames, retries, loader info) flows via `.ctx`
- String coercion is safe and predictable: `toString()` returns `.text`
- JSON/JSONL auto-parse: `<path>.json` and `<path>.jsonl` load as StructuredValues with parsed `.data` (object/array), raw `.text`, and preserved `.ctx`. Set `MLLD_LOAD_JSON_RAW=1` to keep raw text.
- Structured access helper: `keepStructured()` and `.keepStructured` let you retain wrappers/metadata when you need ctx/provenance instead of the content-only sugar.

## Details

### StructuredValue Contract

```typescript
interface StructuredValue<T = unknown> {
  type: 'text' | 'json' | 'array' | 'object' | 'csv' | 'xml' | (string & {});
  text: string;           // canonical string representation
  data: T;                // structured view (parsed)
  ctx: {                  // user-facing runtime context (mirrors Variable.ctx)
    labels: DataLabel[];
    taint: TaintLevel;
    sources: string[];
    policy: PolicyContext | null;
    filename?: string;
    relative?: string;
    absolute?: string;
    url?: string;
    domain?: string;
    title?: string;
    description?: string;
    source?: string;
    retries?: number;
    tokens?: number;
    tokest?: number;
    fm?: Record<string, unknown> | undefined;
    json?: unknown;
    length?: number;
    type: StructuredValueType;
  };
  internal?: {            // implementation surface (transforms, helpers, capture info)
    [key: string]: unknown;
  };
  metadata?: {            // legacy snapshot (read-only; slated for removal)
    source?: string;
    retries?: number;
    loadResult?: LoadContentResult;
    [key: string]: unknown;
  };
  toString(): string;     // returns text
  valueOf(): string;
  [Symbol.toPrimitive](hint?: string): string;
}
```

### Helper Functions

Use these throughout the codebase:

```typescript
asText(value)                                  // Returns wrapper.text or String(value)
asData(value)                                  // Returns wrapper.data or value
wrapStructured(value, type, text?, metadata?)  // Creates wrapper
ensureStructuredValue(value, type?, text?)     // Normalizes unknown input to a StructuredValue

// Security metadata
extractSecurityDescriptor(value, options?)     // Pull security metadata off Values or Variables
collectParameterDescriptors(params, env)       // Gather parameter-level descriptors from Environment
collectAndMergeParameterDescriptors(params, env) // Merge descriptors via env.mergeSecurityDescriptors

// JSON detection
looksLikeJsonString(text)                      // Cheap heuristic before attempting JSON.parse
parseAndWrapJson(text, options?)               // Parse JSON and wrap, or return original text when not JSON

// Development validation
assertStructuredValue(value, context?)         // Throw when boundary requires StructuredValue and none provided
```

### Where Values Flow

**Pipelines**
- `PipelineExecutor` wraps all stage outputs in `StructuredValue`
- `structuredOutputs` map tracks wrappers; `previousOutputs` stores `.text`
- `@pipeline`/`@p` exposes wrappers to subsequent stages
- Parallel stages aggregate structured arrays (`.data` is array, `.text` is JSON)
- Batch pipelines on `for`/`foreach` create synthetic array variables (`for-batch-input`, `foreach-batch-input`) so `processPipeline()` receives structured arrays; results may be scalars, arrays, or objects and are normalized using the standard variable factories.
- Stage environments set `@input` to a structured wrapper; JS/Node auto-binding sees `StructuredValue.data`, so helpers no longer need to call `JSON.parse` (unless they explicitly want raw strings via `.text`).
- Both condensed (`=> |`) and parallel (`=> ||`) batch pipelines pass native arrays/objects into their stages, including parallel branches that run concurrently.
- Regression coverage (#435) ensures pipelines hand structured data between stages without manual `JSON.parse`

**Variables**
- All variable assignments store `StructuredValue` wrappers
- Field access (`.foo`, `.bar`) operates on `.data`
- AutoUnwrapManager preserves metadata through JS/Node transformations

**Iterators**
- `/for` and `foreach` normalize collection inputs via `normalizeIterableValue` (`interpreter/eval/for-utils.ts`) so loop bodies, `/for` expression arrays, foreach tuples, and batch inputs expose plain JavaScript arrays/objects. The helper unwraps StructuredValues and Variable wrappers but immediately tags the normalized values with `ExpressionProvenance`, allowing guard hooks and ArrayHelpers to materialize Variables later without leaking wrappers into user code.
- Iterator outputs feed pipelines through `createArrayVariable('for-batch-input', …)`; the variable stores the normalized array value, and provenance metadata flows through the WeakMap so guard filters and `.ctx.labels` stay accurate even though the outward-facing data is plain.

**Content Loaders**
- `/load-content` returns wrappers with parsed `.data` and original text
- Loader metadata (filenames, URLs) lands directly in `.ctx` (flattened from `LoadContentResult`)
- Transformers (`@json`, `@yaml`) forward native arrays/objects in `.data`
  - `@json` uses JSON5 for relaxed parsing (single quotes, trailing commas, comments) and exposes `@json.loose`/`@json.strict` variants for explicit control.

**Display**
- Templates interpolate using `asText()` automatically
- `/show` pretty-prints structured values while preserving `.text`
- CLI/API output emits `.text` by default

**Guards & Provenance**
- `ExpressionProvenance` tags every evaluator result (helpers, templates, iterators, pipelines, JS/Node stages) so the registry always knows which Variable produced the primitive that user code sees.
- Guard extraction surfaces (`materializeGuardInputs`, `materializeDisplayValue`, directive replay helpers) call `materializeExpressionValue()` before invoking guard hooks, ensuring `/show`, `/run`, `/output`, `/append`, pipeline stages, and iterator bodies provide real Variables with `.ctx.labels` and `.ctx.tokens` even when the script only manipulates strings or arrays.
- `/run sh` heredocs, denied-handler replays, and manual retry loops reuse the same provenance handles because directive replay never mutates env state; guard hooks therefore observe consistent metadata whether they block raw heredoc payloads or allow sanitized retries.

**JavaScript Stages**
- Shadow parameter preparation unwraps wrappers to native values
- `__mlldPrimitiveMetadata` records wrapper info for AutoUnwrapManager
- Results from JS code preserve `StructuredValue` when returned

## Implementation Patterns

### When to Unwrap

**Use `asData()` at computation boundaries:**
- JavaScript function arguments
- Array/object operations (`.includes`, `.join`, `.length`)
- Equality comparisons
- `foreach` iteration

**Use `asText()` at display boundaries:**
- Template interpolation
- Shell command arguments
- CLI/API output
- Log messages
- Heredoc byte counts
- Arrays of StructuredValues (pipeline batches, foreach results) must convert nested wrappers before formatting:

```typescript
array.data.map(item => (isStructuredValue(item) ? asText(item) : item));
// Example: interpreter/eval/show.ts:630
```

### Context Snapshots (`.ctx`) and `.internal`

- `StructuredValue.ctx` is a real property populated when the wrapper is created (see `interpreter/utils/structured-value.ts`). The snapshot includes security labels, taint level, policy context, provenance (filename, relative, absolute, url, domain, title, description), execution metadata (`source`, `retries`), metrics (`tokens`, `tokest`, `length`), plus helper fields such as `fm` and `json`. Consumers mutate `.ctx` directly when they need to update provenance or retry counts.
- `StructuredValue.internal` holds mlld-specific details (custom serialization hooks, transformer information, lazy loaders). Treat it as implementation detail; surface only what the interpreter needs.
- `Variable.ctx` comes from `VariableMetadataUtils.attachContext()` (`core/types/variable/VariableMetadata.ts`). The snapshot includes `name`, `type`, `definedAt`, security labels, taint, token metrics, array size, export status, sources, and policy context. Use `.ctx` instead of manually reading `variable.metadata` to avoid cache invalidation bugs.

### Stage Boundary Rules

- **Unwrap at stage boundaries only** - Stages work with plain JS values; use `asData()`/`asText()` right before execution
- **Preserve metadata** - Don't strip `.ctx` or convert wrappers to raw JSON unless at display boundary
- **Avoid deep unwrap helpers** - Call helpers at appropriate boundaries, not recursively through nested objects

### Common Fix Patterns

**Problem**: Function receives string instead of array
**Fix**: Use `asData()` where value enters JS execution context

**Problem**: Metadata lost through transformations
**Fix**: Unwrap at stage boundaries only; preserve wrappers in storage/variables

**Problem**: Nested wrappers cause issues
**Fix**: Normalize exec arguments with `asText()` before template composition

**Problem**: When-expression returns wrapped value to pipeline
**Fix**: Convert StructuredValue results to primitives before tail modifiers

## Gotchas

- NEVER call builtin array methods directly on wrappers—use `asData()` first
- Templates ALWAYS stringify—use `asText()` for interpolation, not `.data`
- Equality checks unwrap via `asData()` before comparison
- When-expression actions should convert StructuredValue results to primitives before tail modifiers
- Shell commands need `asText()` for heredoc byte counts

## Debugging

**Key Files**
- Entry: `interpreter/utils/structured-value.ts`
- Pipeline: `interpreter/eval/pipeline/executor.ts`, `unified-processor.ts`
- Loaders: `interpreter/eval/content-loader.ts`
- Auto-unwrap: `interpreter/env/auto-unwrap-manager.ts`

**Debug Flag**
- Set `MLLD_DEBUG_STRUCTURED=true` to log wrapper flow through executor/auto-unwrap

**Common Issues**
- Missing `.text` in output → check display boundaries use `asText()`
- Lost metadata → verify wrappers not unwrapped too early (use helpers at stage boundaries only)
- `"[object Object]"` in logs → apply `asText()` before string concatenation
- Nested wrappers → normalize exec arguments with `asText()` before template composition
