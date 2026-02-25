---
id: mcp-tool-gateway
title: Tool Collections
brief: Define tool sets with labels, scoping, and metadata for agents
category: commands
tags: [mcp, tools, env, labels, collections]
related: [mcp, mcp-export, tool-reshaping, mcp-guards, exe-metadata]
related-code: [interpreter/eval/var.ts, cli/mcp/FunctionRouter.ts, cli/mcp/MCPOrchestrator.ts]
updated: 2026-02-11
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
env @agent with { tools: @agentTools } [
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
