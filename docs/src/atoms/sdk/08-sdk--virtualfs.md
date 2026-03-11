---
id: sdk-virtualfs
qa_tier: 3
title: VirtualFS Overlay
brief: Copy-on-write filesystem overlays for SDK workflows
category: sdk
parent: sdk
tags: [sdk, virtualfs, filesystem, sandbox]
related: [sdk-execution-modes, sdk-execute-function]
related-code: [services/fs/VirtualFS.ts, sdk/index.ts, sdk/execute.ts]
updated: 2026-03-01
---

`VirtualFS` provides a copy-on-write filesystem overlay for SDK runs.

```typescript
import { VirtualFS, NodeFileSystem } from 'mlld';

const vfs = VirtualFS.over(new NodeFileSystem());
```

Inspection and lifecycle APIs:

```typescript
const changes = await vfs.changes(); // canonical
const alias = await vfs.diff();      // compatibility alias
const unified = await vfs.fileDiff('/path/file.ts');
```

Selective apply/discard:

```typescript
for (const change of await vfs.changes()) {
  if (await approve(change)) {
    await vfs.flush(change.path);
  } else {
    vfs.discard(change.path);
  }
}
```

Patch export/replay:

```typescript
const patch = vfs.export();

const replay = VirtualFS.over(new NodeFileSystem());
replay.apply(patch);
await replay.flush();
```
