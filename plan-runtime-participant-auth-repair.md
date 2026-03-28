# Plan: Participant Authorization Runtime Repair

## Overview

Implement the participant-authorization fixes described in [spec-runtime-participant-auth-gaps.md](../benchmarks/spec-runtime-participant-auth-gaps.md), covering all four items:

1. element-wise array canonicalization
2. preservation of nested proof in materialized policy fragments
3. auto-lift of fact-bearing auth leaves onto the reliable handle/live-value path
4. diagnostics that distinguish "never authorized" from "compile dropped"

The historical reference to [plan-runtime-repair-safe-yes.md](./plan-runtime-repair-safe-yes.md) is architectural, not scoping. Its landed phase 1 shared repair spine and phase 2 record/fact-root work are the baseline this plan should build on. Its deferred later phases are not being reopened here.

## Current State

### Existing Architectural Baseline

The code already has the right core shape for this work:

- shared repair entry point:
  - [interpreter/security/runtime-repair.ts](./interpreter/security/runtime-repair.ts)
- centralized canonical value and proof-claim helpers:
  - [interpreter/security/canonical-value.ts](./interpreter/security/canonical-value.ts)
  - [interpreter/security/proof-claims.ts](./interpreter/security/proof-claims.ts)
- record/fact array outputs carry `fact:` labels and `mx.factsources`:
  - [interpreter/eval/records/coerce-record.ts](./interpreter/eval/records/coerce-record.ts)

Focused baseline is currently green:

- `npx vitest run interpreter/eval/exec/policy-fragment.test.ts interpreter/utils/projected-value-canonicalization.test.ts interpreter/eval/records/coerce-record.test.ts tests/interpreter/hooks/guard-pre-hook.test.ts interpreter/fyi/facts-runtime.test.ts`
- 5 files, 116 tests, all passing

### Review Findings

#### 1. Array auth repair is still all-or-nothing

- [interpreter/utils/projected-value-canonicalization.ts](./interpreter/utils/projected-value-canonicalization.ts) throws as soon as one projected string has an ambiguous exposure match.
- Its array path recurses with `Promise.all(...)`, so one ambiguous element aborts the whole array.
- [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts) catches that error and deletes the entire tool entry from `policy.authorizations.allow`.
- [interpreter/env/ProjectionExposureRegistry.ts](./interpreter/env/ProjectionExposureRegistry.ts) currently treats any duplicate exposure as ambiguous, even when all matches point to the same canonical value.

This is the direct mismatch with runtime-fix item 1.

#### 2. Variable-held policy objects can erase proof-bearing leaves before `with { policy }` compilation

- [interpreter/eval/data-values/CollectionEvaluator.ts](./interpreter/eval/data-values/CollectionEvaluator.ts) unwraps primitive `StructuredValue` leaves while building object entries.
- The same file unwraps primitive `StructuredValue` leaves while building arrays.
- That means a policy fragment built as a normal `/var` object or via object spread can already contain plain strings where the original leaves carried `fact:` labels and `mx.factsources`.

This is the likeliest source of runtime-fix item 2.

#### 3. There is no internal fact-bearing leaf to handle/live-value bridge yet

- [interpreter/utils/handle-resolution.ts](./interpreter/utils/handle-resolution.ts) only resolves explicit `{ handle: ... }` wrappers.
- [interpreter/security/runtime-repair.ts](./interpreter/security/runtime-repair.ts) currently does:
  - explicit handle resolution
  - projected alias canonicalization
  - optional same-session proof rebinding
- It does not have a step that says: "this auth leaf already carries `fact:`/`mx.factsources`; bind it to the same reliable live-value path handles use."
- The runtime already knows how to issue handles for fact-bearing leaves in FYI flows:
  - [interpreter/fyi/facts-runtime.ts](./interpreter/fyi/facts-runtime.ts)
  - [interpreter/env/ValueHandleRegistry.ts](./interpreter/env/ValueHandleRegistry.ts)

This is the gap behind runtime-fix item 3.

#### 4. Compile diagnostics already exist, but the denial path does not consume them

- [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts) already records:
  - `droppedEntries`
  - `ambiguousValues`
  - `compiledProofs`
- [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts) also injects that compile report into policy context as `authorizationsCompile`.
- But [interpreter/hooks/guard-pre-hook.ts](./interpreter/hooks/guard-pre-hook.ts) still maps missing authorization entries to plain `policy.authorizations.unlisted`.
- [interpreter/env/ContextManager.ts](./interpreter/env/ContextManager.ts) denied context only carries generic `reason`, `guardName`, and `guardFilter`.

This is the gap behind diagnostic item 4.

## Goals

- Make auth-array canonicalization element-wise instead of entry-wise.
- Keep entries when ambiguous candidates collapse to the same canonical value.
- Preserve proof-bearing leaves through variable-held and spread-built policy fragments.
- Add an internal runtime bridge from fact-bearing auth leaves to the reliable handle/live-value repair path.
- Surface when a tool was "unlisted because compile dropped it" instead of only "unlisted because never authorized."

## Non-Goals

- Reopen deferred phases from [plan-runtime-repair-safe-yes.md](./plan-runtime-repair-safe-yes.md) beyond using its landed architecture.
- Add benchmark-only policy construction wrappers.
- Require planners to emit explicit handle wrappers as the only robust array path.
- Solve every JS proof-erasure edge case outside the covered policy-fragment construction paths unless characterization proves it is necessary.

## Design Decisions

### 1. Build on the landed shared repair spine

Do not add new auth-only canonicalization logic directly inside `policy-fragment.ts` or `guard-pre-hook.ts`. Extend the shared repair layer so planner auth compilation, dispatch-time repair, and any future auth diagnostics continue to use one runtime model.

### 2. Treat array ambiguity at the element level

For each auth-array element:

- if it resolves uniquely, keep it
- if it has multiple matches that collapse to the same canonical value, keep one
- if it has multiple matches that collapse to the same fact-bearing source identity, keep one
- otherwise drop only that element and record why

The tool entry should not be deleted just because one array element is ambiguous.

### 3. Preserve structured proof-bearing leaves when materializing policy objects

`StructuredValue` leaves that carry security-relevant metadata should survive normal mlld object/array construction. Unwrapping plain metadata-free scalars is still fine, but proof-bearing leaves need to stay structured so policy compilation can use them directly.

### 4. Normalize fact-bearing auth leaves onto the reliable handle/live-value path

When a raw auth leaf already carries `fact:` or `mx.factsources`, the runtime should not depend on projected literal canonicalization to recover it. Instead:

- detect the proof-bearing leaf in the shared repair path
- bind it onto a stable live-value / issued-handle lane internally
- reuse the same downstream semantics explicit handles already use

This keeps handle wrappers as the strongest explicit syntax while removing needless fragility from fact-bearing same-session values.

### 5. Diagnostics should classify authorization absence, not just report it

The guard denial path should distinguish at least:

- `never_listed`
- `compile_dropped`
- `args_mismatch`

That classification should be available both in the immediate denial reason/rule and in ambient denied/guard context for GPT-facing debugging.

## Implementation Phases

## Phase 1 - Characterization Tests For All Four Gaps (≈0.5-1 day)

**Goal**: Add failing tests that pin the exact participant-auth regressions before changing behavior.

### Tasks

1. **Array ambiguity characterization** - [interpreter/utils/projected-value-canonicalization.test.ts](./interpreter/utils/projected-value-canonicalization.test.ts)
   - Add a mixed array where one element is uniquely canonicalizable and another is irreducibly ambiguous.
   - Add a duplicate-exposure case where multiple matches resolve to the same canonical value and should be treated as equivalent.

2. **Policy fragment proof characterization** - [interpreter/eval/exec/policy-fragment.test.ts](./interpreter/eval/exec/policy-fragment.test.ts)
   - Add coverage for array-valued auth args built from record-derived fact leaves.
   - Cover:
     - inline policy object
     - variable-held policy object
     - object-spread-built policy object
   - Assert both compiled constraint shape and compiled proof labels.

3. **Fact-bearing leaf lift characterization** - [interpreter/eval/exec/policy-fragment.test.ts](./interpreter/eval/exec/policy-fragment.test.ts)
   - Add cases where the raw auth leaf is already a fact-bearing `StructuredValue`.
   - Assert that compilation succeeds without relying on projected literal recovery.

4. **Diagnostic classification characterization** - [tests/interpreter/hooks/guard-pre-hook.test.ts](./tests/interpreter/hooks/guard-pre-hook.test.ts)
   - Add one denial where the tool was never listed.
   - Add one denial where compile dropped the entry due to ambiguity/proof loss.
   - Assert that the surfaced rule/reason distinguishes the two.

### Exit Criteria

- [ ] New tests fail on current `main`
- [ ] Failures isolate item 1, item 2/3, and item 4 separately
- [ ] No behavioral changes land before the failing coverage exists

## Phase 2 - Element-Wise Array Repair And Equivalent-Match Dedupe (≈1-1.5 days)

**Goal**: Implement runtime-fix item 1 on the shared repair path.

### Tasks

1. **Normalize equivalent projection matches** - [interpreter/env/ProjectionExposureRegistry.ts](./interpreter/env/ProjectionExposureRegistry.ts)
   - Collapse duplicate matches when they represent the same canonical value.
   - Where available, also treat same-source fact-bearing matches as equivalent.
   - Keep current fail-closed behavior for genuinely distinct matches.

2. **Make projected-value repair collection-aware** - [interpreter/utils/projected-value-canonicalization.ts](./interpreter/utils/projected-value-canonicalization.ts)
   - Replace the array `Promise.all(...)` path with element-level collection/reporting.
   - Preserve successfully repaired elements and record dropped ambiguous indexes.

3. **Extend shared repair events** - [interpreter/security/runtime-repair.ts](./interpreter/security/runtime-repair.ts)
   - Add collection-aware repair events such as:
     - canonical-equivalent ambiguity collapse
     - fact-source-equivalent ambiguity collapse
     - dropped ambiguous element

4. **Consume partial repair during auth compilation** - [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts)
   - Keep repaired array args instead of deleting the whole tool entry.
   - Only delete the tool entry when retaining it would broaden authorization beyond the repaired constraint.
   - Extend compile reporting with per-element drop detail.

### Testing

- `npx vitest run interpreter/utils/projected-value-canonicalization.test.ts interpreter/eval/exec/policy-fragment.test.ts tests/interpreter/hooks/guard-pre-hook.test.ts`

### Exit Criteria

- [ ] One ambiguous auth-array element no longer deletes the entire tool entry
- [ ] Canonical-equivalent duplicate matches collapse safely
- [ ] Irreducibly ambiguous elements remain fail-closed
- [ ] Compile report records element-level salvage/drop activity

## Phase 3 - Preserve Nested Proof In Materialized Policy Fragments (≈1 day)

**Goal**: Implement runtime-fix item 2.

### Tasks

1. **Keep proof-bearing leaves structured during collection evaluation** - [interpreter/eval/data-values/CollectionEvaluator.ts](./interpreter/eval/data-values/CollectionEvaluator.ts)
   - Stop unwrapping `StructuredValue` leaves that carry:
     - security descriptor data
     - `mx.factsources`
     - record projection metadata
   - Preserve current primitive unwrapping for plain metadata-free values.

2. **Verify policy materialization paths** - [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts)
   - Re-check:
     - `materializePolicySourceValue(...)`
     - `resolveConstraintSourceValue(...)`
     - `compileAuthorizationAttestations(...)`
   - Ensure raw nested proof is preferred when present.

3. **Cover spreads explicitly**
   - Extend policy-fragment tests so object spread preserves array leaf proof end-to-end.

### Testing

- `npx vitest run interpreter/eval/exec/policy-fragment.test.ts tests/interpreter/hooks/guard-pre-hook.test.ts interpreter/eval/records/coerce-record.test.ts`

### Exit Criteria

- [ ] Variable-held policy fragments preserve fact-bearing array leaves through compilation
- [ ] Inline, variable-held, and spread-built policy fragments behave equivalently for covered shapes
- [ ] Proof loss is no longer dependent on whether the policy was first stored in a variable

## Phase 4 - Auto-Lift Fact-Bearing Auth Leaves To Handles / Live Values (≈1 day)

**Goal**: Implement runtime-fix item 3.

### Tasks

1. **Add fact-bearing leaf lift helper** - new helper under [interpreter/security](./interpreter/security)
   - Detect auth leaves that already carry `fact:` or `mx.factsources`.
   - Bind them onto a stable live-value or issued-handle path before literal canonicalization is needed.

2. **Reuse or issue internal handles for fact-bearing leaves**
   - Extend [interpreter/env/ValueHandleRegistry.ts](./interpreter/env/ValueHandleRegistry.ts) only if needed for stable intra-execution reuse keyed by fact-bearing source identity.
   - Otherwise issue ephemeral internal handles and immediately reuse the normal handle-resolution path.

3. **Integrate into shared repair** - [interpreter/security/runtime-repair.ts](./interpreter/security/runtime-repair.ts)
   - Order the steps so fact-bearing leaves can bypass fragile literal recovery when already source-identified.
   - Keep projected literal canonicalization as fallback, not as the only path.

4. **Use in policy compilation** - [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts)
   - Compile fact-bearing leaves through the new lift path before final clause normalization/proof extraction.

### Testing

- `npx vitest run interpreter/eval/exec/policy-fragment.test.ts tests/interpreter/hooks/guard-pre-hook.test.ts interpreter/fyi/facts-runtime.test.ts`

### Exit Criteria

- [ ] Fact-bearing auth leaves compile robustly without relying on projected literal canonicalization
- [ ] Explicit handle wrappers still work unchanged
- [ ] The internal lift path does not broaden authorization beyond the original fact-bearing value

## Phase 5 - Distinguish Never-Listed From Compile-Dropped Denials (≈0.5-1 day)

**Goal**: Implement diagnostic item 4.

### Tasks

1. **Add authorization denial classification helper**
   - Read `authorizationsCompile` from policy context.
   - Determine whether the current operation is:
     - never listed
     - compile dropped
     - present but mismatched

2. **Use classification in guard policy denial** - [interpreter/hooks/guard-pre-hook.ts](./interpreter/hooks/guard-pre-hook.ts)
   - When `evaluatePolicyAuthorizationDecision(...)` returns `unlisted`, consult compile report for the current tool.
   - Surface a distinct rule/reason for compile-dropped cases, for example `policy.authorizations.compile_dropped`.

3. **Thread richer denied context if needed** - [interpreter/env/ContextManager.ts](./interpreter/env/ContextManager.ts), [interpreter/eval/guard-denial-handler.ts](./interpreter/eval/guard-denial-handler.ts)
   - Extend denied/guard context so GPT-facing handlers can inspect the authorization classification and relevant compile details.

### Testing

- `npx vitest run tests/interpreter/hooks/guard-pre-hook.test.ts interpreter/eval/guard-denial-handler.test.ts`

### Exit Criteria

- [ ] A never-listed tool still reports `unlisted`
- [ ] A compile-dropped tool reports a distinct compile-drop classification
- [ ] Denied/guard context exposes enough detail for GPT-side debugging

## Overall Validation

- [ ] Focused auth/proof suites pass
- [ ] Full relevant suite passes before merge:
  - `npx vitest run interpreter/eval/exec/policy-fragment.test.ts interpreter/utils/projected-value-canonicalization.test.ts interpreter/eval/records/coerce-record.test.ts tests/interpreter/hooks/guard-pre-hook.test.ts interpreter/fyi/facts-runtime.test.ts`
- [ ] `npm run build` passes
- [ ] Developer docs updated with one array-valued auth example and the new compile-drop diagnostic behavior

## Deferred Follow-Up

- Any broader JS proof-preservation work beyond the policy-fragment construction paths covered here
- Any revisiting of deferred non-priority phases from [plan-runtime-repair-safe-yes.md](./plan-runtime-repair-safe-yes.md)
