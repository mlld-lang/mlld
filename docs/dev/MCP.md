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
2. Interpret each module with `interpret(..., { captureEnvironment })`.
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

- Unit tests cover schema generation, function routing, MCP protocol handling, and CLI wiring (`cli/mcp/*.test.ts`, `cli/commands/mcp.test.ts`).
- Integration fixtures sit under `tests/fixtures/mcp/` (add new examples alongside the GitHub sample).
- Use `npx vitest run cli/mcp --runInBand` during development to minimize stdout interference.

## Debugging

- Set `MLLD_DEBUG=true` to trace interpreter activity and confirm argument binding.
- Enable `DEBUG_MCP=1` before running `mlld mcp` to add server-side diagnostics without touching stdout.
- Inspect duplicate-name failures via the stderr log produced by `serve` before the process exits.
---
updated: 2025-10-08
tags: #arch, #cli, #mcp
related-docs: docs/dev/DATA.md, docs/dev/PIPELINE.md, docs/user/mcp.md
related-code: cli/commands/mcp.ts, cli/mcp/*.ts
related-types: core/types { ExecutableVariable, StructuredValue }
---

# MCP Implementation

## tldr

Expose exported `/exe` functions as Model Context Protocol tools without inventing a second execution path. The CLI command loads one or more modules, builds a shared environment, and serves JSON-RPC requests over stdio while preserving structured-value semantics.

## Principles

- Reuse interpreter primitives: build real `ExecInvocation` nodes and call `evaluateExecInvocation`.
- Preserve structured outputs: always emit the `.text` view while keeping StructuredValue metadata intact.
- Keep stdout clean: JSON-RPC responses go to stdout, diagnostics stay on stderr.
- Fail fast on conflicts: detect duplicate tool names before starting the server.
- Gate environment changes: only apply overrides with the `MLLD_` prefix.

## Details

### Command entrypoint

- `cli/commands/mcp.ts` parses paths, flags, and optional config modules.
- Default path resolution picks `llm/mcp/` when no argument is provided and the directory exists.
- `--env KEY=VAL,…` sets prefixed environment variables before module interpretation; `--tools` apply after config filtering.
- Duplicate tools across loaded modules halt the command with a descriptive stderr message.

### Module loading

- `resolveModulePaths()` expands files, directories, or globs into absolute module paths.
- Each module runs through `interpret(..., { captureEnvironment })` so we capture an `Environment` and export manifest snapshot.
- `/export` directives drive the primary tool list; if absent, the command falls back to all non-builtin executables in the environment.
- Captured module environments attach to each executable to keep `/import` state available during invocation.

### Schema generation

- `SchemaGenerator.generateToolSchema` converts mlld names to snake_case and produces conservative JSON Schema definitions (all-string parameters, all required).
- Schema output mirrors what MCP clients expect for `tools/list`.
- Tests live in `cli/mcp/SchemaGenerator.test.ts`.

### Tool execution

- `MCPServer` manages the JSON-RPC lifecycle (`initialize`, `tools/list`, `tools/call`) and enforces initialization before serving tools.
- `FunctionRouter` converts tool calls into synthetic AST nodes, feeds them to `evaluateExecInvocation`, and serializes results with `asText` so StructuredValue wrapping remains intact.
- Errors thrown during execution become `isError` responses with text content only; protocol errors surface via MCP error codes.

### Configuration modules

- `--config module.mld.md` loads a module that exports `@config = { tools?, env? }`.
- `config.tools` filters the exported map unless `--tools` is provided.
- `config.env` applies after CLI overrides; both layers ignore keys without the `MLLD_` prefix.

## Gotchas

- Forgetting the `MLLD_` prefix means overrides are silently skipped.
- StructuredValue results must flow back as strings; bypassing `asText` leads to JSON blobs in client responses.
- Config modules execute with the same environment as regular tools—runtime failures there abort startup.

## Debugging

- `DEBUG_MCP=1` prints server-side diagnostics to stderr without polluting stdout.
- `MLLD_DEBUG=true` exposes interpreter logging for argument binding and execution flow.
- Unit coverage: `cli/mcp/*.test.ts`, `cli/commands/mcp.test.ts`; run with `npx vitest run cli/mcp`.
- Capture stderr when diagnosing duplicate-name exits or config load failures.
