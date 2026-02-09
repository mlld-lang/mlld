---
id: labels-trust
title: Trust Labels
brief: trusted and untrusted - blocking dangerous flows from unverified data
category: security
parent: security
tags: [labels, trust, untrusted, security, policy]
related: [labels-overview, labels-sensitivity, labels-source-auto, policy-label-flow, policy-operations]
related-code: [core/security/LabelTracker.ts, interpreter/eval/security.ts]
updated: 2026-02-09
---

Trust labels classify data reliability: `trusted` or `untrusted`.

```mlld
>> Declare untrusted variable
var untrusted @payload = "user input"

>> Semantic label on operation, mapped to destructive via policy
exe fs:w @wipe(data) = run cmd { rm -rf "@data" }

var @policyConfig = {
  defaults: { rules: ["no-untrusted-destructive"] },
  operations: { "fs:w": "destructive" }
}
policy @p = union(@policyConfig)
```

**Trust asymmetry:** `untrusted` is sticky. Adding `trusted` to untrusted data creates a conflict (both labels kept, warning logged). Removing `untrusted` requires privilege via `=> trusted! @var`.

**Built-in rules:** Enable in policy defaults:

```mlld
var @policyConfig = {
  defaults: { rules: ["no-untrusted-destructive", "no-untrusted-privileged"] }
}
policy @p = union(@policyConfig)
```

| Rule | Blocks |
|------|--------|
| `no-untrusted-destructive` | `untrusted` → `destructive` operations |
| `no-untrusted-privileged` | `untrusted` → `privileged` operations |

**Flow blocked:**

```mlld
var @policyConfig = {
  defaults: { rules: ["no-untrusted-destructive"] },
  operations: { "fs:w": "destructive" }
}
policy @p = union(@policyConfig)

var untrusted @payload = "data"
exe fs:w @wipe(data) = run cmd { echo "@data" }
show @wipe(@payload)
```

Error: `Rule 'no-untrusted-destructive': label 'untrusted' cannot flow to 'destructive'`

The two-step flow: `fs:w` on exe → policy maps to `destructive` → `no-untrusted-destructive` rule blocks untrusted data.

**Alternative:** Label exe directly as `exe destructive @wipe(...)` to skip the mapping step. See `policy-operations`.

**Policy default:** Set `defaults.unlabeled` to auto-label all unlabeled data as untrusted:

```mlld
var @policyConfig = {
  defaults: { unlabeled: "untrusted" }
}
policy @p = union(@policyConfig)
```
