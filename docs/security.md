# Security Features in mlld

mlld includes a comprehensive security system designed to protect users from malicious code while maintaining usability. This document describes all security features available to users.

## Overview

mlld's security is built on several key principles:

- **Trust but verify**: Operations require explicit approval before execution
- **Fine-grained control**: Different trust levels for different scenarios  
- **Persistent decisions**: Approved operations are remembered to reduce friction
- **Content integrity**: Imports are validated to detect tampering
- **Audit trail**: All security decisions are logged for review

## Trust Levels and TTL

Every mlld directive can specify trust levels and time-to-live (TTL) options to control security behavior.

### Trust Levels

**`trust always`** - Execute without prompting (highest trust)
```mlld
@run trust always [echo "Safe command"]
@import trust always { config } from "./config.mld"
@path trust always safePath = "./data/safe.txt"
```

**`trust verify`** - Prompt user for approval (default)
```mlld
@run trust verify [npm install]
@import trust verify { utils } from "https://example.com/utils.mld"
```

**`trust never`** - Block execution completely
```mlld
@run trust never [rm -rf /]  # Will never execute
@import trust never { * } from "https://evil.com/malware.mld"
```

### TTL (Time-To-Live)

Control how long security decisions remain valid:

**Duration-based TTL:**
```mlld
@run ttl 24h [npm test]           # Trust for 24 hours
@import ttl 7d { * } from "./lib" # Trust for 7 days  
@path ttl 1w dataPath = "./data"  # Trust for 1 week
```

**Special TTL values:**
```mlld
@run ttl live [git status]    # Always fetch fresh (no caching)
@import ttl static { config } from "./config.mld"  # Cache forever
```

**TTL units:**
- `s`, `sec`, `second`, `seconds`
- `m`, `min`, `minute`, `minutes`  
- `h`, `hr`, `hour`, `hours`
- `d`, `day`, `days`
- `w`, `week`, `weeks`

### Combining Trust and TTL

```mlld
@run trust verify ttl 12h [docker build .]
@import trust always ttl 30d { stdlib } from "@mlld/stdlib"
@path trust verify ttl 1d outputDir = "./output"
```

## Command Security

### Allowed Operations

Most shell commands are permitted, including:
```mlld
@run [echo "Hello world"]
@run [ls -la | grep test]
@run [npm install package]
@run [git commit -m "message"]
```

### Blocked Operations

Dangerous shell operators are blocked at parse time:
```mlld
❌ @run [echo "test" && echo "test2"]  # AND operator
❌ @run [echo "test" || echo "test2"]  # OR operator  
❌ @run [echo "test"; echo "test2"]    # Semicolon
❌ @run [echo "test" > file.txt]       # Redirect
❌ @run [echo "test" & ]               # Background
```

**Use mlld alternatives instead:**
```mlld
✅ @run [echo "test"]
✅ @run [echo "test2"]

✅ @when @condition => @run [echo "conditional"]

✅ @output file "file.txt" @run [echo "test"]
```

### Security Approval Flow

When a command requires approval, you'll see:

```
🔒 Security: Command requires approval
   Command: npm install express
   Risks detected:
   - NETWORK_ACCESS: Command may access network
   - PACKAGE_INSTALL: Installing new dependencies

   Allow this command?
   [y] Yes, this time only
   [a] Always allow this exact command  
   [p] Allow pattern (base command)
   [t] Allow for time duration...
   [n] Never (block)

   Choice: 
```

**Approval options:**
- **y** - Execute once, don't save decision
- **a** - Always allow this exact command
- **p** - Allow the base command pattern (e.g., all `npm install` commands)
- **t** - Allow for a specified time duration
- **n** - Block and remember this decision

## Import Security

### URL Import Approval

Remote imports require security approval:

```mlld
@import { utils } from "https://raw.githubusercontent.com/example/repo/main/utils.mld"
```

Approval prompt:
```
🔒 Security: Import requires approval
   URL: https://raw.githubusercontent.com/example/repo/main/utils.mld
   Content hash: sha256:abc123...

   Allow this import?
   [y] Yes, this time only
   [a] Always allow this URL
   [t] Allow for time duration...
   [n] Never (block)
```

### Content Integrity

Import approvals include content hashing:
- Content is hashed when first approved
- Future imports are validated against the original hash
- Changed content triggers re-approval
- Protects against supply chain attacks

### Registry Modules

mlld registry modules have built-in security:

```mlld
@import { http } from @mlld/stdlib  # Official registry
@import { utils } from @company/internal  # Private registry
```

Registry modules include:
- Cryptographic signatures
- Version pinning
- Security advisories
- Hash verification

## Path Security

### File Access Control

Path access can be controlled:

```mlld
@path trust verify configFile = "~/.secret/config.json"
@path trust always logDir = "./logs"
@path trust never systemDir = "/etc"
```

### Path Approval

When path access requires approval:

```
🔒 Security: Path access requires approval
   Path: ~/.secret/config.json
   Operation: read

   Allow this path access?
   [y] Yes, this session only
   [a] Always allow this path
   [t] Allow for time duration...
   [n] Never (block)
```

## Lock Files and Persistence

### Project Lock File (`mlld.lock.json`)

Security decisions are automatically saved:

```json
{
  "version": "1.0.0",
  "security": {
    "approvedCommands": {
      "npm test": {
        "trust": "always",
        "approvedAt": "2024-01-15T10:30:00Z",
        "approvedBy": "username"
      }
    },
    "approvedUrls": {
      "https://example.com/module.mld": {
        "trust": "always", 
        "contentHash": "sha256:abc123...",
        "expiresAt": "2024-01-22T10:30:00Z"
      }
    },
    "approvedPaths": {
      "./data:read": {
        "trust": "always",
        "approvedAt": "2024-01-15T10:30:00Z"
      }
    }
  }
}
```

### Global Lock File

User-wide security settings stored in `~/.config/mlld/mlld.lock.json`:

```json
{
  "security": {
    "trustedDomains": [
      "github.com",
      "raw.githubusercontent.com"
    ],
    "approvedCommands": {
      "git status": {
        "trust": "always",
        "approvedAt": "2024-01-15T10:30:00Z"
      }
    }
  }
}
```

### Benefits of Persistence

- **Reduced friction**: No repeated prompts for same operations
- **Audit trail**: Track what was approved when
- **Team sharing**: Project lock files can be version controlled
- **Expiry handling**: Time-based approvals automatically expire

## Security Configuration

### Environment Variables

Control security behavior:

```bash
export MLLD_SECURITY_ENABLED=true     # Enable/disable security (default: true)
export MLLD_AUTO_APPROVE=false        # Auto-approve in CI (default: false) 
export MLLD_AUDIT_LOG=~/.mlld/audit.log  # Audit log location
```

### Policy Configuration

Policies can be configured in lock files:

```json
{
  "security": {
    "policies": {
      "commands": {
        "allowNetworkAccess": false,
        "allowFileSystem": true,
        "blockedPatterns": ["rm -rf", "sudo"]
      },
      "imports": {
        "allowedDomains": ["github.com", "company.internal"],
        "requireSignatures": true
      }
    }
  }
}
```

## CLI Commands

### Security Status

```bash
mlld security status                 # Show security configuration
mlld security audit                  # Show security decisions
mlld security clean                  # Clear expired approvals
```

### Lock File Management

```bash
mlld lock status                     # Show lock file status
mlld lock verify                     # Verify content integrity
mlld lock clean                      # Remove expired entries
```

## Best Practices

### For Users

1. **Review prompts carefully**: Don't automatically approve everything
2. **Use specific trust levels**: Prefer `verify` over `always` when unsure
3. **Set appropriate TTLs**: Don't approve indefinitely unless necessary
4. **Regular audits**: Review `mlld security audit` output periodically
5. **Version control lock files**: Include project lock files in git

### For Team Workflows

1. **Shared project policies**: Version control `mlld.lock.json`
2. **CI/CD configuration**: Use `MLLD_AUTO_APPROVE=true` carefully
3. **Security reviews**: Include security approvals in code reviews
4. **Regular updates**: Keep mlld and security policies updated
5. **Incident response**: Know how to revoke approvals quickly

## Troubleshooting

### Common Issues

**"Command requires approval" in CI:**
```bash
# Option 1: Pre-approve in lock file
mlld security approve "npm test" --trust=always

# Option 2: Set environment variable (less secure)
export MLLD_AUTO_APPROVE=true
```

**"Import not approved" error:**
```bash
# Check import status
mlld security audit --imports

# Clear and re-approve
mlld security clear --url="https://example.com/module.mld"
```

**"Path access denied":**
```bash
# Check path approvals
mlld security audit --paths

# Approve specific path
mlld security approve-path "./data" --operation=read --trust=always
```

### Security Violations

If you encounter unexpected security prompts:

1. **Verify the operation**: Is this something you intended to do?
2. **Check for malware**: Unexpected network requests might indicate compromise
3. **Review recent changes**: Did someone modify your mlld files?
4. **Audit history**: Use `mlld security audit` to see what changed

## Security Model Limitations

### What mlld Security Protects Against

- ✅ Accidental execution of dangerous commands
- ✅ Malicious mlld files from untrusted sources  
- ✅ Supply chain attacks on imports
- ✅ Unauthorized file system access
- ✅ Network requests to unexpected domains

### What mlld Security Does NOT Protect Against

- ❌ Vulnerabilities in approved commands/tools
- ❌ Social engineering attacks
- ❌ System-level malware
- ❌ Physical access to the machine
- ❌ Compromised user accounts

### Additional Security Measures

For production environments, consider:

- **Sandboxing**: Run mlld in containers or VMs
- **Network isolation**: Restrict network access
- **File system permissions**: Use least privilege access
- **Code signing**: Verify mlld file signatures
- **Regular audits**: Monitor security logs

## Migration from Legacy Security

If upgrading from older mlld versions:

1. **Review existing patterns**: Old shell restrictions still apply
2. **Update syntax**: Add trust/TTL annotations to existing directives
3. **Initial approval**: First run may require many approvals
4. **Lock file creation**: New lock files will be created automatically
5. **Team coordination**: Share updated lock files with team

## Getting Help

For security-related issues:

- **Documentation**: This file and `docs/dev/SECURITY.md`
- **CLI help**: `mlld security --help`
- **Issues**: Report security bugs privately to maintainers
- **Community**: Ask questions in discussions (non-sensitive only)

Remember: When in doubt about security, err on the side of caution and use more restrictive settings.