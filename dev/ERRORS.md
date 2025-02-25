# Updated Error Handling Architecture Implementation Plan

## Overview

The current issue is that your codebase has two conflicting approaches to error handling:

1. **Service-level tests**: Expect strict error throwing for validation failures
2. **CLI/Integration tests**: Expect permissive behavior with warnings for recoverable issues

I've already implemented the core infrastructure for a configurable error handling system that can operate in both strict and permissive modes. Here's the complete implementation plan with the remaining steps:

## Phase 1: Core Error Infrastructure (Completed)

✅ Created `ErrorSeverity` enum with Fatal, Recoverable, and Warning levels  
✅ Enhanced `MeldError` base class with severity and context support  
✅ Updated `InterpreterOptions` to include strict mode and error handler  
✅ Updated `InterpreterService` to handle errors based on severity and mode  
✅ Updated `CLIService` to use permissive mode by default  
✅ Updated core error classes to use the new severity system:
   - ✅ MeldParseError
   - ✅ MeldDirectiveError
   - ✅ MeldResolutionError
   - ✅ MeldInterpreterError
   - ✅ PathValidationError
   - ✅ MeldFileNotFoundError

## Phase 2: Service Layer Updates (1-2 days)

### 1. Update Remaining Error Classes

- [ ] Update MeldImportError
- [ ] Update MeldOutputError
- [ ] Update MeldFileSystemError

### 2. Update Resolution Service & Resolvers

- [ ] Update ResolutionService to handle severity levels
- [ ] Update DataResolver to use recoverable errors for missing fields
- [ ] Update TextResolver to use recoverable errors for undefined variables
- [ ] Update CommandResolver to use appropriate severity for parameter mismatches
- [ ] Update PathResolver to classify path errors by severity
- [ ] Update VariableReferenceResolver to handle undefined variables as recoverable

### 3. Update Validation Service

- [ ] Update ValidationService to classify validation errors by severity
- [ ] Update validators to use appropriate severity levels

## Phase 3: Handler Updates (1-2 days)

### 1. Update Directive Handlers

- [ ] Update TextDirectiveHandler to use recoverable errors
- [ ] Update DataDirectiveHandler to use recoverable errors
- [ ] Update PathDirectiveHandler to use appropriate severity
- [ ] Update DefineDirectiveHandler to use appropriate severity
- [ ] Update RunDirectiveHandler to handle command errors appropriately
- [ ] Update EmbedDirectiveHandler to use recoverable errors for missing files
- [ ] Update ImportDirectiveHandler to use appropriate severity levels

### 2. Update Error Propagation

- [ ] Ensure errors are properly propagated through the service chain
- [ ] Add context information to errors for better debugging
- [ ] Implement consistent error handling patterns across handlers

## Phase 4: Test Updates (2-3 days)

### 1. Update Unit Tests

- [ ] Update resolver tests to verify error severity
- [ ] Update service tests to test both strict and permissive modes
- [ ] Update handler tests to verify error classification
- [ ] Add new tests for error severity classification

### 2. Update Integration Tests

- [ ] Enable skipped CLI tests with appropriate expectations
- [ ] Add tests for strict mode behavior
- [ ] Add tests for permissive mode behavior
- [ ] Verify warning generation in permissive mode

### 3. Add Test Utilities

- [ ] Create error assertion helpers for testing severity
- [ ] Add test utilities for verifying warning generation
- [ ] Create test helpers for running in different error modes

## Phase 5: Documentation and Cleanup (1 day)

- [ ] Update error handling documentation
- [ ] Add examples of strict vs. permissive mode usage
- [ ] Document error severity classification
- [ ] Clean up any remaining TODOs related to error handling

## Implementation Strategy

### Error Classification Guidelines

Here's how different types of errors should be classified:

#### Fatal Errors (Always Throw)
- Syntax errors (MeldParseError)
- Circular imports (DirectiveError with CIRCULAR_REFERENCE)
- Invalid directive types (DirectiveError with HANDLER_NOT_FOUND)
- Missing required fields in directives (DirectiveError with VALIDATION_FAILED)
- Type validation failures (PathValidationError with INVALID_PATH)
- File system access errors (MeldFileSystemError)
- Service initialization errors (ServiceInitializationError)

#### Recoverable Errors (Warnings in Permissive Mode)
- Missing data fields (MeldResolutionError)
- Undefined variables (MeldResolutionError)
- Missing environment variables (MeldResolutionError)
- File not found for embed/import (MeldFileNotFoundError)
- Invalid field access (MeldResolutionError)
- Command execution failures (MeldInterpreterError)

#### Always Warnings (Never Throw)
- Deprecated features
- Performance suggestions
- Non-critical validation issues

### Implementation Approach

1. **Start with Core Services**
   - Focus on the most critical services first (ResolutionService, ValidationService)
   - Update error handling in these services to use the new severity system
   - Ensure backward compatibility with existing tests

2. **Update Handlers Incrementally**
   - Update one handler at a time, starting with the most commonly used
   - Add tests for both strict and permissive modes
   - Verify that existing tests still pass

3. **Enable Skipped Tests**
   - As each component is updated, enable the corresponding skipped tests
   - Update test expectations to match the new error handling behavior
   - Add new tests for permissive mode behavior

4. **Maintain Backward Compatibility**
   - Ensure all existing tests continue to pass
   - Add new tests without breaking existing ones
   - Use the strict mode by default in unit tests

## Example Implementation for a Resolver

Here's an example of how to update the DataResolver to handle undefined variables as recoverable errors:

```typescript
// Before
if (!dataVar) {
  throw new MeldResolutionError(`Data variable not found: ${name}`);
}

// After
if (!dataVar) {
  throw new MeldResolutionError(`Data variable not found: ${name}`, {
    details: {
      variableName: name,
      variableType: 'data'
    },
    severity: ErrorSeverity.Recoverable,
    code: 'UNDEFINED_VARIABLE'
  });
}
```

## Example Test Update

Here's an example of how to update tests to verify both strict and permissive modes:

```typescript
// Before (skipped)
it.todo('should handle undefined variables appropriately (pending new error system)');

// After (implemented)
it('should throw in strict mode for undefined variables', async () => {
  // Setup test with strict mode
  const options = { strict: true };
  
  await expect(resolver.resolve('#{undefined}', context, options))
    .rejects.toThrow(MeldResolutionError);
});

it('should warn in permissive mode for undefined variables', async () => {
  // Setup test with permissive mode
  const options = { strict: false };
  const warnings: MeldError[] = [];
  const errorHandler = (error: MeldError) => warnings.push(error);
  
  // Should not throw
  await expect(resolver.resolve('#{undefined}', context, { ...options, errorHandler }))
    .resolves.toBe('');
  
  // Should have generated a warning
  expect(warnings.length).toBe(1);
  expect(warnings[0]).toBeInstanceOf(MeldResolutionError);
  expect(warnings[0].severity).toBe(ErrorSeverity.Recoverable);
});