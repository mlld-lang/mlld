# VirtualFS Implementation Plan (`vision-virtualfs.md` + `spec-virtualfs.md`)

## Scope and Inputs
- Vision: `vision-virtualfs.md`
- Spec: `spec-virtualfs.md`
- Architecture reference: `docs/dev/ARCHITECTURE.md`
- Grammar reference: `docs/dev/GRAMMAR.md`
- Test strategy reference: `docs/dev/TESTS.md`
- SDK internals reference: `docs/dev/SDK.md`
- SDK user docs reference: `docs/user/sdk.md`

## Target Outcome
Ship a production `VirtualFS` copy-on-write filesystem that implements `IFileSystemService`, supports shadow changes (`changes/diff/flush/discard/export/apply/reset`), integrates with SDK entry points, preserves interpreter semantics, and lands with complete automated coverage + documentation + changelog updates.

## Reviewed Integration Map (Code)
- Filesystem contracts and implementations:
  - `services/fs/IFileSystemService.ts`
  - `services/fs/NodeFileSystem.ts`
  - `tests/utils/MemoryFileSystem.ts`
- SDK entry surfaces and defaults:
  - `sdk/index.ts` (`processMlld` defaults to `NodeFileSystem`)
  - `sdk/execute.ts` (`execute` defaults to `NodeFileSystem`)
  - `sdk/index.test.ts`, `sdk/execute.test.ts`
- Interpreter behaviors sensitive to virtual FS:
  - `interpreter/eval/import/ModuleContentProcessor.ts` (`isVirtual()` mode behavior)
  - `interpreter/eval/import/DirectoryImportHandler.ts` (`readdir/stat/exists/isDirectory`)
  - `interpreter/eval/output.ts`, `interpreter/eval/append.ts`, `interpreter/eval/pipeline/builtin-effects.ts` (file writes)
- Path/root services that depend on `exists` correctness:
  - `core/services/PathContextService.ts`
  - `core/utils/findProjectRoot.ts`
- Test harness migration hot spots:
  - `interpreter/interpreter.fixture.test.ts`
  - broad usage of `MemoryFileSystem` across `interpreter/`, `core/`, `sdk/`, `tests/`
- Packaging/export surface:
  - `package.json` exports map (currently only `"."`)
  - `tsup.config.ts` (SDK entry is `sdk/index.ts`)

## Critical Decisions to Lock Before Implementation
1. Public import path for `VirtualFS`:
- Option A (recommended): export from root (`import { VirtualFS } from 'mlld'`) and document this as canonical.
- Option B: add subpath export `mlld/sdk` and keep root export too.

2. API naming consistency between vision and spec:
- Vision uses `diff()` while spec uses `changes()`.
- Decision: provide both (`changes()` canonical, `diff()` alias) or choose one and update docs consistently.

3. `VirtualFS.over(...)` signature:
- Spec expects `VirtualFS.over(backing: IFileSystemService)`.
- Vision examples use `VirtualFS.over('/path')`.
- Decision: keep strict interface-based overload only, or add convenience overload for Node.

4. Migration strategy for `MemoryFileSystem`:
- Option A (recommended): keep `MemoryFileSystem` as compatibility wrapper over `VirtualFS.empty()` in first rollout, then migrate tests incrementally.
- Option B: immediate wholesale replacement in one phase.

## Global Delivery Rules (Applies to Every Phase)
- No phase commit until all phase tests pass.
- Every phase adds/updates automated tests (unit + integration where relevant).
- Every phase includes a `CHANGELOG.md` update in Keep-a-Changelog categories.
- Every phase commit message is explicit and scoped.
- No grammar changes unless strictly required; if grammar untouched, prove with unchanged grammar tests.

## Global Regression Gate
Run this before each phase commit (not only at the end):

```bash
npm run build:fixtures
npm test
npm run test:tokens
npm run test:heredoc
npm run build
```

If runtime/cost is high during development, run targeted tests continuously, but do not commit phase completion until the full gate above is green.

---

## Phase 0 - Contract Freeze and Baseline
### Objective
Lock API contracts and migration policy so implementation phases do not churn.

### Implementation Requirements
- Write a brief design note in-repo (or at top of implementation PR) resolving:
  - import path (`mlld` vs `mlld/sdk`)
  - method naming (`changes` vs `diff`)
  - `VirtualFS.over` signature
  - `MemoryFileSystem` migration policy
- Define canonical `VirtualFS` behavior for:
  - ENOENT error shape (`code`, `path`)
  - path normalization rules
  - shadow precedence vs backing precedence
  - delete semantics and directory visibility

### Test Coverage Requirements
- Add a baseline test checklist document entry (what existing tests must remain green).
- Run full regression gate and store status in phase notes.

### Docs + Changelog Requirements
- `CHANGELOG.md`:
  - `Added`: VirtualFS implementation project start (contract locked).
  - `Documentation`: API contract decisions logged.

### Commit Checkpoint
`chore(vfs): lock VirtualFS public contract and migration policy`

### Exit Criteria
- All four critical decisions are explicitly resolved.
- Full regression gate is green.
- Changelog updated.

---

## Phase 1 - VirtualFS Core (`IFileSystemService`) + Unit Coverage
### Objective
Implement `VirtualFS` core read/write filesystem semantics with no advanced patch/diff features yet.

### Implementation Requirements
- Add `services/fs/VirtualFS.ts` implementing `IFileSystemService`:
  - `readFile`, `writeFile`, `appendFile`, `exists`, `mkdir`, `readdir`, `isDirectory`, `stat`
  - optional methods: `access`, `unlink`, `rm`
  - `isVirtual(): true`
- Implement shadow structures:
  - shadow file map
  - deleted path set
  - directory markers/metadata sufficient for `readdir/stat/isDirectory`
- Add factories:
  - `VirtualFS.empty()`
  - `VirtualFS.over(backing: IFileSystemService)`
- Ensure writes are shadow-only; backing store unchanged until flush phase.
- Ensure all read-like operations respect shadow precedence and deleted-path masking.

### Test Coverage Requirements
Add `services/fs/VirtualFS.core.test.ts` covering at minimum:
- read precedence: shadow overrides backing.
- write/append behavior for new and existing files.
- ENOENT behavior parity on missing reads/stats/access.
- `exists/isDirectory/stat` behavior for file, dir, missing.
- `mkdir` recursive/non-recursive semantics.
- `readdir` behavior with mixed shadow/backing entries.
- delete semantics via `unlink/rm` including recursive dir delete.
- `isVirtual()` returns `true`.

Add targeted integration tests:
- `core/services/PathContextService.test.ts` using `VirtualFS.empty()` path existence checks.
- `core/utils/findProjectRoot` behavior against `VirtualFS` scenarios.

### Docs + Changelog Requirements
- `CHANGELOG.md`:
  - `Added`: `VirtualFS` core + factories.
  - `Fixed`: virtual file operation parity edge cases covered.

### Commit Checkpoint
`feat(vfs): implement VirtualFS core filesystem semantics`

### Exit Criteria
- New core test suite exists and passes.
- Existing path/root tests pass with `VirtualFS` usage added.
- Full regression gate is green.
- Changelog updated.

---

## Phase 2 - Change Lifecycle APIs (`changes/reset/discard/flush/export/apply`)
### Objective
Add lifecycle operations for inspecting, applying, and reverting shadow changes.

### Implementation Requirements
- Extend `VirtualFS` with:
  - `changes()` (or canonical equivalent)
  - `reset()`
  - `discard(path)`
  - `flush(path?)`
  - `export()`
  - `apply(patch)`
- Define and implement patch/change types (with strict TS typing).
- `flush(path?)` rules:
  - writes go to backing only when backing exists
  - `flush` without backing throws deterministic error
  - path-scoped flush clears only that path’s shadow state
- `discard(path)` rules:
  - removes shadow/deleted markers for that path and descendants as defined by contract

### Test Coverage Requirements
Add `services/fs/VirtualFS.lifecycle.test.ts` covering:
- created/modified/deleted classification from `changes()`.
- `discard` for created/modified/deleted paths.
- `reset` drops all pending changes.
- `flush(path)` applies one path only.
- `flush()` applies all and clears pending changes.
- no-backing `flush` error case.
- `export/apply` roundtrip across two `VirtualFS` instances.
- patch merge behavior for overlapping paths.

Add integration tests:
- `interpreter/eval/output.structured.test.ts` or new virtualfs-focused test:
  - `/output` writes captured in shadow pre-flush.
- `interpreter/eval/append` coverage:
  - append accumulates in shadow and survives export/apply.

### Docs + Changelog Requirements
- `CHANGELOG.md`:
  - `Added`: change lifecycle APIs.
  - `Documentation`: lifecycle semantics clarified.

### Commit Checkpoint
`feat(vfs): add change lifecycle and patch APIs`

### Exit Criteria
- Lifecycle API tests added and green.
- Output/append integration checks pass.
- Full regression gate is green.
- Changelog updated.

---

## Phase 3 - Diff API (`fileDiff`) and API Compatibility Layer
### Objective
Add human-review diff support and resolve naming compatibility (`diff` vs `changes`).

### Implementation Requirements
- Add `fileDiff(path)` unified diff output.
- Decide implementation approach:
  - dependency (`diff` package), or
  - internal implementation.
- Ensure deterministic output across platforms/newlines.
- Resolve compatibility naming:
  - if needed, add `diff()` alias that returns same data as `changes()`.

### Test Coverage Requirements
Add `services/fs/VirtualFS.diff.test.ts` covering:
- modified file diff with line-level hunks.
- created file diff.
- deleted file diff.
- unchanged file returns `null` (or chosen contract).
- diff behavior when file exists only in backing vs only in shadow.

Add API compatibility tests:
- alias behavior (`diff`/`changes`) and deprecation notice behavior if applicable.

### Docs + Changelog Requirements
- `CHANGELOG.md`:
  - `Added`: `fileDiff` API.
  - `Changed`: final naming contract for `changes/diff`.

### Commit Checkpoint
`feat(vfs): add fileDiff and finalize inspection API naming`

### Exit Criteria
- Diff suite is deterministic and green.
- Compatibility behavior is documented and tested.
- Full regression gate is green.
- Changelog updated.

---

## Phase 4 - SDK + Interpreter Integration
### Objective
Expose `VirtualFS` publicly and validate interpreter/SDK behavior over virtual filesystems.

### Implementation Requirements
- Export `VirtualFS` from SDK public entry:
  - `sdk/index.ts`
  - package exports (`package.json`) as decided in Phase 0.
- Ensure `processMlld`/`execute` examples work with `VirtualFS` without additional wiring.
- Validate `ModuleContentProcessor` `isVirtual()` behavior still works intentionally with `VirtualFS`.
- Keep `NodeFileSystem` default behavior unchanged unless explicit opt-in.

### Test Coverage Requirements
Update/add SDK tests:
- `sdk/index.test.ts`:
  - run `processMlld` with `VirtualFS.empty()` pre-populated files.
- `sdk/execute.test.ts`:
  - run `execute` with `VirtualFS.over(...)`, inspect pending changes, flush path.
- add package-export tests (or runtime import smoke tests) for decided import path.

Interpreter integration tests:
- `interpreter/eval/import/ModuleContentProcessor` virtual mode regression:
  - markdown fallback + strict retry behavior unchanged where expected.
- `interpreter/eval/import/DirectoryImportHandler` with mixed shadow/backing directory entries.

### Docs + Changelog Requirements
- `CHANGELOG.md`:
  - `Added`: public SDK export for `VirtualFS`.
  - `Fixed`: virtual filesystem import/output integration regressions (if any).

### Commit Checkpoint
`feat(vfs): expose VirtualFS in sdk and integrate interpreter paths`

### Exit Criteria
- SDK and interpreter integration tests pass.
- Public import path works and is tested.
- Full regression gate is green.
- Changelog updated.

---

## Phase 5 - `MemoryFileSystem` Migration and Harness Parity
### Objective
Migrate test infrastructure to `VirtualFS` with minimal churn and zero regression.

### Implementation Requirements
- Convert `tests/utils/MemoryFileSystem.ts` to one of:
  - compatibility wrapper over `VirtualFS.empty()` (recommended first), or
  - deprecate and migrate all usages directly.
- Preserve any extra test-only helper behavior (for example `execute()` stub) if still needed.
- Migrate high-value tests first (`sdk`, `core/services`, fixture harness), then broad codemod.
- Do not leave mixed semantics undocumented.

### Test Coverage Requirements
Add parity tests `tests/utils/MemoryFileSystem.parity.test.ts`:
- verify wrapper behavior matches old MemoryFS for core operations.
- verify path normalization behavior expected by fixture harness.
- verify helper methods still available if retained.

Migration regression checks:
- `interpreter/interpreter.fixture.test.ts` must remain green.
- run targeted suites for resolver/import/content-loader paths that heavily depend on virtual FS operations.

### Docs + Changelog Requirements
- `docs/dev/TESTS.md` update:
  - test environment now built on `VirtualFS` (directly or via wrapper)
  - fixture FS expectations and helper guidance.
- `CHANGELOG.md`:
  - `Changed`: test infrastructure migration to VirtualFS.

### Commit Checkpoint
`refactor(tests): migrate MemoryFileSystem usage onto VirtualFS`

### Exit Criteria
- Fixture harness and core interpreter suites are green.
- Parity tests pass.
- Full regression gate is green.
- Changelog updated.

---

## Phase 6 - Documentation Completion (Dev + User)
### Objective
Complete documentation updates so feature is discoverable, accurate, and test-backed.

### Implementation Requirements
Update these docs explicitly:
- `docs/dev/ARCHITECTURE.md`
  - add VirtualFS positioning under entry surfaces/runtime I/O boundaries.
- `docs/dev/GRAMMAR.md`
  - explicitly note no grammar change for VirtualFS (runtime-only feature).
- `docs/dev/TESTS.md`
  - VirtualFS test harness guidance and conventions.
- `docs/dev/SDK.md`
  - SDK architecture section for virtual filesystem usage and lifecycle APIs.
- `docs/user/sdk.md`
  - practical examples: `VirtualFS.empty()`, `VirtualFS.over(...)`, `changes/fileDiff/flush/discard/export/apply`.
  - clearly document review-before-flush workflow and no-backing flush error behavior.

Also align or fix inconsistent examples from vision/spec with finalized API from Phase 0.

### Test Coverage Requirements
- Rebuild fixtures from docs examples: `npm run build:fixtures`.
- Ensure doc-derived tests remain green in full `npm test`.
- Add at least one explicit SDK doc-example test in `sdk/` to prevent drift.

### Docs + Changelog Requirements
- `CHANGELOG.md`:
  - `Documentation`: dev + user SDK docs for VirtualFS.

### Commit Checkpoint
`docs(vfs): publish architecture/test/sdk documentation updates`

### Exit Criteria
- All listed docs updated and internally consistent.
- Doc-derived fixture/tests pass.
- Full regression gate is green.
- Changelog updated.

---

## Phase 7 - Final Hardening and Release Readiness
### Objective
Close remaining risks, enforce full quality bar, and prepare merge-ready change set.

### Implementation Requirements
- Audit for unresolved TODOs and API naming drift.
- Ensure TypeScript public types for VirtualFS are exported cleanly.
- Validate no accidental behavior changes in `NodeFileSystem` path.
- Optional but recommended: basic performance sanity test for large shadow sets.

### Test Coverage Requirements
- Re-run global regression gate.
- Add targeted stress test for:
  - many files in shadow,
  - deep directory merges,
  - repeated `flush/discard` cycles.

### Docs + Changelog Requirements
- Final changelog pass to ensure all phase bullets are consolidated and not duplicated.
- Verify docs examples compile/parse with current API.

### Commit Checkpoint
`chore(vfs): final hardening and release gate for VirtualFS`

### Exit Criteria
- Global regression gate green.
- No open TODOs in VirtualFS implementation scope.
- Changelog and docs finalized.

---

## Commit Plan Summary
1. `chore(vfs): lock VirtualFS public contract and migration policy`
2. `feat(vfs): implement VirtualFS core filesystem semantics`
3. `feat(vfs): add change lifecycle and patch APIs`
4. `feat(vfs): add fileDiff and finalize inspection API naming`
5. `feat(vfs): expose VirtualFS in sdk and integrate interpreter paths`
6. `refactor(tests): migrate MemoryFileSystem usage onto VirtualFS`
7. `docs(vfs): publish architecture/test/sdk documentation updates`
8. `chore(vfs): final hardening and release gate for VirtualFS`

## Non-Negotiable Exit Conditions (Whole Project)
- `VirtualFS` fully implements `IFileSystemService` and lifecycle/diff APIs from finalized contract.
- SDK public surface exposes VirtualFS with stable documented import path.
- Interpreter integration (imports/output/append/path-context) is regression-tested.
- Test harness migration is complete (direct or compatibility wrapper) and documented.
- All referenced docs are updated.
- Every phase includes changelog updates.
- Full regression gate is green at each phase completion commit.
