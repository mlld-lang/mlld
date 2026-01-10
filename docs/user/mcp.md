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

## Troubleshooting

- **No tools listed**: Ensure the module exports functions with `/export { @name }`, or remove the directive to expose every executable.
- **Tool not found**: Confirm the MCP client calls the snake_case name (`greet_user`), which maps back to `@greetUser`.
- **Environment ignored**: Only `MLLD_`-prefixed variables apply. Anything else is skipped deliberately.
- **Config module skipped**: Export `@config` and run `mlld mcp … --config path.mld.md`. Errors during config evaluation appear on stderr.
- **Client connection issues**: Verify the client runs the same command you use locally and inherits the required environment variables. A quick local check is to pipe JSON requests as shown in the tldr example. 
