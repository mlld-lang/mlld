# Job: MCP Tools and Security Integration

## Scenario

I want to give my agent access to MCP tools (GitHub, Slack, etc.) but ensure mlld provides security controls:

1. All tool outputs get tainted automatically (src:mcp)
2. Guards can inspect/block/transform data before it reaches MCP tools
3. Policy controls what data can flow to MCP tools
4. MCP tool availability adapts to environment profiles

**Design Note:** MCP integration works through environment modules that export an `@mcpConfig()` function. This function adapts to the active profile (full/readonly/etc.) and returns MCP server configurations. There is no `import tools from mcp` syntax - MCP tools are accessed through the standard MCP protocol configured via environment.

## Key Atoms Needed

- mcp-security (src:mcp auto-taint on outputs)
- mcp-policy (label flow rules for MCP data)
- mcp-guards (before/after guards for data flowing to MCP)
- env-config (how environment modules configure MCP)

## Relevant Spec Sections

- Part 6: MCP Integration
- Part 5: Environments (The Unifying Primitive)
- Part 1: Labels (The Foundation)
- Part 3: Policy (Declarative Controls)
- Part 4: Guards (Expressive Controls)

## Success Criteria

### Phase 1: Documentation

All atoms written with working, validated mlld examples:

- [ ] mcp-security atom - explains automatic src:mcp tainting on tool outputs
- [ ] mcp-policy atom - explains policy rules for MCP data (what can flow where)
- [ ] mcp-guards atom - explains `guard before src:mcp` syntax for filtering data to MCP
- [ ] env-config atom - explains @mcpConfig() function in environment modules

Each atom should be 100-200 words with at least one working code example that passes `mlld validate`.

### Phase 2: Implementation

Create working MCP security demonstration:

- [ ] Environment module with @mcpConfig() that adapts to profiles
- [ ] Show that tool outputs have src:mcp taint automatically
- [ ] Show guard blocking secret data from reaching MCP tools
- [ ] Show policy restricting what src:mcp data can do
- [ ] Demonstrate profile-based MCP tool availability (full vs readonly)

### Phase 3: Verification & Remediation

- [ ] Run the target example code end-to-end
- [ ] Verify @mcpConfig() function works with profile selection
- [ ] Verify automatic tainting works (`@result.mx.taint` includes "src:mcp")
- [ ] Verify guards on src:mcp data trigger correctly
- [ ] Verify secret data is blocked from flowing to MCP tool inputs
- [ ] Identify any gaps in mlld (e.g., MCP integration incomplete, taint not applied)
- [ ] Create friction tickets for gaps; fix or escalate as needed
- [ ] Re-verify after fixes

### Exit Criteria

All phases complete. The target example successfully configures MCP via environment, demonstrates automatic tainting of outputs, and blocks secrets from flowing to MCP tool inputs.

## Example Code (Target)

```mlld
>> myproject-env/index.mld - Environment module with MCP configuration

profiles {
  full: {
    requires: { network },
    description: "Full access with GitHub integration"
  },
  readonly: {
    requires: { },
    description: "Read-only, no external tools"
  }
}

>> MCP configuration adapts to active profile
exe @mcpConfig() = when [
  @mx.profile == "full" => {
    servers: [
      {
        module: "@github/issues",
        tools: "*"
      }
    ]
  },
  @mx.profile == "readonly" => {
    servers: []  # No MCP tools in readonly mode
  },
  * => { servers: [] }
]

policy @config = {
  auth: {
    github: { from: "keychain:mlld-env-{projectname}/github", as: "GITHUB_TOKEN" }
  },
  labels: {
    secret: {
      deny: ["net:w"]  # Secrets can't flow to network operations
    },
    "src:mcp": {
      deny: ["op:cmd:git:push", "destructive"]  # MCP data can't push or delete
    }
  }
}

exe @spawn(prompt) = run cmd { claude -p "@prompt" } using auth:github
exe @shell() = run cmd { claude } using auth:github

export { @spawn, @shell, @mcpConfig }
```

Usage in a script:

```mlld
>> my-script.mld - Using the environment with MCP tools

import { @spawn } from "@local/myproject-env"

>> MCP tools are available to the spawned agent based on profile
>> Agent's MCP calls get src:mcp taint automatically
var @result = @spawn("List open issues in repo mlld-lang/mlld")

>> The result has src:mcp taint
show @result.mx.taint  >> includes "src:mcp"

>> Policy blocks MCP data from flowing to destructive operations
exe destructive @deleteFile(path) = run cmd { rm -rf "@path" }

>> This would be BLOCKED by policy: src:mcp → destructive
@deleteFile(@result.somePath)
>> Error: Label 'untrusted' cannot flow to 'destructive'
>> (src:mcp is classified as untrusted by default)

>> Guards can filter data before it reaches MCP tools
guard before net:w = when [
  @input.mx.taint.includes("secret") => deny "No secrets to network operations"
  * => allow
]

var secret @apiKey = "sk-12345"

>> If MCP tool is labeled net:w, this would be blocked
exe net:w @createIssue(title) = @spawn("Create issue: @title")
@createIssue(@apiKey)  # BLOCKED by guard
```

## Key Differences from Initial Expectation

1. **No `import tools from mcp` syntax** - MCP is configured via `@mcpConfig()` in environment modules
2. **No `op:mcp` label** - Use `src:mcp` source label for filtering MCP outputs
3. **Guards filter on `src:mcp`** - not `op:mcp`: `guard before net:w` checks inputs for secrets before network ops
4. **Profile-based availability** - MCP tools are enabled/disabled based on environment profile, not direct policy control
5. **Two-phase security**:
   - **Outbound** (data TO MCP): Guards and policy check inputs before network operations
   - **Inbound** (data FROM MCP): Automatic `src:mcp` tainting + policy rules restrict what that data can do

## Why This Design

- **Environment-mediated** - MCP availability is an environment property, not a language feature
- **Profile-adaptive** - Same environment module, different tool sets based on security context
- **Composable** - Policy from multiple sources can restrict MCP data flows
- **Source-based filtering** - `src:mcp` as a provenance label allows fine-grained control of external data
