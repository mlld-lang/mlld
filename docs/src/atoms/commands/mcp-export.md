---
id: mcp-export
title: Exporting MCP Tools
brief: Serve exe functions as MCP tools with mlld mcp
category: commands
tags: [mcp, export, tools, server, serve]
related: [mcp, mcp-tool-gateway, tool-reshaping, exe-metadata, mcp-security]
related-code: [cli/mcp/MCPServer.ts, cli/mcp/MCPOrchestrator.ts, cli/mcp/SchemaGenerator.ts]
updated: 2026-02-11
qa_tier: 2
---

Export `exe` functions, run `mlld mcp`. Every exported function becomes an MCP tool.

```mlld
exe @status() = js { return "ok"; }
exe @greet(name: string) = js { return "Hello " + name; }
export { @status, @greet }
```

```bash
mlld mcp tools.mld
```

Clients see two tools: `status` (no params) and `greet` (one string param). Name conversion is automatic — `@greetUser` becomes `greet_user` over MCP.

**Type annotations generate JSON Schema:**

```mlld
exe @search(query: string, limit: number) = cmd {
  gh issue list --search "@query" -L @limit --json number,title
} with { description: "Search issues" }
export { @search }
```

The `with { description }` clause populates the tool description. Type annotations (`string`, `number`, `boolean`, `object`, `array`) generate the input schema. See `exe-metadata`.

**Serve a directory:**

```bash
mlld mcp llm/mcp/
mlld mcp "llm/mcp/*.mld.md"
```

If `llm/mcp/` exists, `mlld mcp` with no arguments serves every module in it.

**Environment overrides:**

```bash
mlld mcp tools.mld --env MLLD_GITHUB_TOKEN=ghp_xxx
```

Keys must start with `MLLD_`. Modules read them with `import { @MLLD_GITHUB_TOKEN } from @input`.

**Filter tools:**

```bash
mlld mcp tools.mld --tools status,greet
```

**Serve reshaped tool collections:**

```bash
mlld mcp tools.mld --tools-collection @agentTools
```

Uses `bind`/`expose` definitions from a `var tools` collection instead of raw exports. See `mcp-tool-gateway` and `tool-reshaping`.

**Client configuration (Claude Code):**

```json
{
  "mcpServers": {
    "my-tools": {
      "command": "npx",
      "args": ["mlld", "mcp", "tools.mld"]
    }
  }
}
```

**Security:** When tools are called via MCP, inputs carry `src:mcp` taint. See `mcp-security`.
