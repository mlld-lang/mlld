# Browser Runtime Implementation Plan (`vision-in-browser.md` + `spec-in-browser.md`)

## Scope and Inputs
- Input vision: `vision-in-browser.md`
- Input spec: `spec-in-browser.md`
- Architecture reference: `docs/dev/ARCHITECTURE.md`
- Testing reference: `docs/dev/TESTS.md`
- Existing mlldx context in repo: `docs/dev/MLLDX.md`, `bin/mlldx-wrapper.cjs`, `mlldx-package/package.json`

## Implementation Outcome
Ship a browser-runnable runtime that uses the same parser/interpreter core, executes `exe js`, denies host-runtime executors (`bash`, `sh`, `node`, `python`), uses virtual/in-memory storage, and unifies ephemeral/CI execution under `mlld --ephemeral` / `mlld --ci` instead of a separate `mlldx` binary.

## Integration Map (Reviewed)
- Entry surfaces
  - `sdk/index.ts`, `interpreter/index.ts`
  - `cli/*`, `bin/*` (current `mlldx` wrapper path to be removed)
- Runtime environment/bootstrap
  - `interpreter/env/Environment.ts`
  - `interpreter/env/bootstrap/EnvironmentBootstrap.ts`
  - `interpreter/env/ImportResolver.ts`
- Execution layer
  - `interpreter/env/executors/CommandExecutorFactory.ts`
  - `interpreter/env/executors/JavaScriptExecutor.ts`
  - `interpreter/env/NodeShadowEnvironment.ts`, `interpreter/env/PythonShadowEnvironment.ts`
- Filesystem/path abstractions
  - `services/fs/IFileSystemService.ts`
  - `services/fs/IPathService.ts`
  - `services/fs/PathService.ts` (Node `path` dependency)
  - `services/fs/NodeFileSystem.ts`
  - `tests/utils/MemoryFileSystem.ts` (Buffer usage)
- Resolver/caching
  - `core/registry/InMemoryModuleCache.ts` (`crypto.createHash`, `Buffer`)
  - `core/resolvers/ResolverManager.ts` (Node `fs/path` dependency)
  - `core/resolvers/LocalResolver.ts`, `core/resolvers/ProjectPathResolver.ts` (Node `path`)
- Build/package/release
  - `tsup.config.ts`
  - `package.json`
  - `mlldx-package/package.json`
  - `scripts/sync-mlldx.cjs`, `scripts/publish-with-mlldx.cjs`, `scripts/build-incremental.js`
- Existing test surface
  - `core/registry/InMemoryModuleCache.test.ts`
  - `interpreter/env/executors/JavaScriptExecutor.test.ts`
  - `interpreter/env/bootstrap/EnvironmentBootstrap.test.ts`
  - `sdk/index.test.ts`
  - fixture harness and guidance in `docs/dev/TESTS.md`

## Key Risks to Resolve Early
- Legacy split-brain surface: separate `mlldx` wrapper/package vs unified CLI flags for ephemeral/CI behavior.
- Node import contamination: core files required by runtime statically import Node-only modules (`path`, `fs`, `child_process`, `crypto`).
- Browser build correctness: tree-shaking alone is insufficient if browser entry imports Node-coupled modules.
- Resolver composition: current `ResolverManager` and several resolvers are Node-coupled.

## Test Quality Bar (Applies to Every Phase)
- New/changed behavior must have targeted tests in the same phase.
- No phase commit until tests for that phase pass locally.
- No final merge until full test matrix passes.

## Full Test Matrix Definition
Use this as the global gate in integration phases and final phase:

```bash
npm run build:fixtures
npm run lint
TESTFAST=false npm test
npm run test:tokens
npm run test:heredoc
vitest run --config vitest.config.mlldx.mts
npm run test:browser
npm run build
```

---

## Phase 0 - CLI Unification Contract
### Objective
Lock the CLI/runtime contract so ephemeral and CI execution are first-class `mlld` modes.

### Requirements
- Decide and document one CLI strategy:
  - `mlld --ephemeral` for in-memory/no-persistence mode.
  - `mlld --ci` as the non-interactive CI profile (including import auto-approval policy defaults).
- Remove separate `mlldx` binary and standalone `mlldx` wrapper package in favor of unified flags.
- Define explicit migration policy for existing users of `mlldx` command/package.
- Add/update a migration note in docs with exact before/after install examples.

### Test Coverage
- Add CLI contract tests for:
  - `--ephemeral` behavior parity with current ephemeral mode.
  - `--ci` behavior contract.
  - Removal/deprecation behavior for `mlldx`.

### Docs/Changelog
- Update:
  - `docs/dev/MLLDX.md` to document unified CLI flags and decommissioned wrapper surface.
  - `docs/user/cli.md` for command/package clarity.
- Add CHANGELOG entries under current top version:
  - `Changed`: unified `mlld --ephemeral/--ci` execution model.
  - `Documentation`: migration guidance.

### Commit Checkpoint
`chore(cli): define unified ephemeral/ci mode contract`

### Exit Criteria
- Naming/migration contract is written and committed.
- CLI contract tests pass.
- Phase docs + changelog entries are present.

---

## Phase 1 - Browser-Safe Core Primitives
### Objective
Remove immediate Node runtime blockers in shared primitives.

### Requirements
- Add `services/fs/BrowserPathService.ts` implementing `IPathService` with browser-safe path ops (posix semantics).
- Refactor `core/registry/InMemoryModuleCache.ts`:
  - Replace Node `crypto.createHash`/`Buffer` usage with browser-safe hashing and byte sizing.
  - Keep hash determinism stable in tests.
- Patch `interpreter/env/executors/JavaScriptExecutor.ts`:
  - Guard `process.cwd()/process.chdir()` usage.
  - Ensure no cwd mutation in browser mode.
- Ensure Node path remains unchanged for server/CLI by preserving `PathService` behavior.

### Integration Points
- `services/fs/IPathService.ts`
- `services/fs/PathService.ts`
- `services/fs/BrowserPathService.ts` (new)
- `core/registry/InMemoryModuleCache.ts`
- `interpreter/env/executors/JavaScriptExecutor.ts`

### Test Coverage
- `services/fs/BrowserPathService.test.ts` (new):
  - `resolve`, `join`, `dirname`, `basename`, `normalize`, URL validation/fetch behavior.
- Extend `core/registry/InMemoryModuleCache.test.ts`:
  - Stable hash parity.
  - Size accounting parity.
- Extend `interpreter/env/executors/JavaScriptExecutor.test.ts`:
  - No `process` dependency path.
  - cwd guard behavior.

### Docs/Changelog
- Update `docs/dev/ARCHITECTURE.md` references for browser path/cache primitives.
- CHANGELOG:
  - `Added`: BrowserPathService.
  - `Fixed`: in-memory cache/browser compatibility and JS executor cwd handling.

### Commit Checkpoint
`feat(browser): add browser-safe path and cache primitives`

### Exit Criteria
- New primitive tests pass.
- Existing cache/executor tests pass unchanged except intentional updates.
- No direct Node-only API usage remains in these primitives.

---

## Phase 2 - Browser Runtime Profile for Environment and Executors
### Objective
Introduce an explicit browser runtime profile without breaking Node runtime behavior.

### Requirements
- Add `interpreter/env/executors/BrowserCommandExecutorFactory.ts`:
  - Supports only `js/javascript` code execution.
  - Throws `MlldSecurityError` for shell/node/python/bash/sh.
- Introduce browser runtime construction path:
  - `interpreter/env/BrowserEnvironment.ts` or `interpreter/env/createBrowserEnvironment.ts`.
  - Must avoid importing Node-only shadow envs/executors/resolvers in browser entry path.
- Split bootstrap wiring (or profile-gate it) so browser runtime:
  - Uses browser-safe path + virtual FS.
  - Registers only browser-safe resolvers.
  - Does not initialize Node/Python shadow environments.
- Keep Node runtime path unchanged in `Environment` constructor behavior.

### Integration Points
- `interpreter/env/Environment.ts`
- `interpreter/env/bootstrap/EnvironmentBootstrap.ts`
- `interpreter/env/executors/CommandExecutorFactory.ts`
- `interpreter/env/executors/BrowserCommandExecutorFactory.ts` (new)
- `interpreter/env/ImportResolver.ts` (eliminate Node-only path dependencies along browser path)

### Test Coverage
- `interpreter/env/executors/BrowserCommandExecutorFactory.test.ts` (new):
  - `exe js` allowed.
  - `exe bash/node/python/sh` denied with `MlldSecurityError`.
- `interpreter/env/BrowserEnvironment.test.ts` (new):
  - Browser profile initializes without Node-only dependencies.
  - Policy + resolver baseline behavior.
- Regression tests ensuring Node `Environment` behavior is unchanged.

### Docs/Changelog
- Update `docs/dev/ARCHITECTURE.md` layer 3/4 notes for host profiles.
- Update `docs/dev/TESTS.md` with new browser-profile unit test category.
- CHANGELOG:
  - `Added`: browser command executor factory/runtime profile.
  - `Fixed`: secure denial behavior for non-browser-safe executors.

### Commit Checkpoint
`feat(browser): add browser environment and js-only executor profile`

### Exit Criteria
- Browser environment/profile tests pass.
- Node environment regression tests pass.
- Unsupported browser capabilities fail as security denials, not generic runtime errors.

---

## Phase 3 - Browser Filesystem and Resolver Wiring
### Objective
Complete browser-compatible I/O and import behavior.

### Requirements
- Implement/land virtual FS for runtime use (if `spec-virtualfs.md` is not yet merged):
  - Add `services/fs/VirtualFS.ts` or equivalent browser runtime FS.
  - Must satisfy `IFileSystemService` and return `isVirtual() === true`.
- Ensure browser runtime import path handling uses browser-safe path logic.
- Browser resolver set must be explicit and tested; no accidental registration of Node-coupled resolvers.
- Keep URL imports + dynamic modules functioning in browser profile.

### Integration Points
- `services/fs/*`
- `interpreter/env/ImportResolver.ts`
- `core/resolvers/*` (registration composition, not broad behavior rewrites unless required)
- `interpreter/eval/import/ModuleContentProcessor.ts` (virtual FS mode assumptions)

### Test Coverage
- `services/fs/VirtualFS.test.ts` (new) or equivalent:
  - read/write/exists/readdir/stat/mkdir/rm/unlink semantics.
- `interpreter/import-browser.profile.test.ts` (new):
  - relative/absolute virtual path resolution.
  - URL import fetch path.
  - dynamic module import in browser profile.
- Fixture tests in `tests/cases/integration/browser/` for representative imports.

### Docs/Changelog
- Update `docs/dev/TESTS.md` for browser fixture conventions.
- Update docs for virtual FS usage in browser runtime.
- CHANGELOG:
  - `Added`: browser virtual FS and browser import path behavior.

### Commit Checkpoint
`feat(browser): wire virtual fs and browser-safe import resolution`

### Exit Criteria
- Browser FS + import integration tests pass.
- Browser profile never hits Node filesystem/path APIs.

---

## Phase 4 - Public Browser SDK (`createRuntime`) and API Contracts
### Objective
Expose stable browser SDK surface aligned with the spec.

### Requirements
- Add `sdk/browser.ts` with `createRuntime(options?)`.
- Runtime API must include:
  - `fs` (virtual filesystem instance)
  - `run(path)`
  - `interpret(path, options)`
  - `analyze(path)`
- Ensure browser SDK does not import Node defaults (`NodeFileSystem`, `PathService`, `PathContextBuilder` Node path branch).
- Add type exports for browser runtime options/results.

### Integration Points
- `sdk/browser.ts` (new)
- `sdk/types.ts` (browser runtime typing)
- `interpreter/index.ts` (if host-profile mode selection is needed)

### Test Coverage
- `sdk/browser.test.ts` (new):
  - basic run from virtual file
  - structured/debug mode behavior
  - deny behavior for unsupported executors
  - dynamic module injection
- Contract tests for returned runtime API shape.

### Docs/Changelog
- Update `docs/user/sdk.md` with a dedicated browser runtime section and examples.
- Update `docs/dev/SDK.md` to include browser entry surface.
- CHANGELOG:
  - `Added`: browser SDK runtime API.

### Commit Checkpoint
`feat(browser): add createRuntime sdk surface`

### Exit Criteria
- Browser SDK tests pass.
- API matches documented contract and spec examples.

---

## Phase 5 - Build, Packaging, and Publishing Pipeline
### Objective
Produce and publish browser-targeted artifacts cleanly.

### Requirements
- Add browser build target in `tsup.config.ts` for browser entry.
- Ensure browser bundle excludes Node built-ins and passes static verification.
- Update package exports for browser entry artifacts.
- Remove `mlldx` wrapper package and simplify release pipeline to single CLI surface.
- Update release scripts:
  - remove `scripts/sync-mlldx.cjs` / `scripts/publish-with-mlldx.cjs` dependencies.
  - `scripts/build-incremental.js` checks for new artifacts/package files.

### Integration Points
- `tsup.config.ts`
- `package.json`
- `bin/mlldx-wrapper.cjs` (remove)
- `mlldx-package/*` (remove)
- `scripts/build-incremental.js`

### Test Coverage
- Add packaging tests (new `tests/packaging/browser-package.test.ts`):
  - export map validity
  - expected files present in packed tarball
  - browser dist import smoke check
- Add CI script tests for unified publish/build flows after `mlldx` script removal.

### Docs/Changelog
- Update install instructions across docs (`docs/user/sdk.md`, `README.md`, `docs/user/cli.md`).
- CHANGELOG:
  - `Changed`: package/export/release pipeline updates and removal of separate `mlldx` wrapper package.

### Commit Checkpoint
`build(cli-browser): add browser bundle target and unify packaging pipeline`

### Exit Criteria
- `npm run build` produces browser artifacts reproducibly.
- Packaging tests pass.
- Publish scripts reflect unified CLI/package contract.

---

## Phase 6 - Browser Runtime End-to-End Test Suite and CI Wiring
### Objective
Add durable end-to-end coverage and enforce it in CI.

### Requirements
- Add dedicated browser test command and config (`npm run test:browser`).
- Add at least one real browser-context smoke suite that executes bundled output (not only Node/jsdom emulation).
- Integrate browser tests into CI matrix and local docs.
- Keep existing fixture flow from `docs/dev/TESTS.md` conventions for integration coverage.

### Integration Points
- `vitest.config.browser.mts` (new) or equivalent
- `package.json` scripts
- CI workflow files under `.github/workflows/*`
- `tests/browser/*` and `tests/cases/integration/browser/*`

### Test Coverage (minimum required)
- Browser bundle boot + `createRuntime` smoke test.
- Virtual FS read/write/list verification through public API.
- `exe js` success path.
- `exe bash/node/python` denial path with exact error class expectations.
- URL import path (mocked fetch) and module cache reuse behavior.

### Docs/Changelog
- Update `docs/dev/TESTS.md` with browser suite commands and troubleshooting.
- CHANGELOG:
  - `Added`: browser e2e test matrix.

### Commit Checkpoint
`test(browser): add browser e2e suite and ci integration`

### Exit Criteria
- `npm run test:browser` is stable locally.
- CI runs browser tests and passes.
- All new browser scenarios are covered by automated tests.

---

## Phase 7 - Final Documentation Sweep and Release Readiness
### Objective
Complete docs/changelog and validate full system before merge/release.

### Requirements
- Complete docs updates end-to-end:
  - `docs/dev/ARCHITECTURE.md`
  - `docs/dev/TESTS.md`
  - `docs/dev/SDK.md`
  - `docs/dev/MLLDX.md`
  - `docs/user/sdk.md`
  - `docs/user/cli.md`
  - `README.md`
- Ensure examples are runnable and consistent with final API/package names.
- Consolidate CHANGELOG entries into top release section with `Added/Changed/Fixed/Documentation` categories.

### Test Coverage
- Add/adjust doc-backed test examples where possible (fixture extraction and/or explicit SDK tests).
- Run full matrix gate.

### Commit Checkpoint
`docs(browser): finalize browser runtime docs and changelog`

### Exit Criteria
- Full matrix passes:
  - `npm run build:fixtures`
  - `npm run lint`
  - `TESTFAST=false npm test`
  - `npm run test:tokens`
  - `npm run test:heredoc`
  - `vitest run --config vitest.config.mlldx.mts`
  - `npm run test:browser`
  - `npm run build`
- All referenced docs are updated and internally consistent.
- CHANGELOG has complete browser-runtime release notes.

---

## Commit Plan Summary
1. `chore(cli): define unified ephemeral/ci mode contract`
2. `feat(browser): add browser-safe path and cache primitives`
3. `feat(browser): add browser environment and js-only executor profile`
4. `feat(browser): wire virtual fs and browser-safe import resolution`
5. `feat(browser): add createRuntime sdk surface`
6. `build(cli-browser): add browser bundle target and unify packaging pipeline`
7. `test(browser): add browser e2e suite and ci integration`
8. `docs(browser): finalize browser runtime docs and changelog`

## Non-Negotiable Exit Conditions for Whole Project
- Browser runtime behavior matches `vision-in-browser.md` + `spec-in-browser.md` scope.
- Unsupported host-runtime capabilities are denied predictably and tested.
- CLI/package/docs story is coherent with `mlld --ephemeral` / `mlld --ci` and no separate `mlldx` wrapper package.
- New test coverage exists at primitive, integration, and bundle/e2e levels.
- Full matrix is green before final merge.
