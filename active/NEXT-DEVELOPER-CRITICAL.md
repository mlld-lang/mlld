# CRITICAL: Resolver Implementation Test Failures - Next Steps

## Current Status
We successfully implemented the resolver content type system (Phases 1-4), but this has caused 53 test failures. The implementation is architecturally sound, but there are several integration issues that need to be fixed.

## Critical Issues to Fix (In Priority Order)

### 1. 🚨 PARSER BUG - Grammar Issue (HIGHEST PRIORITY)
**Problem**: The grammar incorrectly parses `@text x = @TIME` differently than `@data x = @TIME`
- `@text x = @TIME` → Incorrectly parsed as exec invocation
- `@data x = @TIME` → Correctly parsed as variable reference

**Location**: Grammar files in `/grammar/directives/text.peggy`
**Impact**: Breaks all resolver variable usage in text directives
**Fix**: The grammar needs to recognize variable references in text directive RHS

**Example of the bug**:
```
# This fails:
@text timestamp = @TIME  # Parser thinks @TIME is an exec, not a variable

# This works:
@data timestamp = @TIME  # Parser correctly sees @TIME as a variable
```

### 2. LocalResolver Configuration Requirements
**Problem**: LocalResolver now requires `basePath` in config, breaking 20+ tests
**Current behavior**: `canResolve()` returns `false` without config
**Fix Options**:
1. Make LocalResolver work for absolute paths without config
2. Update ResolverManager to provide default config for local files
3. Update all tests to properly configure resolvers

**Quick fix for tests**:
```typescript
// In each test setup:
resolverManager.configureRegistries([{
  prefix: '/',
  resolver: 'LOCAL',
  config: { basePath: '/' }
}]);
```

### 3. Resolver Name Case Sensitivity
**Problem**: Changed resolver names to uppercase (LOCAL, REGISTRY, etc.) but tests expect lowercase
**Locations**: 
- Tests checking `result.resolverName`
- Registry configuration in tests
**Fix**: Either:
1. Make resolver lookup case-insensitive in ResolverManager
2. Update all tests to use uppercase names

### 4. Context Handling in Built-in Resolvers
**Problem**: TIME resolver not returning correct content types for different contexts
**Current**: Always returns 'text' even in import context
**Expected**: Should return 'data' with structured formats in import context
**Location**: `/core/resolvers/builtin/TimeResolver.ts`

### 5. Module Resolution Path Issues
**Problem**: Module imports failing with "No resolver found"
**Root cause**: ResolverManager not properly routing local .mld files
**Fix**: Ensure LocalResolver is registered and configured for module paths

## Test Categories and Fixes

### Category 1: LocalResolver Tests (~20 failures)
```
Error: "No resolver found for reference: /test.mld"
```
**Fix**: Configure LocalResolver with basePath in test setup

### Category 2: Resolver Name Tests (~5 failures)
```
Expected: "REGISTRY"
Received: "registry"
```
**Fix**: Update tests to expect uppercase or make lookup case-insensitive

### Category 3: Context Behavior Tests (~10 failures)
```
Expected: contentType "data"
Received: contentType "text"
```
**Fix**: Fix context parameter passing and resolver implementations

### Category 4: Parser-Related Tests (~5 failures)
```
AST shows source: "exec" instead of source: "variable"
```
**Fix**: Fix grammar to properly parse variable references in text directives

### Category 5: Integration Tests (~13 failures)
Various issues related to the above problems cascading through integration tests

## Recommended Fix Order

1. **Fix the parser bug first** - This is blocking correct functionality
   - Look at `/grammar/directives/text.peggy`
   - The issue is in how the RHS is parsed for text directives
   - Compare with how data directives parse the RHS

2. **Fix LocalResolver configuration**
   - Either make it work without config for absolute paths
   - Or add proper default configuration in ResolverManager

3. **Fix resolver name case sensitivity**
   - Add case-insensitive lookup in ResolverManager.getResolver()

4. **Fix context handling in resolvers**
   - Ensure context is properly passed from ResolverManager to resolvers
   - Fix TIME resolver to return correct content types

5. **Update tests with proper setup**
   - Create test utilities for common resolver setup
   - Update integration tests to work with new system

## Test Commands

```bash
# Run all tests to see failures
npm test

# Run specific test suites
npm test core/resolvers
npm test interpreter

# Run with specific test name filter
npm test -- -t "LocalResolver"
npm test -- -t "TIME resolver"
```

## Key Files to Review

1. `/grammar/directives/text.peggy` - Fix parser bug
2. `/core/resolvers/LocalResolver.ts` - Fix canResolve logic
3. `/core/resolvers/ResolverManager.ts` - Add case-insensitive lookup
4. `/core/resolvers/builtin/TimeResolver.ts` - Fix context handling
5. `/test-failure-analysis.md` - Detailed test failure analysis

## Success Criteria

- All 53 failing tests should pass
- No regression in existing functionality
- Resolver content type system works as designed
- Clear error messages when content types mismatch

## Tips

- The implementation is sound; these are integration issues
- Focus on the parser bug first - it's the root cause of many failures
- Use the test failure analysis document for specific examples
- Consider creating test helper functions to reduce boilerplate

Good luck! The hard architectural work is done - these are just integration fixes.