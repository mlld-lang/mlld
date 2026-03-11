---
id: box-overview
qa_tier: 2
title: Box Overview
brief: Execution contexts with credentials, isolation, and capabilities
category: config
parent: box
tags: [box, credentials, isolation, capabilities, providers]
related: [box-config, box-blocks, policy-auth, policy-capabilities, box-directive, security-guards-basics, security-policies]
related-code: [interpreter/eval/box.ts, interpreter/env/Environment.ts]
updated: 2026-03-04
---

Boxes are mlld's primitive for scoped execution contexts. They encapsulate credentials, isolation, capabilities, and state.

```mlld
var @sandbox = {
  provider: "@mlld/env-docker",     >> Docker container for process isolation
  fs: { read: [".:/app"], write: ["/tmp"] },  >> Mount host . as /app, allow writes to /tmp
  net: "none"                        >> No network access
}

box @sandbox [
  run cmd { npm test }
]
```

**Why boxes matter for security:**

- **Credential isolation** - Auth injected via sealed paths, not exposed as strings
- **Capability restriction** - Limit what tools and operations agents can use
- **Blast radius** - Contain failures within box boundaries

**Boxes are values:**

```mlld
var @task = "Review code"
var @cfg = { auth: "claude", tools: ["Read", "Write"] }
var @readonly = { ...@cfg, tools: ["Read"] }

box @readonly [ run cmd { claude -p @task } ]
```

Compute, compose, and pass boxes like any other value.
Use object spread for plain object derivation. The `with { ... }` clause is box-directive config syntax (for `box @cfg with { ... } [ ... ]`).
For enforcement boundaries (what mlld enforces locally vs what requires a sandbox provider), see the table in `box-config`.

**Providers add isolation:**

| Provider | Isolation | Use Case |
|----------|-----------|----------|
| (none) | Local execution | Dev with specific auth |
| `@mlld/env-docker` | Container | Process isolation |
| `@mlld/env-sprites` | Cloud sandbox | Full isolation + state |

Without a provider, commands run locally with specified credentials.

**Complete sandbox example:**

Combine box config with policy to restrict an agent:

```mlld
policy @p = {
  capabilities: {
    allow: ["cmd:claude:*"],         >> Only allow claude commands
    deny: ["sh"]                     >> Block shell access
  }
}

var @sandbox = {
  tools: ["Read", "Write", "Bash", "Glob", "Grep"],  >> Allow tools for agent use
  mcps: []                           >> Block MCP servers in this block
}

box @sandbox [
  run cmd { claude -p "Analyze code" }
]
```

For a complete working example with Docker isolation, credentials, and guards, see `sandbox-demo` in `llm/run/j2bd/security/impl/sandbox-demo.mld`.

Reading order: `box-config` for configuration fields, `box-blocks` for scoped execution, `policy-capabilities` for restrictions, `policy-auth` for credentials.
