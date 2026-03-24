---
id: config-mcp-dev
title: mlld mcp-dev Command
brief: MCP server for language introspection tools
category: cli
tags: [cli, mcp, development, validation, ast, analysis]
related: [mcp, mcp-export, mcp-import, config-plugin, config-cli-run]
related-code: [cli/commands/mcp-dev.ts, cli/mcp/DevMCPServer.ts, cli/mcp/BuiltinTools.ts, cli/mcp/BuiltinTools.test.ts]
updated: 2026-03-16
qa_tier: 2
---

Start an MCP server that provides language introspection tools for development. Use with Claude Code or other MCP clients to validate syntax, analyze modules, and inspect ASTs during development.

```bash
mlld mcp-dev
```

Configure in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mlld-dev": {
      "command": "mlld",
      "args": ["mcp-dev"]
    }
  }
}
```

**Tools provided:**

`mlld_validate` — Validate syntax and static semantics, including context-aware guard checks:

```json
{
  "code": "var @x = \"hello\"",
  "mode": "strict",
  "context": ["./tools.mld"]
}
```

Returns the same structured validation shape as `mlld validate --format json`, including `errors`, `warnings`, `redefinitions`, `antiPatterns`, and module metadata such as `executables`, `guards`, `policies`, and `needs`.

`mlld_analyze` — Full module analysis with exports, executables, imports, guards, policies, and statistics:

```json
{
  "code": "exe @greet(name) = cmd { echo \"hello\" }\nexport { @greet }",
  "includeAst": false,
  "context": ["./tools.mld"]
}
```

Returns structured data about the module: `{ exports: [...], executables: [...], imports: [...], guards: [...], policies: [...], variables: [...], stats: {...} }`.

For guard/policy authoring, `mlld_analyze` now includes:

- exe `labels`
- guard `privileged`, `filter`, and `arms`
- policy `rules`, `operations`, `locked`, and `refs`

`mlld_ast` — Get the raw parsed AST:

```json
{
  "code": "var @x = \"hello\""
}
```

Returns `{ success: true, ast: [...] }` or parse error details.

**Input modes:**

All tools accept either `file` (path to `.mld` file) or `code` (inline string):

```json
{ "file": "./script.mld" }
{ "code": "var @x = 1" }
```

Mode inference: `.mld` files use strict mode, `.mld.md` files use markdown mode. Override with `"mode": "strict"` or `"mode": "markdown"`.

**Separate from user tools:**

`mlld mcp-dev` serves built-in language introspection tools. `mlld mcp` serves user-defined functions as MCP tools. The two commands run independent servers with different purposes.
