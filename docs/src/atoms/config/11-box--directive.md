---
id: box-directive
title: Box Directive
brief: Scoped execution with isolation, credentials, and capability control
category: config
parent: box
tags: [box, isolation, credentials, tools, scoping, security]
related: [box-overview, box-config, box-blocks, policy-auth, security-getting-started]
related-code: [interpreter/eval/box.ts, interpreter/env/Environment.ts, interpreter/env/environment-provider.ts]
updated: 2026-04-05
qa_tier: 2
---

The `box` directive creates scoped execution contexts that combine process isolation, credential management, and capability control.

For concepts and configuration details, see `box-overview`, `box-config`, and `box-blocks`.

**Sandboxed execution with credentials:**

```mlld
var @sandbox = {
  provider: "@mlld/env-docker",
  fs: { read: [".:/app"], write: ["/tmp"] },
  net: "none",
  tools: ["Read", "Bash"],
  mcps: []
}

box @sandbox [
  run cmd { claude -p "Analyze the codebase" } using auth:claude
]
```

The provider runs commands in a Docker container. `fs` restricts filesystem mounts, `net` blocks network access, `tools` limits runtime tool availability, and `mcps: []` blocks MCP servers. Credentials flow through sealed paths via `using auth:*` — never interpolated into command strings.

**Local execution with different auth:**

```mlld
var @cfg = { auth: "claude-alt" }

box @cfg [
  run cmd { claude -p @task } using auth:claude-alt
]
```

Without a `provider`, commands run locally. Use this for credential rotation across calls (e.g., multiple API keys to avoid per-account rate limits).

**Config fields:**

| Field | Purpose |
|-------|---------|
| `provider` | Isolation provider (`"@mlld/env-docker"`, `"@mlld/env-sprites"`) |
| `auth` | Authentication reference from policy |
| `tools` | Runtime tool allowlist |
| `mcps` | MCP server allowlist (`[]` blocks all) |
| `fs` | Filesystem access (passed to provider) |
| `net` | Network restrictions (passed to provider) |
| `limits` | Resource limits (passed to provider) |
| `profile` | Explicit profile selection |
| `profiles` | Profile definitions for policy-based selection |

**Capability attenuation with `with`:**

```mlld
var @sandbox = {
  provider: "@mlld/env-docker",
  tools: ["Read", "Write", "Bash"]
}

box @sandbox with { tools: ["Read"] } [
  >> Only Read is available here
  run cmd { claude -p @task }
]
```

`with` derives a restricted child inline. Children can only narrow parent capabilities, never extend them.

**VFS resolver shorthand:**

```mlld
files <@workspace/> = [{ "task.md": "checklist" }]

box @workspace [
  run cmd { cat task.md }
]
```

`box @workspace` is shorthand for `box { fs: @workspace } [...]`.

**Anonymous VFS box:**

```mlld
box [
  file "task.md" = "inside box"
  run cmd { cat task.md }
]
```

All box forms provide an in-memory workspace. `box { tools: ["Read", "Bash"] } [ ... ]` restricts tools while still using workspace VFS. Use `box { fs: @workspace } [ ... ]` to bind an existing resolver-backed filesystem instead.

**Tool scope formats:**

```mlld
box @config with { tools: ["read", "write"] } [...]
box @config with { tools: "read, write" } [...]
box @config with { tools: "*" } [...]

var @subset = { read: @readTool, write: @writeTool }
box @config with { tools: @subset } [...]
```

**Profile selection:**

```mlld
var @cfg = {
  profiles: {
    full: { requires: { sh: true } },
    readonly: { requires: {} }
  }
}

box @cfg with { profile: "readonly" } [
  run cmd { claude -p @task }
]
```

When no profile is specified, the first profile whose requirements are satisfied by the active policy is selected.

**Return values:**

```mlld
var @result = box @config [
  let @data = run cmd { fetch-data }
  => @data
]
```

`box` does not implicitly return the last expression. Without `=>`, the box returns its workspace object. Use `=> @some_call(...)` to return a call result.

**Scoped environment:**

The box block creates a child environment. Variables defined inside don't leak out, but the block can access parent scope variables.

```mlld
var @input = "test"

box @config [
  let @processed = @input | @transform
  => @processed
]
```
