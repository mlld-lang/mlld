---
updated: 2026-03-01
tags: #virtualfs, #filesystem, #sdk
related-docs: plan-virtualfs.md, vision-virtualfs.md, docs/dev/SDK.md, docs/dev/TESTS.md
related-code: services/fs/IFileSystemService.ts, services/fs/NodeFileSystem.ts, services/fs/VirtualFS.ts, tests/utils/MemoryFileSystem.ts, sdk/index.ts, package.json
---

# VIRTUALFS CONTRACT

This document freezes the VirtualFS public contract and migration policy before implementation.

## Final Decisions

1. Public import path contract
- Canonical: root SDK export (`import { VirtualFS } from "mlld"`).
- Compatibility alias: `mlld/sdk` export path points to the same surface.
- Affected files: `sdk/index.ts`, `package.json` exports map.
- Downstream owners: Phase 4 (`m-14ff`), Phase 6 (`m-78df`).

2. Inspection API naming contract
- Canonical method name: `changes()`.
- Compatibility alias: `diff()` (same result as `changes()`).
- Docs and examples should prefer `changes()`.
- Affected files: `services/fs/VirtualFS.ts`, docs in SDK/dev guides.
- Downstream owners: Phase 3 (`m-0c26`), Phase 6 (`m-78df`).

3. `VirtualFS.over(...)` signature contract
- Contract: `VirtualFS.over(backing: IFileSystemService)`.
- No path-string overload in core contract.
- Rationale: explicit dependency injection, predictable behavior across Node/test/browser adapters.
- Affected files: `services/fs/VirtualFS.ts`, `sdk/index.ts`, docs examples.
- Downstream owners: Phase 1 (`m-a251`), Phase 4 (`m-14ff`), Phase 6 (`m-78df`).

4. MemoryFileSystem migration strategy
- Wrapper-first migration.
- `tests/utils/MemoryFileSystem.ts` remains available but delegates to `VirtualFS.empty()`.
- Rationale: minimizes suite churn while converging test/runtime semantics.
- Affected files: `tests/utils/MemoryFileSystem.ts`, fixture harness tests.
- Downstream owners: Phase 5 (`m-56a0`), Phase 7 (`m-df9f`).

## Canonical Behavior Requirements

ENOENT shape:
- Errors for missing paths include `code` and `path`.
- `code` must be stable (`ENOENT`) for compatibility with existing consumers/tests.

Path normalization:
- Normalize input paths to deterministic absolute form before VirtualFS state operations.
- Normalize repeated separators and dot-segments to avoid duplicate logical entries.

Shadow precedence:
- Reads resolve in order: shadow writes, delete masks, backing filesystem.
- Writes/append/mkdir/rm/unlink affect shadow state only until `flush(...)`.

Delete masking and directory visibility:
- Deleted paths mask backing entries from `readFile`, `exists`, `stat`, `readdir`, `isDirectory`.
- Directory listing/visibility must merge backing + shadow entries while honoring delete masks.

No-backing flush:
- `flush(...)` fails when VirtualFS has no backing filesystem (`VirtualFS.empty()`).

## Core Semantics Map (Phase 1)

Core API behavior in `services/fs/VirtualFS.ts`:
- `VirtualFS.empty()` creates a virtual-only filesystem with no backing.
- `VirtualFS.over(backing)` overlays copy-on-write shadow state over any `IFileSystemService`.
- Writes (`writeFile`, `appendFile`, `mkdir`, `rm`, `unlink`) mutate shadow state only.
- Reads and existence checks consult shadow state and delete masks before backing.
- `readdir` merges backing and shadow entries with deterministic sorting.
- `isVirtual()` returns `true` for virtual-mode detection in interpreter paths.

Lifecycle API behavior:
- `changes()` is canonical change inspection.
- `diff()` is a compatibility alias of `changes()`.
- `fileDiff(path)` returns deterministic unified diff output for file-level inspection.
- `discard(path)` removes shadow/deleted state under a scoped path.
- `reset()` clears all shadow/deleted lifecycle state.
- `export()` emits deterministic patch entries.
- `apply(patch)` rehydrates shadow state from patch entries.
- `flush(path?)` applies scoped or global patch state to backing.

## Non-Goals (Contract Phase)

- No production implementation details beyond contract definitions.
- No test-harness migration in this phase.
