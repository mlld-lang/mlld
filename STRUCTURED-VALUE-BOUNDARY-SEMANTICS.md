# Structured-Value Boundary Semantics Audit

Status: investigation artifact for `m-f20e`

## Purpose

This note documents the runtime boundary surfaces that matter if mlld wants a universal standard for structured-value handling.

The main conclusion is simple:

- mlld does not have one "wrapper problem"
- mlld has several distinct boundary contracts
- the bug family appears when a consumer silently uses the wrong contract

The immediate implication is also simple:

- do not standardize on a single naked `asData(...)` rule
- standardize on explicit boundary profiles

## Executive Summary

Recent tickets such as `m-d57b`, `m-9491`, `m-ef86`, and `m-071b` are all in the same family, but they are not all the same bug.

The codebase currently carries runtime metadata through three primary channels:

1. `StructuredValue` wrappers
2. `Variable` wrappers with `mx` and `internal`
3. `ExpressionProvenance` on plain JS objects

There are also special capability/reference wrappers that behave like a fourth channel in practice:

- `ShelfSlotRefValue`
- `LoadContentResult`
- imported executable wrappers with captured module environments
- tool collection metadata and captured-env export keys

The strongest current architectural finding is this:

- config-like consumers often need recursive materialization of nested arrays and objects
- identity-bearing consumers often need wrapper preservation, not materialization
- display and shell boundaries need string materialization
- serialization boundaries need their own explicit survivability rules

Those are different contracts. Treating them as one universal unwrap rule is what creates the current bug surface.

## Investigation Footprint

This audit covered the core runtime, boundary helpers, and the highest-pressure consumers in `interpreter/` and `core/`.

Quick repo-level signals:

- About `749` non-test references in `interpreter/` and `core/` touch the key wrapper/provenance helpers inspected for this audit.
- A broader grep of wrapper/provenance-related calls returned about `950` total hits including tests and related helper variants.
- There are at least `108` explicit object/array type-shape checks in the runtime.

Highest-pressure non-test files from the composite wrapper/provenance scan:

| Count | File |
| --- | --- |
| 60 | `interpreter/eval/exec-invocation.ts` |
| 32 | `interpreter/shelf/runtime.ts` |
| 30 | `interpreter/policy/authorization-compiler.ts` |
| 27 | `interpreter/utils/structured-value.ts` |
| 23 | `interpreter/utils/field-access.ts` |
| 18 | `interpreter/eval/pipeline/unified-processor.ts` |
| 17 | `interpreter/eval/exec/non-command-handlers.ts` |
| 16 | `interpreter/eval/records/coerce-record.ts` |
| 16 | `interpreter/eval/data-values/CollectionEvaluator.ts` |
| 15 | `interpreter/env/builtins/policy.ts` |
| 15 | `interpreter/eval/pipeline/executor/output-processor.ts` |
| 14 | `interpreter/env/variable-proxy.ts` |
| 11 | `interpreter/utils/interpolation.ts` |
| 11 | `interpreter/eval/var/tool-scope.ts` |
| 10 | `interpreter/env/Environment.ts` |

That hotspot list is a better guide to standardization risk than any single ticket.

## Runtime Carriers

### 1. `StructuredValue`

Defined in `interpreter/utils/structured-value.ts`.

Carries:

- `.data`
- `.text`
- `metadata.security`
- `.mx`
- `internal`
- record projection metadata
- factsource metadata

Important property:

- `asData(...)` is shallow

That means a top-level `StructuredValue<object>` can still contain nested `StructuredValue` children after the first unwrap. `m-d57b` was exactly this failure mode.

### 2. `Variable`

Defined through the variable factories and runtime type system.

Carries:

- declared variable type
- `mx`
- `internal`
- import and namespace metadata
- tool collection identity flags
- captured module env references
- execution/pipeline retry metadata

Important property:

- `Variable` is not just a transport for `value`
- many boundaries depend on `internal` identity, not just data shape

### 3. `ExpressionProvenance`

Defined in `core/types/provenance/ExpressionProvenance.ts`.

Carries:

- `SecurityDescriptor` on plain JS objects via `WeakMap`

Important property:

- metadata can survive wrapper removal if the boundary reattaches provenance correctly
- JS-side structural comparisons do not show this unless the code explicitly checks provenance-bearing accessors

### 4. Special capability/reference wrappers

These are not interchangeable with ordinary structured containers:

- `ShelfSlotRefValue`
- `LoadContentResult`
- imported executable wrappers
- tool collection metadata and captured module env keys

Important property:

- these values are often intentionally not flattened into plain data
- they carry authority, live references, or module identity

## The Actual Boundary Taxonomy

This is the central standardization frame.

### A. Wrapper-preserving access boundaries

Goal:

- preserve field-access semantics
- preserve `.mx`
- preserve record projection metadata
- preserve provenance attachment

Representative code:

- `interpreter/utils/variable-resolution.ts`
- `interpreter/utils/field-access.ts`
- `interpreter/eval/data-values/VariableReferenceEvaluator.ts`

Failure mode when wrong:

- field access behaves differently depending on caller
- `.mx` access disappears or changes shape
- leaf values lose labels or projection metadata

### B. Identity-preserving capability boundaries

Goal:

- preserve semantic identity, not just structural data

Representative code:

- `interpreter/eval/var/tool-scope.ts`
- `interpreter/utils/parameter-factory.ts`
- `interpreter/env/executors/call-mcp-config.ts`
- `interpreter/shelf/runtime.ts`

Failure mode when wrong:

- tool collections lose `isToolsCollection`
- captured module env is dropped
- live shelf references collapse into snapshots
- runtime resolution becomes impossible even though the raw object still "looks right"

### C. Recursive plain-data materialization boundaries

Goal:

- recursively materialize nested structured containers into plain JS data
- optionally preserve provenance on the resulting plain objects

Representative code:

- `interpreter/env/builtins/policy.ts`
- `interpreter/policy/authorization-compiler.ts`
- `interpreter/utils/display-materialization.ts`
- `interpreter/eval/pipeline/unified-processor.ts`
- `interpreter/env/variable-proxy.ts`

Failure mode when wrong:

- top-level object looks correct, nested values stay wrapped
- downstream normalizers silently treat wrapped arrays/objects as wrong shape
- bugs only repro when values crossed through exe returns, spreads, imports, or parameter binding

### D. String/display boundaries

Goal:

- produce final text or shell-safe text

Representative code:

- `interpreter/utils/interpolation.ts`
- `interpreter/eval/output.ts`
- `interpreter/utils/display-materialization.ts`

Failure mode when wrong:

- output semantics diverge from normal field access
- JSON-looking strings are mistaken for objects or vice versa
- metadata is silently discarded before policy checks or diagnostics

### E. Serialization/rehydration boundaries

Goal:

- preserve only the metadata that must survive across module/export/import boundaries

Representative code:

- `interpreter/eval/import/VariableImporter.ts`
- `interpreter/eval/import/ObjectReferenceResolver.ts`
- `interpreter/eval/import/variable-importer/ModuleExportSerializer.ts`
- `interpreter/eval/import/variable-importer/VariableImportUtilities.ts`

Failure mode when wrong:

- executables import without captured scope
- tool collections lose their authorization context
- namespace children lose per-field metadata
- imported objects look structurally correct but lose runtime semantics

## Core Contract Site

The closest thing mlld already has to a central contract is `ResolutionContext` in `interpreter/utils/variable-resolution.ts`.

It already distinguishes:

- preserve contexts:
  - `VariableAssignment`
  - `VariableCopy`
  - `ArrayElement`
  - `ObjectProperty`
  - `FunctionArgument`
  - `DataStructure`
  - `FieldAccess`
  - `ImportResult`
- extract contexts:
  - `StringInterpolation`
  - `CommandExecution`
  - `FileOutput`
  - `Conditional`
  - `Display`
  - `PipelineInput`
  - `Truthiness`
  - `Equality`

That classification is directionally correct.

What it does not currently solve is nested materialization policy after extraction. That second question is where the codebase duplicates logic today.

## Boundary Audit Matrix

### `interpreter/utils/structured-value.ts`

Role:

- root wrapper primitive and metadata extractor

Current contract:

- `asData(...)` is shallow
- `ensureStructuredValue(...)` and `wrapStructured(...)` normalize values into wrappers
- `extractSecurityDescriptor(...)` merges metadata, nested descriptors, and provenance
- structured namespace children can be re-materialized with per-field metadata

Standardization impact:

- any universal boundary design has to start by treating shallow `asData(...)` as a low-level primitive, not a complete boundary policy

### `core/types/provenance/ExpressionProvenance.ts`

Role:

- lets plain objects still carry security/provenance metadata

Current contract:

- provenance is attached only to object values
- `materializeExpressionValue(...)` can recover a variable from provenance-bearing plain values

Standardization impact:

- recursive materialization is safe only if provenance is deliberately preserved where needed

### `interpreter/utils/variable-resolution.ts`

Role:

- central preserve-vs-extract switch for variables

Current contract:

- wrapper-preserving or extracting behavior depends on `ResolutionContext`
- extraction auto-executes executable variables in some contexts

Standardization impact:

- this file should remain the first-stage contract
- it should not also be forced to answer every deep materialization question

### `interpreter/utils/field-access.ts`

Role:

- canonical field-access semantics

Current contract:

- supports `.mx` on wrapped and plain values
- synthesizes `.mx` views for plain objects from descriptors
- reapplies descriptors and provenance to accessed children
- preserves projection metadata and factsource metadata on children

Standardization impact:

- this is the canonical wrapper-preserving field boundary
- any caller doing manual property access is a divergence risk

### `interpreter/eval/data-values/VariableReferenceEvaluator.ts`

Role:

- routes variable references through `ResolutionContext.FieldAccess`

Current contract:

- preserves wrapper semantics for field access
- then applies `accessField(...)`

Standardization impact:

- this is the model to copy
- specialized evaluators should prefer routing here or reusing the same access helper

### `interpreter/eval/data-values/CollectionEvaluator.ts`

Role:

- object/array literal construction and spread

Current contract:

- ordinary object property evaluation preserves structured object/array leaves
- spread path shallow-unwraps top-level structured values via `asData(...)`

Risk:

- spread and ordinary object-property insertion are not the same boundary
- that is both useful and dangerous

Standardization impact:

- mlld needs an explicit answer to whether object spread is intended to be a materializing boundary

### `interpreter/env/builtins/policy.ts`

Role:

- `@policy.build` config boundary

Current contract:

- recursively materializes nested config values before normalizing policy config

Good precedent:

- this is the right contract for config-like policy input

Gap:

- it duplicates similar logic from the authorization compiler

### `interpreter/policy/authorization-compiler.ts`

Role:

- runtime compilation of authorization policy fragments

Current contract:

- has its own recursive `materializePolicySourceValue(...)`
- intentionally preserves security-bearing variables in some paths

Good precedent:

- shows that policy compilation is not just `asData(...)`

Gap:

- semantics overlap with `policy.ts` but are not shared

### `interpreter/eval/exec/policy-fragment.ts`

Role:

- runtime `with { policy }` fragment resolution

Current contract:

- evaluates AST
- extracts variables
- resolves handles
- then shallow-unwraps structured values with `asData(...)`

Risk:

- policy fragment handling is now inconsistent with both `policy.ts` and the authorization compiler

Standardization impact:

- this is a priority migration target

### `interpreter/eval/pipeline/unified-processor.ts`

Role:

- pipeline input and output normalization

Current contract:

- uses `resolveNestedValue(..., { preserveProvenance: true })` to sanitize nested data
- reattaches descriptors and provenance

Good precedent:

- this is already a recursive plain-data boundary with provenance retention

Gap:

- the helper used here is generic display materialization, not a named config/plain-data boundary helper

### `interpreter/eval/output.ts`

Role:

- `@output` source evaluation and final emission

Current contract:

- simple variable sources use `extractVariableValue(...)`
- if the result is structured, output manually switches to `.data`
- field access is then performed by ad hoc property/index access instead of `accessField(...)`

Risk:

- `output` does not share canonical field-access semantics
- `.mx` and nested metadata behavior can diverge from normal evaluation

Standardization impact:

- high-priority consolidation target

### `interpreter/utils/interpolation.ts`

Role:

- template and shell interpolation

Current contract:

- mostly string boundary semantics
- uses `ResolutionContext.StringInterpolation`
- for explicit field access, routes through `accessField(...)`
- wildcard projection over arrays uses shallow `asData(...)`

Standardization impact:

- interpolation is intentionally string-first
- the relevant standardization work is not to make it preserve wrappers universally, but to be explicit about when field access and array projection materialize

### `interpreter/env/variable-proxy.ts`

Role:

- JS/shadow-environment boundary

Current contract:

- recursively unwraps structured values
- respects `keepStructured`
- preserves accessor-bearing and non-plain objects
- records primitive metadata separately when primitives cannot be proxied

Good precedent:

- this is the clearest deep-materialization boundary in the codebase

Standardization impact:

- JS interop should be treated as its own boundary profile, not as the universal runtime rule

### `interpreter/utils/guard-inputs.ts`

Role:

- guard/runtime adapter

Current contract:

- hybrid behavior
- preserves structured scalars when requested
- clones arrays/objects while preserving provenance
- materializes variables from provenance when possible

Standardization impact:

- guard inputs prove that one boundary cannot serve all consumers
- some consumers need scalar preservation while still flattening composites

### `interpreter/eval/var/tool-scope.ts`

Role:

- tools config and tool collection scope normalization

Current contract:

- first tries to recover direct tool collection identity
- only then shallow-unwraps structured values
- preserves captured module env on tool collections

Good precedent:

- identity is prioritized over raw shape

Standardization impact:

- tool collections need a dedicated identity-preserving boundary profile

### `interpreter/utils/parameter-factory.ts`

Role:

- parameter binding

Current contract:

- preserves original variable identity when allowed
- preserves tool collection identity and captured module env
- otherwise creates new variables of the right shape

Standardization impact:

- parameter binding is not a plain-data boundary
- it is an identity-preserving transport boundary

### `interpreter/env/executors/call-mcp-config.ts`

Role:

- runtime MCP/tool executor config consumption

Current contract:

- some inputs are normalized with shallow `asData(...)`
- tool collections recover identity through `resolveDirectToolCollection(...)`

Risk:

- scalar and flat list config is probably fine
- nested config-like inputs remain a likely future bug surface unless intentionally classified

### `interpreter/shelf/runtime.ts`

Role:

- shelf records, typed slot values, and readable/projected shelf views

Current contract:

- aggressively preserves structured field metadata
- wraps slot snapshots
- uses projection metadata and fact proof checks
- uses `preserveStructuredArgs` on shelf builtins
- still contains a few shallow unwraps for alias/string normalization

Standardization impact:

- shelf is a strongly wrapper-aware subsystem
- it should not be flattened under a generic plain-data rule

### Import/export serialization

Relevant files:

- `interpreter/eval/import/VariableImporter.ts`
- `interpreter/eval/import/ObjectReferenceResolver.ts`
- `interpreter/eval/import/variable-importer/ModuleExportSerializer.ts`
- `interpreter/eval/import/variable-importer/VariableImportUtilities.ts`

Current contract:

- executables serialize with explicit metadata and captured env handling
- records and shelves use dedicated serialized forms
- ordinary object/array exports often travel as resolved raw values
- tool collections get special export metadata and captured-env side channels

Standardization impact:

- serialization is a boundary profile of its own
- it is not equivalent to local recursive materialization

## Existing Helper Patterns

There are already several reusable patterns in the repo. The problem is that they are not standardized or named as one family.

### Pattern 1: shallow unwrap primitive

Representative helper:

- `asData(...)`

Use when:

- caller already knows nested children are safe or irrelevant
- caller only needs one level of data access

Do not use when:

- downstream consumer expects recursively plain JS data

### Pattern 2: recursive plain-data materialization

Representative helpers:

- `resolveNestedValue(...)`
- `materializePolicyConfigValue(...)`
- `materializePolicySourceValue(...)`
- `unwrapStructuredRecursively(...)`

Use when:

- config-like consumer needs recursively plain arrays and objects

Current problem:

- the codebase has multiple copies with slightly different semantics

### Pattern 3: wrapper-preserving field access

Representative helpers:

- `resolveVariable(..., ResolutionContext.FieldAccess)`
- `accessField(...)`
- `accessFields(...)`

Use when:

- caller wants runtime-visible field access semantics

Current problem:

- some subsystems bypass this and perform manual property access

### Pattern 4: identity-preserving normalization

Representative helpers:

- `resolveDirectToolCollection(...)`
- parameter factory reuse paths
- captured module env seal/stash helpers

Use when:

- data shape alone is insufficient

Current problem:

- these semantics are currently implicit and subsystem-local

## What Must Be Tracked To Standardize This Universally

Any proposed standard has to answer every dimension below.

### 1. Boundary intent

For each consumer, explicitly classify whether it needs:

- wrapper-preserving runtime access
- identity-preserving capability access
- recursive plain-data materialization
- final string/display materialization
- serialization/rehydration

### 2. Top-level vs nested behavior

This must be explicit:

- top-level unwrap only
- recursive unwrap of arrays and objects
- recursive unwrap except for special wrappers

`m-d57b` was specifically a top-level-vs-nested mismatch.

### 3. Variable semantics

Track whether the boundary:

- preserves the `Variable` wrapper
- extracts `variable.value`
- auto-executes executable variables
- preserves `mx`
- preserves `internal`

### 4. Structured scalar semantics

Track whether structured scalars should:

- stay wrapped to carry metadata
- become plain primitives
- become simple-text variables via provenance materialization

Guard inputs already prove these choices vary by consumer.

### 5. Provenance retention on plain objects

Track whether the boundary must:

- discard provenance
- preserve provenance on materialized plain objects
- materialize provenance back into variable metadata later

### 6. Identity-bearing internals

Track whether these must survive the boundary:

- `isToolsCollection`
- `toolCollection`
- `capturedModuleEnv`
- `namespaceMetadata`
- `keepStructured`
- `preserveStructuredArgs`
- shelf slot references
- record projection metadata
- factsource metadata

### 7. Special wrapper exemptions

Track special cases separately from normal arrays/objects:

- `ShelfSlotRefValue`
- `LoadContentResult`
- imported executable wrappers
- workspace values
- record variables

### 8. Field-access parity

Track whether the boundary:

- routes through `accessField(...)`
- routes through `accessFields(...)`
- performs manual property/index access

Any manual field access path should be considered suspect until classified.

### 9. Failure semantics

Track what happens on invalid input:

- explicit error
- explicit diagnostic
- silent normalization
- silent fallback
- silent drop

Silent fallback is the worst version of this bug family.

### 10. Import/export survivability

Track which metadata must survive module boundaries:

- security descriptor
- captured module env
- tool collection authorization context
- namespace child metadata
- record/shelf metadata

### 11. JS/shadow parity

Track whether the runtime and JS shadow see:

- the same structure
- the same metadata
- only raw data

JS is useful for structural comparison, but it is not a faithful view of all runtime metadata.

### 12. Escape hatches

Track how the boundary handles:

- `.keep`
- `.keepStructured`
- `preserveStructuredArgs`

If these escape hatches exist, their meaning must be stable across subsystems.

### 13. Test-source dimension

Every standardization test matrix should vary the origin of the same logical value:

- script literal
- `let`-bound value
- parameter-bound value
- exe-returned value
- imported value
- field-access result
- spread clone
- JS/shadow-returned value

Many bugs only appear when the same data crosses one extra boundary first.

### 14. Test-shape dimension

Test at least:

- structured scalar
- structured object
- structured array
- object with nested structured arrays
- array of structured objects
- object with projection metadata
- tool collection object
- shelf/reference-bearing value

## Priority Gaps

These are the most important inconsistencies to address first.

### Priority 1: unify policy/config boundaries

Files:

- `interpreter/env/builtins/policy.ts`
- `interpreter/policy/authorization-compiler.ts`
- `interpreter/eval/exec/policy-fragment.ts`

Why:

- same domain
- currently multiple materialization contracts
- already proven bug surface

### Priority 2: eliminate manual field-access special cases

Files:

- `interpreter/eval/output.ts`
- any future custom output/display evaluators

Why:

- field access is already a solved problem elsewhere
- divergence here creates confusing user-facing behavior

### Priority 3: explicitly classify object spread

Files:

- `interpreter/eval/data-values/CollectionEvaluator.ts`

Why:

- spread is currently a semi-materializing boundary
- that may be intended, but it should not remain accidental

### Priority 4: formalize tool collection identity boundaries

Files:

- `interpreter/eval/var/tool-scope.ts`
- `interpreter/utils/parameter-factory.ts`
- `interpreter/env/executors/call-mcp-config.ts`
- import/export helpers

Why:

- tool collections are not plain config objects
- they carry authority and captured module identity

### Priority 5: classify shallow `asData(...)` consumers

Representative files:

- `interpreter/eval/exec/scoped-runtime-config.ts`
- `interpreter/env/executors/call-mcp-config.ts`
- `interpreter/eval/box.ts`
- `interpreter/eval/file.ts`
- `interpreter/eval/control-flow.ts`

Why:

- some are correct because they only accept scalars or flat values
- some are likely latent bugs
- right now the distinction is mostly undocumented

## Recommended Standardization Shape

The codebase should not move to one universal helper with one behavior.

It should move to one named boundary family with explicit profiles.

Minimum recommended profiles:

1. `preserve-access`
   - preserve wrappers, field-access semantics, `.mx`, projection metadata, provenance

2. `plain-data`
   - recursively materialize arrays/objects
   - preserve provenance on resulting plain objects when requested
   - configurable exemptions for special wrappers

3. `identity`
   - recover or preserve identity-bearing internals such as tool collections and captured envs

4. `display`
   - normalize to final text or displayable data

5. `serialize`
   - preserve only the metadata explicitly intended to survive module boundaries

This can be implemented as either:

- one helper family with multiple entry points, or
- one engine with an explicit profile enum and option set

The important part is not the API shape. The important part is that callers choose a named contract instead of ad hoc `asData(...)` plus hand-written recursion.

## Suggested Migration Plan

1. Introduce a shared boundary abstraction for recursive plain-data materialization.
2. Move all policy-related consumers onto the same profile or helper.
3. Replace `output.ts` manual field access with canonical field-access helpers.
4. Document whether object spread is intentionally materializing.
5. Add a dedicated identity profile for tool collections and other capability-bearing values.
6. Audit remaining shallow `asData(...)` sites and classify each as:
   - intentional shallow unwrap
   - should move to plain-data profile
   - should move to identity profile
   - should route through field-access/profile-specific helper

## Regression Matrix To Add Before Any Broad Refactor

Every boundary profile should be covered across the same source/value variants.

Minimum matrix:

| Dimension | Cases |
| --- | --- |
| Origin | literal, `let`, parameter, exe return, import, field access, spread clone, JS/shadow return |
| Shape | scalar, array, object, nested array-in-object, nested object-in-array |
| Metadata | labels/taint, factsources, projection, namespace metadata, tool collection identity, captured module env |
| Boundary | policy build, policy fragment, authorization compile, output, interpolation, pipeline input, JS shadow, import/export |
| Failure mode | explicit error, diagnostic, normalization, fallback, drop |

Without that matrix, standardization will regress whichever boundary profile is not represented in the narrow ticket repro.

## Bottom Line

The architecture question behind `m-f20e` is not:

- "How do we make exe-return wrapper types uniform?"

The architecture question is:

- "Which boundary contract is each consumer actually supposed to use, and how do we stop callers from improvising that contract locally?"

The codebase already contains most of the needed semantics.

What it lacks is:

- a named taxonomy
- shared boundary helpers for each profile
- an audit-backed migration plan
- a regression matrix that varies origin, shape, and metadata independently

That is the standardization work.
