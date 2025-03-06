# @define Directive

The `@define` directive creates reusable commands that can be referenced in `@run` directives.

## Syntax

```meld
@define command = @run [content]
@define command(param1, param2) = @run [content {{param1}} {{param2}}]

@define command.about = "description"
@define command.meta = "description"
```

Where:
- `command` is the name of the command (must be a valid identifier)
- `param1`, `param2`, etc. are parameter names (must be valid identifiers)
- `content` is the command content (following @run patterns)
- Field metadata is limited to specific fields (.about, .meta)

## Identifier Requirements

- Command names must start with a letter or underscore
- Can contain letters, numbers, and underscores
- Case-sensitive
- Cannot be empty

## Command Parameters

Parameters are defined in parentheses and must be referenced in the command body:

```meld
@define greet(name) = @run [echo "Hello, {{name}}!"]
```

Parameter rules:
- Names must follow identifier rules (start with letter/underscore)
- All parameters defined must be used in the command body
- All parameters referenced in the command must be declared
- No duplicate parameter names are allowed
- Parameters are referenced using `{{paramName}}` syntax
- Parameters are required when calling the command

```meld
@text user = "Alice"
@run [$greet({{user}})]
```

## Command Body Requirements

- The right-hand side must be an @run directive, not other directive types
- The command itself is the content inside the @run brackets
- Empty commands are technically allowed but will result in empty content

## Command Metadata

You can add metadata to commands using the field syntax:

```meld
@define listFiles(dir) = @run [ls -la {{dir}}]
@define listFiles.about = "Lists all files in the specified directory"
```

Supported metadata fields:
- `.about` - Command description
- `.meta` - Additional metadata

## Examples

Basic command definition:
```meld
@define sayHello = @run [echo "Hello, World!"]
@run [$sayHello]
```

Command with parameters:
```meld
@define greet(name, greeting) = @run [echo "{{greeting}}, {{name}}!"]
@text user = "Alice"
@run [$greet({{user}}, "Hi")]
```

Command with path variables:
```meld
@define listDir(dir) = @run [ls -la {{dir}}]
@path src = "$PROJECTPATH/src"
@run [$listDir($src)]
```

Command with metadata:
```meld
@define runScript(script) = @run [bash {{script}}]
@define runScript.about = "Executes a bash script"
```

## Error Handling

The implementation handles these error scenarios:
- Invalid directive structure
- Duplicate parameter names
- Invalid parameter names
- Unreferenced parameters (defined but not used)
- Undeclared parameters (used but not defined)
- Invalid metadata fields

## Notes

- The right-hand side of @define must be an @run directive
- Cannot use other directives (@embed, @text, etc.) as the command body
- Command parameters are required when calling the command
- Commands can only be used within @run directives
- Metadata fields are restricted to specific field names