---
id: pattern-guarded-tool-export
title: Guarded Tool Export
brief: Wrap mlld functions as MCP tools with bound context and guards
category: patterns
tags: [mcp, tools, bind, inputs, guards, export, pattern]
related: [mcp, mcp-export, tool-reshaping, mcp-tool-gateway, mcp-guards]
related-code: [cli/mcp/FunctionRouter.ts, cli/mcp/SchemaGenerator.ts, interpreter/eval/guard.ts]
updated: 2026-04-15
qa_tier: 2
---

Expose mlld functions as MCP tools with fixed context parameters and security guards. The tool catalog is the `var tools` collection itself: one declaration carries the surfaced name, input contract, labels, binds, and prompt metadata.

**Define the function, guard, and tool collection:**

```mlld
record @search_issues_inputs = {
  facts: [query: string],
  data: [],
  validate: "strict"
}

exe @searchIssues(org: string, repo: string, query: string) = cmd {
  gh issue list -R @org/@repo --search "@query" --json number,title
} with { description: "Search GitHub issues" }

guard @noSecrets before op:exe = when [
  @input.any.mx.labels.includes("secret") => deny "Secret data cannot flow to tools"
  * => allow
]

var tools @agentTools = {
  searchIssues: {
    mlld: @searchIssues,
    inputs: @search_issues_inputs,
    bind: { org: "mlld-lang", repo: "mlld" },
    labels: ["resolve:r", "github:r"],
    description: "Search mlld issues by keyword"
  }
}

export { @searchIssues, @agentTools }
```

The agent sees one parameter (`query`) because `inputs: @search_issues_inputs` defines the surfaced contract. The bound `org` and `repo` are invisible and fixed. The guard blocks any call carrying `secret`-labeled data.

**Serve it:**

```bash
mlld mcp tools.mld --tools-collection @agentTools
```

The `--tools-collection` flag tells the MCP server to use the reshaped tool definitions instead of raw exports.

**Give it to an agent:**

Point any MCP client at the command. For Claude Code:

```json
{
  "mcpServers": {
    "my-tools": {
      "command": "npx",
      "args": ["mlld", "mcp", "tools.mld", "--tools-collection", "@agentTools"]
    }
  }
}
```

**Add operation labels for policy:**

Assuming `@createIssue` and `@create_issue_inputs` are defined the same way as `@searchIssues` / `@search_issues_inputs`:

```mlld
var tools @agentTools = {
  searchIssues: {
    mlld: @searchIssues,
    inputs: @search_issues_inputs,
    bind: { org: "mlld-lang", repo: "mlld" },
    labels: ["read-only"],
    description: "Search mlld issues"
  },
  createIssue: {
    mlld: @createIssue,
    inputs: @create_issue_inputs,
    bind: { org: "mlld-lang", repo: "mlld" },
    labels: ["destructive"],
    description: "Create an mlld issue"
  }
}
```

Guards can then check `@mx.op.labels.includes("destructive")` to block or require approval for write operations. See `mcp-guards` for after-guard patterns that validate tool outputs.
