# Workstream D: Keychain & Capabilities - Session Handoff

## Session ID
87455325 (prior), 366f1898 (prior), current session (dev-d)

## Completed Phases

### Phase 2.2: Add keychain capability to grammar (mlld-ov8w) ✅
**Commits**: `68d9f923b` (grammar), TypeScript changes included in dev-c's `bbdeb9acd`

- Added `keychain` to `NeedsBooleanKey` in `grammar/directives/needs-wants.peggy`
- Added `keychain` to exclusion list in `CapabilityName` rule
- TypeScript changes (done in coordination with dev-c):
  - `keychain: 'keychain'` in `BOOLEAN_CAPABILITY_ALIASES`
  - `keychain?: boolean` in `NeedsDeclaration` and `PolicyCapabilities`
  - `keychain: true` in `ALLOW_ALL_POLICY`
  - Handling in `normalizeNeedsDeclaration`, `policySatisfiesNeeds`, `mergeNeedsDeclarations`, `policyConfigPermitsTier`
- Test case: `tests/cases/slash/needs/keychain-capability/`

### Phase 2.3: Validate /needs at module load time (mlld-8ohj) ✅
**Commit**: `e5819564d`

- Added `getSystemCapabilities()` function in `interpreter/eval/needs.ts`
- Added `validateNeedsAgainstSystem()` to check if needs can be satisfied
- Currently validates:
  - `keychain`: Only available on macOS (`process.platform === 'darwin'`)
- Throws `MlldInterpreterError` with code `NEEDS_UNMET` when capabilities unavailable

### Phase 5.1: Add environment module type (mlld-bniq) ✅
**Commit**: `913efb2e3`

- Added `'environment'` to `ModuleType` union in `core/registry/types.ts`
- Added installation paths:
  - Local: `.mlld/env/`
  - Global: `~/.mlld/env/`

### Phase 6.1: mlld env list command (mlld-19ya) ✅
**Commit**: `7114678dc`

- Implemented `listEnvCommand()` in `cli/commands/env.ts`
- Features:
  - Lists local and global environment modules
  - `--json` flag for machine-readable output
  - Scans directories for `module.yml` with `type: environment`
  - Graceful handling of empty/missing directories

### Phase 4.1: Keychain Import Pattern (mlld-esjy) ✅
**Commit**: `ef9b93c3c`

- **Unquoted `@keychain` syntax now works!**
- Syntax: `/import { get, set, delete } from @keychain`
- Grammar: Added `@keychain` to ImportPath rule in `grammar/directives/import.peggy`
- Multi-arg fix: Updated `interpreter/eval/exec-invocation.ts` to pass all args for keychain functions
- All tests pass (2782 pass, 62 skipped)

**Working example:**
```mlld
/needs { keychain }
/import { get, set, delete } from @keychain

/var @setResult = @set("mlld-test", "test-account", "my-secret-value")
show `Set result: @setResult`

/var @result = @get("mlld-test", "test-account")
show `Get result: @result`  // Outputs: my-secret-value

/var @deleteResult = @delete("mlld-test", "test-account")
show `Delete result: @deleteResult`
```

## Remaining Phases

### Phase 4.2: macOS keychain implementation (mlld-ut9i)
- MacOSKeychainProvider is implemented in `core/resolvers/builtin/keychain-macos.ts`
- Integration tested via import pattern ✅
- Can mark as complete

### Phase 6.2: mlld env capture (mlld-l6n4)
Dependencies: Keychain working ✅
- Extract OAuth token from `~/.claude/.credentials.json`
- Store in keychain (`mlld-env` service, environment name as account)
- Copy settings.json, CLAUDE.md, hooks.json (NOT credentials)
- Create module.yml and index.mld template

### Phase 6.3: mlld env spawn (mlld-hmw5)
Dependencies: Phase 6.2, keychain
- Load environment module
- Match /wants against policy
- Retrieve token from keychain
- Call @mcpConfig() → spawn MCP servers
- Inject env vars and run command

### Phase 6.4: mlld env shell (mlld-9rot)
Dependencies: Phase 6.3
- Call environment's @shell() export
- Interactive session support

## Key Files

- `grammar/directives/import.peggy` - @keychain import path parsing
- `core/resolvers/builtin/KeychainResolver.ts` - Resolver with import support
- `core/resolvers/builtin/keychain-macos.ts` - macOS provider
- `interpreter/env/Environment.ts` - Resolver registration
- `interpreter/eval/exec-invocation.ts` - Multi-arg handling for keychain functions
- `interpreter/eval/import/ImportDirectiveEvaluator.ts` - Object content handling

## Test Commands

```bash
# Test keychain import
npx mlld tmp/keychain-import-test.mld

# Test AST parsing
npm run ast -- '/import { get } from @keychain'

# Run all tests
npm test
```

## Bead Status

| Bead | Phase | Status |
|------|-------|--------|
| mlld-ov8w | 2.2 Grammar | ✅ Closed |
| mlld-8ohj | 2.3 Validation | ✅ Closed |
| mlld-bniq | 5.1 Env type | ✅ Closed |
| mlld-19ya | 6.1 Env list | ✅ Closed |
| mlld-esjy | 4.1 Keychain functions | ✅ Complete (commit ef9b93c3c) |
| mlld-ut9i | 4.2 macOS impl | ✅ Complete (integrated) |
| mlld-l6n4 | 6.2 Env capture | ⏳ Pending |
| mlld-hmw5 | 6.3 Env spawn | ⏳ Pending |
| mlld-9rot | 6.4 Env shell | ⏳ Pending |
