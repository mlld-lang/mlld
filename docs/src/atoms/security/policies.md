---
id: security-policies
title: Policies
brief: Define and import policy objects
category: security
parent: guards
tags: [security, policies, guards]
related: [security-guards-basics, security-needs-declaration]
related-code: [interpreter/eval/policy.ts]
updated: 2026-01-05
---

```mlld
policy @production = {
  defaults: { unlabeled: "untrusted" },
  capabilities: { allow: { cmd: ["git:*"] } }
}
export { @production }

import policy @production from "./policies.mld"
```
