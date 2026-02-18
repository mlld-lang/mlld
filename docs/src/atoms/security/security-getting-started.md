---
id: security-getting-started
title: Security Getting Started
brief: Progressive levels of engagement from zero-config to full custom security
category: security
parent: security
tags: [security, onboarding, policy, guards, needs, environments, getting-started]
related: [security-policies, policy-capabilities, security-needs-declaration, security-guards-basics, env-overview, labels-overview]
updated: 2026-02-15
qa_tier: 2
---

mlld's security model has five levels of engagement. Most scripts only need Level 0 or 1. Higher levels exist for power users but are never required.

## Level 0: Import a Standard Policy

Import a pre-built policy module that handles common security defaults.

```mlld
import policy @production from "@mlld/production"
```

Secrets are protected. External data is restricted. Templates are auto-signed and verified. One line, done.

> **Note:** Standard policy modules (`@mlld/production`, `@mlld/development`, `@mlld/sandbox`) are spec-defined but not yet shipped. Use Level 1 as your starting point today.

Other standard policies:

```mlld
import policy @dev from "@mlld/development"
import policy @sandbox from "@mlld/sandbox"
```

## Level 1: Declare Needs and Set a Manual Policy

Declare what your module requires, then define a policy with capability rules.

```mlld
needs {
  cmd: [git, curl],
  node: [lodash]
}

var @policyConfig = {
  defaults: {
    rules: [
      "no-secret-exfil",
      "no-untrusted-destructive"
    ]
  },
  capabilities: {
    allow: ["cmd:git:*", "cmd:curl:*"],
    deny: ["sh"]
  }
}
policy @p = union(@policyConfig)
```

`needs` validates that the environment can satisfy your module before execution. `policy` declares what operations are allowed. Built-in rules like `no-secret-exfil` block dangerous data flows without writing any guard logic.

See `needs-declaration` for the full list of `needs` keys. See `policies` and `policy-capabilities` for policy structure.

## Level 2: Customize Data Flow and Defaults

Add operation classification and label flow rules to control how data moves through your script.

```mlld
var @policyConfig = {
  defaults: {
    rules: [
      "no-secret-exfil",
      "no-sensitive-exfil",
      "no-untrusted-destructive",
      "no-untrusted-privileged"
    ],
    unlabeled: "untrusted"
  },
  operations: {
    "net:w": "exfil",
    "fs:w": "destructive",
    "sys:admin": "privileged"
  },
  capabilities: {
    allow: ["cmd:git:*", "cmd:npm:*"],
    deny: ["sh"]
  }
}
policy @p = union(@policyConfig)

exe net:w @postToSlack(channel, msg) = run cmd { curl -X POST @channel -d @msg }
```

`defaults.unlabeled` treats all data without explicit labels as `untrusted`. `operations` maps semantic exe labels (`net:w`) to risk categories (`exfil`). The built-in rules then block flows like `secret` data reaching an `exfil` operation.

See `policy-operations` for the two-step labeling pattern. See `policy-label-flow` for custom deny/allow rules.

## Level 3: Add Guards

Guards are imperative hooks that inspect, transform, or block operations at runtime. Use them when policy alone isn't enough.

```mlld
policy @p = union({
  defaults: {
    rules: ["no-secret-exfil"],
    unlabeled: "untrusted"
  },
  capabilities: {
    allow: ["cmd:git:*", "cmd:claude:*"],
    deny: ["sh"]
  }
})

guard @noMcpToShell before op:cmd = when [
  @mx.taint.includes("src:mcp") => deny "MCP data cannot reach shell commands"
  * => allow
]

guard @noSecretExfil before op:exe = when [
  @input.any.mx.labels.includes("secret") && @mx.op.labels.includes("net:w") => deny "Secrets blocked from network operations"
  * => allow
]
```

Policy denials are hard errors. Guard denials can be caught with `denied =>` handlers for graceful fallback. Use policy for absolute constraints; use guards when you need inspection, transformation, or recovery logic.

See `guards-basics` for syntax, timing, and security context. See `guard-composition` for ordering rules.

## Level 4: Full Custom Security with Environments

Combine policies, guards, and environments for complete isolation with credential management.

```mlld
var @policyConfig = {
  defaults: {
    rules: [
      "no-secret-exfil",
      "no-untrusted-destructive",
      "untrusted-llms-get-influenced"
    ],
    unlabeled: "untrusted"
  },
  operations: {
    "net:w": "exfil",
    "fs:w": "destructive"
  },
  capabilities: {
    allow: ["cmd:claude:*", "cmd:git:*"],
    deny: ["sh"],
    danger: ["@keychain"]
  },
  auth: {
    claude: { from: "keychain:anthropic/{projectname}", as: "ANTHROPIC_API_KEY" }
  }
}
policy @p = union(@policyConfig)

guard @blockInfluencedWrites before op:cmd = when [
  @mx.labels.includes("influenced") => deny "Influenced data blocked from commands"
  * => allow
]

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

Environments encapsulate execution contexts. Credentials flow through sealed paths that bypass string interpolation, preventing prompt injection from extracting secrets. The `provider` field adds process isolation via Docker or cloud sandboxes.

> **Note:** Environment providers (`@mlld/env-docker`, `@mlld/env-sprites`) are spec-defined but not yet shipped. `env` blocks currently run with the local provider.

See `env-overview` for concepts. See `env-config` for configuration fields. See `policy-auth` for credential flow. See `pattern-audit-guard` and `pattern-dual-audit` for advanced prompt injection defense patterns.

## Which Level Do You Need?

| Level | When to Use |
|-------|-------------|
| 0 | Standard protection, no customization needed (coming soon) |
| 1 | You know what commands your script needs and want to restrict access |
| 2 | You handle sensitive data and need to control how it flows |
| 3 | You need runtime inspection, transformation, or graceful denial handling |
| 4 | You run untrusted code, manage credentials, or orchestrate multiple agents |
