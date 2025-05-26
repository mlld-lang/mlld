# Basic Security Model for Mlld

## Overview

This document outlines a pragmatic, user-friendly security model for Mlld that focuses on real risks while maintaining usability. The model prioritizes securing imports and command execution through progressive trust and informed consent.

## Core Principles

1. **Risk-based focus**: Secure the actually risky operations (imports and command execution) rather than everything
2. **Progressive trust**: Start restrictive, allow users to expand trust incrementally with informed decisions
3. **Informed consent**: Show users what will happen before it happens
4. **Project-scoped by default**: Trust decisions are per-project, not global (unless explicitly configured)
5. **Immutable-first caching**: Cached content doesn't auto-refresh without explicit user consent

## Phase 1: Import Security (MVP)

### The Risk
When importing from URLs, users are trusting:
- The current content at that URL
- Potentially future updates to that content (if they opt in)
- Any commands or operations defined in the imported file

### Interactive Import Flow

```bash
$ mlld my-script.mld

⚠️  Import requires approval:
   https://gist.github.com/someuser/abc123...

   Fetching content for review...
   
   [Preview of first 20 lines]
   @text greeting = "Hello"
   @run npm install something
   @data config = { "version": "1.0" }
   ...
   
   This import contains:
   - 3 variable definitions
   - 2 run commands
   
   Allow this import?
   [y] This version only (recommended)
   [f] This + future updates  
   [n] Never (cancel)
   [v] View full content
   
   Choice: y
   ✅ Import approved and cached
```

### Configuration Storage

After approval, the decision is stored in the project's `mlld.config.json`:

```json
{
  "security": {
    "imports": {
      "allowed": [
        {
          "url": "https://gist.github.com/someuser/abc123",
          "hash": "sha256:abcd1234...",  // Content hash for integrity
          "pinnedVersion": true,          // true if 'y', false if 'f'
          "allowedAt": "2024-01-25T10:30:00Z",
          "detectedCommands": ["npm install", "echo"]  // For transparency
        }
      ]
    }
  }
}
```

### Gist-Specific Handling

GitHub Gists require special handling because:
- The user-friendly URL (`gist.github.com/user/id`) isn't the raw content URL
- Gists are mutable - content can change after review
- We should transform to the raw URL and potentially pin to a specific version

URL transformation:
```
Input:  https://gist.github.com/adamavenir/abc123
Output: https://gist.githubusercontent.com/adamavenir/abc123/raw/[commit_sha]/filename
```

## Phase 2: Command Security

### Pre-flight Check

Once command detection (see COMMAND-BASE-DETECTION-SPEC.md) is implemented:

```bash
$ mlld my-script.mld

Pre-flight check:

Commands to be executed:
  ✓ ls -la                    (allowed: common command)
  ✓ echo "Hello"              (allowed: safe output)
  ⚠️  rm -rf /tmp/cache        (requires approval: destructive)
  ⚠️  curl https://unknown.com  (requires approval: network access)
  
URLs to be accessed:
  ✓ https://github.com/...    (allowed: trusted domain)
  ⚠️  https://unknown-api.com   (requires approval)

Continue? [y/N]
```

### Command Risk Categories

1. **Safe** (auto-allowed):
   - Read-only filesystem: `ls`, `cat`, `pwd`, `find`
   - Safe output: `echo`, `printf`
   - Development tools: `node --version`, `npm --version`

2. **Moderate** (show but auto-allow by default):
   - Build commands: `npm install`, `npm run build`
   - Version control: `git status`, `git log`

3. **Risky** (always require approval):
   - Destructive: `rm`, `rmdir` (with certain flags)
   - Network: `curl`, `wget`, `ssh`
   - System modification: `chmod`, `chown`
   - Arbitrary execution: `eval`, `sh -c`

### Audit Command

```bash
$ mlld audit *.mld

Security audit for project:

my-script.mld:
  - Imports: 2 (1 approved, 1 new)
  - Commands: 5 (3 safe, 2 need review)
  - URLs: 3 (2 trusted, 1 unknown)

lib/utils.mld:
  - Imports: 0
  - Commands: 2 (all safe)
  - URLs: 0

Review details? [y/N]
```

## Phase 3: Trust Profiles & Advanced Features

### Global User Configuration

In `~/.config/mlld.json`:

```json
{
  "security": {
    "trustProfiles": {
      "personal": {
        "imports": {
          "allowedDomains": ["github.com", "raw.githubusercontent.com"],
          "allowedGistUsers": ["adamavenir", "trustedfriend"],
          "pinByDefault": true
        },
        "commands": {
          "autoAllow": ["ls", "echo", "cat", "pwd", "git status"],
          "autoBlock": ["rm -rf /", ":(){ :|:& };:"]  // Fork bomb
        }
      },
      "work": {
        "imports": {
          "allowedDomains": ["github.company.com", "internal-gitlab.com"],
          "requireReview": true,
          "maxSize": "1MB"
        },
        "commands": {
          "requirePreFlight": "always"
        }
      }
    },
    "defaultProfile": "personal"
  }
}
```

### Cache Update Flow

When cached content has expired (if auto-refresh is enabled):

```bash
⚠️  Cached import has updates:
   https://gist.github.com/user/abc123
   
   Changes detected:
   + @text newVariable = "Added this"
   - @text oldVariable = "Removed"
   ~ @run npm install → @run npm ci
   
   Accept update? [y/N/d(iff)]
```

## Implementation Priorities

### MVP (Phase 1)
1. Import approval flow
2. Content hashing and integrity checking  
3. Project-scoped configuration storage
4. Immutable cache by default

### Phase 2
1. Integrate command detection from parser
2. Add pre-flight check with risk categories
3. Implement audit command

### Phase 3
1. Trust profiles
2. Global pre-authorizations
3. Diff display for updates
4. Advanced Gist handling with version pinning

## Security Boundaries

### What We Secure
- Importing code from untrusted sources
- Executing potentially dangerous commands
- Accessing external URLs

### What We Don't Secure (Yet)
- Output content (displaying untrusted text is low risk)
- Local file reads (user already has access)
- Variable assignments (until they're used in risky operations)

## Configuration Examples

### Minimal Security (Development)
```json
{
  "security": {
    "imports": {
      "requireApproval": false
    },
    "commands": {
      "preFlight": "never"
    }
  }
}
```

### Maximum Security (Production)
```json
{
  "security": {
    "imports": {
      "requireApproval": true,
      "allowedDomains": ["github.company.com"],
      "pinByDefault": true,
      "maxSize": "100KB"
    },
    "commands": {
      "preFlight": "always",
      "allowedCommands": ["echo", "cat"],
      "blockAll": true
    }
  }
}
```

### Recommended Default
```json
{
  "security": {
    "imports": {
      "requireApproval": true,
      "pinByDefault": true
    },
    "commands": {
      "preFlight": "auto"  // Only prompt for risky commands
    }
  }
}
```

## Future Considerations

1. **Sandboxing**: Run imports in restricted environments
2. **Capability-based security**: Grant specific permissions to imports
3. **Signature verification**: Sign trusted imports with GPG/similar
4. **Network policies**: Restrict which APIs imported code can access
5. **Resource limits**: CPU/memory/time limits for command execution

## Summary

This security model balances usability with safety by:
- Focusing on actual risks (imports and command execution)
- Making security decisions visible and understandable
- Defaulting to safe behaviors (immutable cache, version pinning)
- Allowing progressive trust building
- Keeping the happy path smooth for trusted content

The goal is to make users aware of what they're trusting without being annoying about it.