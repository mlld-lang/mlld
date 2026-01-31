---
id: tool-call-tracking
title: Tool Call Tracking
brief: Track tool usage with @mx.tools namespace
category: security
tags: [tools, guards, mx, tracking]
related: [guards-basics, mcp-tool-gateway, env-directive]
related-code: [interpreter/env/ContextManager.ts, cli/mcp/FunctionRouter.ts]
updated: 2026-01-24
qa_tier: 2
---

> **Requires MCP server context.** Run `mlld mcp <module>` to serve tools. See `mlld howto mcp`.

The `@mx.tools` namespace tracks tool call history and availability during execution.

**@mx.tools.calls - Call history:**

```mlld
guard @limitCalls before op:exe = when [
  @mx.tools.calls.length >= 3 => deny "Too many tool calls"
  * => allow
]
```

Array of tool names that have been called this session.

**Check if specific tool was called:**

```mlld
guard @preventDuplicate before op:exe = when [
  @mx.tools.calls.includes("deleteData") => deny "Delete already executed"
  * => allow
]
```

**@mx.tools.allowed - Available tools:**

```mlld
guard @checkAccess before op:exe = when [
  @mx.tools.allowed.includes(@mx.op.name) => allow
  * => deny "Tool not in allowed list"
]
```

Array of tool names the current context is permitted to use.

**@mx.tools.denied - Blocked tools:**

```mlld
guard @logDenied before op:exe = when [
  @mx.tools.denied.includes(@mx.op.name) => [
    log `Attempted blocked tool: @mx.op.name`
    deny "Tool is blocked"
  ]
  * => allow
]
```

Array of tool names explicitly denied in current context.

**Rate limiting example:**

```mlld
guard @rateLimitExpensive before op:exe = when [
  @mx.op.labels.includes("expensive") && @mx.tools.calls.length >= 5 => [
    deny "Rate limit exceeded for expensive operations"
  ]
  * => allow
]
```

**Prevent repeated tool calls:**

```mlld
guard @noRepeat before op:exe = when [
  @mx.tools.calls.includes(@mx.op.name) => deny "Each tool can only be called once"
  * => allow
]
```

**Conditional behavior based on history:**

```mlld
exe @smartFetch(url) = when [
  @mx.tools.calls.includes("cache_check") => @fetchCached(@url)
  * => @fetchFresh(@url)
]
```

**Tool call tracking scope:**

Tool calls are tracked within the current execution context. When using `env` blocks, each block can have its own tracking scope based on the environment configuration.

```mlld
env @agent with { tools: @agentTools } [
  >> @mx.tools.calls tracks calls within this env block
  run cmd { claude -p @task }
]
```
