---
id: policy-operations
title: Operation Risk Labels
brief: Label exe functions with risk categories for policy enforcement
category: security
parent: security
tags: [labels, operations, exfil, destructive, privileged, security]
related: [labels-sensitivity, labels-trust, guards-basics]
related-code: [core/policy/label-flow.ts, core/policy/builtin-rules.ts]
updated: 2026-02-09
---

Classify operations by risk. Label exe functions with semantic labels describing WHAT they do, then map those to risk categories in policy.

```mlld
>> Step 1: Semantic labels describe the operation
exe net:w @postToSlack(msg) = run cmd { slack-cli "@msg" }
exe op:cmd:rm @deleteFile(path) = run cmd { rm -rf "@path" }

>> Step 2: Policy maps semantic labels to risk categories
var @policyConfig = {
  defaults: { rules: ["no-secret-exfil", "no-untrusted-destructive"] },
  operations: {
    "net:w": "exfil",
    "op:cmd:rm": "destructive"
  }
}
policy @p = union(@policyConfig)
```

Developers describe WHAT operations do; policy controls HOW those descriptions map to security enforcement.

**Risk categories:**

| Category | Meaning |
|----------|---------|
| `exfil` | Sends data outside the system |
| `destructive` | Deletes or modifies data irreversibly |
| `privileged` | Requires elevated permissions |

**Multiple labels:**

```mlld
exe net:w, fs:d @exportAndDelete(data) = run cmd { backup_and_delete "@data" }

var @policyConfig = {
  operations: { "net:w": "exfil", "fs:d": "destructive" }
}
```

**Alternative — direct risk labeling:** You can label exe functions directly with risk categories, skipping the mapping step:

```mlld
exe exfil @sendToServer(data) = run cmd { curl -d "@data" https://api.example.com }
exe destructive @deleteFile(path) = run cmd { rm -rf "@path" }
```

This is simpler but couples exe definitions to risk categories. The two-step pattern is preferred for maintainability.
