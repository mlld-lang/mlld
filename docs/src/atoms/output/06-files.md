---
id: files-directive
title: Files Directive
brief: Write multiple files, create workspace resolvers, or hydrate from git
category: output
tags: [output, files, workspace, resolver, vfs, git]
related: [file-directive, box-directive, box-blocks]
related-code: [grammar/directives/file.peggy, interpreter/eval/file.ts]
updated: 2026-03-04
qa_tier: 1
---

```mlld
files "src/" = [
  { "index.js": @source, desc: "Entry point" },
  { "config.json": @config }
]
```

Each entry is an object with one file key mapped to content, and optional `desc` for metadata.

**Named resolver — workspace creation:**

```mlld
files <@workspace/> = [{ "task.md": @task }]
files <@workspace/src/> = [{ "main.js": @code }]

var @content = <@workspace/task.md>
show @content
```

The `<@name/>` syntax creates a VFS-backed resolver on first use. Subsequent `files <@name/subdir>` writes extend the same VFS. Read files back with `<@name/path>`.

**Descriptions:**

The `desc` field populates `workspace.descriptions` — a map of path to description. Agents can inspect file purposes without reading content:

```mlld
files <@ws/> = [
  { "task.md": @task, desc: "Current task specification" },
  { "context.md": @ctx, desc: "Background context" }
]
show @ws
```

**Inside a box block** — writes to the active workspace VFS without creating a resolver:

```mlld
box [
  files "src/" = [
    { "index.js": @source },
    { "util.js": @utils }
  ]
  run cmd { ls src/ }
]
```

**Git hydration:**

```mlld
files <@workspace/> = git "https://github.com/user/repo" branch:"main"
files <@workspace/docs/> = git "https://github.com/user/repo" path:"docs/" depth:1
```

Clones text files into VFS. Binary files and symlinks are skipped. Options: `auth:` (keychain ref), `branch:` (branch/tag/commit), `path:` (subdirectory), `depth:` (default 1). Git-sourced files carry `src:git` taint.

**Workspace inspection:**

```mlld
files <@ws/> = [{ "file.md": "draft" }]
show @ws.mx.edits
show <@ws/file.md>.mx.diff
```

`.mx.edits` returns the change list. `<@ws/path>.mx.diff` returns a unified diff string.
