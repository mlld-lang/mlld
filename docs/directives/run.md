---
layout: docs.njk
title: "@run Directive"
---

# @run Directive

The `@run` directive executes shell commands or code blocks and includes their output in your Mlld document.

## Syntax

### Unified Syntax
```mlld
@run [(command_text)]
@run [(language code_block)]
@run @command(@param1, @param2)
```

Where:
- Commands are executed in the shell: `@run [(echo "Hello")]`
- Code execution requires a language keyword: `@run [(js console.log("Hello"))]`
- Command references use `@`: `@run @myCommand(arg1, arg2)`

Key points:
- `command_text` is any shell command with variable interpolation support
- `language` must be one of: `javascript`/`js`, `python`/`py`, or `bash`/`sh`
- `code_block` is the code to execute after the language keyword
- The `[(...)]` syntax unifies command and code execution
- Variables in commands use `@var` syntax
- Command references defined with `@exec` use `@command` syntax

## Command Specification

The command can be:
- A literal command: `@run [(ls -la)]`
- A command with variables: `@run [(echo "Hello, @name")]`
- A command with path variables: `@run [(cat @docs/guide.md)]`
- A defined command: `@run @listFiles(@path)`

## Variables in Commands

You can use different types of variables in commands:
- All variables use `@` syntax: `@textvar`, `@path`
- Special variables: `@HOMEPATH`, `@PROJECTPATH`, `@.`
- Field access: `@object.field`, `@array.0`
- Command references: `@command(@param1, @param2)`

## Output Handling

By default, the command's standard output (stdout) is captured and included in your document. Additionally:

- Standard error (stderr) is also captured and can be included
- In transformation mode, the stdout (and sometimes stderr) replaces the directive node
- The output can be assigned to a variable: `@text result = @run [(command)]`

## Error Handling

The implementation handles these error scenarios:
- Missing or empty command
- Command execution failures
- Commands that exit with non-zero status codes

## Code Execution

The `@run` directive can execute code in different languages:

### JavaScript/Node.js
- Parameters become function arguments
- Console output is captured
- The code runs in a sandboxed environment

```mlld
@run [(js console.log("Hello from JS"))]
@run [(js console.log("Hello, world!"))]
```

### Python
- Parameters are injected as variables
- Code is written to a temporary file and executed
- Requires `python3` to be available

```mlld
@run [(python print("Hello from Python"))]
@run [(py print("Hello from Python!"))]
```

### Bash/Shell
- Parameters are passed as environment variables
- Code is executed with `bash -c`
- Environment variables from the parent process are available

```mlld
@run [(bash echo "Hello from Bash")]
@run [(sh echo "Hello from Shell")]
```

## Examples

Basic command execution:
```mlld
@run [(echo "Hello, World!")]
```

Using variables in commands:
```mlld
@text name = "Alice"
@run [(echo "Hello, @name!")]
```

Using path variables:
```mlld
@path src = [@PROJECTPATH/src]
@run [(ls -la @src)]
```

Using command output in variables:
```mlld
@text date = @run [(date +"%Y-%m-%d")]
@data files = @run [(ls -la | jq -R -s -c 'split("\n")[:-1]')]
```

Using defined commands:
```mlld
@exec listFiles(dir) = @run [(ls -la @dir)]
@run @listFiles(@PROJECTPATH)
```

Using code execution with `@exec`:
```mlld
@exec greet(name) = @run [(bash echo "Hello, @name!")]
@run @greet("Developer")
```

## Environment & Working Directory

- Commands execute in the environment of the Mlld process
- The working directory defaults to the current working directory
- Environment variables are available to the command

## Notes

- Command execution is performed in a separate process using Node.js child_process.exec
- Commands that exit with non-zero status will generate errors
- The directive doesn't have built-in timeout mechanisms for long-running commands
- Command output is always converted to string (binary output may not be properly handled)
- The directive does not support interactive commands that require user input