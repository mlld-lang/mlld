# Plan: Complete Fact Requirement Resolver Alignment

## Overview

This plan closes the remaining architectural gap in the phase-1 data-layer work: `@fyi.facts(...)` discovery and fact-aware positive checks still rely on a built-in arg-name heuristic fallback in [`core/policy/fact-requirements.ts`](./core/policy/fact-requirements.ts#L133). The goal is to replace that fallback with one shared resolver that derives fact requirements from canonical operation identity, live operation metadata, built-in positive checks, and declarative fact-aware policy surfaces. The result should be a fail-closed, metadata-driven system where discovery and enforcement consume the same requirement model and cannot silently drift apart.

This plan is intentionally narrower than the full data-layer phase-1 document. It does not replan records, handles, or schema retries. It focuses only on finishing the fact-requirement design that the larger plan already assumes.

## Current State

### What Exists Today

The branch already improved the original design in three important ways:

1. `@fyi.facts(...)` no longer hardcodes arg-name mappings inline.
2. Discovery and enforcement both read from [`core/policy/fact-requirements.ts`](./core/policy/fact-requirements.ts).
3. When a real operation can be resolved, `@fyi.facts(...)` already prefers live labels and `controlArgs` metadata from [`interpreter/eval/exec/tool-metadata.ts`](./interpreter/eval/exec/tool-metadata.ts).

The key current files are:

- [`core/policy/fact-requirements.ts`](./core/policy/fact-requirements.ts)
- [`interpreter/fyi/facts-runtime.ts`](./interpreter/fyi/facts-runtime.ts)
- [`core/policy/guards.ts`](./core/policy/guards.ts)
- [`core/policy/label-flow.ts`](./core/policy/label-flow.ts)
- [`interpreter/eval/exec/tool-metadata.ts`](./interpreter/eval/exec/tool-metadata.ts)
- [`core/policy/operation-labels.ts`](./core/policy/operation-labels.ts)

### What Is Still Wrong

The remaining problem is in [`core/policy/fact-requirements.ts`](./core/policy/fact-requirements.ts#L133-L184):

- [`deriveBuiltInFactPatternsForQuery(...)`](./core/policy/fact-requirements.ts#L133-L150) still maps bare arg names to fact patterns:
  - `recipient|recipients|cc|bcc -> fact:*.email`
  - `id -> fact:*.id`
- [`deriveBuiltInFactPatternsForOperationArg(...)`](./core/policy/fact-requirements.ts#L152-L184) still falls back to that query heuristic when `op` resolution is missing or incomplete.
- [`interpreter/fyi/facts-runtime.ts`](./interpreter/fyi/facts-runtime.ts#L157-L165) still calls that built-in-only helper directly.
- [`core/policy/guards.ts`](./core/policy/guards.ts#L128-L212) and [`core/policy/label-flow.ts`](./core/policy/label-flow.ts) still consume constants and selection helpers that are not backed by a first-class requirement model.

This produces four architectural problems:

1. Discovery can still succeed from arg names alone when canonical operation context is absent.
2. Built-in policy semantics are duplicated across selectors, constants, and ad hoc helpers.
3. There is no integration point yet for declarative fact-aware policy requirements.
4. The code does not make “unresolved operation” vs “resolved operation with no requirement” distinct states.

### Why The Implementation Landed Here

The current state is a reasonable midpoint, not a coherent end state.

The implementation unified the most obvious duplication first, but stopped short of the full design because the missing pieces are real:

- canonical operation identity must be carried consistently
- operation metadata must be resolvable in discovery and enforcement contexts
- built-in positive rules need a shared requirement representation
- declarative fact-aware policy surfaces need a normalized source model
- the runtime needs an explicit fail-closed rule when `op` is unknown

Instead of building that entire resolver stack in one pass, the branch centralized the built-in patterns and left the old fallback in place so the feature remained usable while the rest of the design was unfinished.

## Goals

1. Replace arg-name-only fact derivation with one shared resolver.
2. Make `@fyi.facts(...)` fail closed when `op` cannot be resolved and no declarative requirement exists.
3. Make built-in positive checks and discovery consume the same requirement model.
4. Add a clean extension point for declarative fact-aware policy requirements.
5. Preserve current metadata-aware behavior for nonstandard control args such as `participants`.
6. Remove the remaining architectural ambiguity between:
   - unresolved operation
   - resolved operation with no fact requirement
   - resolved operation with one or more fact requirements

## Non-Goals

- Replanning the broader `record`, `handle`, or schema-validation work.
- Implementing arbitrary user guard code as a discovery source of truth.
- Reintroducing any registry or exact-value fallback.
- Changing the handle wire format.
- Solving store-addressed facts in this slice.

## Must-Read References

- [`plan-spec-data-layer-phase-1.md`](./plan-spec-data-layer-phase-1.md)
- [`spec-data-layer-v3.md`](./spec-data-layer-v3.md)
- [`core/policy/fact-requirements.ts`](./core/policy/fact-requirements.ts)
- [`interpreter/fyi/facts-runtime.ts`](./interpreter/fyi/facts-runtime.ts)
- [`core/policy/guards.ts`](./core/policy/guards.ts)
- [`core/policy/label-flow.ts`](./core/policy/label-flow.ts)
- [`interpreter/eval/exec/tool-metadata.ts`](./interpreter/eval/exec/tool-metadata.ts)
- [`core/policy/operation-labels.ts`](./core/policy/operation-labels.ts)
- [`docs/dev/TESTS.md`](./docs/dev/TESTS.md)
- [`docs/dev/DOCS.md`](./docs/dev/DOCS.md)

## Design Decisions

### 1. The Shared Resolver Must Return Structured Results, Not Bare Pattern Arrays

The current helper returns `string[] | null`, which is too weak. The replacement should return a result that distinguishes state, source, and scope.

Recommended shape:

```ts
export interface FactRequirement {
  arg: string;
  patterns: string[];
  source: 'builtin' | 'policy';
  rule?: string;
}

export interface FactRequirementResolution {
  status: 'resolved' | 'no_requirement' | 'unknown_operation';
  opRef?: string;
  requirements: FactRequirement[];
}
```

Why:

- discovery needs to know whether `[]` means “no candidates for a known op” or “you asked an unresolvable op”
- enforcement needs traceable provenance for errors and future debugging
- declarative surfaces need a place to merge with built-ins rather than replacing them

### 2. Discovery And Enforcement Must Share One Resolver, But Not Necessarily One Call Shape

The same source of truth should power both paths, but the call sites need slightly different entrypoints:

- discovery starts from `opRef + argName + env`
- enforcement often starts from live operation metadata and concrete arg values

Recommended API split:

```ts
resolveFactRequirementsForOperationArg({
  opRef,
  env,
  argName,
  policy
})

resolveFactRequirementsFromMetadata({
  opRef,
  operationMetadata,
  argName,
  policy
})
```

These should both delegate to the same internal built-in/policy merger.

### 3. Operation Identity Must Be Canonical Before Requirement Resolution Begins

The resolver should operate only on canonical `op:@...` refs. [`normalizeNamedOperationRef(...)`](./core/policy/operation-labels.ts#L22-L44) already exists and should remain the single normalization function.

Concrete rule:

- `@fyi.facts({ op: "@email.send", arg: "recipient" })` normalizes to `op:@email.send`
- unresolved or invalid refs return `unknown_operation`
- the resolver should not accept raw arg-only queries as a substitute for operation identity

### 4. Built-In Positive Checks Must Be Represented Explicitly

Today, the built-in model is smeared across:

- selector constants in [`fact-requirements.ts`](./core/policy/fact-requirements.ts#L3-L12)
- destination/target selection helpers in [`fact-requirements.ts`](./core/policy/fact-requirements.ts#L95-L131)
- positive-check enforcement in [`guards.ts`](./core/policy/guards.ts#L128-L212)

The resolver should lift those semantics into explicit built-in requirement specs.

Recommended internal representation:

```ts
interface BuiltInFactRequirementSpec {
  rule: 'no-send-to-unknown' | 'no-send-to-external' | 'no-destroy-unknown';
  opPattern: string;
  argKind: 'controlArgs' | 'target';
  patterns: string[];
}
```

This does two things:

- makes the policy surface legible
- removes the need for discovery-specific arg-name heuristics

### 5. Declarative Fact-Aware Policy Surfaces Need An Explicit Phase-1 Normalization Point

The codebase does not currently have a finished declarative fact-requirement source. That is why the implementation stopped at built-ins plus fallback.

The right move is not to wait indefinitely. It is to define a narrow normalization interface now, even if phase 1 initially feeds it only built-ins.

Recommended interface:

```ts
collectDeclarativeFactRequirements({
  policy,
  opRef,
  argName
}): FactRequirement[]
```

Phase-1 rule:

- if there is no declarative policy feature yet, this returns `[]`
- the resolver still exists and still merges built-ins + declarative
- later declarative work plugs into the same interface without changing discovery/enforcement call sites

### 6. Discovery Must Fail Closed On Unknown Operations

Once the shared resolver exists, this behavior should be explicit:

- `@fyi.facts({ arg: "recipient" })` with no `op` returns no candidates
- `@fyi.facts({ op: "op:@unknown.tool", arg: "recipient" })` returns no candidates
- the runtime must not guess from `recipient` or `id`

This is the critical behavioral change that removes the smell.

### 7. Existing Non-Tool Compatibility Fallbacks Need To Be Kept Separate From Fact Discovery

The current runtime still intentionally has some compatibility behavior in positive-check enforcement:

- [`selectDestinationArgs(...)`](./core/policy/fact-requirements.ts#L95-L123) allows first-provided-arg fallback for plain non-tool `exfil:send`
- [`selectTargetArgs(...)`](./core/policy/fact-requirements.ts#L125-L131) allows fallback to the first provided targeted arg

That behavior is about runtime operation evaluation, not discovery.

The plan should keep those concerns separate:

- arg selection compatibility may remain in enforcement if desired
- fact discovery must not reuse those fallbacks as a way to infer required fact classes

### 8. `@fyi.facts(...)` Should Continue To Use Live Operation Metadata When Available

The good part of the current implementation should stay:

- [`resolveNamedOperationMetadata(...)`](./interpreter/eval/exec/tool-metadata.ts#L238-L240) and related helpers already merge executable metadata with scoped tool definitions
- this is what allows `participants` on `createCalendarEvent` to map to email facts correctly

The new resolver should preserve this flow and make it authoritative.

## Proposed Architecture

### New Or Refactored Modules

1. **Refactor** [`core/policy/fact-requirements.ts`](./core/policy/fact-requirements.ts)
   - keep arg-selection helpers if still needed
   - remove `deriveBuiltInFactPatternsForQuery(...)`
   - replace `deriveBuiltInFactPatternsForOperationArg(...)` with structured resolver APIs

2. **Add or extend** a declarative source module
   - either in `core/policy/fact-requirements.ts`
   - or a new focused module such as `core/policy/fact-requirements-policy.ts`

3. **Refactor** [`interpreter/fyi/facts-runtime.ts`](./interpreter/fyi/facts-runtime.ts)
   - stop calling the built-in-only helper directly
   - consume `FactRequirementResolution`
   - return empty results on `unknown_operation` / `no_requirement`

4. **Refactor** [`core/policy/guards.ts`](./core/policy/guards.ts)
   - use the shared requirement resolver for positive checks where practical
   - at minimum, reuse the same requirement specs and arg-kind model

5. **Possibly extend** [`interpreter/eval/exec/tool-metadata.ts`](./interpreter/eval/exec/tool-metadata.ts)
   - if needed, add a helper that returns canonical `opRef` plus merged metadata in one object

## Implementation Phases

## Phase 1 - Introduce A Real Fact Requirement Resolution Model (≈0.5-1 day)

**Goal**: replace bare pattern-array helpers with a structured resolver contract.

### Tasks

1. **Refactor `fact-requirements.ts` into explicit resolution types**
   - [`core/policy/fact-requirements.ts`](./core/policy/fact-requirements.ts#L1-L184)
   - Add:
     - `FactRequirement`
     - `FactRequirementResolution`
     - `resolveFactRequirementsForOperationArg(...)`
     - `resolveFactRequirementsFromMetadata(...)`
   - Remove or deprecate:
     - `deriveBuiltInFactPatternsForQuery(...)`
     - `deriveBuiltInFactPatternsForOperationArg(...)`

2. **Define built-in requirement specs once**
   - same file initially
   - encode:
     - `no-send-to-unknown`
     - `no-send-to-external`
     - `no-destroy-unknown`
   - associate each with:
     - required op pattern
     - arg-selection mode
     - required fact patterns

3. **Add a declarative requirement hook**
   - even if phase 1 returns `[]`
   - ensure the resolver merges built-in + declarative output through the same path

### Testing

- Extend [`core/policy/fact-requirements.test.ts`](./core/policy/fact-requirements.test.ts)
- Add tests for:
  - resolved op + matching control arg => `resolved`
  - resolved op + nonmatching arg => `no_requirement`
  - unknown op => `unknown_operation`
  - built-in requirement specs produce the expected patterns

### Exit Criteria

- [ ] There is no arg-name-only fact-pattern helper left in the shared module.
- [ ] Fact requirements are represented as structured resolutions, not raw string arrays.
- [ ] Built-in and declarative sources have a common merge point.

**Deliverable**: one canonical fact-requirement API exists.

## Phase 2 - Move `@fyi.facts(...)` Onto The Shared Resolver And Delete Guessing (≈0.5 day)

**Goal**: make discovery strictly operation-driven and fail closed.

### Tasks

1. **Refactor discovery to use the new resolver**
   - [`interpreter/fyi/facts-runtime.ts`](./interpreter/fyi/facts-runtime.ts#L157-L165)
   - Replace direct helper call with `resolveFactRequirementsForOperationArg(...)`

2. **Delete arg-name-only discovery fallback**
   - no fallback from `recipient -> fact:*.email`
   - no fallback from `id -> fact:*.id`

3. **Make discovery status explicit**
   - `unknown_operation` => no candidates
   - `no_requirement` => no candidates
   - `resolved` => filtered candidates

4. **Preserve metadata-aware operation behavior**
   - keep [`resolveQueryOperationContext(...)`](./interpreter/fyi/facts-runtime.ts#L60-L82) or replace it with a clearer metadata resolver
   - keep nonstandard control-arg support such as `participants`

### Testing

- Extend [`interpreter/fyi/facts-runtime.test.ts`](./interpreter/fyi/facts-runtime.test.ts)
- Add tests for:
  - `@fyi.facts({ arg: "recipient" })` returns no candidates without resolved `op`
  - unknown `op` returns no candidates
  - resolved `op:@createCalendarEvent` + `participants` still returns email facts
  - resolved op with no applicable fact requirement returns no candidates

### Exit Criteria

- [ ] `@fyi.facts(...)` no longer guesses from arg names alone.
- [ ] Discovery is strictly canonical-op driven.
- [ ] Existing metadata-aware discovery behavior still works.

**Deliverable**: discovery is aligned with the intended design rather than a heuristic fallback.

## Phase 3 - Align Positive-Check Enforcement To The Same Requirement Source (≈0.5-1 day)

**Goal**: ensure enforcement and discovery consume the same semantics, not parallel approximations.

### Tasks

1. **Refactor positive-check guard paths to read shared requirement specs**
   - [`core/policy/guards.ts`](./core/policy/guards.ts#L128-L212)
   - possibly [`core/policy/label-flow.ts`](./core/policy/label-flow.ts)
   - use shared built-in requirement specs or the same resolver internals

2. **Keep arg selection separate from requirement derivation**
   - preserve compatibility behavior where needed for actual runtime calls
   - avoid reintroducing discovery heuristics through arg selectors

3. **Document the difference between operation arg selection and fact requirement derivation**
   - this distinction is easy to lose in future edits

### Testing

- Extend [`core/policy/guards-defaults.test.ts`](./core/policy/guards-defaults.test.ts)
- Extend [`core/policy/label-flow.test.ts`](./core/policy/label-flow.test.ts)
- Add tests that assert:
  - discovery and enforcement both accept `participants` for metadata-declared send tools
  - unresolved op never implies a fact requirement in discovery
  - enforcement still behaves correctly for supported positive-check built-ins

### Exit Criteria

- [ ] Discovery and enforcement read from the same fact-requirement source of truth.
- [ ] Compatibility arg-selection behavior is explicitly separated from fact derivation.
- [ ] There is no remaining duplicated built-in fact logic in the guard path.

**Deliverable**: the same operation/arg semantics drive both discovery and enforcement.

## Phase 4 - Declarative Fact-Aware Policy Surface Integration (≈1-1.5 days)

**Goal**: replace the current built-in-only resolver with the full source model the phase-1 plan calls for.

### Tasks

1. **Define the declarative fact-aware policy representation**
   - identify the correct home in policy config normalization
   - decide how operation-scoped arg requirements are expressed

2. **Normalize declarative requirements once**
   - likely in `core/policy/union.ts` normalization or a new focused helper
   - emit a stable runtime structure the resolver can consume

3. **Merge declarative and built-in requirements in the shared resolver**
   - built-ins remain the default baseline
   - declarative surfaces can add stronger or additional fact requirements

4. **Add exact behavior for conflicting requirements**
   - union vs override must be explicit
   - stricter requirement sets should win if they both apply

### Testing

- New focused tests in `core/policy/authorizations.test.ts` or a new `core/policy/fact-policy.test.ts`
- Add cases for:
  - built-in only
  - declarative only
  - built-in + declarative stronger requirement
  - unrelated declarative rule does not affect discovery

### Exit Criteria

- [ ] The resolver consumes both built-in and declarative fact requirements.
- [ ] Discovery no longer has any built-in-only special status.
- [ ] The implementation matches the design language already used in `plan-spec-data-layer-phase-1.md`.

**Deliverable**: the shared resolver is no longer a built-in-only approximation.

## Testing Requirements

Per [`docs/dev/TESTS.md`](./docs/dev/TESTS.md), this work needs both focused unit coverage and cross-feature integration coverage.

### New Or Expanded Test Files

- [`core/policy/fact-requirements.test.ts`](./core/policy/fact-requirements.test.ts)
- [`interpreter/fyi/facts-runtime.test.ts`](./interpreter/fyi/facts-runtime.test.ts)
- [`core/policy/guards-defaults.test.ts`](./core/policy/guards-defaults.test.ts)
- [`core/policy/label-flow.test.ts`](./core/policy/label-flow.test.ts)
- possibly a new focused policy-surface test file if declarative requirements land in this slice

### Required Validation Runs

At minimum:

```bash
node ./node_modules/vitest/vitest.mjs run \
  core/policy/fact-requirements.test.ts \
  interpreter/fyi/facts-runtime.test.ts \
  core/policy/guards-defaults.test.ts \
  core/policy/label-flow.test.ts --reporter=dot
```

Before merge:

```bash
node scripts/test-runner.js
npm run build
```

### Edge Cases That Must Be Locked Down

- `@fyi.facts({ arg: "recipient" })` with no `op`
- `@fyi.facts({ op: "op:@unknown.tool", arg: "recipient" })`
- metadata-declared nonstandard control args such as `participants`
- imported/scoped tools whose metadata comes from `tools` config rather than only bare executables
- `destructive:targeted` operations with and without declared control args
- built-in-only ops vs declarative-policy-augmented ops

## Documentation Requirements

Per [`docs/dev/DOCS.md`](./docs/dev/DOCS.md):

### Dev Docs

Update at least:

- [`plan-spec-data-layer-phase-1.md`](./plan-spec-data-layer-phase-1.md)
  - mark the heuristic fallback as completed/removed once done
  - reference the shared resolver explicitly
- [`docs/dev/DATA.md`](./docs/dev/DATA.md)
  - add the final fact-requirement resolution contract if that document already explains data/provenance internals

### User Docs

If phase 2 or 4 changes externally visible `@fyi.facts(...)` behavior, update atoms under:

- `docs/src/atoms/effects/`
- `docs/src/atoms/security/`
- any `@fyi` atom if one exists or is added as part of this work

Specific user-facing behavior that must be documented if it changes:

- `@fyi.facts(...)` requires canonical `op`
- bare arg-only discovery no longer guesses
- metadata-declared control args are supported

### Changelog

Only if the shipped behavior changes in a user-visible way, add a `CHANGELOG.md` entry describing:

- stricter `@fyi.facts(...)` resolution
- removal of arg-name guessing
- support for metadata-driven nonstandard control args

## Risks And Open Questions

### 1. Declarative Fact-Aware Policy Surfaces Are Still Underdefined

This is the main reason the current implementation stopped short. The plan assumes they exist conceptually, but the exact config form and normalization path still need a concrete design.

Recommendation: do not block phase 1-3 on fully shipping declarative surfaces. Add the extension point first, then integrate the concrete policy form in phase 4.

### 2. Compatibility Behavior For Plain Non-Tool Operations Needs Intentional Review

The current runtime still allows some compatibility fallback for non-tool `exfil:send` and targeted destroy arg selection. That may be acceptable for enforcement, but it should remain clearly separated from discovery.

Recommendation: keep those compatibility fallbacks where they are useful, but do not let them drive fact requirement inference.

### 3. Canonical `op` Resolution Failure UX Is A Product Choice

Failing closed is the right security posture, but `@fyi.facts(...)` returning an empty list for unknown ops may be confusing.

Recommendation: phase 1 should keep the behavior minimal and safe. If UX needs improvement later, add optional warnings or debug helpers, not new fallback semantics.

## Overall Exit Criteria

**Test Status**:
- [ ] All focused fact-requirement and `@fyi.facts(...)` tests pass
- [ ] Full suite passes via `node scripts/test-runner.js`
- [ ] Build succeeds via `npm run build`

**Validation**:
- [ ] There is no arg-name-only fact-pattern fallback left in shared runtime code
- [ ] `@fyi.facts(...)` requires canonical operation context for filtered discovery
- [ ] discovery and enforcement consume the same requirement source
- [ ] nonstandard metadata-declared control args still work
- [ ] unresolved `op` fails closed

**Documentation**:
- [ ] `plan-spec-data-layer-phase-1.md` is updated to reflect the final resolver shape
- [ ] dev docs updated if the runtime contract changed materially
- [ ] user docs updated if `@fyi.facts(...)` behavior changed

**Deliverable**: the codebase matches the design already described in the phase-1 plan: one shared fact-requirement resolver, no arg-name guessing, and a clean path for declarative fact-aware policy integration.
