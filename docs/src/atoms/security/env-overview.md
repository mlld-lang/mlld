---
id: env-overview
title: Environment Overview
brief: Execution contexts with credentials, isolation, and capabilities
category: security
parent: security
tags: [environments, credentials, isolation, capabilities, providers]
related: [env-config, env-blocks, policy-auth, policy-capabilities, env-directive, security-guards-basics, security-policies]
related-code: [interpreter/eval/env.ts, interpreter/env/Environment.ts]
updated: 2026-02-03
---

Environments are mlld's primitive for execution contexts. They encapsulate credentials, isolation, capabilities, and state.

```mlld
var @sandbox = {
  provider: "@mlld/env-docker",     >> Docker container for process isolation
  fs: { read: [".:/app"], write: ["/tmp"] },  >> Mount host . as /app, allow writes to /tmp
  net: "none"                        >> No network access
}

env @sandbox [
  run cmd { npm test }
]
```

**Why environments matter for security:**

- **Credential isolation** - Auth injected via sealed paths, not exposed as strings
- **Capability restriction** - Limit what tools and operations agents can use
- **Blast radius** - Contain failures within environment boundaries

**Environments are values:**

```mlld
var @task = "Review code"
var @cfg = { auth: "claude", tools: ["Read", "Write"] }
var @readonly = @cfg with { tools: ["Read"] }

env @readonly [ run cmd { claude -p @task } ]
```

Compute, compose, and pass environments like any other value.

**Providers add isolation:**

| Provider | Isolation | Use Case |
|----------|-----------|----------|
| (none) | Local execution | Dev with specific auth |
| `@mlld/env-docker` | Container | Process isolation |
| `@mlld/env-sprites` | Cloud sandbox | Full isolation + state |

Without a provider, commands run locally with specified credentials.

**Complete sandbox example:**

Combine environment config with policy to restrict an agent:

```mlld
var @policyConfig = {
  capabilities: {
    allow: ["cmd:claude:*"],         >> Only allow claude commands
    deny: ["sh"]                     >> Block shell access
  }
}
policy @p = union(@policyConfig)     >> Activate policy

var @sandbox = {
  tools: ["Read", "Write"],          >> Route only Read/Write MCP tools
  mcps: []                           >> No MCP servers
}

env @sandbox [
  run cmd { claude -p "Analyze code" }
]
```

For a complete working example with Docker isolation, credentials, and guards, see `sandbox-demo` in `llm/run/j2bd/security/impl/sandbox-demo.mld`.

Reading order: `env-config` for configuration fields, `env-blocks` for scoped execution, `policy-capabilities` for restrictions, `policy-auth` for credentials.
