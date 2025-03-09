# TSyringe Dependency Injection Migration: Status Report

## Current Status Summary

- ✅ Implemented Service Mediator pattern to break circular dependencies
- ✅ Fixed core dependency injection issues in StateService and VariableReferenceResolver
- ✅ Fixed the PathService and FileSystemService to work with the Service Mediator
- ❌ 43 failing tests that need to be addressed

## Remaining Test Failures

The 43 failing tests fall into several distinct categories:

### 1. PathService Tests (13 failures in `PathService.tmp.test.ts`)

These tests are failing because the current PathService implementation doesn't correctly implement path normalization and validation rules. The tests expect:

- Special paths like `$~/path/to/file.meld` should resolve to `/home/user/path/to/file.meld`
- Paths with `.` and `..` segments should be rejected
- Raw absolute paths should be rejected
- Paths with slashes but no path variable should be rejected

**Root Cause**: The original path normalization features were not implemented in the `PathService` despite the tests expecting this behavior.

### 2. API Integration Tests (2 failures in `api/integration.test.ts`)

These tests have similar path validation expectations to the `PathService.tmp.test.ts` tests:
- `should reject invalid path formats (raw absolute paths)`
- `should reject invalid path formats (relative paths with dot segments)`

### 3. Variable Index Debug Tests (2 failures in `tests/variable-index-debug.test.ts`)

These tests are failing because of method naming inconsistencies in the `VariableReferenceResolver`:
- `privateResolver.resolveFieldAccess is not a function`
- `Cannot read properties of undefined (reading 'bind')`

### 4. CLI Error Handling Tests (2 failures in `tests/cli/cli-error-handling.test.ts`)

These tests are failing because console mocks aren't being called correctly:
- `expected "spy" to be called at least once`

### 5. InterpreterService Integration Tests (12 failures in `InterpreterService.integration.test.ts`)

Multiple failures related to error handling and circular import detection:
- State rollback on merge errors
- Circular import detection
- Error information and handling

### 6. ResolutionService Tests (12 failures in `ResolutionService.test.ts`)

Failures related to validation and circular reference detection:
- Variable validation
- Command reference validation
- Circular reference detection

## Action Plan

### 1. Fix the PathService Implementation

Rather than accepting the path normalization failures as "expected", we should fix the PathService implementation to match the expected behavior in tests:

```typescript
// Example of needed changes in PathService.ts
resolvePath(filePath: string | StructuredPath, baseDir?: string): string {
  // ...existing code...
  
  // Handle special path variables correctly
  if (typeof filePath === 'string') {
    // Implement $~ and $. path resolution
    if (filePath.startsWith('$~/') || filePath === '$~') {
      return this.resolveHomePath(filePath.replace('$~', this.homePath));
    }
    
    if (filePath.startsWith('$./') || filePath === '$.') {
      return this.resolveProjectPath(filePath.replace('$.', this.projectPath));
    }
    
    // Reject paths with . and .. segments
    if (filePath.includes('./') || filePath.includes('../')) {
      throw new PathValidationError(
        PathErrorMessages.validation.dotSegments.message,
        PathErrorCode.CONTAINS_DOT_SEGMENTS
      );
    }
    
    // Reject raw absolute paths
    if (path.isAbsolute(filePath)) {
      throw new PathValidationError(
        PathErrorMessages.validation.rawAbsolutePath.message,
        PathErrorCode.INVALID_PATH_FORMAT
      );
    }
    
    // Reject paths with slashes but no path variable
    if (filePath.includes('/') && !this.hasPathVariables(filePath)) {
      throw new PathValidationError(
        PathErrorMessages.validation.slashesWithoutPathVariable.message,
        PathErrorCode.INVALID_PATH_FORMAT
      );
    }
  }
  
  // ...rest of the method...
}
```

### 2. Fix VariableReferenceResolver

Update method naming to ensure consistency:

```typescript
// Check if method names match the test expectations
// If resolveFieldAccess was renamed, we should update either the test or the implementation
```

### 3. Fix CLI Error Handling Tests

Correct the test setup for console mocks to ensure they're properly called.

### 4. Fix InterpreterService Integration Tests

Address circular import detection and error handling in the InterpreterService.

### 5. Fix ResolutionService Tests

Implement proper validation and circular reference detection.

## Next Steps

1. **Don't accept test failures as "expected"** - Fix the actual issues
2. Prioritize fixing the tests in this order:
   1. PathService and API integration tests (15 failures)
   2. VariableReferenceResolver tests (2 failures)
   3. CLI error handling tests (2 failures)
   4. InterpreterService tests (12 failures)
   5. ResolutionService tests (12 failures)
3. Update the path normalization implementation to match the test expectations
4. Create verification tests to ensure the fixes work properly

## Conclusion

Rather than accepting the failing tests as "expected" and postponing fixes to a later task, we should address the issues directly. The original DI migration led to broken functionality that needs to be fixed as part of this task. While the path normalization functionality wasn't fully implemented initially, the tests clearly expect certain path validation behavior that should be implemented. 