# Resolver Content Type Implementation - Phase 3 & 4 Plan

## Current Status

**Completed Phases:**
- ✅ Phase 1: Resolver Content Type Implementation
  - Updated type definitions (removed ResourceType, added ContentType)
  - Updated all resolvers with content type support
  - Implemented context-dependent behavior for built-in resolvers
  
- ✅ Phase 2: Import/Path Evaluator Updates  
  - Updated Environment.resolveModule() to return full ResolverContent
  - Added content type validation in import evaluator (modules only)
  - Added content type validation in path evaluator (reject modules)

**Remaining Phases:**
- Phase 3: Update Environment.ts resolver variable handling
- Phase 4: Create comprehensive test suite for resolver content types

## Phase 3: Update Environment.ts Resolver Variable Handling

### Background
The Environment class manages resolver variables (like @TIME, @DEBUG, @INPUT, @PROJECTPATH). These need to be updated to work properly with the new content type system and context-dependent behavior.

### Key Files to Update
- `/interpreter/env/Environment.ts` - Main environment class
- `/interpreter/eval/` - Various evaluators that use resolver variables

### Implementation Tasks

1. **Update getResolverVariable() method**
   - Currently in Environment.ts around line 600-700
   - Need to pass 'variable' context when resolving
   - Should handle the returned ResolverContent properly
   - Example pattern:
   ```typescript
   const resolverContent = await this.resolveModule(`@${resolverName}`, 'variable');
   // Convert content based on contentType
   ```

2. **Update initializeResolverVariables() method**
   - Need to ensure resolver variables are initialized with proper content types
   - Handle both text and data content types appropriately
   - Special handling for context-dependent resolvers (TIME, DEBUG)

3. **Fix Variable Reference Handling**
   - Update anywhere that references resolver variables (e.g., @TIME in expressions)
   - Ensure the content type is respected when evaluating
   - Check interpolation context in `/interpreter/core/interpolation-context.ts`

4. **Special Cases to Handle**
   - @TIME: Returns text in variable context, data in import context
   - @DEBUG: Returns data object in variable context
   - @INPUT: Returns merged stdin/env data
   - @PROJECTPATH: Returns project path as text

### Testing Checklist
- [ ] @TIME works in text templates: `@text greeting = [[Hello at {{TIME}}]]`
- [ ] @DEBUG works as variable: `@data info = @DEBUG`
- [ ] @INPUT works with stdin data
- [ ] @PROJECTPATH returns correct path
- [ ] Resolver variables work in expressions and interpolation

## Phase 4: Create Comprehensive Test Suite

### Test Structure
Create new test files in `/core/resolvers/__tests__/` directory:

1. **content-types.test.ts**
   - Test content type detection for all resolvers
   - Test context-dependent behavior
   - Test content type validation in imports/paths

2. **context-behavior.test.ts**
   - Test each resolver in different contexts (import, path, variable)
   - Verify proper errors for unsupported contexts
   - Test built-in resolver context switching

3. **import-validation.test.ts**
   - Test importing modules vs non-modules
   - Test error messages for content type mismatches
   - Test module resolution through ResolverManager

4. **path-validation.test.ts**
   - Test path directive with different content types
   - Verify modules are rejected with proper error
   - Test text/data content handling

### Test Cases to Include

#### Content Type Detection Tests
```typescript
describe('Content Type Detection', () => {
  it('should detect .mld files as modules', async () => {
    // Test LocalResolver, GitHubResolver, HTTPResolver
  });
  
  it('should detect .json files as data', async () => {
    // Test detection logic
  });
  
  it('should parse content to detect mlld modules', async () => {
    // Test content-based detection
  });
});
```

#### Context-Dependent Behavior Tests
```typescript
describe('Context-Dependent Resolvers', () => {
  it('TIME resolver returns text in variable context', async () => {
    // Test @TIME as variable
  });
  
  it('TIME resolver returns data in import context', async () => {
    // Test @import { iso, unix } from @TIME
  });
  
  it('DEBUG resolver returns appropriate data per context', async () => {
    // Test different contexts
  });
});
```

#### Import/Path Validation Tests
```typescript
describe('Import Content Type Validation', () => {
  it('should reject non-module imports', async () => {
    // Test importing a text file
    // Expect error: "Import target is not a module"
  });
  
  it('should accept module imports', async () => {
    // Test importing .mld files
  });
});

describe('Path Content Type Validation', () => {
  it('should reject module content in paths', async () => {
    // Test @path config = @user/module
    // Expect error: "Cannot use module as path"
  });
  
  it('should accept text/data content in paths', async () => {
    // Test valid path assignments
  });
});
```

### Integration Test Cases
Add test cases to `/tests/cases/valid/` for:
- `resolver-content-types/` - Various content type scenarios
- `resolver-contexts/` - Context-dependent behavior
- `import-content-validation/` - Import validation scenarios
- `path-content-validation/` - Path validation scenarios

### Error Test Cases
Add test cases to `/tests/cases/exceptions/` for:
- `import-non-module/` - Attempting to import non-module content
- `path-module-content/` - Using module in path directive

## Implementation Notes

1. **Backward Compatibility**
   - Ensure existing tests still pass
   - Don't break current resolver variable usage
   - Maintain existing error message formats where possible

2. **Error Messages**
   - Clear, actionable error messages
   - Include content type in error when relevant
   - Suggest correct usage (e.g., "modules must be imported")

3. **Performance Considerations**
   - Cache resolver content appropriately
   - Avoid redundant content type detection
   - Use existing cache mechanisms

4. **Code Quality**
   - Follow existing patterns in codebase
   - Add JSDoc comments for new methods
   - Use TypeScript types strictly

## Success Criteria

Phase 3 is complete when:
- All resolver variables work in their respective contexts
- Content types are properly handled throughout variable resolution
- Existing tests pass without modification

Phase 4 is complete when:
- Comprehensive test coverage for content types
- All context-dependent behaviors are tested
- Import/path validation is thoroughly tested
- Integration tests demonstrate real-world usage

## Quick Start for Next Developer

1. **Check current state:**
   ```bash
   npm run build  # Should succeed
   npm test       # Check baseline
   ```

2. **Start with Phase 3:**
   - Open `/interpreter/env/Environment.ts`
   - Search for `getResolverVariable` method
   - Update to use new `resolveModule()` with context

3. **Test as you go:**
   ```bash
   npm test interpreter/env
   ```

4. **Move to Phase 4:**
   - Create test directory: `/core/resolvers/__tests__/`
   - Start with content type detection tests
   - Build up to integration tests

5. **Run full test suite:**
   ```bash
   npm test
   ```

Good luck! The foundation is solid - you're just adding the finishing touches to ensure resolver content types work seamlessly throughout the system.