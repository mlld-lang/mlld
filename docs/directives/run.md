---
layout: docs.njk
title: "@run Directive"
---

# @run Directive

The `@run` directive executes shell commands or code blocks and includes their output in your Mlld document.

## Syntax

### Shell Commands
```mlld
@run [command_text]
@run [command_text] under header_text
@run [$command(@textvar1, @textvar2)]
```

### Code Execution
```mlld
@run language [code_block]
@run language(param1, param2) [code_block]
```

Where:
- `command_text` is the shell command to execute
- `header_text` is optional text to use as a header for the command output
- `$command` refers to a command defined with `@exec`
- `language` is the programming language: `javascript`/`js`/`node`, `python`/`py`, or `bash`/`sh`/`shell`
- `code_block` is the code to execute (can be multiline with `[[...]]`)
- `param1, param2` are optional parameters passed to the code

## Command Specification

The command can be:
- A literal command: `@run [ls -la]`
- A command with variables: `@run [echo "Hello, {{name}}"]`
- A command with path variables: `@run [cat $docs/guide.md]`
- A defined command: `@run [$listFiles($path)]`

## Variables in Commands

You can use different types of variables in commands:
- Text variables: `{{textvar}}`
- Path variables: `$path`
- Special path variables: `$HOMEPATH`, `$~`, `$PROJECTPATH`, `$.`
- Command references: `$command(@param1, @param2)`

## Output Handling

By default, the command's standard output (stdout) is captured and included in your document. Additionally:

- Standard error (stderr) is also captured and can be included
- In transformation mode, the stdout (and sometimes stderr) replaces the directive node
- The output can be assigned to a variable: `@text result = @run [command]`

## Adding Headers

You can add a header to command output using the `under` keyword:

```mlld
@run [date] under Current Date
```

This will add a header "Current Date" above the command output.

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
@run javascript [console.log("Hello from JS")]
@run js(x, y) [console.log(Number(x) + Number(y))]
```

### Python
- Parameters are injected as variables
- Code is written to a temporary file and executed
- Requires `python3` to be available

```mlld
@run python [print("Hello from Python")]
@run py(name) [print(f"Hello, {name}!")]
```

### Bash/Shell
- Parameters are passed as environment variables
- Code is executed with `bash -c`
- Environment variables from the parent process are available

```mlld
@run bash [echo "Hello from Bash"]
@run sh(user, count) [
  echo "Welcome, $user!"
  echo "You are visitor number $count"
]
```

## Examples

Basic command execution:
```mlld
@run [echo "Hello, World!"]
```

Using variables in commands:
```mlld
@text name = "Alice"
@run [echo "Hello, {{name}}!"]
```

Using path variables:
```mlld
@path src = "$PROJECTPATH/src"
@run [ls -la $src]
```

Using command output in variables:
```mlld
@text date = @run [date +"%Y-%m-%d"]
@data files = @run [ls -la | jq -R -s -c 'split("\n")[:-1]']
```

Adding headers to output:
```mlld
@run [git status] under Repository Status
```

Using defined commands:
```mlld
@exec listFiles(dir) = @run [ls -la @dir]
@run [$listFiles($PROJECTPATH)]
```

Using code execution with `@exec`:
```mlld
@exec greet(name, lang) = @run bash [
  echo "Hello, $name!"
  echo "Your preferred language is $lang"
]
@run @greet("Developer", "Mlld")
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