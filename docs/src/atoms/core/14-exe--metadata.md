---
id: exe-metadata
title: Exe Metadata
brief: Add descriptions and typed parameters to executables
category: core
parent: exe
tags: [functions, metadata, types, mcp, tools]
related: [exe-simple, exe-blocks, mcp-export, mcp-tool-gateway]
related-code: [interpreter/eval/exe.ts, cli/mcp/SchemaGenerator.ts, grammar/directives/exe.peggy]
updated: 2026-04-15
qa_tier: 2
---

Executables can include metadata for tooling and type safety. Tool-surface security contracts now live on `var tools` entries through `inputs: @record`, not on the executable itself.

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

When exported as tools, type annotations and descriptions generate JSON Schema for the MCP tool listing. For surfaced tool collections, richer tool docs and runtime validation come from the collection entry's `inputs: @record`, `labels`, `description`, `instructions`, and `bind` fields. See `mcp-tool-gateway` and `records-basics`.

**Parameter types vs runtime:**

Type annotations are metadata for tooling. At runtime, parameters arrive as their actual types from the caller.
