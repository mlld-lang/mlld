# Plan: Record Trust Refinement

## Overview

This plan implements the behavior described in [`spec-record-trust-refinement.md`](./spec-record-trust-refinement.md): when an `untrusted` exe result is coerced through `=> record`, fact fields should stop inheriting `untrusted` while data fields keep it. The goal is to make record classification act as a real trust boundary instead of minting `fact:` labels that still lose to coarse exe-level taint.

The work is smaller than the broader data-layer plans, but it crosses three sensitive layers at once: record shaping, field access/provenance materialization, and exec-result finalization. The implementation has to preserve existing negative checks on genuinely untrusted content while allowing fact-bearing args to pass `no-untrusted-destructive` without privileged overrides.

## Current State

### Relevant Code Paths

- [`interpreter/eval/records/coerce-record.ts#L376`](./interpreter/eval/records/coerce-record.ts#L376) shapes record objects, mints `fact:` labels into namespace metadata, and attaches projection/factsource metadata.
- [`interpreter/utils/field-access.ts#L1102`](./interpreter/utils/field-access.ts#L1102) merges parent provenance with field metadata when a record field is accessed.
- [`interpreter/eval/exec-invocation.ts#L2336`](./interpreter/eval/exec-invocation.ts#L2336) applies `definition.outputRecord`, then later merges `resultSecurityDescriptor` back onto the final result at [`interpreter/eval/exec-invocation.ts#L2391`](./interpreter/eval/exec-invocation.ts#L2391).
- [`interpreter/utils/structured-value.ts#L724`](./interpreter/utils/structured-value.ts#L724) extracts security descriptors from structured values, but today it returns the wrapper descriptor directly even in recursive mode.

### Why The Current Behavior Is Wrong

Today, record coercion only adds field-local fact labels. It does not refine inherited taint.

That creates two concrete problems:

1. The record wrapper keeps the exe-level `untrusted` descriptor.
2. Field access merges that wrapper descriptor into every child field.

So a fact field like `recipient` ends up with both:

- `fact:@transaction.recipient`
- `untrusted`

That is exactly the contradiction the spec calls out. The record says the source is authoritative for that field, but the runtime still blocks it as if the field were only content.

### Existing Architectural Constraint

The runtime currently depends on record wrapper descriptors for whole-value security checks. Because [`extractSecurityDescriptor(...)`](./interpreter/utils/structured-value.ts#L724) does not recurse through structured children once it hits a `StructuredValue`, simply stripping `untrusted` off the wrapper would create false negatives for whole-object flows unless recursive extraction is upgraded in the same change.

## Spec Review

### Clarification 1: Root Record Security Semantics Must Be Explicit

The spec is clear about field behavior, but it does not define what `@record.mx.labels` should show on the record object itself after refinement.

Recommended implementation rule:

- The record wrapper should keep non-`untrusted` inherited labels and provenance.
- `untrusted` should be reintroduced only on data fields, or on all fields when the record is demoted to data.
- Enforcement that cares about whole objects must use recursive extraction so child taint still surfaces.

Without this, either:

- fact fields keep getting re-tainted from the parent, or
- whole-object policy checks silently stop seeing untrusted content.

### Clarification 2: Phase 1 Scope Should Stay On Exe-Boundary Record Coercion

The spec says refinement applies to `untrusted` labels inherited from the exe. That is the right scope for this change.

Recommended phase-1 boundary:

- implement only the `ExecutableDefinition.outputRecord` path in [`interpreter/eval/exec-invocation.ts#L2336`](./interpreter/eval/exec-invocation.ts#L2336)
- do not broaden semantics for hypothetical future `@value as record` / generic record-cast paths unless those are already wired

This keeps the trust decision tied to an explicit boundary where the runtime knows the taint came from an exe, not from a later guard or manual relabel.

### Clarification 3: Validation Docs Already Drift From Runtime Behavior

[`docs/src/atoms/core/31-records--basics.md`](./docs/src/atoms/core/31-records--basics.md) currently says `validate: "demote"` means “invalid fields become data, rest stays valid.” The implementation in [`interpreter/eval/records/coerce-record.ts#L437`](./interpreter/eval/records/coerce-record.ts#L437) already demotes the whole record when validation errors exist, and the new spec matches that whole-record behavior.

This should be corrected while touching the docs for trust refinement.

## Goals

1. Fact fields from `exe untrusted ... => record` no longer carry inherited `untrusted`.
2. Data fields from the same record still carry inherited `untrusted`.
3. `when => data`, `validate: "demote"`, and invalid dropped/demoted fields preserve `untrusted` and do not mint fact labels.
4. Whole-object security checks still see taint when a record contains untrusted data fields.
5. Post-coercion overrides still win: if a later guard or action adds `untrusted`, fact fields become untrusted again on access.
6. Non-record exec outputs keep existing behavior.

## Non-Goals

- Refining labels other than `untrusted`
- Changing `trusted!` / privileged label-removal semantics
- Replanning handles, projections, or store-addressed facts
- Broadening refinement to generic non-exe record coercion
- Changing positive-check rule semantics (`no-send-to-unknown`, `no-destroy-unknown`, etc.)

## Must-Read References

- [`spec-record-trust-refinement.md`](./spec-record-trust-refinement.md)
- [`interpreter/eval/records/coerce-record.ts`](./interpreter/eval/records/coerce-record.ts)
- [`interpreter/utils/field-access.ts`](./interpreter/utils/field-access.ts)
- [`interpreter/utils/structured-value.ts`](./interpreter/utils/structured-value.ts)
- [`interpreter/eval/exec-invocation.ts`](./interpreter/eval/exec-invocation.ts)
- [`docs/dev/TESTS.md`](./docs/dev/TESTS.md)
- [`docs/dev/DOCS.md`](./docs/dev/DOCS.md)

## Design Decisions

### 1. Strip Only Inherited `untrusted` From The Record Wrapper

Do not remove other labels or provenance.

Recommended rule:

- inherited `src:*`, tool provenance, `trusted`, `secret`, `pii`, and fact-independent labels remain on the wrapper
- only inherited `untrusted` is removed from the wrapper-level descriptor

This preserves provenance and avoids overloading the feature into a general “clean this value” mechanism.

### 2. Reintroduce `untrusted` At Field Level Through Namespace Metadata

Record coercion should write field-local descriptors into namespace metadata:

- fact field: fact label only
- data field: `untrusted` delta
- demoted field / whole-record demotion: `untrusted` delta, no fact label

This works with the existing merge order in [`interpreter/utils/field-access.ts#L1104`](./interpreter/utils/field-access.ts#L1104):

- initial wrapper-level `untrusted` is absent, so fact fields stay clean
- data fields explicitly add `untrusted`
- if a later step adds `untrusted` to the parent wrapper, field access merges that current parent descriptor and fact fields become untrusted again

That last point is important. It is how the implementation satisfies the spec’s “post-coercion override wins” requirement without inventing a separate privilege system for records.

### 3. Recursive Descriptor Extraction Must Inspect Structured Children

If the record wrapper stops carrying inherited `untrusted`, then recursive extraction must be able to see:

- namespace-metadata descriptors on record fields
- array children of record outputs
- nested structured children where applicable

Recommended change:

- update [`extractSecurityDescriptor(...)`](./interpreter/utils/structured-value.ts#L724) so `recursive: true` merges wrapper metadata with child descriptors for structured arrays and structured objects
- for record objects, materialize children using namespace metadata rather than bare raw values

This is the key correctness guardrail for whole-object flows.

### 4. Exec Finalization Must Not Re-Taint The Refined Wrapper

[`interpreter/eval/exec-invocation.ts#L2391`](./interpreter/eval/exec-invocation.ts#L2391) currently merges `resultSecurityDescriptor` back onto the final structured result after record coercion. If left unchanged, that will reattach `untrusted` to the wrapper and undo the feature.

Recommended rule:

- when `definition.outputRecord` is active, compute the descriptor once for record coercion
- sanitize the wrapper-level descriptor before attaching it post-coercion
- keep the existing final merge path unchanged for non-record outputs

## Implementation Phases

## Phase 1 – Add Field-Level Trust Refinement Model (≈0.5 day)

**Goal**: Teach record coercion how to split inherited exe taint into wrapper-level and field-level pieces.

### Tasks

1. Add a reusable descriptor helper for removing one or more labels from both `labels` and `taint`.
   - Target: [`core/types/security.ts`](./core/types/security.ts)
   - The repo already has a local `stripTrustedFromDescriptor(...)` in [`interpreter/eval/exec-invocation.ts#L192`](./interpreter/eval/exec-invocation.ts#L192). This work will need the same operation for `untrusted`, and the helper should live in one place.

2. Extend record coercion to accept the inherited exec descriptor explicitly.
   - Target: [`interpreter/eval/records/coerce-record.ts#L376`](./interpreter/eval/records/coerce-record.ts#L376), [`interpreter/eval/records/coerce-record.ts#L496`](./interpreter/eval/records/coerce-record.ts#L496)
   - `coerceRecordOutput(...)` should take an optional inherited descriptor and pass it down to `coerceRecordObject(...)`.

3. Split record security into wrapper descriptor plus field deltas.
   - Target: [`interpreter/eval/records/coerce-record.ts#L440`](./interpreter/eval/records/coerce-record.ts#L440)
   - Wrapper descriptor:
     - inherited descriptor with `untrusted` removed
   - Field namespace descriptor:
     - fact field: fact label only
     - data field: `untrusted` when inherited descriptor had it
     - whole-record demotion (`when => data` or `validate: "demote"` error): all fields get the data-field path
   - Preserve factsources and projection metadata exactly as today.

4. Ensure parse-failure fallback remains fail-closed.
   - Target: [`interpreter/eval/records/coerce-record.ts#L507`](./interpreter/eval/records/coerce-record.ts#L507)
   - If record parsing fails and the runtime falls back to text, do not refine trust. Keep current behavior.

### Testing

- Extend [`interpreter/eval/records/coerce-record.test.ts`](./interpreter/eval/records/coerce-record.test.ts) with direct unit tests for:
  - inherited `untrusted` on fact vs data fields
  - `when => data`
  - `validate: "demote"`
  - `validate: "drop"`
  - extra inherited labels such as `src:mcp`

### Exit Criteria

- [ ] Record coercion can accept an inherited descriptor
- [ ] Fact fields no longer receive inherited `untrusted`
- [ ] Data and demoted fields still receive inherited `untrusted`
- [ ] Non-trust inherited labels survive on the wrapper

## Phase 2 – Wire Exec Output Records Into The Refinement Boundary (≈0.5 day)

**Goal**: Apply refinement exactly at the `exe ... => record` boundary and avoid re-tainting afterward.

### Tasks

1. Compute the record-boundary inherited descriptor before coercion.
   - Target: [`interpreter/eval/exec-invocation.ts#L2336`](./interpreter/eval/exec-invocation.ts#L2336)
   - The descriptor should capture the same security information the runtime would otherwise attach to the raw result:
     - local execution descriptor
     - result value descriptor from the raw exe output

2. Pass the inherited descriptor into `coerceRecordOutput(...)`.
   - Target: [`interpreter/eval/exec-invocation.ts#L2348`](./interpreter/eval/exec-invocation.ts#L2348)

3. Sanitize the post-coercion wrapper merge.
   - Target: [`interpreter/eval/exec-invocation.ts#L2391`](./interpreter/eval/exec-invocation.ts#L2391)
   - For record outputs, do not blindly merge back the full `untrusted` descriptor onto the wrapper after coercion.
   - Preserve existing behavior for non-record outputs.

4. Keep the current `trusted` conflict handling unchanged.
   - Target: [`interpreter/eval/exec-invocation.ts#L181`](./interpreter/eval/exec-invocation.ts#L181)
   - Trust refinement should not rewrite the existing “prefer untrusted over trusted” return conflict rules outside the record boundary.

### Testing

- Extend [`interpreter/eval/exec-invocation.structured.test.ts`](./interpreter/eval/exec-invocation.structured.test.ts) with:
  - `exe untrusted @getContact() = ... => contact`
  - field assertions:
    - fact field has `fact:*` and no `untrusted`
    - data field has `untrusted`
  - multi-label assertion:
    - `exe untrusted, src:mcp @getContact()` preserves `src:mcp` on fact fields

### Exit Criteria

- [ ] `definition.outputRecord` passes a boundary descriptor into record coercion
- [ ] Record outputs no longer get re-tainted at the wrapper level by the final merge path
- [ ] Non-record exec results behave exactly as before

## Phase 3 – Preserve Whole-Object Security Semantics (≈0.5 day)

**Goal**: Make recursive extraction see refined child descriptors so object-level policy checks remain correct.

### Tasks

1. Update structured recursive extraction.
   - Target: [`interpreter/utils/structured-value.ts#L724`](./interpreter/utils/structured-value.ts#L724)
   - When `recursive: true` and the value is a `StructuredValue`, merge:
     - wrapper metadata descriptor
     - child descriptors from arrays/objects
     - namespace-metadata descriptors for record fields

2. Extract or share namespace-child materialization logic if needed.
   - Candidate targets:
     - [`interpreter/utils/structured-value.ts`](./interpreter/utils/structured-value.ts)
     - [`interpreter/utils/session-proof-matching.ts`](./interpreter/utils/session-proof-matching.ts)
   - The repo already has namespace-metadata child materialization in session-proof matching. If the recursive extractor needs the same logic, move it into a shared helper instead of duplicating it.

3. Keep field access merge order intact and prove post-coercion overrides still win.
   - Target: [`interpreter/utils/field-access.ts#L1104`](./interpreter/utils/field-access.ts#L1104)
   - The intended behavior is:
     - initial inherited `untrusted` does not hit fact fields
     - later parent-level `untrusted` does hit fact fields

### Testing

- Add unit coverage in:
  - [`interpreter/utils/field-access.test.ts`](./interpreter/utils/field-access.test.ts)
  - [`interpreter/utils/structured-value.test.ts`](./interpreter/utils/structured-value.test.ts)
- Required cases:
  - recursive extraction on a mixed-trust record returns `untrusted`
  - recursive extraction on an all-fact record does not return inherited `untrusted`
  - adding `untrusted` to the parent after coercion causes fact-field access to surface `untrusted`

### Exit Criteria

- [ ] Recursive extraction still catches untrusted content inside refined records
- [ ] Whole-object flows remain fail-closed
- [ ] Post-coercion `untrusted` overrides are visible on fact fields

## Phase 4 – End-To-End Security Tests And Docs (≈0.5 to 1 day)

**Goal**: Prove the behavior at policy boundaries and document the new trust model clearly.

### Tasks

1. Add an end-to-end security regression for the motivating case.
   - Suggested targets:
     - [`tests/cases/feat/records/`](./tests/cases/feat/records/)
     - [`tests/cases/security/`](./tests/cases/security/)
     - or focused interpreter tests near [`tests/interpreter/hooks/guard-pre-hook.test.ts`](./tests/interpreter/hooks/guard-pre-hook.test.ts)
   - Required behavior:
     - fact arg from `exe untrusted ... => record` passes `no-untrusted-destructive`
     - data arg from the same result still fails

2. Add a validation/demotion regression.
   - Invalid record output should not clear `untrusted` from any field in:
     - `validate: "demote"`
     - `when => data`

3. Update user-facing atoms.
   - Required files:
     - [`docs/src/atoms/core/31-records--basics.md`](./docs/src/atoms/core/31-records--basics.md)
     - [`docs/src/atoms/effects/07-labels--trust.md`](./docs/src/atoms/effects/07-labels--trust.md)
     - [`docs/src/atoms/effects/07c-labels--facts.md`](./docs/src/atoms/effects/07c-labels--facts.md)
     - [`docs/src/atoms/security/08-facts-and-handles.md`](./docs/src/atoms/security/08-facts-and-handles.md)
   - Optional if examples need it:
     - [`docs/src/atoms/effects/18b-fyi--facts.md`](./docs/src/atoms/effects/18b-fyi--facts.md)

4. Add a changelog entry.
   - Target: [`CHANGELOG.md`](./CHANGELOG.md)

### Testing

- `npm run build:fixtures`
- Targeted Vitest:
  - `interpreter/eval/records/coerce-record.test.ts`
  - `interpreter/eval/exec-invocation.structured.test.ts`
  - `interpreter/utils/field-access.test.ts`
  - `interpreter/utils/structured-value.test.ts`
  - any new end-to-end security fixture or interpreter suite added by this work
- Final regression:
  - `npm test`

### Exit Criteria

- [ ] Motivating security flow passes without privileged override on fact fields
- [ ] Data-field destructive flow still fails
- [ ] Demotion paths preserve `untrusted`
- [ ] Docs describe the new boundary accurately
- [ ] `CHANGELOG.md` is updated

## Testing Requirements

- New unit tests must cover both direct field access and recursive whole-object extraction.
- At least one end-to-end test must exercise a real policy rule, not just raw descriptor inspection.
- At least one regression must prove that post-coercion relabeling to `untrusted` still takes effect.
- Existing record, projection, and handle tests must continue to pass.

## Documentation Requirements

- Update the records docs to say clearly that `facts` clear inherited exe `untrusted`, while `data` keeps it.
- Update trust-label docs so records are documented as the only non-privileged field-level trust refinement mechanism at this boundary.
- Reconcile the `validate: "demote"` docs with actual runtime semantics.
- Add a concise changelog entry because this is a user-visible security behavior change.

## Overall Exit Criteria

- [ ] `exe untrusted ... => record` produces fact fields without inherited `untrusted`
- [ ] Data fields from the same record still carry `untrusted`
- [ ] `when => data` and validation demotion keep all fields untrusted
- [ ] Whole-object recursive security extraction still sees mixed-trust records as untrusted
- [ ] Later explicit `untrusted` additions override the refinement
- [ ] Record, projection, and security regressions stay green
