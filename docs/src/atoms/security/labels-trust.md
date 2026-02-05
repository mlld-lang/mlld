---
id: labels-trust
title: Trust Labels
brief: trusted and untrusted - blocking dangerous flows from unverified data
category: security
parent: security
tags: [labels, trust, untrusted, security, policy]
related: [labels-overview, labels-sensitivity, labels-source-auto, policy-label-flow]
related-code: [core/security/LabelTracker.ts, interpreter/eval/security.ts]
updated: 2026-02-05
---

Trust labels classify data reliability: `trusted` or `untrusted`.

```mlld
>> Declare untrusted variable
var untrusted @payload = "user input"

>> Label operation as destructive
exe destructive @wipe(data) = run cmd { rm -rf "@data" }
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
  defaults: { rules: ["no-untrusted-destructive"] }
}
policy @p = union(@policyConfig)

var untrusted @payload = "data"
exe destructive @wipe(data) = run cmd { echo "@data" }
@wipe(@payload)
```

Error: `Label 'untrusted' cannot flow to 'destructive'`

**Policy default:** Set `defaults.unlabeled` to auto-label all unlabeled data:

```mlld
defaults: { unlabeled: untrusted }
```
