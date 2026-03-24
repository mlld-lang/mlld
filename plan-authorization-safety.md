# Plan: Authorization Safety, Exe Control Args, and Inherited Positive Checks

## Overview

This plan implements the four required mlld changes described in `/Users/adam/mlld/evals/spec-authorization-safety.md`:

1. `exe ... with { controlArgs }`
2. Runtime rejection of unconstrained authorization on the exe/native-tool bridge path
3. Named-arg descriptors in policy guards
4. Authorization guards that inherit positive-check requirements from built-in policy rules

The goal is to close the confirmed `send_money: {}` breach on the native tool path, make executable metadata the source of truth for control-arg enforcement, and ensure planner authorization cannot override `known` / `untrusted` policy checks just by matching raw values. Scope includes runtime, bridge plumbing, validation/analyze coverage, tests, and `docs/src/atoms` updates. Benchmark/agent generator changes are follow-on integration work and are not part of this mlld implementation plan.

Every phase below has a hard gate: add phase-appropriate coverage in the same change, run the targeted suites, then run the broader suite before moving on. Follow [docs/dev/TESTS.md](./docs/dev/TESTS.md) throughout.

## Must-Read References

- `/Users/adam/mlld/evals/spec-authorization-safety.md`
- [docs/dev/TESTS.md](./docs/dev/TESTS.md)
- [core/types/executable.ts](./core/types/executable.ts)
- [interpreter/eval/exe.ts](./interpreter/eval/exe.ts)
- [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts)
- [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts)
- [core/policy/authorizations.ts](./core/policy/authorizations.ts)
- [interpreter/hooks/guard-pre-hook.ts](./interpreter/hooks/guard-pre-hook.ts)
- [interpreter/hooks/guard-runtime-evaluator.ts](./interpreter/hooks/guard-runtime-evaluator.ts)
- [interpreter/guards/GuardRegistry.ts](./interpreter/guards/GuardRegistry.ts)
- [core/policy/guards.ts](./core/policy/guards.ts)
- [interpreter/env/executors/call-mcp-config.ts](./interpreter/env/executors/call-mcp-config.ts)
- [interpreter/env/executors/function-mcp-bridge.ts](./interpreter/env/executors/function-mcp-bridge.ts)
- [cli/mcp/FunctionRouter.ts](./cli/mcp/FunctionRouter.ts)
- [cli/commands/analyze.ts](./cli/commands/analyze.ts)
- [docs/src/atoms/core/14-exe--metadata.md](./docs/src/atoms/core/14-exe--metadata.md)
- [docs/src/atoms/config/04-policy--basics.md](./docs/src/atoms/config/04-policy--basics.md)
- [docs/src/atoms/config/07b-policy--authorizations.md](./docs/src/atoms/config/07b-policy--authorizations.md)
- [docs/src/atoms/effects/13-guards--basics.md](./docs/src/atoms/effects/13-guards--basics.md)
- [docs/src/atoms/effects/15-guards--privileged.md](./docs/src/atoms/effects/15-guards--privileged.md)
- [docs/src/atoms/security/01-security-getting-started.md](./docs/src/atoms/security/01-security-getting-started.md)

## Current State

- Executables already support metadata via `with { ... }`, but only `description` is materialized onto the executable definition today in [interpreter/eval/exe.ts](./interpreter/eval/exe.ts).
- `policy.authorizations` validation exists and is correct when trusted tool metadata comes from a scoped `var tools` collection.
- Runtime authorization tool context is built only from scoped tool collections in [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts); the direct exe/native-tool path does not supply trusted `controlArgs`.
- The native function-tool bridge creates temporary tool descriptors and temporary executable names. That path preserves enough to call the tool, but not enough to validate `policy.authorizations` against exe-declared control args.
- User guards and denied handlers already expose named arg descriptors through `@mx.args`, but policy guard functions currently receive only raw `args` and positional input descriptors.
- Built-in rules such as `no-send-to-unknown` and `no-destroy-unknown` are implemented as separate privileged policy guards. Unlocked policy denies can be overridden by authorization-generated allows, which is the current breach.

## Goals

- Make executable declarations the trusted source of `controlArgs`.
- Preserve that metadata through native tool calling and regular exe invocation.
- Reject `true`, `{}`, and incomplete control-arg coverage on write tools on every runtime path.
- Give policy guards named arg descriptors so authorization logic can reason about labels/taint by arg name, not by position.
- Make authorization-generated privileged guards enforce inherited positive checks from built-in policy rules before they allow.

## Non-Goals

- Redesigning `policy.authorizations` syntax.
- Changing the user-facing `@mx.args` surface for normal guards.
- Adding support for passing `var tools` directly into `config.tools` in this rollout.
- Changing benchmark generator code in this repo.

## Locked Decisions

1. **One sequential plan.**
   - The four required changes land in order.
   - Step 3 exists to enable Step 4; it is not optional.

2. **Executable metadata is the source of truth for `controlArgs`.**
   - `var tools` entries inherit from the referenced exe by default.
   - Tool collections may only tighten or restate control args for their local exposure shape.

3. **No grammar change is expected.**
   - `with { ... }` is already open-ended in the AST/types.
   - The plan assumes `controlArgs` is added through executable materialization and validation, not parser work, unless a characterization test proves otherwise.

4. **Native tool calling must preserve the exposed tool name, not just labels.**
   - `policy.authorizations.allow` keys are exact operation names.
   - The function bridge must surface the original exposed tool name in operation context rather than the temp `__toolbridge_fn_*` name.

5. **Fail closed on missing metadata, per the spec.**
   - If a `tool:w` operation reaches `policy.authorizations` without trusted `controlArgs`, runtime treats all declared parameters as control args and requires explicit pinning for all of them.
   - This is stricter than the current scoped-tools-only model and is intentional.

6. **Inherited positive checks happen inside the authorization guard condition.**
   - Do not change guard precedence or the reducer.
   - Authorization allow is granted only if both arg-value matching and inherited positive checks pass.

7. **Step 4 uses explicit internal selector logic for rule-to-arg mapping.**
   - No positional fallback in the final authorization path.
   - A small internal selector table maps built-in policy rules plus operation labels to the named args whose descriptors must be checked.
   - The initial selector set must cover the benchmark/tool names we already rely on (`recipient`, `recipients`, `cc`, `bcc`, `id`) and be tested explicitly.

8. **Policy-guard named args are an internal API extension, not a new user language feature.**
   - Users already have `@mx.args`.
   - This work extends `PolicyConditionContext` only.

## Phase 0 - Baseline, Spec Alignment, and Test Gate Freeze (≈0.5 day)

**Goal**: Freeze the contracts before touching runtime code.

### Tasks

1. Copy the locked decisions from this plan back into the external spec if that spec remains the source of truth.
2. Confirm the baseline suites for the affected subsystems:
   - [core/policy/authorizations.test.ts](./core/policy/authorizations.test.ts)
   - [core/policy/guards-defaults.test.ts](./core/policy/guards-defaults.test.ts)
   - [cli/commands/analyze.test.ts](./cli/commands/analyze.test.ts)
   - [interpreter/env/executors/function-mcp-bridge.test.ts](./interpreter/env/executors/function-mcp-bridge.test.ts)
   - [interpreter/env/executors/call-mcp-config.test.ts](./interpreter/env/executors/call-mcp-config.test.ts)
   - [interpreter/eval/env-mcp-config.test.ts](./interpreter/eval/env-mcp-config.test.ts)
   - [interpreter/eval/tools-collection.test.ts](./interpreter/eval/tools-collection.test.ts)
   - [tests/interpreter/hooks/guard-runtime-evaluator.test.ts](./tests/interpreter/hooks/guard-runtime-evaluator.test.ts)
   - [tests/interpreter/hooks/guard-pre-hook.test.ts](./tests/interpreter/hooks/guard-pre-hook.test.ts)
3. Decide the initial internal selector list for Step 4 and record it in the implementation PR description.

### Testing

- Run the current targeted baseline for the suites above.
- Run `npm test` once before Phase 1 work starts.

### Exit Criteria

- [ ] Locked decisions are agreed and written down.
- [ ] Baseline suites are identified.
- [ ] Step 4 selector contract is frozen for the initial rollout.
- [ ] `npm test` passes before Phase 1 begins.

**Deliverable**: Implementation contracts and test gates are frozen.

## Phase 1 - Exe-Level `controlArgs` Metadata (≈1 day)

**Goal**: Executables can declare `controlArgs`, and that metadata survives normal executable creation/import/export paths.

### Tasks

1. **Executable type surface** - [core/types/executable.ts](./core/types/executable.ts)
   - Add `controlArgs?: string[]` to `BaseExecutable`.
   - Ensure cloned/normalized executable descriptors preserve it.

2. **Exe materialization** - [interpreter/eval/exe.ts](./interpreter/eval/exe.ts)
   - Read `directive.values?.withClause?.controlArgs`.
   - Normalize to a string array.
   - Validate every declared control arg against `paramNames`.
   - Store normalized control args on `executableDef`.

3. **Exe characterization and imports**
   - [interpreter/eval/exe.characterization.test.ts](./interpreter/eval/exe.characterization.test.ts)
   - [interpreter/eval/import/variable-importer/executable/ExecutableImportRehydrator.ts](./interpreter/eval/import/variable-importer/executable/ExecutableImportRehydrator.ts)
   - [interpreter/eval/import/variable-importer/ModuleExportSerializer.ts](./interpreter/eval/import/variable-importer/ModuleExportSerializer.ts)
   - Verify exported/imported executables keep `controlArgs` the same way `description` and `paramTypes` do.

4. **Static analysis context** - [cli/commands/analyze.ts](./cli/commands/analyze.ts)
   - Teach validation-context extraction to read exe-level `controlArgs`.
   - Keep tool-collection `controlArgs` support, but merge exe metadata first.

### Tests To Add

1. Unit/characterization coverage:
   - Extend [interpreter/eval/exe.characterization.test.ts](./interpreter/eval/exe.characterization.test.ts) with:
     - exe with `with { controlArgs: [...] }`
     - empty `controlArgs: []`
     - invalid arg names rejected
   - Extend executable import/export tests so `controlArgs` round-trip.

2. Analyze coverage:
   - Extend [cli/commands/analyze.test.ts](./cli/commands/analyze.test.ts) to validate exe-declared `controlArgs` without requiring a `var tools` wrapper.

3. Fixture coverage per [docs/dev/TESTS.md](./docs/dev/TESTS.md):
   - Add a valid fixture under `tests/cases/feat/policy/` showing exe metadata declaration.
   - Add an invalid or exception fixture if parser/runtime validation messages need user-visible coverage.

### Testing

- Run the exe characterization/import tests.
- Run `cli/commands/analyze.test.ts`.
- Run the new policy fixture(s).
- Run `npm test`.

### Exit Criteria

- [ ] Executables persist `controlArgs` in runtime definitions.
- [ ] Invalid exe-declared control args fail early.
- [ ] Analyze/validate sees exe-level metadata.
- [ ] New tests exist for runtime, import/export, and analyze coverage.
- [ ] `npm test` passes before Phase 2 begins.

**Deliverable**: `controlArgs` is first-class executable metadata.

## Phase 2 - Runtime Authorization Validation on Every Tool Path (≈1.5 days)

**Goal**: `policy.authorizations` uses merged exe/tool metadata and rejects unconstrained or incomplete auth on both scoped-tool and native-tool bridge paths.

### Tasks

1. **Merged metadata lookup** - [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts) and [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts)
   - Replace the scoped-tools-only metadata lookup with merged metadata from:
     - exe definition
     - matching scoped tool entry, if any
   - Preserve labels and `controlArgs`.
   - Tool collection overrides may only tighten.

2. **Authorization validation source of truth** - [core/policy/authorizations.ts](./core/policy/authorizations.ts)
   - Reuse existing constrained/unconstrained validation.
   - When trusted `controlArgs` is absent on a `tool:w` path, derive the effective control-arg set from the exe parameter list per the fail-closed rule.

3. **Native bridge metadata preservation**
   - [interpreter/env/executors/call-mcp-config.ts](./interpreter/env/executors/call-mcp-config.ts)
   - [interpreter/env/executors/function-mcp-bridge.ts](./interpreter/env/executors/function-mcp-bridge.ts)
   - [cli/mcp/FunctionRouter.ts](./cli/mcp/FunctionRouter.ts)
   - Preserve:
     - exposed/original tool name
     - labels
     - `controlArgs`
   - Ensure authorization matching keys against the exposed tool name, not the temp executable name.

4. **Invocation-time gate** - [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts)
   - Make `shouldValidatePolicyAuthorizations` fire for native tool calls when effective tool metadata marks the operation as `tool:w`.
   - Preserve the existing `var tools` behavior.

### Tests To Add

1. Authorization unit tests:
   - Extend [core/policy/authorizations.test.ts](./core/policy/authorizations.test.ts) for:
     - exe-level control args
     - fail-closed “all params are control args” behavior
     - merged exe/tool metadata behavior

2. Bridge/config tests:
   - Extend [interpreter/env/executors/function-mcp-bridge.test.ts](./interpreter/env/executors/function-mcp-bridge.test.ts) to verify labels/controlArgs/original tool name survive the bridge.
   - Extend [interpreter/env/executors/call-mcp-config.test.ts](./interpreter/env/executors/call-mcp-config.test.ts) to verify function tools preserve their exposed names and metadata.

3. Runtime integration tests:
   - Add or extend [interpreter/eval/env-mcp-config.test.ts](./interpreter/eval/env-mcp-config.test.ts) and/or [interpreter/eval/tools-collection.test.ts](./interpreter/eval/tools-collection.test.ts) with:
     - native tool path rejects `send_money: {}`
     - native tool path rejects `send_money: true`
     - native tool path accepts fully pinned auth
     - unlisted tool remains denied

4. Fixture coverage per [docs/dev/TESTS.md](./docs/dev/TESTS.md):
   - Add exception fixtures under `tests/cases/exceptions/security/` for bridge-path unconstrained auth.
   - Add valid fixtures under `tests/cases/feat/policy/` for pinned bridge-path auth.
   - Keep any support filenames globally unique.

### Testing

- Run the authorization unit tests.
- Run the bridge/config/runtime suites.
- Run the new exception/feature fixtures.
- Run `npm test`.

### Exit Criteria

- [ ] Native tool calling validates `policy.authorizations` with trusted metadata.
- [ ] Unconstrained `{}` / `true` is rejected on write tools with control args.
- [ ] Authorization keys resolve against the exposed tool name on the bridge path.
- [ ] New unit, integration, and fixture coverage exists for the bridge path.
- [ ] `npm test` passes before Phase 3 begins.

**Deliverable**: The confirmed breach is closed on every runtime path.

## Phase 3 - Named-Arg Descriptors in Policy Guards (≈1 day)

**Goal**: Policy guard functions receive the same named arg-descriptor view that user guards already use indirectly through `@mx.args`.

### Tasks

1. **Policy guard context type** - [interpreter/guards/GuardRegistry.ts](./interpreter/guards/GuardRegistry.ts)
   - Extend `PolicyConditionContext` with named arg descriptors, not just raw `args`.
   - Keep the existing raw `args` map for tolerant value matching.

2. **Named descriptor construction** - [interpreter/hooks/guard-runtime-evaluator.ts](./interpreter/hooks/guard-runtime-evaluator.ts)
   - Build a named arg-descriptor map from the existing guard arg snapshot.
   - Surface labels, taint, and sources by arg name.
   - Preserve current behavior for guards that do not inspect named descriptors.

3. **Dispatch plumbing**
   - [interpreter/eval/exec/guard-policy.ts](./interpreter/eval/exec/guard-policy.ts)
   - [interpreter/hooks/guard-pre-hook.ts](./interpreter/hooks/guard-pre-hook.ts)
   - Reuse the existing guard arg-name metadata path rather than inventing a second name source.

### Tests To Add

1. Guard runtime unit tests:
   - Extend [tests/interpreter/hooks/guard-runtime-evaluator.test.ts](./tests/interpreter/hooks/guard-runtime-evaluator.test.ts) for policy-condition access to named arg descriptors.

2. Integration tests:
   - Extend [tests/interpreter/hooks/guard-pre-hook.test.ts](./tests/interpreter/hooks/guard-pre-hook.test.ts) with policy-generated guards that inspect named arg labels/taint.

3. Regression tests:
   - Keep user-guard `@mx.args` coverage green in existing guard tests.
   - Add a regression proving raw `args` value matching still works alongside named descriptors.

### Testing

- Run the guard runtime and pre-hook suites.
- Run `npm test`.

### Exit Criteria

- [ ] Policy condition functions can inspect named arg descriptors.
- [ ] Raw `args` matching behavior is unchanged.
- [ ] Existing user-guard named-arg behavior is unchanged.
- [ ] New tests cover policy guard named descriptors directly.
- [ ] `npm test` passes before Phase 4 begins.

**Deliverable**: Policy guards can reason about arg metadata by name.

## Phase 4 - Authorization Guards Inherit Positive Checks (≈1.5 days)

**Goal**: Authorization-generated privileged guards only allow when both value constraints and inherited positive checks pass.

### Tasks

1. **Inherited-check selector table** - [core/policy/guards.ts](./core/policy/guards.ts) or a small sibling helper
   - Add an internal selector table that maps built-in policy rules plus operation labels to the named args whose descriptors must be checked.
   - Initial required coverage:
     - `no-send-to-unknown`
     - `no-send-to-external`
     - `no-destroy-unknown`
     - `no-untrusted-privileged`
   - Initial required arg names:
     - send-like: `recipient`, `recipients`, `cc`, `bcc`
     - targeted destructive: `id`
   - If needed, store this helper near the built-in policy guards so the selector logic and user-facing rule definitions stay in one place.

2. **Authorization guard enforcement** - [interpreter/hooks/guard-pre-hook.ts](./interpreter/hooks/guard-pre-hook.ts)
   - After `evaluatePolicyAuthorizationDecision()` succeeds, evaluate inherited positive checks using the named arg descriptors from Phase 3.
   - Deny from the authorization guard itself when inherited checks fail.
   - Keep this inside the authorization guard so the reducer/override model does not change.

3. **Operation metadata if needed**
   - [interpreter/eval/exec/guard-policy.ts](./interpreter/eval/exec/guard-policy.ts)
   - Add any minimal metadata needed so the authorization guard can determine which inherited checks apply for the current operation.
   - Reuse existing operation labels and active policy summary before adding new metadata.

4. **Rule-specific behavior**
   - `no-send-to-unknown`: all selected destination args must carry `known`
   - `no-send-to-external`: all selected destination args must carry `known:internal`
   - `no-destroy-unknown`: all selected target args must carry `known`
   - `no-untrusted-privileged`: deny if any named arg selected for the privileged operation carries `untrusted` taint

### Tests To Add

1. Built-in rule selector tests:
   - Extend [core/policy/guards-defaults.test.ts](./core/policy/guards-defaults.test.ts) or add a sibling unit file for named-arg selector logic.

2. Authorization guard integration tests:
   - Extend [tests/interpreter/hooks/guard-pre-hook.test.ts](./tests/interpreter/hooks/guard-pre-hook.test.ts) and [interpreter/eval/tools-collection.test.ts](./interpreter/eval/tools-collection.test.ts) with:
     - pinned auth + known recipient -> allow
     - pinned auth + unknown recipient -> deny despite matching auth
     - pinned auth + known target -> allow
     - pinned auth + unknown target -> deny
     - privileged op + untrusted arg -> deny despite matching auth

3. Native bridge integration:
   - Add a bridge-path version of at least one inherited positive-check scenario in [interpreter/eval/env-mcp-config.test.ts](./interpreter/eval/env-mcp-config.test.ts) or a dedicated native tool integration test.

4. Fixture coverage per [docs/dev/TESTS.md](./docs/dev/TESTS.md):
   - Add feature fixtures under `tests/cases/feat/policy/` for allow scenarios.
   - Add exception fixtures under `tests/cases/exceptions/security/` for deny scenarios.
   - Where a fixture writes or reads files, assert through the virtual filesystem rather than external side effects.

### Testing

- Run the built-in policy guard tests.
- Run the authorization/guard integration suites.
- Run the new feature and exception fixtures.
- Run `npm test`.

### Exit Criteria

- [ ] Authorization allows no longer punch through inherited `known` / `known:internal` / `untrusted` checks.
- [ ] Inherited checks are enforced inside the authorization guard path.
- [ ] Both scoped-tool and native-tool paths are covered.
- [ ] New tests exist for each shipped inherited rule.
- [ ] `npm test` passes before docs/final cleanup begins.

**Deliverable**: Planner authorization is necessary but not sufficient; positive checks remain authoritative.

## Phase 5 - Docs, Fixtures, and Release Cleanup (≈1 day)

**Goal**: Update the user-facing atoms, rebuild doc fixtures, and leave a clean release surface.

### Required `docs/src/atoms` Updates

1. [docs/src/atoms/core/14-exe--metadata.md](./docs/src/atoms/core/14-exe--metadata.md)
   - Document `with { controlArgs: [...] }`
   - Clarify that descriptions, parameter types, and control args all live on the executable

2. [docs/src/atoms/config/04-policy--basics.md](./docs/src/atoms/config/04-policy--basics.md)
   - Update the `authorizations` section to say trusted control-arg metadata can come from the exe itself, not only `var tools`
   - Mention inherited positive checks at a high level

3. [docs/src/atoms/config/07b-policy--authorizations.md](./docs/src/atoms/config/07b-policy--authorizations.md)
   - Rewrite the metadata source section around exe-level `controlArgs`
   - Clarify merge behavior with `var tools`
   - Document bridge/native path enforcement
   - Document inherited positive checks and how they interact with `locked`

4. [docs/src/atoms/effects/13-guards--basics.md](./docs/src/atoms/effects/13-guards--basics.md)
   - Clarify that named arg descriptors are the canonical metadata surface for per-arg checks
   - Keep the user-facing wording focused on regular guards

5. [docs/src/atoms/effects/15-guards--privileged.md](./docs/src/atoms/effects/15-guards--privileged.md)
   - Clarify that `policy.authorizations` guards remain privileged but do not bypass inherited positive checks
   - Update examples if needed

6. [docs/src/atoms/security/01-security-getting-started.md](./docs/src/atoms/security/01-security-getting-started.md)
   - Remove the “phase 1 var tools only” framing
   - Update Level 3b examples for exe-level `controlArgs` and inherited positive-check behavior

7. [docs/src/atoms/mcp/03-mcp--tool-collections.md](./docs/src/atoms/mcp/03-mcp--tool-collections.md)
   - Clarify that tool collections inherit `controlArgs` from referenced exes and may tighten them locally

8. [docs/src/atoms/security/_index.md](./docs/src/atoms/security/_index.md) and/or [docs/src/atoms/config/_index.md](./docs/src/atoms/config/_index.md)
   - Refresh summaries so the index pages match the new behavior

### Additional Tasks

1. Rebuild generated doc fixtures with `npm run build:fixtures`.
2. Capture or refresh doc expectations for any changed executable examples using `npm run doc:expect -- <pattern>` where appropriate.
3. Update [CHANGELOG.md](./CHANGELOG.md) for the user-visible security behavior changes.

### Documentation Testing Requirements

Per [docs/dev/TESTS.md](./docs/dev/TESTS.md):

- Treat every changed atom as a doc-test input because `docs/src/atoms/**/*.md` is automatically extracted into `tests/cases/docs/atoms/...`.
- After changing atoms, run `npm run build:fixtures`.
- If any changed atom examples should execute rather than remain syntax-only, add or refresh the corresponding `expected.md` files using `npm run doc:expect`.
- Keep doc fixture directories content-addressed; do not hardcode old hashes into the plan or implementation notes.

### Testing

- Run `npm run build:fixtures`.
- Run any needed `npm run doc:expect -- --status` and targeted `npm run doc:expect -- <pattern>` commands.
- Run `npm test`.
- Run `npm run build`.

### Exit Criteria

- [ ] Required atoms are updated.
- [ ] Doc fixtures are regenerated and committed.
- [ ] Any new execution-backed doc expectations are refreshed.
- [ ] `CHANGELOG.md` is updated.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.

**Deliverable**: Runtime behavior, docs, extracted doc tests, and release notes all agree.

## Test Matrix Summary

This work must add coverage at three levels, following [docs/dev/TESTS.md](./docs/dev/TESTS.md):

1. **Focused unit/logic tests**
   - `core/policy/authorizations.test.ts`
   - `core/policy/guards-defaults.test.ts`
   - `cli/commands/analyze.test.ts`
   - `tests/interpreter/hooks/guard-runtime-evaluator.test.ts`

2. **Runtime/integration tests**
   - `interpreter/env/executors/function-mcp-bridge.test.ts`
   - `interpreter/env/executors/call-mcp-config.test.ts`
   - `interpreter/eval/env-mcp-config.test.ts`
   - `interpreter/eval/tools-collection.test.ts`
   - `tests/interpreter/hooks/guard-pre-hook.test.ts`

3. **User-visible fixture coverage**
   - `tests/cases/feat/policy/...`
   - `tests/cases/exceptions/security/...`
   - doc fixtures regenerated from changed atoms

### Fixture Rules To Follow

- Put successful user-visible scenarios in `tests/cases/feat/`.
- Put runtime-denial scenarios in `tests/cases/exceptions/`.
- Keep support filenames globally unique across the suite.
- If a fixture exercises filesystem effects, assert by reading back through the virtual filesystem.
- Pair any live/end-to-end test with a mocked equivalent if a live test is ever added later.

## Suggested PR Breakdown

1. **PR 1**: Phase 1 + Phase 2
   - exe `controlArgs`
   - merged runtime metadata
   - native bridge validation

2. **PR 2**: Phase 3 + Phase 4
   - policy guard named arg descriptors
   - inherited positive checks

3. **PR 3**: Phase 5
   - atoms
   - doc fixtures
   - changelog

## Overall Exit Criteria

### Test Status

- [ ] Every phase adds new coverage in the same change
- [ ] Targeted suites pass at the end of every phase
- [ ] Final `npm test` passes
- [ ] Final `npm run build` passes

### Documentation

- [ ] Required atoms in `docs/src/atoms/` are updated
- [ ] Generated doc fixtures are rebuilt
- [ ] `CHANGELOG.md` is updated

### Validation

- [ ] `exe ... with { controlArgs }` works and is validated
- [ ] Unconstrained authorization is rejected on both scoped-tool and native-tool paths
- [ ] Policy guards receive named arg descriptors
- [ ] Authorization allows inherit positive checks and deny when labels/taint do not satisfy them
- [ ] Existing user-guard named-arg behavior remains unchanged

