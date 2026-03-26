# Plan: Complete Fact Discovery and Enforcement Alignment

## Overview

This plan finishes the remaining work on the phase-1 data-layer security model so the implementation can honestly be described as complete for its intended scope.

The current branch has already delivered the following:

- Records as a structured trust boundary
- `fact:` labels and `mx.factsources` on live values
- Opaque handles and recursive handle resolution
- `@fyi.facts({ op, arg })`
- A shared built-in fact-requirement resolver for:
  - live operation metadata (`labels`, `controlArgs`)
  - explicit built-in symbolic ops such as `op:@email.send`
- Removal of the old arg-name-only discovery fallback

The implementation is still incomplete in two important ways:

1. Declarative fact-aware policy requirements are not wired into the resolver.
   `core/policy/fact-requirements.ts` still contains a stubbed `collectDeclarativeFactRequirements()`.
2. `@fyi.facts(...)` still exposes authorization-critical literals through candidate `label` and handle `preview`.
   `interpreter/fyi/facts-runtime.ts` currently uses `asText(value)` for both.

Those two gaps mean discovery and enforcement are not fully aligned, and the handle-first boundary model is not fully realized.

This plan closes both gaps and defines what “complete” means for this feature line.

## Completion Criteria

This work is complete when all of the following are true:

- Fact requirements for a given `(op, arg)` come from one shared resolver.
- That resolver incorporates:
  - built-in requirements
  - live operation metadata
  - declarative fact-aware policy requirements
- `@fyi.facts(...)` and enforcement both consume the same resolved requirement set.
- `@fyi.facts(...)` never returns raw authorization-critical literals in candidate payloads or handle previews.
- Unknown or unresolved operations fail closed instead of guessing from arg names.
- Tests cover both discovery and enforcement paths for built-in and declarative requirements.
- Documentation describes the completed architecture without implying registry-era behavior.

## Current Code State

### Shared resolver

The current resolver lives in:

- `core/policy/fact-requirements.ts`

It already supports:

- canonical op refs such as `op:@email.send`
- built-in symbolic op requirements
- metadata-driven requirements from live operation labels and `controlArgs`
- policy-summary input

It does **not** yet support:

- any real declarative fact-aware policy source

### Discovery

Discovery lives in:

- `interpreter/fyi/facts-runtime.ts`

It already:

- canonicalizes `op`
- resolves live operation metadata when possible
- requests fact requirements through the shared resolver
- filters candidates conjunctively across requirements
- issues opaque handles through `Environment.issueHandle(...)`

It does **not** yet:

- hide raw auth-critical literals from candidate `label`
- hide raw auth-critical literals from handle `preview`
- derive display labels from record context or masked fallbacks

### Enforcement

Fact-aware enforcement currently depends on:

- `core/policy/guards.ts`
- `core/policy/fact-requirements.ts`
- `core/policy/operation-labels.ts`
- `interpreter/eval/exec/tool-metadata.ts`

Built-in positive checks and discovery are substantially more aligned than before, but declarative requirements are still absent, so the alignment is incomplete.

## Goals

- Finish the shared resolver so it is the single source of truth for `(op, arg)` fact requirements.
- Define and implement a real declarative fact-aware policy surface.
- Keep the model fail-closed.
- Remove raw-literal exposure from `@fyi.facts(...)`.
- Preserve current built-in and metadata-driven behavior.
- Keep the implementation scoped to phase-1 capabilities.

## Non-Goals

- Store-addressed facts
- Entity identity and source-handle equality
- Cross-execution handle persistence
- General-purpose policy inference from arbitrary guard code
- Reintroducing any exact-value registry or literal rebinding fallback

## Design Principles

### 1. One requirement source for discovery and enforcement

The same `(op, arg)` should never produce one requirement set in discovery and another in enforcement.

All callers must use the same resolver API, and the resolver must return a normalized requirement structure rather than raw ad hoc pattern arrays.

### 2. No arg-name guessing

Requirements must never be inferred solely from `recipient`, `id`, or similar bare arg names.

Valid requirement sources are:

- live operation metadata
- explicit built-in symbolic ops
- explicit declarative policy requirements

If none of those resolve, the system fails closed.

### 3. Handles cross the LLM boundary; literals do not

`@fyi.facts(...)` is a handle-discovery surface, not a value-echo surface.

The response must provide enough information for an LLM to choose a candidate, but not enough to encourage literal copying of authorization-critical values.

### 4. Phase-1 remains record-addressed

This plan preserves the current phase-1 fact model:

- record-addressed `fact:` labels
- `mx.factsources`

It does not introduce store-addressed facts or entity identity semantics.

## Architecture Changes

## A. Replace the declarative stub with a real normalized source

### Problem

`collectDeclarativeFactRequirements()` currently returns `[]`, so policy-driven discovery requirements do not exist.

### Required design

Introduce an explicit declarative fact-aware policy surface and normalize it into the shared resolver.

### Recommended policy shape

Add a dedicated policy section instead of overloading label-flow policy:

```json
{
  "facts": {
    "requirements": {
      "@email.send": {
        "recipient": ["fact:*.email"],
        "cc": ["fact:internal:*.email"]
      },
      "@calendar.create_event": {
        "participants": ["fact:internal:*.email"]
      },
      "@crm.delete_contact": {
        "id": ["fact:*.id"]
      }
    }
  }
}
```

Reasons:

- This is arg-scoped and op-scoped.
- It matches the shared resolver’s `(op, arg)` shape.
- It does not overload label-flow policy with a different semantic job.
- It leaves room to add richer requirement objects later without redefining the top-level surface.

### Normalized model

Extend the shared resolver to normalize declarative requirements into the same internal form used for built-ins:

- `FactRequirement`
- `source: "built_in" | "metadata" | "declarative"`
- `patterns: string[]`
- `reason`

### Merge semantics

Requirement resolution should be conjunctive:

- If built-in requirements demand `fact:*.email`
- and declarative policy demands `fact:internal:*.email`
- then a candidate must satisfy both

This matches the current filtering behavior in `facts-runtime.ts` and keeps stricter overlays narrowing the set instead of widening it.

### Files

- `core/policy/fact-requirements.ts`
- `core/policy/types.ts` or the nearest existing policy type file
- `core/policy/union.ts`
- `interpreter/env/Environment.ts` or the existing policy-summary plumbing

### Implementation steps

1. Define the policy type and normalization shape for `policy.facts.requirements`.
2. Extend policy union/summary code to preserve that data through composition.
3. Replace `collectDeclarativeFactRequirements()` with real extraction from normalized policy summary.
4. Add resolver tests for:
   - pure declarative requirements
   - built-in plus declarative overlays
   - multiple active policy fragments
   - unknown ops with no declarative entry

## B. Make enforcement consume the same resolver output

### Problem

Discovery already calls the shared resolver, but enforcement still needs an explicit pass to ensure it is sourcing fact requirements from the same normalized output once declarative policy exists.

### Required design

Every fact-aware positive check should obtain requirements through the shared resolver, not through parallel inline logic.

That means:

- resolve canonical op identity
- resolve live metadata
- resolve declarative policy requirements
- evaluate the current arg value against the combined requirement set

### Files

- `core/policy/guards.ts`
- `core/policy/fact-requirements.ts`
- `core/policy/operation-labels.ts`
- `interpreter/eval/exec/tool-metadata.ts`

### Implementation steps

1. Audit all fact-aware positive-check paths in `guards.ts`.
2. Replace any remaining local requirement derivation with calls into the shared resolver.
3. Add tests that prove:
   - discovery and enforcement accept the same candidate for the same `(op, arg)`
   - declarative overlays constrain both surfaces equally
   - unresolved ops fail closed in both surfaces

## C. Remove raw literal exposure from `@fyi.facts(...)`

### Problem

`facts-runtime.ts` currently uses `asText(value)` for:

- candidate `label`
- handle `preview`

That leaks the authorization-critical literal back to the LLM even though the handle exists specifically to avoid that boundary problem.

### Required design

Discovery must return a safe display layer:

- `handle`
- `label`
- `field`
- `fact`

`label` must be safe display text, not the raw authorization-critical literal.

### Safe display hierarchy

Use the following order:

1. Sibling display fields from the same structured candidate context:
   - `name`
   - `title`
   - `display_name`
   - `label`
2. Structured record display metadata, if phase-1 records already expose it
3. Fact-aware masked fallback derived from the leaf value:
   - email: `s***@gmail.com`
   - id: masked stable preview such as `acct…2957`
   - generic text: coarse placeholder such as `text value`

The raw value must not appear in:

- response `label`
- handle `preview`
- any companion display field returned to the LLM

### Consequence

This requires candidate enumeration to carry more context than the current leaf-only shape.

The traversal must preserve enough record context to derive a display label from sibling fields or root metadata.

### Recommended internal shape

Replace the current leaf-only candidate with a richer internal structure:

- `value`
- `field`
- `fact`
- `path`
- `root`
- `parent`
- `siblings`
- `displayLabel`

Only the final safe display fields are exposed externally.

### Files

- `interpreter/fyi/facts-runtime.ts`
- any helper extracted for candidate traversal or safe display
- `interpreter/env/Environment.ts` if handle preview metadata needs new shape

### Implementation steps

1. Refactor candidate enumeration to retain parent/sibling/root context.
2. Implement `deriveSafeFactCandidateLabel(...)`.
3. Replace raw `asText(value)` labels with safe labels.
4. Make `Environment.issueHandle(..., { preview })` use the same safe label.
5. Add tests that assert:
   - raw email is not returned in `label`
   - raw id is not returned in `label`
   - a sibling `name` becomes the label when available
   - masked fallback is used when no safe descriptive field exists

## D. Define exact failure behavior for unresolved discovery

### Problem

The system already fails closed in practice, but the contract should be explicit.

### Required design

When `@fyi.facts({ op, arg })` cannot resolve requirements because:

- `op` is missing
- `op` is unknown
- metadata is insufficient
- no declarative requirement exists

it should not guess. The MVP behavior should be:

- return `[]`
- optionally attach internal diagnostic reason for tests or trace logs

This preserves current user-facing behavior while keeping the model strict.

### Files

- `interpreter/fyi/facts-runtime.ts`
- `core/policy/fact-requirements.ts`
- tests

## E. Define canonical op identity once

### Problem

Resolver correctness depends on unambiguous operation identity across:

- local exes
- imported tools
- MCP-backed tools
- symbolic built-in discovery entries

### Required design

Phase-1 should standardize on:

- canonical symbolic form: `op:@name`

That identity must be used consistently by:

- `@fyi.facts(...)`
- operation metadata lookup
- declarative fact requirements
- enforcement

### Files

- `core/policy/operation-labels.ts`
- `interpreter/eval/exec/tool-metadata.ts`
- `interpreter/fyi/facts-runtime.ts`
- `core/policy/fact-requirements.ts`

### Implementation steps

1. Audit op normalization entry points.
2. Ensure all resolver callers normalize through one shared helper.
3. Add tests for:
   - local exe
   - imported tool
   - MCP-backed wrapper
   - symbolic built-in op

## F. Documentation and test cleanup

### Documentation

Update:

- `docs/dev/SECURITY.md`
- `docs/src/atoms/...` fact/record/handle docs if they already describe `@fyi.facts(...)`

Required documentation changes:

- fact discovery uses shared `(op, arg)` requirement resolution
- declarative fact requirements exist and are policy-driven
- `@fyi.facts(...)` returns handles plus safe labels, not raw values
- unknown ops fail closed

### Tests

Add or update coverage in:

- `core/policy/fact-requirements.test.ts`
- `interpreter/fyi/facts-runtime.test.ts`
- `core/policy/guards-defaults.test.ts`
- relevant integration cases for imported and MCP-backed tools

## Proposed Implementation Sequence

### Phase 1: Declarative requirement model

- Add policy type
- Normalize into policy summary
- Implement `collectDeclarativeFactRequirements()`
- Add unit tests

### Phase 2: Enforcement alignment

- Route all fact-aware positive checks through the shared resolver
- Add alignment tests

### Phase 3: Safe discovery payloads

- Refactor fact candidate traversal to retain record context
- Implement safe label derivation
- Remove raw literal label/preview exposure
- Add discovery output tests

### Phase 4: Canonicalization and integration hardening

- Audit op normalization
- Add imported/MCP integration coverage
- Update docs

## Risks and Mitigations

### Risk: declarative surface shape drifts from built-in semantics

Mitigation:

- Normalize all requirement sources into the same internal structure immediately
- never interpret declarative requirements directly in discovery or enforcement

### Risk: safe labels become too lossy for the model to choose correctly

Mitigation:

- prefer sibling human-readable fields when available
- use fact-aware masked fallbacks only when no descriptive field exists
- include `field` and `fact` in the payload so the model still has selection context

### Risk: imported or MCP-backed ops normalize differently

Mitigation:

- add canonical op normalization tests at the resolver boundary
- add end-to-end imported/MCP discovery cases

### Risk: policy composition drops declarative fact requirements

Mitigation:

- test merged policy fragments explicitly through policy union and environment policy summary

## Exit Checklist

- [ ] `policy.facts.requirements` is defined and normalized
- [ ] `collectDeclarativeFactRequirements()` is implemented
- [ ] discovery and enforcement both use the same resolved requirements
- [ ] no arg-name guessing remains
- [ ] `@fyi.facts(...)` does not expose raw auth-critical literals
- [ ] handle previews do not expose raw auth-critical literals
- [ ] built-in, metadata-driven, and declarative requirements are covered by tests
- [ ] imported and MCP-backed op discovery is covered by tests
- [ ] `SECURITY.md` and feature docs reflect the completed architecture
- [ ] full test suite passes

## Final Definition of Done

This work is done when fact discovery is no longer a heuristic helper layered beside enforcement, but a first-class, policy-aware, handle-first part of the security model:

- one resolver
- one `(op, arg)` contract
- no guessed requirements
- no raw literal discovery payloads
- no registry fallback
- one coherent story from record provenance to handle-based selection to fact-aware enforcement
