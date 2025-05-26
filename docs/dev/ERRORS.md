# Mlld Error System

This document explains how the error handling system works in mlld, including error classes, test integration, and implementation patterns.

## Overview

Mlld's error system is designed to provide **clear, actionable error messages** with full context information while supporting both **strict** and **lenient** evaluation modes. All errors inherit from a base `MlldError` class and include location information, severity levels, and structured context.

## Error Architecture

### Error Class Hierarchy

```
MlldError (base)
├── MlldParseError - Syntax/grammar errors during parsing
├── MlldInterpreterError - Runtime errors during interpretation
├── MlldDirectiveError - Directive-specific validation errors
├── MlldResolutionError - Variable/reference resolution failures
├── MlldImportError - Import-related errors
├── MlldFileSystemError - File system access errors
├── MlldFileNotFoundError - Specific file not found errors
├── MlldOutputError - Output generation errors
├── DataEvaluationError - Data directive evaluation errors
├── FieldAccessError - Object field access errors
├── VariableResolutionError - Variable lookup failures
└── PathValidationError - Path validation errors
```

### Error Severity Levels

All errors have a severity level that determines how they're handled:

```typescript
enum ErrorSeverity {
  Recoverable = 'recoverable', // Can continue in lenient mode
  Fatal = 'fatal',            // Always stops execution
  Info = 'info',              // Informational messages
  Warning = 'warning'         // Non-blocking warnings
}
```

### Base Error Structure

```typescript
class MlldError extends Error {
  code: string;              // Unique error identifier
  severity: ErrorSeverity;   // How critical the error is
  details?: BaseErrorDetails; // Additional context
  sourceLocation?: ErrorSourceLocation; // File/line/column info
  
  canBeWarning(): boolean;   // True for Recoverable/Warning severity
}
```

## Error Test Integration

### Test Directory Structure

Error tests use a **markdown-based test system** where error conditions are tested using the same fixture infrastructure as successful cases:

```
tests/cases/
├── invalid/          # Syntax errors (parser failures)
│   ├── text/
│   │   ├── missing-bracket/
│   │   │   ├── example.md      # Invalid mlld syntax
│   │   │   └── error.md        # Expected error message
│   ├── data/
│   ├── directives/
│   └── ...
├── exceptions/       # Runtime errors (interpreter failures)
│   ├── variables/
│   ├── imports/
│   ├── files/
│   └── ...
├── warnings/         # Non-fatal issues
│   ├── performance/
│   ├── deprecated/
│   └── ...
└── [other valid test cases]
```

### Error Test Pattern

**Two-file pattern:**
- `example.md` - Contains invalid mlld syntax that should trigger an error
- `error.md` - Contains the exact expected error message

**Example:**

`tests/cases/invalid/text/missing-bracket/example.md`:
```markdown
@text greeting = [[Hello, {{name}}
```

`tests/cases/invalid/text/missing-bracket/error.md`:
```
Expected closing template delimiter "]]" after template content.
```

### Test Execution Flow

1. **Fixture Generation**: `tests/utils/ast-fixtures.js` scans for `error.md` files
2. **Fixture Creation**: Generates test fixtures with `expectedError` field
3. **Test Execution**: `interpreter.fixture.test.ts` catches errors and validates messages
4. **Assertion**: `expect(error.message).toContain(fixture.expectedError)`

### Current Implementation

The test runner already supports error testing:

```typescript
// In interpreter.fixture.test.ts
try {
  const result = await interpret(fixture.input, options);
  expect(normalizedResult).toBe(normalizedExpected);
} catch (error) {
  if (fixture.expectedError) {
    expect(error.message).toContain(fixture.expectedError);
  } else {
    throw error; // Unexpected error
  }
}
```

## Error Categories

### 1. Parse Errors (`invalid/`)

**When**: Grammar/syntax errors during AST generation
**Examples**:
- Missing closing brackets: `@text foo = [[bar`
- Invalid directive syntax: `@unknown directive`
- Malformed data structures: `@data x = [1, 2,`

**Location**: `tests/cases/invalid/[directive-type]/[error-case]/`

### 2. Runtime Errors (`exceptions/`)

**When**: Interpreter errors during evaluation
**Examples**:
- Undefined variables: `@add {{missing}}`
- File not found: `@add [missing.md]`
- Import failures: `@import { var } from "missing.mld"`
- Circular references: `@text a = {{b}}`, `@text b = {{a}}`

**Location**: `tests/cases/exceptions/[category]/[error-case]/`

### 3. Warnings (`warnings/`)

**When**: Valid syntax but potentially unintended behavior
**Examples**:
- Inline variables in plain text: `Hello @name` (won't interpolate)
- Performance issues: Large file operations
- Deprecated syntax patterns

**Location**: `tests/cases/warnings/[category]/[warning-case]/`

## Error Message Standards

### Format Template

```
ErrorType: Brief description

[Location context if available]
  line | code causing error
         ^^^^^ error indicator

[Additional context]
[Suggestions/workarounds]
```

### Example Messages

**Parse Error:**
```
MlldParseError: Expected closing template delimiter "]]" after template content.

  5 | @text greeting = [[Hello, {{name}}
                                       ^
```

**Runtime Error:**
```
VariableResolutionError: Variable 'missing' is not defined

  3 | @text output = [[Hello, {{missing}}]]
                              ^^^^^^^^^

Available variables: name, title, date
```

**Import Chain Error:**
```
MlldImportError: File not found: './config.mld'

  2 | @import { settings } from "./config.mld"
                               ^^^^^^^^^^^^^^^

Import chain:
  main.mld:2:1
    └─ config.mld (not found)
```

## Implementation Patterns

### Creating Errors

Always use specific error classes with full context:

```typescript
// ❌ Generic error
throw new Error('Variable not found: ' + name);

// ✅ Specific error with context
throw new VariableResolutionError(
  `Variable '${name}' is not defined`,
  {
    code: 'VARIABLE_NOT_FOUND',
    severity: ErrorSeverity.Recoverable,
    details: {
      variableName: name,
      availableVariables: env.getVariableNames(),
      suggestion: findSimilarVariable(name, env)
    },
    sourceLocation: {
      filePath: context.file,
      line: node.location?.start.line,
      column: node.location?.start.column
    }
  }
);
```

### Error Recovery

Support both strict and lenient modes:

```typescript
try {
  return await evaluateVariable(name, env);
} catch (error) {
  if (error instanceof MlldError && error.canBeWarning()) {
    if (options.strict) {
      throw error; // Fail fast in strict mode
    } else {
      // Recover in lenient mode
      env.addWarning(error);
      return `{{${name}}}`; // Preserve original for debugging
    }
  }
  throw error; // Re-throw fatal errors
}
```

### CLI Error Handling

The CLI is configured to catch and display errors appropriately:

```typescript
// In cli/index.ts
try {
  const result = await interpret(content, options);
  await writeOutput(result);
} catch (error) {
  if (error instanceof MlldError) {
    console.error(formatError(error));
    process.exit(1);
  }
  throw error; // Re-throw unexpected errors
}
```

## Adding New Error Tests

### 1. Create Test Case

Create directory structure:
```
tests/cases/[category]/[error-name]/
├── example.md    # Invalid syntax
└── error.md      # Expected error message
```

### 2. Write Test Content

`example.md` - Use invalid mlld syntax:
```markdown
@text broken = [[missing closing bracket
```

`error.md` - Write exact expected error:
```
Expected closing template delimiter "]]" after template content.
```

### 3. Generate Fixture

Run the fixture generator:
```bash
npm run build:fixtures
```

This will create `tests/fixtures/[test-name].fixture.json` with `expectedError` field.

### 4. Run Test

```bash
npm test interpreter/interpreter.fixture.test.ts
```

The test will verify that the interpreter throws an error matching the expected message.

## Testing Error Messages

Error messages are **part of the specification** - they're tested as carefully as feature code to ensure consistency and helpfulness.

### Best Practices

1. **Be specific**: Error messages should clearly identify the problem
2. **Include location**: Show exactly where the error occurred
3. **Provide context**: Show available alternatives when relevant
4. **Suggest fixes**: Include actionable suggestions when possible
5. **Test thoroughly**: Every error path should have a test case

### Message Guidelines

- Start with error type: `VariableResolutionError: ...`
- Use present tense: "Variable 'x' is not defined" not "Variable 'x' was not defined"
- Include relevant context: available variables, valid options, etc.
- Keep technical details accessible to end users
- Provide suggestions when the fix is obvious

## Current Status

### ✅ Implemented
- Error class hierarchy with severity levels
- Location tracking in errors  
- Basic test infrastructure for error cases
- CLI error handling foundation

### 🚧 In Progress
- Error test case expansion (as identified in Issues #56-72)
- Comprehensive error message testing
- Import chain context in error messages
- Training wheels warnings system

### 📋 Planned
- Pretty error formatting with code context
- Error suggestion system (typo detection)
- Structured error output (JSON/SARIF)
- IDE integration support

## Related Files

- **Error Classes**: `core/errors/*.ts`
- **Error Messages**: `core/errors/messages/*.ts`
- **Test Infrastructure**: `tests/utils/ast-fixtures.js`, `interpreter/interpreter.fixture.test.ts`
- **CLI Integration**: `cli/index.ts`
- **Error Test Cases**: `tests/cases/invalid/`, `tests/cases/exceptions/`, `tests/cases/warnings/`