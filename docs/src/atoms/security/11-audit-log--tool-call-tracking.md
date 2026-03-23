---
id: tool-call-tracking
title: Tool Call Tracking
brief: Use @mx.tools.calls for execution history and @mx.tools.history for value lineage
category: security
parent: audit-log
tags: [tools, guards, mx, tracking]
related: [mcp, mcp-tool-gateway, security-guards-basics, box-directive]
related-code: [interpreter/env/ContextManager.ts, cli/mcp/FunctionRouter.ts]
updated: 2026-03-23
qa_tier: 2
---

The `@mx.tools` namespace now exposes two different histories:

- `@mx.tools.calls` is execution-level history for the current run.
- `@mx.tools.history` is value-level lineage for the current guarded input/output.

Guards can use `calls` for rate limits and duplicate suppression, and `history` for "what produced this value?" checks.

Raw commands (`run cmd {}`, `run sh {}`) are not tracked. Only `exe`-defined functions count as tools.

**@mx.tools.calls - Call history:**

```mlld
guard @limitCalls before op:exe = when [
  @mx.tools.calls.length >= 3 => deny "Too many tool calls"
  * => allow
]
```

Array of tool names invoked this session (both direct calls and MCP-routed).

**@mx.tools.history - Value lineage:**

```mlld
guard @requireVerified before publishes = when [
  @mx.tools.history.length() < 2 || @mx.tools.history[1].name != "verify" => deny "Value must pass through verify"
  * => allow
]
```

`history` comes from the current value's security descriptor, not from the whole session. Each entry has:

- `name` — tool name
- `args` — parameter names only
- `auditRef` — UUID of the matching `toolCall` event in `.mlld/sec/audit.jsonl`

Outside guards, inspect the same lineage directly on values with `@value.mx.tools`.

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

This example intentionally uses `calls`, not `history`: it is enforcing that the current `llm` execution invoked `verify`, not tracing the lineage of a later value.

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
box @agent with { tools: @agentTools } [
  >> @mx.tools.calls scoped to this env block
  >> @mx.tools.history still follows the specific values flowing through guards
  var @result = @fetchData("input")
]
```
