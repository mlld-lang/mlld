---
layout: docs.njk
title: "Error Handling"
---

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
- Invalid path references (not using $HOMEPATH/$PROJECTPATH)

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
- **Path Validation**: When paths don't use `$HOMEPATH` or `$PROJECTPATH`
- **File Permission Issues**: When Mlld can't read a referenced file

### Syntax Errors

- **Invalid Directive Syntax**: Malformed directives or missing required components
- **Invalid Variable References**: Using variables that haven't been defined
- **Quoting Issues**: Mismatched quotes or invalid string formats

### Execution Errors

- **Command Failures**: When an `@run` command exits with a non-zero status
- **Circular Imports**: When Mlld detects circular file imports
- **Type Mismatches**: Using the wrong variable type in a context

## Error Recovery

Mlld attempts to recover from non-fatal errors by:

- Substituting empty strings for missing data fields
- Continuing past warnings when possible
- Providing detailed error messages with line numbers and context

## Best Practices

- Always check that referenced files exist
- Use path variables consistently
- Validate command exit codes
- Handle optional data fields gracefully
- Check for environment variables before using them
- Test Mlld scripts with error cases to ensure proper handling