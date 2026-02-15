---
id: policy-label-flow
title: Policy Label Flow Rules
brief: Deny/allow rules controlling which data labels can flow to which operations
category: security
parent: security
tags: [policy, labels, deny, allow, flow, prefix-matching]
related: [labels-sensitivity, labels-source-auto, policy-capabilities, security-policies, policy-composition]
related-code: [interpreter/eval/policy.ts, core/security/taint.ts]
updated: 2026-02-09
qa_tier: 2
---

The `labels` block in policy defines which data labels can flow to which operations.

```mlld
var @policyConfig = {
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
policy @p = union(@policyConfig)
```

**Deny/allow targets** are operation labels -- both auto-applied (`op:cmd`, `op:show`) and user-declared (`net:w`, `destructive`, `safe`).

**Prefix matching:** A deny on `op:cmd:git` blocks all git subcommands (`op:cmd:git:push`, `op:cmd:git:reset`, etc.).

**Most-specific-wins:** When deny covers a prefix but allow covers a more specific path, the specific rule wins. Given `deny: ["op:cmd:git"]` and `allow: ["op:cmd:git:status"]`, `git status` is allowed but `git push` is blocked.

Label-flow policy evaluates declared labels and taint labels (`src:*`, `dir:*`) attached to values.

**Built-in rules vs. explicit deny lists:** For common protection patterns, use `defaults.rules` with built-in rules like `no-secret-exfil` instead of writing explicit deny lists. See `policy-operations` for the two-step classification pattern where semantic labels (e.g., `net:w`) are mapped to risk categories (e.g., `exfil`) via `policy.operations`.

**In composed policies:** Label deny/allow rules from all composed policy layers merge via union. A `deny` on `secret → op:cmd` from ANY layer blocks that flow in the merged policy. See `policy-composition` for merge rules.

**Complete denial example:**

```mlld
var @policyConfig = {
  labels: {
    secret: { deny: ["op:show"] }
  }
}
policy @p = union(@policyConfig)

var secret @key = "sk-12345"
show @key
```

Error: `Label 'secret' cannot flow to 'op:show'` -- the policy blocks secret-labeled data from reaching show.

See `labels-sensitivity` for declaring labels, `labels-source-auto` for source label rules.
