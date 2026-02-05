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
>> Direct risk labeling
exe exfil @sendToServer(data) = run cmd { curl -d "@data" https://api.example.com }
exe destructive @deleteFile(path) = run cmd { rm -rf "@path" }
```

**Semantic labels with mapping:** Define your own labels, map to risk categories in policy.

```mlld
>> Semantic labels on functions
exe net:w @postToSlack(msg) = run cmd { slack-cli "@msg" }
exe fs:w @writeConfig(path, content) = run cmd { tee "@path" }

>> Map semantic labels to risk categories
var @policyConfig = {
  defaults: { rules: ["no-secret-exfil"] },
  operations: { "net:w": "exfil" }
}
policy @p = union(@policyConfig)
```

This enables granular labeling while triggering built-in rules.

**Risk categories:**

| Label | Meaning |
|-------|---------|
| `exfil` | Sends data outside the system |
| `destructive` | Deletes or modifies data irreversibly |
| `privileged` | Requires elevated permissions |

**Multiple labels:** Combine when an operation has multiple risks:

```mlld
exe exfil, destructive @exportAndDelete(data) = run cmd { backup_and_delete "@data" }
```
