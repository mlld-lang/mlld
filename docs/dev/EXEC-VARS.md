# Executable Variables in mlld

This document explains how executable variables work in the mlld interpreter, including their behavior in different contexts and the disambiguation between variable references and exec invocations.

## Overview

Executable variables are variables created by `@exec` directives that store parameterized commands, code blocks, or templates. They can be invoked later with arguments to produce dynamic output.

## Types of Executable Variables

Based on the `ExecutableDefinition` type, mlld supports several types of executable variables:

1. **Command Executables** - Shell commands with parameter substitution
2. **Code Executables** - Language-specific code blocks (JS, Node, Python, etc.)
3. **Template Executables** - Text templates with parameter interpolation
4. **Command Reference Executables** - References to other executable variables (note: not yet supported in foreach contexts)
5. **Section Executables** - File section extraction with parameters

## Variable Reference vs Exec Invocation

The interpreter distinguishes between two ways to reference executable variables, providing a clean and universal pattern:

### Universal Pattern

- **`@myvar`** (without parentheses) = Reference to the executable itself
- **`@myvar()`** (with parentheses) = Execute and get the result

This consistent behavior applies everywhere in mlld, making it predictable and easy to understand.

### Variable Reference (without parentheses)
```mlld
@exec getDate = [date]
@data info = {
  dateCommand: @getDate    # Stores the executable itself
}
```

When an executable variable is referenced without parentheses (`@getDate`), the parser creates a `VariableReference` node. This allows:
- Passing executables as values
- Storing executables for later use
- Building higher-order patterns

The interpreter's `data-value-evaluator.ts` preserves the executable:

```typescript
// For executable variables, return the variable itself (for lazy execution)
// This preserves the executable for later execution rather than executing it now
if (variable.type === 'executable') {
  return variable;
}
```

### Exec Invocation (with parentheses)
```mlld
@exec getDate = [date]
@data info = {
  currentDate: @getDate()   # Executes and stores the result
}
```

When parentheses are added (`@getDate()`), the parser creates an `ExecInvocation` node. This triggers immediate execution through `exec-invocation.ts`.

## Execution Contexts

### In @run directives
```mlld
@exec greet(name) = [echo "Hello @name!"]
@run @greet("Alice")    # Executes immediately
```

### In @data directives
```mlld
@exec timestamp = [date +%s]
@exec getUser = [whoami]

@data systemInfo = {
  # Reference pattern - stores the executable
  timestampCmd: @timestamp,      # Stores the executable itself
  getUserCmd: @getUser,          # Stores the executable itself
  
  # Execution pattern - executes and stores result
  currentTime: @timestamp(),     # Executes and stores "1634567890"
  currentUser: @getUser(),       # Executes and stores "john"
  
  # Can still use @run if preferred (but not required)
  altTime: @run @timestamp()     # Also executes
}

# Later usage
@run @systemInfo.timestampCmd()  # Execute the stored command
```

### In @add directives
```mlld
@exec header(title) = [[# {{title}}]]
@add @header("Welcome")    # Executes and outputs result
```

## Parameter Handling

Executable variables support parameters that are substituted during execution:

```mlld
@exec process(file, format) = [convert @file output.@format]
@run @process("image.png", "jpg")
```

Parameters are bound in a child environment during execution, making them available for interpolation in the command/code/template.

## The Universal Pattern in Practice

This reference vs execution pattern is consistent throughout mlld:

```mlld
@exec timestamp = [date +%s]
@exec log(msg) = [echo "[@msg]"]
@exec format(text) = [[**{{text}}**]]

# 1. Storing executables
@data tools = {
  time: @timestamp,         # Reference to executable
  logger: @log,            # Reference to executable
  formatter: @format       # Reference to executable
}

# 2. Executing stored executables
@add @tools.formatter("Hello")   # Executes with "Hello"
@run @tools.time()               # Executes timestamp

# 3. Arrays of executables
@data commands = [@timestamp, @log, @format]
@run @commands.0()               # Execute first command

# 4. Passing executables as parameters
@exec runTwice(cmd) = {
  @run @cmd()
  @run @cmd()
}
@run @runTwice(@timestamp)      # Pass executable, run it twice

# 5. Mixed usage in complex data
@data report = {
  metadata: {
    generator: @timestamp,       # Store the command
    generated: @timestamp(),     # Store the result
    formatFn: @format           # Store formatter
  },
  content: @format("Report"),    # Execute formatter
  commands: [@log, @timestamp]   # Array of executables
}
```

This pattern enables powerful composition and lazy evaluation strategies while maintaining clarity about when execution happens.

## Return Value Handling

The interpreter handles return values differently based on context:

1. **String results** - Used as-is
2. **JSON-like strings** - Parsed into objects/arrays in data contexts
3. **Objects** - Serialized to JSON for output contexts

Example from `exec-invocation.ts`:
```typescript
// If the result looks like JSON (from return statement), parse it
if (typeof codeResult === 'string' && 
    (codeResult.startsWith('"') || codeResult.startsWith('{') || codeResult.startsWith('[') || 
     codeResult === 'null' || codeResult === 'true' || codeResult === 'false' ||
     /^-?\d+(\.\d+)?$/.test(codeResult))) {
  try {
    const parsed = JSON.parse(codeResult);
    result = parsed;
  } catch {
    result = codeResult;
  }
}
```

## Implementation Notes

Key files for executable variable handling:

- `interpreter/eval/exec-invocation.ts` - Handles execution of exec invocations
- `interpreter/eval/data-value-evaluator.ts` - Handles lazy evaluation in data contexts
- `interpreter/eval/add.ts` - Handles executable variables in output contexts
- `grammar/directives/exec.peggy` - Defines exec directive syntax
- `core/types/executable.ts` - Type definitions for executable variables

The current implementation maintains backward compatibility while providing flexibility for future enhancements to make executable variables more seamlessly integrated throughout the language.