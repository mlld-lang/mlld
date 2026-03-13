---
id: mcp-policy
title: MCP Policy Rules
brief: Control what MCP-sourced data can do with label flow rules
category: security
parent: mcp-security
tags: [mcp, policy, labels, label-flow, security]
related: [mcp, mcp-security, mcp-guards, mcp-import, security-policies, box-config]
related-code: [interpreter/eval/policy.ts, interpreter/eval/exec-invocation.ts, interpreter/env/environment-provider.ts]
updated: 2026-03-04
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
import tools { @echo } from mcp "npx -y @modelcontextprotocol/server-everything"
var untrusted @mcpData = @echo("external data")
```

Now `@mcpData` has both `src:mcp` taint AND the `untrusted` label, so built-in rules like `no-untrusted-destructive` apply.

**Capability denials** (from `capabilities.deny`) are hard errors — the operation fails immediately and cannot be caught. **Managed label-flow denials** (from `defaults.rules` and `labels` deny/allow) flow through the guard pipeline — an explicit privileged guard can override them with `allow`, and `denied =>` handlers can catch them. To make a label-flow denial absolute, add `locked: true` to the policy. See `security-denied-handlers` for guard denial handling.

**Environment policy alignment:** `policy.env` constraints (provider allow/deny, tools, mcps, network) are enforced when runtime env config is derived. Guard `env` actions may return a policy fragment, and that fragment is merged into active policy before execution. This lets guards tighten runtime environment constraints without mutating the declared policy source.

See `security-policies` for general policy structure and `labels-source-auto` for source label details.
