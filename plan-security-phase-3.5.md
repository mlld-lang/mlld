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
- ✅ Hook scaffolding now exists: `evaluateDirective()` runs through a shared HookManager (stub guard pre-hook + taint post-hook), and a ContextManager builds `@ctx.op`/`@ctx.pipe` snapshots for the ambient variable.
- ✅ `extractDirectiveInputs()` now covers `/show`, `/output`, and `/run`; the corresponding evaluators consume `context.extractedInputs` so hooks inspect real values without double evaluation, and pipeline stages push/pop operation contexts via the shared ContextManager.
- ⚠️ `/var` extraction is deferred: executing the RHS just to capture a hook input duplicates side effects (inline effects, CLI commands, pipelines). We'll tackle `/var` inputs alongside the guard runner in Phase C so assignments are evaluated exactly once.
- Tests now include a hook smoke suite (`tests/interpreter/hooks/*`) proving order + @ctx plumbing. Remaining coverage gaps (pipeline retry nesting, guard decision paths) will land in Phase C/D.

## Scope
- Complete the outstanding evaluator integrations noted in `plan-security.md` Phase 3.5 Part A. ✅
- Implement the hook manager described in `spec-hooks.md`, wire it into `evaluateDirective()`, and keep hook ordering fixed and internal. This includes creating a reusable hook runner that every directive path (CLI, LSP, module import) calls before and after evaluator dispatch.
- Introduce a lightweight `ContextManager` (dedicated helper class) that owns `@ctx` namespace stacks while Environment delegates push/pop/build operations. The manager must integrate with existing environment push/pop semantics (variables, pipelines, retry contexts) so @ctx remains consistent in nested pipelines, `/for`, and guard retries.
- Move taint/descriptor post-processing into the hook path so evaluators simply return values plus metadata hints. Evaluators should provide enough metadata (e.g., input descriptors, result structured values) for the taint hook to merge descriptors without peeking into directive-specific internals.
- Expand tests/fixtures to cover the new directives, hook flow, and context semantics. This includes both targeted unit tests (hook ordering, context stack nesting) and fixture-level tests (scripts that inspect `@ctx.*` identifiers, guard scripts that assert label propagation). 
- Document the `/var` deferment so Phase C contributors know to wire `extractDirectiveInputs` through the forthcoming assignment guard runner.

## Non-Goals
- Guard parsing, guard configuration, prompt UX, or policy enforcement (Phase 4+).
- User-configurable hook ordering or registration APIs.
- Exhaustive audit of every custom effect; only `/export` and `/output` are in scope for this phase per `plan-security.md`.

## Inputs
- `spec-hooks.md` – authoritative description of hook lifecycle, decisions, and @ctx namespaces.
- `spec-security.md` – descriptor semantics, capability contexts, and guard expectations. Pay particular attention to the guard execution model section, since Phase 3.5 is responsible for producing the capability payloads Phase 4 consumes.
- `plan-security.md` – Phase 3 gap list, hook roadmap, guard prerequisites, and the canonical Part A/B/C/D breakdown.
- `spec-middleware.md` (historical) – cross-check to ensure terminology drift is addressed.
- `docs/dev/TESTS.md` – fixture organization, naming, and validation workflow.
- Interpreter architecture references: `docs/dev/INTERPRETER.md` (single-pass evaluation, environment responsibilities), `docs/dev/PIPELINE.md` (retry semantics, stage metadata), and `docs/dev/TYPES.md` (variable wrappers and metadata) are useful when wiring hooks into existing evaluators.

## Phase C Preview – Guard Runner & `/var` Extraction

Phase B confirmed that `/var` cannot safely participate in generic input extraction without a guard-aware execution path. Evaluating the RHS purely for hooks caused a double-execution of embedded directives (effects fired twice, pipelines reran, CLI commands duplicated). We therefore defer `/var` inputs to Phase C, where the assignment guard runner will:

- Execute the RHS exactly once, capture the resulting `Variable`, and pass that instance to guards before committing it to the environment.
- Stream effects immediately even when the guard later denies the assignment (current interpreter behavior emits effects before assignment when `/var` is used inside pipelines or exe wrappers, so guards must tolerate already-streamed output).
- Provide hook-friendly metadata (labels, taint snapshots) without re-running the assignment body.

**Gotchas learned:**
- Effects triggered during RHS evaluation (especially `/show` inside pipelines or exe helpers) are irreversible; guard failures must not suppress them because they already streamed during evaluation.
- Pipelines invoked inside `/var` often mutate `@ctx.pipe.*`; the guard runner must snapshot the context after the value resolves so hooks/guards inspect the same attempt counters the user saw.
- Assignment retries (e.g., guard `retry` decisions) need to coordinate with the pipeline retry machinery. We’ll reuse the existing retry context helpers so guard retries share the same attempt budgets as pipeline stages.

Phase C will also expand `extractDirectiveInputs()` to include `/var` once the guard runner owns RHS execution, and add targeted tests covering guard retries, pipeline mutation inside assignments, and effect streaming order during guard-denied assignments.

### Phase C Breakdown

To keep delivery manageable we will land Phase C in three focused slices that build on one another:

1. **C1 – Assignment Guard Runner & `/var` Inputs** ✅ (complete on `datalabels`)
   - Implement the guard-aware `/var` runner that evaluates RHS exactly once, captures the resulting `Variable`, and replays it through guard hooks before committing to the environment.
   - Wire guard retries to the existing pipeline `RetryContext`, ensuring guard `retry` decisions respect source retryability and inherit attempt counters/hints.
   - Extend `extractDirectiveInputs()` and the hook path so `/var` exposes its captured value to pre-hooks without double evaluation.
   - Tests: regression coverage for guard retries, effect streaming order, and pipelines nested inside assignments (fixture additions under `tests/cases/feat/security/phase3c-*`).
   
   _Notes:_ Precomputing assignments surfaced the need for a tidy `VarAssignmentResult` payload and `EvaluationContext.precomputedVarAssignment`. Guard work should continue to use that structure rather than re-evaluating directives.

2. **C2 – ContextManager Consolidation & Ambient Consumers** ✅ (complete on `datalabels`)
   - Add scoped helpers (`withOpContext`, `withPipeContext`, `withGuardContext`) so evaluators/pipelines no longer manipulate stacks manually.
   - Route the JS/Node executor context injection (`Environment.executeCode`) through `ContextManager.buildAmbientContext()` to eliminate the bespoke builder and guarantee Node/JS code sees the same `@ctx` as hooks and scripts.
   - Ensure child environments inherit context stacks safely (no accidental sharing between parallel pipelines).
   - Tests: hook smoke suite expansion plus targeted JS/Node executor fixtures asserting the injected `ctx` mirrors interpreter-visible values.
   
   _Notes:_ Pipeline stages now rely on captured snapshots; any future stage helpers must pass `capturePipelineContext` so the ambient stack stays in sync. Guard work should use the new `withGuardContext` helper instead of manual push/pop.

3. **C3 – Token/Length Metrics & Variable `.ctx` Namespace** ✅ (complete on `datalabels`)
   - Extract the token estimation heuristics from `LoadContentResultImpl` into a shared utility so any text-like variable can report `tokest`/`tokens`.
   - When variables are created (including alligator loads, pipelines, `/run` outputs), attach a normalized `metrics` payload to metadata (estimated tokens, eventual exact tokens, content length).
   - Extend `ContextManager` and variable `.ctx` accessors to surface these metrics lazily (`@myVar.ctx.tokens`, `@input.totalTokens()`) per the guard spec.
   - Update docs (`docs/dev/ALLIGATOR.md`, `spec-hooks.md`) and fixtures to demonstrate the unified token reporting; add regression tests that compare `.ctx.tokens` against the helper output.
   
   _Notes:_ Token estimates now flow through `VariableMetadataUtils` so `.ctx.tokens` falls back to `.ctx.tokest` when exact counts are unavailable. `HookManager` pre-hooks receive the `createGuardInputHelper` aggregate, giving future guard runners access to `.any/.all/.none` plus helpers like `@input.totalTokens()`. Tests under `tests/interpreter/variable-ctx.test.ts`, `tests/interpreter/hooks/directive-hooks.test.ts`, and fixture `tests/cases/feat/security/phase3c-metrics` lock the new behavior, and the developer docs call out the `.ctx.tokens` contract.

### Phase D Preview – Taint Tracking via Hooks

Now that guarded assignments, context management, and token metrics are in place, the remaining Phase 3.5 work (Part D) focuses on moving taint propagation into hooks and removing evaluator-specific plumbing.

**Goals**
- Shift descriptor merging into the taint post-hook so evaluators only describe inputs/outputs.
- Remove legacy `pushSecurityContext` calls from individual evaluators; rely on hook results instead.
- Ensure pipelines/parallel stages surface stage metadata through the hook path, including retries.
- Expand tests (e.g., `tests/interpreter/security-metadata.test.ts`) to compare hook-driven taint output against the legacy behavior.

**Status**
- Infrastructure is ready (hook manager ordering, context helpers, guard-aware `/var` flow).
- Work items listed above remain open; they will be tackled next to complete Part D.

Deliverables for Phase C are therefore the combined outputs of C1–C3: guard-ready `/var` execution, consolidated context plumbing (including JS/Node), and reusable token metrics that power the `.ctx` namespace and guard helpers.

## Key Decisions & Risks
- **Context ownership**: `@ctx` state lives in a simple `ContextManager` (separate helper) whose only job is to push/pop namespace stacks and build the ambient object; Environment delegates to it. Risk: ad-hoc pushes leak between directives. Mitigation: expose scoped helpers (`withOpContext`, `withPipeContext`, `withGuardContext`) plus unit tests covering nesting and alias output. The manager must cooperate with `Environment.createChild()` so nested evaluations inherit context snapshots correctly.
- **Hook ordering**: Hooks execute in fixed interpreter order (guard pre-hook → evaluator → taint post-hook → future diagnostics/profiling). Risk: future hooks expect custom ordering. Mitigation: document the order, assert it in tests, and keep registration private.
- **Descriptor immutability**: Hooks reuse descriptor references; mutation corrupts downstream state. Mitigation: freeze descriptors/capability contexts in helpers and add regression tests.
- **Gap closure verification**: /exe/interpolation/export/output require deterministic fixtures. Risk: regressions reintroduce bespoke paths. Mitigation: add dedicated fixtures under `tests/cases/feat/security/phase3p5-*` covering each.
- **Environment contract**: Hook execution happens inside `evaluateDirective()`, which is shared by the CLI, LSP, and module loader. The hook manager must be light enough to run on every directive without regressing perf, and it must be aware of import-mode shortcuts (e.g., directives skipped during `/import`) so hooks don’t fire in contexts where the directive body never executes.

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
