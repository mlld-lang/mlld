---
id: mcp-tool-gateway
title: MCP Tool Gateway
brief: Define tool collections, scope tools, and import MCP servers
category: commands
tags: [mcp, tools, env, guards]
related-code: [interpreter/eval/var.ts, cli/mcp/FunctionRouter.ts, cli/mcp/MCPOrchestrator.ts, interpreter/eval/import/ImportDirectiveEvaluator.ts]
updated: 2026-01-24
qa_tier: 2
---

> **Requires MCP server context.** Run `mlld mcp <module>` to serve tools. See `mlld howto mcp`.

Tool collections define what an agent sees and how tools behave.

```mlld
/exe @readData() = js { return "ok"; }
/exe @deleteData() = js { return "deleted"; }

/var tools @agentTools = {
  safeRead: { mlld: @readData },
  dangerousDelete: {
    mlld: @deleteData,
    labels: ["destructive"],
    description: "Deletes records"
  }
}
```

**Tool definition fields:**
- `mlld` - executable reference
- `labels` - guard/policy labels (`destructive`, `net:w`)
- `bind` - pre-filled parameters
- `expose` - visible parameter subset
- `description` - override tool metadata

**Environment scoping:**

```mlld
/env @agent with { tools: @agentTools } [
  /run cmd { claude -p @task }
]
```

**Import MCP tools:**

```mlld
/import tools { @echo } from mcp "@anthropic/filesystem"
/import tools from mcp "@github/issues" as @github
/show @github.createIssue("title", "body")
```
