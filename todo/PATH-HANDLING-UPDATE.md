# Path Handling Architecture Update

## Current Problem

The mlld codebase has significant confusion and inconsistency in how it handles paths. The core issue is that we use vague terms like `basePath` that mean different things in different contexts:

1. **In CLI**: `basePath` = directory of the input file
2. **In Interpreter**: `basePath` gets overridden to be the project root
3. **In Environment**: `basePath` is used as the working directory for commands
4. **In various commands**: Some use `process.cwd()`, others use file directory

This leads to several problems:
- Imports may resolve from unexpected locations
- Commands may execute in unexpected directories
- Configuration may be loaded from wrong locations
- Error messages show inconsistent paths
- Code duplication as each component calculates paths differently

### Specific Issues Found

1. **CLI/Interpreter Mismatch**:
   ```typescript
   // CLI (cli/index.ts:231)
   basePath: path.resolve(path.dirname(input))
   
   // Interpreter (interpreter/index.ts:183)
   const projectRoot = await findProjectRoot(searchStartPath, options.fileSystem);
   const env = new Environment(..., projectRoot); // Overrides basePath!
   ```

2. **Command Execution Confusion**:
   ```typescript
   // Environment uses basePath as working directory
   // But basePath might be project root, not file directory
   ```

3. **Import Resolution Ambiguity**:
   - Should `./file.mld` resolve from file directory or project root?
   - Current behavior is inconsistent

## Proposed Solution

Create a clear separation of path concepts through a `PathContext` system that explicitly defines:

1. **Project Root**: Where mlld.lock.json lives (for modules, configuration)
2. **File Directory**: Directory of the current .mld file (for relative imports)
3. **Execution Directory**: Where shell commands run (usually file directory)
4. **Invocation Directory**: Where mlld CLI was invoked (for display)

### Core Architecture

```typescript
/**
 * PathContext provides a clear, consistent model for all path operations
 * in the mlld system. Each path has a specific purpose and clear semantics.
 */
interface PathContext {
  /**
   * The mlld project root directory.
   * - Contains mlld.lock.json
   * - Base for module resolution (@user/module)
   * - Base for @base variable
   * - Used for security boundaries
   */
  projectRoot: string;
  
  /**
   * Directory containing the current .mld file being processed.
   * - Base for relative imports (./file.mld)
   * - Base for relative file references
   * - Default working directory for commands
   */
  fileDirectory: string;
  
  /**
   * Full absolute path to current file.
   * - Used for error reporting
   * - Used for import cycle detection
   * - Optional (e.g., when processing stdin)
   */
  filePath?: string;
  
  /**
   * Directory where shell commands execute.
   * - Defaults to fileDirectory
   * - Can be overridden for special cases
   * - Used by /run and /exe directives
   */
  executionDirectory: string;
  
  /**
   * Directory where mlld CLI was invoked.
   * - Used for user-friendly path display
   * - Used for relative path output
   * - Always process.cwd()
   */
  invocationDirectory: string;
}
```

### Key Principles

1. **@base always refers to projectRoot**
   - This is the directory containing mlld.lock.json
   - Found by searching up from the file's directory
   - Consistent across all files in a project

2. **Relative paths are always relative to the file**
   - `./data.json` in `/project/src/script.mld` → `/project/src/data.json`
   - This matches user expectations from other languages
   - Applies to imports, file references, etc.

3. **Commands execute where the file lives**
   - Makes file-relative operations natural
   - Can access sibling files easily
   - Matches typical scripting behavior

## Implementation Plan

### Phase 1: Create PathContext Infrastructure

1. **Add PathContext types** (`core/types/path.ts`):
   ```typescript
   export interface PathContext { ... }
   export class PathContextBuilder { ... }
   ```

2. **Create PathContext service** (`core/services/PathContextService.ts`):
   - Build context from file path
   - Build context from defaults
   - Validate contexts
   - Handle edge cases (stdin, no project root, etc.)

3. **Add tests** (`core/services/PathContextService.test.ts`):
   - Test project root discovery
   - Test relative path scenarios
   - Test edge cases

### Phase 2: Update Core Components

1. **Update Environment** (`interpreter/env/Environment.ts`):
   - Accept PathContext in constructor
   - Remove ambiguous `basePath` parameter
   - Update child environment creation
   - Deprecate old constructor signature

2. **Update Interpreter** (`interpreter/index.ts`):
   - Build PathContext from file path
   - Pass context to Environment
   - Remove basePath/projectRoot confusion

3. **Update ImportResolver** (`interpreter/env/ImportResolver.ts`):
   - Use `fileDirectory` for relative imports
   - Use `projectRoot` for module resolution
   - Clear separation of concerns

4. **Update CommandExecutor** (`interpreter/env/executors/`):
   - Use `executionDirectory` as working directory
   - Remove basePath ambiguity

### Phase 3: Update CLI Integration

1. **Update CLI** (`cli/index.ts`):
   - Build PathContext early
   - Pass to all commands consistently
   - Remove duplicate path calculations

2. **Update FileProcessor** (`cli/execution/FileProcessor.ts`):
   - Use PathContext throughout
   - Remove basePath calculations

3. **Update Commands** (`cli/commands/`):
   - Update run, test, etc. to use PathContext
   - Remove `process.cwd()` calls
   - Use consistent path handling

### Phase 4: Update Resolvers and Services

1. **Update ResolverManager** (`core/resolvers/ResolverManager.ts`):
   - Accept PathContext
   - Use projectRoot for configuration
   - Pass appropriate context to resolvers

2. **Update ConfigLoader** (`core/config/loader.ts`):
   - Search from fileDirectory up to projectRoot
   - Clear precedence rules

3. **Update Error Formatting** (`core/utils/errorFormatSelector.ts`):
   - Use invocationDirectory for display paths
   - Show project-relative paths when appropriate

### Phase 5: Migration and Cleanup

1. **Add compatibility layer**:
   - Support old basePath parameter temporarily
   - Log deprecation warnings
   - Build PathContext from legacy parameters

2. **Update all tests**:
   - Use PathContext in tests
   - Remove basePath assumptions
   - Add path scenario tests

3. **Update documentation**:
   - Document path handling clearly
   - Update API docs
   - Add migration guide

4. **Remove deprecated code**:
   - Remove basePath parameters
   - Remove duplicate path calculations
   - Clean up interfaces

## Migration Strategy

### For Internal Code

1. **Parallel Support**: Add PathContext alongside existing parameters
2. **Gradual Migration**: Update components one by one
3. **Test Coverage**: Ensure tests pass at each step
4. **Deprecation**: Mark old parameters as deprecated
5. **Cleanup**: Remove deprecated code after full migration

### For API Users

The public API change will be minimal:

```typescript
// Old API (still supported initially)
await processMlld(content, {
  basePath: '/path/to/project',
  // ...
});

// New API (recommended)
await processMlld(content, {
  filePath: '/path/to/file.mld', // We build context from this
  // ...
});

// Or explicit context
await processMlld(content, {
  pathContext: customContext,
  // ...
});
```

## Benefits

1. **Clarity**: No ambiguity about what each path means
2. **Consistency**: Same behavior across all components
3. **Correctness**: Fixes current bugs with path resolution
4. **Maintainability**: Single source of truth for path logic
5. **Testability**: Easy to test different path scenarios
6. **User Experience**: Predictable, intuitive behavior

## Success Criteria

1. All path parameters have clear, unambiguous names
2. No component calculates paths independently
3. All tests pass with new architecture
4. Documentation clearly explains path handling
5. Migration path provided for existing code
6. No performance regression

## Timeline Estimate

- Phase 1: 2-3 days (Core infrastructure)
- Phase 2: 3-4 days (Core components)
- Phase 3: 2-3 days (CLI integration)
- Phase 4: 2-3 days (Services update)
- Phase 5: 3-4 days (Migration and cleanup)

Total: ~3 weeks for complete implementation

## Open Questions

1. Should we support overriding executionDirectory via CLI flag?
2. How should we handle the case where no project root exists?
3. Should we cache PathContext for performance?
4. Do we need additional path types (e.g., cacheDirectory)?

## Next Steps

1. Review and approve this specification
2. Create PathContext types and builder
3. Begin phased implementation
4. Update documentation as we go
5. Announce deprecation schedule