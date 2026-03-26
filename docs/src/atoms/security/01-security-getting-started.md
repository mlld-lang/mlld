---
id: security-getting-started
title: Security Getting Started
brief: Progressive levels of engagement from zero-config to full custom security
category: security
tags: [security, onboarding, policy, guards, needs, environments, getting-started]
related: [security-policies, policy-capabilities, security-needs-declaration, security-guards-basics, box-overview, labels-overview, policy-authorizations, facts-and-handles, pattern-planner]
updated: 2026-03-24
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

policy @p = {
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
```

`needs` validates that the environment can satisfy your module before execution. `policy` declares what operations are allowed. Built-in rules like `no-secret-exfil` block dangerous data flows without writing any guard logic.

See `needs-declaration` for the full list of `needs` keys. See `policies` and `policy-capabilities` for policy structure.

## Level 2: Customize Data Flow and Defaults

Add operation classification and label flow rules to control how data moves through your script.

```mlld
policy @p = {
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
    exfil: ["net:w"],
    destructive: ["fs:w"],
    privileged: ["sys:admin"]
  },
  capabilities: {
    allow: ["cmd:git:*", "cmd:npm:*"],
    deny: ["sh"]
  }
}

exe net:w @postToSlack(channel, msg) = run cmd { curl -X POST @channel -d @msg }
```

`defaults.unlabeled` treats all data without explicit labels as `untrusted`. `operations` groups semantic exe labels (`net:w`) under risk categories (`exfil`). The built-in rules then block flows like `secret` data reaching an `exfil` operation.

For destination-aware sends, use the narrower `exfil:send` label. `no-send-to-unknown` requires named destination args to carry `known` or a matching `fact:` label. For targeted destructive actions such as delete/cancel/remove, label the operation `destructive:targeted` and enable `no-destroy-unknown` to require the named target arg to carry `known` or `fact:*.id`.

For field-level trust classification, use records to declare which tool output fields are authoritative facts and which are untrusted data. `exe @tool(...) => record` applies the record's classification automatically. See `facts-and-handles` for the full record/fact/handle model.

See `policy-operations` for the two-step labeling pattern. See `policy-label-flow` for custom deny/allow rules.

## Level 3: Add Guards

Guards are imperative hooks that inspect, transform, or block operations at runtime. Use them when policy alone isn't enough.

```mlld
policy @p = {
  defaults: {
    rules: ["no-secret-exfil"],
    unlabeled: "untrusted"
  },
  capabilities: {
    allow: ["cmd:git:*", "cmd:claude:*"],
    deny: ["sh"]
  }
}

guard @noMcpToShell before op:cmd = when [
  @mx.taint.includes("src:mcp") => deny "MCP data cannot reach shell commands"
  * => allow
]

guard @noSecretExfil before op:exe = when [
  @input.any.mx.labels.includes("secret") && @mx.op.labels.includes("net:w") => deny "Secrets blocked from network operations"
  * => allow
]
```

Capability denials (e.g., `capabilities.deny`) are hard errors. Managed label-flow denials from `defaults.rules` and `labels` flow through the guard pipeline — an explicit privileged guard can override them with `allow`, and `denied =>` handlers can catch them for graceful fallback. To make a label-flow denial absolute, add `locked: true` to the policy. Use policy for broad restrictions and privileged guards for task-specific exceptions.

See `guards-basics` for syntax, timing, and security context. See `guard-composition` for ordering rules.

## Level 3b: Task-Scoped Authorization

For planner-worker agent architectures, use `authorizations` to declaratively control which tools a worker can use and with what arguments.

```mlld
policy @base = {
  defaults: {
    rules: ["no-send-to-unknown", "no-destroy-unknown"],
    unlabeled: "untrusted"
  },
  operations: {
    "exfil:send": ["tool:w:send_email"],
    "destructive:targeted": ["tool:w:delete_file"]
  }
}

>> Planner produces authorization data (JSON, not code)
var @plannerOutput = @planner(@task) | @parse

>> Worker runs under combined policy
var @result = @agent(@prompt) with { policy: @plannerOutput }
```

The planner's output is a JSON fragment like:

```json
{
  "authorizations": {
    "allow": {
      "send_email": { "args": { "recipients": ["mark@example.com"] } },
      "create_file": true
    }
  }
}
```

Tools not listed in `allow` are denied by default. Argument constraints use tolerant comparison (`~=`). Args not mentioned in the constraint are enforced as empty/null at runtime, so silent omission never becomes an open hole. `mlld validate` additionally catches unconstrained control args as errors before execution, and `tool:w` executables fail closed by treating every declared parameter as a control arg when trusted metadata is missing. The host validates planner output before injection.

Declare control args on the write executable itself with `with { controlArgs: [...] }`. Tool collections can restate or tighten that metadata for a specific exposure. Invalid authorization fragments fail closed during `with { policy }` activation, so no partial authorization envelope is installed.

Authorization entries generate privileged guards, but matching entries still inherit positive checks from active defaults rules. A pinned send must still use a `known` destination, and privileged operations still reject `untrusted` inputs. If the planner pins an approved value that already carried `known`, the authorization guard carries that attestation forward. `locked: true` on the base policy prevents all overrides.

See `policy-authorizations` for full syntax and control-arg enforcement.

## Level 4: Full Custom Security with Environments

Combine policies, guards, and environments for complete isolation with credential management.

```mlld
policy @p = {
  defaults: {
    rules: [
      "no-secret-exfil",
      "no-untrusted-destructive",
      "untrusted-llms-get-influenced"
    ],
    unlabeled: "untrusted"
  },
  operations: {
    exfil: ["net:w"],
    destructive: ["fs:w"]
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

box @sandbox [
  run cmd { claude -p "Analyze the codebase" } using auth:claude
]
```

Environments encapsulate execution contexts. Credentials flow through sealed paths that bypass string interpolation, preventing prompt injection from extracting secrets. The `provider` field adds process isolation via Docker or cloud sandboxes.

`untrusted-llms-get-influenced` is not prompt-only. If untrusted conversation history or tool output is passed to an `exe llm` via later config fields such as `messages`, `system`, or tool config, the result still receives `influenced`. That includes named wrapper objects like `var @config = { messages: @history }`: the object carries the union of labels from its nested fields, so policy and guards still see the taint when `@config` is passed around.

> **Note:** Environment providers (`@mlld/env-docker`, `@mlld/env-sprites`) are spec-defined but not yet shipped. `box` blocks currently run with the local provider.

See `box-overview` for concepts. See `box-config` for configuration fields. See `policy-auth` for credential flow. See `pattern-audit-guard` and `pattern-dual-audit` for advanced prompt injection defense patterns.

## Which Level Do You Need?

| Level | When to Use |
|-------|-------------|
| 0 | Standard protection, no customization needed (coming soon) |
| 1 | You know what commands your script needs and want to restrict access |
| 2 | You handle sensitive data and need to control how it flows |
| 3 | You need runtime inspection, transformation, or graceful denial handling |
| 3b | You orchestrate agents where a planner authorizes specific tools per task |
| 4 | You run untrusted code, manage credentials, or need process isolation |
