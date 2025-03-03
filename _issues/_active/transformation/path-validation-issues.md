# Path Validation Issues

This document covers issues with path validation in transformation mode.

## Common Issues

### 1. Path Validation Not Working in Transformation Mode

**Issue**: When transformation mode is enabled, path validation rules aren't properly enforced, allowing invalid paths.

**Symptoms**:
- Tests expecting errors for invalid path formats don't fail as expected
- Absolute paths (e.g., "/absolute/path") are accepted when they should be rejected
- Paths with dot segments (e.g., "../path/with/dot") are accepted when they should be rejected

**Root Cause**:
Error propagation in transformation mode doesn't properly handle path validation errors. The core issue is that the interpreter isn't configured with `strict: true` in transformation mode.

### 2. Inconsistent Error Messages

**Issue**: Error messages for path validation don't match the expected formats in tests.

**Symptoms**:
- Tests expect "Path directive must use a special path variable" but get a different message
- Tests expect "Path cannot contain relative segments" but get a different message
- Tests fail even when validation is occurring correctly due to message differences

**Root Cause**:
Error message formats have been updated in the code but not in the tests, causing mismatch between expected and actual error messages.

### 3. Path Variable Handling Inconsistency

**Issue**: Path variables are not handled consistently between sync and async validation methods.

**Symptoms**:
- Path variables work in some contexts but not others
- Path variables are correctly validated in sync methods but rejected in async methods
- Error messages indicate paths must start with $. or $~ but don't mention path variables

**Root Cause**:
There are inconsistencies between the `validateStructuredPathSync` and `validateStructuredPath` methods in handling path variables.

## Detailed Analysis

### Path Validation Rules

Meld enforces several security-focused path validation rules:

1. **No Raw Absolute Paths**: Paths like "/absolute/path" are rejected
2. **No Relative Segments**: Paths containing "../" or "./" are rejected
3. **Special Path Variables**: Paths with segments must use special variables like $PROJECTPATH, $HOMEPATH, or their aliases $. and $~
4. **Path Variables Allowed**: User-defined path variables should be valid

### Path Validation Flow

The path validation flow in Meld works like this:

```
1. main() function in api/index.ts
   |
2. PathDirectiveHandler.execute() 
   |
3. ValidationService.validate() -> PathDirectiveValidator.validatePathDirective()
   |
4. ResolutionService.resolveInContext() -> resolveStructuredPath()
   |
5. PathService.validatePath() -> validateStructuredPath()
```

### Error Handling Issue in Transformation Mode

In the main API function in `api/index.ts`, the interpreter is called without the `strict: true` option when transformation is enabled:

```typescript
// Current code in main()
const resultState = await services.interpreter.interpret(ast, { 
  filePath, 
  initialState: services.state
});
```

Without `strict: true`, errors occurring during interpretation (like path validation errors) are being caught and handled internally rather than propagating up to the caller.

### Path Variable Handling Inconsistency

The sync and async path validation methods have inconsistent handling of path variables:

```typescript
// In validateStructuredPathSync
const hasPathVar = (structured.variables?.path?.length ?? 0) > 0;
if (hasSlashes && !hasSpecialVar && !hasPathVar && !structured.cwd) {
  throw new PathValidationError(
    'Paths with segments must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths',
    PathErrorCode.INVALID_PATH_FORMAT
  );
}

// In validateStructuredPath (async version)
// Missing check for hasPathVar
if (hasSlashes && !hasSpecialVar && !structured.cwd) {
  throw new PathValidationError(
    'Paths with segments must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths',
    PathErrorCode.INVALID_PATH_FORMAT
  );
}
```

The async version is missing the check for path variables, causing path variables to be incorrectly rejected.

## Comprehensive Solution

### 1. Fix Error Propagation in main() function

Update the main API function in `api/index.ts` to use `strict: true` in the interpreter options:

```typescript
// In api/index.ts
const resultState = await services.interpreter.interpret(ast, { 
  filePath, 
  initialState: services.state,
  strict: true  // Add this option to ensure errors propagate
});
```

### 2. Fix Path Variable Handling in Async Validation

Update the `validateStructuredPath` method to match the sync version's handling of path variables:

```typescript
// In PathService.ts validateStructuredPath method
const hasPathVar = (structured.variables?.path?.length ?? 0) > 0;

// Update validation check to include hasPathVar
if (hasSlashes && !hasSpecialVar && !hasPathVar && !structured.cwd) {
  throw new PathValidationError(
    'Paths with segments must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths, or use a path variable ($variableName)',
    PathErrorCode.INVALID_PATH_FORMAT
  );
}
```

### 3. Fix Error Message Expectations in Tests

Update tests to match the current error message format:

```typescript
// Before
await expect(main('test.meld', {...}))
  .rejects.toThrow('Path cannot contain relative segments');

// After
await expect(main('test.meld', {...}))
  .rejects.toThrow('Paths with segments must start with $. or $~');
```

### 4. Add Path Variable Resolution in resolveStructuredPath

Add specific handling for path variables in `resolveStructuredPath`:

```typescript
// Add this section before the unhandled case
if ((structured.variables?.path?.length ?? 0) > 0) {
  // The path is already resolved through variable resolution
  // Just return the resolved path
  const resolvedPath = path.normalize(path.join(baseDir || process.cwd(), ...structured.segments));
  
  console.log('PathService: Resolved path variable path:', {
    raw,
    baseDir: baseDir || process.cwd(),
    segments: structured.segments,
    resolvedPath
  });
  
  return resolvedPath;
}
```

## Debugging Approaches

### 1. Trace Path Validation

To verify that path validation is being properly applied:

```typescript
// Before validation
console.log('Validating path:', {
  path: pathValue,
  isAbsolute: path.isAbsolute(pathValue),
  hasDotSegments: pathValue.includes('./') || pathValue.includes('../'),
  hasSpecialVariable: pathValue.startsWith('$.') || pathValue.startsWith('$~')
});

// After validation attempt
console.log('Path validation result:', {
  valid: true, // If we got here, validation passed
  resolvedPath
});
```

### 2. Debug Error Propagation

To verify that errors are properly propagating:

```typescript
try {
  const resultState = await services.interpreter.interpret(ast, { 
    filePath, 
    initialState: services.state,
    strict: true
  });
  console.log('Interpretation succeeded');
  return resultState;
} catch (error) {
  console.log('Error during interpretation:', {
    message: error.message,
    code: error.code,
    stack: error.stack
  });
  throw error; // Re-throw to ensure it propagates to the caller
}
```

### 3. Check Path Variable Handling

To verify that path variables are being properly handled:

```typescript
// Define a path variable
context.services.state.setPathVar('importedFile', '$PROJECTPATH/test.meld');

// Use the path variable in a directive
context.fs.writeFileSync('test.meld', '@import [$importedFile]');

// Check if path variable is recognized
console.log('Path variable value:', context.services.state.getPathVar('importedFile'));
```

## Key Lessons and Testing Patterns

1. **Always Use Strict Mode**: When using the interpreter, always use `strict: true` to ensure errors propagate properly:
   ```typescript
   const resultState = await services.interpreter.interpret(ast, { 
     filePath, 
     initialState: services.state,
     strict: true
   });
   ```

2. **Test Path Validation Rules**: Create tests that verify path validation rules are properly enforced:
   ```typescript
   // Test raw absolute path rejection
   context.fs.writeFileSync('test.meld', '@path bad = "/absolute/path"');
   await expect(main('test.meld', {
     fs: context.fs,
     services: context.services,
     transformation: true
   })).rejects.toThrow(/special path variable/i);
   
   // Test dot segment rejection
   context.fs.writeFileSync('test.meld', '@path bad = "../path/with/dot"');
   await expect(main('test.meld', {
     fs: context.fs,
     services: context.services,
     transformation: true
   })).rejects.toThrow(/relative segments/i);
   ```

3. **Test Path Variable Resolution**: Verify that path variables work correctly:
   ```typescript
   // Test path variable usage
   context.services.state.setPathVar('configPath', '$PROJECTPATH/config');
   context.fs.writeFileSync('test.meld', '@import [$configPath/settings.meld]');
   
   // Should not throw an error
   const result = await main('test.meld', {
     fs: context.fs,
     services: context.services,
     transformation: true
   });
   ```

4. **Use Debug Flags**: When troubleshooting path issues, use the `--debug-paths` flag:
   ```bash
   meld process test.meld --debug-paths
   ```

## Related Test Failures

The following tests are failing due to path validation issues:

1. In `api/integration.test.ts`:
   - "should reject invalid path formats (raw absolute paths)"
   - "should reject invalid path formats (relative paths with dot segments)"

2. In `services/fs/PathService/PathService.tmp.test.ts`:
   - "should reject raw absolute paths"
   - "should reject paths with slashes but no path variable"

Fixing the error propagation and updating the test expectations should resolve these failures. 