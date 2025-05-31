# Documentation Update Summary

Date: 2025-05-30

This document summarizes all documentation updates made to incorporate the latest design insights from RECAP.md and EDITS.md.

## Core Insights Incorporated

### 1. Resolvers ARE the Security Model
- Resolvers aren't just for convenience - they're a complete security boundary
- By controlling resolvers, you can sandbox mlld without giving filesystem access
- Path-only mode enables complete sandboxing

### 2. Public-First, Private-Natural
- DNS registry at `public.mlld.ai` makes it crystal clear these are PUBLIC modules
- Private modules aren't a paid feature - they're just different resolvers
- We're building a resolver system where public happens to be the default

### 3. Grammar Simplicity
- NO angle brackets: `@import { x } from @module (ttl) trust always`
- Extended module paths: `@resolver/path/to/deep/module`
- `@stdin` → `@input` (future-proofing)
- `@output` directive for multi-output scripts

### 4. Honest Security Posture
- We provide guardrails, not guarantees
- Architecture for security checks, not promises of blocking all attacks
- User control and transparency over false security

## Documents Updated

### Workstream Documents (_dev/workstreams/NOW/)

#### 01-grammar-ttl-trust.md
- ✅ Removed angle brackets from trust syntax
- ✅ Added @output directive specification
- ✅ Updated module syntax for extended paths
- ✅ Changed @stdin to @input throughout
- ✅ Added hash support for content addressing

#### 02-security-integration.md
- ✅ Reframed as "Resolvers as Security Boundary"
- ✅ Added path-only mode implementation
- ✅ Updated configuration to use mlld.lock.json
- ✅ Added resolver whitelist enforcement
- ✅ Updated security posture to be honest about limitations

#### 03-hash-cache-imports.md
- ✅ Removed angle brackets from examples
- ✅ Added resolver integration
- ✅ Added transitive dependency tracking
- ✅ Added import depth limits

#### 04-registry-gists.md
- ✅ Changed registry.mlld.ai to public.mlld.ai
- ✅ Added dependency tracking to metadata
- ✅ Clarified public-first nature
- ✅ Added resolver integration

#### 05-cli-commands.md
- ✅ Added security integration with resolvers
- ✅ Added transitive dependency approval
- ✅ Updated lock file format
- ✅ Added honest security warnings

#### 06-resolver-system.md
- ✅ Reframed as security boundary first
- ✅ Added input/output resolver types
- ✅ Added path-only mode examples
- ✅ Added complete sandbox configurations
- ✅ Added security model section

#### 07-frontmatter-support.md
- ✅ Emphasized always optional nature
- ✅ Clarified no reserved fields
- ✅ Added security considerations
- ✅ Updated to align with @fm.* like @input

#### 08-interpreter-updates.md
- ✅ Added @output directive implementation
- ✅ Added path-only mode enforcement
- ✅ Updated module resolution for hashes
- ✅ Added output routing examples
- ✅ Added security error messages

### Specification Documents (_dev/specs/)

#### ttl-trust-syntax.md (v1.1)
- ✅ Removed angle brackets throughout
- ✅ Updated all examples
- ✅ Added @input support note

#### import-syntax.md (v1.1)
- ✅ Added extended module paths
- ✅ Changed @stdin to @input
- ✅ Removed angle brackets from trust

#### lock-file-format.md (v1.1)
- ✅ Added registries section
- ✅ Added registry field to modules
- ✅ Added comprehensive registry configuration

## Key Themes Across Updates

### 1. Security Through Architecture
- Resolvers as the primary security boundary
- Path-only mode for complete sandboxing
- Honest about what we can and can't guarantee

### 2. Simplicity in Syntax
- No angle brackets for trust levels
- Clear, readable syntax choices
- Consistent patterns (@input like @fm)

### 3. Public-First Ecosystem
- public.mlld.ai makes public nature explicit
- Private is just different resolvers
- Focus on ecosystem over service

### 4. User Control
- Show what mlld is doing
- Let users decide risk tolerance
- Provide information, not just blocks

## Next Steps

1. Update main documentation (docs/ directory) to reflect these changes
2. Update website documentation
3. Create migration guide for syntax changes
4. Update examples throughout the codebase
5. Update error messages in implementation

All workstream documents and specifications are now aligned with the latest design decisions and ready for implementation.