# Job: Sandbox an Agent

## Scenario

I want to run Claude Code (or similar) with restricted capabilities:

1. Only certain tools available (Read, Write, not Bash)
2. Only certain MCP servers connected
3. Filesystem access limited to specific directories
4. Network access limited or disabled
5. Credentials injected securely (not visible to agent as strings)

## Design Constraints

**Understanding Enforcement Layers:**

1. **Tool restrictions** - The `tools: ["Read", "Write"]` field in environment config is passed to Claude Code as configuration. Whether mlld enforces this or relies on the agent to respect it needs clarification in the spec.

2. **Command capabilities** - Blocking shell access (`sh`, `bash`) is enforced via `policy.capabilities.deny: ["sh"]`, which mlld enforces with runtime guards. This is separate from tool restrictions.

3. **Filesystem/network** - With Docker provider, `fs` and `net` restrictions are enforced by Docker (container mounts, network modes). mlld trusts the provider to enforce these OS-level restrictions.

4. **Credentials** - The `using auth:*` syntax provides a **structural guarantee**: credentials flow from keychain → env var without ever becoming interpolatable variables. This isn't a runtime check - it's impossible to interpolate what doesn't exist as a variable.

**Phase 3 should clarify:**
- Which restrictions are enforced by mlld (policy capabilities)
- Which are enforced by provider (filesystem, network)
- Which are configuration hints passed to agents (tools field)

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

### Phase 4: Adversarial Verification

Red team testing to PROVE restrictions work (not just that they look correct):

- [ ] Artifact runs end-to-end without error (`mlld sandbox-demo.mld` succeeds)
- [ ] **Shell access BLOCKED** (mlld-enforced): Test `run sh { ... }` inside env with `policy.capabilities.deny: ["sh"]`, verify mlld blocks it
- [ ] **Command restrictions BLOCKED** (mlld-enforced): Test commands not in `allow` list, verify policy guards block them
- [ ] **Filesystem limits BLOCKED** (provider-enforced): Test write outside mounted paths with Docker, verify container enforcement works
- [ ] **Network disabled** (provider-enforced): Test network request with `net: "none"`, verify Docker container has no network
- [ ] **Credential protection** (structural): Verify credentials flow via `using auth:*` and cannot be accessed as variables (not a runtime block - structural impossibility)

Each test must include:
- The exact mlld code run
- The expected behavior (should be blocked or unavailable)
- The actual output (proving enforcement)
- Which layer enforces it (mlld policy, provider, or structural)

### Exit Criteria

All FOUR phases complete. Adversarial verification has PROVEN (with execution evidence) that:

1. The artifact runs without error
2. Tool restrictions block unauthorized tools (attempted and failed)
3. Filesystem limits block writes outside allowed paths (attempted and failed)
4. Network restrictions block requests when disabled (attempted and failed)
5. Credentials flow to env vars but cannot be displayed or interpolated (attempted and failed)

"Looks correct" is NOT sufficient. Each claim must have a documented test showing the restriction was ENFORCED.

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
