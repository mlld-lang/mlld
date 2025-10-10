---
updated: 2025-10-08
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
- Metadata (filenames, retries, loader info) flows via `.metadata`
- String coercion is safe and predictable: `toString()` returns `.text`

## Details

### StructuredValue Contract

```typescript
interface StructuredValue<T = unknown> {
  type: 'text' | 'json' | 'array' | 'object' | 'csv' | 'xml' | (string & {});
  text: string;           // canonical string representation
  data: T;                // structured view (parsed)
  metadata?: {
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
asText(value)  // Returns wrapper.text or String(value)
asData(value)  // Returns wrapper.data or value
wrapStructured(value, type, text?, metadata?)  // Creates wrapper
```

### Where Values Flow

**Pipelines**
- `PipelineExecutor` wraps all stage outputs in `StructuredValue`
- `structuredOutputs` map tracks wrappers; `previousOutputs` stores `.text`
- `@pipeline`/`@p` exposes wrappers to subsequent stages
- Parallel stages aggregate structured arrays (`.data` is array, `.text` is JSON)
- Regression coverage (#435) ensures pipelines hand structured data between stages without manual `JSON.parse`

**Variables**
- All variable assignments store `StructuredValue` wrappers
- Field access (`.foo`, `.bar`) operates on `.data`
- AutoUnwrapManager preserves metadata through JS/Node transformations

**Content Loaders**
- `/load-content` returns wrappers with parsed `.data` and original text
- Loader metadata (filenames, URLs) preserved in `.metadata.loadResult`
- Transformers (`@json`, `@yaml`) forward native arrays/objects in `.data`
  - `@json` uses JSON5 for relaxed parsing (single quotes, trailing commas, comments) and exposes `@json.loose`/`@json.strict` variants for explicit control.

**Display**
- Templates interpolate using `asText()` automatically
- `/show` pretty-prints structured values while preserving `.text`
- CLI/API output emits `.text` by default

**JavaScript Stages**
- Shadow parameter preparation unwraps wrappers to native values
- `__mlldPrimitiveMetadata` records wrapper info for AutoUnwrapManager
- Results from JS code preserve `StructuredValue` when returned

## Gotchas

- NEVER call builtin array methods (`.includes`, `.join`, `.length`) directly on wrappers—use `asData()` first
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
