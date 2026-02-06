---
id: mcp-security
title: MCP Output Tainting
brief: All MCP tool outputs automatically carry src:mcp provenance
category: security
parent: security
tags: [mcp, taint, provenance, src:mcp, security]
related: [mcp-import, mcp-policy, mcp-guards, labels-source-auto, guards-basics]
related-code: [interpreter/eval/exec-invocation.ts, core/types/security.ts]
updated: 2026-02-04
qa_tier: 2
---

Every MCP tool call automatically taints its output with `src:mcp`. This happens at the interpreter level — no configuration needed.

```mlld
import tools { @echo } from mcp "echo-server"
var @result = @echo("hello")
show @result.mx.taint | @json
```

Output includes `["src:mcp"]` plus the tool name in `sources` (e.g., `["mcp:echo"]`).

**Taint propagates through all transformations:**

```mlld
var @data = @echo("test")
var @upper = @data | @upper
var @msg = `Result: @upper`
show @msg.mx.taint | @json
```

Every derived value still carries `src:mcp`. The taint cannot be removed — `src:mcp` is a protected label.

**Why this matters:**

Guards and policy can target MCP-sourced data specifically. A guard checking `@mx.taint.includes("src:mcp")` fires on any value that originated from an MCP tool, even after multiple transformations.

```mlld
guard before op:exe = when [
  @input.any.mx.taint.includes("src:mcp") => deny "MCP data cannot trigger exe"
  * => allow
]
```

See `labels-source-auto` for the full list of automatic source labels.
