# Plan: Same-Session Authorization Attestation Compilation

## Overview

This plan implements the stronger planner-to-worker trust handoff for `with { policy }` authorizations:

- when a planner pins an authorization value from a live attested value in the same mlld session, the policy compiler captures that attestation at compile time
- the compiled authorization carries the verified attestation internally
- when the worker later matches that authorization, the runtime projects the attestation onto the matched arg for that call only

This keeps the runtime attestation model intact, preserves value-scoped trust, and avoids ambient trust smearing. It also avoids making planner/host JSON authors hand-maintain an explicit `attestations` field for the same-session case.

The primary target is same-session compilation from live values and refs. Cross-session planner/worker handoff remains a separate problem. The fallback option, if benchmark utility still requires it, is narrower and weaker: a matched pinned authorization auto-projects bare `known` for the current call. That fallback is explicitly not the main path in this plan.

## Must-Read References

- [spec-attestations.md](./spec-attestations.md)
- [docs/dev/TESTS.md](./docs/dev/TESTS.md)
- [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts)
- [core/policy/authorizations.ts](./core/policy/authorizations.ts)
- [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts)
- [tests/interpreter/hooks/guard-pre-hook.test.ts](./tests/interpreter/hooks/guard-pre-hook.test.ts)
- [interpreter/eval/env-mcp-config.test.ts](./interpreter/eval/env-mcp-config.test.ts)
- [core/types/security.ts](./core/types/security.ts)
- [cli/mcp/FunctionRouter.ts](./cli/mcp/FunctionRouter.ts)
- [docs/src/atoms/config/07b-policy--authorizations.md](./docs/src/atoms/config/07b-policy--authorizations.md)
- [docs/src/atoms/effects/07b-labels--attestations.md](./docs/src/atoms/effects/07b-labels--attestations.md)
- [spec-data-layer-v2.md](./spec-data-layer-v2.md)

## Current State

- The runtime already has the attestation model needed for the long-term design: attestation is separate from taint, native tool calls use exact-value attestation rebinding, and managed positive checks read attestation rather than ambient conversation labels.
- The `with { policy }` compiler already has a partial same-session path. In [policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts), `compileAuthorizationAttestations()` resolves pinned auth values against the live environment and copies attestation labels from the resolved value's descriptor onto normalized authorization clauses.
- Runtime dispatch already consumes those compiled clause attestations. [authorizations.ts](./core/policy/authorizations.ts) returns `matchedAttestations`, and [exec-invocation.ts](./interpreter/eval/exec-invocation.ts) projects them onto the current call's arg descriptors before pre-guards run.
- Existing tests already cover part of the intended behavior:
  - same-session pinned `@approvedRecipient` with `known` can satisfy `no-send-to-unknown`
  - unattested pinned values do not
  - native tool calls can satisfy positive checks when an explicit JSON `attestations` field is present
- The user-facing docs still describe explicit auth-carried `attestations` as the planner/worker bridge format. That is not the desired UX for the same-session path.

## Goal

Make same-session authorization compilation authoritative and ergonomic:

1. Planner-authored same-session refs and expressions compile trusted attestation automatically.
2. Worker dispatch reuses that compiled trust only when the authorization actually matches.
3. Raw planner JSON does not need a user-authored `attestations` field for the same-session case.
4. The long-term attestation architecture remains intact.

## Non-Goals

- Implementing Data Layer v2 or making `record`/`fact:` a prerequisite.
- Solving arbitrary cross-session trust handoff for raw JSON emitted outside the current mlld session.
- Auto-minting `known:*` from a raw pin with no compile-time proof.
- Replacing the attestation model with a simpler “authorization is trust” shortcut.
- Removing the internal ability to carry attestation on normalized authorization clauses.

## Design Decisions

### Locked Decisions

1. **Same-session compilation is the primary trust handoff path.**
   - A pinned authorization expression that resolves to a live attested value in the current session carries that attestation forward.
   - This is the canonical “strong” path.

2. **The runtime attestation model stays.**
   - `known` / `known:*` remain attestations, not ordinary ambient labels.
   - Runtime enforcement continues to read attestation from current arg descriptors.

3. **Authorization compiles proof, not just obligation.**
   - The compiler may derive that a later rule needs `known`.
   - It only records attestation when the pinned source value actually carried that attestation at compile time.

4. **The same-session path must not require user-authored `attestations` in JSON.**
   - Planner code using live refs like `recipient: @approvedRecipient` should compile automatically.
   - The explicit `attestations` field becomes internal/legacy compatibility, not the documented primary UX.

5. **Projection stays per-call and per-matched-arg.**
   - Compiled authorization trust is applied only to the arg that matched, on that invocation.
   - It never seeds the conversation-wide attestation index.

6. **Only the `known` namespace participates in this rollout.**
   - Same-session compile-time capture should preserve `known` and `known:*`.
   - Taint labels stay out of authorization inheritance.

7. **Data Layer v2 is not a prerequisite.**
   - It may become the richer future source of attestations, but this implementation stands on current descriptor/attestation plumbing.

## Relationship to Data Layer v2

Data Layer v2 is relevant future work, not a blocker.

- [spec-data-layer-v2.md](./spec-data-layer-v2.md) would make trust more granular and source-specific through `record`, `store`, and `fact:` labels.
- This plan does not require that machinery because the current runtime can already resolve live values, inspect their security descriptors, and compile attestation into normalized authorization clauses.
- If Data Layer v2 ships later, the same compile-time mechanism should consume richer attestation/provenance from those values rather than replacing this path.

## Target UX

### Desired same-session authoring

```mlld
var known @approvedRecipient = "mark@example.com"

var @taskPolicy = {
  defaults: { rules: ["no-send-to-unknown"] },
  operations: { "exfil:send": ["tool:w"] },
  authorizations: {
    allow: {
      send_email: {
        args: {
          recipient: @approvedRecipient
        }
      }
    }
  }
}
```

This should compile to an internal normalized authorization clause that carries `known`, without the planner needing to write `attestations: ["known"]`.

### Non-goal behavior

```mlld
var @approvedRecipient = "mark@example.com"
```

If the value itself was unattested at compile time, the authorization should not silently gain `known`. The later worker call should still fail `no-send-to-unknown`.

## Phase 0 - Baseline and Contract Freeze (≈0.5 day)

**Goal**: Freeze the semantics before changing code or docs.

### Tasks

1. Confirm that same-session compile-time capture is the intended primary path and the “matched pin => bare `known`” rule is only a fallback.
2. Freeze the attestation namespace for this rollout as `known` / `known:*`.
3. Record the current baseline suites for the touched subsystems:
   - [tests/interpreter/hooks/guard-pre-hook.test.ts](./tests/interpreter/hooks/guard-pre-hook.test.ts)
   - [interpreter/eval/env-mcp-config.test.ts](./interpreter/eval/env-mcp-config.test.ts)
   - [core/policy/authorizations.test.ts](./core/policy/authorizations.test.ts)
   - a new focused test file for [policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts)
4. Decide whether the explicit `attestations` JSON field remains accepted as a compatibility path or is rejected for planner-authored fragments. My recommendation is: keep it accepted internally for now, but remove it from primary docs.

### Testing

- Run the targeted baseline suites above.
- Run `npm test` once before implementation starts.

### Exit Criteria

- [ ] Same-session compile-time capture is frozen as the primary design.
- [ ] Explicit JSON `attestations` compatibility decision is frozen.
- [ ] Baseline suites are identified.
- [ ] `npm test` passes before Phase 1 begins.

**Deliverable**: The implementation contract is stable.

## Phase 1 - Make Compile-Time Capture Explicit and Tested (≈1 day)

**Goal**: Treat [policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts) as a first-class same-session compiler stage, not an incidental helper.

### Tasks

1. **Refactor compile-time capture into explicit units** - [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts)
   - Split the current helper into clearly named pieces:
     - resolve raw constraint source value from the planner env
     - extract relevant attestation labels from the resolved value
     - apply compiled attestation to normalized clauses
   - Keep AST-aware handling so `recipient: @approvedRecipient` and `oneOf: [@a, @b]` preserve access to the live source values.

2. **Narrow the captured labels** - [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts) and [core/types/security.ts](./core/types/security.ts)
   - Compile only attestation labels from the `known` namespace.
   - Do not copy taint labels or unrelated `mx.labels` values into authorization clauses.

3. **Make same-session source resolution authoritative**
   - Ensure the compiler prefers the live source expression/variable over already-flattened JSON when both are available.
   - Preserve existing behavior for `eq` and `oneOf`.

4. **Clarify internal representation** - [core/policy/authorizations.ts](./core/policy/authorizations.ts)
   - Keep clause-level `attestations` / `oneOfAttestations` internal storage.
   - Document in code comments that this is compiled internal proof, not the primary user-facing input surface.

### Tests To Add

1. **New unit tests for policy compilation**
   - Add `interpreter/eval/exec/policy-fragment.test.ts`.
   - Cover:
     - pinned variable with `known` compiles `attestations: ["known"]`
     - pinned variable with `known:internal` compiles that stronger attestation
     - raw unattested literal compiles no attestation
     - `oneOf` preserves per-candidate attestation arrays
     - taint labels are not copied into authorization clauses

2. **Extend authorization unit tests**
   - In [core/policy/authorizations.test.ts](./core/policy/authorizations.test.ts), add cases showing matched compiled attestations are returned for `eq` and `oneOf`.

### Testing

- Run the new `policy-fragment` unit tests.
- Run [core/policy/authorizations.test.ts](./core/policy/authorizations.test.ts).
- Run `npm test`.

### Exit Criteria

- [ ] Same-session source resolution is explicit and covered by unit tests.
- [ ] Only attestation labels in the `known` namespace are compiled into authorization clauses.
- [ ] `eq` and `oneOf` both preserve compiled attestation correctly.
- [ ] `npm test` passes before Phase 2 begins.

**Deliverable**: Same-session authorization compilation is explicit, narrow, and unit-tested.

## Phase 2 - Make Dispatch Reuse the Compiled Proof Reliably (≈1 day)

**Goal**: Runtime dispatch projects compiled authorization attestations onto matched args on every relevant path.

### Tasks

1. **Keep matched-attestation flow narrow and deterministic** - [core/policy/authorizations.ts](./core/policy/authorizations.ts)
   - Preserve `matchedAttestations` on successful clause match.
   - Ensure only the matched clause candidate contributes attestations.

2. **Keep projection per-call, per-arg** - [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts)
   - Preserve the current merge into arg descriptors before pre-guards run.
   - Confirm this path never mutates conversation-wide attestation state.

3. **Characterize the worker path**
   - Add a small focused comment and, if useful, a helper around authorization-attestation projection so future refactors do not accidentally move it after guard evaluation.

### Tests To Add

1. **Guard/runtime tests**
   - Extend [tests/interpreter/hooks/guard-pre-hook.test.ts](./tests/interpreter/hooks/guard-pre-hook.test.ts) with:
     - same-session `known:*` propagation satisfying a stronger rule if such a rule is already present, or at minimum preserving the stronger attestation on the arg descriptor
     - `oneOf` with one attested and one unattested candidate
     - same-session pinned ref allowed, raw unattested variable denied

2. **Native tool path tests**
   - Replace the current explicit-JSON attestation coverage in [interpreter/eval/env-mcp-config.test.ts](./interpreter/eval/env-mcp-config.test.ts) with the same-session planner-ref path as the primary test.
   - Keep one compatibility test for explicit `attestations` only if Phase 0 keeps that syntax accepted.

### Testing

- Run [tests/interpreter/hooks/guard-pre-hook.test.ts](./tests/interpreter/hooks/guard-pre-hook.test.ts).
- Run [interpreter/eval/env-mcp-config.test.ts](./interpreter/eval/env-mcp-config.test.ts).
- Run adjacent bridge suites if needed:
  - `interpreter/env/executors/function-mcp-bridge.test.ts`
  - `interpreter/env/executors/call-mcp-config.test.ts`
- Run `npm test`.

### Exit Criteria

- [ ] Worker dispatch reuses compiled attestation without any user-authored JSON attestation field.
- [ ] Same-session native tool calling honors the compiled proof.
- [ ] No projection leaks into conversation-wide attestation state.
- [ ] `npm test` passes before Phase 3 begins.

**Deliverable**: Same-session planner trust survives through worker dispatch on real tool-call paths.

## Phase 3 - Simplify the User-Facing Authorization Surface (≈0.5 day)

**Goal**: Make docs and examples describe the real primary UX instead of the internal transport format.

### Tasks

1. **Policy authorizations docs** - [docs/src/atoms/config/07b-policy--authorizations.md](./docs/src/atoms/config/07b-policy--authorizations.md)
   - Rewrite the “planner-pinned values can also carry attestation requirements” section.
   - Replace the explicit JSON `attestations` example with same-session pinned refs and live values.
   - Clearly separate:
     - same-session automatic compile-time inheritance
     - cross-session raw JSON, which still lacks proof unless future work or host-side compilation bridges it
   - If compatibility support remains, mention explicit `attestations` only as an advanced/internal bridge, not the normal planner UX.

2. **Attestations docs** - [docs/src/atoms/effects/07b-labels--attestations.md](./docs/src/atoms/effects/07b-labels--attestations.md)
   - Clarify that `with { policy }` authorizations compile attestation automatically from live same-session values.
   - Clarify that raw literals do not gain attestation just by being pinned.

3. **Doc examples and fixture extraction**
   - Rebuild docs fixtures with `npm run build:fixtures`.
   - Add expectations for any newly executable doc blocks per [docs/dev/TESTS.md](./docs/dev/TESTS.md).

### Tests To Add

1. **Fixture coverage**
   - Add a valid feature fixture under `tests/cases/feat/policy/` for same-session pinned attested authorization allowing a later write.
   - Add an exception fixture under `tests/cases/exceptions/security/` for same-session pinned unattested literal/ref being denied by a positive rule.
   - If a docs block becomes executable, capture its `expected.md`.

### Testing

- Run the new feature and exception fixtures.
- Run `npm run build:fixtures`.
- Run any affected `npm run doc:expect -- ...` commands.
- Run `npm test`.

### Exit Criteria

- [ ] `docs/src/atoms` reflects the intended same-session UX.
- [ ] Feature and exception fixtures exist for the planner-ref path.
- [ ] Documentation fixtures rebuild cleanly.
- [ ] `npm test` passes.

**Deliverable**: The documented planner UX matches the implemented same-session behavior.

## Phase 4 - Optional Tightening and Follow-On Decisions (deferred)

These are not required to ship the same-session path, but should be decided explicitly after the main rollout.

### Option A - Remove or de-emphasize explicit JSON `attestations`

- If compatibility is no longer needed, reject user-authored `attestations` in policy fragments and reserve them for internal normalized form only.
- If compatibility remains useful, keep parsing but remove it from primary docs and examples.

### Option B - Fallback if same-session coverage is insufficient

If benchmark utility still needs broader planner trust and the team accepts the planner as the trust anchor, the fallback is:

- when a pinned authorization matches a control arg at dispatch time, synthesize bare `known` on that matched arg for that call only
- do not seed conversation-wide attestation state
- do not auto-mint `known:*`

This fallback is weaker than same-session compile-time proof and should only ship as an explicit follow-on decision.

### Option C - Richer future source of proof

- Data Layer v2 can later provide more structured, source-specific attestations via `record` / `fact:` / `store`.
- The compile-time mechanism in this plan should consume that richer metadata rather than being replaced by it.

## Recommended Implementation Order

1. Add focused `policy-fragment` unit tests first.
2. Refactor and narrow compile-time capture in [policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts).
3. Tighten runtime projection assertions in [authorizations.ts](./core/policy/authorizations.ts) and [exec-invocation.ts](./interpreter/eval/exec-invocation.ts).
4. Replace native-tool integration coverage so same-session refs are the primary tested planner path.
5. Update `docs/src/atoms` and fixtures.

## Success Criteria

- Planner-authored same-session refs like `recipient: @approvedRecipient` automatically carry `known` or `known:*` into the compiled authorization when the source value was attested.
- Raw unattested pins do not satisfy positive checks.
- Worker dispatch inherits compiled trust only for matched args on that invocation.
- Native tool-calling and normal exe paths both honor the compiled proof.
- The primary docs no longer tell users to hand-author `attestations` for the same-session case.
