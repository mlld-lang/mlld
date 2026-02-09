---
id: security-policies
title: Policies
brief: Define and import policy objects
category: security
parent: guards
tags: [security, policies, guards]
related: [security-guards-basics, security-needs-declaration]
related-code: [interpreter/eval/policy.ts]
updated: 2026-02-09
qa_tier: 2
---

Define policy objects that combine `defaults.rules`, `operations` mapping, and `capabilities`.

```mlld
policy @production = {
  defaults: {
    unlabeled: "untrusted",
    rules: [
      "no-secret-exfil",
      "no-sensitive-exfil",
      "no-untrusted-destructive",
      "no-untrusted-privileged"
    ]
  },
  operations: {
    "net:w": "exfil",
    "op:cmd:rm": "destructive"
  },
  capabilities: {
    allow: ["cmd:git:*"],
    danger: ["@keychain"]
  }
}
```

`defaults.rules` enables built-in security rules. `operations` maps semantic exe labels to the risk categories those rules enforce. See `policy-operations` for details.

**Export/import:**

```mlld
export { @production }

import policy @production from "./policies.mld"
```
