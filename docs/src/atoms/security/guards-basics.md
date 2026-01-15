---
id: security-guards-basics
title: Guards Basics
brief: Protect data and operations with guards
category: security
parent: guards
tags: [security, guards, labels, policies]
related: [security-before-guards, security-after-guards, security-labels]
related-code: [interpreter/eval/guard.ts, core/security/Guard.ts]
updated: 2026-01-05
qa_tier: 2
---

**Labeling data:**

```mlld
var secret @apiKey = "sk-12345"
var pii @email = "user@example.com"
```

**Defining guards:**

```mlld
guard @noShellSecrets before secret = when [
  @mx.op.type == "run" => deny "Secrets blocked from shell"
  * => allow
]

run cmd { echo @apiKey }   >> Blocked by guard
```

**Guard syntax:**

```
guard [@name] TIMING LABEL = when [...]
```

- `TIMING`: `before`, `after`, or `always`
- Shorthand: `for` equals `before`

**Security context in guards:**

Guards have access to three complementary dimensions:

- `@mx.labels` - semantic classification (what it is): `secret`, `pii`, `untrusted`
- `@mx.taint` - provenance (where it came from): `src:mcp`, `src:exec`, `src:file`
- `@mx.sources` - transformation trail (how it got here): `mcp:createIssue`, `command:curl`

Use labels to classify data types, taint to track untrusted origins, and sources for audit trails:

```mlld
guard before op:run = when [
  @mx.taint.includes("src:mcp") => deny "Cannot execute MCP data"
  @mx.labels.includes("secret") => deny "Secrets blocked from shell"
  * => allow
]
```
