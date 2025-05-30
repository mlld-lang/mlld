# Hash Cache Implementation TODO

## Overview
This document tracks the implementation of the new hash-based module cache and import system for mlld. This replaces the previous registry approach with a unified content-addressed storage system.

## Context Documents
1. `_dev/HASH-CACHE.md` - Complete design specification
2. `_dev/HASH-CACHE-REGISTRY-UPDATE.md` - Phase 1 implementation plan
3. `_dev/HASH-CACHE-GRAMMAR-UPDATE.md` - Phase 2 implementation plan  
4. `_dev/HASH-CACHE-INTERPRETER-UPDATE.md` - Phase 3 implementation plan
5. `CLAUDE.md` - Project conventions and guidelines

## Current Status (as of conversation on 2025-05-29)
- ✅ Design complete and documented
- ✅ Implementation plans created for all phases
- ❌ No code implementation started yet
- ❌ Previous registry work needs to be updated/replaced

## Implementation Phases

### Phase 1: Registry System Update (Foundation)
**Goal**: Update the registry infrastructure to support content-addressed storage

#### Tasks:
- [ ] Update `core/registry/LockFile.ts` 
  - [ ] Change from gist-specific to content-addressed format
  - [ ] Add `modules` object with hash/shortHash/ttl support
  - [ ] Support both registry modules and URL aliases
  - [ ] Add methods: `getModule()`, `listAliases()`, `hasModule()`

- [ ] Update `core/registry/Cache.ts`
  - [ ] Change from `.mlld/cache/gist/...` to `.mlld/cache/content/<hash>`
  - [ ] Implement content-addressed storage
  - [ ] Add metadata files (<hash>.meta.json)
  - [ ] Support short hash lookups (min 4 chars)

- [ ] Create `core/registry/HashUtils.ts`
  - [ ] SHA256 hash generation
  - [ ] Short hash generation with collision detection
  - [ ] Module reference parsing (@user/module@version)
  - [ ] TTL parsing (5h, 7d, etc)

- [ ] Create new CLI commands:
  - [ ] `cli/commands/install.ts` - mlld install @user/module [--ttl 5h]
  - [ ] `cli/commands/add.ts` - mlld add <url> --alias name [--ttl 1d]
  - [ ] `cli/commands/ls.ts` - mlld ls [alias]
  - [ ] `cli/commands/rm.ts` - mlld rm @user/module
  - [ ] `cli/commands/update.ts` - mlld update [--force]

- [ ] Update `cli/index.ts`
  - [ ] Add new command routing
  - [ ] Add 'i' alias for install
  - [ ] Update help text

- [ ] Update `core/registry/RegistryManager.ts`
  - [ ] Remove gist-specific logic
  - [ ] Add new methods: `install()`, `add()`, `remove()`, `list()`
  - [ ] Implement TTL checking
  - [ ] Handle version conflicts (overwrite on install)

### Phase 2: Grammar Update (Syntax)
**Goal**: Add support for new import syntax without quotes/brackets

#### Tasks:
- [ ] Create `grammar/patterns/module-reference.peggy`
  - [ ] Define ModuleReference rule (@user/module[@version])
  - [ ] Define AliasReference rule (@alias)
  - [ ] Validate short hash format (min 4 chars)

- [ ] Update `grammar/directives/import.peggy`
  - [ ] Add ModuleOrAliasReference to ImportSource
  - [ ] Maintain backward compatibility with quoted paths
  - [ ] Error on [@user/module] (brackets + module = error)

- [ ] Update `core/types/nodes.ts`
  - [ ] Add ModuleReferenceNode type
  - [ ] Add AliasReferenceNode type
  - [ ] Update ImportNode to accept new source types

- [ ] Update `grammar/parser/grammar-core.ts`
  - [ ] Add createModuleReference() helper
  - [ ] Add createAliasReference() helper

- [ ] Update syntax highlighting
  - [ ] `grammar/generated/mlld.tmLanguage.json`
  - [ ] `grammar/generated/mlld.vim`
  - [ ] `grammar/generated/prism-mlld.js`

- [ ] Add grammar tests
  - [ ] Test new import syntax parsing
  - [ ] Test error cases
  - [ ] Ensure no regression in existing imports

### Phase 3: Interpreter Integration (Execution)
**Goal**: Make interpreter use lock file for module resolution

#### Tasks:
- [ ] Update `interpreter/core/Environment.ts`
  - [ ] Add LockFile and Cache instances
  - [ ] Initialize in constructor
  - [ ] Add resolveModuleImport() method

- [ ] Create `interpreter/eval/module-resolver.ts`
  - [ ] Implement resolveModuleReference()
  - [ ] Implement resolveAliasReference()
  - [ ] Add TTL checking with warnings
  - [ ] Handle version validation

- [ ] Update `interpreter/eval/import.ts`
  - [ ] Handle module-reference source type
  - [ ] Handle alias-reference source type
  - [ ] Route to module resolver
  - [ ] No network calls - only read from cache

- [ ] Update error messages
  - [ ] Module not in lock file
  - [ ] Version mismatch
  - [ ] Not in cache
  - [ ] TTL expired warnings

- [ ] Add integration tests
  - [ ] Full import flow with modules
  - [ ] Offline execution
  - [ ] TTL warnings
  - [ ] Version conflicts

## Testing Strategy

### Unit Tests
- Hash generation and short hash collision handling
- TTL parsing (5h, 7d, 1w formats)
- Module reference parsing
- Lock file operations
- Cache storage and retrieval

### Integration Tests
- CLI command flow (install → import → execute)
- Mixed imports (modules + URLs + paths)
- Version conflict handling
- TTL expiration and updates
- Offline execution

### E2E Tests
- Create new project
- Install modules with various TTLs
- Execute mlld files offline
- Update expired modules
- Handle version conflicts

## Migration Notes
- Previous registry work in `core/registry/` needs updating
- Security integration can remain but registry resolution changes
- No user migration needed (no existing users 😅)

## Success Metrics
1. All new CLI commands working
2. New import syntax parsing correctly
3. Interpreter resolves from lock file (no network calls)
4. TTL and version management working
5. Clear error messages for all failure cases
6. Full offline support after install

## Security Considerations
- All content verified by hash before use
- Lock file is source of truth (add to protected paths)
- No automatic updates without user consent
- Clear warnings for TTL expiration
- Approval flow remains for new imports

## Performance Goals
- Module resolution < 10ms (from cache)
- Lock file parsing < 50ms
- No performance regression in existing imports
- Memory-efficient cache lookups

## Documentation Updates Needed
1. Update main README with new import syntax
2. Create module management guide
3. Update security docs with hash verification
4. Add troubleshooting guide for common errors
5. Create migration guide from old registry approach

## Open Questions
1. Should we support multiple registries or just GitHub's mlld-lang/registry?
2. How do we handle private modules (private gists)?
3. Should we add a `mlld init` command to create lock file?
4. Do we need `mlld outdated` command immediately?

## Next Developer Handoff Notes
- Start with Phase 1 - it's the foundation everything else builds on
- The lock file is the key abstraction - everything revolves around it
- Keep offline-first in mind - no network calls during execution
- Version conflicts are simple: latest install wins, errors if mismatch
- TTL is advisory only - warns but doesn't block execution

## Timeline Estimate
- Phase 1: 2-3 days (registry infrastructure)
- Phase 2: 1-2 days (grammar updates)
- Phase 3: 2-3 days (interpreter integration)
- Testing & Polish: 2-3 days
- Total: ~10 days for full implementation