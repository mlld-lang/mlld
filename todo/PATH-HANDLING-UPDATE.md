# Path Handling Architecture Update - REVISED

## Current Implementation Status

The PathContext system has been **partially implemented**. Here's what exists and what remains to be done:

### ✅ Completed

1. **PathContext Infrastructure**
   - `core/services/PathContextService.ts` - Fully implemented with:
     - `PathContext` interface with all required fields
     - `PathContextBuilder` for creating contexts
     - `PathContextService` for validation and utilities
   - Tests exist in `core/services/PathContextService.test.ts`

2. **Environment Integration**
   - Environment accepts both legacy `basePath` string and new `PathContext`
   - Has methods to get path components: `getProjectRoot()`, `getFileDirectory()`, `getExecutionDirectory()`
   - Child environments properly inherit/update PathContext
   - Command executors receive `workingDirectory` from `getExecutionDirectory()`

3. **Interpreter Integration**
   - Interpreter builds PathContext from file path or uses provided context
   - Falls back to legacy behavior for stdin/REPL mode
   - Properly passes PathContext to Environment

### ⚠️ Partially Completed

1. **Import Resolution**
   - ImportResolver still uses `basePath` terminology
   - Has separate `getProjectRoot()` method but not fully integrated with PathContext
   - Needs update to use `fileDirectory` for relative imports consistently

2. **CLI Integration**
   - CLI still passes `basePath` to interpreter
   - Not building PathContext early in the process
   - Still using `path.dirname(input)` calculations

### ❌ Not Completed

1. **Full Migration from basePath**
   - Many components still reference `basePath` internally
   - Environment maintains both `basePath` and `pathContext` for compatibility
   - Need to remove all direct `basePath` usage

2. **Resolver Integration**
   - Resolvers don't use PathContext
   - ConfigLoader doesn't use PathContext for search paths
   - ResolverManager not updated

3. **Error Formatting**
   - Error formatting still uses `basePath` and manual `workingDirectory`
   - Not using `invocationDirectory` for display paths

4. **Documentation and Migration**
   - No migration guide created
   - API documentation not updated
   - Deprecation warnings not added

## Updated Implementation Plan

### Phase 1: Complete Core Integration ✅ DONE

### Phase 2: Fix Import Resolution (Priority: HIGH)

1. **Update ImportResolver**
   ```typescript
   // Change ImportResolverDependencies to use PathContext
   export interface ImportResolverDependencies {
     pathContext: PathContext;
     // Remove basePath, getProjectRoot
   }
   ```

2. **Update Import Logic**
   - Use `pathContext.fileDirectory` for relative imports
   - Use `pathContext.projectRoot` for module resolution
   - Remove basePath references

### Phase 3: Complete CLI Integration (Priority: HIGH)

1. **Update CLI to build PathContext early**
   ```typescript
   // In cli/index.ts
   const pathContext = await PathContextBuilder.fromFile(
     input,
     fileSystem,
     { invocationDirectory: process.cwd() }
   );
   ```

2. **Pass PathContext to interpreter**
   ```typescript
   const interpretResult = await interpret(content, {
     pathContext,  // Instead of basePath
     // ...
   });
   ```

3. **Remove basePath calculations throughout CLI**

### Phase 4: Update Services and Resolvers (Priority: MEDIUM)

1. **Update ResolverManager**
   - Accept PathContext in constructor
   - Pass appropriate paths to individual resolvers

2. **Update ConfigLoader**
   - Use PathContext for config search
   - Search from `fileDirectory` up to `projectRoot`

3. **Update Error Formatting**
   - Use `invocationDirectory` for relative path display
   - Remove manual `workingDirectory` calculations

### Phase 5: Remove Legacy Support (Priority: LOW)

1. **Add Deprecation Warnings**
   - Log warnings when basePath string is used
   - Point users to new PathContext API

2. **Update All Tests**
   - Convert tests to use PathContext
   - Remove basePath-based test utilities

3. **Remove basePath**
   - Remove basePath parameter from Environment
   - Remove all basePath references
   - Update all dependent code

## Key Code Locations to Update

### High Priority Files
- `interpreter/env/ImportResolver.ts` - Remove basePath, use PathContext
- `cli/index.ts` - Build PathContext early, remove basePath calc
- `cli/execution/FileProcessor.ts` - Use PathContext throughout

### Medium Priority Files  
- `core/resolvers/ResolverManager.ts` - Accept PathContext
- `core/config/loader.ts` - Use PathContext for search
- `core/utils/errorFormatSelector.ts` - Use invocationDirectory

### Low Priority Files
- All test files using basePath
- Documentation files
- Example code

## Migration Strategy

1. **Parallel Support Phase** (Current)
   - Both basePath and PathContext work
   - No breaking changes for users

2. **Deprecation Phase** (Next)
   - Add warnings for basePath usage
   - Update documentation
   - Provide migration examples

3. **Removal Phase** (Future)
   - Remove basePath support
   - Clean up compatibility code
   - Simplify interfaces

## Success Metrics

1. ✅ PathContext types and builder exist
2. ✅ Environment uses PathContext internally  
3. ⚠️ Commands execute in correct directory (uses getExecutionDirectory)
4. ❌ Imports resolve from file directory consistently
5. ❌ No direct basePath references remain
6. ❌ All tests pass with PathContext
7. ❌ Documentation updated

## Next Steps

1. **Immediate**: Fix ImportResolver to use PathContext properly
2. **Short-term**: Update CLI to build PathContext early
3. **Medium-term**: Migrate services and resolvers
4. **Long-term**: Remove legacy basePath support

## Notes

- The PathContext system is well-designed and mostly implemented
- The main work is migrating existing code to use it consistently
- Focus should be on high-impact areas first (imports, CLI)
- Keep backward compatibility during migration