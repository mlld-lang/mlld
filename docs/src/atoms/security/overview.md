---
id: security-overview
title: Security Overview
brief: Progressive introduction to mlld's security model
category: security
tags: [security, labels, guards, policies, overview]
related: [security-guards-basics, security-label-tracking, security-policies]
updated: 2026-01-30
qa_tier: 1
---

mlld's security model works in three layers: labels classify data, guards enforce rules, and policies organize defaults. This overview builds up from simple to complete.

## Layer 1: Labels

Labels are tags that classify what data is. Add them when creating variables:

```mlld
var secret @apiKey = "sk-12345"
var pii @email = "user@example.com"
var @username = "alice"           >> No label - ordinary data
```

Labels stick to data through operations:

```mlld
var @masked = @apiKey.slice(0, 5)  >> Still carries `secret` label
var @greeting = `Hello @email!`    >> Template inherits `pii` label
```

By themselves, labels do nothing. They're metadata for guards to act on.

## Layer 2: Guards

Guards use labels to protect operations. Define a guard to block secrets from shell commands:

```mlld
guard @noSecrets before secret = when [
  @mx.op.type == "run" => deny "Secrets cannot be passed to shell"
  * => allow
]
```

This guard runs before any operation involving data labeled `secret`. If it's a shell command (`run`), it blocks with an error.

**Building on Layer 1:** Guards inspect labels to make decisions:

```mlld
var secret @token = "abc123"
var @msg = "Hello"

run cmd { echo @msg }    >> Allowed - no labels
run cmd { echo @token }  >> Blocked - has `secret` label
```

**Guard timing:** Guards run `before` or `after` operations:

```mlld
guard before pii = when [...]      >> Check before operation
guard after pii = when [...]       >> Check result after operation
guard always secret = when [...]   >> Check both
```

**Security context:** Guards access operation metadata via `@mx`:

- `@mx.labels` - what labels the data has
- `@mx.op.type` - what operation is happening (`run`, `fetch`, etc.)
- `@mx.taint` - where data originated (`src:file`, `src:mcp`)

## Layer 3: Policies

Policies bundle guards and defaults for reuse across scripts:

```mlld
policy @strict = {
  defaults: { unlabeled: "untrusted" },
  capabilities: {
    allow: ["cmd:git:*"],
    danger: ["@keychain"]
  }
}
```

Import policies to apply them:

```mlld
import policy @strict from "./policies.mld"
```

**Building on Layers 1 & 2:** Policies set what labels mean and which operations require extra care. They organize guards into coherent security stances.

## Putting It Together

A complete security setup:

```mlld
>> Labels classify data
var secret @dbPassword = @env.DB_PASSWORD
var pii @userData = <user-profile.json>

>> Guards enforce rules
guard before secret = when [
  @mx.op.type == "run" => deny "Secrets blocked from shell"
  @mx.op.type == "fetch" => deny "Secrets blocked from network"
  * => allow
]

guard before pii = when [
  @mx.op.type == "show" => allow   >> Can display PII
  @mx.op.type == "run" => deny "PII blocked from shell"
  * => allow
]

>> Safe usage
show `User: @userData.name`        >> Allowed
run cmd { migrate --db @dbPassword }  >> Blocked
```

## Key Points

- **Labels** are just tags - they don't enforce anything alone
- **Guards** read labels and block/allow operations
- **Policies** organize defaults and reusable security rules
- Labels flow through transformations automatically
- Guards run at operation time, checking the current context
