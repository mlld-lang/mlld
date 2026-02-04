---
id: mcp-import
title: Importing MCP Tools
brief: Import MCP server tools as callable mlld functions
category: security
parent: security
tags: [mcp, import, tools, security]
related: [labels-source-auto, guards-basics, policies]
related-code: [interpreter/eval/import/ImportDirectiveEvaluator.ts, interpreter/mcp/McpImportManager.ts]
updated: 2026-02-04
qa_tier: 2
---

MCP tools are imported into mlld as callable functions. Two forms are supported: selected tools and namespace import.

**Selected tools** import specific tools by name:

```mlld
import tools { @echo } from mcp "@anthropic/filesystem"
show @echo("hello")
```

**Namespace import** brings all tools under an alias:

```mlld
import tools from mcp "@github/issues" as @github
show @github.createIssue("title", "body")
```

**Server spec** can be a package name or a command string:

```mlld
import tools { @readFile } from mcp "npx @anthropic/mcp-server-filesystem /workspace"
```

**Name conversion** is automatic. MCP servers use snake_case (`create_issue`), mlld uses camelCase (`@createIssue`). The conversion happens at import time in both directions.

**Security:** All MCP tool outputs automatically carry `src:mcp` taint, enabling provenance-based guards and policy rules. See `labels-source-auto` for details on source tracking.

Imported tools behave like `exe` functions: they can be passed as values, composed, and subjected to guards.
