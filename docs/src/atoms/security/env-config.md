---
id: env-config
title: Environment Configuration
brief: Configure filesystem, network, limits, and credentials for environments
category: security
parent: security
tags: [environments, configuration, isolation, credentials, limits]
related: [env-overview, env-directive, policies]
related-code: [interpreter/eval/env.ts, interpreter/env/Environment.ts]
updated: 2026-02-03
---

Environment configuration objects control isolation, credentials, and resource limits.

```mlld
var @sandbox = {
  provider: "@mlld/env-docker",
  fs: { read: [".:/app"], write: ["/tmp"] },
  net: "none",
  limits: { mem: "512m", cpu: 1.0, timeout: 30000 }
}

env @sandbox [
  run cmd { npm test }
]
```

**Configuration fields:**

| Field | Values | Purpose |
|-------|--------|---------|
| `provider` | `"@mlld/env-docker"`, etc. | Isolation provider |
| `fs` | `{ read: [...], write: [...] }` | Filesystem access |
| `net` | `"none"`, `"host"`, `"limited"` | Network restrictions |
| `limits` | `{ mem, cpu, timeout }` | Resource limits |
| `auth` | `"credential-name"` | Auth reference from policy |
| `tools` | `["Read", "Write"]` | MCP tool routing (does not block commands) |

**Note:** The `tools` field routes MCP tool calls, not command execution. To block commands, use `policy.capabilities.deny`.

**Filesystem mounts:**

```mlld
fs: { read: [".:/app"], write: ["/tmp", "./output:/out"] }
```

Format: `"host:container"` or `"path"` (same in both).

**Without a provider:**

```mlld
var @devEnv = {
  auth: "claude",
  tools: ["Read", "Write", "Bash"]
}
```

Commands run locally with specified credentials and tool restrictions.

**Compose with `with`:**

```mlld
var @readonly = @sandbox with { fs: { read: [".:/app"], write: [] } }
```

See `env-overview` for concepts, `env-directive` for block syntax.
