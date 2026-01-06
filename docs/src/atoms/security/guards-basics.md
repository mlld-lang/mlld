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
---

**Guards protect data and operations. Label sensitive data, define policies.**

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
