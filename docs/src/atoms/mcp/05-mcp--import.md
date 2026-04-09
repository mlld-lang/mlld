---
id: mcp-import
title: Importing MCP Tools
brief: Import external MCP server tools as callable functions
category: mcp
parent: mcp
tags: [mcp, import, tools]
related: [mcp, mcp-export, mcp-security, mcp-guards]
related-code: [interpreter/eval/import/ImportDirectiveEvaluator.ts, interpreter/mcp/McpImportManager.ts]
updated: 2026-04-08
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

**Dynamic specs already worked through interpolation:**

```mlld
var @serverSpec = "node ./calendar-server.cjs"
import tools from mcp "@serverSpec" as @calendar
```

That form remains useful when you want imported functions or a namespace in the current scope.

**Name conversion** is automatic. MCP's `list_directory` becomes mlld's `@listDirectory`. The mapping works in both directions.

**Type coercion** is automatic. Arguments are coerced to match the MCP tool's `inputSchema` types before dispatch. A string where the schema expects an array is wrapped (`"x"` → `["x"]`), string numbers are parsed, `"true"`/`"false"` become booleans, and JSON strings are parsed for object/array types.

**Name-based argument matching:** When calling an MCP tool with variable references whose names match schema properties, arguments are matched by name instead of position:

```mlld
exe createEvent(title, participants, date) =
  @mcp.createCalendarEvent(@title, @participants, @date)
```

Even if the MCP schema declares `participants` before `title`, mlld matches `@title` to the `title` property and `@participants` to `participants`. Falls back to positional mapping when arg names don't match.

**SDK server injection:** When using the SDK, `mcpServers` maps logical names to commands per-execution. `import tools from mcp "name"` checks the map before treating the spec as a shell command:

```python
client.execute('./agent.mld', payload,
    mcp_servers={'tools': f'uv run python3 server.py {config}'})
```

```mlld
import tools from mcp "tools" as @t
```

Each `execute()` call gets an independent server lifecycle, enabling parallel executions with isolated MCP state.

**`import tools` vs `var tools = mcp @expr`:**

- `import tools ...` imports callable functions or a namespace into the current scope.
- `var tools @t = mcp @expr` builds a `ToolCollection` value from runtime discovery.
- Use the `var tools` form when you want to hand a discovered collection to `box with { tools: @t }` or another API that expects a tool collection object.

Imported tool namespaces and discovered tool collections preserve their tool metadata across module/exe handoff. Treat them as identity-bearing values; don't object-spread them if you need the collection behavior to survive.

**Security:** All MCP tool outputs carry `src:mcp` taint automatically. See `mcp-security` for propagation details, `mcp-guards` for filtering, `mcp-policy` for flow restrictions.
