---
id: box-config
qa_tier: 2
title: Box Configuration
brief: Configure filesystem, network, limits, and credentials for box execution
category: config
parent: box
tags: [box, configuration, isolation, credentials, limits, mcp]
related: [box-overview, box-directive, shelf-slots, security-policies, mcp-security, mcp-policy, mcp-guards]
related-code: [interpreter/eval/box.ts, interpreter/env/Environment.ts, interpreter/eval/env-mcp-config.test.ts]
updated: 2026-04-07
---

Box configuration objects control isolation, credentials, and resource limits.

```mlld
var @sandbox = {
  provider: "@mlld/env-docker",
  fs: { read: [".:/app"], write: ["/tmp"] },
  net: "none",
  limits: { mem: "512m", cpu: 1.0, timeout: 30000 }
}

box @sandbox [
  run cmd { npm test }
]
```

**VFS-backed local mode:**

```mlld
files <@workspace/> = [{ "task.md": "todo" }]

box @workspace [
  run cmd { cat @root/task.md }
]
```

These forms create a VirtualFS-backed runtime for local execution:
- `box @workspace [ ... ]`
- `box { fs: @workspace } [ ... ]`
- `box [ ... ]` (anonymous workspace)

In VFS mode, defaults are applied unless overridden:
- `tools: ["Bash", "Read", "Write", "Glob", "Grep"]`
- `mcps: []`
- `net: { allow: [] }`

VFS defaults apply when the box has a workspace (anonymous `box [...]`, `box @workspace [...]`, or `box { fs: @workspace } [...]`) and no explicit `tools` field is provided. Explicit `with { tools: [...] }` overrides the defaults. Active `policy.env` constraints are then applied to the resolved box config — local box config can only be attenuated by policy (for example, requested tools are intersected with `policy.env.tools.allow`, and denied providers throw).

**Configuration fields:**

| Field | Values | Purpose |
|-------|--------|---------|
| `provider` | `"@mlld/env-docker"`, etc. | Isolation provider |
| `fs` | `{ read: [...], write: [...] }` | Filesystem access |
| `net` | `"none"`, `"host"`, `"limited"` | Network restrictions |
| `limits` | `{ mem, cpu, timeout }` | Resource limits |
| `auth` | `"credential-name"` | Auth reference from policy |
| `tools` | `["Read", "Write", "Bash", "Glob", "Grep"]` | Runtime tool allowlist for commands and MCP tools |
| `mcps` | `[]`, `[server-config]` | Runtime MCP server allowlist |
| `shelf` | `{ read, write }`, `@scope` | Scoped shelf read/write surface for llm calls and auto-provisioned `shelve` |

**Important:** `tools` and `mcps` enforce runtime access inside `box` blocks.

| Field | Enforced locally by mlld? | Notes |
|-------|--------------------------|-------|
| `tools` | Yes | mlld restricts available tools |
| `mcps` | Yes | mlld restricts available MCP servers |
| `fs` | No - requires container provider | mlld passes config but cannot enforce filesystem restrictions without a sandbox |
| `net` | No - requires container provider | mlld passes config but cannot enforce network restrictions without a sandbox |
| `limits` | No - requires container provider | mlld passes config but cannot enforce resource limits without a sandbox |

- Include `Bash` in `tools` to allow `run cmd`, `run sh`, and shell-backed command executables.
- Set `mcps: []` to block all MCP tool calls, or list servers to allow specific MCP sources.
- Use `capabilities.deny` for command-pattern policy rules (for example `cmd:git:push`).

**Shelf scope as a value:**

The `shelf` config field can be composed like any other box value:

```mlld
var @plannerScope = {
  read: @pipeline.mx.slotEntries,
  write: {
    selected: @pipeline.selected
  }
}

box {
  shelf: @plannerScope
} [
  => @claude(...)
]
```

`read` and `write` accept the runtime shapes described in `shelf-slots`: arrays of slot refs, aliased entries, `{ name, ref }` pairs, or object maps whose keys become aliases. Variables that hold live slot refs also work here, including refs selected through field access or dynamic keyed lookup. The older inline literal form still works, and write aliases still require real slot refs at runtime.

**Advanced: MCP configuration via `@mcpConfig()`:**

Define an `@mcpConfig()` function to provide profile-based MCP server configuration:

```mlld
var @cfg = {
  profiles: {
    full: { requires: { sh: true } },
    readonly: { requires: {} }
  }
}

exe @mcpConfig() = when [
  @mx.profile == "full" => {
    servers: [{ command: "mcp-server", tools: "*" }]
  }
  @mx.profile == "readonly" => {
    servers: [{ command: "mcp-server", tools: ["list", "get"] }]
  }
  * => { servers: [] }
]

box @cfg with { profile: "readonly" } [
  show @list()
]
```

The function is called when a `box` block spawns, with `@mx.profile` set from the `with { profile }` clause. When no profile is specified, the first profile whose requirements are satisfied by the active policy is selected. Explicit `with { profile: "name" }` overrides this automatic selection.

**Compose with object spread:**

```mlld
var @readonly = {
  ...@sandbox,
  fs: { ...@sandbox.fs, read: [".:/app"], write: [] }
}
```

See `box-overview` for concepts, `box-directive` for block syntax.
