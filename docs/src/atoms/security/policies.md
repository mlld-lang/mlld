---
id: security-policies
title: Policies
brief: Define and import policy objects
category: security
parent: guards
tags: [security, policies, guards]
related: [security-guards-basics, policy-operations, policy-composition, policy-capabilities, policy-label-flow]
related-code: [interpreter/eval/policy.ts]
updated: 2026-02-09
qa_tier: 2
---

A policy object combines all security configuration into a single declaration.

```mlld
policy @p = {
  defaults: {
    rules: [
      "no-secret-exfil",
      "no-sensitive-exfil",
      "no-untrusted-destructive",
      "no-untrusted-privileged"
    ]
  },
  operations: {
    "net:w": "exfil",
    "fs:w": "destructive",
    "sys:admin": "privileged"
  },
  capabilities: {
    allow: ["cmd:git:*"],
    danger: ["@keychain"]
  }
}
```

**`defaults`** sets baseline behavior. `rules` enables built-in security rules that block dangerous label-to-operation flows. `unlabeled` optionally auto-labels all data that has no user-assigned labels -- set to `"untrusted"` to treat unlabeled data as untrusted, or `"trusted"` to treat it as trusted. This is opt-in; without it, unlabeled data has no trust label.

**`operations`** maps semantic exe labels to risk categories. You label functions with what they DO (`net:w`, `fs:w`), and policy classifies those as risk types (`exfil`, `destructive`). This is the two-step pattern -- see `policy-operations`.

**`capabilities`** controls what operations are allowed at all. `allow` whitelists command patterns. `danger` marks capabilities that require explicit opt-in.

`needs` declarations are module requirement checks. They do not replace capability policy rules.

**Export/import:** Share policies across scripts:

```mlld
export { @p }

>> In another file
import policy @p from "./policies.mld"
```

Policies compose with `union()` -- combine multiple config objects into one policy. The most restrictive rules win.
