# Implementation Plan: Record Array Fact Fields

## Overview

This change extends record field declarations to support `array` and `array?` for fact fields, with authorization-grade proof carried per element rather than only at the container level. The goal is to let array-valued inputs such as `participants` or `recipients` survive record coercion with the same trust-refinement and display-projection behavior that scalar fact fields already have.

Scope is limited to record field declarations and runtime behavior for array-valued fields. Generic element typing such as `array<string>` and map/object fact semantics are explicitly deferred.

## Current State

- Record grammar only accepts `string`, `number`, and `boolean` in field type position.
- `RecordScalarType` is scalar-only.
- Record coercion only validates/coerces scalar leaf values.
- Display projection assumes fact fields are single values when choosing bare, masked, or handle-only output.
- Boundary canonicalization already walks arrays recursively, but only if array-valued fact fields actually emit per-element projected values.

## Problems

1. `participants` and similar array-valued fields cannot be declared as facts, so they must be modeled as data.
2. Data fields keep inherited `untrusted`, which blocks defended-mode writes even when the array contents came from an authoritative source.
3. Even if grammar support were added naively, container-only proof would not satisfy the existing authorization model, which expects element-level fact attestations for destination arrays.

## Design Decisions

1. **Add `array` as a first-class record field type**
   - Accept `array` and `array?` anywhere record field type annotations are allowed.
   - Keep syntax parallel with existing scalar declarations.

2. **Use per-element proof, not container-only proof**
   - Each array element becomes a structured value carrying the field’s fact label.
   - The array container keeps the merged descriptor from its elements.
   - This aligns with existing authorization checks for `participants` / `recipients`.

3. **Reuse existing display and canonicalization behavior per element**
   - Bare arrays remain visible arrays.
   - Masked arrays render each element as `{ preview, handle }`.
   - Handle-only arrays render each element as `{ handle }`.
   - Canonicalization should continue to resolve arrays element-by-element without introducing a second array-specific path.

4. **Do not implement object/map fact fields here**
   - `shared_with` and similar map-shaped data need nested trust semantics and are out of scope.

## Implementation Phases

## Phase 1 – Grammar And Type Model

**Goal**: Accept `array` in record field declarations and reflect it in the AST/type model.

### Tasks

1. `grammar/directives/record.peggy`
   - Extend `RecordScalarType` to include `array`.

2. `core/types/record.ts`
   - Rename or broaden the scalar type alias so array is represented in the type model.

3. Grammar tests
   - Add coverage for `facts: [participants: array?]`.

### Exit Criteria

- [ ] `parseSync('/record @x = { facts: [participants: array?] }')` succeeds.
- [ ] Existing record grammar tests still pass.

## Phase 2 – Record Coercion And Proof Propagation

**Goal**: Coerce array fields into structured arrays with per-element fact proof and trust refinement.

### Tasks

1. `interpreter/eval/records/coerce-record.ts`
   - Split scalar coercion from field coercion.
   - Add an array field branch that:
     - validates `Array.isArray(value)`
     - wraps each element as a structured value
     - applies the same fact labels and trust refinement used for scalar fact fields
     - aggregates factsources on both elements and container
   - Preserve existing validation behavior for `drop`, `demote`, and `strict`.

2. `interpreter/utils/field-access.ts` and `interpreter/utils/structured-value.ts`
   - Verify container/element descriptors are surfaced correctly when array fields are accessed.
   - Adjust only if array children are not currently merged the way record fields require.

### Exit Criteria

- [ ] Accessing an array fact field yields a structured array.
- [ ] Each element carries `fact:@record.field`.
- [ ] Inherited `untrusted` is cleared from fact elements and retained for data fields.

## Phase 3 – Display Projection And Runtime Reuse

**Goal**: Project array fact fields correctly at the LLM boundary and preserve same-session reuse.

### Tasks

1. `interpreter/eval/records/display-projection.ts`
   - Detect array-valued fact fields and project each element independently for bare, mask, and handle-only modes.
   - Record projection exposures per emitted element so session lookup remains precise.

2. `interpreter/utils/projected-value-canonicalization.ts`
   - Verify existing array recursion resolves per-element handles / previews / literals without new behavior.
   - Add tests rather than patching unless a real gap appears.

3. `cli/mcp/FunctionRouter.test.ts` and bridge-path tests
   - Confirm array-valued fact fields can round-trip through native tool calling and bridge calling.

### Exit Criteria

- [ ] Masked array fact fields emit per-element previews and handles.
- [ ] Reusing emitted array elements in later tool calls resolves back to live values.
- [ ] No ambiguity/crash regressions for array inputs.

## Testing Requirements

- Add grammar coverage for `array` record fields.
- Add coercion tests for:
  - fact array fields
  - data array fields
  - validation failures
  - trust refinement on elements
- Add display-projection tests for:
  - bare arrays
  - masked arrays
  - handle-only arrays
- Add router or bridge tests proving a later tool call can consume emitted array elements.
- Re-run the already-added canonicalization regressions for scalar previews.

## Documentation Requirements

- Update the record grammar and runtime behavior in user-facing record docs if implementation lands cleanly.
- Defer object/map fact documentation until that feature exists.

## Overall Exit Criteria

- [ ] `array` / `array?` record field declarations parse and evaluate.
- [ ] Array fact fields carry per-element proof and trust refinement.
- [ ] Display projection emits reusable per-element handles/previews.
- [ ] Native-tool and MCP bridge tests pass for array fact reuse.
- [ ] Existing scalar fact behavior remains green.
