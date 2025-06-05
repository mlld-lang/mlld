---
layout: docs.njk
title: "Error Handling"
---

# Error Handling

Mlld has a structured approach to error handling, categorizing errors into different severity levels.

## Error Categories

### Fatal Errors (Halt Execution)

These errors stop Mlld execution immediately:

- Missing or inaccessible referenced files
- Invalid syntax in Mlld files
- Invalid file extensions
- Circular imports
- Type mismatches (using wrong variable type)
- Missing required command parameters
- Invalid path syntax or malformed paths

### Warning Errors (Continue with Warning)

These issues generate warnings but allow execution to continue:

- Missing optional fields in data structures (returns empty string)
- Missing environment variables (when referenced)
- Command execution that produces stderr but exits with code 0
- Fields accessed on non-existent data paths (returns empty string)

### Silent Operation (No Error/Warning)

These situations don't generate errors or warnings:

- Expected stderr output from successfully running commands
- Empty or partial results from valid operations
- Type coercion in string concatenation
- Normal command output to stderr

## Common Error Scenarios

### File System Errors

- **Missing Files**: When an `@add` or `@import` directive references a non-existent file
- **Path Validation**: When paths contain null bytes or are malformed
- **File Permission Issues**: When Mlld can't read a referenced file

### Syntax Errors

- **Invalid Directive Syntax**: Malformed directives or missing required components
- **Invalid Variable References**: Using variables that haven't been defined
- **Quoting Issues**: Mismatched quotes or invalid string formats

### Execution Errors

- **Command Failures**: When an `@run` command exits with a non-zero status
- **Circular Imports**: When Mlld detects circular file imports
- **Type Mismatches**: Using the wrong variable type in a context

## Enhanced Error Display

Mlld provides rich, contextual error messages with visual source code context:

### CLI Error Display

When using Mlld from the command line, errors show:

- **Colorized output** with syntax highlighting
- **Source code context** with line numbers
- **Visual indicators** pointing to exact error locations  
- **Smart file paths** (relative when within project, absolute otherwise)
- **Structured details** with error-specific information
- **Helpful suggestions** for resolving common issues

Example error output:

```
VariableRedefinition: Variable 'author' is already defined and cannot be redefined

  ./test.mlld:2:1
  1 | @text author = "First Author"
  2 | @text author = "Second Author"
      ^
  3 | @add @author

Details:
  variableName: author
  existingLocation: ./test.mlld:1:1
  newLocation: ./test.mlld:2:1

💡 Variables in mlld are immutable by design. Use a different variable name or remove one of the definitions.
```

### API Error Handling

For programmatic usage, Mlld provides structured error information:

```typescript
import { formatError } from 'mlld';

try {
  const result = await interpret(content, options);
} catch (error) {
  const formatted = await formatError(error, {
    useSourceContext: true,
    useSmartPaths: true,
    basePath: projectRoot
  });
  
  console.log(formatted.formatted);  // Human-readable text
  console.log(formatted.json);       // Structured error data
  console.log(formatted.sourceContext); // Source code context
}
```

### Error Format Options

You can control error formatting with these options:

- `useColors`: Enable/disable color output (auto-detected for TTY)
- `useSourceContext`: Show source code context around errors
- `useSmartPaths`: Use relative paths when within project
- `basePath`: Project root for relative path resolution
- `contextLines`: Number of context lines around error (default: 2)

## Error Recovery

Mlld attempts to recover from non-fatal errors by:

- Substituting empty strings for missing data fields
- Continuing past warnings when possible
- Providing detailed error messages with line numbers and context
- Offering specific suggestions for common error patterns

## Best Practices

- Always check that referenced files exist
- Use path variables consistently
- Validate command exit codes
- Handle optional data fields gracefully
- Check for environment variables before using them
- Test Mlld scripts with error cases to ensure proper handling