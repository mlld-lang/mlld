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

All box blocks create an in-memory workspace for the block. `box [ ... ]`, `box @config [ ... ]`, and `box @workspace [ ... ]` all support `file`/`files` directives and shell commands via ShellSession with cwd at the project root.

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

**Return values and workspace binding:**

```mlld
var @result = box [
  file "data.txt" = "hello"
  => "completed"
]

show @result                >> "completed" — box returned a value via =>
```

When a box uses `=>`, the variable gets the returned value, not the workspace.

To access workspace files after the box exits, omit `=>` so the variable binds to the workspace:

```mlld
var @ws = box [
  file "data.txt" = "hello"
]

show <@ws/data.txt>         >> "hello" — reads from workspace via resolver
```

The `<@name/path>` resolver syntax reads from the workspace VFS after the box exits. Inside the box body, use `run cmd { cat file.txt }` to read via the ShellSession — bare `<file.txt>` reads from the real filesystem, not the active workspace.

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
- Ambient `@mx.box` includes active bridge metadata (`mcpConfigPath`, `socketPath`) while inside the box scope
- See `box-overview` for concepts, `box-config` for configuration fields

**Per-call tool configuration via `config.tools`:**

When an `exe llm` is invoked with a `config.tools` array, the runtime automatically creates MCP bridges and exposes the result on `@mx.llm`:

```mlld
exe llm @agent(prompt, config) = [
  let @cfg = @config ? @config : {}
  >> @mx.llm.config   — MCP config file path for the explicit tool policy
  >> @mx.llm.allowed  — unified tool names for --allowedTools or equivalent
  >> @mx.llm.native   — native tool names CSV (empty when no native tools requested)
  >> @mx.llm.inBox    — true when an active VFS bridge exists
  >> @mx.llm.hasTools  — true when config.tools was specified
  => @prompt | cmd { claude -p --allowedTools "@mx.llm.allowed" }
]
```

Inside a box, string tools (like `"Read"`) route through a filtered VFS bridge proxy. Outside a box, string tools pass through as native CLI tool names. Exe refs always get their own function MCP bridge. The runtime handles all of this — module authors just read `@mx.llm`.

Function tools (exe refs) get their own MCP server:

```mlld
exe @double(n) = cmd { echo $(( @n * 2 )) }

var @r = box [
  let @answer = @claude("Double 21", { model: "haiku", tools: ["Read", @double] })
  => @answer
]
```

The runtime combines both the VFS bridge (for Read) and a function bridge (for @double) into a single MCP config file, exposed via `@mx.llm.config`.
