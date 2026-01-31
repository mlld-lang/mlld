---
id: tool-reshaping
title: Tool Reshaping
brief: Bind and expose parameters to customize tool interfaces
category: commands
tags: [tools, mcp, bind, expose, parameters]
related: [mcp-tool-gateway, exe-metadata, exe-simple]
related-code: [cli/mcp/FunctionRouter.ts, cli/mcp/SchemaGenerator.ts]
updated: 2026-01-24
qa_tier: 2
---

> **Requires MCP server context.** Run `mlld mcp <module>` to serve tools. See `mlld howto mcp`.

Reshape tool interfaces using `bind` and `expose` to control what parameters agents see.

**bind - Pre-fill parameters:**

```mlld
exe @createIssue(owner: string, repo: string, title: string, body: string) = cmd {
  gh issue create -R @owner/@repo -t "@title" -b "@body"
}

var tools @agentTools = {
  createIssue: {
    mlld: @createIssue,
    bind: { owner: "mlld", repo: "infra" }
  }
}
```

The agent sees only `title` and `body`. The bound parameters `owner` and `repo` are fixed.

**expose - Limit visible parameters:**

```mlld
var tools @agentTools = {
  createIssue: {
    mlld: @createIssue,
    bind: { owner: "mlld", repo: "infra" },
    expose: ["title", "body"]
  }
}
```

Explicitly list which parameters appear in the tool schema. Parameters not in `expose` are hidden from the agent.

**Default behavior:**

Without `expose`, all parameters except those in `bind` are visible. Adding `expose` overrides this - only listed parameters appear.

**Variable binding:**

Bound values can reference variables:

```mlld
var @org = "mlld"
var @defaultRepo = "main"

var tools @agentTools = {
  createIssue: {
    mlld: @createIssue,
    bind: { owner: @org, repo: @defaultRepo }
  }
}
```

Variables are resolved when the tool collection is defined, not when called.

**Nested objects in bind:**

```mlld
var tools @agentTools = {
  configure: {
    mlld: @configure,
    bind: { config: { timeout: 30, retries: 3 } }
  }
}
```

**Complete example:**

```mlld
exe @searchDocs(index: string, query: string, limit: number, format: string) = cmd {
  search-tool --index @index -q "@query" -n @limit --format @format
}

var tools @agentTools = {
  searchDocs: {
    mlld: @searchDocs,
    bind: { index: "production", format: "json" },
    expose: ["query", "limit"],
    description: "Search documentation"
  }
}
```

The agent sees:
- `query` (string, required)
- `limit` (number, required)

Hidden from agent:
- `index` (always "production")
- `format` (always "json")
