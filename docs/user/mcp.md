# MCP Server Support

`mlld serve` exposes exported `/exe` functions as Model Context Protocol tools. The command parses one or more modules, gathers exported functions, and starts a JSON-RPC server on stdio so MCP clients can discover and call those functions.

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
   mlld serve tools.mld.md
   ```
3. Configure the MCP client (Claude Desktop, etc.) to run `mlld serve` with the module path and any required environment variables.

## Command Overview

- `mlld serve <path>` accepts a file, directory, or glob pattern. Directories are scanned for `*.mld` and `*.mld.md` files.
- Only exported executables appear as MCP tools. If a module lacks `/export`, the command exports every executable defined in that module.
- Duplicate function names across modules trigger an error that references both module paths.
- All logging uses `stderr`; JSON-RPC responses stream to `stdout`.

## Environment and Inputs

- Modules keep access to `/import { @VAR } from @input`, so CLI callers can pass API keys or configuration through the process environment.
- Mixed module batches can import from the same environment; each `/exe` retains its captured module context.

## Troubleshooting

- **No tools listed**: Confirm the module exports functions with `/export { @name }` or remove the export directive to expose all executables.
- **Conflicting names**: Rename one of the functions or split modules into separate server instances.
- **Client connection issues**: Verify the MCP client points to the `mlld` binary and passes the same arguments you use locally.
