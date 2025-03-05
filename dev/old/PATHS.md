# Path Handling Temporary Solution

## Context

The Meld interpreter currently has path-related issues affecting multiple directives:

1. Path alias syntax ($./path and $~/path) cannot be properly parsed by meld-ast
2. Path resolution needs to be consistent across @import, @embed, and @path directives
3. Import directives have additional complexity with named imports

### Current Issues

1. **Parser Limitations**
   - meld-ast cannot properly handle our path alias syntax
   - This affects all directives that use paths
   - We need a temporary solution until meld-ast is updated

2. **Directive-Specific Requirements**
   - @import: Needs to handle named imports and path resolution
   - @embed: Needs path resolution only
   - @path: Needs path resolution and validation

3. **Security and Validation**
   - All paths must be properly validated
   - Security constraints must be maintained
   - Path resolution must be consistent

## Proposed Solution

### 1. Enhanced PathService

Instead of handling path resolution in individual directive handlers or the parser, we'll enhance PathService to handle all path-related functionality:

```typescript
class PathService {
  resolveAliasedPath(rawPath: string, context: PathContext): string {
    // Handle $./path and $~/path consistently
    // Apply security constraints
    // Return resolved absolute path
  }

  validatePath(path: string, context: PathContext): void {
    // Validate path meets security requirements
    // Throw appropriate errors if invalid
  }
}

interface PathContext {
  directiveType: 'import' | 'embed' | 'path';
  currentFilePath?: string;  // For relative resolution
  importNames?: string[];    // Only for @import
}
```

### 2. Implementation Steps

1. **Disable meld-ast Path Validation**
   - Set `validateNodes: false` in parser options
   - Add TODO comment for future re-enablement

2. **Update PathService**
   - Add new path resolution methods
   - Implement path alias handling
   - Add directive-specific context handling

3. **Update Directive Handlers**
   - Modify handlers to use enhanced PathService
   - Remove duplicate path handling code
   - Add appropriate context information

### 3. Path Resolution Rules

1. **Path Aliases**
   ```typescript
   const PATH_ALIAS_PATTERN = /^\$(\.\/|~\/)/;
   ```
   - $./path resolves relative to project root
   - $~/path resolves relative to user home
   - Must be properly quoted in directives

2. **Security Constraints**
   - Simple current directory references:
     - Allowed only when path contains no slashes
     - Example: `@import [file.meld]`
   - All other paths must use path variables:
     - Must start with $ (a path variable)
     - Path variables can only be created via @path directive
     - @path directives must be rooted in special variables:
       - $HOMEPATH (or $~) for home directory
       - $PROJECTPATH (or $.) for project root
   - Strictly forbidden:
     - Parent directory references (..)
     - Current directory references (.)
     - Raw absolute paths
     - Paths with slashes not using path variables

3. **Import-Specific Handling**
   - Support both formats:
     ```meld
     @import [$./file.meld]
     @import [x,y,z] from [$./file.meld]
     ```
   - Parse import names when present
   - Validate import path exists

### 4. Error Handling

1. **Path Resolution Errors**
   ```typescript
   class PathResolutionError extends MeldError {
     constructor(
       message: string,
       public directiveType: string,
       public rawPath: string
     ) {
       super(message);
     }
   }
   ```

2. **Validation Errors**
   - Clear error messages with context
   - Specific error codes for different issues
   - Helpful suggestions in error messages

## Migration Path

1. **Phase 1 (Current)**
   - Implement enhanced PathService
   - Update directive handlers
   - Add comprehensive tests
   - Update documentation

2. **Phase 2 (When meld-ast is updated)**
   - Re-enable meld-ast path validation
   - Remove temporary path resolution code
   - Update tests and documentation

3. **Phase 3 (Future)**
   - Consider additional path features
   - Evaluate security enhancements
   - Consider caching for performance

## Implementation Notes

1. **Testing**
   - Test all path resolution scenarios
   - Test security constraints
   - Test error handling
   - Test across all directive types

2. **Documentation**
   - Update handler documentation
   - Add path resolution examples
   - Document security constraints
   - Add migration notes

3. **Performance**
   - Consider caching resolved paths
   - Minimize filesystem operations
   - Profile path resolution impact

## Future Considerations

1. **Enhanced Path Features**
   - Consider additional alias types
   - Evaluate path normalization needs
   - Consider Windows path support

2. **Security Enhancements**
   - Add path allow/deny lists
   - Consider sandbox environments
   - Add path access auditing

3. **Integration**
   - Plan for meld-ast updates
   - Consider build tool integration
   - Plan for IDE support 