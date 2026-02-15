---
id: tool-call-tracking
title: Tool Call Tracking
brief: Track tool usage with @mx.tools namespace
category: security
tags: [tools, guards, mx, tracking]
related: [mcp, mcp-tool-gateway, security-guards-basics, env-directive]
related-code: [interpreter/env/ContextManager.ts, cli/mcp/FunctionRouter.ts]
updated: 2026-02-11
qa_tier: 2
---

`@mx.tools` is guard-context metadata for tool-call policy checks.

Use it inside guard `when` expressions that run during tool operations. It is not a global log of all outbound MCP calls.

**Fields:**
- `@mx.tools.calls`: Tool names already called in the current guard/tool-call context
- `@mx.tools.allowed`: Tool names currently permitted
- `@mx.tools.denied`: Tool names currently denied

**Basic guard example:**

```mlld
guard @limitCalls before op:exe = when [
  @mx.tools.calls.length >= 3 => deny "Too many tool calls"
  * => allow
]
```

**Check duplicate calls:**

```mlld
guard @preventDuplicate before op:exe = when [
  @mx.tools.calls.includes(@mx.op.name) => deny "Tool already called"
  * => allow
]
```

**Check allow/deny lists:**

```mlld
guard @checkAccess before op:exe = when [
  @mx.tools.denied.includes(@mx.op.name) => deny "Tool is blocked"
  @mx.tools.allowed.includes(@mx.op.name) => allow
  * => deny "Tool not in allowed list"
]
```

**Scope note:**

Tool tracking stays within the active execution context. `env` blocks can isolate context:

```mlld
env @agent with { tools: @agentTools } [
  >> Guard checks in this block read the block-local @mx.tools state
  run cmd { claude -p @task }
]
```
