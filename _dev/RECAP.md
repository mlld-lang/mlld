# mlld Security & Registry Design Recap

Last Updated: 2025-05-30

This document captures key insights and decisions from our design session that need to be reflected across all documentation.

## 🎯 Core Realizations

### 1. Resolvers ARE the Security Model
The biggest insight: resolvers aren't just for convenience - they're a complete security boundary. By controlling resolvers, you can sandbox mlld without giving filesystem access. This fundamentally changes how we position the security story.

**Key insight**: If `mlld.lock.json` is read-only and resolvers are restricted, mlld becomes completely sandboxed even with full code execution.

### 2. Public-First, Private-Natural
We're not building a "private registry product" - we're building a resolver system where public happens to be the default. The DNS registry at `public.mlld.ai` makes it crystal clear these are PUBLIC modules. Private modules aren't a paid feature - they're just different resolvers.

### 3. Grammar Simplicity
- NO angle brackets: `@import { x } from @module (ttl) trust always`
- Extended module paths: `@resolver/path/to/deep/module`
- `@stdin` → `@input` (future-proofing)
- `@output` directive for multi-output scripts

### 4. Honest Security Posture
We're building guardrails, not guarantees. mlld is powerful - you can break things. We provide:
- Architecture for security checks
- Basic pattern detection
- User control and transparency
- NO false promises about "blocking all attacks"

## 📐 Critical Design Decisions

### Import Depth Limit
- 3 levels deep maximum for v1
- Show ALL transitive imports during approval
- Registry stores dependency hashes at publish time
- Fail clearly if too deep rather than confuse users

### Frontmatter Philosophy
- Always optional, never required
- No reserved fields (conventions only)
- Available as `@fm.*` like `@input`
- Each file's frontmatter is isolated

### Path-Only Mode
New security mode where:
- NO filesystem access except through resolvers
- NO `../` in paths
- Resolvers become the ONLY data access
- Perfect for web/sandbox environments

### Output System
New `@output` directive:
```mlld
@output @data to @storage/path/file.json
@output @report to file [./local.xml] as xml
@output @log to @run @uploadCommand
```

This enables multi-output scripts and output sandboxing.

## 🔧 Implementation Priorities

### Grammar Must Include
1. Frontmatter parsing (YAML between `---` markers)
2. Extended module syntax (`ModuleNamespace/ModulePath*/ModuleName`)
3. TTL/Trust without angle brackets
4. `@stdin` → `@input` throughout
5. `@output` directive syntax

### Lock File Structure
```json
{
  "registries": [
    {
      "prefix": "@custom/",
      "resolver": "local",
      "type": "input|output|both",
      "config": { }
    }
  ],
  "security": {
    "policy": {
      "resolvers": {
        "allowCustom": false,
        "pathOnlyMode": true
      },
      "imports": {
        "maxDepth": 3
      }
    }
  }
}
```

### Module Resolution Flow
1. Check prefix against registries
2. Use matched resolver
3. Fall back to DNS for `@user/module`
4. Cache by content hash
5. Track in lock file

## ⚠️ Documentation Tone Changes

### Security Claims
- Remove: "mlld blocks all command injection"
- Add: "mlld provides tools to help identify risky patterns"
- Emphasize: User responsibility and transparency

### Registry Positioning  
- It's not "our registry" - it's "the default public resolver"
- Private isn't a feature - it's just using different resolvers
- Emphasize the ecosystem, not the service

### Error Messages
- Show security warnings, don't claim "safety"
- Explain risks, don't just block
- Empower users with information

## 🎬 Key Workflows to Document

### Sandbox Setup
```json
{
  "security": {
    "policy": {
      "resolvers": {
        "allowCustom": false,
        "allowedResolvers": ["sandbox-data"],
        "pathOnlyMode": true
      }
    }
  },
  "registries": [
    {
      "prefix": "@data/",
      "resolver": "local",
      "config": {
        "path": "/sandbox/readonly",
        "readonly": true
      }
    }
  ]
}
```

### Import Approval Flow
1. User imports `@alice/utils`
2. System fetches and shows:
   - Content of `@alice/utils`
   - Its dependency `@bob/helpers`
   - Bob's dependency `@charlie/core`
3. User approves ALL at once
4. All three cached by hash

### Output Routing
```mlld
# Configure outputs in script
@output @summary to @reports/daily/summary.json
@output @detailed to @archive/2024/full.json
@output @alert to @notifications/slack

# Or single default output
@output @result to @storage/results.xml
```

## 💡 Philosophy Reminders

1. **Least Surprise**: First fetch locks version, explicit updates required
2. **Progressive Trust**: Start restrictive, allow expansion
3. **Transparency**: Show what mlld is doing, don't hide
4. **User Control**: They decide risk tolerance
5. **Simplicity**: Complexity should be opt-in

## 🚀 What Makes This Special

- **First scripting language** designed with module sandboxing from day one
- **Resolver system** that works for both public sharing and private use
- **Content addressing** that makes supply chain attacks obvious
- **Progressive security** that doesn't get in the way
- **Output routing** that enables new architectural patterns

The next Claude should update ALL docs to reflect these insights, ensuring our documentation tells a coherent story about a security-first, user-controlled, transparently public module system.