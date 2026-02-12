---
id: mcp
title: MCP Integration
brief: Serve mlld functions as MCP tools and import external MCP servers
category: commands
tags: [mcp, tools, export, import, server]
related: [mcp-export, mcp-import, mcp-tool-gateway, tool-reshaping, mcp-security]
related-code: [cli/mcp/MCPServer.ts, cli/mcp/MCPOrchestrator.ts]
updated: 2026-02-11
qa_tier: 2
---

mlld speaks MCP in both directions: serve your functions as tools, or import tools from external servers.

**Export — serve functions as MCP tools:**

```mlld
exe @greet(name: string) = js { return "Hello " + name; }
export { @greet }
```

```bash
mlld mcp tools.mld
```

Any MCP client can now call `greet`. See `mcp-export`.

**Import — use external MCP tools as functions:**

```mlld
import tools { @echo } from mcp "@anthropic/filesystem"
show @echo("hello")
```

Imported tool outputs carry `src:mcp` taint automatically. See `mcp-import`.

**Reading order:**

| Want to... | Read |
|---|---|
| Serve functions as tools | `mcp-export` |
| Import external MCP tools | `mcp-import` |
| Control what agents see | `mcp-tool-gateway`, `tool-reshaping` |
| Secure MCP data flows | `mcp-security`, `mcp-policy`, `mcp-guards` |
| Track tool usage | `tool-call-tracking` |
| End-to-end example | `pattern-guarded-tool-export` |
