# Error Testing Utilities Guide

This document provides a guide on how to use Meld's error testing utilities to write effective tests for error handling in both strict and permissive modes.

## Table of Contents

1. [Introduction](#introduction)
2. [Available Utilities](#available-utilities)
3. [ErrorCollector](#errorcollector)
4. [Test Options](#test-options)
5. [Assertion Helpers](#assertion-helpers)
6. [Async Assertion Helpers](#async-assertion-helpers)
7. [Testing Specific Error Types](#testing-specific-error-types)
8. [Complete Examples](#complete-examples)

## Introduction

Meld's error handling system supports both strict and permissive modes. Testing both modes requires specialized utilities to ensure that errors are handled correctly in each mode. The error testing utilities provide a consistent way to test error handling across different components.

## Available Utilities

Import the error testing utilities from the test utilities package:

```typescript
import { 
  ErrorCollector,
  expectErrorSeverity,
  expectErrorTypeAndSeverity,
  expectThrowsWithSeverity,
  expectWarningsInPermissiveMode,
  expectThrowsInStrictButWarnsInPermissive,
  expectDirectiveErrorWithCode,
  expectResolutionErrorWithDetails,
  createStrictModeOptions,
  createPermissiveModeOptions,
  ErrorModeTestOptions
} from '@tests/utils';
```

## ErrorCollector

The `ErrorCollector` class is used to collect and categorize errors and warnings during testing:

```typescript
// Create a collector
const collector = new ErrorCollector();

// Handle errors
collector.handleError(new MeldError('Test error', { severity: ErrorSeverity.Fatal }));
collector.handleError(new MeldError('Test warning', { severity: ErrorSeverity.Warning }));

// Check collected errors and warnings
expect(collector.errors).toHaveLength(1);
expect(collector.warnings).toHaveLength(1);

// Get all errors (both fatal and warnings)
const allErrors = collector.getAllErrors();
expect(allErrors).toHaveLength(2);

// Filter errors by type
const resolutionErrors = collector.getErrorsOfType(MeldResolutionError);
const directiveWarnings = collector.getWarningsOfType(DirectiveError);

// Reset the collector
collector.reset();
expect(collector.getAllErrors()).toHaveLength(0);
```

## Test Options

The error testing utilities provide functions to create test options for both strict and permissive modes:

```typescript
// Create options for strict mode
const strictOptions = createStrictModeOptions();
expect(strictOptions.strict).toBe(true);

// Create options for permissive mode with a collector
const collector = new ErrorCollector();
const permissiveOptions = createPermissiveModeOptions(collector);
expect(permissiveOptions.strict).toBe(false);
expect(permissiveOptions.errorHandler).toBeDefined();

// Test the error handler
permissiveOptions.errorHandler!(new MeldError('Test', { severity: ErrorSeverity.Recoverable }));
expect(collector.warnings).toHaveLength(1);
```

## Assertion Helpers

The error testing utilities provide several assertion helpers for checking error properties:

```typescript
// Check error severity
const error = new MeldError('Test', { severity: ErrorSeverity.Recoverable });
expectErrorSeverity(error, ErrorSeverity.Recoverable);

// Check error type and severity
const resolutionError = new MeldResolutionError('Test', { severity: ErrorSeverity.Recoverable });
expectErrorTypeAndSeverity(resolutionError, MeldResolutionError, ErrorSeverity.Recoverable);

// Check DirectiveError with specific code
const directiveError = new DirectiveError(
  'Test', 
  'test-kind', 
  DirectiveErrorCode.VALIDATION_FAILED
);
expectDirectiveErrorWithCode(directiveError, DirectiveErrorCode.VALIDATION_FAILED, ErrorSeverity.Recoverable);

// Check MeldResolutionError with specific details
const detailedError = new MeldResolutionError('Test', { 
  severity: ErrorSeverity.Recoverable,
  details: {
    variableName: 'test',
    variableType: 'text'
  }
});
expectResolutionErrorWithDetails(detailedError, {
  variableName: 'test',
  variableType: 'text'
});
```

## Async Assertion Helpers

The error testing utilities provide async assertion helpers for testing functions that may throw errors:

```typescript
// Test that a function throws with the correct severity
const throwingFn = () => {
  throw new MeldResolutionError('Test', { severity: ErrorSeverity.Fatal });
};
await expectThrowsWithSeverity(
  throwingFn,
  MeldResolutionError,
  ErrorSeverity.Fatal
);

// Test that a function generates warnings in permissive mode
const warningFn = (options: ErrorModeTestOptions) => {
  if (options.errorHandler) {
    options.errorHandler(new MeldResolutionError('Test', { severity: ErrorSeverity.Recoverable }));
  } else if (options.strict) {
    throw new MeldResolutionError('Test', { severity: ErrorSeverity.Recoverable });
  }
};
await expectWarningsInPermissiveMode(warningFn, MeldResolutionError);

// Test that a function throws in strict mode but only warns in permissive mode
await expectThrowsInStrictButWarnsInPermissive(warningFn, MeldResolutionError);
```

## Testing Specific Error Types

### Testing DirectiveError

```typescript
it('should throw DirectiveError with correct code for invalid syntax', async () => {
  // Arrange
  const handler = new ImportDirectiveHandler(/* dependencies */);
  const node = createDirectiveNode('import', 'invalid syntax');
  
  // Act & Assert
  await expectThrowsWithSeverity(
    () => handler.execute(node, context),
    DirectiveError,
    ErrorSeverity.Recoverable
  );
  
  try {
    await handler.execute(node, context);
  } catch (error) {
    expectDirectiveErrorWithCode(error, DirectiveErrorCode.VALIDATION_FAILED, ErrorSeverity.Recoverable);
  }
});
```

### Testing MeldResolutionError

```typescript
it('should throw MeldResolutionError with correct details for undefined variable', async () => {
  // Arrange
  const resolver = new VariableReferenceResolver(/* dependencies */);
  
  // Act & Assert
  await expectThrowsWithSeverity(
    () => resolver.resolve('${undefined}', context),
    MeldResolutionError,
    ErrorSeverity.Recoverable
  );
  
  try {
    await resolver.resolve('${undefined}', context);
  } catch (error) {
    expectResolutionErrorWithDetails(error, {
      variableName: 'undefined',
      variableType: 'text'
    });
  }
});
```

## Complete Examples

### Testing a Resolver

```typescript
describe('VariableReferenceResolver', () => {
  let resolver: VariableReferenceResolver;
  let stateService: StateService;
  let context: ResolutionContext;
  
  beforeEach(() => {
    stateService = createMockStateService();
    resolver = new VariableReferenceResolver(stateService);
    context = createMockResolutionContext();
  });
  
  it('should resolve defined variables', async () => {
    // Arrange
    stateService.getVariable.mockReturnValue('value');
    
    // Act
    const result = await resolver.resolve('${defined}', context);
    
    // Assert
    expect(result).toBe('value');
  });
  
  it('should throw in strict mode for undefined variables', async () => {
    // Arrange
    stateService.getVariable.mockReturnValue(undefined);
    
    // Act & Assert
    await expectThrowsWithSeverity(
      () => resolver.resolve('${undefined}', context, { strict: true }),
      MeldResolutionError,
      ErrorSeverity.Recoverable
    );
  });
  
  it('should warn in permissive mode for undefined variables', async () => {
    // Arrange
    stateService.getVariable.mockReturnValue(undefined);
    
    // Act & Assert
    await expectWarningsInPermissiveMode(
      (options) => resolver.resolve('${undefined}', context, options),
      MeldResolutionError
    );
  });
  
  it('should behave differently in strict and permissive modes', async () => {
    // Arrange
    stateService.getVariable.mockReturnValue(undefined);
    
    // Act & Assert
    await expectThrowsInStrictButWarnsInPermissive(
      (options) => resolver.resolve('${undefined}', context, options),
      MeldResolutionError
    );
  });
});
```

### Testing a Directive Handler

```typescript
describe('ImportDirectiveHandler', () => {
  let handler: ImportDirectiveHandler;
  let fileSystemService: FileSystemService;
  let resolutionService: ResolutionService;
  let context: DirectiveContext;
  
  beforeEach(() => {
    fileSystemService = createMockFileSystemService();
    resolutionService = createMockResolutionService();
    handler = new ImportDirectiveHandler(fileSystemService, resolutionService);
    context = createMockDirectiveContext();
  });
  
  it('should import variables from a file', async () => {
    // Arrange
    fileSystemService.readFile.mockResolvedValue('@text greeting = "Hello"');
    resolutionService.resolveValue.mockResolvedValue('file.meld');
    
    // Act
    await handler.execute(createDirectiveNode('import', 'file.meld'), context);
    
    // Assert
    expect(context.state.getVariable('greeting')).toBe('Hello');
  });
  
  it('should throw DirectiveError for missing file in strict mode', async () => {
    // Arrange
    fileSystemService.readFile.mockRejectedValue(new MeldFileNotFoundError('File not found'));
    resolutionService.resolveValue.mockResolvedValue('missing.meld');
    
    // Act & Assert
    await expectThrowsWithSeverity(
      () => handler.execute(createDirectiveNode('import', 'missing.meld'), { ...context, strict: true }),
      DirectiveError,
      ErrorSeverity.Recoverable
    );
  });
  
  it('should warn for missing file in permissive mode', async () => {
    // Arrange
    fileSystemService.readFile.mockRejectedValue(new MeldFileNotFoundError('File not found'));
    resolutionService.resolveValue.mockResolvedValue('missing.meld');
    
    // Act & Assert
    const collector = new ErrorCollector();
    const permissiveContext = { 
      ...context, 
      strict: false, 
      errorHandler: collector.handleError 
    };
    
    await handler.execute(createDirectiveNode('import', 'missing.meld'), permissiveContext);
    
    expect(collector.warnings).toHaveLength(1);
    expect(collector.getWarningsOfType(DirectiveError)).toHaveLength(1);
    
    const warning = collector.warnings[0] as DirectiveError;
    expectDirectiveErrorWithCode(warning, DirectiveErrorCode.FILE_NOT_FOUND, ErrorSeverity.Recoverable);
  });
});
```

These examples demonstrate how to use the error testing utilities to write comprehensive tests for error handling in both strict and permissive modes. 