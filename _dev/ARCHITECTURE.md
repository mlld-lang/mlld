# mlld Architecture

Last Updated: 2025-05-29

This document describes the technical architecture of mlld, how all components fit together, and the design decisions that guide the system.

## Overview

mlld is a programming language embedded in Markdown that enables dynamic content generation while preserving document readability. The architecture prioritizes security, offline-first operation, and progressive trust.

```
┌─────────────────────┐
│   Markdown File     │
│   with @directives  │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│   Grammar (Peggy)   │
│   Parses to AST     │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│    Interpreter      │
│  Evaluates AST      │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    │             │
┌───▼───┐    ┌───▼───┐
│Security│    │Registry│
│Manager │    │System  │
└────────┘    └────────┘
```

## Core Components

### 1. Parser (Grammar)
- **Technology**: Peggy.js parser generator
- **Design**: Modular grammar with clean abstractions
- **Output**: Typed AST with location information
- **Key Files**: `grammar/mlld.peggy`, `grammar/directives/*.peggy`

### 2. Interpreter
- **Pattern**: Single recursive evaluation function
- **State**: Environment object holds variables and context
- **Integration**: Direct execution, no service orchestration
- **Key Files**: `interpreter/core/interpreter.ts`, `interpreter/eval/*.ts`

### 3. Security System
- **Philosophy**: Progressive trust, real risks only
- **Components**: CommandAnalyzer, PathValidator, TaintTracker
- **Integration**: Hooks in interpreter evaluation
- **Key Files**: `security/SecurityManager.ts`, `core/security/ImportApproval.ts`

### 4. Module System (Hash-Cache)
- **Design**: Content-addressed storage like Git
- **Resolution**: `@user/module` → DNS → Gist → SHA-256 hash
- **Storage**: Local cache at `~/.mlld/cache/sha256/`
- **Lock Files**: Track all dependencies with hashes

### 5. Registry System
- **Phase 1**: GitHub gists + DNS TXT records (no servers)
- **Phase 2**: Static website for browsing
- **Phase 3**: Full API with authentication
- **Future**: MCP servers, private modules

## Data Flow

### Import Resolution
```
@import { x } from @user/module
         │
         ▼
   Check Lock File
         │
    ┌────┴────┐
    │Found    │Not Found
    ▼         ▼
Check Cache   Query DNS
    │         │
    │         ▼
    │    Fetch Gist
    │         │
    │         ▼
    │    Hash Content
    │         │
    │         ▼
    │    Store Cache
    │         │
    └─────────┴──→ Update Lock File
                   │
                   ▼
              Load Module
```

### Security Flow
```
User Input → Taint Marking → Command Analysis → Policy Check → Execution
                                                      │
                                                      ▼
                                                 Approval UI
```

## Design Principles

### 1. Offline-First
- Everything cached locally by content hash
- Network only needed for initial fetch
- Lock files ensure reproducibility
- DNS records cached with TTL

### 2. Progressive Trust
- Start restrictive, allow gradual trust expansion
- Interactive approval for new operations
- Trust decisions recorded in lock files
- Clear security error messages

### 3. Content Addressing
- All content identified by SHA-256 hash
- Immutable cache prevents tampering
- Short hashes (4-6 chars) for convenience
- Git-like storage model

### 4. Markdown-First
- Directives only at line start
- Everything else is regular Markdown
- Preserves document readability
- No inline template syntax

## Security Architecture

### Threat Model
1. **Command Injection**: Malicious commands in templates
2. **Path Traversal**: Access to sensitive files
3. **Data Exfiltration**: Sending data to external servers
4. **Supply Chain**: Malicious modules in registry
5. **LLM Manipulation**: Tricking AI into generating harmful code

### Security Layers
1. **Parser Level**: Syntax restrictions, no eval()
2. **Interpreter Level**: Taint tracking, sandboxing
3. **Command Level**: Pattern analysis, approval required
4. **Network Level**: HTTPS only, domain restrictions
5. **Registry Level**: Content hashing, advisory system

### Trust Boundaries
```
┌─────────────────────────────────────┐
│          Untrusted Zone             │
│  - User Input                       │
│  - Network Content                  │
│  - LLM Output                       │
└────────────┬────────────────────────┘
             │ Security Checks
┌────────────▼────────────────────────┐
│         Approval Zone               │
│  - User Prompts                     │
│  - Policy Evaluation                │
└────────────┬────────────────────────┘
             │ User Approval
┌────────────▼────────────────────────┐
│          Trusted Zone               │
│  - Cached Content                   │
│  - Approved Commands                │
│  - Local Files                      │
└─────────────────────────────────────┘
```

## Module System Architecture

### Storage Layout
```
~/.mlld/
├── cache/
│   ├── sha256/
│   │   ├── f8h4a9c2.../
│   │   │   ├── content.mld
│   │   │   └── metadata.json
│   │   └── index.json
│   └── registry/
│       └── modules.json
├── security/
│   ├── approved-imports.json
│   └── security-policy.json
└── mlld.lock.json (global)

./project/
├── mlld.lock.json (local)
└── *.mld files
```

### Resolution Algorithm
1. Parse module reference: `@user/module@hash`
2. Check local lock file for pinned version
3. Check global lock file for cached version
4. Query DNS: `user-module.registry.mlld.ai`
5. Fetch from URL in TXT record
6. Validate content hash
7. Store in cache
8. Update lock file

## Registry Architecture

### DNS-Based Discovery
```
alice-utils.registry.mlld.ai.  IN  TXT  "v=mlld1;url=https://gist.githubusercontent.com/..."
```

### Metadata Storage
```
github.com/mlld-lang/registry/
├── modules/
│   └── alice/
│       └── utils.json
├── advisories/
│   └── 2024/
│       └── MLLD-2024-0001.json
└── dns/
    └── records.json
```

### Future API Design
```
GET  /api/modules/@alice/utils
GET  /api/modules/@alice/utils@f8h4
POST /api/modules (authenticated)
GET  /api/search?q=utils
GET  /api/advisories
```

## Extension Points

### 1. New Directives
- Add grammar pattern in `grammar/directives/`
- Create evaluator in `interpreter/eval/`
- Update AST types
- Add tests in `tests/cases/`

### 2. Security Policies
- Implement new analyzers in `security/`
- Add to SecurityManager initialization
- Create policy configuration
- Add approval UI

### 3. Registry Types
- Extend discriminated union in registry
- Add new resolver logic
- Update CLI commands
- Extend website UI

### 4. MCP Integration
- New `@mcp` directive
- MCP runner infrastructure
- Permission system extension
- Tool capability registry

## Performance Considerations

### Parser Performance
- Grammar optimized for common cases
- Memoization in Peggy rules
- Minimal backtracking
- ~10ms for typical files

### Interpreter Performance
- Direct evaluation, no compilation
- Lazy variable evaluation
- Efficient template interpolation
- ~50ms for complex scripts

### Security Overhead
- Command analysis: <1ms
- Path validation: <0.5ms
- Taint tracking: ~2ms per operation
- Approval UI: User-dependent

### Module Resolution
- DNS lookup: ~50ms (cached: 0ms)
- Gist fetch: ~200ms (cached: <5ms)
- Hash computation: ~10ms
- Total first fetch: ~300ms

## Future Architecture

### Planned Enhancements
1. **Incremental Parsing**: Parse only changed sections
2. **Parallel Evaluation**: Execute independent branches concurrently
3. **Distributed Registry**: IPFS/Arweave for censorship resistance
4. **WASM Modules**: Sandboxed execution for untrusted code
5. **Real-time Collaboration**: Operational transforms for shared documents

### Scaling Considerations
- Registry sharding by namespace
- CDN distribution for popular modules
- Regional DNS servers
- Federated advisory system
- P2P module sharing

## Architecture Decisions

### Why Peggy.js?
- Clean grammar syntax
- Good error messages
- JavaScript output
- Active maintenance
- Extensible architecture

### Why Content Addressing?
- Immutable by design
- Tamper-proof
- Efficient deduplication
- Offline-friendly
- Git-like mental model

### Why DNS + Gists?
- Zero infrastructure cost
- Leverages GitHub reliability
- Simple to implement
- Easy migration path
- Familiar to developers

### Why Progressive Trust?
- Balances security and usability
- User stays in control
- Decisions are recorded
- Can tighten or loosen over time
- Clear mental model

## Integration Points

### CLI Integration
```typescript
CLI → API → Interpreter → Environment → Security/Registry
```

### Editor Integration
```typescript
Editor → Language Server → Parser → AST → Semantic Analysis
```

### Web Integration
```typescript
Browser → WASM Parser → Sandbox Interpreter → Limited Environment
```

## Testing Architecture

### Test Levels
1. **Unit**: Individual functions
2. **Integration**: Component interaction
3. **Fixture**: Full interpretation tests
4. **E2E**: CLI command tests
5. **Security**: Penetration testing

### Test Data Flow
```
tests/cases/ → build-fixtures.js → tests/fixtures/ → vitest
```

This architecture provides a secure, extensible, and user-friendly foundation for the mlld ecosystem.