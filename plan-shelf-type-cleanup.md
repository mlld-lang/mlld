# Plan: First-Class Shelf Slot Ref Type Cleanup

## Overview

This refactor replaces shelf slot refs as "StructuredValue with an internal marker" with a first-class runtime slot-ref value. The goal is to make slot refs survive ordinary executable binding, imports, wrapper executables, `??`, `when`, and box shelf config normalization without depending on shelf-specific wrapper-preservation hacks. The work is scoped to slot-ref transport and cleanup of the old implementation seams; it does not redesign shelves, records, or `@fyi.shelf`.

## Current State

Today a shelf slot getter returns a cloned `StructuredValue` plus `internal.shelfSlotRef` in [runtime.ts](/Users/adam/mlld/mlld/interpreter/shelf/runtime.ts). That representation leaks into generic runtime code as if it were ordinary data:

- `asData(...)` and equality resolution flatten it to current slot contents
- executable arg normalization recursively unwraps `StructuredValue`s
- wrapper executables and imported wrappers can accidentally pass plain data where `@shelve.clear(...)` expects a slot ref
- shelf-specific rescue code has started appearing in:
  - [variable-resolution.ts](/Users/adam/mlld/mlld/interpreter/utils/variable-resolution.ts)
  - [assignment-support.ts](/Users/adam/mlld/mlld/interpreter/eval/when/assignment-support.ts)
  - [exec-invocation.ts](/Users/adam/mlld/mlld/interpreter/eval/exec-invocation.ts)

Benchmark GPT's repro confirms this is not benchmark-specific. A top-level file importing a wrapper executable can still flatten a slot ref before `@shelve.clear(...)`.

## Problems

1. Slot refs are modeled as data wrappers, but semantically they are capabilities/references.
2. Generic runtime helpers are correct to unwrap structured data, so marker-based slot refs keep getting erased.
3. The current fixes are path-by-path and will keep growing unless the representation changes.
4. `docs/dev/DATA.md` currently overstates the model as "everything at runtime is StructuredValue", which is no longer accurate once capability values exist.

## Goals

1. Introduce a first-class `ShelfSlotRefValue` runtime value with explicit identity.
2. Preserve current user-facing shelf behavior:
   - `@shelf.slot` still acts like the slot's current contents for field/index access, truthiness, and string/data coercion
   - `@shelve`, `@shelve.clear`, and `@shelve.remove` still accept slot refs naturally
3. Remove shelf-specific transport hacks that are only compensating for the old representation.
4. Convert the benchmark/imported-wrapper failure mode into committed regression coverage.
5. Update docs to distinguish structured data values from capability/reference values.

## Design Decisions

### 1. Slot refs become a dedicated runtime value family

Add a `ShelfSlotRefValue` type in [core/types/shelf.ts](/Users/adam/mlld/mlld/core/types/shelf.ts) with:

- stable slot identity: `shelfName`, `slotName`
- a current structured snapshot for compatibility: `current`
- string/data projection accessors: `text`, `data`, `mx`
- `toString`, `valueOf`, and `toJSON` so interpolation and serialization stay predictable

This value must **not** look like a plain object or a `StructuredValue` to generic code.

### 2. Generic helpers learn the new runtime value

Rather than reintroducing shelf-specific special cases all over the runtime, update the common coercion helpers so slot refs behave like current slot contents where appropriate:

- `asText(slotRef)` -> current snapshot text
- `asData(slotRef)` -> current snapshot data
- field/index access on a slot ref operates on the current snapshot
- truthiness/equality helpers compare the current snapshot contents
- security descriptor extraction reads from the current snapshot

### 3. Transport should work without `preserveStructuredArgs`

`preserveStructuredArgs` stays as a valid general executable feature, but slot refs should no longer depend on it. A slot ref should survive normal parameter binding and JS interop because it is its own runtime value, not because a path remembered to keep wrappers around.

### 4. Keep cleanup scoped

This refactor should remove slot-ref compatibility hacks from the old implementation, but should not become a general cleanup pass over unrelated evaluator behavior.

## Implementation Phases

## Phase 1 – Add the Runtime Slot Ref Type (≈2-3 hours)

**Goal**: Introduce the new runtime value and switch shelf runtime creation/extraction to use it.

### Tasks

1. **Add `ShelfSlotRefValue` helpers** - [core/types/shelf.ts](/Users/adam/mlld/mlld/core/types/shelf.ts)
   - add a runtime marker/symbol and guard
   - add the concrete slot-ref value constructor
   - expose access to the current structured snapshot

2. **Switch shelf runtime creation/extraction** - [runtime.ts](/Users/adam/mlld/mlld/interpreter/shelf/runtime.ts)
   - remove `internal.shelfSlotRef` marker encoding
   - remove `withShelfSlotRef(...)`
   - have `createShelfSlotReferenceValue(...)` return `ShelfSlotRefValue`
   - update `extractShelfSlotRef(...)` to read the new runtime type

### Testing

- extend/adjust [shelf.test.ts](/Users/adam/mlld/mlld/interpreter/eval/shelf.test.ts) to assert slot refs are identifiable without requiring `isStructuredValue(...)`

### Exit Criteria

- [ ] shelf getters return the new slot-ref runtime value
- [ ] `@shelve*` builtins accept the new value directly
- [ ] no code path still depends on `internal.shelfSlotRef`

## Phase 2 – Teach Generic Value Helpers About Slot Refs (≈3-4 hours)

**Goal**: Make slot refs behave like slot contents in ordinary expressions without flattening the reference away.

### Tasks

1. **Structured/value helpers** - [structured-value.ts](/Users/adam/mlld/mlld/interpreter/utils/structured-value.ts)
   - add slot-ref support to `asText`, `asData`, JSON replacer, and security descriptor extraction
   - make `ensureStructuredValue(slotRef)` intentionally project the current snapshot instead of preserving the ref

2. **Field access** - [field-access.ts](/Users/adam/mlld/mlld/interpreter/utils/field-access.ts)
   - treat a slot ref like its current structured snapshot for `.mx`, field access, and array indexing

3. **Expression semantics** - [expressions.ts](/Users/adam/mlld/mlld/interpreter/eval/expressions.ts)
   - `isTruthy(slotRef)` should look at current contents
   - `extractValue(slotRef)` should compare current contents
   - `??` should test the current contents, not the ref object shell

4. **Builtins** - [builtins.ts](/Users/adam/mlld/mlld/interpreter/eval/exec/builtins.ts)
   - allow string/array builtins to operate on slot refs via current contents

### Testing

- add/adjust cases for `@slot ?? null`, `when [ @slot => ... ]`, direct field/index access, and builtins if needed

### Exit Criteria

- [ ] slot refs act like current contents for read/display/expression behavior
- [ ] equality/truthiness behavior matches prior shelf semantics
- [ ] no generic helper requires the old marker-based representation

## Phase 3 – Remove Old Shelf Transport Hacks (≈2-3 hours)

**Goal**: delete the path-specific compatibility code that only existed because slot refs were disguised `StructuredValue`s.

### Tasks

1. **Variable resolution cleanup** - [variable-resolution.ts](/Users/adam/mlld/mlld/interpreter/utils/variable-resolution.ts)
   - remove the shelf-specific `ResolutionContext.Equality` exception

2. **Executable transport cleanup**
   - verify [exec-invocation.ts](/Users/adam/mlld/mlld/interpreter/eval/exec-invocation.ts) no longer needs shelf-specific structured preservation
   - keep `preserveStructuredArgs` only where it remains a valid general executable feature

3. **Assignment/when cleanup**
   - re-evaluate [assignment-support.ts](/Users/adam/mlld/mlld/interpreter/eval/when/assignment-support.ts)
   - keep any change that is independently correct for expression evaluation
   - remove anything that was only compensating for slot-ref flattening

4. **Parameter binding**
   - ensure [parameter-factory.ts](/Users/adam/mlld/mlld/interpreter/utils/parameter-factory.ts) does not mark slot refs as complex plain objects

### Testing

- imported wrapper executable repro
- nested local wrapper repro
- `when` wrapper repro
- direct wrapper param repro

### Exit Criteria

- [ ] old shelf-specific equality/preservation hacks are removed or reduced to general-purpose behavior
- [ ] imported/wrapper slot-ref transport works without relying on wrapper-preservation paths

## Phase 4 – Regression Coverage and Docs (≈1-2 hours)

**Goal**: lock in the new model and document it.

### Tasks

1. **Tests**
   - extend [shelf.test.ts](/Users/adam/mlld/mlld/interpreter/eval/shelf.test.ts)
   - add the imported wrapper repro from Benchmark GPT as committed coverage
   - if needed, add focused helper tests near structured-value / field-access

2. **Docs**
   - update [DATA.md](/Users/adam/mlld/mlld/docs/dev/DATA.md)
   - update [08c-shelf-slots.md](/Users/adam/mlld/mlld/docs/src/atoms/security/08c-shelf-slots.md)
   - update [spec-shelf-slots.md](/Users/adam/mlld/mlld/spec-shelf-slots.md) to stop saying "not yet implemented" if touched, or at minimum document the runtime slot-ref model accurately
   - add [CHANGELOG.md](/Users/adam/mlld/mlld/CHANGELOG.md) entry

### Exit Criteria

- [ ] regression suite covers imported-wrapper slot-ref transport
- [ ] `docs/dev/DATA.md` reflects that runtime now includes capability/reference values as well as `StructuredValue`s
- [ ] changelog updated

## Testing Requirements

- `npx vitest run interpreter/eval/shelf.test.ts`
- targeted helper suites if touched:
  - `npx vitest run interpreter/utils/variable-resolution.test.ts`
  - `npx vitest run interpreter/eval/env-mcp-config.test.ts interpreter/eval/shelf-notes-injection.test.ts`
- if new focused tests are added, run those directly as well

Critical scenarios:

- [ ] wrapper executable passes slot ref through `@shelve`, `@shelve.remove`, `@shelve.clear`
- [ ] imported wrapper executable preserves slot ref
- [ ] nested local wrapper preserves slot ref
- [ ] `let @active = @slot ?? null` preserves slot ref
- [ ] `when [ @active => @shelve.clear(@active) ]` preserves slot ref
- [ ] direct field/index access on `@pipeline.recipients` still works

## Documentation Requirements

- [ ] update [DATA.md](/Users/adam/mlld/mlld/docs/dev/DATA.md)
- [ ] update [08c-shelf-slots.md](/Users/adam/mlld/mlld/docs/src/atoms/security/08c-shelf-slots.md)
- [ ] update [spec-shelf-slots.md](/Users/adam/mlld/mlld/spec-shelf-slots.md) as needed
- [ ] add `CHANGELOG.md` entry

## Overall Exit Criteria

- [ ] shelf slot refs are first-class runtime values
- [ ] imported-wrapper repro no longer fails with `The first @shelve.clear argument must be a shelf slot reference`
- [ ] no shelf-specific equality hack remains in variable resolution
- [ ] slot refs no longer rely on `StructuredValue` marker transport for correctness
- [ ] targeted tests pass
