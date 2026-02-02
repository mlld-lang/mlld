# Job: Sandbox an Agent

## Scenario

I want to run Claude Code (or similar) with restricted capabilities:

1. Only certain tools available (Read, Write, not Bash)
2. Only certain MCP servers connected
3. Filesystem access limited to specific directories
4. Network access limited or disabled
5. Credentials injected securely (not visible to agent as strings)

## Key Atoms Needed

- env-overview (shared with package-env job)
- env-config (shared with package-env job)
- env-blocks (running code within an environment)
- policy-auth (shared with package-env job)
- policy-capabilities (restricting tools, fs, network)

## Relevant Spec Sections

- Part 5: Environments (The Unifying Primitive)
- Part 7: Environment Providers (Isolation - Part 7: Environment Providers State)
- Part 2: Capability Enforcement
- Part 3: Policy (Declarative Controls)

## Success Criteria

### Phase 1: Documentation

All atoms written with working, validated mlld examples:

- [ ] env-overview atom - explains environments and their security role
- [ ] env-config atom - explains environment configuration syntax
- [ ] env-blocks atom - explains `env @config [ ... ]` block syntax
- [ ] policy-auth atom - explains credential injection via `using auth:*`
- [ ] policy-capabilities atom - explains restricting tools, filesystem, network

Note: env-overview, env-config, and policy-auth may be written as part of package-env job. Verify they exist before duplicating.

Each atom should be 100-200 words with at least one working code example that passes `mlld validate`.

### Phase 2: Implementation

Create working sandbox demonstration:

- [ ] Sandbox config restricting tools to Read/Write only (no Bash)
- [ ] Sandbox config limiting filesystem access to specific directories
- [ ] Sandbox config disabling or limiting network access
- [ ] Sandbox config with no MCP servers
- [ ] Demonstrate credential injection that agent cannot read as string

### Phase 3: Verification & Remediation

- [ ] Run the target example code end-to-end
- [ ] Verify `env @config [ ... ]` block syntax works
- [ ] Verify tool restrictions are enforced (agent cannot use Bash)
- [ ] Verify filesystem limits are enforced
- [ ] Verify network limits are enforced
- [ ] Verify credentials are injected but not readable
- [ ] Identify any gaps in mlld (e.g., missing env provider, unenforced limits)
- [ ] Create friction tickets for gaps; fix or escalate as needed
- [ ] Re-verify after fixes

### Exit Criteria

All phases complete. The target example successfully spawns an agent that is restricted to Read/Write tools, limited filesystem, no network, and has credentials injected securely.

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
