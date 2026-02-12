# MCP Server Support

## tldr

Turn exported `exe` functions into MCP tools with one command:

```mlld
exe @greet(name) = js { return `Hello ${name}`; }
export { @greet }
```

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"demo","version":"1.0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"greet","arguments":{"name":"Ada"}}}' \
| mlld mcp tools.mld.md
```

Output:
```
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"mlld","version":"2.0.0-rc57"}}}
{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"Hello Ada"}]}}
```

## Basic Usage

1. Export functions you want to serve:
   ```mlld
   /exe @status() = js { return 'ok'; }
   /export { @status }
   ```
2. Run the server:
   ```bash
   mlld mcp tools.mld.md
   ```
   If `llm/mcp/` exists, `mlld mcp` with no arguments serves every module in that directory.
3. Point your MCP client (Claude Desktop, custom agent, etc.) at the same command and pass any required environment variables.

**Security Note:**
The MCP server uses static analysis (`analyzeModule()`) to discover tools without executing code. Tools are only executed when explicitly called by the MCP client.

Tips:
- Serve a directory or glob: `mlld mcp llm/mcp/` or `mlld mcp "llm/mcp/*.mld.md"`.
- JSON-RPC responses always print to stdout. Logs and warnings stay on stderr, so piping works cleanly.

## Common Patterns

- **Environment overrides**  
  ```bash
  mlld mcp tools.mld.md --env MLLD_GITHUB_TOKEN=ghp_xxx
  ```
  Keys must start with `MLLD_`. Modules read them with `/import { @MLLD_GITHUB_TOKEN } from @input`.

- **Directory defaults**  
  Structure multi-tool projects under `llm/mcp/` so `mlld mcp` “just works” without arguments.

- **Name collisions**  
  If two modules export the same function name, the command prints both source paths and exits. Rename one of the exports or split the modules into separate servers.

## Import MCP Tools

Import MCP tools directly into mlld as executable functions.

```mlld
/import tools { @echo } from mcp "@anthropic/filesystem"
/show @echo("hello")

/import tools from mcp "@github/issues" as @github
/show @github.createIssue("title", "body")
```

Use a command string for external servers:

```mlld
/import tools { @readFile } from mcp "npx @anthropic/mcp-server-filesystem /workspace"
```

Rules:
- `import tools { ... } from mcp "server"` selects specific tools.
- `import tools from mcp "server" as @name` imports all tools under a namespace (alias required).
- Name collisions with existing variables raise errors; use `as @alias` or a namespace.

## Tool Collections

Tool collections define what an agent sees and how tools behave.

```mlld
/exe @readData() = js { return "ok"; }
/exe @deleteData() = js { return "deleted"; }

/var tools @agentTools = {
  safeRead: { mlld: @readData },
  dangerousDelete: {
    mlld: @deleteData,
    labels: ["destructive"],
    description: "Deletes records"
  }
}

/guard @blockDestructive before op:exe = when [
  @mx.op.labels.includes("destructive") => deny "Blocked"
  * => allow
]

/env @agent with { tools: @agentTools } [
  /run cmd { claude -p @task }
]
```

Tool definitions support:
- `labels`: guard and policy signals for operations
- `bind`: pre-fill parameters
- `expose`: limit visible parameters
- `description`: override tool metadata

### Serving Tool Collections

Use `--tools-collection` to serve reshaped tools instead of raw exports:

```mlld
/exe @searchIssues(org: string, repo: string, query: string) = cmd {
  gh issue list -R @org/@repo --search "@query" --json number,title
} with { description: "Search GitHub issues" }

/guard @noSecrets before op:exe = when [
  @input.any.mx.labels.includes("secret") => deny "Secret data cannot flow to tools"
  * => allow
]

/var tools @agentTools = {
  searchIssues: {
    mlld: @searchIssues,
    bind: { org: "mlld-lang", repo: "mlld" },
    expose: ["query"],
    description: "Search mlld issues by keyword"
  }
}

/export { @searchIssues, @agentTools }
```

```bash
mlld mcp tools.mld --tools-collection @agentTools
```

The MCP client sees one tool with one parameter (`query`). The bound `org` and `repo` are invisible. The guard blocks any call carrying `secret`-labeled data.

For Claude Code, point at the server in your MCP config:

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

See `mlld howto pattern-guarded-tool-export` for more examples including operation labels for policy.

## Advanced Usage

- **Config modules**  
  Provide a companion module that exports `@config`:
  ```mlld
  /var @config = {
    tools: ['status'],
    env: { MLLD_PERMISSION_LEVEL: 'read' }
  }
  ```
  Run with:
  ```bash
  mlld mcp llm/mcp/ --config llm/configs/agent.mld.md
  ```
  `config.tools` filters the served tools (snake_case or camelCase both match). `config.env` merges into the process environment after CLI overrides.

- **Manual allow-list**  
  Override everything with `--tools`:
  ```bash
  mlld mcp llm/mcp/ --tools status,create_issue
  ```

- **Multiple modules**  
  ```bash
  mlld mcp "llm/mcp/{github,party}.mld.md"
  ```
  The command merges exports into a single environment so shared helpers remain available during execution.

## Security Tracking

MCP tool invocations carry security tracking to enable guards to detect and control operations originating from LLM requests.

Every MCP tool call applies:
- `taint: ["src:mcp"]` - provenance marker for MCP origin
- `sources: ["mcp:toolName"]` - the specific tool that was invoked

MCP data does not add trust labels automatically; policy rules target `src:mcp` when you need stricter controls.

Guards can inspect these:

```mlld
/guard @blockMcpExec before op:run = when [
  @mx.taint.includes("src:mcp") => deny "Cannot execute MCP-originated data"
  * => allow
]
```

**Zero-arg tools**: Even tools with no parameters (like `getTime()`) carry full security tracking via an invocation-level descriptor.

**Name mapping**: MCP clients use snake_case names (`create_issue`), while `@mx.op.name` shows the mlld camelCase name (`createIssue`).

**Tool outputs**: Results from MCP tool calls carry both `src:mcp` (MCP origin) plus any other taint from the underlying operation (e.g., `src:exec` for command executables).

## Troubleshooting

- **No tools listed**: Ensure the module exports functions with `/export { @name }`, or remove the directive to expose every executable.
- **Tool not found**: Confirm the MCP client calls the snake_case name (`greet_user`), which maps back to `@greetUser`.
- **Environment ignored**: Only `MLLD_`-prefixed variables apply. Anything else is skipped deliberately.
- **Config module skipped**: Export `@config` and run `mlld mcp … --config path.mld.md`. Errors during config evaluation appear on stderr.
- **Client connection issues**: Verify the client runs the same command you use locally and inherits the required environment variables. A quick local check is to pipe JSON requests as shown in the tldr example. 
