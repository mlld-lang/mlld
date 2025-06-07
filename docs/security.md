# Security Features in mlld

This document describes security-related features in mlld, including escaping mechanisms and shell command constraints.

## Shell Command Constraints

mlld restricts shell command execution to reduce security risks. These constraints are enforced at parse time through the grammar.

### Blocked Operators

The following shell operators produce parse errors and cannot be used in `@run` commands:

- `&&` (AND operator) - Use separate `@run` commands or `@when` for conditional execution
- `||` (OR operator) - Use `@when` directives for conditional logic
- `;` (semicolon) - Use separate `@run` commands for sequential execution
- `>` (redirect) - Use `@output` directive for file writing
- `>>` (append) - Use `@output` directive for file appending
- `<` (input redirect) - Use `@path` or file reading directives
- `&` (background) - All mlld commands run synchronously

### Allowed Operations

Pipes (`|`) are permitted for command chaining:
```mlld
@run [(ls -la | grep test)]
@run [(cat file.txt | sort | uniq)]
```

### Parse-Time Enforcement

These restrictions are enforced when the mlld file is parsed, not at runtime. This means:
- Invalid operators are caught before any code executes
- Error messages suggest mlld alternatives
- No runtime performance impact from security checks

### Example Error

```mlld
@run [(echo "test" && echo "test2")]
```

Results in:
```
Parse error: Shell operator AND (&&) is not allowed in mlld. 
Use separate @run commands or @when for control flow.
```

## Escaping System

mlld implements a multi-layer escaping system to handle special characters safely.

### String Escape Sequences

Standard escape sequences work in quoted strings and text templates:
- `\n` - newline
- `\t` - tab
- `\r` - carriage return
- `\0` - null character
- `\"` - double quote
- `\'` - single quote
- `\\` - backslash

Example:
```mlld
@text message = "Line 1\nLine 2\tTabbed"
@text path = "C:\\Users\\Documents"
```

### mlld Syntax Escaping

To include mlld syntax characters literally, escape them:
- `\@` - literal @ symbol (prevents variable interpolation)
- `\[` - literal left bracket
- `\]` - literal right bracket

Example:
```mlld
@text email = "contact\@example.com"
@text array = "items\[0\] = value"
```

### Variable Interpolation

Variables are interpolated in commands using the `@variable` syntax:
```mlld
@text name = "world"
@run [(echo "Hello @name")]  # Output: Hello world
```

To prevent interpolation, escape the @ symbol:
```mlld
@run [(echo "Email: contact\@example.com")]  # Output: Email: contact@example.com
```

### Processing Order

Escape sequences are processed in this order:
1. String escape sequences (`\n`, `\t`, etc.) → control characters
2. mlld syntax escapes (`\@`, `\[`, etc.) → literal characters
3. Variable interpolation (`@var`) → variable values
4. Shell execution

This ordering ensures predictable behavior across different contexts.

## Runtime Validation

In addition to parse-time checks, mlld performs runtime validation of commands:
- Secondary check for dangerous operators that might have been missed
- Validation occurs before shell execution
- Commands that fail validation throw runtime errors

## Security Considerations

These features are part of mlld's overall security approach:

- **Defense in depth**: Multiple layers of validation (parse-time and runtime)
- **Fail-safe defaults**: Dangerous operations blocked by default
- **Clear alternatives**: Error messages guide users to safer mlld patterns
- **No silent failures**: Security violations produce clear errors

### Limitations

- These features reduce but do not eliminate all security risks
- Shell command execution always carries inherent risks
- Additional security measures (sandboxing, permissions) may be needed
- User-supplied data should still be carefully validated

## Future Security Features

Additional security features are planned or in development:
- `mlld.lock.json` - Dependency locking and integrity verification
- Hash cache - Content integrity verification for imports
- Trust levels - Fine-grained permissions for different operations
- Import approval - User confirmation for new imports

These features will be documented as they become available.