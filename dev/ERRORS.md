# Error Handling Architecture

## Current Issues

1. Inconsistent error handling across layers
   - Some modules throw errors that should be warnings
   - Integration tests expect warnings while unit tests expect errors
   - No clear distinction between fatal and recoverable errors

2. Lack of configurable strictness
   - Can't switch between strict and permissive modes
   - No way to customize error handling at different levels

## Proposed Architecture

### 1. Error Classification

```typescript
enum ErrorSeverity {
  // Must halt execution
  Fatal = 'fatal',    
  // Can be converted to warning in permissive mode
  Recoverable = 'recoverable',  
  // Always just a warning
  Warning = 'warning'   
}
```

### 2. Enhanced Error Types

```typescript
class MeldError extends Error {
  constructor(
    message: string,
    public severity: ErrorSeverity,
    public code: string,
    public context?: any
  ) {
    super(message);
  }

  canBeWarning(): boolean {
    return this.severity === ErrorSeverity.Recoverable 
        || this.severity === ErrorSeverity.Warning;
  }
}
```

### 3. Execution Options

```typescript
interface ExecutionOptions {
  strict: boolean;  // When true, all errors throw. When false, recoverable errors become warnings
  errorHandler?: (error: MeldError) => void;  // Custom error handling
}

interface IInterpreterService {
  interpret(nodes: MeldNode[], options: ExecutionOptions): Promise<void>;
}
```

## Implementation Plan

### Phase 1: Core Infrastructure (1-2 days)

1. Error Types
   - [ ] Create `ErrorSeverity` enum
   - [ ] Update base `MeldError` class
   - [ ] Add execution options interfaces
   - [ ] Update error utility functions

2. Base Error Classes
   - [ ] Update `MeldParseError`
   - [ ] Update `MeldDirectiveError`
   - [ ] Update `MeldResolutionError`
   - [ ] Update `MeldInterpreterError`
   - [ ] Update `MeldFileNotFoundError`
   - [ ] Update `MeldOutputError`
   - [ ] Update `PathValidationError`
   - [ ] Update `ResolutionError`
   - [ ] Update `DirectiveError`

3. Core Service Updates
   - [ ] Modify `InterpreterService` to handle error conversion
   - [ ] Add error handling modes to `CLIService`
   - [ ] Update service interfaces

### Phase 2: Service Layer (2-3 days)

1. Resolution Service & Resolvers
   - [ ] Update `ResolutionService`
   - [ ] Update `DataResolver`
   - [ ] Update `TextResolver`
   - [ ] Update `CommandResolver`
   - [ ] Update `PathResolver`
   - [ ] Update `StringLiteralHandler`
   - [ ] Update `StringConcatenationHandler`
   - [ ] Update `VariableReferenceResolver`

2. Directive Service & Handlers
   - [ ] Update `DirectiveService`
   - [ ] Update execution handlers
   - [ ] Update definition handlers

3. Other Services
   - [ ] Update `ParserService`
   - [ ] Update `FileSystemService`
   - [ ] Update `PathService`
   - [ ] Update `ValidationService`

### Phase 3: Test Updates (2-3 days)

1. Unit Tests
   - [ ] Update resolver tests
   - [ ] Update service tests
   - [ ] Update handler tests
   - [ ] Add new error handling tests

2. Integration Tests
   - [ ] Update CLI tests
   - [ ] Add strict mode tests
   - [ ] Add permissive mode tests

3. Test Utilities
   - [ ] Add error assertion helpers
   - [ ] Add test execution modes

## Error Categories

Here's how different types of errors should be classified:

### Fatal Errors
- Syntax errors
- Circular imports
- Invalid directive types
- Missing required fields
- Type validation failures
- File system access errors (except not found)

### Recoverable Errors (Can be Warnings)
- Missing data fields
- Undefined variables
- Missing environment variables
- File not found
- Invalid field access

### Always Warnings
- Deprecated features
- Performance suggestions
- Non-critical validation issues

## Migration Strategy

1. **Preparation**
   - Add new error types without removing old ones
   - Add support for both old and new error handling
   - Update documentation

2. **Gradual Migration**
   - Migrate one service at a time
   - Keep backwards compatibility
   - Add tests for new behavior before removing old

3. **Cleanup**
   - Remove old error types
   - Remove compatibility layer
   - Update all documentation

## Usage Examples

### Strict Mode (Unit Tests)
```typescript
const options: ExecutionOptions = {
  strict: true
};
await interpreter.interpret(nodes, options);  // Throws on any error
```

### Permissive Mode (CLI)
```typescript
const options: ExecutionOptions = {
  strict: false,
  errorHandler: (error) => {
    if (error.canBeWarning()) {
      console.warn(`Warning: ${error.message}`);
    }
  }
};
await interpreter.interpret(nodes, options);  // Converts recoverable errors to warnings
```

### Custom Error Handling
```typescript
const options: ExecutionOptions = {
  strict: false,
  errorHandler: (error) => {
    if (error.severity === ErrorSeverity.Warning) {
      // Log to file
    } else if (error.canBeWarning()) {
      // Show in UI
    } else {
      // Halt execution
    }
  }
};
```

## Testing Guidelines

1. Unit Tests
   - Always run in strict mode
   - Test both error throwing and error details
   - Verify error categorization

2. Integration Tests
   - Test both strict and permissive modes
   - Verify warning conversion
   - Test custom error handlers

3. Error Handling Tests
   - Verify error propagation
   - Test error context preservation
   - Verify warning formatting

## Documentation Updates Needed

1. API Documentation
   - [ ] Document new error types
   - [ ] Update service interfaces
   - [ ] Add error handling examples

2. User Documentation
   - [ ] Explain strict vs permissive modes
   - [ ] Document CLI options
   - [ ] Update troubleshooting guide

3. Developer Documentation
   - [ ] Error handling guidelines
   - [ ] Testing requirements
   - [ ] Migration guide 