# Job: Sandbox an Agent

## Scenario

I want to run Claude Code (or similar) with restricted capabilities:

1. Only certain tools available (Read, Write, not Bash)
2. Only certain MCP servers connected
3. Filesystem access limited to specific directories
4. Network access limited or disabled
5. Credentials injected securely (not visible to agent as strings)

## Success Criteria

- Working mlld code that spawns a sandboxed agent
- Clear docs on environment configuration
- Example of restricting tools/MCPs
- Example of filesystem/network limits
- Example of credential injection via `using auth:*`

## Key Atoms Needed

- env-overview
- env-config
- env-blocks
- policy-auth
- policy-capabilities

## Example Code (Target)

```mlld
var @sandbox = {
  provider: "@mlld/env-docker",
  fs: { read: [".:/app"], write: ["/tmp"] },
  net: "none",
  tools: ["Read", "Write"],
  mcps: []
}

env @sandbox [
  run cmd { claude -p "Analyze the code in /app" } using auth:claude
]
```
