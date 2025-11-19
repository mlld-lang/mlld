---
updated: 2025-01-12
tags: #arch, #transformers, #pipeline
related-docs: docs/dev/PIPELINE.md, docs/dev/DATA.md
related-code: interpreter/builtin/transformers.ts, interpreter/eval/exec-invocation.ts
related-types: core/types { TransformerDefinition, TransformerVariant }
---

# Transformers

## tldr

Built-in transformers (@json, @xml, @csv, @md) convert data between formats in pipelines. Defined in `interpreter/builtin/transformers.ts`, registered as system variables with special `isBuiltinTransformer` metadata.

## Principles

- Return transformed data or throw descriptive errors
- Support variants via `.field` syntax (@json.loose, @json.strict, @json.llm)
- False return values signal extraction failure (composable with guards)
- Transformers are pure functions (no side effects)

## Details

### Registration

Built-in transformers live in `interpreter/builtin/transformers.ts`:

```typescript
export const builtinTransformers: TransformerDefinition[] = [
  {
    name: 'json',
    uppercase: 'JSON',
    description: '...',
    implementation: makeJsonTransformer('loose'),
    variants: [
      { field: 'loose', description: '...', implementation: ... },
      { field: 'strict', description: '...', implementation: ... },
      { field: 'llm', description: '...', implementation: ... }
    ]
  }
];
```

### Execution

Transformers execute at `exec-invocation.ts:534`:
1. Check `variable.metadata?.isBuiltinTransformer`
2. Call `transformerImplementation` function directly
3. Normalize result via `normalizeTransformerResult`
4. Wrap in structured value for pipeline continuity

- Transformer outputs always flow back into the pipeline as `StructuredValue` wrappers. `normalizeTransformerResult()` feeds the value into `wrapExecResult()`, so `@pipeline[n]` and downstream stages never handle raw primitives. Iterators provide plain arrays/objects to transformers (after `normalizeIterableValue` runs), but as soon as a transformer finishes, the interpreter restores the wrapper and provenance metadata before storing the stage output.

### LLM Extraction Transformer

`@json.llm` extracts JSON from LLM responses:
- Returns parsed data on success
- Returns `false` on extraction failure (not an error)
- Enables conditional logic and guard composition

**Design rationale**: False signals enable composability with validation/retry logic without exceptions. Guards (future) will check `@json.llm(@input) != false`.

**Extraction strategies**:
1. JSON in ```json code fences
2. JSON in generic ``` code fences
3. JSON object/array embedded in prose
4. Return `false` if none found

**Implementation**: Uses regex patterns to extract candidates, then validates with `looksLikeJson()` heuristic before parsing with JSON5 for relaxed syntax support.

## Gotchas

- Transformer implementations must be sync or async functions
- Variants share the same uppercase name (JSON_LOOSE, JSON_STRICT both → JSON)
- False is a valid return value (not treated as error)
- Transformers receive string input, not structured values
- Multiple JSON blocks: extracts first match only
