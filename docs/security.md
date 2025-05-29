# Security in Mlld

Mlld includes comprehensive security features to protect you from malicious code while maintaining the flexibility needed for legitimate automation tasks.

## Overview

Mlld's security system protects against:
- 🚫 Malicious command execution
- 🔒 Unauthorized file access
- 🤖 LLM-generated attack code
- 📦 Compromised imports
- 🔍 Data exfiltration attempts

## Import Security

### How Import Approval Works

When you import from a URL or registry, mlld shows you what you're importing:

```meld
@import { analyzer } from "mlld://registry/tools/code-analyzer"
```

You'll see:
```
⚠️  Import requires approval:
   mlld://registry/tools/code-analyzer

Fetching content...
✓ Resolved to: mlld://gist/alice/abc123

[Preview of first 20 lines]
@text greeting = "Code Analyzer v1.0"
@run [npm install -g eslint]
...

This import contains:
- 3 variable definitions
- 2 run commands

Allow this import? [y/N]: 
```

### Registry Imports

The mlld registry provides human-friendly names for trusted modules:

```meld
# Instead of remembering gist IDs:
@import { reviewer } from "mlld://gist/anthropics/f4d3c2b1a9e8"

# Use friendly names:
@import { reviewer } from "mlld://registry/prompts/code-review"
```

### Security Advisories

If a module has known security issues, you'll be warned:

```
⚠️  Security Advisories Found:
   Import: mlld://registry/utils/file-scanner

   🟡 HIGH: MLLD-2024-001
   Type: command-injection
   Description: Version 1.0 allows command injection via filename
   Recommendation: Update to version 1.1 or later

Import module with security advisories? [y/N]: 
```

### Import Pinning

Approved imports are "pinned" to specific versions by default:

```json
// mlld.config.json
{
  "security": {
    "imports": {
      "allowed": [{
        "url": "mlld://gist/user/abc123",
        "hash": "sha256:e3b0c44298fc...",
        "pinnedVersion": true,
        "allowedAt": "2024-01-25T10:00:00Z"
      }]
    }
  }
}
```

## Command Security

### Pre-flight Checks

Before executing commands, mlld analyzes them for risks:

```
Pre-flight Security Check:
  ✓ echo "Hello"              (safe)
  ✓ ls -la                    (safe)
  ⚠️  curl https://api.com     (network access - needs approval)
  ❌ rm -rf /                  (BLOCKED - destructive command)

Continue? [y/N]: 
```

### Dangerous Command Detection

Commands are categorized by risk level:

- **Safe** (auto-allowed): `echo`, `ls`, `pwd`, `cat`
- **Moderate** (shown but allowed): `npm install`, `git status`
- **High Risk** (requires approval): `curl`, `wget`, `ssh`
- **Blocked** (never allowed): `rm -rf /`, fork bombs

### LLM Output Protection

The most dangerous security risk is executing LLM-generated commands:

```meld
# This is BLOCKED by default:
@text cmd = @run [claude "write a command to clean my system"]
@run [@cmd]  # ❌ BLOCKED - Cannot execute LLM output
```

You'll see:
```
🚨 SECURITY BLOCK: Cannot execute LLM-generated content
   Variable: cmd
   Content: rm -rf ~/Downloads/*
   
   This is blocked for your safety. LLM outputs should never be
   executed directly as commands.
```

## File System Protection

### Protected Paths

Mlld blocks access to sensitive directories:

```meld
# These are BLOCKED:
@text ssh_key = [~/.ssh/id_rsa]      # ❌ SSH keys
@text aws = [~/.aws/credentials]      # ❌ AWS credentials
@path config = ~/.mlld/security.json  # ❌ Security config
```

Protected paths include:
- `~/.ssh/` - SSH keys and config
- `~/.aws/` - AWS credentials
- `~/.gnupg/` - GPG keys
- `~/.npmrc` - NPM tokens
- `**/.env*` - Environment files
- System directories (`/etc/`, `/System/`, `C:\Windows\`)

### Safe File Access

Regular project files work normally:

```meld
# These work fine:
@text readme = [./README.md]
@text config = [./config.json]
@run [cat package.json]
```

## Configuration

### Project Configuration

Configure security in `mlld.config.json`:

```json
{
  "security": {
    "imports": {
      "requireApproval": true,
      "pinByDefault": true
    },
    "commands": {
      "preFlightCheck": true,
      "blockLLMExecution": true
    },
    "paths": {
      "blockSystemPaths": true
    }
  }
}
```

### Security Modes

Run mlld with different security levels:

```bash
# Default (balanced security)
mlld script.mld

# Strict mode (maximum security)
mlld --security=strict script.mld

# Audit mode (dry run)
mlld --security=audit script.mld
```

## Security Commands

### Audit Imports

Check all imports for security issues:

```bash
mlld security audit

Checking 3 imports...

✓ mlld://registry/prompts/reviewer (safe)
⚠️  mlld://gist/user/tool (1 advisory)
✓ ./lib/utils.mld (local file)

1 security advisory found. Run 'mlld security show' for details.
```

### Registry Search

Search the registry safely:

```bash
mlld registry search "code review"

Found 3 modules:
1. prompts/code-review (by: anthropics) ⭐ 245
   AI-powered code review assistant
   
2. tools/pr-reviewer (by: mlld-community) ⭐ 89
   GitHub PR review automation
   
3. templates/review-checklist (by: alice) ⭐ 34
   Standard code review checklist
```

### Show Security Status

View current security configuration:

```bash
mlld security show

Security Configuration:
- Import approval: REQUIRED
- Command pre-flight: ENABLED
- LLM execution: BLOCKED
- Path protection: ENABLED

Trusted Publishers:
- mlld-lang (official)
- anthropics (verified)

Recent Security Events:
- 2024-01-25 10:30: Blocked rm -rf command
- 2024-01-25 10:15: Approved import from registry
```

## Best Practices

### 1. Review Before Importing

Always review import content before approving:
- Check what commands it runs
- Look for suspicious patterns
- Verify the publisher

### 2. Use the Registry

Prefer registry imports over direct URLs:
```meld
# Good - uses registry
@import { tool } from "mlld://registry/tools/formatter"

# Less secure - direct gist
@import { tool } from "https://gist.github.com/user/id"
```

### 3. Pin Important Imports

For production scripts, pin imports to specific versions:
```bash
mlld security pin mlld://registry/tools/critical-tool
```

### 4. Audit Regularly

Run security audits on your scripts:
```bash
mlld security audit *.mld
```

### 5. Report Suspicious Modules

If you find malicious code, report it:
```bash
mlld security report mlld://registry/suspicious/module
```

## Common Security Warnings

### "Cannot execute LLM-generated content"

**Cause**: Trying to run output from an AI tool as a command.

**Solution**: Review the output manually and create a safe command:
```meld
# Instead of:
@text cmd = @run [llm "generate command"]
@run [@cmd]  # Blocked

# Do this:
@text suggestion = @run [llm "generate command"]
@add @suggestion  # Show to user
# Then manually write the safe command:
@run [echo "safe command here"]
```

### "Access denied to protected path"

**Cause**: Trying to read sensitive files like SSH keys.

**Solution**: Only access files in your project directory:
```meld
# Instead of:
@text key = [~/.ssh/id_rsa]  # Blocked

# Do this:
@text config = [./config/app.json]  # Allowed
```

### "Command requires approval"

**Cause**: Running a potentially dangerous command.

**Solution**: Review the command and approve if safe:
```
⚠️  Command requires approval:
   curl https://install.tool.com | sh
   
   This command downloads and executes remote code.
   
Allow execution? [y/N]: 
```

## Reporting Security Issues

If you discover a security vulnerability in mlld:

1. **Do NOT** post it publicly
2. Email security@mlld-lang.org
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We'll respond within 48 hours and work on a fix.

## FAQ

### Can I disable security features?

Some features can be relaxed in development, but core protections (like LLM output execution blocking) cannot be disabled for safety reasons.

### Why can't I access my SSH keys?

SSH keys contain authentication credentials that could compromise your systems if exposed. Store needed keys in your project directory with proper permissions instead.

### How do I trust a publisher?

Publishers can be verified through:
- GitHub organization verification
- Community reputation
- Code signing (coming soon)

### What happens to blocked commands?

Blocked commands are:
1. Never executed
2. Logged for audit
3. Reported in security status

### Can I add custom security rules?

Yes, in your project's `mlld.config.json`:
```json
{
  "security": {
    "customRules": {
      "blockedCommands": ["custom-dangerous-cmd"],
      "blockedPaths": ["./sensitive-data/**"]
    }
  }
}
```

## Summary

Mlld's security features protect you from common attack vectors while maintaining usability. The system is designed to:

- ✅ Block obvious attacks automatically
- ⚠️ Warn about risky operations
- 👤 Let you make informed decisions
- 📝 Maintain audit trails
- 🔒 Protect sensitive data

Security is enabled by default and cannot be fully disabled, ensuring that mlld scripts remain safe to run even when shared with others.