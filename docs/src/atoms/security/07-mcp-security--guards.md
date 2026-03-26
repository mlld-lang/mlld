---
id: mcp-guards
title: Guards for MCP Tool Calls
brief: Inspect, block, and transform MCP tool calls with guards
category: security
parent: mcp-security
tags: [mcp, guards, for secret, src:mcp, security]
related: [mcp, mcp-security, mcp-policy, mcp-import, security-guards-basics, facts-and-handles]
related-code: [interpreter/eval/exec-invocation.ts, interpreter/eval/guard.ts]
updated: 2026-03-23
qa_tier: 2
---

Guards catch labeled data flowing to MCP calls. A bare label trigger like `for secret` matches both data labels on inputs and operation labels on exes (see `guards-basics`). Since MCP tool calls execute as exe operations, use `@mx.op.type == "exe"` to narrow to MCP/exe context, or guard directly on the tool's operation labels (e.g., `guard before destructive`).

**Block MCP calls that carry secret data:**

```mlld
guard @noSecretToMcp for secret = when [
  @mx.op.type == "exe" => deny "Secret data cannot flow to executable operations"
  * => allow
]

var secret @customerList = <internal/customers.csv>
import tools { @echo } from mcp "npx -y @modelcontextprotocol/server-everything"
show @echo(@customerList)
```

The guard fires before any exe operation that receives secret-labeled data. Since `@customerList` carries the `secret` label, the MCP tool call is denied.

**Validate MCP tool output:**

```mlld
guard @validateMcp after op:exe = when [
  @mx.taint.includes("src:mcp") && @output.error => deny "MCP tool returned error"
  * => allow
]
```

After-guards run after the tool returns. In the after-guard context, both `@mx.taint` and `@output.mx.taint` reflect the output's taint—including `src:mcp`—and `@mx.sources` includes `mcp:<tool-name>`. The `@output` variable holds the raw return value; `@output.error` applies to tools returning structured JSON objects with an error field. For string outputs, use a pattern match instead. Guards support single actions (allow, deny, retry) per branch—for complex audit logic with multiple statements like logging, use a wrapper exe function instead of a guard.

**Retry transient MCP failures:**

```mlld
guard @retryTransientMcp after op:exe = when [
  @mx.taint.includes("src:mcp") && @output.error && @mx.guard.try < 3 => retry "Transient MCP failure"
  @mx.taint.includes("src:mcp") && @output.error => deny "MCP tool failed after retries"
  * => allow
]
```

Use `@mx.guard.try` for guard retries. It is 1-based, so the first guard evaluation has `@mx.guard.try == 1`. `@mx.try` is the pipeline retry counter and stays `1` for non-pipeline MCP guard checks.

**Require a specific tool in the current value's lineage:**

```mlld
guard @requireVerify before publishes = when [
  !@mx.tools.history[*].name.includes("verify") => deny "Value must be verified first"
  * => allow
]
```

`[*]` projects `.name` across all provenance entries so `.includes()` checks the entire chain regardless of position. Use `@mx.taint.includes("src:mcp")` when any MCP origin is enough. Use `@mx.tools.history` when the guard needs a specific transformation or verifier in the chain that produced the current value.

**Guard context for MCP calls:**

Inside a guard triggered by an MCP tool call:
- `@mx.op.type` — `"exe"`
- `@mx.op.name` — the tool function name (e.g., `@createIssue`)
- `@mx.op.labels` — any labels from the tool definition (e.g., `destructive`)
- `@mx.args.<param>` — named tool parameters (from the tool's JSON Schema)
- `@mx.args.names` — list of available parameter names
- `@mx.guard.try` — current guard retry attempt (1-based)
- `@mx.taint` — includes `src:mcp`
- `@output.mx.taint` — mirrors output taint in after-guards
- `@mx.sources` — includes `mcp:<toolName>`
- `@mx.tools.history` — value-level tool provenance for the current guarded value

`@mx.tools.calls` is still available alongside `history` when you need execution-level history instead of value lineage.

MCP tool parameters often have non-dot-safe names from JSON Schema property keys. Use bracket access for these: `@mx.args["repo-name"]`.

MCP tools imported with `=> record` (e.g., `import tools { @searchContacts => contact } from mcp "server"`) carry field-level fact labels from the record classification. Guards and policy can check those facts on MCP tool output the same way they work for local exes. See `facts-and-handles` for the record/fact/handle model.

See `security-guards-basics` for general guard syntax and `mcp-security` for taint details.
