# Job: Package and Share Agent Configuration

## Scenario

I've configured Claude Code with specific tools, MCPs, and permissions for my project. I want to:

1. Package this configuration as a reusable module
2. Share it with my team
3. Allow variations (e.g., "readonly" vs "full" profiles)
4. Keep credentials secure (not in the package)

## Key Atoms Needed

- env-overview (what environments are, why they matter)
- env-config (configuring environment settings)
- policy-auth (credential management, keychain integration)
- policy-composition (combining policies, profiles)
- modules-exporting (sharing executables - may exist in core docs)

## Relevant Spec Sections

- Part 5: Environments (The Unifying Primitive)
- Part 3: Policy (Declarative Controls)
- Part 8: Composition
- Part 11: Configuration

## Success Criteria

### Phase 1: Documentation

All atoms written with working, validated mlld examples:

- [ ] env-overview atom - explains what environments are and their role in security
- [ ] env-config atom - explains environment configuration syntax
- [ ] policy-auth atom - explains credential management (`auth:` blocks, keychain)
- [ ] policy-composition atom - explains combining policies and capability profiles
- [ ] modules-exporting atom - explains exporting executables (check if exists in core docs first)

Each atom should be 100-200 words with at least one working code example that passes `mlld validate`.

### Phase 2: Implementation

Create a working reusable environment module:

- [ ] Module that exports @spawn and @shell executables
- [ ] Profile system with at least "full" and "readonly" variants
- [ ] Credential flow using policy.auth (not hardcoded values)
- [ ] Demonstrate importing and using the module from another script

The module should be placed in a location that demonstrates the sharing workflow.

### Phase 3: Verification & Remediation

- [ ] Run the target example code end-to-end
- [ ] Verify the `profiles { }` syntax works (or document alternative)
- [ ] Verify `policy @config = { auth: { } }` syntax works
- [ ] Verify `using auth:name` syntax works in commands
- [ ] Identify any gaps in mlld that prevent the example from working
- [ ] Create friction tickets for gaps; fix or escalate as needed
- [ ] Re-verify after fixes

### Exit Criteria

All phases complete. A user can create a packaged environment module and another user can import and use it with proper credential handling.

## Example Code (Target)

```mlld
>> @alice/claude-dev/index.mld

profiles {
  full: { requires: { sh, network } },
  readonly: { requires: { } }
}

policy @config = {
  auth: {
    claude: { from: "keychain:mlld-env-myproject/claude", as: "CLAUDE_CODE_OAUTH_TOKEN" }
  }
}

exe @spawn(prompt) = run cmd { claude -p "@prompt" } using auth:claude
exe @shell() = run cmd { claude } using auth:claude

export { @spawn, @shell }
```

Usage:
```mlld
import { @spawn } from "@alice/claude-dev"
var @result = @spawn("Fix the bug in auth.ts")
```
