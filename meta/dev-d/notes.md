# Workstream D: Keychain & Capabilities - Session Handoff

## Session ID
87455325 (prior), current session continuing

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

## In Progress: Keychain Import Pattern (Phase 4.1)

### What's Been Implemented This Session

**Adam's decision**: Use import pattern: `/import { get, set, delete } from "@keychain"`

#### Changes Made

1. **KeychainResolver** (`core/resolvers/builtin/KeychainResolver.ts`)
   - Updated to support import context
   - Returns executable objects with `__executable: true` marker
   - Each function has:
     - `transformerImplementation`: async function taking args array
     - `keychainFunction`: name of the function (get/set/delete)
     - `isBuiltinTransformer: true`

2. **ImportDirectiveEvaluator** (`interpreter/eval/import/ImportDirectiveEvaluator.ts`)
   - Modified `fallbackResolverData()` to handle object content (not just JSON strings)
   - Line 873-875: Returns `result.content` directly when contentType is 'data' and content is an object

3. **run.ts** (`interpreter/eval/run.ts`)
   - Added handling for `isBuiltinTransformer` executables (lines 768-786)
   - Passes all evaluated args to `transformerImplementation`

### The Problem ⚠️

Import works, functions are created, but **arguments aren't passed correctly**.

**Test output**:
```
Set result:
Get result: l
```

Expected: `Get result: my-secret-value`

**Root cause**: `interpreter/eval/exec-invocation.ts` line 1413 passes only `inputValue` (single arg) to `transformerImplementation`:

```typescript
// Line 1394-1410 only processes args[0] into inputValue
// Line 1413:
const result = await variable.internal.transformerImplementation(inputValue);
```

Keychain functions need ALL args: `["mlld-test", "test-account"]` or `["mlld-test", "test-account", "my-secret-value"]`

### Fix Needed

In `exec-invocation.ts`, modify the builtin transformer handling to:
1. Check if the transformer has `internal.keychainFunction` (or check `paramNames.length > 1`)
2. If so, evaluate ALL args and pass as array instead of single inputValue
3. Otherwise, use existing single-arg behavior

### Key Code Locations

**exec-invocation.ts around line 1392-1413**:
```typescript
// Regular transformer handling
let inputValue = '';
if (args.length > 0) {
  let arg: any = args[0];  // <-- ONLY FIRST ARG
  // ... processing ...
}

// Call the transformer implementation directly
const result = await variable.internal.transformerImplementation(inputValue);  // <-- SINGLE VALUE
```

**Needs to become** (pseudo-code):
```typescript
if (variable.internal?.keychainFunction) {
  // Multi-arg handling for keychain functions
  const evaluatedArgs = [];
  for (const arg of args) {
    // ... evaluate each arg ...
    evaluatedArgs.push(argValue);
  }
  const result = await variable.internal.transformerImplementation(evaluatedArgs);
} else {
  // Existing single-arg behavior
}
```

### Adam's Suggestion

Look at how `import { @xyz } from @input` works and pattern keychain after that.

## Files Modified This Session (Uncommitted)

1. `core/resolvers/builtin/KeychainResolver.ts` - Import context handling
2. `interpreter/eval/import/ImportDirectiveEvaluator.ts` - Object content handling
3. `interpreter/eval/run.ts` - Builtin transformer handling
4. `interpreter/eval/exec-invocation.ts` - Added resolver variable fallback (line 949-954)

## Test File

`tmp/keychain-import-test.mld`:
```mlld
/needs { keychain }
/import { get, set } from "@keychain"

/var @setResult = @set("mlld-test", "test-account", "my-secret-value")
show `Set result: @setResult`

/var @result = @get("mlld-test", "test-account")
show `Get result: @result`
```

## Remaining Phases

### Phase 4.2: macOS keychain implementation (mlld-ut9i)
- MacOSKeychainProvider is implemented
- Needs integration testing once method invocation works
- Manual test: set/get/delete with actual keychain

### Phase 6.2: mlld env capture (mlld-l6n4)
Dependencies: Keychain working
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

- `core/resolvers/builtin/KeychainResolver.ts` - Resolver with import support
- `core/resolvers/builtin/keychain-macos.ts` - macOS provider
- `interpreter/env/Environment.ts` - Resolver registration
- `interpreter/eval/exec-invocation.ts` - **NEEDS FIX** for multi-arg transformers
- `interpreter/eval/import/ImportDirectiveEvaluator.ts` - Object content handling
- `interpreter/eval/run.ts` - Builtin transformer handling

## Test Commands

```bash
# Test keychain import
npx mlld tmp/keychain-import-test.mld

# Test AST parsing
npm run ast -- '/import { get } from "@keychain"'
npm run ast -- '/var @x = @get("a", "b")'

# Run all tests
npm test
```

## Next Steps for New Session

1. **Research** how `import { @xyz } from @input` works (per Adam's suggestion)
2. **Fix exec-invocation.ts** to pass all args for multi-arg builtin transformers
3. **Test keychain operations** end-to-end
4. **Commit changes** when working
5. **Proceed with Phase 6.2 (env capture)**

## Bead Status

| Bead | Phase | Status |
|------|-------|--------|
| mlld-ov8w | 2.2 Grammar | ✅ Closed |
| mlld-8ohj | 2.3 Validation | ✅ Closed |
| mlld-bniq | 5.1 Env type | ✅ Closed |
| mlld-19ya | 6.1 Env list | ✅ Closed |
| mlld-esjy | 4.1 Keychain functions | 🔄 In progress (import pattern) |
| mlld-ut9i | 4.2 macOS impl | ⏳ Pending |
| mlld-l6n4 | 6.2 Env capture | ⏳ Pending |
| mlld-hmw5 | 6.3 Env spawn | ⏳ Pending |
| mlld-9rot | 6.4 Env shell | ⏳ Pending |
