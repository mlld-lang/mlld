---
id: mcp-security
title: MCP Output Tainting
brief: MCP outputs carry src:mcp taint plus separate per-value tool lineage
category: security
parent: mcp-security
tags: [mcp, taint, provenance, src:mcp, security]
related: [mcp, mcp-import, mcp-policy, mcp-guards, labels-source-auto]
related-code: [interpreter/eval/exec-invocation.ts, core/types/security.ts]
updated: 2026-03-23
qa_tier: 2
---

Every imported MCP tool call automatically taints its output with `src:mcp`. This happens at the interpreter level — no configuration needed.
This provenance marker does not add a trust label like `untrusted`.

```mlld
import tools { @echo } from mcp "npx -y @modelcontextprotocol/server-everything"
var @result = @echo("hello")
show @result.mx.taint | @parse
```

Output includes `["src:mcp"]` plus the tool name in `sources` (e.g., `["mcp:echo"]`).

For tools served through `mlld mcp`, request inputs keep the caller's existing metadata. They do not gain synthetic `src:mcp`; that source marker is reserved for returned values.

MCP outputs also carry tool provenance on `.mx.tools`:

```mlld
import tools { @echo } from mcp "npx -y @modelcontextprotocol/server-everything"
var @result = @echo("hello")
show @result.mx.tools[0].name
```

That lineage is separate from taint:

- `src:mcp` answers "did any MCP-sourced data touch this value?"
- `.mx.tools` answers "which tool calls produced this value?"
- The provenance chain keeps an `auditRef` pointing back to `.llm/sec/audit.jsonl`

**Taint propagates through all transformations:**

```mlld
var @data = @echo("test")
var @upper = @data | @upper
var @msg = `Result: @upper`
show @msg.mx.taint | @parse
```

Every derived value still carries `src:mcp`, and every derived value keeps the accumulated `.mx.tools` chain. The taint cannot be removed — `src:mcp` is a protected label.

**Why this matters:**

Guards and policy can target MCP-sourced data directly with `src:mcp`. A guard checking `@mx.taint.includes("src:mcp")` fires on any value that originated from an MCP tool, even after multiple transformations. When you need a specific step in the chain, inspect `@mx.tools.history` instead.

```mlld
guard before op:cmd = when [
  @input.any.mx.taint.includes("src:mcp") => deny "MCP data cannot trigger commands"
  * => allow
]
```

See `labels-source-auto` for the full list of automatic source labels.
