# Spec: Virtual Filesystem

## Goal

A copy-on-write virtual filesystem that implements `IFileSystemService`. Scripts see a normal filesystem. Writes go to a shadow layer. The backing store (real disk or nothing) is never modified until explicitly flushed.

## What already exists

- **`IFileSystemService`** — the interface mlld uses for all file I/O. Already has `isVirtual()`.
- **`MemoryFileSystem`** (`tests/utils/`) — a complete in-memory implementation, used in tests today. Has `readFile`, `writeFile`, `readdir`, `stat`, `mkdir`, `rm`, `unlink`, path normalization, directory tracking.
- **`NodeFileSystem`** — the real filesystem implementation wrapping `fs/promises`.
- **`isVirtual()` checks** — already used in `ModuleContentProcessor.ts:636` to change behavior for virtual filesystems (e.g., defaulting to markdown mode).
- **`dynamicModules`** — already provides runtime data injection without filesystem I/O. The VFS complements this for file-shaped data.
- **`state://` protocol** — already captures writes without filesystem persistence. The VFS does the same for file writes.

## Design

### VirtualFS class

```typescript
// New file: services/fs/VirtualFS.ts

export class VirtualFS implements IFileSystemService {
  private shadow = new Map<string, string>();          // path → content (writes)
  private deleted = new Set<string>();                  // paths deleted in shadow
  private backing: IFileSystemService | null;           // real FS or null (browser)

  // Factory methods
  static empty(): VirtualFS;                            // no backing store
  static over(backing: IFileSystemService): VirtualFS;  // copy-on-write over real FS

  // --- IFileSystemService implementation ---

  async readFile(path: string): Promise<string> {
    // 1. Check shadow layer
    // 2. Check deleted set (throw ENOENT if deleted)
    // 3. Fall through to backing store
    // 4. Throw ENOENT if no backing store
  }

  async writeFile(path: string, content: string): Promise<void> {
    // Always write to shadow layer
    // Remove from deleted set if present
  }

  async exists(path: string): Promise<boolean> {
    // Check shadow, then deleted set, then backing
  }

  // ... rest of IFileSystemService (readdir, stat, mkdir, etc.)

  isVirtual(): boolean { return true; }

  // --- VFS-specific API ---

  // List all paths that have been written or deleted in the shadow layer
  changes(): VFSChange[];

  // Unified diff for a single file (shadow vs backing)
  fileDiff(path: string): string | null;

  // Apply shadow writes to the backing store
  flush(path?: string): Promise<void>;

  // Discard shadow changes for a path (revert to backing store)
  discard(path: string): void;

  // Export the entire shadow layer as a serializable changeset
  export(): VFSPatch;

  // Import a changeset into the shadow layer
  apply(patch: VFSPatch): void;

  // Reset shadow layer (discard all uncommitted changes)
  reset(): void;

  // Convenience: write a file to the shadow layer (same as writeFile, explicit name)
  write(path: string, content: string): void;

  // Convenience: read from shadow or backing (same as readFile, sync for pre-populated VFS)
  read(path: string): string;
}
```

### Types

```typescript
interface VFSChange {
  path: string;
  type: 'created' | 'modified' | 'deleted';
}

interface VFSPatch {
  files: Record<string, { type: 'created' | 'modified' | 'deleted'; content?: string }>;
}
```

### Read path

```
readFile(path)
  → shadow.has(path)?  → return shadow.get(path)
  → deleted.has(path)? → throw ENOENT
  → backing?.readFile(path) ?? throw ENOENT
```

### Write path

```
writeFile(path, content)
  → shadow.set(path, content)
  → deleted.delete(path)
```

### Exists path

```
exists(path)
  → shadow.has(path)?  → true
  → deleted.has(path)? → false
  → backing?.exists(path) ?? false
```

### Directory operations

`readdir` merges entries from shadow and backing, minus deleted paths. `mkdir` creates a directory marker in the shadow. `stat` checks shadow first, then backing.

### Flush

```
flush(path?)
  → if path: write shadow.get(path) to backing, remove from shadow
  → if no path: flush all shadow entries, clear shadow + deleted
  → if no backing: throw (can't flush without a backing store)
```

## Integration with the SDK

### `processMlld` and `interpret`

These already accept `fileSystem: IFileSystemService` in their options. Pass a `VirtualFS` instance:

```typescript
import { processMlld } from 'mlld';
import { VirtualFS } from 'mlld/sdk';

const vfs = VirtualFS.empty();
vfs.write('/template.md', templateContent);
vfs.write('/data.yaml', yamlContent);

const result = await processMlld('/read template.md', {
  fileSystem: vfs,
  filePath: '/run.mld'
});
```

### `execute`

Same — pass as `fileSystem` option:

```typescript
import { execute } from 'mlld';
import { VirtualFS } from 'mlld/sdk';

const vfs = VirtualFS.over(new NodeFileSystem());

const result = await execute('./agent.mld',
  { text: 'refactor the API layer' },
  { fileSystem: vfs, state: { iteration: 0 } }
);

// Agent ran against real files but wrote to shadow layer
const changes = vfs.changes();
// Review, then flush
vfs.flush();
```

### Browser (mlldx)

`createRuntime()` creates a `VirtualFS.empty()` internally. The runtime's `.fs` property exposes it for pre-population:

```typescript
import { createRuntime } from 'mlldx';

const runtime = createRuntime();
runtime.fs.write('/prompt.md', source);
const result = await runtime.run('/prompt.md');
```

Same class, different backing store. Browser has no backing; Node SDK can use `VirtualFS.over(nodeFS)`.

## Diff implementation

For `fileDiff()`, we need line-level diffs. Options:

1. **Inline implementation** — simple Myers diff, ~100 lines. Produces unified diff format.
2. **`diff` npm package** — well-tested, 0 dependencies, ~15KB. `diffLines()` → unified format.

Recommendation: use the `diff` package. It's small, well-tested, and avoids reinventing. Only imported when `fileDiff()` or `changes()` is called (can be lazy-loaded).

## What about guard-gated writes?

The vision doc describes guards flagging writes for async review. This is a future layer on top of VFS, not part of the VFS itself.

The VFS doesn't need to know about guards. The integration point is:

1. Guard runs before a file write effect
2. Guard verdict is `flag` (not `allow` or `deny`)
3. The write goes to the shadow layer as normal (VFS doesn't block)
4. The guard verdict is recorded on the effect's security metadata
5. SDK consumer reads flagged effects from `result.effects` and decides what to flush

This keeps the VFS simple — it's just a filesystem. Guard integration lives in the effect/policy layer where it belongs.

## Relationship to existing `MemoryFileSystem`

`MemoryFileSystem` in `tests/utils/` is a flat in-memory FS with no backing store and no shadow layer concept. It's `VirtualFS.empty()` without the diff/flush/export features.

Options:
1. **Replace `MemoryFileSystem` with `VirtualFS.empty()`** — cleaner, one implementation. Tests get diff/export for free.
2. **Keep both** — `MemoryFileSystem` stays as a minimal test utility, `VirtualFS` is the production class.

Recommendation: option 1. `VirtualFS.empty()` is a superset. Migrate tests incrementally — `VirtualFS.empty()` should pass all existing `MemoryFileSystem` tests since the `IFileSystemService` interface is identical.

## Implementation order

1. **`VirtualFS` core** — constructor, `IFileSystemService` implementation (read/write/exists/stat/readdir/mkdir/rm/unlink), shadow + deleted sets, `isVirtual()`
2. **`VirtualFS.empty()` and `VirtualFS.over()`** — factory methods
3. **`changes()` and `reset()`** — shadow layer inspection
4. **`flush()` and `discard()`** — apply or revert changes
5. **`export()` and `apply()`** — serialize/deserialize changesets
6. **`fileDiff()`** — line-level diff against backing store
7. **Wire into SDK** — export from `mlld/sdk`, document in `docs/user/sdk.md`
8. **Migrate `MemoryFileSystem` tests** — swap to `VirtualFS.empty()`

## What we don't build

- No guard-gated write system (future, separate spec)
- No filesystem watching or events
- No partial file reads/writes (streams, byte ranges)
- No permissions model beyond what `IFileSystemService` already provides
- No symlink support
