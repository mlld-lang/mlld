---
updated: 2026-04-18
tags: #arch, #data, #pipeline
related-docs: docs/dev/PIPELINE.md, docs/dev/INTERPRETER.md
related-code: grammar/patterns/file-reference.peggy, grammar/deps/grammar-core.ts, interpreter/utils/structured-value.ts, interpreter/utils/load-content-structured.ts, interpreter/eval/content-loader/finalization-adapter.ts, interpreter/eval/auto-unwrap-manager.ts, interpreter/shelf/runtime.ts, interpreter/eval/import/variable-importer/ModuleExportSerializer.ts, interpreter/utils/boundary.ts, interpreter/eval/pipeline/*.ts
related-types: core/types { StructuredValue, PipelineInput, ShelfSlotRefValue }
---

# Data Handling

## tldr

mlld treats structured data (arrays, objects, JSON) as first-class values via `StructuredValue` wrappers. Most pipeline stages, variables, and content loaders preserve both `.text` (string view) and `.data` (parsed structure). Templates and display automatically stringify; computations access native values. Some runtime values are capabilities or references rather than pure data, such as shelf slot refs, but they still project through the same `asText()` / `asData()` helpers.
mlld-to-mlld boundaries are named explicitly: `boundary.field` preserves wrappers during reads, `boundary.identity` preserves identity-bearing values such as tool collections and shelf refs, `boundary.display` renders output text, `boundary.interpolate` handles template/shell string boundaries, `boundary.config` materializes env-aware config inputs, `boundary.plainData` is the explicit recursive unwrap/materialization boundary, and `boundary.serialize` is the module export/import helper.
Values travel in four carrier layers (StructuredValue, Variable, ExpressionProvenance, capability/reference values) that are not interchangeable; identifying which carrier reached the failing consumer is the first step in every boundary bug. The Cross-Boundary Survivability matrix below is the primary debugging reference.
Angle-bracket content loading (`<...>`, alligator syntax) is part of this same data model.

## Principles

- **Structured data at runtime is StructuredValue**: Primitives, strings, arrays, objects, and loaded content flow as StructuredValues with `.text`, `.data`, and `.mx`
- **Capability/reference values also exist**: Runtime may also carry first-class non-StructuredValue references such as `ShelfSlotRefValue`; these preserve identity/capability semantics while projecting through `asText()` / `asData()`
- **Grammar returns AST nodes**: Parser always produces AST Literal nodes for primitives: `{type: 'Literal', value: 42}`. The interpreter wraps in StructuredValue during evaluation.
- **Variables wrap runtime values**: Variables provide an additional metadata/context layer on top of StructuredValues and capability/reference values
- **Dual representation is universal**: Even primitives benefit from `.text` (for display) and `.data` (for computation)
- **Field access preserves wrappers**: Read nested values through field access when labels, factsources, record projection metadata, or tool/shelf identity must survive
- **Object spread materializes**: `{ ...value }` is a plain-data boundary. It produces a fresh plain object and drops nested wrapper metadata/identity
- Display boundaries (templates, CLI, `/show`) use `.text` automatically
- Computation boundaries (foreach, JS stages, comparisons) access `.data`
- Runtime metadata (filenames, retries, loader info, security labels) flows via `.mx`
- Command and shell execution outputs are StructuredValues: `.text` keeps raw stdout, `.data` auto-parses JSON when possible, and `.mx` includes execution context (`source`, `command`, `exitCode`, `duration`)
- String coercion is safe and predictable: `toString()` returns `.text`
- JSON/JSONL auto-parse: `<path>.json` and `<path>.jsonl` load as StructuredValues with parsed `.data` (object/array), raw `.text`, and preserved `.mx`; `.text` is the raw string if callers need it.
- JS/Node invocations receive `.data` by default (text → string, JSON/JSONL → object/array, primitives → number/boolean). Use `.keep`/`.keepStructured` when metadata needs to cross the boundary.
- Structured access helper: `keepStructured()` and `.keepStructured` let you retain wrappers/metadata when you need mx/provenance instead of the content-only sugar.

## Details

### StructuredValue Contract

```typescript
interface StructuredValue<T = unknown> {
  type: 'text' | 'array' | 'object' | 'csv' | 'xml' | 'html' | (string & {});
  text: string;           // canonical string representation
  data: T;                // structured view (parsed)
  mx: {                  // user-facing runtime context (mirrors Variable.mx)
    text: string;        // wrapper text view accessor
    data: T;             // wrapper data view accessor
    labels: DataLabel[];
    taint: DataLabel[];
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
    command?: string;
    exitCode?: number;
    duration?: number;
    stderr?: string;
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

### Universal StructuredValue Model

**Structured data at runtime is StructuredValue** - primitives, strings, arrays, objects, loaded content:

```typescript
// Number from when-expression
{type: 'number', text: '42', data: 42, mx: {labels: [...], ...}}

// String from template
{type: 'text', text: 'hello', data: 'hello', mx: {labels: [...], ...}}

// Array from for-expression
{type: 'array', text: '[1,2,3]', data: [1,2,3], mx: {labels: [...], ...}}

// Object literal
{type: 'object', text: '{"a":1}', data: {a: 1}, mx: {labels: [...], ...}}
```

**Why primitives ARE StructuredValues:**
1. **Dual representation is useful**: `.text = "42"` for templates, `.data = 42` for comparisons
2. **Metadata consistency**: All values carry `.mx` for security labels, provenance, tokens
3. **Simpler model**: No special cases - `asData()`/`asText()` work uniformly on everything
4. **Variables wrap StructuredValues**: Consistent layering for ordinary data (AST → StructuredValue → Variable)

**Grammar → Interpreter → Variable flow:**
```typescript
// 1. Grammar produces AST Literal node
{type: 'Literal', value: 42, location: {...}}

// 2. Interpreter wraps in StructuredValue
{type: 'number', text: '42', data: 42, mx: {labels: [], ...}}

// 3. Variable wraps StructuredValue
StructuredValueVariable {
  type: 'structured',
  value: StructuredValue,
  mx: {...}  // Additional variable-level metadata
}
```

### Carriers

Runtime values travel in four carrier layers. They are **not interchangeable**. Boundary bugs almost always start with a consumer treating one carrier as another.

1. **`StructuredValue`** — `.data`, `.text`, `.mx`, `internal`. The universal wrapper for data values.
2. **`Variable`** — named binding with `mx`, `internal`, import/export metadata, and a `value` that holds a StructuredValue or a capability value. Adds provenance the StructuredValue layer cannot.
3. **`ExpressionProvenance`** — `WeakMap<object, SecurityDescriptor>` attached to plain objects so descriptors survive wrapper removal. In-memory only; does not serialize.
4. **Capability / reference values** — `ShelfSlotRefValue`, imported executable wrappers with `capturedModuleEnv`, tool collections with `isToolsCollection`/Symbol metadata, `LoadContentResult`. These carry authority or live references; flattening them to plain data erases meaning, not just shape.

When debugging, identify which carrier arrived at the failing site, then walk backward to find which boundary changed the carrier.

### Capability / Reference Values

Some runtime values are not plain data wrappers. The main current example is `ShelfSlotRefValue`, which represents access to a shelf slot while still exposing the slot's current contents for normal reads:

```typescript
ShelfSlotRefValue {
  shelfName: 'outreach',
  slotName: 'recipients',
  current: StructuredValue,
  text: current.text,
  data: current.data
}
```

Why this exists:
1. **Identity matters**: `@shelf.clear(@slot)` needs the slot reference itself, not just the slot's current array/object contents.
2. **Ordinary reads still work**: field access, string coercion, and `asData()` / `asText()` should behave like the slot's current contents.
3. **Boolean guards preserve reference presence**: `when [ @slotRef => ... ]` should test whether a slot ref exists, not whether the current slot contents are non-empty. Use `@shelf.read(@slotRef)` when you specifically want content truthiness.
4. **Generic flattening boundaries stay honest**: Structured data can still unwrap normally without accidentally erasing capability identity.

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

// Boundary helpers
boundary.field(value, path, env)               // Wrapper-preserving read
boundary.identity(value)                       // Preserve tool/shelf/captured-env identity
boundary.display(value)                        // Output/document rendering
boundary.interpolate(value, context)           // Template/shell/plain string boundary
boundary.config(value, env)                    // Env-aware config materialization
boundary.plainData(value)                      // Explicit recursive unwrap/materialization
```

### Boundary Rules

- Use `boundary.field(...)` for reads that must preserve `.mx`, factsources, projection metadata, or identity.
- Use `boundary.config(...)` when a policy/config consumer accepts raw mlld values and needs plain JS data after AST evaluation and variable extraction.
- Use `boundary.plainData(...)` only when you already have the value you want and are intentionally materializing it.
- Use `boundary.identity(...)` for tool collections, captured module envs, and live shelf refs that would lose meaning if treated as plain objects.
- Use `.keep` / `.keepStructured` only for embedded-language boundaries (`js`, `node`, `py`, `sh`). They are not the mlld-to-mlld preservation mechanism.

### Boundary Taxonomy

Use the boundary helpers by contract, not by convenience:

- `field`: wrapper-preserving reads. Use when caller-visible field semantics, `.mx`, factsources, or projection metadata must survive.
- `identity`: identity-preserving transport. Use for tool collections, captured module envs, shelf refs, and other capability-bearing values where object shape is not enough.
- `config`: env-aware config materialization. Use when the input may still contain AST-like nodes, variable references, or imported structured values and the consumer needs plain JS config data.
- `plainData`: explicit recursive materialization. Use when the value is already resolved and the boundary intentionally wants plain arrays/objects/primitives.
- `display`: final output rendering. Use for document/output/show-style text emission after the read/materialization step is done.
- `interpolate`: template and shell string boundaries. Use when escaping rules are part of the contract.
- `serialize`: module/import/export boundary helper. Use for module-boundary export/import serialization; do not treat it as a generic unwrap path or a catch-all for unrelated serializers.

The generated function MCP bridge is not a `serialize` surface. It is an identity-preserving transport of live executables/tool collections, so bridge setup and bridge-local cloning stay in the `identity` family. Preserving `capturedModuleEnv` as object shape is not sufficient; imported executables must be rehydrated against a live `Environment`, or nested shelf/record/executable references degrade to plain data.

### Tool Collection Identity

Tool collections are an identity-preservation hot spot architecturally — they are dispatched through, not just read, so losing the marker silently breaks invocation rather than display. They are marked at two layers and must survive any transform whose result the runtime will later dispatch through.

**Markers (both are authoritative):**
- **Variable-level**: `variable.internal.isToolsCollection === true` with `variable.internal.toolCollection` holding the plain collection object. Set by `prepareVarAssignment` and `normalizeToolCollection` (`interpreter/eval/var/tool-scope.ts`).
- **Plain-object Symbol**: `Symbol.for('mlld.toolCollectionMetadata')` attached directly to the plain object via `attachToolCollectionMetadata`. Used for shape-based detection when a Variable wrapper was unwrapped.

**Detection:** `resolveDirectToolCollection(value)` tries both markers. It does **not** re-attach; it only finds a marker that was preserved. Missing marker → `undefined` → dispatch fails with "not a tool collection."

**Co-travel with `capturedModuleEnv`:** imported tool collections need their source module's env to resolve sibling exes. `sealCapturedModuleEnv` attaches the env alongside the tool collection marker. If either is lost separately, dispatch fails — tool collection without env cannot resolve siblings; env without tool collection has no dispatch surface.

**What preserves identity:**
- Field access and parameter binding (when `boundary.identity()` is used explicitly)
- Module export/import (via dedicated `TOOL_COLLECTION_METADATA_EXPORT_KEY` and `TOOL_COLLECTION_CAPTURED_MODULE_ENV_EXPORT_KEY` in `ModuleExportSerializer`)
- Shelf write/read for nested object-typed fields — but **by reference only**; the shelf validator does not explicitly preserve the Symbol marker, it survives because `object`-typed fields pass through without deep-rebuild
- Runtime-aware JS interop paths (`toJsValue` in `interpreter/utils/node-interop.ts`) that explicitly reattach the Symbol marker to the cloned plain-object result

**What drops identity:**
- Object spread (`{ ...tools }`), `boundary.plainData()`, raw `JSON.stringify`
- Any intermediate deep-clone between a shelf write and its later read
- JS interop paths that bypass `toJsValue` reattachment, or any host-side JS that reconstructs the object without forwarding Symbol-keyed properties (the default for `JSON.parse(JSON.stringify(x))` and similar)

The architectural framing here is descriptive: this is where identity *can* be lost. Whether it has been lost in any given runtime path is empirical — verify with a host-backed repro before treating identity loss as the diagnosed root cause of a downstream symptom.

### Cross-Boundary Survivability

Use this matrix when a value arrived wrong and you need to know which transform dropped metadata. Rows are transforms; columns are metadata/identity. ✓ = preserved, ✗ = dropped, ◐ = conditional, `R` = preserved by reference only (fragile across deep-clone).

| Transform | `.data` | `.text` | `.mx.labels` | `.mx.factsources` | Projection | Tool collection | `capturedModuleEnv` | ShelfSlotRef | `keepStructured` | `ExpressionProvenance` |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Field access | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Object spread | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Array spread | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Parameter binding | ✓ | ✓ | ✓ | ✓ | ◐ | ✓ | ◐ | ✓ | ✗ | ◐ |
| `let` rebind (block body) | ✓ | ✓ | ✓ | ✓ | ◐ | ✓ | ✓ | ✓ | ✗ | ✓ |
| Shelf write→read | ✓ | ✓ | ◐ | ◐ | ✓ | R | R | ✓ (live ref) | ✗ | ✗ |
| Module export→import | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `=> record` coercion | ✓ | ✓ | ✓ | ✓ (minted) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| JS/Node interop | ✓ | ◐ | ◐ | ◐ | ✗ | ◐ | ✗ | ✗ | ◐ | ✗ |

**Key caveats:**
- The `.text` column means the wrapper has a text view, not that the full underlying graph is always materialized. See [Opaque runtime carriers stay opaque in recursive walkers](#opaque-runtime-carriers-stay-opaque-in-recursive-walkers).
- The `capturedModuleEnv` column means a live rehydrated module env, not merely a serialized object that still has the same keys.
- **`R` for shelf**: preserved only because `object`-typed record fields pass through without deep-rebuild. Any intermediate transform that deep-clones (spread, JSON round-trip, `plainData`) breaks this before it reaches the shelf.
- **Spread is destructive.** `{...value}` has `plainData` semantics. If you need metadata through an object construction, build fields explicitly via `field` or `identity` access.
- **`keepStructured` does not cross mlld→mlld boundaries.** It is an embedded-language escape hatch (JS/Node/Py/Sh), not a parameter-passing mechanism. Use `preserveStructuredArgs` on the exe or explicit `boundary.identity()` at the call site for mlld-to-mlld identity.
- **ExpressionProvenance is in-memory only.** Does not serialize. Lost at module boundaries. Consumers that need descriptor information after a serialization round-trip must materialize into Variable `.mx` first.

### Debugging Heuristics

**Diagnostic procedure when a value arrived wrong:**

1. **Identify the carrier at the failing site.** Is it a StructuredValue, a Variable, a capability value, or a plain object? `Object.getOwnPropertyDescriptor(value, 'text')` — a `get` means a lazy wrapper; a `value` means something already materialized `.text`.
2. **Look up the consumer's contract in the boundary taxonomy** (§Boundary Taxonomy above). If consumer expects identity-preserved but got plain, the bug is upstream.
3. **Walk seams backward** in this order: arg evaluation → guard input prep → hook helper injection → parameter binding → result normalization → audit/logging. The failure usually appears one or two seams *after* the boundary that actually dropped the metadata.
4. **Cross-check the survivability matrix** (§Cross-Boundary Survivability). If every transform on the value's path preserves the missing field, the bug is a transform the matrix doesn't list — most likely a manual property access or an ad hoc `JSON.stringify` / `.text` materialization.
5. **Silent fallback is the worst failure mode in this family.** A consumer that silently normalizes a wrong-shape input produces far-downstream bugs. Prefer throwing at the boundary.

**Specific traps:**

- Imported executable parameters are not a plain-data boundary by default. A complex object/array argument may still be caller-owned AST or a wrapper-backed value when it reaches the callee.
- If a bug appears only through an imported helper or only after forwarding an object argument through another exe, inspect parameter rebinding before blaming display, `@pretty`, or generic serialization.
- When a callee needs detached plain data, materialize once at the boundary (`boundary.config`, `boundary.plainData`, or an intentional object spread). Do not rely on downstream field access or stringification to perform that separation implicitly.
- On object/array wrappers, `.text` is effectively a materialization boundary. If a wrapper bug smells like "somewhere this became huge" or "somewhere labels disappeared", ask who asked for text before asking who serialized the object.
- Grep for accidental display/materialization paths, not just `JSON.stringify`: `.text`, `asText(`, `String(`, template interpolation, pretty/log helpers, token/length metrics, and audit summarizers.
- Tool collections, routed tool entries, and imported agent objects are identity-bearing and large. Prefer keyed access on the existing wrapper/object surface. Rebuilding them into fresh plain objects is a real materialization step with both perf and metadata risk.
- Shelf round-trip identity preservation is **by reference only** (see matrix note `R`). If a deep-clone happens anywhere upstream of a shelf write, identity is lost before it reaches storage and cannot be recovered on read.

### Where Values Flow

**Pipelines**
- `PipelineStateMachine.buildStageContext()` assembles stage context fields (`previousOutputs`, `structuredOutputs`, attempt/history snapshots)
- `PipelineExecutor` runtime owns stage output normalization and caching (`PipelineOutputProcessor`, `StageOutputCache`)
- `@pipeline`/`@p` exposes wrappers to subsequent stages
- Parallel stages aggregate structured arrays (`.data` is array, `.text` is JSON)
- Batch pipelines on `for`/`foreach` create synthetic array variables (`for-batch-input`, `foreach-batch-input`) so `processPipeline()` receives structured arrays; results may be scalars, arrays, or objects and are normalized using the standard variable factories.
- Stage environments set `@input` to a structured wrapper; JS/Node auto-binding sees `StructuredValue.data`, so helpers no longer need to call `JSON.parse` (unless they explicitly want raw strings via `.text`).
- Both condensed (`=> |`) and parallel (`=> ||`) batch pipelines pass native arrays/objects into their stages, including parallel branches that run concurrently.
- Regression coverage (#435) ensures pipelines hand structured data between stages without manual `JSON.parse`

**Variables**
- All variable assignments store `StructuredValue` wrappers
- Field access (`.foo`, `.bar`) operates on `.data`
- System wrapper properties (`text`, `data`, `type`, loader/execution metadata) are accessed through `.mx.*` only
- AutoUnwrapManager preserves metadata through JS/Node transformations

**Iterators**
- `/for` and `foreach` normalize collection inputs via `normalizeIterableValue` (`interpreter/eval/for-utils.ts`) so loop bodies, `/for` expression arrays, foreach tuples, and batch inputs expose plain JavaScript arrays/objects. The helper unwraps StructuredValues and Variable wrappers but immediately tags the normalized values with `ExpressionProvenance`, allowing guard hooks and ArrayHelpers to materialize Variables later without leaking wrappers into user code.
- Iterator outputs feed pipelines through `createArrayVariable('for-batch-input', …)`; the variable stores the normalized array value, and provenance metadata flows through the WeakMap so guard filters and `.mx.labels` stay accurate even though the outward-facing data is plain.

**Content Loaders**
- `/load-content` returns wrappers with parsed `.data` and original text
- Loader metadata (filenames, URLs) lands directly in `.mx` (flattened from `LoadContentResult`)
- Transformers (`@parse`, `@yaml`) forward native arrays/objects in `.data`
  - `@parse` uses JSON5 for relaxed parsing (single quotes, trailing commas, comments) and exposes `@parse.loose`/`@parse.strict` variants for explicit control. `@json` remains a deprecated alias.
  - `@parse.llm` attempts JSON extraction from LLM-style prose/code-fence responses and returns `false` (not an exception) when no parseable JSON is found.

### Alligator / Angle-Bracket Content Loading

Source of truth:

- `grammar/patterns/file-reference.peggy`
- `grammar/deps/grammar-core.ts` (`isFileReferenceContent`)
- `interpreter/utils/load-content-structured.ts`
- `interpreter/eval/content-loader/finalization-adapter.ts`

Detection behavior in interpolation contexts:

- `<...>` is treated as file-reference content when trigger characters are present: `.`, `*`, or `@`.
- `/` is not a trigger character.
- HTML comments (`<!...`) and HTML/XML-like tags with attributes are guarded and treated as literals.
- Escapes (`\\@`, `\\.`, `\\*`, `@@`) are honored before trigger checks.

Wrapper and metadata access pattern:

- System metadata and wrapper views are accessed through `.mx.*`.
- Canonical wrapper view access is `@value.mx.text` and `@value.mx.data`.
- Do not treat top-level `@value.text` / `@value.data` as canonical wrapper access.

JSON / JSONL and finalization semantics:

- `wrapLoadContentValue(...)` parses `.json` via `parseJsonWithContext(...)`; parse failures raise `JSON_PARSE_ERROR`.
- `wrapLoadContentValue(...)` parses `.jsonl` line-by-line via `parseJsonLines(...)`; parse failures include line index and raise `JSONL_PARSE_ERROR`.
- Non-json content keeps raw `.text`; best-effort JSON/JSON5 detection is applied when content looks parseable.
- `ContentLoaderFinalizationAdapter.finalizeLoaderResult(...)` normalizes loader outputs to StructuredValues and merges metadata/security descriptors.

Glob aggregate metadata:

- Glob arrays are wrapped with array metadata containing `length` (`.mx.length`).
- Elements keep per-file metadata (`.mx.filename`, `.mx.relative`, `.mx.absolute`, etc.) after per-item wrapping.
- `.mx.fileCount` is not a current metadata field.

JS/Node boundary behavior:

- `AutoUnwrapManager` unwraps StructuredValues to `.data` unless `internal.keepStructured` is set.
- Use `.keep` / `.keepStructured` when metadata/wrapper access must survive JS/Node handoff.

**Display**
- Templates interpolate using `asText()` automatically
- `/show` pretty-prints structured values while preserving `.text`
- CLI/API output emits `.text` by default

**Guards & Provenance**
- `ExpressionProvenance` tags every evaluator result (helpers, templates, iterators, pipelines, JS/Node stages) so the registry always knows which Variable produced the primitive that user code sees.
- Guard extraction surfaces (`materializeGuardInputs`, `materializeDisplayValue`, directive replay helpers) call `materializeExpressionValue()` before invoking guard hooks, ensuring `/show`, `/run`, `/output`, `/append`, pipeline stages, and iterator bodies provide real Variables with `.mx.labels` and `.mx.tokens` even when the script only manipulates strings or arrays.
- `/run sh` heredocs, denied-handler replays, and manual retry loops reuse the same provenance handles because directive replay never mutates env state; guard hooks therefore observe consistent metadata whether they block raw heredoc payloads or allow sanitized retries.

**JavaScript Stages**
- Shadow parameter preparation unwraps wrappers to native values
- `__mlldPrimitiveMetadata` records wrapper info for AutoUnwrapManager
- Results from JS code preserve `StructuredValue` when returned
- `/run @exe(...)` and direct `@exe(...)` argument evaluation both preserve runtime object/array values for code executables (`js`, `node`, `mlld-exe-block`, `mlld-when`), so inline literals and spread patterns use `.data` semantics instead of stringified fallbacks.

## Implementation Patterns

### When to Unwrap

AutoUnwrapManager unwraps StructuredValues to `.data` for JS/Node execution unless the wrapper carries `internal.keepStructured` (set by `.keep`/`.keepStructured` or the helpers). `.keep` preserves the wrapper for metadata/mx access while display still renders `.text`.

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
// Example: interpreter/eval/show/show-invocation-handlers.ts:56
```

### Context Snapshots (`.mx`) and `.internal`

- `StructuredValue.mx` is a real property populated when the wrapper is created (see `interpreter/utils/structured-value.ts`). The snapshot includes security labels, taint arrays, policy context, provenance (filename, relative, absolute, url, domain, title, description), execution metadata (`source`, `retries`), metrics (`tokens`, `tokest`, `length`), plus helper fields such as `fm` and `json`. Consumers mutate `.mx` directly when they need to update provenance or retry counts.
- `StructuredValue.internal` holds mlld-specific details (custom serialization hooks, transformer information, lazy loaders). Treat it as implementation detail; surface only what the interpreter needs.
- `Variable.mx` comes from `VariableMetadataUtils.attachContext()` (`core/types/variable/VariableMetadata.ts`). The snapshot includes `name`, `type`, `definedAt`, security labels, taint, token metrics, array size, export status, sources, and policy context. Use `.mx` instead of manually reading `variable.metadata` to avoid cache invalidation bugs.

### Ambient `@mx` vs Value `.mx`

- Ambient `@mx` is execution context, not value metadata. It is built by `ContextManager.buildAmbientContext()` and surfaced by `VariableManager` as a reserved runtime variable.
- Value `.mx` is metadata attached to StructuredValues and Variables (labels, provenance, retry/context snapshots for that value).
- Keep them separate in docs and code paths: use `@mx.*` for current execution state; use `@value.mx.*` for metadata on a specific value.

### `.mx` Field Access Collision Rule

`.mx` on a StructuredValue always means system metadata — it never auto-resolves into user data. If the user's parsed data happens to contain an `"mx"` key, they access it via `@val.mx.data.mx`, not `@val.mx`.

This is the same principle as `.mx` being reserved on Variables. The `.mx` namespace is system-owned at every level of the value hierarchy. User field names like `.stance`, `.mode`, `.count` auto-resolve through `.mx.data`, but `.mx` itself is the escape hatch into system metadata and is never shadowed by user data.

`@val.mx.text` and `@val.mx.data` are explicit wrapper accessors. They map to the StructuredValue's top-level `.text` and `.data` properties and do not resolve through user data fields named `text` or `data`.
Top-level dotted access does not expose wrapper metadata like `@val.filename`, `@val.type`, or `@val.text`.

### Stage Boundary Rules

- **Unwrap at stage boundaries only** - Stages work with plain JS values; use `asData()`/`asText()` right before execution
- **Preserve metadata** - Don't strip `.mx` or convert wrappers to raw JSON unless at display boundary
- **Avoid deep unwrap helpers** - Call helpers at appropriate boundaries, not recursively through nested objects

### Large Variable Boundaries

- Bash/sh parameter adaptation (`interpreter/env/bash-variable-adapter.ts`) resolves values in `ResolutionContext.CommandExecution`, stringifies them, and returns `envVars` with `tempFiles: []`.
- Oversized bash/sh values are handled in `BashExecutor` via heredoc prelude injection before script execution.
  - Threshold: `MLLD_MAX_BASH_ENV_VAR_SIZE`; default is `64 * 1024` bytes when unset.
  - Oversized values are removed from exported env and assigned as shell-local variables in the prelude.
  - Variable names are sanitized to bash-safe identifiers (`[^a-zA-Z0-9_]` -> `_`).
  - Heredoc markers are generated uniquely with collision checks against payload content.
- Simple `/run` command fallback for oversized payloads is in `CommandExecutorFactory.executeCommand(...)`.
  - If `MLLD_DISABLE_SH` is not set, large payloads are routed to `BashExecutor` (stdin + heredoc path) instead of strict shell execution.
  - Pre-check thresholds (defaults):
    - `MLLD_MAX_SHELL_ENV_VAR_SIZE`: `128 * 1024`
    - `MLLD_MAX_SHELL_ENV_TOTAL_SIZE`: `200 * 1024`
    - `MLLD_MAX_SHELL_COMMAND_SIZE`: `128 * 1024`
    - `MLLD_MAX_SHELL_ARGS_ENV_TOTAL`: `256 * 1024`
- Debug knobs:
  - `MLLD_DEBUG` logs heredoc/fallback decisions.
  - `MLLD_DEBUG_BASH_SCRIPT=1` dumps constructed script/env diagnostics.
  - Debug output uses mixed channels (`console.*` and direct writes); do not assume stderr-only behavior.

### Common Fix Patterns

**Problem**: Function receives string instead of array
**Fix**: Use `asData()` where value enters JS execution context

**Problem**: Metadata lost through transformations
**Fix**: Unwrap at stage boundaries only; preserve wrappers in storage/variables

**Problem**: Nested wrappers cause issues
**Fix**: Normalize exec arguments with `asText()` before template composition

**Problem**: When-expression returns wrapped value to pipeline
**Fix**: Convert StructuredValue results to primitives before tail modifiers

## Serialization Rules

### Two membranes, not one

There are **two distinct value-leaves-runtime contracts**; treating them as one is a common source of confusion:

1. **Module export/import** (`interpreter/eval/import/variable-importer/ModuleExportSerializer.ts`, `interpreter/utils/module-boundary-serialization.ts`). Values pass through `serializeModuleBoundaryValue()`. Variables are converted to marker-bearing forms (`__executable`, `__recordVariable`), tool collections get dedicated export keys for metadata and captured-env, record and shelf definitions serialize with their full schema. This is a real serialize/deserialize round-trip across a module boundary.
2. **Shelf I/O** (`interpreter/shelf/runtime.ts`). Values are stored in the Environment's in-memory `shelfState` Map. Writes go through `validateShelfRecordValue()`, which builds a fresh StructuredValue field-by-field from the record definition, but **object-typed record fields pass through without deep-rebuild**. Reads return a live StructuredValue snapshot. This is reference-handoff with schema validation, not serialization.

The two contracts preserve different things. Module export explicitly preserves tool collection identity via dedicated keys. Shelf I/O preserves nested object identity only by virtue of not deep-cloning — anything upstream that deep-clones will erase identity before it reaches the shelf, and shelf cannot recover it.

`boundary.serialize(value)` is the module-boundary helper. It is a thin wrapper around `serializeModuleBoundaryValue` that asserts no Variable wrappers survive in the output. It is not a generic unwrap path and it is not what shelf uses.

### Never use raw `JSON.stringify` on values that may carry runtime references

Use `stringifyStructured()` (from `interpreter/utils/structured-value.ts`) instead of raw `JSON.stringify` for any path that may encounter StructuredValues, Variables, Environment references, executable definitions, tool collections, shelf refs, or other runtime wrappers. `stringifyStructured()` uses a replacer that unwraps StructuredValues and summarizes identity-bearing executable/runtime carriers instead of descending into their internal graphs.

Raw `JSON.stringify` is acceptable ONLY for known-plain-data objects: parsed JSON literals, config objects you constructed yourself, primitive arrays. If there is any possibility the value transited through the runtime (came from a variable, an exe return, a tool result, an import, a field access on a runtime object), use `stringifyStructured()`.

### Environment is never serialized

The Environment class implements `toJSON()` returning `'[Environment]'`. This makes ALL `JSON.stringify` calls — including the 100+ existing raw calls and any future ones — automatically safe. `JSON.stringify` natively calls `toJSON()` before recursing, so Environment subtrees are collapsed to the placeholder without requiring a custom replacer at every call site.

This is the primary defense for raw `JSON.stringify`. `stringifyStructured()`'s replacer also checks `isEnvironment()` as belt-and-suspenders, but `toJSON()` on the class is the invariant that prevents unbounded serialization walks regardless of which stringify path is used.

Environment is a capability/runtime reference (same category as `ShelfSlotRefValue`), not data. It is not serializable content. The only sanctioned path for inspecting Environment internals is `@debug.environment`.

### Opaque runtime carriers stay opaque in recursive walkers too

Opacity is not only a `JSON.stringify` concern. Recursive URL provenance extraction, recursive security-descriptor extraction, and `.text` materialization on object/array wrappers must also stop at identity-bearing runtime carriers instead of treating them as plain data.

Environment and executable definitions/wrappers are summarized or skipped before any deep property walk. Tool collections remain displayable as plain objects, but their executable entries stay opaque. Shelf refs are opaque for display/URL materialization and only recurse where the caller explicitly wants the current slot descriptor. A recursive walker that does not share the appropriate early-out behavior for these carriers is a bug even if `JSON.stringify` itself would have been safe.

### Why both `toJSON()` and `stringifyStructured()`

- `toJSON()` on Environment handles the catastrophic case for raw `JSON.stringify` calls.
- `stringifyStructured()` handles the StructuredValue case (unwrapping `.data` from wrappers for clean serialized output) and summarizes opaque executable/runtime carriers instead of traversing them.
- Recursive walkers such as URL provenance and recursive descriptor extraction must apply the same opacity rule via type-aware early-outs; `toJSON()` does not protect property enumeration.
- Use `stringifyStructured()` as the default serialization path. Rely on `toJSON()` as the safety net for any call site that hasn't been migrated yet or that calls raw `JSON.stringify` for a legitimate reason on known-plain data that unexpectedly contains a runtime ref.

## Gotchas

- NEVER call builtin array methods directly on wrappers—use `asData()` first
- NEVER use raw `JSON.stringify` on values that may carry runtime references—use `stringifyStructured()` (see Serialization Rules above)
- Reading `.text` on object/array `StructuredValue`s is a real materialization boundary. Do not use `.text` for summaries, helper setup, metrics, or logging unless you are intentionally at a display/interpolate boundary. When `.data` is an identity-bearing runtime carrier, `.text` returns a short placeholder instead of materializing the full graph.
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

**`.mx` works in some contexts but not others**

Symptom: `@f.mx.relative` works in direct interpolation but fails in object literals
(`{ file: @f.mx.relative }`) or exe parameters with "Field 'mx' not found".

Root cause: `.mx` is a property of the Variable wrapper, not the underlying data. When
code extracts the raw value before field access, the Variable wrapper is lost and `.mx`
becomes inaccessible.

Diagnosis approach:
1. Add debug logging to trace `typeof value` and `isVariable(value)` at each step
2. Look for where the value changes from Variable/object to string/primitive
3. The bug is usually one step BEFORE where the error appears

The fix pattern: When evaluating expressions with field access (`.mx.*`), resolve using
`ResolutionContext.FieldAccess` which preserves the Variable wrapper, rather than
extracting raw values first. Key files: `VariableReferenceEvaluator.ts`, `field-access.ts`.

This is tricky because different evaluation paths (direct interpolation vs object literal
construction vs exe parameter binding) may handle Variables differently. The error points
to where `.mx` is accessed, but the bug is where the Variable was unwrapped.
