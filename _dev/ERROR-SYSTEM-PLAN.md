# Meld Error System Implementation Plan

## Overview

This plan outlines a comprehensive error system for mlld that prioritizes developer experience while integrating seamlessly with our existing test infrastructure. The system leverages our markdown-based test cases to ensure error messages are well-designed and tested.

## Design Principles

1. **DX First**: Clear, actionable error messages with context
2. **Test-Driven**: Error outputs are first-class test artifacts
3. **Progressive**: Non-breaking implementation that enhances existing code
4. **Contextual**: Preserve location and import chain information
5. **Flexible**: Support both strict and lenient evaluation modes

## Error Architecture

### Error Class Hierarchy (Already Defined)

```
MeldError (base)
├── MeldParseError (syntax errors)
│   ├── location info (line, column, file)
│   ├── expected vs found tokens
│   └── suggestion/fix hints
├── MeldInterpreterError (runtime)
│   ├── VariableResolutionError
│   ├── FileNotFoundError  
│   ├── CommandExecutionError
│   ├── CircularDependencyError
│   └── FieldAccessError
├── MeldValidationError (semantic)
│   ├── InvalidDirectiveError
│   ├── TypeMismatchError
│   └── MissingRequiredFieldError
└── MeldWarning (non-fatal issues)
    ├── DeprecationWarning
    └── PerformanceWarning
```

### Error Context Preservation

Every evaluation step will maintain context:

```typescript
interface EvaluationContext {
  node: ASTNode;
  file?: string;
  importChain?: string[];  // Stack of imports leading to this point
  environment: Environment;
}

// Errors will capture full context
class MeldInterpreterError extends MeldError {
  constructor(
    message: string,
    context: {
      node: ASTNode;
      file?: string;
      importChain?: string[];
      location?: LocationInfo;
      suggestion?: string;
    }
  ) {
    super(message);
    // Preserve all context for error display
  }
}
```

## Test Integration

### Directory Structure

```
tests/cases/
├── invalid/          # Syntax errors (parser failures)
│   ├── text/
│   │   ├── missing-bracket/
│   │   │   ├── example.md      # @text foo = [[bar
│   │   │   └── error.md        # Expected error output
│   │   └── invalid-template/
│   │       ├── example.md      # @text t = {{}}
│   │       └── error.md        # Error: Empty variable reference
│   ├── data/
│   │   └── invalid-syntax/
│   │       ├── example.md      # @data x = [1, 2,
│   │       └── error.md        # Expected parser error
│   └── directives/
│       └── unknown-directive/
│           ├── example.md      # @unknown foo = bar
│           └── error.md        # Error: Unknown directive 'unknown'
│
├── exceptions/       # Runtime errors  
│   ├── variables/
│   │   ├── undefined-variable/
│   │   │   ├── example.md      # @text greeting = [[name]]
│   │   │   ├── setup.ts        # Optional: Environment setup
│   │   │   └── error.md        # Variable 'name' is not defined
│   │   └── circular-reference/
│   │       ├── example.md      # @text a = [[b]], @text b = [[a]]
│   │       └── error.md        # Circular variable reference
│   ├── files/
│   │   └── not-found/
│   │       ├── example.md      # @text content = @path(./missing.txt)
│   │       ├── setup.ts        # Ensures file doesn't exist
│   │       └── error.md        # File not found: ./missing.txt
│   └── imports/
│       └── circular/
│           ├── example.md      # @import(./b.mld)
│           ├── files/
│           │   ├── b.mld       # @import(./example.md)
│           └── error.md        # Circular import detected
│
└── warnings/         # Non-fatal issues
    ├── performance/
    │   ├── large-file/
    │   │   ├── example.md      # @text content = @path(./large.txt)
    │   │   ├── expected.md     # File contents
    │   │   └── warning.md      # Warning: Large file (10MB)
    └── deprecated/
        ├── old-syntax/
        │   ├── example.md      # Uses deprecated pattern
        │   ├── expected.md     # Still works
        │   └── warning.md      # Warning: This syntax is deprecated
```

### Test Execution Flow

1. **Fixture Generation** (ast-fixtures.js enhancement):
   - Detect `error.md` or `warning.md` files
   - Generate fixtures with error expectations
   - Include setup module if present

2. **Test Runner** (interpreter.fixture.test.ts enhancement):
   ```typescript
   if (fixture.expectedError) {
     await expect(async () => {
       await interpret(fixture.input, options);
     }).rejects.toThrow(MeldError);
     
     // Verify error matches expected output
     const error = await getError();
     const formatted = errorFormatter.format(error);
     expect(formatted).toBe(fixture.expectedError);
   }
   
   if (fixture.expectedWarnings) {
     const result = await interpret(fixture.input, options);
     expect(result.warnings).toHaveLength(fixture.expectedWarnings.length);
     // Verify warning messages
   }
   ```

## Error Display

### Pretty Error Formatting

```
Error in example.mld:5:12

  4 | @text name = "World"
  5 | @text greeting = [[username]]
                        ^^^^^^^^
  6 | @text message = "Hello, [[name]]!"

VariableResolutionError: Variable 'username' is not defined

Did you mean 'name'?

Import chain:
  └─ main.mld:3:1 (imported utils.mld)
     └─ utils.mld:7:1 (imported config.mld)
        └─ config.mld:5:12 (error location)
```

### Import Error Context

When errors occur in imported files, show the full import chain:

```
Error in lib/config.mld:10:5

  10 | @text value = [[missingVar]]
                     ^^^^^^^^^^^^

Variable 'missingVar' is not defined

This error occurred while importing:
  main.mld:2:1
    @import(./lib/utils.mld)
      └─ lib/utils.mld:5:1
           @import(./config.mld)
             └─ lib/config.mld:10:5 (error location)
```

For multiple errors across files, present them as a flat list:

```
Found 3 errors:

Error 1 of 3: Variable 'userName' is not defined
  lib/templates.mld:5:20
  Imported from: main.mld:2:1 → utils.mld:7:1 → templates.mld

Error 2 of 3: File not found './missing.txt'
  utils.mld:10:15
  Imported from: main.mld:2:1 → utils.mld

Error 3 of 3: Circular variable reference detected
  main.mld:15:8
  Variables involved: foo → bar → baz → foo
```

## Implementation Phases

### Phase 1: Core Error Infrastructure (Week 1)
- [ ] Update interpreter to use MeldError classes
- [ ] Add context preservation to evaluate functions
- [ ] Implement error collection in Environment
- [ ] Create ErrorFormatter for pretty display

### Phase 2: Test System Enhancement (Week 2)
- [ ] Enhance ast-fixtures.js to handle error/warning files
- [ ] Update fixture test runner for error assertions
- [ ] Create initial invalid syntax test cases
- [ ] Add error comparison logic

### Phase 3: Runtime Error Handling (Week 3)
- [ ] Implement all interpreter error classes
- [ ] Add error recovery for non-fatal errors
- [ ] Create exception test cases
- [ ] Implement warning system

### Phase 4: Developer Experience (Week 4)
- [ ] Add typo detection and suggestions
- [ ] Implement import chain tracking
- [ ] Create comprehensive error catalog
- [ ] Add color coding to CLI error display

## Error Handling Patterns

### Consistent Error Creation

```typescript
// Instead of:
throw new Error('Variable not found: ' + name);

// Use:
throw new VariableResolutionError(
  `Variable '${name}' is not defined`,
  {
    node: varRef,
    file: context.file,
    location: varRef.location,
    suggestion: findSimilarVariable(name, env)
  }
);
```

### Error Recovery

```typescript
// In lenient mode, recover from missing variables
if (!env.has(varName)) {
  const error = new VariableResolutionError(...);
  
  if (options.strict) {
    throw error;
  } else {
    env.addWarning(error);
    return `{{${varName}}}`; // Preserve original for debugging
  }
}
```

### Import Chain Tracking

```typescript
// When evaluating imports
const importContext = {
  ...context,
  importChain: [...(context.importChain || []), {
    file: context.file,
    location: importDirective.location,
    directive: importDirective
  }]
};

// Errors in imported files will have full context
```

## Configuration

### Interpreter Options

```typescript
interface InterpreterOptions {
  strict?: boolean;          // Throw on warnings (default: false)
  maxErrors?: number;        // Stop after N errors (default: 100)
  showWarnings?: boolean;    // Display warnings (default: true)
  errorFormat?: 'pretty' | 'json';  // Output format
}
```

### Warning Control

Warnings are shown by default. Users can control via:
- CLI: `--no-warnings` flag to suppress
- API: `showWarnings: false` option
- Future: Warning levels/categories for fine-grained control

## Success Metrics

1. **Coverage**: Every error path has a test case
2. **Clarity**: Error messages are actionable and clear
3. **Context**: All errors show file location and import chain
4. **Recovery**: Non-fatal errors don't halt execution
5. **Performance**: Error handling adds minimal overhead
6. **Stability**: Error messages are part of the spec - can't change without updating tests

## Future Enhancements

- Error suppression directives (e.g., `@meld:ignore-next-line`)
- Structured error output formats (JSON, SARIF)
- IDE integration with error positions
- Error fix suggestions with auto-apply
- Internationalization of error messages

## Notes

- Start with most common errors (undefined variables, missing files)
- Maintain backward compatibility - enhance rather than replace
- Focus on errors users will actually encounter
- Keep error messages concise but helpful
- Test error messages as carefully as feature code