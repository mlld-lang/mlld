# Job: Package and Share Agent Configuration

## Scenario

I've configured Claude Code with specific tools, MCPs, and permissions for my project. I want to:

1. Package this configuration as a reusable module
2. Share it with my team
3. Allow variations (e.g., "readonly" vs "full" profiles)
4. Keep credentials secure (not in the package)

## Success Criteria

- Working environment module with @spawn, @shell exports
- Profile system that adapts to policy restrictions
- Credential flow via policy.auth (not hardcoded)
- Can import and use the environment from another script

## Key Atoms Needed

- env-overview
- env-config
- policy-auth
- policy-composition
- modules-exporting

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
