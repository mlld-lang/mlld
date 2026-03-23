---
id: mcp-tool-gateway
title: Tool Collections
brief: Define tool sets from object literals or runtime MCP discovery
category: mcp
parent: mcp
tags: [mcp, tools, env, labels, collections]
related: [mcp, mcp-export, tool-reshaping, mcp-guards, exe-metadata]
related-code: [interpreter/eval/var.ts, cli/mcp/FunctionRouter.ts, cli/mcp/MCPOrchestrator.ts]
updated: 2026-03-23
qa_tier: 2
---

`var tools` defines a named collection of tools with metadata. Use it to control what an agent sees and attach labels for guards.

```mlld
exe @readData() = js { return "ok"; }
exe @deleteData() = js { return "deleted"; }

var tools @agentTools = {
  safeRead: { mlld: @readData },
  dangerousDelete: {
    mlld: @deleteData,
    labels: ["destructive"],
    description: "Deletes records"
  }
}
```

**Tool definition fields:**
- `mlld` — executable reference
- `labels` — guard/policy signals (`destructive`, `net:w`)
- `bind` — pre-fill parameters (see `tool-reshaping`)
- `expose` — limit visible parameters (see `tool-reshaping`)
- `description` — override tool description

**Scope tools to an agent with `env`:**

```mlld
box @agent with { tools: @agentTools } [
  run cmd { claude -p @task }
]
```

The agent only sees tools in `@agentTools`. Guards check `@mx.op.labels` on each call.

**Serve a collection over MCP:**

```bash
mlld mcp tools.mld --tools-collection @agentTools
```

The `--tools-collection` flag serves the reshaped collection instead of raw exports. Bound parameters are hidden; only exposed parameters appear in the tool schema. See `mcp-export` for basic serving, `pattern-guarded-tool-export` for a complete example.

**Guard on labels:**

```mlld
guard @blockDestructive before op:exe = when [
  @mx.op.labels.includes("destructive") => deny "Blocked"
  * => allow
]
```

Labels from the tool definition flow to `@mx.op.labels` in guard context. See `mcp-guards`.

**Create a collection directly from a runtime MCP spec:**

```mlld
var @serverSpec = "node ./calendar-server.cjs"
var tools trusted @calendarTools = mcp @serverSpec
show @calendarTools.createEvent.description
```

This asks the MCP server for its tool schema and builds the `ToolCollection` directly from the discovered tools. It is not object-literal normalization:

- Use object literals when you want `bind`, `expose`, `optional`, `controlArgs`, or per-tool labels.
- Use `var tools @t = mcp @expr` when the server command is only known at runtime and you want the discovered collection as a value.
- Normal `var` labels still apply to the collection variable itself, as in `trusted @calendarTools`.

Use `import tools from mcp "..."` when you want callable functions or a namespace in the current scope. Use `var tools @t = mcp @expr` when you want to pass a runtime-built collection into `box with { tools: @t }` or other tool-collection APIs.
