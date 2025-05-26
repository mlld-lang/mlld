// TODO: UPDATE

# Error Handling in Mlld

This document describes the error handling architecture in Mlld, including how errors are classified, how they're handled in different modes, and how to work with the error system as a developer.

## Table of Contents

1. [Overview](#overview)
2. [Error Severity Levels](#error-severity-levels)
3. [Strict vs. Permissive Mode](#strict-vs-permissive-mode)
4. [Error Classification Guidelines](#error-classification-guidelines)
5. [Working with Errors](#working-with-errors)
   - [Creating Errors](#creating-errors)
   - [Handling Errors](#handling-errors)
   - [Testing Errors](#testing-errors)
6. [Error Types Reference](#error-types-reference)
7. [Source Mapping](#source-mapping)
8. [Best Practices](#best-practices)

## Overview

Mlld's error handling system is designed to support two different modes of operation:

1. **Strict Mode**: All errors are thrown, providing immediate feedback during development and testing.
2. **Permissive Mode**: Recoverable errors are converted to warnings, allowing processing to continue when possible.

This dual-mode approach allows Mlld to be both rigorous during development and forgiving during end-user usage, particularly in the CLI.

## Error Severity Levels

All errors in Mlld are classified with one of three severity levels:

- **Fatal**: Errors that always halt execution, regardless of mode.
- **Recoverable**: Errors that throw in strict mode but become warnings in permissive mode.
- **Warning**: Issues that never throw and are always treated as warnings.

These severity levels are defined in the `ErrorSeverity` enum:

```typescript
export enum ErrorSeverity {
  Fatal = 'fatal',
  Recoverable = 'recoverable',
  Warning = 'warning'
}
```

## Strict vs. Permissive Mode

### Strict Mode

Strict mode is the default for most services and is used during development and testing. In strict mode:

- All errors (Fatal and Recoverable) are thrown
- Warnings are logged but don't interrupt execution
- Provides immediate feedback about issues

Example of enabling strict mode:

```typescript
const result = await interpreterService.interpret(nodes, {
  strict: true,
  // other options...
});
```

### Permissive Mode

Permissive mode is used by the CLI and other user-facing interfaces. In permissive mode:

- Only Fatal errors are thrown
- Recoverable errors are converted to warnings
- Warnings are logged but don't interrupt execution
- Processing continues when possible

Example of enabling permissive mode with a custom error handler:

```typescript
const warnings: MlldError[] = [];
const errorHandler = (error: MlldError) => {
  warnings.push(error);
  console.warn(`Warning: ${error.message}`);
};

const result = await interpreterService.interpret(nodes, {
  strict: false,
  errorHandler,
  // other options...
});
```

## Error Classification Guidelines

Errors in Mlld are classified according to these guidelines:

### Fatal Errors (Always Throw)
- Syntax errors (MlldParseError)
- Circular imports (DirectiveError with CIRCULAR_REFERENCE)
- Invalid directive types (DirectiveError with HANDLER_NOT_FOUND)
- Missing required fields in directives (DirectiveError with VALIDATION_FAILED)
- Type validation failures (PathValidationError with INVALID_PATH)
- File system access errors (MlldFileSystemError)
- Service initialization errors (ServiceInitializationError)

### Recoverable Errors (Warnings in Permissive Mode)
- Missing data fields (MlldResolutionError)
- Undefined variables (MlldResolutionError)
- Missing environment variables (MlldResolutionError)
- File not found for embed/import (MlldFileNotFoundError)
- Invalid field access (MlldResolutionError)
- Command execution failures (MlldInterpreterError)

### Always Warnings (Never Throw)
- Deprecated features
- Performance suggestions
- Non-critical validation issues

## Working with Errors

### Creating Errors

When creating errors, always specify the appropriate severity level:

```typescript
// Creating a fatal error
throw new MlldError('Critical failure', {
  severity: ErrorSeverity.Fatal,
  code: 'CRITICAL_ERROR',
  context: { /* additional context */ }
});

// Creating a recoverable error
throw new MlldResolutionError('Variable not found', {
  severity: ErrorSeverity.Recoverable,
  details: {
    variableName: 'myVar',
    variableType: 'text'
  }
});

// Creating a warning
const warning = new MlldError('Performance suggestion', {
  severity: ErrorSeverity.Warning,
  code: 'PERF_SUGGESTION'
});
logger.warn(warning.message, warning);
```

### Handling Errors

Services that need to handle errors should respect the strict/permissive mode:

```typescript
try {
  // Attempt operation
} catch (error) {
  if (error instanceof MlldError) {
    // Check if we're in permissive mode and the error is recoverable
    if (!options.strict && error.canBeWarning()) {
      // Handle as warning
      if (options.errorHandler) {
        options.errorHandler(error);
      } else {
        logger.warn(`Warning: ${error.message}`, error);
      }
      // Continue processing
      return fallbackValue;
    }
  }
  // Re-throw fatal errors or in strict mode
  throw error;
}
```

### Testing Errors

Mlld provides utilities for testing error handling in both strict and permissive modes:

```typescript
import { 
  ErrorCollector,
  expectErrorSeverity,
  expectThrowsWithSeverity,
  expectWarningsInPermissiveMode,
  expectThrowsInStrictButWarnsInPermissive
} from '@tests/utils';

// Test that a function throws with the correct severity
await expectThrowsWithSeverity(
  () => resolver.resolve('${undefined}', context),
  MlldResolutionError,
  ErrorSeverity.Recoverable
);

// Test behavior in both modes
await expectThrowsInStrictButWarnsInPermissive(
  (options) => resolver.resolve('${undefined}', context, options),
  MlldResolutionError
);
```

## Error Types Reference

Mlld has several specialized error types:

- **MlldError**: Base class for all Mlld errors
- **MlldParseError**: Errors during parsing
- **MlldDirectiveError**: Base class for directive-related errors
- **DirectiveError**: Specific directive processing errors
- **MlldResolutionError**: Variable resolution errors
- **MlldInterpreterError**: Errors during interpretation
- **MlldFileSystemError**: File system access errors
- **MlldFileNotFoundError**: File not found errors
- **MlldImportError**: Import-related errors
- **MlldOutputError**: Output generation errors
- **PathValidationError**: Path validation errors

Each error type includes:
- A message describing the error
- A severity level
- Optional context information
- Optional error code
- Optional file path

## Source Mapping

Mlld includes source mapping to provide better error reporting by tracking the original file locations when content is imported or embedded from other files. This helps users identify the actual source of errors instead of seeing errors in the combined or transformed content.

### How Source Mapping Works

1. **Registration**: When files are imported or embedded, the content is registered with the source mapping system.
2. **Mapping Creation**: Line mappings are created to track where content from source files appears in the combined output.
3. **Error Enhancement**: When errors occur, they're automatically enhanced with information about the original source location.
4. **User-Friendly Messages**: Error messages include both the combined file location and the original source file/line.

### Example

Instead of seeing:
```
Error: Invalid syntax at line 42 in main.mld
```

Users will see:
```
Error in /path/to/imported-file.mld:5: Invalid syntax at line 42 in main.mld
```

This makes debugging much easier, especially for files that import or embed content from multiple sources.

### Source Mapping Integration

Source mapping is integrated into the following components:

- **EmbedDirectiveHandler**: Maps embedded content to its original source file
- **ImportDirectiveHandler**: Maps imported content to its original source file
- **ParserService**: Enhances parser errors with source file information
- **OutputService**: Enhances LLMXML errors with source file information

### Implementation Details

Source mappings are maintained via a singleton `SourceMapService` that tracks source files and creates mappings between source locations and combined file locations. The service is accessed through utility functions that register sources, add mappings, and enhance errors with source information.

## Best Practices

1. **Always specify severity**: When creating errors, always specify the appropriate severity level.

2. **Add context**: Include relevant context in errors to help with debugging.

3. **Use specific error types**: Use the most specific error type for the situation.

4. **Respect strict/permissive mode**: Services should respect the strict/permissive mode when handling errors.

5. **Test both modes**: Write tests for both strict and permissive modes.

6. **Use error codes**: Use consistent error codes to help with error identification.

7. **Document error codes**: Document error codes and their meanings.

8. **Provide helpful error messages**: Error messages should be clear and helpful.

9. **Include recovery suggestions**: When possible, include suggestions for how to recover from errors.

10. **Log warnings appropriately**: Use the appropriate logging level for warnings. 

11. **Preserve source info**: When wrapping errors, preserve source file information from the original error.