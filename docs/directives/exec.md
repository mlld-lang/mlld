---
layout: docs.njk
title: "/exec Directive"
---

# /exec Directive

The `/exec` directive creates reusable commands, templates, and functions that can be invoked throughout your mlld document.

## Syntax

```mlld
/exec @commandName = "shell command"                    # Simple command
/exec @commandName(param) = "command with @param"       # Parameterized command
/exec @funcName(param) = js {return @param * 2}         # Code function
/exec @template(name) = `Hello @name!`                  # Template function
/exec @section(file) = [@file # Introduction]           # Section reference
/exec @js = { func1, func2 }                            # Shadow environment
```

Where:
- `@commandName` requires the `@` prefix when defining
- Parameters are referenced as `@param` inside definitions
- Commands can use quotes or braces
- Code execution specifies language before braces

## Basic Commands

Define a simple command without parameters:
```mlld
/exec @buildProject = "npm run build"
/exec @listFiles = "ls -la"

# Execute the command
/run @buildProject()
/run @listFiles()
```

## Commands with Parameters

Define commands that accept parameters:
```mlld
/exec @greet(name) = "echo Hello, @name!"
/exec @makeDir(dirname) = "mkdir -p @dirname"

# Execute with arguments
/run @greet("World")
/run @makeDir("new-folder")

# Multi-line commands use braces
/exec @deploy(env, version) = {
  echo "Deploying @version to @env"
  npm run deploy:@env -- --version=@version
}
```

## Code Functions

Define JavaScript code blocks:
```mlld
/exec @sum(a, b) = js {
  return Number(@a) + Number(@b);
}

/exec @format(name) = js {
  const words = "@name".split(' ');
  const titled = words.map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
  return titled.join(' ');
}

# Execute functions
/text @result = /run @sum(5, 3)
/text @formatted = /run @format("john doe")
```

## Parameter Rules

- Parameters use `@param` syntax inside commands
- In shell commands, parameters are interpolated directly
- In JavaScript code, parameters are available as variables
- Parameter names must be valid identifiers

## Template Functions

Create reusable templates:
```mlld
/exec @greeting(name, time) = `Good @time, @name!`
/exec @link(text, url) = `[@text](@url)`
/exec @section(title, content) = [[
# {{title}}

{{content}}
]]

# Use templates
/text @msg = @greeting("Alice", "morning")
/add @link("Documentation", "https://example.com/docs")
```

## Examples

System information commands:
```mlld
/exec @getDate() = "date +%Y-%m-%d"
/exec @getUser() = "whoami"
/exec @getPath() = "pwd"

/text @today = /run @getDate()
/text @currentUser = /run @getUser()
```

File operations:
```mlld
/exec @backup(file) = "cp @file @file.bak"
/exec @count(pattern) = "grep -c '@pattern' *.txt"

/run @backup("important.txt")
/text @matches = /run @count("TODO")
```

Complex operations:
```mlld
/exec @analyze(file) = "wc -l @file | awk '{print $1 \" lines\"}'"
/exec @process(input, output) = {
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
/exec @utils = {
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
/exec @getStatus() = "echo active"
/exec @getVersion() = "echo 1.0.0"

/data @systemInfo = {
  "status": /run @getStatus(),
  "version": /run @getVersion(),
  "timestamp": /run "date -u +%Y-%m-%dT%H:%M:%SZ"
}
```

## Notes

- Exec names must be created with `@` prefix: `/exec @name`
- Parameters are passed as-is without shell escaping
- Be cautious with user input in commands
- JavaScript code has access to Node.js APIs
- Commands are evaluated when called, not when defined
- Templates support different interpolation based on type:
  - Backticks use `@variable`
  - Double brackets use `{{variable}}`