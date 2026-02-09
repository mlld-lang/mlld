---
id: policy-label-flow
title: Policy Label Flow Rules
brief: Deny/allow rules controlling which data labels can flow to which operations
category: security
parent: security
tags: [policy, labels, deny, allow, flow, prefix-matching]
related: [labels-sensitivity, labels-source-auto, policy-capabilities, security-policies]
related-code: [interpreter/eval/policy.ts, core/security/taint.ts]
updated: 2026-02-04
---

The `labels` block in policy defines which data labels can flow to which operations.

```mlld
/var @policyConfig = {
  labels: {
    secret: {
      deny: ["op:cmd", "op:show", "net:w"]
    },
    "src:mcp": {
      deny: ["op:cmd:git:push", "op:cmd:git:reset", "destructive"],
      allow: ["op:cmd:git:status", "op:cmd:git:log"]
    }
  }
}
/policy @p = union(@policyConfig)
```

**Deny/allow targets** are operation labels — both auto-applied (`op:cmd`, `op:show`) and user-declared (`net:w`, `destructive`, `safe`).

**Prefix matching:** A deny on `op:cmd:git` blocks all git subcommands (`op:cmd:git:push`, `op:cmd:git:reset`, etc.).

**Most-specific-wins:** When deny covers a prefix but allow covers a more specific path, the specific rule wins. Given `deny: ["op:cmd:git"]` and `allow: ["op:cmd:git:status"]`, `git status` is allowed but `git push` is blocked.

**Interaction with `defaults.unlabeled`:** When `unlabeled: untrusted`, unlabeled data cannot flow to operations unless explicitly allowed:

```mlld
/var @policyConfig = {
  defaults: { unlabeled: "untrusted" },
  labels: {
    influenced: { deny: ["op:show"] }
  }
}
/policy @p = union(@policyConfig)
```

See `labels-sensitivity` for declaring labels, `labels-source-auto` for source label rules.
