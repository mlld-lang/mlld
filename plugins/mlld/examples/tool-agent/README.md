# Tool Agent Example

Demonstrates exposing mlld functions as MCP tools with scoped access.

## What This Shows

**`llm/mcp/toolkit.mld`** — Full project toolkit:
- 5 `exe` functions (status, search, add/list/delete notes)
- `var tools @toolkit` collection with `bind` (project root hidden from caller) and `expose` (only query params visible)
- `labels: ["destructive"]` on delete, with a guard that blocks destructive operations
- Everything exported for MCP serving

**`llm/mcp/readonly.mld`** — Reshaped read-only subset:
- Imports only safe functions from toolkit.mld
- Creates a narrower `var tools @readonlyTools` collection
- Demonstrates reshaping: same functions, smaller surface area

**`agent-config.json`** — MCP client configuration:
- Full toolkit: `mlld mcp llm/mcp/toolkit.mld --tools-collection @toolkit`
- Read-only variant: `mlld mcp llm/mcp/readonly.mld --tools-collection @readonlyTools`
- Environment variables for project root binding

## Running

```bash
# Serve the full toolkit
mlld mcp llm/mcp/toolkit.mld --tools-collection @toolkit --env MLLD_PROJECT_ROOT=/path/to/project

# Serve read-only subset
mlld mcp llm/mcp/readonly.mld --tools-collection @readonlyTools --env MLLD_PROJECT_ROOT=/path/to/project

# Test with JSON-RPC
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | mlld mcp llm/mcp/toolkit.mld --tools-collection @toolkit
```

## Key Patterns

- **bind**: Pre-fills parameters the caller shouldn't control (project root, credentials, org names)
- **expose**: Explicitly lists which parameters the caller can set
- **labels + guards**: Mark sensitive operations and enforce access policy
- **Reshaping**: Import from a broad toolkit, re-export a narrower view for specific agents
