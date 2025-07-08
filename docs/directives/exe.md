---
layout: docs.njk
title: "/exe Directive"
---

# /exe Directive

The `/exe` directive creates reusable commands, templates, and functions that can be invoked throughout your mlld document.

## Syntax

```mlld
/exe @commandName = "shell command"                    # Simple command
/exe @commandName(param) = "command with @param"       # Parameterized command
/exe @funcName(param) = js {return @param * 2}         # Code function
/exe @template(name) = `Hello @name!`                  # Template function
/exe @section(file) = [@file # Introduction]           # Section reference
/exe @js = { func1, func2 }                            # Shadow environment
```

Where:
- `@commandName` requires the `@` prefix when defining
- Parameters are referenced as `@param` inside definitions
- Commands can use quotes or braces
- Code execution specifies language before braces

## Basic Commands

Define a simple command without parameters:
```mlld
/exe @buildProject = "npm run build"
/exe @listFiles = "ls -la"

# Execute the command
/run @buildProject()
/run @listFiles()
```

## Commands with Parameters

Define commands that accept parameters:
```mlld
/exe @greet(name) = "echo Hello, @name!"
/exe @makeDir(dirname) = "mkdir -p @dirname"

# Execute with arguments
/run @greet("World")
/run @makeDir("new-folder")

# Multi-line commands use braces
/exe @deploy(env, version) = {
  echo "Deploying @version to @env"
  npm run deploy:@env -- --version=@version
}
```

## Code Functions

Define JavaScript code blocks:
```mlld
/exe @sum(a, b) = js {
  return Number(@a) + Number(@b);
}

/exe @format(name) = js {
  const words = "@name".split(' ');
  const titled = words.map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
  return titled.join(' ');
}

# Execute functions
/var @result = /run @sum(5, 3)
/var @formatted = /run @format("john doe")
```

## Parameter Rules

- Parameters use `@param` syntax inside commands
- In shell commands, parameters are interpolated directly
- In JavaScript code, parameters are available as variables
- Parameter names must be valid identifiers

## Template Functions

Create reusable templates:
```mlld
/exe @greeting(name, time) = `Good @time, @name!`
/exe @link(text, url) = `[@text](@url)`
/exe @section(title, content) = ::
# {{title}}

{{content}}
::

# Use templates
/var @msg = @greeting("Alice", "morning")
/show @link("Documentation", "https://example.com/docs")
```

## Examples

System information commands:
```mlld
/exe @getDate() = "date +%Y-%m-%d"
/exe @getUser() = "whoami"
/exe @getPath() = "pwd"

/var @today = /run @getDate()
/var @currentUser = /run @getUser()
```

File operations:
```mlld
/exe @backup(file) = "cp @file @file.bak"
/exe @count(pattern) = "grep -c '@pattern' *.txt"

/run @backup("important.txt")
/var @matches = /run @count("TODO")
```

Complex operations:
```mlld
/exe @analyze(file) = "wc -l @file | awk '{print $1 \" lines\"}'"
/exe @process(input, output) = {
  cat @input | 
  tr '[:lower:]' '[:upper:]' | 
  sort | 
  uniq > @output
}

/run @analyze("data.txt")
/run @process("input.txt", "output.txt")
```

## Shadow Environments

Create a collection of related functions:
```mlld
/exe @utils = {
  capitalize(str) = js {return str.charAt(0).toUpperCase() + str.slice(1)},
  reverse(str) = js {return str.split('').reverse().join('')},
  count(arr) = js {return arr.length}
}

# Functions can call each other within /run js blocks
/run js {
  const name = capitalize("alice");
  console.log(reverse(name));
}
```

## Using with Data Structures

Commands can be used within data structures:
```mlld
/exe @getStatus() = "echo active"
/exe @getVersion() = "echo 1.0.0"

/var @systemInfo = {
  "status": /run @getStatus(),
  "version": /run @getVersion(),
  "timestamp": /run "date -u +%Y-%m-%dT%H:%M:%SZ"
}
```

## Notes

- Exe names must be created with `@` prefix: `/exe @name`
- Parameters are passed as-is without shell escaping
- Be cautious with user input in commands
- JavaScript code has access to Node.js APIs
- Commands are evaluated when called, not when defined
- Templates support different interpolation based on type:
  - Backticks use `@variable`
  - Double brackets use `{{variable}}`