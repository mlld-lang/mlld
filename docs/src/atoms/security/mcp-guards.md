---
id: mcp-guards
title: Guards for MCP Tool Calls
brief: Inspect, block, and transform MCP tool calls with guards
category: security
parent: security
tags: [mcp, guards, for secret, src:mcp, security]
related: [mcp-security, mcp-policy, mcp-import, guards-basics, before-guards, after-guards]
related-code: [interpreter/eval/exec-invocation.ts, interpreter/eval/guard.ts]
updated: 2026-02-04
qa_tier: 2
---

Guards use data-label filters (like `for secret`) to catch labeled data flowing to MCP calls. The guard condition narrows to exe operations using `@mx.op.type == "exe"`, since MCP tool calls execute as exe operations.

**Block MCP calls that carry secret data:**

```mlld
guard @noSecretToMcp for secret = when [
  @mx.op.type == "exe" => deny "Secret data cannot flow to executable operations"
  * => allow
]

var secret @key = "sk-12345"
import tools { @createIssue } from mcp "@github/issues"
show @createIssue("title", @key)
```

The guard fires before any exe operation that receives secret-labeled data. Since `@key` carries the `secret` label, the MCP tool call is denied.

**Validate MCP tool output:**

```mlld
guard @validateMcp after op:exe = when [
  @mx.taint.includes("src:mcp") && @output.error => deny "MCP tool returned error"
  * => allow
]
```

After-guards run after the tool returns. The output already carries `src:mcp` taint and `mcp:<tool-name>` in its sources array. The `@output.error` check applies to tools returning structured JSON; for string outputs, use a pattern match instead. Guards support single actions (allow, deny, retry) per branch—for complex audit logic with multiple statements like logging, use a wrapper exe function instead of a guard.

**Guard context for MCP calls:**

Inside a guard triggered by an MCP tool call:
- `@mx.op.type` — `"exe"`
- `@mx.op.name` — the tool function name (e.g., `@createIssue`)
- `@mx.op.labels` — any labels from the tool definition (e.g., `destructive`)
- `@mx.taint` — includes `src:mcp`
- `@mx.sources` — includes `mcp:<toolName>`

See `guards-basics` for general guard syntax and `mcp-security` for taint details.
