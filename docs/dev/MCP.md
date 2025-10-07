# MCP Implementation Notes

## Architecture

```
MCP Client ── JSON-RPC over stdio ── MCPServer ── FunctionRouter ── mlld Interpreter
```

- `MCPServer` reads JSON-RPC requests, enforces initialization, and responds with schemas or tool outputs.
- `FunctionRouter` converts MCP tool calls into `ExecInvocation` nodes and reuses `evaluateExecInvocation` for execution.
- `SchemaGenerator` translates `/exe` signatures into conservative JSON Schema objects (string parameters, all required).
- `serve` command loads modules, merges exported executables into a single environment, applies config/flag filtering, and starts the server.

## Loading Modules

1. Resolve the module path (file, directory, or glob).
2. Interpret each module with `interpret(..., { returnEnvironment: true })`.
3. Collect exported executables from the manifest when available; otherwise fall back to every executable variable.
4. Detect duplicate names before registering functions on the shared environment.
5. Apply config/tool filters (from `--config`, `--tools`) to the exported map.

### Config modules

- `--config <module.mld.md>` loads a module that exports `@config = { tools?: string[], env?: Record<string,string> }`.
- `config.tools` filters the served tools (snake_case names match the MCP tool name; hyphenated names are normalised to underscores).
- `config.env` is merged into `process.env` (only keys with the `MLLD_` prefix are applied) before tool execution.
- CLI `--tools` overrides the config tool list.

### Environment overrides

- `--env KEY=VAL,KEY2=VAL2` applies overrides before config/modules are evaluated. Keys must start with `MLLD_` and are merged into `process.env`.
- The config module sees these overrides via `@input`, and any additional env values exported from `@config.env` are layered on top.
## Testing

- Unit tests cover schema generation, function routing, MCP protocol handling, and CLI wiring (`cli/mcp/*.test.ts`, `cli/commands/serve.test.ts`).
- Integration fixtures sit under `tests/fixtures/mcp/` (add new examples alongside the GitHub sample).
- Use `npx vitest run cli/mcp --runInBand` during development to minimize stdout interference.

## Debugging

- Set `MLLD_DEBUG=true` to trace interpreter activity and confirm argument binding.
- Enable `DEBUG_MCP=1` before running `mlld serve` to add server-side diagnostics without touching stdout.
- Inspect duplicate-name failures via the stderr log produced by `serve` before the process exits.
