---
id: exe-metadata
title: Exe Metadata
brief: Add descriptions and typed parameters to executables
category: commands
parent: exe
tags: [functions, metadata, types, mcp, tools]
related: [exe-simple, exe-blocks, mcp-export, mcp-tool-gateway]
related-code: [interpreter/eval/exe.ts, cli/mcp/SchemaGenerator.ts, grammar/directives/exe.peggy]
updated: 2026-01-24
qa_tier: 2
---

Executables can include metadata for tooling and type safety.

**Typed parameters:**

```mlld
exe @greet(name: string, times: number) = js { return "Hello " + name; }
exe @process(data: object, format: string) = js { return data; }
exe @count(items: array) = js { return items.length; }
```

Type annotations use `: type` syntax after the parameter name. Supported types: `string`, `number`, `boolean`, `object`, `array`.

**Description metadata:**

```mlld
exe @greet(name: string) = js { return "Hello " + name; } with { description: "Greet a user by name" }
```

The `with { description: "..." }` clause adds a description that appears in MCP tool listings.

**Combined example:**

```mlld
exe @searchIssues(repo: string, query: string, limit: number) = cmd {
  gh issue list -R @repo --search "@query" -L @limit --json number,title
} with { description: "Search GitHub issues by query" }
```

**MCP integration:**

When exported as tools, type annotations and descriptions generate JSON Schema for the MCP tool listing. See `mcp-export` for serving and `mcp-tool-gateway` for tool collections.

**Parameter types vs runtime:**

Type annotations are metadata for tooling. At runtime, parameters arrive as their actual types from the caller.
