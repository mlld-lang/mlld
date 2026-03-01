# VirtualFS Plan

This plan tracks the VirtualFS rollout across tickets in `.tickets/virtualfs/`.

## Phase 0: Contract Freeze and Baseline (`m-2586`)

Finalized contracts:

1. Public import path contract:
- `VirtualFS` is exported from the root SDK surface (`import { VirtualFS } from "mlld"`).
- `mlld/sdk` is supported as a subpath alias to the same SDK surface for compatibility.

2. Inspection API naming:
- Canonical inspection method: `changes()`.
- Compatibility alias: `diff()` (same return shape as `changes()`).

3. `VirtualFS.over(...)` signature:
- Contract: `VirtualFS.over(backing: IFileSystemService)`.
- No string-path convenience overload in core API.

4. MemoryFileSystem migration strategy:
- Wrapper-first migration.
- `tests/utils/MemoryFileSystem.ts` remains stable for tests while delegating behavior to `VirtualFS.empty()`.

Canonical behavior requirements locked in this phase:
- ENOENT shape: thrown filesystem errors include `code` and `path`.
- Path normalization: deterministic absolute-path normalization before state operations.
- Shadow precedence: shadow writes override backing reads until flush.
- Delete masking and directory visibility: deletes mask backing content; virtual directories remain visible where shadow/markers imply them.

## Phase 1: Core `IFileSystemService` Semantics (`m-a251`)

Targets:
- Implement `services/fs/VirtualFS.ts` with full `IFileSystemService` behavior.
- Add `services/fs/VirtualFS.core.test.ts`.
- Add/extend PathContext + project-root integration tests with VirtualFS.

## Phase 2: Change Lifecycle APIs (`m-978e`)

Targets:
- `changes()` / `reset()` / `discard(path)` / `flush(path?)` / `export()` / `apply(patch)`.
- Deterministic patch serialization and path-scoped lifecycle behavior.
- `services/fs/VirtualFS.lifecycle.test.ts` + output/append integration coverage.

## Phase 3: `fileDiff` and Inspection Compatibility (`m-0c26`)

Targets:
- `fileDiff(path)` unified diff output with deterministic newline handling.
- Final `changes()` canonical + `diff()` alias behavior and tests.
- `services/fs/VirtualFS.diff.test.ts`.

## Phase 4: SDK and Interpreter Integration (`m-14ff`)

Targets:
- Export VirtualFS on SDK/public package surfaces.
- Validate interpreter import/output paths under virtual fs mode.
- Preserve default NodeFileSystem behavior for non-VirtualFS callers.

## Phase 5: MemoryFileSystem Migration (`m-56a0`)

Targets:
- Move `tests/utils/MemoryFileSystem.ts` to wrapper-first VirtualFS implementation.
- Keep test helper compatibility behavior.
- Add `tests/utils/MemoryFileSystem.parity.test.ts`.

## Phase 6: Docs Completion (`m-78df`)

Targets:
- Update required dev/user docs and docs atoms with VirtualFS usage.
- Add doc-mirroring SDK test coverage to reduce drift.

## Phase 7: Final Hardening (`m-df9f`)

Targets:
- Stress and regression coverage for deep directory merges and repeated lifecycle operations.
- Final consistency sweep for exports/docs/changelog/API.
