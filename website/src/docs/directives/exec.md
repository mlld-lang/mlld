---
layout: docs.njk
title: "@exec Directive"
---

# @exec Directive

The `@exec` directive creates reusable commands that can be invoked with `@run`.

## Syntax

```mlld
@exec commandName = @run [(shell command)]
@exec commandName(param1, param2) = @run [(command with @param1 and @param2)]
@exec functionName(param) = @run language [(code using param)]
```

Where:
- `commandName` is the name of the command (must be a valid identifier)
- `param1`, `param2`, etc. are parameter names
- Parameters are referenced as `@param` inside the command
- For code execution, language is specified before the brackets

## Basic Commands

Define a simple command without parameters:
```mlld
@exec buildProject = @run [(npm run build)]
@exec listFiles = @run [(ls -la)]

# Execute the command
@run @buildProject
@run @listFiles
```

## Commands with Parameters

Define commands that accept parameters:
```mlld
@exec greet(name) = @run [(echo "Hello, @name!")]
@exec makeDir(dirname) = @run [(mkdir -p @dirname)]

# Execute with arguments
@run @greet("World")
@run @makeDir("new-folder")
```

## JavaScript Functions

Define JavaScript code blocks:
```mlld
@exec sum(a, b) = @run js [(
  console.log(Number(@a) + Number(@b));
)]

@exec format(name) = @run js [(
  const words = "@name".split(' ');
  const titled = words.map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
  console.log(titled.join(' '));
)]

# Execute JavaScript functions
@run @sum(5, 3)
@run @format("john doe")
```

## Parameter Rules

- Parameters use `@param` syntax inside commands
- In shell commands, parameters are interpolated directly
- In JavaScript code, parameters are available as variables
- Parameter names must be valid identifiers

## Examples

System information commands:
```mlld
@exec getDate = @run [(date +"%Y-%m-%d")]
@exec getUser = @run [(whoami)]
@exec getPath = @run [(pwd)]

@text today = @run @getDate
@text currentUser = @run @getUser
```

File operations:
```mlld
@exec backup(file) = @run [(cp @file @file.bak)]
@exec count(pattern) = @run [(grep -c "@pattern" *.txt)]

@run @backup("important.txt")
@text matches = @run @count("TODO")
```

Complex operations:
```mlld
@exec analyze(file) = @run [(wc -l @file | awk '{print $1 " lines"}')]
@exec process(input, output) = @run [(
  cat @input | 
  tr '[:lower:]' '[:upper:]' | 
  sort | 
  uniq > @output
)]

@run @analyze("data.txt")
@run @process("input.txt", "output.txt")
```

## Using with Data Structures

Commands can be used within data structures:
```mlld
@exec getStatus = @run [(echo "active")]
@exec getVersion = @run [(echo "1.0.0")]

@data systemInfo = {
  "status": @run @getStatus,
  "version": @run @getVersion,
  "timestamp": @run [(date -u +"%Y-%m-%dT%H:%M:%SZ")]
}
```

## Notes

- Command names must be unique
- Parameters are passed as-is without shell escaping
- Be cautious with user input in commands
- JavaScript code has access to Node.js APIs
- Commands are evaluated when called with @run, not when defined