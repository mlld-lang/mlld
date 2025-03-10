# Error Testing Patterns

This guide documents the recommended patterns for testing error handling in the Meld API and CLI. It focuses on comprehensive testing techniques to ensure robust error handling across the codebase.

## Table of Contents

1. [Introduction](#introduction)
2. [Error Types and Hierarchies](#error-types-and-hierarchies)
3. [API Error Testing](#api-error-testing)
   - [Testing with TestContext](#testing-with-testcontext)
   - [Testing Specialized Error Classes](#testing-specialized-error-classes)
   - [Testing Error Recovery](#testing-error-recovery)
4. [CLI Error Testing](#cli-error-testing)
5. [Common Testing Patterns](#common-testing-patterns)
6. [Test Helpers and Utilities](#test-helpers-and-utilities)

## Introduction

Error handling is a critical aspect of the Meld language interpreter. The Meld API provides specialized error classes to make debugging easier and error handling more precise. This guide documents best practices for testing these error scenarios.

The Meld error handling system is built around:
- **Error Hierarchies**: Specialized error classes extending from `MeldError`
- **Error Context**: Additional information about where and why errors occurred
- **Error Recovery**: Options for strict vs. permissive error handling

## Error Types and Hierarchies

Meld has a hierarchy of error classes:

```
MeldError (base class)
├── MeldDirectiveError - For directive syntax/validation errors
├── MeldParseError - For parsing failures
├── MeldInterpreterError - For interpretation failures
├── MeldFileNotFoundError - For file access issues
├── MeldResolutionError - For variable/reference resolution issues
├── MeldImportError - For import-related issues
├── PathValidationError - For path-related issues
└── ServiceInitializationError - For service initialization failures
```

When testing, always verify that the specific error type is thrown, not just that an error occurs.

## API Error Testing

### Testing with TestContext

The `TestContext` class provides utilities for testing error handling:

```typescript
it('should throw MeldFileNotFoundError for missing files', async () => {
  // Arrange
  const context = new TestContext();
  await context.initialize();
  
  // Act & Assert
  await expect(main('non-existent.mld', {
    fs: context.fs,
    services: context.services
  })).rejects.toThrow(MeldFileNotFoundError);
  
  // Cleanup
  await context.cleanup();
});
```

### Testing Specialized Error Classes

When testing specialized error types, verify not just the error type but also essential properties:

```typescript
it('should throw MeldDirectiveError with directive details', async () => {
  // Arrange
  const context = new TestContext();
  await context.initialize();
  await context.writeFile('test.mld', '@text = "missing identifier"');
  
  try {
    // Act
    await main('test.mld', {
      fs: context.fs,
      services: context.services
    });
    
    // If we reach here, the test should fail
    fail('Expected MeldDirectiveError was not thrown');
  } catch (error) {
    // Assert
    expect(error).toBeInstanceOf(MeldDirectiveError);
    if (error instanceof MeldDirectiveError) {
      expect(error.directiveKind).toBe('text');
      expect(error.message).toContain('missing identifier');
      expect(error.location).toBeDefined();
    }
  } finally {
    // Cleanup
    await context.cleanup();
  }
});
```

### Testing Error Recovery

Test how the API handles errors in different contexts:

```typescript
it('should recover from variable resolution errors in permissive mode', async () => {
  // Arrange
  const context = new TestContext();
  await context.initialize();
  await context.writeFile('test.mld', `
    @text greeting = "Hello"
    \${missing} \${greeting}
  `);
  
  // Enable transformation for testing
  context.enableTransformation();
  
  // Act & Assert - With strict mode (should throw)
  await expect(main('test.mld', {
    fs: context.fs,
    services: context.services,
    transformation: true,
    // Future: Add strict mode option
  })).rejects.toThrow(MeldResolutionError);
  
  // Todo: Test permissive mode when implemented
  // Act & Assert - With permissive mode (should continue)
  // This would test future functionality
  
  // Cleanup
  await context.cleanup();
});
```

## CLI Error Testing

For testing CLI error handling, use the `mockProcessExit` and `mockConsole` utilities from `TestContext`:

```typescript
it('should exit with code 1 for fatal errors', async () => {
  // Arrange
  const context = new TestContext();
  await context.initialize();
  
  // Set up mocks
  const exitMock = context.mockProcessExit();
  const consoleMock = context.mockConsole();
  
  // Simulate invalid file
  await context.setupCliTest({
    files: {
      'invalid.mld': '@invalid directive'
    }
  });
  
  // Act
  // This would use the CLI command when implemented
  // await cli.run(['invalid.mld']);
  
  // Assert
  expect(exitMock.exit).toHaveBeenCalledWith(1);
  expect(consoleMock.error).toHaveBeenCalledWith(
    expect.stringContaining('invalid directive')
  );
  
  // Cleanup
  await context.cleanup();
});
```

## Common Testing Patterns

Here are common patterns for testing errors:

### 1. Expecting Specific Error Types

```typescript
// Testing that a specific error type is thrown
await expect(main('test.mld', options)).rejects.toThrow(MeldDirectiveError);

// Testing with more specific error message matching
await expect(main('test.mld', options)).rejects.toThrow(/missing identifier/);
```

### 2. Checking Error Properties

```typescript
try {
  await main('test.mld', options);
  fail('Expected error was not thrown');
} catch (error) {
  expect(error).toBeInstanceOf(MeldDirectiveError);
  expect(error.message).toContain('Expected error details');
}
```

### 3. Testing Error Locations

```typescript
try {
  await main('test.mld', options);
} catch (error) {
  if (error instanceof MeldDirectiveError) {
    expect(error.location).toBeDefined();
    expect(error.location.start.line).toBe(1);
    expect(error.location.start.column).toBe(1);
  }
}
```

## Test Helpers and Utilities

The Meld testing infrastructure provides several helpers for error testing:

### TestContext Utilities

```typescript
// Mock process.exit to prevent tests from exiting the process
const exitMock = context.mockProcessExit();

// Mock console methods (log, error, warn) to capture output
const consoleMock = context.mockConsole();

// Set up CLI testing environment
const testEnv = await context.setupCliTest({
  files: {
    'test.mld': '@text greeting = "Hello"'
  },
  mockExit: true,
  mockConsoleOutput: true
});
```

### Debug Services

For complex error scenarios, use the debug services:

```typescript
// Start debug session to capture state during error
const sessionId = await context.startDebugSession({
  captureConfig: {
    capturePoints: ['error'],
    includeFields: ['variables', 'nodes'],
  },
  traceOperations: true
});

try {
  await main('test.mld', options);
} catch (error) {
  // Expected error - now analyze debug data
  const debugResult = await context.endDebugSession(sessionId);
  console.log('Error state:', debugResult.captures[0].state);
}
```

By following these patterns, you can create comprehensive tests that verify error handling throughout the Meld API and CLI.