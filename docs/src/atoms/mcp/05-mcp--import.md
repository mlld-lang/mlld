---
id: mcp-import
title: Importing MCP Tools
brief: Import external MCP server tools as callable functions
category: mcp
parent: mcp
tags: [mcp, import, tools]
related: [mcp, mcp-export, mcp-security, mcp-guards]
related-code: [interpreter/eval/import/ImportDirectiveEvaluator.ts, interpreter/mcp/McpImportManager.ts]
updated: 2026-02-11
qa_tier: 2
---

Import tools from an MCP server as callable `exe` functions. The server spec is a shell command that launches the server.

**Selected import:**

```mlld
import tools { @echo } from mcp "npx -y @modelcontextprotocol/server-everything"
show @echo("hello")
```

**Namespace import:**

```mlld
import tools from mcp "npx -y @modelcontextprotocol/server-filesystem /workspace" as @fs
show @fs.listDirectory("/workspace")
```

Namespace import requires `as @alias`.

**Name conversion** is automatic. MCP's `list_directory` becomes mlld's `@listDirectory`. The mapping works in both directions.

**Security:** All MCP tool outputs carry `src:mcp` taint automatically. See `mcp-security` for propagation details, `mcp-guards` for filtering, `mcp-policy` for flow restrictions.
