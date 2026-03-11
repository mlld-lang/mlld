---
id: file-directive
title: File Directive
brief: Write one file to workspace or filesystem
category: output
tags: [output, file, workspace, vfs]
related: [files-directive, box-directive, box-blocks]
related-code: [grammar/directives/file.peggy, interpreter/eval/file.ts]
updated: 2026-03-04
qa_tier: 1
---

```mlld
file "task.md" = @task
file "notes/today.md" = `## Notes\n@summary`
```

`file` writes exactly one file. Paths must be relative (no leading `/`) and cannot use `..`.

**Inside a box block** — writes to the box's workspace VFS:

```mlld
box [
  file "task.md" = @task
  file "src/main.js" = @source
  run cmd { cat task.md }
]
```

Files written this way are scoped to the box. ShellSession commands can read them. No resolver is created.

**Outside a box block** — writes to the real filesystem, relative to project root.

**Immutability:** A path can only be written once per scope. Writing the same path again throws an error. Commands inside box blocks (via ShellSession) can modify files — the one-shot rule applies only to `file` directive writes.
