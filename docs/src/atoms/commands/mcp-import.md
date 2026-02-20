---
id: mcp-import
title: Importing MCP Tools
brief: Import external MCP server tools as callable functions
category: commands
tags: [mcp, import, tools]
related: [mcp, mcp-export, mcp-security, mcp-guards]
related-code: [interpreter/eval/import/ImportDirectiveEvaluator.ts, interpreter/mcp/McpImportManager.ts]
updated: 2026-02-11
qa_tier: 2
---

Import tools from an MCP server as callable `exe` functions.

**Selected import:**

```mlld
import tools { @echo } from mcp "@anthropic/filesystem"
show @echo("hello")
```

**Namespace import:**

```mlld
import tools from mcp "@github/issues" as @github
show @github.createIssue("title", "body")
```

Namespace import requires `as @alias`.

**Command string server spec:**

```mlld
import tools { @readFile } from mcp "npx @anthropic/mcp-server-filesystem /workspace"
```

**Name conversion** is automatic. MCP's `create_issue` becomes mlld's `@createIssue`. The mapping works in both directions.

**Security:** All MCP tool outputs carry `src:mcp` taint automatically. See `mcp-security` for propagation details, `mcp-guards` for filtering, `mcp-policy` for flow restrictions.
