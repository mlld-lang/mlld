# mlld Escaping Architecture

This document describes mlld's approach to escaping, covering both mlld syntax escaping and shell command safety. The system uses a clear 4-layer architecture where each layer has a single, well-defined responsibility.

## Overview

mlld processes escaping through four distinct layers:

1. **mlld Syntax Escaping** (Grammar/Parser level)
2. **String Escape Processing** (Post-parse processing)
3. **Variable Interpolation** (Value substitution)
4. **Context-Specific Escaping** (Shell safety, URL encoding, etc.)

Each layer operates independently and in sequence, ensuring predictable behavior and preventing double-escaping issues.

## Layer 1: mlld Syntax Escaping

**Purpose**: Allow literal use of mlld syntax characters in content  
**When**: During parsing (PEG grammar)  
**Location**: `grammar/base/segments.peggy`

### Supported Escape Sequences

```mlld
\@   → @     (prevent variable interpolation)
\[   → [     (literal bracket in commands/text)
\]   → ]     (literal bracket in commands/text)
\\   → \     (literal backslash)
```

### Examples

```mlld
# Prevent variable interpolation
@text email = "contact\@example.com"
# Result: contact@example.com

# Include literal brackets
run [echo "array\[0\] = value"]
# Command sees: echo "array[0] = value"

# Literal backslash
@text path = "C:\\Users\\Documents"
# Result: C:\Users\Documents
```

### Implementation

The grammar processes these escape sequences during parsing, producing clean strings in the AST with the escape characters removed. This happens only for mlld syntax characters - not for string escape sequences like `\n`.

## Layer 2: String Escape Processing

**Purpose**: Process standard string escape sequences  
**When**: After parsing, before interpolation  
**Location**: `interpreter/utils/string-processor.ts`

### Supported Escape Sequences

```mlld
\n   → newline
\t   → tab
\r   → carriage return
\\   → backslash
\"   → double quote
\'   → single quote
\0   → null character
```

### Examples

```mlld
# Multi-line text
@text message = "Line 1\nLine 2\tTabbed"
# Result: Line 1
#         Line 2    Tabbed

# Quoted strings
@text quoted = "He said \"Hello\" to me"
# Result: He said "Hello" to me
```

### Context

String escape processing applies uniformly across all string contexts - text assignments, command arguments, templates, etc. This ensures consistent behavior regardless of where strings appear.

## Layer 3: Variable Interpolation

**Purpose**: Replace variable references with their values  
**When**: During directive evaluation  
**Location**: `interpreter/core/interpolation.ts`

### Interpolation Contexts

Different contexts use different variable syntax:

- **Commands and Paths**: `@variable` syntax
- **Templates**: `{{variable}}` syntax
- **No mixing**: Cannot use `{{}}` in commands or `@` in templates

### Examples

```mlld
# In commands - use @variable
@text name = "Alice"
run [echo "Hello @name"]
# Executes: echo "Hello Alice"

# In templates - use {{variable}}
@text greeting = ::Hello {{name}}!::
@add @greeting
# Output: Hello Alice!

# Field access
@data user = { "name": "Bob", "age": 30 }
run [echo "@user.name is @user.age years old"]
# Executes: echo "Bob is 30 years old"
```

### Escaping in Interpolation

Values are interpolated as-is at this layer. Safety escaping happens in Layer 4 based on the execution context.

## Layer 4: Context-Specific Escaping

**Purpose**: Apply appropriate escaping for the execution context  
**When**: Just before execution/output  
**Location**: Various evaluators and output handlers

### Shell Command Escaping

For shell commands, mlld uses the `shell-quote` library to ensure safe execution:

```mlld
@text file = "my file.txt"
run [cat @file]
# Executes: cat 'my file.txt'

@text danger = "'; rm -rf /"
run [echo @danger]
# Executes: echo ''\''; rm -rf /'
# (Single quotes with proper escaping)
```

### Shell Operator Restrictions

To maintain security and clarity, mlld restricts shell operators:

- **Allowed**: Pipes (`|`) for data flow
- **Banned**: Command chaining (`;`, `&&`, `||`), redirects (`>`, `>>`), background (`&`)

```mlld
# ALLOWED - pipes for data flow
run [ls -la | grep "test" | wc -l]

# ERROR - use mlld control flow instead
run [mkdir test && cd test]  # Error: Use separate @run commands
run [test -f file || echo "missing"]  # Error: Use @when

# Do it the mlld way
run [mkdir test]
run [cd test]

@when run [test -f file] => @add "file exists"
```

### Other Contexts

While shell escaping is the primary focus, the architecture supports other contexts:

- **URL Encoding**: For URL parameters and paths
- **File Paths**: Platform-specific path normalization
- **JSON Output**: Proper JSON string escaping
- **XML Output**: Entity encoding for special characters

## Complete Example

Here's how all layers work together:

```mlld
@text user = "Alice"
@text file = "data\[2024\].txt"
@text message = "Processing complete\nStatus: Success"

# Layer 1: \[ and \] become literal brackets
# Layer 2: \n becomes newline
# Layer 3: @user and @file are interpolated
# Layer 4: Shell escaping applied to final values

run [echo "User: @user, File: @file"]
# Executes: echo 'User: Alice, File: data[2024].txt'

@add @message
# Output: Processing complete
#         Status: Success
```

## Security Considerations

1. **No Double Escaping**: Each layer tracks what escaping has been applied
2. **Context Awareness**: Escaping strategy matches execution context
3. **Safe Defaults**: Maximum safety escaping unless explicitly overridden
4. **Clear Errors**: Banned operators produce clear error messages at parse time

## Implementation Notes

### Parser Integration

The `ShellCommandLine` parser in `grammar/patterns/shell-command.peggy` provides structured parsing of commands, enabling:
- Detection of operators at parse time
- Clear error messages with exact locations
- Structured AST for proper escaping

### Escape State Tracking

Each value carries metadata about what escaping has been applied:
```typescript
interface EscapedValue {
  value: string;
  escapingApplied: Set<'syntax' | 'string' | 'shell' | 'url'>;
}
```

This prevents double-escaping and enables proper handling across contexts.

## Best Practices

1. **Use mlld patterns**: Separate commands, `@when` conditionals
2. **Trust the escaping**: Don't try to pre-escape values
3. **Keep it simple**: One command per `@run`, use pipes for data flow
4. **Explicit intent**: If you need shell features, make it clear in your code structure

## Migration from Raw Shell Scripts

When converting shell scripts to mlld:

```bash
# Shell script
mkdir -p "$OUTPUT_DIR" && cd "$OUTPUT_DIR" && echo "Ready"

# mlld equivalent
run [mkdir -p @OUTPUT_DIR]
run [cd @OUTPUT_DIR]
run [echo "Ready"]
```

The mlld version is more verbose but also more explicit, easier to debug, and safer from injection attacks.