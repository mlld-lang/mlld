---
id: policy-operations
title: Operation Risk Labels
brief: Label exe functions with risk categories for policy enforcement
category: security
parent: security
tags: [labels, operations, exfil, destructive, privileged, security]
related: [labels-sensitivity, labels-trust, guards-basics]
related-code: [core/policy/label-flow.ts, core/policy/builtin-rules.ts]
updated: 2026-02-05
---

Classify operations by risk using labels on `exe` definitions.

```mlld
>> Mark as data exfiltration
exe exfil @sendToServer(data) = run cmd { curl -d "@data" https://api.example.com }

>> Mark as destructive
exe destructive @deleteFile(path) = run cmd { rm -rf "@path" }

>> Mark as privileged
exe privileged @modifySystem(config) = run cmd { sudo apply "@config" }
```

**Risk categories:**

| Label | Meaning |
|-------|---------|
| `exfil` | Sends data outside the system |
| `destructive` | Deletes or modifies data irreversibly |
| `privileged` | Requires elevated permissions |

**Built-in rules:** Enable in policy defaults to block dangerous flows:

```mlld
var @policyConfig = {
  defaults: {
    rules: [
      "no-secret-exfil",
      "no-untrusted-destructive",
      "no-untrusted-privileged"
    ]
  }
}
policy @p = union(@policyConfig)
```

| Rule | Blocks |
|------|--------|
| `no-secret-exfil` | `secret` → `exfil` |
| `no-sensitive-exfil` | `sensitive` → `exfil` |
| `no-untrusted-destructive` | `untrusted` → `destructive` |
| `no-untrusted-privileged` | `untrusted` → `privileged` |

**Multiple labels:** Combine with commas when an operation has multiple risks:

```mlld
exe exfil, destructive @exportAndDelete(data) = run cmd { backup_and_delete "@data" }
```
