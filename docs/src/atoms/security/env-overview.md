---
id: env-overview
title: Environment Overview
brief: Execution contexts with credentials, isolation, and capabilities
category: security
parent: security
tags: [environments, credentials, isolation, capabilities, providers]
related: [env-directive, guards-basics, policies]
related-code: [interpreter/eval/env.ts, interpreter/env/Environment.ts]
updated: 2026-02-03
---

Environments are mlld's primitive for execution contexts. They encapsulate credentials, isolation, capabilities, and state.

```mlld
var @sandbox = {
  provider: "@mlld/env-docker",
  fs: { read: [".:/app"], write: ["/tmp"] },
  net: "none"
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

See `env-directive` for syntax, `policies` for capability control.
