# mlld Security and Module System Vision

## Executive Summary

> **NOTE:** This vision document predates the import/security refactor and references the legacy trust/TTL syntax that has now been removed. The core resolver/taint concepts still apply, but trust annotations will be reintroduced using the new capability model.

mlld's security and module system is designed around a revolutionary insight: **resolvers are the security boundary**. By controlling what resolvers are available and how they work, we can create completely sandboxed environments while maintaining the flexibility developers need. The system uses content-addressed storage (like Git), progressive trust models, and a decentralized registry built on GitHub infrastructure.

### Current Implementation Status
- ✅ **Module Publishing**: Fully implemented via GitHub authentication
- ✅ **Content Escaping**: Complete 4-layer escaping architecture  
- ✅ **Security Infrastructure**: SecurityManager, TaintTracker, CommandAnalyzer, PathValidator all implemented
- ✅ **Grammar Support**: TTL/trust syntax fully defined in security-options.peggy
- ✅ **Lock File System**: Complete LockFile class with registry/policy support
- ✅ **Resolver System**: ResolverManager with Local, GitHub, HTTP, Registry resolvers
- ⚠️ **Security Integration**: Components exist but not fully wired to execution flow
- ⚠️ **Import Approval**: Works but doesn't persist decisions to lock file
- ❌ **Policy Enforcement**: No PolicyManager or AuditLogger implementations
- ❌ **TTL/Trust Enforcement**: Parsed but not used during execution
- ✅ **GitHub Registry**: Direct GitHub repo structure (no DNS needed)

## Core Principles

### Security Philosophy
**"Security should protect users from real risks without getting in their way."**

We focus on actual threats that mlld users face, not theoretical vulnerabilities. Every security measure must have a clear threat model and user benefit.

### Design Principles

#### 1. Progressive Trust
Start restrictive, allow gradual expansion of trust as users verify safety.

#### 2. Offline-First
All security and module features work without internet connectivity.

#### 3. Content Addressing  
Every module is identified by its SHA-256 hash, making tampering impossible.

#### 4. Resolvers as Security Boundary
By controlling available resolvers, we can sandbox mlld completely.

#### 5. Markdown-First
mlld enhances Markdown without breaking its readability.

#### 6. Split Precedence Rules (KEY INSIGHT)
- **Security flows down**: Global > Project > Inline (restrictive wins)
- **Performance bubbles up**: Inline > Project > Global (specific wins)
- This prevents security bypasses while allowing performance tuning

## Architecture Overview

### High-Level System Design
```
┌─────────────────────┐
│   .mld Document     │
│ @import @user/mod   │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Resolver System    │◄─── Security Boundary
│ (local/DNS/custom)  │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│   Content Cache     │
│  (SHA-256 hashed)   │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│   Lock File         │
│ (reproducibility)   │
└─────────────────────┘
```

### Component Relationships
- **Parser** → AST with security metadata (TTL/trust)
- **Interpreter** → Evaluates with security checks at each step
- **Resolver System** → Controls all external access (files/network)
- **Security Manager** → Orchestrates policies and approvals
- **Content Cache** → Immutable storage by hash
- **Lock Files** → Record all decisions for reproducibility

## Feature Categories

### 1. Module System

#### Vision
A decentralized, content-addressed module system that enables safe code sharing without central control. Modules are identified by `@namespace/path` patterns and cached by their SHA-256 hash.

#### Current State
- ✅ **Implemented**: Module publishing via GitHub OAuth
- ✅ **Implemented**: Registry structure and RegistryManager class
- ✅ **Implemented**: ModuleCache and hash verification (HashUtils)
- ✅ **Implemented**: CLI commands (install/ls) with lock file support
- ⚠️ **Partial**: Import approval flow (works but no persistence)
- ❌ **Not Started**: Module resolution via DNS (uses direct GitHub)
- ❌ **Not Started**: Module versioning/updates

#### Open Questions
- Should we support semantic versioning or only content hashes?
- How to handle module deprecation/yanking?
- What's the right default TTL for registry modules?

### 2. Registry System

#### Vision
Start with GitHub infrastructure (gists + DNS) requiring zero servers, then gradually add discovery features. The registry is fundamentally PUBLIC - private modules use different resolvers.

#### Current State
- ✅ **Implemented**: Publishing workflow to GitHub
- ✅ **Implemented**: Registry repository structure defined
- ✅ **Implemented**: RegistryClient and RegistryResolver classes
- ✅ **Implemented**: AdvisoryChecker for security advisories
- ⚠️ **Partial**: Module search (basic implementation exists)
- ❌ **Not Started**: DNS TXT record resolution (direct GitHub only)
- ❌ **Not Started**: Web interface for discovery

#### Open Questions
- How to verify gist ownership in Phase 1?
- Should we use subdomains or paths for namespacing?
- How to handle registry mirrors/federation?

### 3. Security Model

#### Vision
Progressive trust with clear boundaries. Security policies flow down (restrictive wins), while performance settings bubble up (specific wins). The key insight: resolvers ARE the security boundary.

#### Current State
- ✅ **Implemented**: Escaping system (complete)
- ✅ **Implemented**: SecurityManager orchestrating all components
- ✅ **Implemented**: CommandAnalyzer for dangerous pattern detection
- ✅ **Implemented**: PathValidator for file system access control
- ✅ **Implemented**: TaintTracker with accumulated taint labels
- ⚠️ **Partial**: Integration with interpreter (components exist but not fully connected)
- ❌ **Not Started**: PolicyManager for rule evaluation
- ❌ **Not Started**: AuditLogger for security events

#### Open Questions
- Should path-only mode be default for web environments?
- How to handle security policy distribution?
- What's the right balance for default policies?

### 4. Lock File System

#### Vision
Unified lock files that record all module dependencies, security decisions, and cache metadata. Two levels: global (`~/.mlld/mlld.lock.json`) and project (`./mlld.lock.json`).

#### Current State
- ✅ **Implemented**: LockFile class with full read/write capabilities
- ✅ **Implemented**: Support for imports, registries, and security policies
- ✅ **Implemented**: Lock file used by CLI install command
- ⚠️ **Partial**: Not automatically updated during imports
- ⚠️ **Partial**: No global system-wide lock file
- ❌ **Not Started**: Precedence rules between global/project files
- ❌ **Not Started**: Lock file profiles (dev/prod)

#### Open Questions
- Should lock files support profiles (dev/prod)?
- How to handle lock file merge conflicts?
- Should project lock files add new blocked items?

### 5. Trust and Authorization (TTL/Trust Syntax)

#### Vision
Inline control over caching (TTL) and security (trust) directly in mlld syntax. Clear precedence: security flows down, performance bubbles up.

#### Current State
- ✅ **Implemented**: Complete grammar in security-options.peggy
- ✅ **Implemented**: TTL/trust parsing in all relevant directives
- ✅ **Implemented**: AST nodes include security metadata
- ⚠️ **Partial**: Values parsed but not enforced during execution
- ❌ **Not Started**: Connection to SecurityManager policies
- ❌ **Not Started**: TTL-based caching decisions
- ❌ **Not Started**: Trust-based approval flows

#### Open Questions
- Should we support conditional TTL based on environment?
- How to handle trust delegation between users?
- Should trust decisions expire?

### 6. Custom Resolvers

#### Vision
Extensible resolver system that enables custom import sources while maintaining security. Resolvers can be restricted to create perfect sandboxes.

#### Current State
- ✅ **Implemented**: ResolverManager with resolver interface
- ✅ **Implemented**: Built-in resolvers (Local, GitHub, HTTP, Registry)
- ✅ **Implemented**: Resolver configuration via lock file
- ⚠️ **Partial**: Basic functionality works but no plugin system
- ❌ **Not Started**: Custom resolver loading mechanism
- ❌ **Not Started**: Resolver-specific security boundaries
- ❌ **Not Started**: Resolver credential management

#### Open Questions
- How to handle resolver credential storage?
- Should resolvers support different operations (read/write)?
- How to distribute custom resolvers safely?

## Security Approval Flow

### Trust Decision Logic
Based on the source and context, different approval rules apply:

1. **Local Files**
   - Your own files = trusted automatically
   - Still run through SecurityManager for advisory checks
   - No prompts unless dangerous patterns detected

2. **Private Resolvers**  
   - First use: "Do you trust resolver '@company/*'?"
   - Once approved, individual imports use resolver's trust
   - URLs from private resolvers inherit resolver trust

3. **Public Registry**
   - Each new module version requires approval
   - Show mini-advisory: "This module will run: npm, git, curl"
   - Updates require re-approval (content changed)

4. **URL Imports**
   - Always check trust status
   - Prompt: "Trust https://example.com? [o]nce/[a]lways/[n]ever/[time]"
   - Cache approval based on answer

5. **URL Content in Variables**
   - @add with URL content is safe (just text)
   - When tainted content hits @run, then check trust
   - Track taint through variable assignments

### Approval Persistence
- "once" = this session only
- "always" = save to lock file permanently  
- "never" = block and save to lock file
- Time-based = save with expiry timestamp

### Future: Batch Approvals
- Group related prompts when possible
- Show dependency tree with all commands
- Single approval for module and dependencies

## Integration Architecture

### Missing Connections
The main challenge is that components exist but aren't wired together:

1. **Environment → SecurityManager**
   - Environment creates SecurityManager instance
   - But doesn't call checkCommand() before execution
   - Doesn't use checkPath() for file operations
   - Doesn't track taint through operations

2. **TTL/Trust → Execution**
   - Grammar parses TTL/trust values into AST
   - But interpreter ignores security metadata
   - No connection to caching decisions
   - No connection to approval flows

3. **Approvals → Lock File**
   - ImportApproval asks for user consent
   - But decisions aren't saved to lock file
   - No way to remember previous approvals
   - No global policy inheritance

4. **PolicyManager Interface**
   - SecurityManager expects PolicyManager
   - But no implementation exists
   - Need to define policy rule format
   - Need precedence and composition rules

## Open Design Questions

### Critical Decisions Needed

1. **Module Versioning**
   - ✅ **DECIDED**: Content-addressed only (SHA-256)
   - ✅ **DECIDED**: No version ranges - exact hashes only
   - ✅ **DECIDED**: Tags map to specific hashes at install time

2. **Security Defaults**  
   - ✅ **DECIDED**: Default = "verify" for commands/paths/imports
   - ✅ **DECIDED**: Safe commands allowed by default: echo, ls, npm, git
   - ✅ **DECIDED**: Blocked by default: rm -rf, sudo, fork bombs
   - **OPEN**: Should path-only mode be default for web?

3. **Registry Architecture**  
   - ✅ **DECIDED**: GitHub repo structure (no DNS needed)
   - ✅ **DECIDED**: Import syntax: `@user/module`
   - ✅ **DECIDED**: Per-user registry.json files
   - **OPEN**: Federation protocol design?

4. **Lock File Features**
   - ✅ **DECIDED**: No profiles - use separate projects instead
   - ✅ **DECIDED**: Project can be MORE restrictive, not less
   - ✅ **DECIDED**: Trust decisions can expire (ISO timestamps)
   - ✅ **DECIDED**: Everything in mlld.lock.json (no separate configs)

5. **Resolver Boundaries**
   - ✅ **DECIDED**: Resolvers are read-only (import only)
   - ✅ **DECIDED**: Resolvers define the security boundary
   - **OPEN**: How to handle resolver composition?
   - **OPEN**: Credential storage (env vars vs keychain)?

### Design Conflicts Resolved

1. **TTL vs Immutability**: 
   - ✅ **DECIDED**: TTL controls when to check for updates
   - ✅ **DECIDED**: Content always verified by hash
   - ✅ **DECIDED**: (live) = always check, (static) = never check

2. **Security vs Usability**: 
   - ✅ **DECIDED**: Split precedence - security down, performance up
   - ✅ **DECIDED**: Progressive trust - start safe, expand as needed
   - ✅ **DECIDED**: One-time approvals with persistence

3. **Centralization vs Federation**: 
   - ✅ **DECIDED**: Start with GitHub, enable federation later
   - ✅ **DECIDED**: Custom resolvers enable decentralization

4. **Compatibility vs Innovation**: 
   - ✅ **DECIDED**: Innovate where it matters (security model)
   - ✅ **DECIDED**: Follow conventions where helpful (TTL syntax)

## Migration Path

### For Early Adopters
1. Current import syntax continues working
2. Security features opt-in initially
3. Clear upgrade guides for each phase

### Breaking Changes
- `@stdin` → `@input` (with deprecation period)
- TTL/trust syntax is additive (backward compatible)
- Lock file format versioned for migration

### Deprecation Strategy
1. Warn in CLI for deprecated features
2. Support old syntax for 6 months
3. Provide automated migration tools

## Appendix: Implementation Notes

### Key Technical Decisions

#### Why SHA-256?
- Cryptographic security against tampering
- Negligible collision probability
- Industry standard (Git, npm)
- Good performance characteristics

#### Why DNS for Discovery?
- Zero infrastructure to start
- Globally distributed by design
- Simple TXT record updates
- Natural namespacing

#### Why Resolvers as Security?
- Clean abstraction boundary
- Enables perfect sandboxing
- Composable security model
- Natural for web environments

### Lessons from Partial Implementations

1. **Infrastructure Complete**: All major components exist and are well-designed
2. **Integration Gap**: The pieces work individually but aren't connected
3. **Grammar Ready**: TTL/trust syntax fully implemented, just needs enforcement
4. **Policy Layer Missing**: PolicyManager and AuditLogger are the critical gaps
5. **Lock File Works**: Implementation exists, needs automation

### Performance Considerations
- Command analysis: <1ms overhead
- Hash computation: ~10ms per module
- DNS lookup: ~50ms (cached after)
- Total import time: <100ms goal

### Security Considerations
- Content integrity via hashing
- Timing attack prevention in comparisons
- No shared global cache (user isolation)
- Clear audit trail of all decisions

## Remaining Open Questions

With most design decisions resolved, only a few implementation details remain:

1. **Federation Protocol**
   - How should registry mirrors work?
   - What's the protocol for registry-to-registry sync?

2. **Resolver Composition**
   - How to handle chained resolvers (e.g., cache → HTTP)?
   - Credential storage: environment variables vs system keychain?

3. **Performance Optimization**
   - How to cache security decisions within a session?
   - Pattern matching optimization for large rule sets?
   - When to pre-compile security rules?

These are implementation details that can be resolved during development rather than architectural decisions.

## Conclusion

mlld's security and module system vision centers on a key insight: **resolvers are the security boundary**. By controlling resolvers, we can create anything from completely sandboxed environments to fully open development systems. The progressive trust model lets users start safe and gradually expand capabilities as needed.

The infrastructure is largely complete - what remains is integration:

1. **Immediate Priority**: Wire up existing components
   - Connect SecurityManager to execution flow
   - Implement PolicyManager using lock file schema
   - Implement AuditLogger for security events
   - Auto-update lock files with decisions
   - Enforce TTL/trust from parsed values
   - Support global lock file at ~/.config/mlld/mlld.lock.json

2. **Next Phase**: Complete the ecosystem
   - DNS-based module discovery at mlld.dev/user/module
   - Batch approval UI for better UX
   - Custom resolver plugins
   - Federation protocol for registry mirrors

With the split precedence model (security flows down, performance bubbles up), we can deliver both safety and flexibility. The progressive trust approach means security enhances productivity rather than hindering it.
