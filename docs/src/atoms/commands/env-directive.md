---
id: env-directive
title: Environment Directive
brief: Scoped execution with isolation, credentials, and capability control
category: commands
tags: [environment, isolation, credentials, tools, scoping, security]
related: [env-overview, env-config, env-blocks, policy-auth, security-getting-started]
related-code: [interpreter/eval/env.ts, interpreter/env/Environment.ts, interpreter/env/environment-provider.ts]
updated: 2026-02-15
qa_tier: 2
---

The `env` directive creates scoped execution contexts that combine process isolation, credential management, and capability control.

For concepts and configuration details, see `env-overview`, `env-config`, and `env-blocks`.

**Sandboxed execution with credentials:**

```mlld
var @sandbox = {
  provider: "@mlld/env-docker",
  fs: { read: [".:/app"], write: ["/tmp"] },
  net: "none",
  tools: ["Read", "Bash"],
  mcps: []
}

env @sandbox [
  run cmd { claude -p "Analyze the codebase" } using auth:claude
]
```

The provider runs commands in a Docker container. `fs` restricts filesystem mounts, `net` blocks network access, `tools` limits runtime tool availability, and `mcps: []` blocks MCP servers. Credentials flow through sealed paths via `using auth:*` — never interpolated into command strings.

**Local execution with different auth:**

```mlld
var @cfg = { auth: "claude-alt" }

env @cfg [
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

env @sandbox with { tools: ["Read"] } [
  >> Only Read is available here
  run cmd { claude -p @task }
]
```

`with` derives a restricted child inline. Children can only narrow parent capabilities, never extend them.

**Tool scope formats:**

```mlld
env @config with { tools: ["read", "write"] } [...]
env @config with { tools: "read, write" } [...]
env @config with { tools: "*" } [...]

var @subset = { read: @readTool, write: @writeTool }
env @config with { tools: @subset } [...]
```

**Profile selection:**

```mlld
var @cfg = {
  profiles: {
    full: { requires: { sh: true } },
    readonly: { requires: {} }
  }
}

env @cfg with { profile: "readonly" } [
  run cmd { claude -p @task }
]
```

When no profile is specified, the first profile whose requirements are satisfied by the active policy is selected.

**Return values:**

```mlld
var @result = env @config [
  let @data = run cmd { fetch-data }
  => @data
]
```

**Scoped environment:**

The env block creates a child environment. Variables defined inside don't leak out, but the block can access parent scope variables.

```mlld
var @input = "test"

env @config [
  let @processed = @input | @transform
  => @processed
]
```
