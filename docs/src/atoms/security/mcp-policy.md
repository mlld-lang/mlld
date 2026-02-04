---
id: mcp-policy
title: MCP Policy Rules
brief: Control what MCP-sourced data can do with label flow rules
category: security
parent: security
tags: [mcp, policy, labels, label-flow, security]
related: [mcp-security, mcp-import, policies, labels-source-auto]
related-code: [interpreter/eval/policy.ts, interpreter/eval/exec-invocation.ts]
updated: 2026-02-04
qa_tier: 2
---

Policy label flow rules restrict what MCP-sourced data can do. Since all MCP outputs carry `src:mcp` taint, you can write rules that target them declaratively.

**Deny destructive operations on MCP data:**

```mlld
var @policyConfig = {
  labels: {
    "src:mcp": {
      deny: ["destructive", "op:cmd:rm"]
    }
  }
}
policy @p = union(@policyConfig)
```

This blocks MCP-sourced data from flowing to any operation labeled `destructive` or to `rm` commands.

**Allow-list specific operations:**

```mlld
var @strictPolicy = {
  defaults: { unlabeled: "untrusted" },
  labels: {
    "src:mcp": {
      allow: ["op:cmd:git:status", "op:cmd:git:log"],
      deny: ["op:cmd:git:push", "op:cmd:git:reset"]
    }
  }
}
policy @p = union(@strictPolicy)
```

With `unlabeled: untrusted`, MCP data can only flow to explicitly allowed operations. The most-specific rule wins: `allow: [op:cmd:git:status]` overrides a broader `deny: [op:cmd:git]`.

**Combining with source classification:**

```mlld
var @config = {
  sources: {
    "src:mcp": "untrusted"
  }
}
policy @p = union(@config)
```

Classifying `src:mcp` as untrusted means all built-in rules for untrusted data (like `no-untrusted-destructive`) apply automatically to MCP outputs.

See `policies` for general policy structure and `labels-source-auto` for source label details.
