Requires MLLD_LIVE=1 to run. Spawns mlld MCP server as subprocess.

This test must be run from the repo root because it spawns an MCP subprocess
that needs to find the module file on the real filesystem:

  mlld tests/cases/security/mcp-served-input-no-src-mcp-taint-live/example.mld

The fixture test runner uses a virtual filesystem which prevents the MCP
subprocess from resolving the module path.
