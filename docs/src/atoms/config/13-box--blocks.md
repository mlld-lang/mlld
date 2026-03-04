---
id: box-blocks
qa_tier: 2
title: Box Blocks
brief: Scoped execution within a box configuration
category: config
parent: box
tags: [box, blocks, isolation, scoping]
related: [box-overview, box-config, security-policies]
related-code: [interpreter/eval/box.ts, grammar/directives/box.peggy]
updated: 2026-03-04
---

Execute directives within a scoped environment using `box @config [ ... ]`.

```mlld
var @sandbox = { tools: ["Read", "Write", "Bash"] }

box @sandbox [
  run cmd { echo "inside sandbox" }
]
```

The environment is active only within the block and released on exit.

**Anonymous workspace block:**

```mlld
box [
  file "task.md" = "inside box"
  run cmd { cat task.md }
]
```

`box [ ... ]` creates an anonymous in-memory workspace for the block. Commands run via ShellSession with cwd at the project root.

**Named workspace block:**

```mlld
files <@workspace/> = [{ "task.md": "from resolver" }]

box @workspace [
  run cmd { cat task.md }
]
```

Use `box @workspace` to bind an existing resolver-backed workspace as the active box filesystem.

**Inspect workspace edits and diffs:**

```mlld
files <@workspace/> = [{ "task.md": "draft" }]

box @workspace [
  file "notes.md" = "review complete"
]

show @workspace.mx.edits
show <@workspace/notes.md>.mx.diff
```

- `@workspace.mx.edits` — array of `{path, type, entity}` where type is `created`/`modified`/`deleted`
- `<@workspace/path>.mx.diff` — unified diff string for a single file

**Git hydration with `files = git`:**

```mlld
files <@workspace/> = git "https://github.com/mlld-lang/mlld" branch:"main" path:"docs/" depth:1

box @workspace with { tools: ["Read", "Bash"], net: { allow: ["github.com"] } } [
  run cmd { ls . }
]
```

Use `git` as a `files` source to clone text files into workspace VFS.

Supported git options:
- `auth:` token or keychain ref (for private repos)
- `branch:` branch/tag/commit
- `path:` subdirectory within the repo
- `depth:` shallow clone depth (default `1`)

Hydration behavior:
- Text files are imported into workspace VFS
- Binary files and symlinks are skipped with warnings
- Imported files are tainted with `src:git` provenance metadata
- `box.net` allow rules are enforced for remote git hosts

**Return values:**

```mlld
var @config = { tools: ["Read", "Write"] }

var @result = box @config [
  => "completed"
]

show @result
```

Use `=>` to return a value from the block.

**Inline derivation with `with`:**

```mlld
var @sandbox = { tools: ["Read", "Write", "Bash"] }

var @result = box @sandbox with { tools: ["Read"] } [
  => "read-only mode"
]

show @result
```

Derives a restricted environment inline without naming it.

**Named child environments:**

```mlld
var @sandbox = { tools: ["Read", "Write", "Bash"] }
var @readOnly = { ...@sandbox, tools: ["Read"] }

box @readOnly [
  run cmd { cat README.md }
]
```

Child environments can only restrict parent capabilities, never extend them.

**Notes:**
- Directives inside blocks use bare syntax (no `/` prefix)
- Environment resources are released when the block exits
- `with { ... }` is box directive config syntax (`box @cfg with { ... } [ ... ]`), not a general object-modifier expression
- See `box-overview` for concepts, `box-config` for configuration fields
