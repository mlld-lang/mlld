# Phase 3.5 – Hook Integration & Context Hardening

This plan reflects the hook nomenclature introduced in `spec-hooks.md` and the updated expectations captured in `plan-security.md`. The goal is to land a lean, deterministic hook/ctx foundation that closes the remaining Phase 3 gaps and prepares Phase 4 guards without introducing unnecessary abstractions.

## Objective
- Finish the Phase 3 backlog (`/exe`, interpolation, `/export`, `/output`) using the existing security plumbing so every evaluator mirrors the `/var`/`/run` pattern.
- Replace bespoke evaluator plumbing with hook-driven execution in `evaluateDirective()` while keeping hook ordering hardcoded (guard pre-hook → directive → taint post-hook → future diagnostics), as these hooks are interpreter-owned infrastructure.
- Centralize `@ctx` namespace management via a lightweight `ContextManager` helper that Environment delegates to so `@ctx.op`, `@ctx.pipe`, and `@ctx.guard` expose the shapes promised in `spec-hooks.md`.
- Ensure variable `.ctx` metadata surfaces the same capability snapshot hooks consume, giving guards a stable contract in Phase 4.
- Lock the behavior with unit tests and fixtures that follow `docs/dev/TESTS.md`.

## Current State & Gaps
- ✅ `/exe` declarations and invocations now reuse the shared descriptor helpers: definitions accept label lists, carry capability contexts via `VariableMetadataUtils`, and invocations merge descriptors from the executable + arguments + pipeline retries. Regression coverage lives in `tests/interpreter/security-metadata.test.ts`.
- ✅ Template interpolation collects contributor descriptors via `interpolateWithSecurity`, so any inline text that calls variables or execs inherits the same capability snapshot as `/var` assignments.
- ✅ `/export` and `/output` run inside a security context and record descriptor/capability metadata for emitted artifacts; structured effects inherit the merged snapshot.
- Hook infrastructure remains manual: evaluators push/pop security scopes themselves, there is no hook manager, and `@ctx` namespaces are still composed ad-hoc.
- Tests cover descriptor propagation for the newly wired directives, but no suite exercises hook ordering, ContextManager lifetimes, or guard/taint hook coordination yet.

## Scope
- Complete the outstanding evaluator integrations noted in `plan-security.md` Phase 3.5 Part A.
- Implement the hook manager described in `spec-hooks.md`, wire it into `evaluateDirective()`, and keep hook ordering fixed and internal.
- Introduce a lightweight `ContextManager` (dedicated helper class) that owns `@ctx` namespace stacks while Environment delegates push/pop/build operations.
- Move taint/descriptor post-processing into the hook path so evaluators simply return values plus metadata hints.
- Expand tests/fixtures to cover the new directives, hook flow, and context semantics.

## Non-Goals
- Guard parsing, guard configuration, prompt UX, or policy enforcement (Phase 4+).
- User-configurable hook ordering or registration APIs.
- Exhaustive audit of every custom effect; only `/export` and `/output` are in scope for this phase per `plan-security.md`.

## Inputs
- `spec-hooks.md` – authoritative description of hook lifecycle, decisions, and @ctx namespaces.
- `spec-security.md` – descriptor semantics, capability contexts, and guard expectations.
- `plan-security.md` – Phase 3 gap list, hook roadmap, and guard prerequisites.
- `spec-middleware.md` (historical) – cross-check to ensure terminology drift is addressed.
- `docs/dev/TESTS.md` – fixture organization, naming, and validation workflow.

## Key Decisions & Risks
- **Context ownership**: `@ctx` state lives in a simple `ContextManager` (separate helper) whose only job is to push/pop namespace stacks and build the ambient object; Environment delegates to it. Risk: ad-hoc pushes leak between directives. Mitigation: expose scoped helpers (`withOpContext`, `withPipeContext`, `withGuardContext`) plus unit tests covering nesting and alias output.
- **Hook ordering**: Hooks execute in fixed interpreter order (guard pre-hook → evaluator → taint post-hook → future diagnostics/profiling). Risk: future hooks expect custom ordering. Mitigation: document the order, assert it in tests, and keep registration private.
- **Descriptor immutability**: Hooks reuse descriptor references; mutation corrupts downstream state. Mitigation: freeze descriptors/capability contexts in helpers and add regression tests.
- **Gap closure verification**: /exe/interpolation/export/output require deterministic fixtures. Risk: regressions reintroduce bespoke paths. Mitigation: add dedicated fixtures under `tests/cases/feat/security/phase3p5-*` covering each.

## Workstreams (aligned with `plan-security.md`)

### Part A – Close Phase 3 Gaps ✅
- `/exe` declarations: DONE (`interpreter/eval/exe.ts` now pushes security context around executable creation, applies metadata via `VariableMetadataUtils`, and records operation labels).
- `/exe` invocations: DONE (`interpreter/eval/exec-invocation.ts` merges descriptors from executables, parameters, nested pipelines, and structured outputs; see new helpers around `extractSecurityDescriptor` and `mergeResultDescriptor`).
- Interpolation: DONE (`interpreter/eval/var.ts` + `interpreter/core/interpreter.ts` collect descriptors during interpolation and hand them to `/var` metadata).
- `/export` and `/output`: DONE (both directives wrap execution in a security context and record descriptor snapshots before emitting effects).
- Tests: Added to `tests/interpreter/security-metadata.test.ts` plus targeted integration suites (`shadow-env-basic-import`, `imports/shadow-environments`) to gate regressions.

### Part B – Hook Infrastructure
- Implement `HookManager` inside the Environment package with `registerPreHook`, `registerPostHook`, and `runHooksAroundDirective` helpers. Registration order is fixed; there are no priority tags or external APIs. _Implementation note_: hook handlers must receive both the raw `DirectiveNode` and a resolved `OperationContext` (see `spec-hooks.md`) so guard hooks can match on type/subtype/labels without re-deriving metadata.
- Introduce `extractDirectiveInputs()` (per spec) so pre-hooks see normalized inputs without duplicating evaluator logic.
- Update `evaluateDirective()` to:
  1. Build the operation context via helper function + `ContextManager`.
  2. Push `@ctx.op` before hooks run.
  3. Run guard pre-hook (security check) and any future pre-hooks in fixed order.
  4. Execute the directive if pre-hooks return `continue`.
  5. Run post-hooks (taint propagation first, then future diagnostics/profiling) with the result.
  6. Pop the context and return the final value.
- Tests: unit tests with mock hooks that record call order; interpreter tests ensuring hooks run once per directive.

### Part C – Context Manager & Variable `.ctx`
- Provide Environment-scoped helpers (`withOpContext`, `withPipeContext`, `withGuardContext`) that push/pop through the manager so evaluators never manipulate stacks directly. _Architectural reminder_: pipelines and guards can nest arbitrarily; the manager needs independent stacks per namespace plus legacy alias mirrors to keep `@ctx.operation`/`@ctx.try` working until removal.
- Populate variable `.ctx` metadata using the same capability snapshot helper used by hooks; include security labels, taintLevel, sources, and structural metadata (length, tokens) per the spec. Store references to the originating `CapabilityContext` so guard hooks can diff before/after states when they fire inside pipelines.
- Update field-access evaluation so `.ctx.*` paths resolve lazily and cache values.
- Tests: unit coverage for context nesting and alias behavior; fixtures that inspect `.ctx` values inside scripts.

### Part D – Taint Tracking via Hooks
- Move descriptor merging logic into a taint post-hook that receives the directive result plus evaluated inputs and writes the merged descriptor back via `VariableMetadataUtils`. _Implementation note_: taint hooks must understand multi-result directives (pipelines, parallel groups, effects) and rewrite structured outputs without rebasing `StructuredValue.metadata`.
- Remove evaluator-specific `pushSecurityContext` calls; evaluators now simply describe their inputs/outputs, and the post-hook applies canonical logic.
- Ensure pipelines feed stage metadata through hooks, including retries and parallel groups; reuse existing pipeline retry contexts instead of creating new abstractions. Hook context should capture retry counters so guards and taint hooks observe the same `@ctx.pipe.try` values.
- Tests: extend `tests/interpreter/security-metadata.test.ts` (or add a sibling) to confirm the post-hook updates descriptors identically to the previous evaluator-specific logic.

### Validation & Fixtures
- Expand `tests/utils/security.ts` with helpers for asserting capability contexts, @ctx namespaces, and hook ordering.
- Add fixture suites under `tests/cases/feat/security/phase3p5-*` that:
  - Exercise `/exe` labels and invocations.
  - Demonstrate interpolation descriptor merging.
  - Capture hook execution side effects (e.g., logging order).
- Follow `docs/dev/TESTS.md`: unique filenames, `skip.md` when necessary, and `npm run build:fixtures` as part of validation. Guard-facing fixtures should include structured outputs (arrays/objects) to verify descriptor metadata survives JSON conversions.
- Refine the new module/output fixtures (`feat/module-system/security-exe-roundtrip`, `slash/output/security-imported-exec`) once `.ctx` accessors land: add `/show ...ctx.labels` assertions and guard scripts that deny/allow based on the propagated labels so users can observe security metadata from mlld code.
- Required runs: `npm test`, targeted unit suites for hooks/context, plus interpreter fixture subsets covering the new cases.

## Exit Criteria
- `/exe`, interpolation, `/export`, and `/output` evaluators reuse the shared descriptor helpers, and fixtures prove the propagation. ✅
- Hook execution lives in `evaluateDirective()` with fixed internal ordering; there are no evaluator-specific hook calls.
- Environment-managed `@ctx` namespaces (with aliases) behave deterministically and match `spec-hooks.md`.
- Variable `.ctx` mirrors the capability metadata seen by hooks.
- Taint/descriptor propagation occurs exclusively via hooks, with tests locking behavior.
