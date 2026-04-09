# Plan: Structured-Value Boundary Implementation Phases

Status: execution plan for `m-f20e`
Spec: `spec-structured-value-boundaries.md`
Investigation: `STRUCTURED-VALUE-BOUNDARY-SEMANTICS.md`
Primary guidance: `docs/dev/TESTS.md`, `docs/dev/ANTI-SLOP.md`, `docs/dev/DOCS.md`

## Overview

This plan turns the boundary spec into a sequential implementation program with hard gates between phases. The scope is the six concrete helpers in T1 (`plainData`, `config`, `field`, `identity`, `display`, `interpolate`), the dev assertion, the migration of runtime consumers onto those helpers, the fixture and unit coverage needed to keep the migration honest, and the doc updates required to make the contracts discoverable after the code lands.

This plan explicitly does **not** include a `serialize` helper and does **not** absorb `m-5b1c`. `serialize` remains vocabulary-only in this track. `m-5b1c` remains a separate runtime issue.

## Must-Read References

- `spec-structured-value-boundaries.md`
- `STRUCTURED-VALUE-BOUNDARY-SEMANTICS.md`
- `docs/dev/TESTS.md`
- `docs/dev/ANTI-SLOP.md`
- `docs/dev/DATA.md`
- `docs/dev/ESCAPING.md`
- `docs/dev/TYPES.md`
- `docs/src/atoms/config/07b-policy--authorizations.md`
- `docs/src/atoms/output/01-output.md`
- `docs/src/atoms/mcp/03-mcp--tool-collections.md`
- `docs/src/atoms/modules/12-exporting.md`
- `docs/src/atoms/core/23-builtins--reserved-variables.md`
- `docs/src/atoms/intro.md`

## Non-Negotiable Rules

- Prefer `tests/cases/` fixtures for user-visible semantics, syntax, warnings, exceptions, and cross-feature behavior.
- Use TypeScript tests only where fixture output cannot express the contract cleanly: `.mx`, labels, projection metadata, tool collection identity, captured env identity, `BoundaryViolation` internals, and helper-level recursive materialization behavior.
- Do not create parallel implementations of the same contract. Each phase must end with one authoritative code path for the work it touches.
- Do not leave temporary compatibility branches, dead fallbacks, TODO adapters, “old vs new” dual logic, or phase-local shims in committed code.
- Every new or changed phase must pass full repo tests before commit. A phase is not “mostly done”; it is either clean and committed or still open.
- Every phase must include an explicit anti-slop review against `docs/dev/ANTI-SLOP.md`.

## Test Strategy

### Use Fixture Cases First

Prefer new coverage under:

- `tests/cases/feat/structured-boundaries/` for isolated user-visible behavior
- `tests/cases/integration/structured-boundaries/` for cross-module and multi-boundary flows
- `tests/cases/warnings/structured-boundaries/` for warning-only dev-assertion behavior
- `tests/cases/exceptions/structured-boundaries/` for hard boundary violations in strict mode

Use unique support file names with a `structured-boundaries-...` prefix so files copied into the shared virtual root cannot collide.

### Use TypeScript Tests Where Fixtures Are Insufficient

Use TS tests for:

- helper-level contract checks in `interpreter/utils/`
- `.mx` / labels / provenance retention
- record projection metadata retention
- tool collection and captured-env identity
- shelf slot live-reference identity
- precise `BoundaryViolation` classification
- internal recursive unwrapping/materialization behavior that does not surface in document output

### Common Verification Commands

Every phase should use this command set, plus any focused commands listed under that phase:

```bash
npm run build:fixtures
npm test
npm run build
```

When fixture cases are added or changed, run focused fixture coverage through the main fixture runner:

```bash
npm test interpreter/interpreter.fixture.test.ts
```

When docs atoms are changed, also run:

```bash
npm run doc:expect -- --status
```

If an updated doc block now needs full execution coverage, capture it before the phase closes:

```bash
npm run doc:expect -- <pattern>
```

## Universal Phase Exit Gate

Every phase closes only when all of the following are true:

### Tests

- [ ] `npm run build:fixtures` passes
- [ ] All focused tests and fixtures added in the phase pass
- [ ] Full `npm test` passes
- [ ] `npm run build` passes

### Documentation

- [ ] Dev docs for changed contracts are updated where required by `docs/dev/DOCS.md`
- [ ] User docs are updated if the phase changes user-visible behavior
- [ ] Any changed docs with executable blocks have passing generated coverage

### Anti-Slop Review

- [ ] No runtime type checks on typed internal values
- [ ] No `as any` or `Record<string, unknown>` duck-typing without a real boundary reason
- [ ] No duplicate helper logic copied into a second file
- [ ] No comments that restate the next line
- [ ] No one-use helper extraction unless it materially improves readability
- [ ] No catch/rethrow or silent swallow blocks without added value
- [ ] No placeholder assertions like `.toBeDefined()` where exact behavior can be asserted
- [ ] No “handle five shapes just in case” code when the runtime shape is known

### No Compatibility Debris

- [ ] No temporary fallback paths remain in the touched files
- [ ] No `TODO`, `FIXME`, “remove after migration”, or phase-local compatibility notes remain in the touched files
- [ ] No “old path vs new path” dual behavior remains unless the spec explicitly requires composition
- [ ] Remaining legacy helpers are either deleted or reduced to a single thin alias with no divergent logic, and only if keeping the symbol is necessary

### Deliverable and Commit

- [ ] Phase scope is fully implemented
- [ ] Worktree is clean for phase-owned files
- [ ] A commit is created immediately after verification

## Phase 1 – Boundary Foundation and Test Harness

**Goal**: Land the boundary helper module, the dev assertion, and the authoritative test harness without migrating major runtime consumers yet.

**Files**

- `interpreter/utils/boundary.ts`
- `interpreter/utils/field-access.ts`
- `interpreter/utils/display-materialization.ts`
- `interpreter/utils/interpolation.ts`
- `interpreter/utils/variable-resolution.ts`
- `tests/interpreter/wrapper-boundary-matrix.test.ts` or a renamed replacement under `interpreter/utils/`
- `interpreter/utils/field-access.test.ts`
- `docs/dev/DATA.md`
- `docs/dev/ESCAPING.md`

### Tasks

1. Add the six concrete helper entry points in `interpreter/utils/boundary.ts`.
2. Centralize the dev assertion and `BoundaryViolation` contract there.
3. Reuse existing primitives instead of cloning them:
   - `plainData` owns sync recursive unwrap
   - `config` owns async env-aware materialization
   - `field` delegates to canonical field access
   - `display` delegates to display materialization
   - `interpolate` delegates to interpolation
4. Reuse the existing wrapper-boundary matrix instead of creating a competing matrix test. Rename it only if the rename removes ambiguity.
5. Add minimal fixture cases for visible helper semantics:
   - `tests/cases/feat/structured-boundaries/plain-data-spread/`
   - `tests/cases/feat/structured-boundaries/display-vs-interpolate/`
   - `tests/cases/warnings/structured-boundaries/plain-data-on-keep/`
6. Update dev docs to define the helper contracts and the split between `plainData`, `config`, `display`, and `interpolate`.

### Testing

Fixture coverage:

- `tests/cases/feat/structured-boundaries/plain-data-spread/`
- `tests/cases/feat/structured-boundaries/display-vs-interpolate/`
- `tests/cases/warnings/structured-boundaries/plain-data-on-keep/`

TypeScript coverage:

- `tests/interpreter/wrapper-boundary-matrix.test.ts`
- `interpreter/utils/field-access.test.ts`
- new helper-focused test file if needed: `interpreter/utils/boundary.test.ts`

Run:

```bash
npm run build:fixtures
npm test tests/interpreter/wrapper-boundary-matrix.test.ts
npm test interpreter/utils/field-access.test.ts
npm test interpreter/interpreter.fixture.test.ts
npm test
npm run build
```

### Phase 1 Exit Criteria

- [ ] `interpreter/utils/boundary.ts` exists and exports all six helpers
- [ ] The dev assertion is live in dev mode and silent in production mode
- [ ] There is one authoritative matrix harness, not two overlapping ones
- [ ] Fixture cases cover visible baseline semantics for spread, display, interpolate, and `.keep` warnings
- [ ] `docs/dev/DATA.md` and `docs/dev/ESCAPING.md` describe the new boundaries accurately
- [ ] All universal phase gates pass

**Commit message**

```text
m-f20e add boundary helper foundation
```

## Phase 2 – Policy and Config Boundary Migration

**Goal**: Make policy/config consumers use `boundary.config` and `boundary.field`, and remove duplicate policy-domain materialization logic.

**Files**

- `interpreter/env/builtins/policy.ts`
- `interpreter/policy/authorization-compiler.ts`
- `interpreter/eval/exec/policy-fragment.ts`
- `core/policy/label-flow.ts`
- `core/policy/guards.ts`
- `interpreter/eval/exec/policy-builder.test.ts`
- `interpreter/eval/env-mcp-config.test.ts`
- `interpreter/env/executors/call-mcp-config.test.ts`
- `docs/dev/DATA.md`
- `docs/src/atoms/config/07b-policy--authorizations.md`

### Tasks

1. Replace policy-domain ad hoc materializers with `boundary.config`.
2. Replace policy-domain manual field access with `boundary.field`.
3. Delete or collapse duplicate policy materialization helpers so there is one authoritative config path.
4. Cover the known bug family directly:
   - literal `basePolicy`
   - field-accessed `basePolicy`
   - exe-returned nested-array `basePolicy`
   - parameter-bound cross-module `basePolicy`
5. Make any failure mode explicit. If the policy path rejects something intentionally, tests must assert the actual diagnostic rather than accepting a silent empty result.

### Testing

Fixture coverage:

- `tests/cases/feat/structured-boundaries/policy-base-policy-literal/`
- `tests/cases/feat/structured-boundaries/policy-base-policy-field-access/`
- `tests/cases/feat/structured-boundaries/policy-base-policy-exe-return/`
- `tests/cases/integration/structured-boundaries/policy-cross-module-base-policy/`

TypeScript coverage:

- `interpreter/eval/exec/policy-builder.test.ts`
- `interpreter/eval/env-mcp-config.test.ts`
- `interpreter/env/executors/call-mcp-config.test.ts`
- `tests/interpreter/wrapper-boundary-matrix.test.ts`

Run:

```bash
npm run build:fixtures
npm test interpreter/eval/exec/policy-builder.test.ts
npm test interpreter/eval/env-mcp-config.test.ts interpreter/env/executors/call-mcp-config.test.ts
npm test interpreter/interpreter.fixture.test.ts
npm test
npm run build
```

### Phase 2 Exit Criteria

- [ ] Policy-domain config materialization routes through `boundary.config`
- [ ] Policy-domain field access routes through `boundary.field`
- [ ] The `m-d57b` class is covered by fixtures and TS tests, including exe-return and cross-module paths
- [ ] No duplicate policy-specific recursive materializer remains with divergent logic
- [ ] `docs/src/atoms/config/07b-policy--authorizations.md` reflects the accepted `basePolicy` shapes
- [ ] All universal phase gates pass

**Commit message**

```text
m-f20e migrate policy config boundaries
```

## Phase 3 – Output, Display, and Field-Read Migration

**Goal**: Remove bespoke output/display/field logic and make output-family consumers use `boundary.field` and `boundary.display`.

**Files**

- `interpreter/eval/output.ts`
- `interpreter/eval/append.ts`
- `interpreter/eval/show/shared-helpers.ts`
- `interpreter/eval/guard-denial-handler.ts`
- `interpreter/eval/guard-denial-events.ts`
- `interpreter/eval/pipeline/builtin-effects.ts`
- `interpreter/core/interpreter/traversal.ts`
- `interpreter/index.ts`
- `interpreter/eval/show.characterization.test.ts`
- `tests/interpreter/exe-return-structured-metadata.test.ts`
- `tests/immediate-effects.test.ts`
- `docs/dev/DATA.md`
- `docs/src/atoms/output/01-output.md`
- `docs/src/atoms/output/03-append.md`

### Tasks

1. Remove manual field resolution from `output.ts` and route it through `boundary.field`.
2. Normalize output-family rendering through `boundary.display` instead of bespoke local unwrap/materialization code.
3. Keep interpolation-specific behavior in interpolation code paths; do not collapse it into display.
4. Make fixture cases assert both document output and written files where applicable, per `docs/dev/TESTS.md`.
5. Delete any duplicated local helper that only existed to work around missing boundary helpers.

### Testing

Fixture coverage:

- `tests/cases/feat/structured-boundaries/output-field-access/`
- `tests/cases/feat/structured-boundaries/output-nested-field-wrapper-preservation/`
- `tests/cases/feat/structured-boundaries/append-display-file-side-effect/`
- `tests/cases/feat/structured-boundaries/show-display-structured-value/`

TypeScript coverage:

- `interpreter/eval/show.characterization.test.ts`
- `tests/interpreter/exe-return-structured-metadata.test.ts`
- `tests/immediate-effects.test.ts`
- `tests/interpreter/wrapper-boundary-matrix.test.ts`

Run:

```bash
npm run build:fixtures
npm test interpreter/eval/show.characterization.test.ts
npm test tests/interpreter/exe-return-structured-metadata.test.ts
npm test tests/immediate-effects.test.ts
npm test interpreter/interpreter.fixture.test.ts
npm test
npm run build
```

### Phase 3 Exit Criteria

- [ ] `output.ts` no longer does ad hoc wrapper peeling for field reads
- [ ] Output-family display materialization routes through `boundary.display`
- [ ] Fixture cases verify both document output and file side effects where relevant
- [ ] User docs for output/append reflect the behavior that now exists
- [ ] All universal phase gates pass

**Commit message**

```text
m-f20e migrate output and display boundaries
```

## Phase 4 – Identity, Tool Collections, and Escape-Hatch Migration

**Goal**: Move identity-bearing boundaries onto `boundary.identity` and confine `.keep` / `preserveStructuredArgs` to embedded-language boundaries.

**Files**

- `interpreter/eval/var/tool-scope.ts`
- `interpreter/utils/parameter-factory.ts`
- `interpreter/env/executors/call-mcp-config.ts`
- `interpreter/eval/import/`
- `interpreter/shelf/runtime.ts` where identity-bearing handoffs are involved
- `interpreter/eval/env-mcp-config.test.ts`
- `interpreter/env/executors/call-mcp-config.test.ts`
- `interpreter/shelf/shelf-notes.test.ts`
- `interpreter/eval/shelf.test.ts`
- `docs/dev/DATA.md`
- `docs/src/atoms/mcp/03-mcp--tool-collections.md`
- `docs/src/atoms/mcp/04-mcp--tool-reshaping.md`
- `docs/src/atoms/mcp/05-mcp--import.md`
- `docs/src/atoms/modules/12-exporting.md`
- `docs/src/atoms/core/23-builtins--reserved-variables.md`
- `docs/src/atoms/intro.md`

### Tasks

1. Route tool collection recovery and captured-env recovery through `boundary.identity`.
2. Audit `.keep`, `.keepStructured`, and `preserveStructuredArgs` call sites.
3. Remove `.keep` usage that was only compensating for missing mlld→mlld identity handling.
4. Keep `.keep` only where the receiving boundary is embedded language.
5. Keep shelf live-reference behavior intact; do not materialize away slot identity.
6. Remove duplicate identity-recovery logic once `boundary.identity` owns the contract.

### Testing

Fixture coverage:

- `tests/cases/feat/structured-boundaries/identity-tool-collection-cross-module/`
- `tests/cases/feat/structured-boundaries/identity-tools-parameter-binding/`
- `tests/cases/feat/structured-boundaries/keep-js-mx-access/`
- `tests/cases/warnings/structured-boundaries/keep-non-embedded-language-warning/`
- `tests/cases/feat/structured-boundaries/preserve-structured-args-identity/`

TypeScript coverage:

- `interpreter/eval/env-mcp-config.test.ts`
- `interpreter/env/executors/call-mcp-config.test.ts`
- `interpreter/shelf/shelf-notes.test.ts`
- `interpreter/eval/shelf.test.ts`
- `tests/interpreter/wrapper-boundary-matrix.test.ts`

Run:

```bash
npm run build:fixtures
npm test interpreter/eval/env-mcp-config.test.ts interpreter/env/executors/call-mcp-config.test.ts
npm test interpreter/shelf/shelf-notes.test.ts interpreter/eval/shelf.test.ts
npm test tests/interpreter/wrapper-boundary-matrix.test.ts
npm test interpreter/interpreter.fixture.test.ts
npm test
npm run build
```

### Phase 4 Exit Criteria

- [ ] Tool collections and captured envs cross mlld→mlld boundaries through `boundary.identity`
- [ ] `.keep` remains only at embedded-language boundaries or `preserveStructuredArgs`
- [ ] Non-embedded-language `.keep` hacks are removed, not left in place with comments
- [ ] Shelf identity semantics still pass focused tests
- [ ] MCP/module docs describe the surviving identity rules accurately
- [ ] All universal phase gates pass

**Commit message**

```text
m-f20e migrate identity-bearing boundaries
```

## Phase 5 – Plain-Data Semantics and Hotspot Cleanup

**Goal**: Codify `plainData` semantics, make spread behavior explicit, and eliminate remaining ad hoc materializers and wrapper-handling hot spots.

**Files**

- `interpreter/eval/data-values/CollectionEvaluator.ts`
- `interpreter/eval/exec-invocation.ts`
- `interpreter/shelf/runtime.ts`
- remaining `asData(...)` call sites in `interpreter/`
- any remaining local recursive unwrap helpers discovered during grep
- `tests/interpreter/wrapper-boundary-matrix.test.ts`
- `tests/interpreter/exe-return-structured-metadata.test.ts`
- `docs/dev/DATA.md`
- `docs/dev/TYPES.md`

### Tasks

1. Make object spread follow the accepted `plainData` contract.
2. Audit remaining `asData(...)` usage:
   - migrate recursive/ad hoc materialization to `boundary.plainData` or `boundary.config`
   - keep only intentional shallow `asData(...)` sites, explicitly marked
3. Audit `exec-invocation.ts` and `shelf/runtime.ts` as the two highest wrapper-touch hot spots.
4. Delete duplicate unwrap logic instead of layering helper calls around it.
5. Remove defensive branches that only existed to tolerate multiple legacy wrapper shapes if the shape contract is now explicit.

### Testing

Fixture coverage:

- `tests/cases/feat/structured-boundaries/spread-plain-data/`
- `tests/cases/feat/structured-boundaries/shelf-read-wrapper-preservation/`
- `tests/cases/feat/structured-boundaries/exec-invocation-identity-preservation/`

TypeScript coverage:

- `tests/interpreter/wrapper-boundary-matrix.test.ts`
- `tests/interpreter/exe-return-structured-metadata.test.ts`
- focused hotspot tests added near the touched files

Run:

```bash
npm run build:fixtures
npm test tests/interpreter/wrapper-boundary-matrix.test.ts
npm test tests/interpreter/exe-return-structured-metadata.test.ts
npm test interpreter/interpreter.fixture.test.ts
npm test
npm run build
```

### Audit Commands

Run these before closing the phase:

```bash
rg -n "asData\\(" interpreter
rg -n "unwrapStructuredRecursively|resolveNestedValue|resolveDirectToolCollection|capturedModuleEnv|keepStructured|\\.keep\\b" interpreter
rg -n "TODO|FIXME|compat|legacy|temporary|remove after" interpreter/eval/data-values/CollectionEvaluator.ts interpreter/eval/exec-invocation.ts interpreter/shelf/runtime.ts
```

### Phase 5 Exit Criteria

- [ ] Spread behavior is implemented once, not half in helpers and half in callers
- [ ] Remaining `asData(...)` sites are either intentional shallow reads or migrated
- [ ] `exec-invocation.ts` and `shelf/runtime.ts` no longer carry duplicate ad hoc boundary logic
- [ ] `docs/dev/TYPES.md` and `docs/dev/DATA.md` describe the surviving data contract accurately
- [ ] All universal phase gates pass

**Commit message**

```text
m-f20e finish plain-data and hotspot cleanup
```

## Phase 6 – Integration Proof, Doc Sweep, and Final Verification

**Goal**: Prove the migration against the live banking integration target, finish all documentation, and close the work with a clean repo-level verification run.

**Files**

- `spec-structured-value-boundaries.md`
- `STRUCTURED-VALUE-BOUNDARY-SEMANTICS.md`
- all touched dev docs
- all touched user atoms
- any remaining benchmark harness notes needed for reproducibility

### Tasks

1. Run the strict-boundary banking scenarios from the spec.
2. Confirm the spec matches the shipped code, not the intended code.
3. Confirm all dev docs and user docs describe the final contracts that actually shipped.
4. Confirm the fixture tree contains the intended `structured-boundaries` cases and no stale orphaned expectations.
5. Do a final anti-slop sweep across all touched files from the full project.

### Testing

Repository verification:

```bash
npm run build:fixtures
npm test
npm run build
```

Docs verification:

```bash
npm run doc:expect -- --status
```

Benchmark verification:

```bash
cd ~/mlld/benchmarks
MLLD_STRICT_BOUNDARIES=1 uv run python3 src/run.py -s banking -d defended -t user_task_3 --debug
MLLD_STRICT_BOUNDARIES=1 uv run python3 src/run.py -s banking -d defended -t user_task_1 --debug
MLLD_STRICT_BOUNDARIES=1 uv run python3 src/run.py -s banking -d defended -t user_task_4 --debug
MLLD_STRICT_BOUNDARIES=1 uv run python3 src/run.py -s banking -d defended -t user_task_6 --debug
MLLD_STRICT_BOUNDARIES=1 uv run python3 src/run.py -s banking -d defended -t user_task_14 --debug
```

### Final Sweep Commands

```bash
rg -n "TODO|FIXME|compat|legacy|temporary|remove after|fallback" interpreter core docs tests
rg -n "as any|Record<string, unknown>|toBeDefined\\(|not\\.toBeNull\\(" interpreter core tests
```

### Phase 6 Exit Criteria

- [ ] Banking UT3 reaches the `@claude` execution boundary cleanly under strict mode
- [ ] UT1, UT4, UT6, and UT14 are green under strict mode
- [ ] Zero `BoundaryViolation` events occur in the strict benchmark runs
- [ ] Repo tests and build are fully green
- [ ] Docs match the shipped code paths
- [ ] No slop markers, compatibility branches, or migration debris remain
- [ ] All universal phase gates pass

**Commit message**

```text
m-f20e verify boundary migration end to end
```

## Overall Exit Criteria

- [ ] All six phases completed in order
- [ ] Every phase ended with a green full test run and its own commit
- [ ] No phase relied on temporary dual behavior that survived into the next phase
- [ ] The authoritative contracts are `boundary.plainData`, `boundary.config`, `boundary.field`, `boundary.identity`, `boundary.display`, and `boundary.interpolate`
- [ ] `serialize` remains explicitly deferred rather than half-implemented
- [ ] `m-5b1c` remains separate and is not masked by this work

## Notes for Execution

- If a phase reveals that one of the later phases needs to be split, split it before code starts, not after a partial implementation lands.
- If a change is user-visible, prefer adding a fixture first and then making the code pass it.
- If a change is only visible through metadata, add or extend a nearby TS test instead of forcing it through document output.
- If an old helper remains after migration, it must be either deleted or reduced to one thin authoritative alias. No forked logic survives phase boundaries.
