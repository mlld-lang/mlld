# Virtual Filesystem

mlld's virtual filesystem (VFS) is a sandboxed file layer that sits between mlld scripts and the real filesystem. Scripts read and write files normally — the VFS controls what they see and where their writes go.

## How it works

The VFS is a copy-on-write layer over a backing store.

**Reads** check the shadow layer first, then fall through to the backing store (real disk, or nothing in the browser).

**Writes** always go to the shadow layer. The real filesystem is never modified during execution.

**Flush** applies the shadow layer's changes to the backing store as a batch.

```
┌─────────────────────────┐
│     mlld script         │  reads and writes normally
├─────────────────────────┤
│     shadow layer        │  captures all writes
├─────────────────────────┤
│     backing store       │  real FS, or empty (browser)
└─────────────────────────┘
```

## SDK usage

### Sandboxed agent

Give an agent access to files without letting it modify the real filesystem.

```js
import { createEnvironment, VirtualFS } from 'mlld/sdk';

// Create a VFS backed by the real filesystem
const vfs = VirtualFS.over('/path/to/project');

// Agent can read real files
// Agent writes go to the shadow layer
const env = createEnvironment({ fs: vfs });
await env.run('/agent/refactor.md');

// Inspect what the agent wants to change
const changes = vfs.diff();
// [
//   { path: '/src/api.ts', type: 'modified', additions: 12, deletions: 3 },
//   { path: '/src/utils/new-helper.ts', type: 'created' },
// ]

// Review individual changes
const fileDiff = vfs.fileDiff('/src/api.ts');
// --- a/src/api.ts
// +++ b/src/api.ts
// @@ -14,3 +14,12 @@
// ...

// Apply approved changes to disk
vfs.flush();
```

### Selective flush

Don't flush everything. Review and apply changes one at a time.

```js
const changes = vfs.diff();

for (const change of changes) {
  if (await reviewApproved(change)) {
    vfs.flush(change.path);
  } else {
    vfs.discard(change.path);
  }
}
```

### Guard-gated writes

Use mlld's guard system to flag writes that need review. The agent keeps running — flagged writes sit in the shadow layer until approved.

```mlld
/guard @fs-review
  when write-path matches "*.config.*" => flag for review
  when write-path matches "*.env*" => deny
```

```js
const vfs = VirtualFS.over('/path/to/project');
const env = createEnvironment({ fs: vfs });

await env.run('/agent/deploy-prep.md');

// Flagged changes are in the shadow layer, not on disk
const flagged = vfs.flagged();
// [ { path: '/tsconfig.json', reason: 'matches *.config.*' } ]

// Unflagged changes can be flushed immediately
vfs.flushUnflagged();

// Flagged changes wait for review
for (const item of flagged) {
  if (await humanReview(item)) {
    vfs.flush(item.path);
  }
}
```

The agent never blocks. It writes to the shadow layer and moves on. Guards tag changes for review without interrupting execution.

### Pre-populated VFS (browser / testing)

When there's no backing store, populate the VFS directly.

```js
// No backing store — pure in-memory
const vfs = VirtualFS.empty();

vfs.write('/data/report.md', reportMarkdown);
vfs.write('/templates/summary.md', templateContent);

const env = createEnvironment({ fs: vfs });
await env.run('/templates/summary.md');

// Read what the script produced
const output = vfs.read('/output.md');
```

This is the same VFS that powers mlldx in the browser — same interface, same behavior, no disk.

### Testing

Run mlld scripts against a synthetic filesystem. Assert on what they wrote. No cleanup needed.

```js
test('deploy script writes manifest', async () => {
  const vfs = VirtualFS.over('/path/to/project');
  const env = createEnvironment({ fs: vfs });

  await env.run('/scripts/deploy.md');

  const manifest = JSON.parse(vfs.read('/dist/manifest.json'));
  expect(manifest.version).toBe('2.0.0');

  // Nothing written to disk — test is side-effect free
});
```

### Diffing and versioning

The shadow layer is a changeset. You can diff it, serialize it, or apply it later.

```js
const vfs = VirtualFS.over('/path/to/project');
const env = createEnvironment({ fs: vfs });

await env.run('/agent/migration.md');

// Export the changeset
const patch = vfs.export();
// { files: { '/src/db.ts': { type: 'modified', content: '...' }, ... } }

// Apply it later, or on a different machine
const vfs2 = VirtualFS.over('/path/to/project');
vfs2.apply(patch);
vfs2.flush();
```

## How it fits together

| Context | Backing store | Writes go to | Flush target |
|---------|---------------|-------------|--------------|
| Browser (mlldx) | empty | shadow layer | export/download |
| Agent sandbox | real FS (read-only) | shadow layer | real FS (on approval) |
| Testing | real FS or empty | shadow layer | nowhere (discarded) |
| SDK embedding | configurable | shadow layer | configurable |

One abstraction. The backing store and flush behavior change; the interface mlld scripts see does not.
