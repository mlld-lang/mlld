---
id: mcp-policy
title: MCP Policy Rules
brief: Control what MCP-sourced data can do with label flow rules
category: security
parent: security
tags: [mcp, policy, labels, label-flow, security]
related: [mcp, mcp-security, mcp-guards, mcp-import, security-policies]
related-code: [interpreter/eval/policy.ts, interpreter/eval/exec-invocation.ts]
updated: 2026-02-04
qa_tier: 2
---

Policy label flow rules restrict what MCP-sourced data can do. Since all MCP outputs carry `src:mcp` taint, you can write rules that target them declaratively.

**Deny destructive operations on MCP data:**

```mlld
policy @p = {
  labels: {
    "src:mcp": {
      deny: ["destructive", "op:cmd:rm"]
    }
  }
}
```

To combine multiple policies, use `union()` — see `policy-composition`.

This blocks MCP-sourced data from flowing to any operation labeled `destructive` or to `rm` commands.

**Allow-list specific operations:**

```mlld
policy @p = {
  labels: {
    "src:mcp": {
      allow: ["op:cmd:git:status", "op:cmd:git:log"],
      deny: ["op:cmd:git:push", "op:cmd:git:reset"]
    }
  }
}
```

With explicit `src:mcp` allow/deny rules, MCP data can only flow to explicitly allowed operations. The most-specific rule wins: `allow: [op:cmd:git:status]` overrides a broader `deny: [op:cmd:git]`.

**Manual trust labeling:**

MCP data gets `src:mcp` taint automatically, but trust classification requires explicit labeling:

```mlld
var untrusted @mcpData = @mcp.github.listIssues()
```

Now `@mcpData` has both `src:mcp` taint AND the `untrusted` label, so built-in rules like `no-untrusted-destructive` apply.

**Policy denials are hard errors** — the operation fails immediately. Unlike guard denials, they cannot be caught with `denied =>` handlers. Use policy for absolute constraints and guards for cases needing graceful fallback. See `security-denied-handlers` for guard denial handling.

See `security-policies` for general policy structure and `labels-source-auto` for source label details.
