---
layout: docs.njk
title: "/run Directive"
---

# /run Directive

The `/run` directive executes shell commands or code blocks and includes their output in your mlld document.

## Syntax

### Core Syntax
```mlld
/run "command"                      # Single-line command with quotes
/run {command}                      # Multi-line command with braces
/run language {code_block}          # Code execution
/run @command(@param1, @param2)     # Execute defined command
```

Where:
- Commands in quotes: `/run "echo Hello"`
- Commands in braces: `/run {echo "Hello World"}`
- Code execution specifies language before braces: `/run js {console.log("Hello")}`
- Command references use `@`: `/run @myCommand(arg1, arg2)`

Key points:
- Single-line shell commands use double quotes: `/run "echo hello"`
- Shell commands in braces: `/run {echo "hello" | tr a-z A-Z}`
- Code execution uses language specifier: `/run js {code}`
- `language` must be one of: `javascript`/`js`, `python`/`py`, or `bash`/`sh`
- Language is specified **outside** the braces for code execution
- Variables in commands use `@var` syntax
- Command references defined with `/exec` use `@command` syntax

## Command Specification

The command can be:
- A literal command: `/run "ls -la"`
- A command with variables: `/run "echo Hello, @name"`
- A command with path variables: `/run "cat @docs/guide.md"`
- A command with pipes: `/run {ls -la | head -5}`
- A defined command: `/run @listFiles(@path)`

## Variables in Commands

You can use different types of variables in commands:
- All variables use `@` syntax: `@textvar`, `@path`
- Special variables: `@PROJECTPATH`, `@.`
- Field access: `@object.field`, `@array.0`
- Command references: `@command(@param1, @param2)`

## Output Handling

By default, the command's standard output (stdout) is captured and included in your document. Additionally:

- Standard error (stderr) is also captured and can be included
- In transformation mode, the stdout (and sometimes stderr) replaces the directive node
- The output can be assigned to a variable: `/text @result = /run "command"`

## Error Handling

The implementation handles these error scenarios:
- Missing or empty command
- Command execution failures
- Commands that exit with non-zero status codes

## Code Execution

The `@run` directive can execute code in different languages by specifying the language before the brackets:

### JavaScript/Node.js
- Parameters become function arguments
- Console output is captured
- The code runs in a sandboxed environment

```mlld
/run js {console.log("Hello from JS")}
/run javascript {
  const name = "World";
  console.log(`Hello, ${name}!`);
}
```

### Python
- Parameters are injected as variables
- Code is written to a temporary file and executed
- Requires `python3` to be available

```mlld
/run python {print("Hello from Python")}
/run py {
  name = "World"
  print(f"Hello, {name}!")
}
```

### Bash/Shell
- The `sh` language specifier allows full bash features including `&&`, `||`, and multi-line scripts
- Regular `/run` commands (without `sh`) only support pipes (`|`)
- Parameters in `sh` blocks use `$param` syntax (shell variables)
- Code is executed with `bash -c`

```mlld
# Simple command - use regular run
/run "echo Hello from shell"
/run {echo "Hello" | tr a-z A-Z}

# Multi-line or conditional logic - use sh
/run sh {
  if [ -f "config.json" ]; then
    echo "Config found"
  fi
}

# With && or || operators - use sh
/run sh {
  npm test && npm build && echo "Success!"
}
```

## Examples

Basic command execution:
```mlld
/run "echo Hello, World!"
```

Using variables in commands:
```mlld
/var @name = "Alice"
/run "echo Hello, @name!"
```

Using path variables:
```mlld
/path @src = "./src"
/run "ls -la @src"
```

Commands with pipes:
```mlld
/run {cat data.txt | grep "pattern" | sort}
```

Note: For multi-line shell scripts or commands with `&&` or `||`, use the `sh` language specifier:
```mlld
/run sh {
  echo "Starting process..."
  npm install && npm test
  echo "Done!"
}
```

Using command output in variables:
```mlld
/var @date = /run "date +%Y-%m-%d"
/var @files = /run "ls -la | jq -R -s -c 'split(\"\\n\")[:-1]'"
```

Using defined commands:
```mlld
/exe @listFiles(dir) = "ls -la @dir"
/run @listFiles(@PROJECTPATH)
```

Using code execution:
```mlld
/exe @calculate(x, y) = js {return @x + @y}
/var @result = /run @calculate(5, 3)

/run js {
  const users = ["Alice", "Bob", "Charlie"];
  console.log(users.join(", "));
}
```

## Environment & Working Directory

- Commands execute in the environment of the mlld process
- The working directory defaults to the current working directory
- Environment variables are available to the command

## Notes

- Command execution is performed in a separate process using Node.js child_process.exec
- Commands that exit with non-zero status will generate errors
- The directive doesn't have built-in timeout mechanisms for long-running commands
- Command output is always converted to string (binary output may not be properly handled)
- The directive does not support interactive commands that require user input