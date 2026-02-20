---
id: tool-call-tracking
title: Tool Call Tracking
brief: Track exe invocations with @mx.tools namespace
category: security
tags: [tools, guards, mx, tracking]
related: [mcp, mcp-tool-gateway, security-guards-basics, env-directive]
related-code: [interpreter/env/ContextManager.ts, cli/mcp/FunctionRouter.ts]
updated: 2026-02-16
qa_tier: 2
---

The `@mx.tools` namespace tracks `exe` invocations — the tools you define and expose to LLMs during orchestration. Guards can use this to enforce rate limits, prevent duplicate calls, and require verification steps.

Raw commands (`run cmd {}`, `run sh {}`) are not tracked. Only `exe`-defined functions count as tools.

**@mx.tools.calls - Call history:**

```mlld
guard @limitCalls before op:exe = when [
  @mx.tools.calls.length >= 3 => deny "Too many tool calls"
  * => allow
]
```

Array of tool names invoked this session (both direct calls and MCP-routed).

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

Array of tool names the current context is permitted to use. Populated inside `env` blocks with tool restrictions; empty at top level.

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

Array of tool names explicitly denied in current context. Populated inside `env` blocks with tool restrictions; empty at top level.

**Rate limiting example:**

```mlld
guard @rateLimitExpensive before op:exe = when [
  @mx.op.labels.includes("expensive") && @mx.tools.calls.length >= 5 => [
    deny "Rate limit exceeded for expensive operations"
  ]
  * => allow
]
```

**Ensure verification happened:**

```mlld
guard @ensureVerified after llm = when [
  @mx.tools.calls.includes("verify") => allow
  * => retry "Must verify instructions before proceeding"
]
```

**Conditional behavior based on history:**

```mlld
exe @smartFetch(url) = when [
  @mx.tools.calls.includes("cache_check") => @fetchCached(@url)
  * => @fetchFresh(@url)
]
```

**Tracking scope:**

Calls are tracked within the current execution context. `env` blocks with tool restrictions get their own scope.

```mlld
env @agent with { tools: @agentTools } [
  >> @mx.tools.calls scoped to this env block
  >> only tracks exe invocations the agent makes
  var @result = @fetchData("input")
]
```
