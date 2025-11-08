# Phase 3.5 – Hook Integration & Context Hardening

This plan reflects the hook nomenclature introduced in `spec-hooks.md` and the updated expectations captured in `plan-security.md`. The goal is to land a lean, deterministic hook/ctx foundation that closes the remaining Phase 3 gaps and prepares Phase 4 guards without introducing unnecessary abstractions.

## Objective
- Finish the Phase 3 backlog (`/exe`, interpolation, `/export`, `/output`) using the existing security plumbing so every evaluator mirrors the `/var`/`/run` pattern.
- Replace bespoke evaluator plumbing with hook-driven execution in `evaluateDirective()` while keeping hook ordering hardcoded (guard pre-hook → directive → taint post-hook → future diagnostics), as these hooks are interpreter-owned infrastructure.
- Centralize `@ctx` namespace management via a lightweight `ContextManager` helper that Environment delegates to so `@ctx.op`, `@ctx.pipe`, and `@ctx.guard` expose the shapes promised in `spec-hooks.md`.
- Ensure variable `.ctx` metadata surfaces the same capability snapshot hooks consume, giving guards a stable contract in Phase 4.
- Lock the behavior with unit tests and fixtures that follow `docs/dev/TESTS.md`.

## Current State & Gaps
- `/exe` evaluator and exec invocation paths still bypass the descriptor utilities; declarations do not accept operation labels, and invocations drop existing metadata.
- Template interpolation merges string output but not descriptors, so taint/label propagation halts inside inline templates.
- `/export` and `/output` evaluators rely on ad-hoc metadata assignment; they need to reuse the same helpers as `/run` and `/show`.
- Hook infrastructure is nominal: evaluators call security helpers directly, `@ctx` aliases are populated piecemeal, and there is no shared pre/post hook execution path.
- Tests prove descriptor propagation for covered directives, but no suite exercises hook ordering, context namespaces, or the missing directive/effect cases.

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

### Part A – Close Phase 3 Gaps
- `/exe` declarations: parse optional operation labels, store them in executable metadata, and ensure capability descriptors attach during definition.
- `/exe` invocations: merge caller/input descriptors with function metadata so results carry accumulated labels.
- Interpolation (`interpreter/eval/interpolate.ts`): merge descriptors from embedded variables and literal fragments so inline templates inherit taint.
- `/export` and `/output`: reuse the descriptor application helpers so emitted variables/files include capability metadata.
- Tests: add fixtures validating `/exe` label parsing, invocation propagation, interpolation merges, and `/export`/`/output` metadata round-trips.

### Part B – Hook Infrastructure
- Implement `HookManager` inside the Environment package with `registerPreHook`, `registerPostHook`, and `runHooksAroundDirective` helpers. Registration order is fixed; there are no priority tags or external APIs.
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
- Add the dedicated `ContextManager` helper that owns stacks for `op`, `pipe`, and `guard` namespaces plus alias emission (`@ctx.operation`, `@ctx.try`, etc.).
- Provide Environment-scoped helpers (`withOpContext`, `withPipeContext`, `withGuardContext`) that push/pop through the manager so evaluators never manipulate stacks directly.
- Populate variable `.ctx` metadata using the same capability snapshot helper used by hooks; include security labels, taintLevel, sources, and structural metadata (length, tokens) per the spec.
- Update field-access evaluation so `.ctx.*` paths resolve lazily and cache values.
- Tests: unit coverage for context nesting and alias behavior; fixtures that inspect `.ctx` values inside scripts.

### Part D – Taint Tracking via Hooks
- Move descriptor merging logic into a taint post-hook that receives the directive result plus evaluated inputs and writes the merged descriptor back via `VariableMetadataUtils`.
- Remove evaluator-specific `pushSecurityContext` calls; evaluators now simply describe their inputs/outputs, and the post-hook applies canonical logic.
- Ensure pipelines feed stage metadata through hooks, including retries and parallel groups; reuse existing pipeline retry contexts instead of creating new abstractions.
- Tests: extend `tests/interpreter/security-metadata.test.ts` (or add a sibling) to confirm the post-hook updates descriptors identically to the previous evaluator-specific logic.

### Validation & Fixtures
- Expand `tests/utils/security.ts` with helpers for asserting capability contexts, @ctx namespaces, and hook ordering.
- Add fixture suites under `tests/cases/feat/security/phase3p5-*` that:
  - Exercise `/exe` labels and invocations.
  - Demonstrate interpolation descriptor merging.
  - Capture hook execution side effects (e.g., logging order).
- Follow `docs/dev/TESTS.md`: unique filenames, `skip.md` when necessary, and `npm run build:fixtures` as part of validation.
- Required runs: `npm test`, targeted unit suites for hooks/context, plus interpreter fixture subsets covering the new cases.

## Exit Criteria
- `/exe`, interpolation, `/export`, and `/output` evaluators reuse the shared descriptor helpers, and fixtures prove the propagation.
- Hook execution lives in `evaluateDirective()` with fixed internal ordering; there are no evaluator-specific hook calls.
- Environment-managed `@ctx` namespaces (with aliases) behave deterministically and match `spec-hooks.md`.
- Variable `.ctx` mirrors the capability metadata seen by hooks.
- Taint/descriptor propagation occurs exclusively via hooks, with tests locking behavior.
