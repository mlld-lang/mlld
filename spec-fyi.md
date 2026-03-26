# Spec: `fyi` — Agent Workspace Awareness

## Goal

Give agents runtime visibility into their workspace and the provenance of what they're touching. `fyi` is not prompt content — it's an on-demand introspection surface that agents can query when they need it.

Two components:
1. **Filesystem view** — what files are available, with descriptions and metadata
2. **Taint record** — where files came from, what touched them, whether they should be trusted

## Motivation

Today, an agent running in mlld gets files passed to it but has no way to:
- See what files are available without reading each one
- Understand where a file came from (real file? computed value? user input?)
- Check whether a file was previously touched by untrusted input
- See what edits have been made during the current run

`fyi` closes this gap. It's the difference between handing someone a stack of papers and giving them a filing cabinet with labeled drawers — the information is available when they look for it, not forced into their context window.

## Design

### Exposure: MCP tools

`fyi` is exposed to agents as MCP tools. This is the natural fit — agents already interact through tools, and `fyi` is fundamentally an interactive query surface, not a static data dump.

Two tools:

#### `fyi_ls` — List available files

Returns the directory listing of the agent's workspace with descriptions.

**Input:**
```json
{
  "path": "/docs"        // optional, defaults to "/"
}
```

**Output (JSON):**
```json
{
  "path": "/docs",
  "entries": [
    { "name": "api.md", "type": "file", "desc": "REST API endpoint reference", "taint_count": 0 },
    { "name": "architecture.md", "type": "file", "desc": "System design and data flow", "taint_count": 0 },
    { "name": "examples", "type": "directory", "entries": [
      { "name": "basic.md", "type": "file", "desc": "Minimal working example", "taint_count": 0 }
    ]}
  ]
}
```

When called at root (`/`):
```json
{
  "path": "/",
  "entries": [
    { "name": "docs", "type": "directory", "desc": null, "taint_count": 0 },
    { "name": "src", "type": "directory", "desc": null, "taint_count": 3 },
    { "name": "readme.md", "type": "file", "desc": "Project overview and setup", "taint_count": 0 }
  ]
}
```

The listing includes:
- File/directory names and types
- Descriptions (from `file`/`files` `desc` fields)
- `taint_count` — number of taint labels as a signal to inspect further (0 = clean)
- Directories show aggregate `taint_count` across children

#### `fyi_inspect` — Inspect a file's provenance and history

Returns detailed taint, provenance, and edit history for a specific file or directory.

**Input:**
```json
{
  "path": "/src/index.js"
}
```

**Output (JSON):**
```json
{
  "path": "/src/index.js",
  "origin": "file:///real/path/src/index.js",
  "type": "real",
  "description": "Main entry point",
  "taint": {
    "labels": ["src:file", "src:dynamic", "net:external"],
    "entries": [
      { "label": "src:file", "source": "filesystem", "run": null },
      { "label": "src:dynamic", "source": "agent-refactor", "run": "2026-02-28T14:30:00Z", "detail": "modified lines 12-45" },
      { "label": "net:external", "source": "api-fetch", "run": "2026-02-27T09:15:00Z", "detail": "content fetched from external API" }
    ]
  },
  "provenance": [
    { "step": 1, "source": "file:///real/path/src/index.js", "event": "original" },
    { "step": 2, "source": "agent-refactor", "timestamp": "2026-02-28T14:30:00Z", "event": "modified lines 12-45" },
    { "step": 3, "source": "current-run", "event": "no edits yet" }
  ],
  "edits": []
}
```

For a directory, returns aggregate taint across all files and lists which children have taint labels:

```json
{
  "path": "/src",
  "type": "directory",
  "taint": {
    "labels": ["src:file", "src:dynamic", "net:external"],
    "children_with_taint": [
      { "path": "/src/index.js", "labels": ["src:file", "src:dynamic", "net:external"] },
      { "path": "/src/helpers.js", "labels": ["src:file"] }
    ]
  }
}
```

### What the agent sees

The agent sees a **unified filesystem tree** — not resolver structure. The script author decides what goes into the workspace; the agent sees a flat file tree starting at `/`.

```mlld
>> Script author's view (resolvers)
file <@workspace/readme.md> = @readme, "Project overview"
files <@workspace/src/> = [
  { "index.js": <@root/src/index.js>, "description": "Main entry point" },
  { "helpers.js": <@root/src/helpers.js>, "description": "Utility functions" }
]
files <@workspace/docs/> = [
  { "api.md": @apiDocs, "description": "API reference" }
]

>> Agent's view (unified tree via fyi_ls)
>> /
>>   readme.md        — Project overview
>>   src/
>>     index.js       — Main entry point
>>     helpers.js     — Utility functions
>>   docs/
>>     api.md         — API reference
```

The agent doesn't know or care that `index.js` came from `@root` or that `api.md` was a computed value. They're all just files.

## Taint record design

### Two levels of detail

**Summary** (shown in `fyi_ls`):
- A count of taint labels, or nothing if clean
- Enough for the agent to notice "this file has history" and choose to investigate

**Detail** (shown in `fyi_inspect`):
- Full label list with timestamps and sources
- Provenance chain showing every touchpoint
- Edit history from the current run (diffs if available)

### Taint sources

| Source | How it gets taint |
|---|---|
| Virtual file from clean value | Inherits source value's taint (may be empty) |
| Virtual file from `@payload` | `src:dynamic` (automatic) |
| Virtual file from `@state` | `src:dynamic` (automatic) |
| Real file, no prior history | `src:file` only |
| Real file, prior run history | `src:file` + accumulated taint from audit log |
| File modified by `output` in current run | Adds taint from the output value |

### Audit log reconstruction

For real files projected into the workspace, `fyi_inspect` reconstructs taint history from `.mlld/sec/audit.jsonl`:

1. Look up the file's real path in the audit log
2. Collect all entries that touched this path across runs
3. Merge taint labels (cumulative, not latest-only)
4. Build the provenance chain in chronological order

Performance: requires a path-indexed lookup over the audit log. For large histories, an auxiliary index file (`.mlld/sec/audit-index.json`) keyed by path would avoid full scans.

### Current-run edits

If the agent or script has modified a file during the current run, `fyi_inspect` shows:
- The `VirtualFSChange` entry (created/modified/deleted)
- The unified diff (from `vfs.fileDiff()`)
- The taint of the value that was written

This gives the agent a way to review its own work — "what did I change, and does it look right?"

## Integration with `file`/`files` directives

### Descriptions flow through

Descriptions set in `file`/`files` declarations are stored as VFS metadata and surface in `fyi_ls`:

```mlld
file <@workspace/config.json> = { value: @config, desc: "Runtime configuration — do not modify" }
```

The agent sees via `fyi_ls`: `config.json` with `desc: "Runtime configuration — do not modify"`

This is a soft signal, not enforcement. Guards handle enforcement.

### Anonymous VFS workspaces

When an agent receives an anonymous workspace (`var @ws = files [...]`), `fyi` scopes to that workspace. The agent's `fyi_ls` shows only the files in `@ws`, not the script author's broader environment.

```mlld
for @agent in @agents [
  var @ws = files [
    { "context.md": @agent.docs, desc: "Agent-specific context" },
    { "task.md": @agent.task, desc: "Current task description" }
  ]

  >> Agent's fyi_ls shows only context.md and task.md
  exe @agent.handler with @ws
]
```

## Non-goals (for this spec)

- **Write permissions via fyi** — `fyi` is read-only introspection. Guards control what agents can write.
- **Cross-agent visibility** — agents see only their own workspace. No mechanism to inspect another agent's files.
- **Real-time taint updates** — taint is captured at projection time and reconstructed on inspect. No live push notifications.
- **Modifying descriptions at runtime** — descriptions are set at declaration time. Agents cannot change them.

## Open questions

1. **Tool naming**: `fyi_ls` and `fyi_inspect`, or `fyi_list` and `fyi_detail`, or something else? The names should be obvious to an LLM agent.
2. **Aggregate taint on directories**: Current spec merges child labels and lists children with taint. Is that the right level of detail, or should it just show the count?
3. **Description length limits**: Should there be a recommended max length for file descriptions? Too long defeats the purpose of a summary.
4. **fyi availability**: Is `fyi` always available to every agent, or does the script author opt in? Recommendation: always available — it's metadata, not a capability.
5. **Audit index format**: Flat JSON keyed by path? SQLite? What's the right trade-off for the audit index given mlld's "no heavy dependencies" stance?

