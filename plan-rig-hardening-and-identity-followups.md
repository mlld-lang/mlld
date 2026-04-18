---
status: in_progress
related-docs:
  - docs/dev/DATA.md
  - plan-code-executor-typed-result-boundary.md
related-code:
  - ../clean/rig/prompts/planner.att
  - ../clean/rig/workers/planner.mld
  - ../clean/rig/workers/resolve.mld
  - ../clean/rig/workers/extract.mld
  - ../clean/rig/workers/execute.mld
  - ../clean/rig/intent.mld
  - ../clean/rig/runtime.mld
  - ../clean/bench/tests/test_host.py
  - interpreter/shelf/runtime.ts
  - interpreter/eval/import/variable-importer/ModuleExportSerializer.ts
  - interpreter/utils/module-boundary-serialization.ts
  - interpreter/utils/boundary.ts
  - interpreter/eval/shelf.test.ts
  - interpreter/eval/var/tool-scope.test.ts
  - interpreter/utils/boundary.test.ts
---

# Plan: Rig Hardening and Identity Follow-Ups

## Overview

This plan covers the two targeted follow-ups that should land after the current `wholeObjectInput` / imported-executable scope / shelf-owner diff. It does **not** cover the `mlld live --stdio` unwind bug and it does **not** cover the typed code-executor boundary work. The first follow-up is framework-facing: make the planner boundary declarative with explicit ref-shape records, then keep only thin contextual validation in `clean/rig` for tool/arg legality and task-text checks. The second follow-up is core defense-in-depth: make tool/shelf/captured-env identity preservation explicit at the shelf and module-boundary membranes instead of relying on preservation by reference.

## Current Status

- The current uncommitted diff implements **Phase 1** in records-first form:
  - explicit planner ref-shape records live in `../clean/rig/planner_inputs.mld`
  - planner workers reject malformed ref shapes before deeper dispatch
  - planner/logging surfaces now retain structured issues while rendering readable JSON summaries
  - host-backed regressions cover unknown-source rejection and known-source acceptance on workspace read tools
- Verified on 2026-04-18 with:
  - `uv run --project /Users/adam/mlld/clean/bench python3 -m unittest clean.bench.tests.test_host.HostMcpToolDispatchTests`
  - `mlld /Users/adam/mlld/clean/rig/tests/index.mld`
- **Phase 2** remains a follow-up. The stdio unwind / CPU-spin work also remains separate.

## Context

### Current State

- `clean/rig/prompts/planner.att` teaches a narrow legal ref grammar: `known`, `resolved`, `selection`, `extracted`, `derived`, and `allow`.
- `clean/rig/workers/planner.mld` still exposes loose tool input records such as `args: object?`, so the planner tool surface does not encode the same nested ref-source contract that the prompt describes.
- `clean/rig/intent.mld` correctly rejects unsupported ref sources such as `source: "unknown"`.
- Host-backed repros showed that the shelfed planner agent and `@phaseCatalog(...)` are working in the current build; the active planner-facing failure is contract drift between rig and runtime, not a generic shelf identity collapse.
- `docs/dev/DATA.md` now describes tool collection identity through shelf write/read as a high-risk boundary and explicitly calls out that the current shelf path is preserved by reference, not yet by explicit contract.

### Problems

1. The planner can emit syntactically valid but semantically illegal nested ref objects that runtime correctly rejects.
2. Invalid-call summaries in rig can collapse to `[object Object]`, which slows diagnosis and weakens planner self-repair.
3. Tool collection / captured-env identity is still partially implicit at the shelf write membrane and the module-boundary serializer path.

### Goals

- Keep runtime ref-source enforcement strict.
- Move structural validation and clearer diagnostics into `clean/rig` while keeping runtime enforcement unchanged.
- Add host-backed regressions so the workspace read-tool contract cannot drift.
- Harden the shelf/module identity membranes with explicit `boundary.identity(...)` handling where appropriate.

### Non-Goals

- Do **not** loosen `clean/rig/intent.mld` to accept `source: "unknown"` or any other new ref source.
- Do **not** include `mlld live --stdio` unwind / CPU spin work here.
- Do **not** include the typed code-executor boundary plan here.
- Do **not** redesign planner policy, security, or authorization semantics.

## Must-Read References

- `docs/dev/DATA.md`
- `plan-code-executor-typed-result-boundary.md` (adjacent, but out of scope here)
- `../clean/rig/prompts/planner.att`
- `../clean/rig/intent.mld`
- `../clean/bench/tests/test_host.py`

## Design Decisions

1. **Split structural and contextual planner contracts cleanly.**
   Planner-facing records should own the legal ref shapes and supported source forms. A thin rig-side validator should still enforce contextual rules that records cannot encode cleanly, such as legal tool arg names, `allow` restrictions, and task-text checks for `known` values.

2. **Do not weaken successful-path behavior.**
   These follow-ups should tighten invalid-call handling and identity guarantees without changing normal read/write behavior.

3. **Use `boundary.identity(...)` surgically and by named predicates.**
   The goal is to harden capability-bearing membranes, not to turn identity preservation into a catch-all serialization rule. The identity-detection set for this work is explicit: tool-collection metadata, captured module env / owner-env keychains, and shelf-slot refs.

4. **Keep these follow-ups separate from the stdio unwind investigation.**
   The unwind path remains its own bug. Do not mix framework contract tightening or identity hardening into that investigation.

## Phase 1 – Rig Contract Tightening (implemented in current diff)

**Goal**: make planner-emitted ref objects legal-by-construction at the record layer, then reject remaining contextual violations with a framework-level error before they hit runtime dispatch.

### Tasks

1. **Planner prompt hardening** – `../clean/rig/prompts/planner.att`
   - Make the allowed ref-source set explicit for each planner-facing tool family.
   - State directly that `source: "unknown"` is not legal for `resolve`, `extract`, or `execute`.
   - Add one worked example for search-style read tools showing `known` refs for literal query/date arguments.
   - Keep the runtime contract unchanged.

2. **Planner ref records as the source of truth** – `../clean/rig/workers/planner.mld`
   - Introduce explicit planner-facing ref-shape records for the supported source forms: `known`, `resolved`, `selection`, `extracted`, `derived`, and `allow`.
   - Add planner arg/source record surfaces that validate nested ref values against those records instead of treating `args` and `source` as opaque `object?` blobs.
   - Keep these records focused on shape and source-class legality. They should not try to encode tool-specific semantic rules.

3. **Thin contextual validator at the planner adapter** – `../clean/rig/workers/planner.mld`, `../clean/rig/runtime.mld`
   - Keep a narrow adapter-layer validator for rules that depend on the selected tool, arg role, or task text.
   - Enforce the contextual checks already modeled in `intent.mld`: legal arg names, `allow` only on the right write surfaces, and `known` values that must appear in task text.
   - Return planner-facing `status: "error"` responses with concise summaries instead of leaving malformed or contextually illegal shapes to fail deeper in the stack.

4. **Human-readable invalid-call summaries** – `../clean/rig/workers/resolve.mld`, `../clean/rig/workers/extract.mld`, `../clean/rig/workers/execute.mld`, `../clean/rig/runtime.mld`
   - Replace `[object Object]` summaries with sanitized, readable JSON.
   - Keep worker/phase summaries within the existing planner session surfaces.

5. **Machine-readable payload continuity** – `../clean/rig/runtime.mld`, `../clean/bench/tests/test_host.py`
   - Verify the planner/logging surfaces still retain machine-readable error payloads for retry and self-repair.
   - Do not collapse structured issues into a string-only surface.

6. **Preserve runtime strictness** – `../clean/rig/intent.mld`
   - Do not add `"unknown"` as an accepted ref source.
   - Keep `known` task-text checks and control-arg source restrictions unchanged unless a failing test proves the contract itself is wrong.

### Testing

- Add or extend host-backed tests in `../clean/bench/tests/test_host.py`:
  - workspace planner resolve rejects `query: { source: "unknown", value: "Sarah" }` with structured, readable issues
  - workspace planner resolve accepts `known` refs for `search_calendar_events`
  - invalid-call host logs still retain structured payloads after human-readable summary rendering
  - existing zero-arg resolve and compact-handle tests remain green
- Run:
  - `uv run --project /Users/adam/mlld/clean/bench python3 -m unittest clean.bench.tests.test_host.HostMcpToolDispatchTests`
  - `mlld /Users/adam/mlld/clean/rig/tests/index.mld`

### Exit Criteria

**Test Status**:
- [x] Host-backed unknown-rejected regression added and passing
- [x] Host-backed known-accepted regression added and passing
- [x] Existing planner host tests still pass
- [x] `clean/rig` suite still passes

**Validation**:
- [x] Invalid planner calls no longer summarize as `[object Object]`
- [x] Planner/log surfaces still retain machine-readable structured issues
- [x] Planner prompt and adapter validation describe the same legal source set
- [x] Runtime strictness in `intent.mld` is unchanged

**Deliverable**: planner ref shapes are declared at the record layer, contextual violations are rejected early, and rig reports them clearly without weakening runtime strictness.

## Phase 2 – Identity Defense-in-Depth (≈0.5–1.5 days)

**Goal**: convert the current "preserved by reference" behavior for tool-collection identity into explicit contract-preserving behavior at the two highest-risk membranes.

### Tasks

1. **Shelf write membrane hardening at the field-normalization seam** – `interpreter/shelf/runtime.ts`
   - Make `normalizeStructuredFieldValue(...)` at `interpreter/shelf/runtime.ts:454` the explicit seam for this work, with the array path following through `normalizeStructuredArrayFieldValue(...)`.
   - Before the current `cloneStructuredValue(value)` / `wrapStructured(extractRecordInputValue(value))` path materializes an object-typed field, detect identity-bearing inputs using the agreed predicate set:
     - tool collections: `resolveDirectToolCollection(...)` or `getToolCollectionMetadata(...)`
     - captured env identity: `getCapturedModuleEnv(...)` and `getCapturedModuleOwnerEnv(...)`
     - live slot refs: `isShelfSlotRefValue(...)`
   - Route those identity-bearing values through `boundary.identity(...)` before wrapping/cloning so the shelf stores an identity-preserving carrier by contract.
   - Preserve existing behavior for ordinary plain-data shelf values.

2. **Module-boundary serializer hardening** – `interpreter/eval/import/variable-importer/ModuleExportSerializer.ts`, `interpreter/utils/module-boundary-serialization.ts`, `interpreter/utils/boundary.ts`
   - Make the object serializer path explicit at the `ModuleExportSerializer.serializeVariable(...)` object branch and `serializePlainObject(...)` / `serializeModuleBoundaryValueInternal(...)` in `interpreter/utils/module-boundary-serialization.ts`.
   - Ensure tool-collection and captured-env preservation is treated as an identity contract, not just metadata side channels.
   - Preserve both the tool-collection marker and its captured module env together across export/import.

3. **Test coverage** – `interpreter/eval/shelf.test.ts`, `interpreter/eval/var/tool-scope.test.ts`, `interpreter/utils/boundary.test.ts`
   - Keep the existing nested shelf tool-collection tests.
   - Add one positive regression that proves the hardened shelf/module membranes preserve tool-collection identity and captured env across supported plain-object-looking transport.
   - Add one negative regression that explicitly deep-clones upstream data with `structuredClone(value.data)` or `JSON.parse(JSON.stringify(value.data))` before the shelf write, and assert the runtime fails loudly rather than silently storing a marker-less lookalike as if it were a supported identity-bearing value.
   - Add a boundary-level regression that fails if a future clone/materialization drops the marker or captured env across a membrane we claim to support.

### Testing

- `npx vitest run interpreter/eval/shelf.test.ts interpreter/eval/var/tool-scope.test.ts interpreter/utils/boundary.test.ts`
- Any adjacent import/tool suites touched by serializer changes

### Exit Criteria

**Test Status**:
- [ ] Shelf identity tests pass
- [ ] Tool-scope and boundary identity tests pass
- [ ] No regressions in imported tool dispatch or captured-env resolution

**Validation**:
- [ ] `docs/dev/DATA.md` matrix is updated so the `Shelf write→read` row changes tool-collection and `capturedModuleEnv` cells from `R` to `✓`
- [ ] Supported shelf/module membranes preserve tool collection identity and captured env together
- [ ] No new plain-data materialization is introduced on non-identity paths

**Deliverable**: shelf/module identity preservation is explicit and test-backed rather than incidental.

## Overall Testing Requirements

- `npm run build`
- `npx vitest run interpreter/eval/shelf.test.ts interpreter/eval/var/tool-scope.test.ts interpreter/utils/boundary.test.ts`
- `uv run --project /Users/adam/mlld/clean/bench python3 -m unittest clean.bench.tests.test_host.HostMcpToolDispatchTests`
- `mlld /Users/adam/mlld/clean/rig/tests/index.mld`

## Documentation Requirements

- Update `docs/dev/DATA.md` as part of Phase 2. This is required work, not a conditional cleanup: revise the membrane rules text and change the `Shelf write→read` row for tool collection / `capturedModuleEnv` from `R` to `✓` if the hardening lands as planned.
- Add a short changelog note only if these follow-ups materially change user-visible planner behavior or error messages.
- Keep this plan current as decisions settle; do not leave it describing work that has already landed.

## Deferred / Out of Scope

- `mlld live --stdio` unwind / CPU spin investigation
- code executor typed-result boundary
- broader planner or policy redesign

## Overall Exit Criteria

**Test Status**:
- [ ] All targeted vitest/bench/rig suites listed above pass
- [ ] Build succeeds
- [ ] No regression in current `wholeObjectInput` or imported-exe shadowing tests

**Validation**:
- [x] Planner contract and runtime contract are aligned for legal ref sources
- [x] Invalid-call diagnostics are readable in host-backed runs
- [ ] Identity-preservation guarantees at shelf/module membranes are explicit and tested

**Deliverable**: the current landed diff is followed by one small framework-hardening pass and one small identity-hardening pass, without mixing either into the stdio unwind or typed-executor tracks.
