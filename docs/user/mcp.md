# MCP Server Support

`mlld mcp` exposes exported `/exe` functions as Model Context Protocol tools. The command parses one or more modules, gathers exported functions, and starts a JSON-RPC server on stdio so MCP clients can discover and call those functions.

- Without arguments it looks for `llm/mcp/` in the current project.
- You can point it at an individual file, a directory, or a glob.
- Additional flags (`--config`, `--env`, `--tools`) let you tailor which tools are exposed and which environment variables are available at runtime.

## Quick Start

1. Export executable functions from a module:
   ```mlld
   /exe @greet(name) = js {
     return `Hello ${name}`;
   }

   /export { @greet }
   ```
2. Start the server:
   ```bash
   mlld mcp tools.mld.md
   ```
   (If `llm/mcp/` exists, `mlld mcp` with no arguments will use it automatically.)
3. Configure the MCP client (Claude Desktop, etc.) to run `mlld mcp` with the module path and any required environment variables.

## Command Overview

- `mlld mcp [path]` accepts a file, directory, or glob pattern. If no path is supplied and `llm/mcp/` exists, that directory is used.
- Only exported executables appear as MCP tools. If a module lacks `/export`, the command exports every executable defined in that module.
- Duplicate function names across modules trigger an error that references both module paths.
- All logging uses `stderr`; JSON-RPC responses stream to `stdout`.
- `--config <module.mld.md>` loads a configuration module that exports `@config = { tools, env }` to filter tools and inject additional environment variables (keys must begin with `MLLD_`).
- `--env KEY=VAL,KEY2=VAL2` overrides environment variables prior to loading modules (keys must begin with `MLLD_`).
- `--tools tool1,tool2` explicitly allow-lists tools (matching either the mlld name or the snake_case MCP name). This override takes precedence over the config module.

## Environment and Inputs

- Modules keep access to `/import { @VAR } from @input`, so CLI callers can pass API keys or configuration through the process environment. Custom variables must use the `MLLD_` prefix (for example `MLLD_PERMISSION_LEVEL`).
- Mixed module batches can import from the same environment; each `/exe` retains its captured module context, including variables supplied by `--env` or a config module.

## Troubleshooting

- **No tools listed**: Confirm the module exports functions with `/export { @name }` or remove the export directive to expose all executables.
- **Conflicting names**: Rename one of the functions or split modules into separate server instances.
- **Config module ignored**: Ensure it exports `@config` and that any environment variables in `config.env` start with `MLLD_`.
- **Client connection issues**: Verify the MCP client points to the `mlld` binary and passes the same arguments you use locally.
