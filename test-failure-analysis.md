# MLLD Resolver Test Failure Analysis

## Summary
53 tests are failing after implementing the resolver content type system. The failures fall into several distinct categories.

## Categories of Failures

### 1. **LocalResolver Configuration Issues** (20+ failures)
**Root Cause**: LocalResolver now requires a `basePath` configuration to operate, but tests are trying to use it without any registry configuration.

**Pattern**: 
- `canResolve()` returns false when no config is provided
- ResolverManager can't find any resolver for local file paths
- Tests that directly register LocalResolver without configuring registries fail

**Examples**:
```
MlldResolutionError: No resolver found for reference: /test.mld
MlldResolutionError: No resolver found for reference: /config.json
```

**Fix**: Tests need to either:
1. Configure registries with LocalResolver and basePath
2. Or update LocalResolver to work without explicit config for simple cases

### 2. **Resolver Name Case Sensitivity** (5+ failures)
**Root Cause**: Resolvers were changed to uppercase names (LOCAL, REGISTRY, TIME, DEBUG) but some code still expects lowercase.

**Pattern**:
- Registry configuration validation fails with "Unknown resolver: local"
- Tests expecting lowercase resolver names fail

**Examples**:
```
Error: Unknown resolver: local
Error: Resolver 'REGISTRY' is not in the allowed list
```

**Fix**: 
- Update test registry configurations to use uppercase resolver names
- Ensure resolver name matching is case-insensitive where appropriate

### 3. **Context-Dependent Behavior Changes** (10+ failures)
**Root Cause**: The new content type system changes how resolvers behave in different contexts, but the implementation has issues.

**Pattern**:
- TIME resolver returning wrong content type in different contexts
- DEBUG resolver structure changed (missing expected fields)
- Resolver variables being treated as exec commands

**Examples**:
```
MlldInterpreterError: Variable TIME is not a command (type: text)
Expected 'data' but got 'text' for TIME in import context
DEBUG missing 'version' field
```

**Fix**:
- TIME is being parsed as an exec invocation when used in `@text x = @TIME`
- Need to fix how resolver references are handled vs command references
- Update DEBUG resolver to include all expected fields

### 4. **Parser/AST Issues** (5+ failures)
**Root Cause**: The parser is misinterpreting resolver references as exec invocations in @text directives.

**Pattern**:
- `@text timestamp = @TIME` creates an execInvocation node (source: 'exec') 
- `@data debug = @TIME` correctly creates variable reference (source: 'variable')
- This inconsistency causes the interpreter to look for TIME as a command in text context

**Examples**:
```
# This fails - parsed as exec invocation
@text x = @TIME  
AST: source: 'exec', execInvocation: { commandRef: { name: 'TIME' } }

# This works - parsed as variable reference  
@data x = @TIME
AST: source: 'variable', variableData: { identifier: 'TIME' }
```

**Critical Issue**: This is a grammar bug where the text directive RHS parsing differs from data directive RHS parsing.

**Fix**: Update the grammar so @text handles variable references the same way @data does:
- `@TIME` should always be a variable reference
- `@someCommand()` with parentheses is an exec invocation
- This needs to be fixed in the Peggy grammar files

### 5. **Test Environment Setup** (5+ failures)
**Root Cause**: Tests have incorrect assumptions about the default resolver configuration.

**Pattern**:
- Tests assume resolvers work without any configuration
- Missing resolver registration in some tests
- Incorrect security policy setup

**Examples**:
```
LocalResolver write test expects different error
HTTPResolver cache directory failures
```

**Fix**: Update test setup to properly configure resolvers and registries

### 6. **Module Resolution** (3+ failures)
**Root Cause**: Module resolution changes affected how modules are loaded from resolvers.

**Pattern**:
- `modules-stdlib-basic` can't find http variable
- Registry module resolution failing

**Fix**: Ensure module imports properly resolve through the new content type system

## Specific Test Failures by File

### interpreter/interpreter.fixture.test.ts
- `modules-stdlib-basic`: Variable not found: http
- `resolver-contexts`: TIME treated as command instead of resolver

### core/resolvers/LocalResolver.test.ts
- Write readonly test: Getting wrong error type

### core/resolvers/ResolverManager.test.ts
- Registry allowed list: REGISTRY not in allowed list
- Registry configuration: Unknown resolver: local

### core/resolvers/__tests__/content-types.test.ts
- All LocalResolver tests: No resolver found for reference
- All GitHubResolver tests: No resolver found for reference
- All HTTPResolver tests: No resolver found for reference

### core/resolvers/__tests__/context-behavior.test.ts
- TIME returns wrong content type in import context
- TIME not found in path context
- DEBUG missing version field
- DEBUG wrong context

### core/resolvers/__tests__/path-validation.test.ts
- URL path validation tests failing

## Priority Issues to Fix

### Critical (Blocks many tests):
1. **Parser Bug**: @text directive incorrectly parsing @TIME as exec invocation
   - This is THE root cause of resolver-contexts test failure
   - Affects any @text assignment with resolver references
   
2. **LocalResolver Config**: Requires basePath but tests don't provide it
   - Affects 20+ content-type tests
   - Either make basePath optional or update all tests

### High Priority:
3. **Resolver Name Case**: Tests expect 'local' but code uses 'LOCAL'
   - Simple fix but affects multiple tests
   - Make resolver lookup case-insensitive

4. **Context Handling**: TIME resolver not returning correct content type
   - Import context should return 'data' but returns 'text'
   - Affects context-dependent behavior tests

### Medium Priority:
5. **DEBUG Structure**: Missing expected fields in output
6. **Test Setup**: Need proper registry configuration in tests

## Recommendations

1. **Fix Parser**: Update grammar to properly distinguish resolver references from exec invocations
   - `@TIME` should create a variable reference, not exec invocation
   - This is the root cause of the resolver-contexts test failure

2. **Update LocalResolver**: Either:
   - Make it work without explicit basePath for backward compatibility
   - Or update all tests to configure registries properly

3. **Standardize Resolver Names**: 
   - Use uppercase everywhere consistently
   - Make resolver lookup case-insensitive

4. **Fix Context Handling**:
   - Ensure TIME returns correct content type based on context
   - Fix DEBUG to include all expected fields
   - Properly handle resolver variables in variable context

5. **Update Test Setup**:
   - Create proper test utilities for resolver configuration
   - Ensure all tests properly register and configure resolvers
   - Add registry configuration where needed

6. **Document Changes**:
   - Document the new requirement for registry configuration
   - Explain context-dependent behavior
   - Provide migration guide for existing code