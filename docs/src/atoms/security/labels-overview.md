---
id: labels-overview
title: Labels Overview
brief: What labels are and why they matter
category: security
parent: security
tags: [labels, taint, security, tracking]
related: [labels-source-auto, labels-sensitivity, labels-propagation, labels-mx-context]
related-code: [core/security/LabelTracker.ts, interpreter/eval/security.ts]
updated: 2026-01-31
qa_tier: 2
---

Labels are strings attached to values that track what data IS and where it CAME FROM. They're the foundation of mlld's security model.

**The core insight:**

> You cannot prevent LLMs from being tricked by prompt injection. But you CAN prevent the consequences of being tricked from manifesting.

Labels make this possible. When an operation is attempted, mlld checks whether the labels on the input data are allowed to flow to that operation. The LLM may have been tricked into trying something dangerous, but labels block it.

**Label categories:**

| Category | Examples | Applied How |
|----------|----------|-------------|
| Trust | `trusted`, `untrusted` | Policy defaults, explicit declaration |
| Sensitivity | `secret`, `sensitive`, `pii` | Explicit declaration, keychain |
| Source | `src:mcp`, `src:exec`, `src:file` | Auto-applied by system |
| Operation | `op:cmd:git:status`, `op:sh` | Auto-applied during execution |
| Custom | `internal`, `redacted` | User-defined |

**Declaring labels on variables:**

```mlld
var secret @apiKey = "sk-12345"
var pii @userEmail = "user@example.com"
var untrusted @externalData = "from outside"
```

**Labels propagate through transformations:**

```mlld
var secret @apiKey = "sk-12345"
var @upper = @apiKey | @upper
show @upper.mx.labels
```

The `@upper` value still carries the `secret` label because labels propagate through all transformations (result: `["secret"]`).

**The security check:**

When an operation is attempted:

1. What labels does the input data have?
2. What labels does the operation have?
3. Does policy allow this flow?

```mlld
var secret @apiKey = "sk-12345"

guard @noSecretToNetwork before secret = when [
  @mx.op.labels.includes("network") => deny "Secrets cannot flow to network"
  * => allow
]

exe network @sendData(data) = `sending: @data`

show @sendData(@apiKey)
```

The `@apiKey` has label `secret`. The operation `@sendData` has label `network`. The guard blocks the flow and throws: `Guard blocked operation: Secrets cannot flow to network`.

**Label context (`@mx`):**

Every value carries label metadata accessible via `@mx`:

```mlld
var secret @key = "abc"
show @key.mx.labels
show @key.mx.taint
show @key.mx.sources
```

- `labels` - User-declared sensitivity labels
- `taint` - Union of labels plus source markers (for provenance)
- `sources` - Transformation trail showing how data got here

**Why labels work:**

Labels are enforced by the mlld runtime, not by LLM reasoning. A tricked LLM can ask to send a secret to an attacker, but:

1. The secret still has its `secret` label
2. Network operations still have their `network` label
3. Policy or guards say `secret → network = DENY`
4. The operation is blocked regardless of LLM intent

This is the fundamental security guarantee: labels track facts about data that cannot be changed by prompt injection.
