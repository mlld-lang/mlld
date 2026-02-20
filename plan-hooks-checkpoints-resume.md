# Hooks + Checkpoints + Resume/Fork Implementation Plan

## Reviewed Inputs
- Spec: `spec-hooks-checkpoints-resume.md`
- Dev docs: `docs/dev/ARCHITECTURE.md`, `docs/dev/GRAMMAR.md`, `docs/dev/TESTS.md`, `docs/dev/HOOKS.md`
- Runtime integration points:
  - `interpreter/eval/directive.ts`
  - `interpreter/eval/exec/guard-policy.ts`
  - `interpreter/eval/exec-invocation.ts`
  - `interpreter/eval/for.ts`
  - `interpreter/eval/for/iteration-runner.ts`
  - `interpreter/utils/parallel.ts`
  - `interpreter/hooks/HookManager.ts`
  - `interpreter/hooks/hook-decision-handler.ts`
  - `interpreter/guards/GuardRegistry.ts`
  - `interpreter/env/Environment.ts`
  - `interpreter/env/ContextManager.ts`
- CLI/SDK integration points:
  - `cli/commands/run.ts`
  - `cli/execution/CommandDispatcher.ts`
  - `cli/parsers/ArgumentParser.ts`
  - `cli/index.ts`
  - `sdk/execute.ts`
  - `sdk/types.ts`
  - `interpreter/index.ts`
- Grammar/type/syntax integration points:
  - `grammar/mlld.peggy`
  - `grammar/base/tokens.peggy`
  - `grammar/directives/guard.peggy`
  - `grammar/deps/grammar-core.ts`
  - `core/types/primitives.ts`
  - `core/types/index.ts`
  - `services/lsp/visitors/DirectiveVisitor.ts`
  - `grammar/syntax-generator/build-syntax.js`

## Architecture Constraints (From Reviewed Docs)
- Keep grammar/type/runtime boundaries clean per `docs/dev/ARCHITECTURE.md`.
- Keep grammar and TS types synchronized, and rebuild grammar artifacts per `docs/dev/GRAMMAR.md`.
- Follow fixture and test organization rules per `docs/dev/TESTS.md`.
- Preserve existing built-in hook lifecycle semantics and non-reentrancy model from `docs/dev/HOOKS.md`.

## Global Delivery Rules (Apply To Every Phase)
1. Each phase must include implementation + tests + docs + `CHANGELOG.md` updates in the same phase.
2. Each phase ends only when all required tests pass.
3. Each phase is committed only after tests pass.
4. No phase may reduce existing coverage for touched subsystems.
5. `CHANGELOG.md` strategy:
   - Create/maintain a top `## [Unreleased]` section.
   - Add a phase-specific bullet under `Added`/`Changed`/`Fixed`/`Documentation` in each phase commit.
6. Mandatory final gate for each phase:
   - `npm run build`
   - `npm test`
7. High-risk lifecycle phases require a pre-change characterization test suite and a post-change parity check before broader feature assertions.
8. For any hot-path protocol change (e.g., hook decision actions), land a compatibility adapter first, then switch call sites in a follow-up sub-phase.

## Critical-Path Test Matrix

Use this as the fast-feedback runbook during implementation. These are additive to per-phase full gates.

| Risk Area | Primary Touchpoints | Fast Feedback (Dev Loop) | Expected Failure Signal | Phase Exit Gate |
|---|---|---|---|---|
| Lifecycle ordering insertion (Phase 3A) | `interpreter/eval/directive.ts`, `interpreter/eval/exec/guard-policy.ts`, `interpreter/eval/exec-invocation.ts`, `interpreter/eval/pipeline/builtin-effects.ts` | `npm test tests/interpreter/hooks/lifecycle-characterization.test.ts tests/interpreter/guards/` | Lifecycle event sequence mismatch in characterization assertions; guard parity failures immediately after insertion-point edits | `npm run build && npm test` |
| Hook transform chaining + error isolation (Phase 3B) | user hook runner + directive/exec/effect hook plumbing | `npm test tests/interpreter/hooks/` | Output/value assertion drift with ordering tests still green; missing/incorrect `@mx.hooks.errors`; transformed value differs from expected chain | `npm run build && npm test` |
| Hook external emission compatibility (Phase 3B) | hook block execution path + existing directive/effect/state pathways (`output`, `run`, `append`, `state://`) | `npm test tests/interpreter/hooks/` | Hook side-effect failures unexpectedly abort parent operation; `state://`/append telemetry not emitted when hooks succeed | `npm run build && npm test` |
| Hook non-reentrancy boundary (Phase 3C) | hook suppression context + guard suppression interplay | `npm test tests/interpreter/hooks/ tests/interpreter/guards/` | Recursive hook invocation patterns, stack overflow/timeouts, or nested guard execution unexpectedly absent | `npm run build && npm test` |
| For iteration/batch operation context (Phase 4) | `interpreter/eval/for.ts`, `interpreter/eval/for/iteration-runner.ts`, `interpreter/utils/parallel.ts`, `interpreter/env/ContextManager.ts` | `npm test interpreter/eval/for.characterization.test.ts tests/interpreter/hooks/` | Missing/incorrect `@mx.for.*` values; batch boundary hooks not firing or firing with wrong indices/sizes | `npm run build && npm test` |
| Checkpoint protocol compatibility (Phase 6A) | `interpreter/hooks/HookManager.ts`, `interpreter/hooks/hook-decision-handler.ts`, checkpoint adapter path | `npm test tests/interpreter/checkpoint/ tests/interpreter/hooks/ tests/interpreter/guards/` | Guard decision regressions (`continue/abort/retry/deny`) before short-circuit is enabled; adapter-specific branch failures | `npm run build && npm test` |
| Checkpoint short-circuit activation (Phase 6B) | `interpreter/eval/directive.ts`, `interpreter/eval/exec/guard-policy.ts`, `interpreter/eval/pipeline/builtin-effects.ts`, checkpoint hooks | `npm test tests/interpreter/checkpoint/ tests/interpreter/hooks/ tests/interpreter/guards/` | Cache-hit semantics regressions: guards running on hits, misses not writing cache, user after-hooks skipped on hits | `npm run build && npm test` |
| CLI flag parsing and payload isolation (Phase 7) | `cli/commands/run.ts`, `cli/execution/CommandDispatcher.ts`, `cli/parsers/ArgumentParser.ts` | `npm test cli/commands/run.test.ts cli/commands/checkpoint.test.ts` | New flags appearing in `@payload`, run options not forwarded, checkpoint commands misrouted | `npm run build && npm test` |
| Grammar/type/LSP synchronization (Phase 1) | `grammar/*.peggy`, `core/types/*`, `services/lsp/visitors/DirectiveVisitor.ts`, syntax generator | `npm run build:grammar && npm test grammar/tests/` | Parse/type mismatches for `/hook`; semantic token or syntax highlighting drift for new directive/filter forms | `npm run build && npm test` |

### Characterization-First Rule for Phase 3A
- Before changing lifecycle insertion points, run:
  - `npm test tests/interpreter/hooks/lifecycle-characterization.test.ts`
- After each insertion-point edit (directive or exec path), rerun:
  - `npm test tests/interpreter/hooks/lifecycle-characterization.test.ts tests/interpreter/guards/`
- Only then run broader hook suites.

### Phase 3 Signal Mapping
- If ordering assertions fail first, treat as **3A regression** (likely insertion-point drift).
- If ordering tests pass but transformed values/error aggregation fail, treat as **3B regression** (chain/error semantics).
- If failures present as recursion/timeouts or missing nested guard enforcement, treat as **3C regression** (suppression boundary).

## Phase 0 - Baseline + Contracts

### Requirements
- Freeze implementation contract for two protocol decisions before coding:
  - Pre-hook cache short-circuit protocol (`HookDecisionAction 'fulfill'` vs metadata-only short-circuit).
  - Canonical operation type keys for new hook filters (`for`, `for:iteration`, `for:batch`, `loop`, `import`).
- Add a short design note in `docs/dev` that records these decisions and rationale.
- Add an explicit migration decision table in that design note:
  - Option A: metadata short-circuit
  - Option B: `fulfill` action + compatibility layer
  - selected option, blast radius, rollback strategy
- Add `## [Unreleased]` to `CHANGELOG.md`.

### Test Coverage Work
- No new feature tests yet; establish baseline green:
  - `npm run build`
  - `npm test`

### Docs Updates
- `docs/dev/ARCHITECTURE.md`: brief note that hooks/checkpoint/resume work is in progress.
- `docs/dev/HOOKS.md`: add placeholder note for upcoming user hook layer.

### Commit
- `chore(runtime): establish hooks-checkpoint implementation contract and unreleased changelog`

### Exit Criteria
- Baseline build/tests pass.
- Protocol decisions documented.
- Unreleased changelog section present.

## Phase 0.5 - Pre-3A Risk Reduction Gates

### Requirements
- Add an ADR/design note bundle in `docs/dev` that locks:
  - hook short-circuit protocol (`metadata` vs `fulfill` and adapter contract),
  - hook suppression matrix (normal vs inside hook vs inside guard),
  - `op:for:batch` boundary semantics (window start/end and pacing expectations),
  - resume target resolution precedence (`@fn`, `@fn:index`, `@fn("prefix")`).
- Explicitly document scope for external service integration in hooks:
  - no new external-call feature is introduced,
  - hook bodies rely on existing directive capabilities (`/output`, `/run`, `/append`, `state://`, exe/MCP),
  - error isolation must cover side-effect directive failures.
- Add a lightweight hook lifecycle trace helper (test-only) to make ordering and suppression failures diagnosable in one test run.
- Add early golden integration fixtures from spec examples for:
  - hook ordering and visibility,
  - checkpoint miss/hit behavior,
  - resume and fork hit/miss semantics.
- Add checkpoint manifest versioning and atomic write strategy to implementation plan:
  - manifest `version` field,
  - temp-file + rename writes for cache/manifests,
  - forward-compatibility behavior for unknown fields.
- Add explicit guard/cache-drift handling strategy:
  - document behavior when guard/policy rules change but cache hits remain valid,
  - define optional guard/policy fingerprint recording for future invalidation tooling.

### Test Coverage Work
- Add targeted prefeature tests (or TODO-guarded scaffolds where implementation is phased):
  - lifecycle trace helper correctness,
  - checkpoint manifest schema/version read compatibility,
  - atomic write failure/recovery behavior in checkpoint manager tests.
- Commands:
  - `npm test tests/interpreter/hooks/ tests/interpreter/checkpoint/`
  - `npm run build`
  - `npm test`

### Docs Updates
- `docs/dev/HOOKS.md`: suppression matrix and lifecycle trace test references.
- `docs/dev/ARCHITECTURE.md`: checkpoint manifest/versioning and atomic persistence notes.
- `docs/user/security.md`: cache-hit behavior when guard/policy config changes (`--fresh` guidance).

### CHANGELOG
- Add `Changed` entry for pre-implementation hardening and checkpoint persistence compatibility strategy.

### Commit
- `chore(runtime): add pre-3A risk-reduction ADRs, diagnostics, and persistence compatibility gates`

### Exit Criteria
- ADR decisions for all four ambiguous semantics are written and referenced from the plan.
- Lifecycle trace helper and core prefeature risk tests are green.
- Golden spec fixtures exist for hook/checkpoint/resume-fork paths.
- Manifest versioning + atomic write strategy is documented and test-covered.

## Phase 1 - Hook Directive Grammar + AST + Type Wiring

### Requirements
- Add `hook` directive grammar using modern timing-required syntax only.
- Support filters:
  - function: `@fn` and `@fn("prefix")`
  - operation: `op:<type>`
  - data label: `<label>`
- Add new op filter values for hooks:
  - `op:for`, `op:for:iteration`, `op:for:batch`, `op:loop`, `op:import`
- Add AST/type support:
  - `DirectiveKind`/`DirectiveSubtype` extensions
  - new hook directive node types
  - exports in `core/types/index.ts`
- Wire grammar + syntax + semantic token surfaces:
  - directive dispatch in `grammar/mlld.peggy`
  - reserved directives in `grammar/base/tokens.peggy`
  - grammar deps directive enum in `grammar/deps/grammar-core.ts`
  - syntax generator keyword lists and guard/op filter regexes
  - LSP directive token grouping for `hook`

### Test Coverage Work
- Add `grammar/tests/hook.test.ts`:
  - valid syntax matrix for all filter forms
  - invalid syntax cases
  - arg-pattern parse checks
- Extend grammar type-alignment tests where needed.
- Commands:
  - `npm run build:grammar`
  - `npm test grammar/tests/`
  - `npm run build`
  - `npm test`

### Docs Updates
- `docs/dev/GRAMMAR.md`: “adding a new directive” example for `/hook`.
- `docs/user/reference.md`: add hook syntax reference table.

### CHANGELOG
- Add `Added` entry for `/hook` grammar and AST support.

### Commit
- `feat(grammar): add hook directive syntax, AST types, and parser integrations`

### Exit Criteria
- Hook grammar parses all spec forms.
- Parser/type/syntax/LSP integrations compile.
- Full test suite green.

## Phase 2 - HookRegistry + Hook Directive Evaluation

### Requirements
- Add `interpreter/hooks/HookRegistry.ts` modeled after `GuardRegistry`:
  - registration order
  - indexes for function/op/data filters
  - timing-specific retrieval (`before`/`after`)
- Store registry on `Environment` with root/child sharing semantics.
- Add `interpreter/eval/hook.ts` to register hook directives.
- Extend `dispatchDirective` in `interpreter/eval/directive.ts` to handle `kind === 'hook'`.

### Test Coverage Work
- Add `tests/interpreter/hooks/HookRegistry.test.ts`:
  - registration order
  - timing filtering
  - function/op/data indexing
  - parent/child visibility
- Add directive eval tests:
  - hook directive registers without side effects
  - duplicate-name behavior (if enforced)
- Commands:
  - `npm test tests/interpreter/hooks/`
  - `npm run build`
  - `npm test`

### Docs Updates
- `docs/dev/HOOKS.md`: new “User Hook Registry” section.
- `docs/dev/ARCHITECTURE.md`: include HookRegistry in security/runtime map.

### CHANGELOG
- Add `Added` entry for user hook registration subsystem.

### Commit
- `feat(hooks): add HookRegistry and /hook directive registration path`

### Exit Criteria
- Hook definitions are stored/retrieved deterministically.
- Directive registration path is live.
- Full test suite green.

## Phase 2.5 - Lifecycle Characterization Baseline (Pre-Phase 3)

### Requirements
- Add characterization tests that pin current behavior before lifecycle refactors:
  - directive path ordering around `HookManager.runPre`/execution/`runPost`
  - exec invocation path ordering around `runExecPreGuards`/execution/`runExecPostGuards`
  - current guard suppression behavior for nested guard-evaluated operations
- Capture the exact expected sequence in assertions (event logs), not only success/failure.

### Test Coverage Work
- Add `tests/interpreter/hooks/lifecycle-characterization.test.ts`:
  - baseline order snapshots for directive and exec boundaries
  - guard-only nested invocation expectations
- Commands:
  - `npm test tests/interpreter/hooks/lifecycle-characterization.test.ts`
  - `npm run build`
  - `npm test`

### Docs Updates
- `docs/dev/HOOKS.md`: add a short “Characterization Baseline” note with test file reference.

### CHANGELOG
- Add `Added` entry for lifecycle characterization coverage.

### Commit
- `test(hooks): add lifecycle characterization baseline before hook lifecycle refactor`

### Exit Criteria
- Baseline lifecycle ordering is pinned in dedicated tests.
- Full test suite green.

## Phase 3 - User Hook Execution Runtime (Risk-Split Lifecycle Refactor)

### Requirements
- Add user hook execution engine (new runner module):
  - resolve matching hooks by operation/function/data filter
  - run all hooks in registration order
  - isolate errors (collect; do not throw)
  - chain return transforms for `before` and `after`

### Sub-phase 3A - Ordering-only Insertion (No Transforms Yet)

#### Requirements
- Insert user hook lifecycle calls with ordering only:
  - user `before` -> built-in pre-hooks -> execute -> built-in post-hooks -> user `after`
- Do not enable value-transform chaining yet; observation mode only.
- Integrate at directive + exec + effect boundaries.

#### Test Coverage Work
- Extend characterization suite with new expected order:
  - user hooks around guard hooks in both directive and exec paths
  - effect path ordering parity
- Ensure all existing guard tests remain green with no behavior drift.
- Commands:
  - `npm test tests/interpreter/hooks/lifecycle-characterization.test.ts tests/interpreter/guards/`
  - `npm run build`
  - `npm test`

#### Docs Updates
- `docs/dev/HOOKS.md`: lifecycle diagram updated with user hook slots.

#### CHANGELOG
- Add `Changed` entry for hook lifecycle layering.

#### Commit
- `feat(hooks): insert user hook lifecycle ordering around built-in guard hooks`

#### Exit Criteria
- Ordering assertions are green and explicit.
- Guard behavior unchanged.
- Full test suite green.

### Sub-phase 3B - Transform + Error Isolation

#### Requirements
- Enable chained transforms for user `before` and `after` hooks.
- Add error collection isolation (`@mx.hooks.errors`) without operation abort.
- Add function-target matching including arg-prefix (`startsWith`) semantics.
- Guarantee hook bodies execute as regular mlld blocks with full directive set access:
  - `/output`, `/run`, `/append`, `state://`, executable calls, MCP-backed executables.
- Ensure error isolation wraps side-effect directive failures inside hooks:
  - failed `state://` write, failed `/run`, failed `/append` are captured and logged in hook errors,
  - parent operation continues.

#### Test Coverage Work
- Add/extend `tests/interpreter/hooks/user-hooks.test.ts`:
  - before transform chaining
  - after transform chaining
  - per-hook error capture and continued execution
  - function hook + arg-prefix matching
  - `output ... to "state://telemetry"` from hook body emits structured event successfully
  - side-effect failure inside hook body does not fail parent operation and is recorded in `@mx.hooks.errors`
  - hook body can call existing executables (including MCP-backed executables where test harness supports it)
- Commands:
  - `npm test tests/interpreter/hooks/`
  - `npm run build`
  - `npm test`

#### Docs Updates
- `docs/dev/HOOKS.md`: transform and error-isolation semantics.
- `docs/user/security.md`: hooks-vs-guards behavior note.
- `docs/user/reference.md`: add hook observability patterns for `state://` and external notifications.

#### CHANGELOG
- Add `Added` entry for user hook transform chaining and error isolation.

#### Commit
- `feat(hooks): add chained transforms and isolated hook error collection`

#### Exit Criteria
- Transform and error semantics match spec.
- Full test suite green.

### Sub-phase 3C - Non-reentrancy Boundary Hardening

#### Requirements
- Add hook suppression context so nested operations triggered by hooks do not fire hooks again.
- Preserve guard execution for nested operations triggered by hooks (hooks suppressed, guards still active).
- Keep existing guard suppression behavior unchanged during guard evaluation.

#### Test Coverage Work
- Add dedicated boundary tests:
  - hook-calls-function => nested hooks do not fire
  - same nested call still evaluates guards
  - guard-evaluation nested operations continue to suppress guards as today
- Commands:
  - `npm test tests/interpreter/hooks/ tests/interpreter/guards/`
  - `npm run build`
  - `npm test`

#### Docs Updates
- `docs/dev/HOOKS.md`: explicit non-reentrancy matrix:
  - normal execution
  - inside hook
  - inside guard

#### CHANGELOG
- Add `Fixed`/`Changed` entry for hook non-reentrancy boundary semantics.

#### Commit
- `fix(hooks): enforce hook non-reentrancy while preserving nested guard execution`

#### Exit Criteria
- Reentrancy boundary is pinned by tests.
- No recursion loops.
- Guard suppression behavior remains intact.
- Full test suite green.

## Phase 4 - Operation Context Expansion (`for`/`loop`/`import` + Batch Hooks)

### Requirements
- Emit operation contexts for:
  - `for` (loop boundary)
  - `for:iteration` (each item)
  - `for:batch` (parallel concurrency windows)
  - `loop`
  - `import`
- Extend context payload for loop hooks:
  - `@mx.for.index`, `@mx.for.total`, `@mx.for.key`, `@mx.for.parallel`
  - `@mx.for.batchIndex`, `@mx.for.batchSize`
- Add batch callback plumbing to `runWithConcurrency` (or wrapper) without breaking current behavior.

### Test Coverage Work
- Extend `interpreter/eval/for.characterization.test.ts`:
  - iteration context values in sequential and parallel loops
  - batch context emissions for parallel loops
- Add hook integration tests:
  - `hook after op:for:iteration` visibility
  - `hook before/after op:for:batch` visibility
- Commands:
  - `npm test interpreter/eval/for.characterization.test.ts tests/interpreter/hooks/`
  - `npm run build`
  - `npm test`

### Docs Updates
- `docs/dev/HOOKS.md`: operation context section adds new op types and fields.
- `docs/user/flow-control.md`: add loop-hook examples using `@mx.for.*`.

### CHANGELOG
- Add `Added` entry for `op:for:iteration` and `op:for:batch` hook contexts.

### Commit
- `feat(hooks): emit loop iteration and batch operation contexts`

### Exit Criteria
- New operation context types are emitted with correct metadata.
- Hook filters match these new operations.
- Full test suite green.

## Phase 5 - CheckpointManager Core (Storage + Hashing + Invalidation APIs)

### Requirements
- Add `interpreter/checkpoint/CheckpointManager.ts`:
  - `load`, `get`, `put`, `clear`, `getStats`
  - invalidation APIs for function and fuzzy pattern matching
  - fork/overlay read support (read-only parent cache + local writable cache)
- Implement cache layout:
  - `.mlld/checkpoints/<script>/llm-cache.jsonl`
  - `.mlld/checkpoints/<script>/manifest.json`
  - `.mlld/checkpoints/<script>/results/sha256-*.json`
- Implement deterministic key computation from function + args with serialization fallback.
- Add corruption tolerance (skip bad lines, preserve valid entries).

### Test Coverage Work
- New unit test file `tests/interpreter/checkpoint/CheckpointManager.test.ts`:
  - key determinism and change sensitivity
  - write/read roundtrip
  - reload from disk
  - invalidation by function/pattern
  - clear/fresh behavior
  - fork read-only source behavior
- Commands:
  - `npm test tests/interpreter/checkpoint/`
  - `npm run build`
  - `npm test`

### Docs Updates
- `docs/dev/ARCHITECTURE.md`: add checkpoint manager placement.
- `docs/dev/TESTS.md`: note checkpoint fixture strategy.

### CHANGELOG
- Add `Added` entry for checkpoint manager and disk cache format.

### Commit
- `feat(checkpoint): add persistent checkpoint manager with invalidation APIs`

### Exit Criteria
- Checkpoint manager API is stable and fully unit-tested.
- Cache persistence works across runs.
- Full test suite green.

## Phase 6 - Built-in Checkpoint Hooks + Runtime Short-Circuit (Risk-Split Protocol Rollout)

### Requirements
- Add:
  - `interpreter/hooks/checkpoint-pre-hook.ts`
  - `interpreter/hooks/checkpoint-post-hook.ts`

### Sub-phase 6A - Protocol Adapter + Hot-path Safety

#### Requirements
- Implement the chosen Phase 0 protocol behind an adapter:
  - metadata path: centralized cache-hit inspector helper, or
  - `fulfill` path: compatibility mapping in hook decision handling so guard flows are unchanged.
- Add no-op checkpoint hooks first and wire registration order.
- Do not short-circuit execution yet; assert adapter plumbing only.

#### Test Coverage Work
- Add protocol tests:
  - guard decision handling unchanged for `continue|abort|retry|deny`
  - adapter behavior for chosen checkpoint protocol
- Commands:
  - `npm test tests/interpreter/checkpoint/ tests/interpreter/hooks/ tests/interpreter/guards/`
  - `npm run build`
  - `npm test`

#### Docs Updates
- `docs/dev/HOOKS.md`: note selected checkpoint short-circuit protocol.

#### CHANGELOG
- Add `Changed` entry for hook decision protocol adapter.

#### Commit
- `refactor(checkpoint): add checkpoint decision adapter before cache-hit execution short-circuit`

#### Exit Criteria
- Protocol adapter is in place with green compatibility tests.
- No behavior change yet to execution path.
- Full test suite green.

### Sub-phase 6B - Cache-hit Short-circuit + Semantics

#### Requirements
- Enable real cache-hit short-circuit on directive/exec/effect paths.
- Ensure checkpoint targeting is label-based (`llm` label on operation context labels).
- Set checkpoint context fields:
  - `@mx.checkpoint.hit`
  - `@mx.checkpoint.key`
- Enforce semantics:
  - user hooks run on hit and miss
  - guards run only on misses
  - cached result still passes through user `after` hooks

#### Test Coverage Work
- Add integration tests under `tests/interpreter/checkpoint/`:
  - miss then hit behavior
  - guard skip on hit
  - user hooks still observe hits
  - telemetry hook using `state://` fires on both hit and miss (`@mx.checkpoint.hit` differentiates path)
  - post-hook writes only on misses
  - per-item caching inside `for parallel`
- Commands:
  - `npm test tests/interpreter/checkpoint/ tests/interpreter/hooks/ tests/interpreter/guards/`
  - `npm run build`
  - `npm test`

#### Docs Updates
- `docs/dev/HOOKS.md`: built-in checkpoint hooks and ordering.
- `docs/user/reference.md`: checkpoint context variables.
- `docs/user/security.md`: cache-hit vs guard evaluation caveat.

#### CHANGELOG
- Add `Added` entry for checkpoint pre/post hooks and cache-hit short-circuiting.

#### Commit
- `feat(checkpoint): enable cache-hit short-circuiting with checkpoint hook semantics`

#### Exit Criteria
- Cache hits bypass execution correctly and safely.
- Hook/guard interaction semantics match spec.
- Full test suite green.

## Phase 7 - CLI/SDK Wiring (`--checkpoint`, `--fresh`, `--resume`, `--fork`) + `mlld checkpoint`

### Requirements
- Extend run option parsing and execution path:
  - `--checkpoint`
  - `--fresh`
  - `--resume` (optional target string)
  - `--fork <script>`
- Ensure new run flags are excluded from `@payload` unknown-flag injection.
- Add checkpoint command surface:
  - `mlld checkpoint list <script>`
  - `mlld checkpoint inspect <script>`
  - `mlld checkpoint clean <script>`
- Extend SDK/interpreter options so non-CLI consumers can configure checkpointing.

### Test Coverage Work
- Extend `cli/commands/run.test.ts`:
  - flag parsing and forwarding
  - payload exclusion for known checkpoint flags
- Add `cli/commands/checkpoint.test.ts` for list/inspect/clean command behavior.
- Add SDK option propagation tests (`sdk/execute` path).
- Commands:
  - `npm test cli/commands/run.test.ts cli/commands/checkpoint.test.ts sdk/`
  - `npm run build`
  - `npm test`

### Docs Updates
- `docs/user/cli.md`: all new run/checkpoint command usage and examples.
- `docs/user/reference.md`: CLI option reference and semantics.

### CHANGELOG
- Add `Added` entry for new CLI flags and checkpoint subcommand.

### Commit
- `feat(cli): add checkpoint/resume/fork run flags and checkpoint management commands`

### Exit Criteria
- CLI and SDK can configure checkpoint behavior end-to-end.
- New flags do not pollute `@payload`.
- Full test suite green.

## Phase 8 - Resume + Fuzzy Cursor + Fork Semantics

### Requirements
- Implement `--resume` semantics:
  - resume implies checkpoint behavior
  - full rerun with cache reuse
- Implement targeted invalidation:
  - `@function`
  - `@function:index`
  - `@function("prefix")` fuzzy item cursor
- Implement invocation-site indexing for ambiguous function names.
- Implement `--fork` semantics:
  - load source script cache read-only
  - resolve hits against fork source then local cache
  - write new entries only to local target script cache

### Test Coverage Work
- Integration tests in `tests/interpreter/checkpoint/resume-fork.test.ts` (or fixture equivalents):
  - resume no target
  - resume function target
  - resume function index target
  - resume fuzzy cursor in parallel loop
  - fork hit/miss matrix for changed model/prompt args
  - read-only source cache guarantee
- Commands:
  - `npm test tests/interpreter/checkpoint/`
  - `npm run build`
  - `npm test`

### Docs Updates
- `docs/user/flow-control.md`: resume/fuzzy examples for parallel loops.
- `docs/user/reference.md`: exact resume target syntax.
- `docs/user/cli.md`: fork workflow examples.

### CHANGELOG
- Add `Added` entry for resumable execution and script cache forking.

### Commit
- `feat(checkpoint): implement resume targeting, fuzzy invalidation, and forked cache overlays`

### Exit Criteria
- Resume and fork behavior match spec examples.
- Invalidations are deterministic and test-covered.
- Full test suite green.

## Phase 9 - Final Docs, Coverage Audit, Release Readiness

### Requirements
- Complete docs sweep for all affected docs:
  - Dev: `ARCHITECTURE.md`, `GRAMMAR.md`, `TESTS.md`, `HOOKS.md`
  - User: `cli.md`, `reference.md`, `flow-control.md`, `security.md`
- Add end-to-end fixture cases under `tests/cases/integration/` for real scripts that combine:
  - hooks + checkpoint
  - checkpoint + guards
  - resume + parallel loops
  - fork + changed prompts/models
  - hooks + `state://`/external emission patterns (`output`, `run`, `append`) with non-fatal hook error handling
- Ensure docs examples compile/parse via fixture generation.

### Test Coverage Work
- Run and verify:
  - `npm run build:fixtures`
  - `npm run build`
  - `npm test`
  - `npm run test:coverage`
- Address any uncovered critical paths introduced in phases 1-8.

### CHANGELOG
- Consolidate `Unreleased` entries into clean categories.
- Ensure every phase has corresponding changelog entries.

### Commit
- `docs(testing): finalize hooks-checkpoint-resume docs, fixtures, and coverage gates`

### Exit Criteria
- Documentation is complete and consistent with shipped behavior.
- Coverage and full regression are green.
- Changelog is complete for release cut.

## Integration Risk Checklist (Track During Execution)
- `evaluateDirective` currently precomputes `/var` assignment inputs; ensure no checkpoint/hook ordering regressions.
- Existing hook decision handling is guard-centric; adding checkpoint short-circuit must not break guard denial/retry flows.
- Hook suppression boundary must be exact: nested operations from hooks suppress hooks but still execute guards.
- Hook bodies must retain full directive capability; no accidental sandboxing/regression that blocks `state://`, `/run`, or `/append` usage in hooks.
- Hook error isolation must include side-effect directive failures; observability sink outages must never abort pipeline execution.
- For-batch hook emission must not regress parallel scheduler throughput or ordering guarantees.
- CLI unknown-flag-to-`@payload` behavior must exclude new checkpoint flags.
- Grammar/type/LSP/syntax keyword sets must stay synchronized.

## End-State Definition of Done
1. `/hook` directive supports function/op/data filters with `before`/`after`.
2. User hooks execute around built-in guard/taint/checkpoint lifecycle with correct ordering and tested non-reentrancy boundaries.
3. `llm`-labeled invocations are checkpointed and reused across reruns.
4. `--resume` and `--fork` behavior works as specified, including fuzzy parallel cursor invalidation.
5. CLI and SDK surfaces support checkpoint/resume/fork.
6. Dev and user docs are fully updated.
7. All tests pass, including coverage and fixture/docs validation.
8. Hook observability patterns (`state://`, external notifications via existing directives) are verified and documented; hook-side failures remain non-fatal.
