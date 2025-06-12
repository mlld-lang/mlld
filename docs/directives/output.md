# @output

The `@output` directive writes content to various targets including files, streams, environment variables, and resolvers. It's useful for generating configuration files, splitting documentation, creating multiple output files, or integrating with external systems.

## Syntax

### Enhanced Syntax (Recommended)

```mlld
# Output to file
@output @variable to "path/to/file.ext"
@output @variable to [path/with/@interpolation.ext]

# Output to streams
@output @variable to stdout
@output @variable to stderr

# Output to environment variables
@output @variable to env              # Creates MLLD_VARIABLE
@output @variable to env:CUSTOM_NAME  # Creates CUSTOM_NAME

# Output to resolver
@output @variable to @resolver/path/file.ext

# With format specification
@output @variable to "file.json" as json
@output @variable to stdout as yaml
```

### Legacy Syntax (Backward Compatible)

```mlld
# Output the entire document
@output [filename.ext]

# Output a variable's content
@output @variable [filename.ext]

# Output a template invocation result
@output @template(arg1, arg2) [filename.ext]

# Output a command execution result
@output @command(arg1, arg2) [filename.ext]

# Output literal text
@output "text content" [filename.ext]
```

## Description

The `@output` directive provides flexible ways to write content to various destinations during mlld processing. Unlike other directives that produce output in the document, `@output` writes to external targets and produces no visible output in the document itself.

### Key Features

- **Multiple targets**: Write to files, stdout/stderr, environment variables, or through resolvers
- **No document output**: The directive itself produces no output in the rendered document
- **Automatic directory creation**: Creates nested directories as needed for file outputs
- **Format conversion**: Optional `as format` clause for output formatting
- **Variable interpolation**: File paths can include variable references in brackets
- **Environment integration**: Set environment variables for scripts and tools

## Examples

### File Output

```mlld
@text readme = "# My Project\n\nWelcome to my project!"
@data config = { "name": "my-app", "version": "1.0.0" }

# Enhanced syntax
@output @readme to "README.md"
@output @config to "package.json"

# With format specification
@output @config to "config.yaml" as yaml

# With path interpolation
@text outputDir = "dist"
@output @readme to [@outputDir/README.md]
```

### Stream Output

```mlld
@text result = "Build completed successfully!"
@text error = "Warning: deprecated API usage"

# Output to standard streams
@output @result to stdout
@output @error to stderr

# With formatting
@data metrics = { "tests": 150, "passed": 148, "failed": 2 }
@output @metrics to stdout as json
```

### Environment Variable Output

```mlld
@text apiKey = "sk-1234567890"
@data config = { "debug": true, "port": 3000 }

# Default naming (MLLD_APIKEY)
@output @apiKey to env

# Custom naming
@output @apiKey to env:API_KEY
@output @config to env:APP_CONFIG  # JSON stringified
```

### Parameterized Template Output

```mlld
@text taskTemplate(issue, assignee) = @add [[
# Task {{issue}}
Assigned to: {{assignee}}

Please review the issue and provide updates.
]]

# Enhanced syntax
@output @taskTemplate("123", "Alice") to "tasks/task-123.md"
@output @taskTemplate("124", "Bob") to "tasks/task-124.md"
```

### Command Output

```mlld
@exec generateReport(type) = @run [python report.py --type @type]

# Enhanced syntax
@output @generateReport("weekly") to "reports/weekly.txt"
@output @generateReport("monthly") to "reports/monthly.txt"

# Output to stdout for piping
@output @generateReport("summary") to stdout
```

### Document Output

```mlld
# Project Documentation

This is the main documentation that will be rendered.

@text apiDocs = "# API Reference\n\nAPI documentation here..."
@output @apiDocs to "docs/api.md"

# The document continues here

More content for the main document.

# Output the entire document
@output to "output/full-document.md"
```

### Literal Text Output

```mlld
@output "Copyright 2024 - All rights reserved" to "LICENSE.txt"
@output "node_modules/\n*.log\n.env" to ".gitignore"
```

## Behavior

### Target Types

1. **File Output**
   - Paths can be relative (resolved from the current working directory) or absolute
   - Parent directories are created automatically if they don't exist
   - Existing files are overwritten without warning
   - Supports variable interpolation in bracketed paths

2. **Stream Output**
   - `stdout`: Writes to standard output
   - `stderr`: Writes to standard error
   - Useful for CLI tools and piping

3. **Environment Variables**
   - Default pattern: `MLLD_` prefix + uppercase variable name
   - Custom names with `env:NAME` syntax
   - Objects/arrays are JSON stringified
   - Available to subsequent commands in the same process

4. **Resolver Output** (Future)
   - Write through custom resolvers
   - Enables integration with external systems

### Format Conversion

The optional `as format` clause supports:
- `json`: Pretty-printed JSON
- `yaml`: YAML format (future)
- `text`: Plain text

## Common Use Cases

- **Configuration generation**: Generate multiple config files from data variables
- **CI/CD integration**: Set environment variables for build tools
- **Documentation splitting**: Break large documents into smaller files
- **Report generation**: Create multiple reports from templates
- **Code generation**: Generate source files based on data or templates
- **Multi-format output**: Create the same content in different formats
- **Pipeline integration**: Output to stdout for use with other tools

## Error Handling

The directive will fail if:
- The specified variable, template, or command doesn't exist
- File system permissions prevent writing (for file output)
- The path contains invalid characters
- Environment variable names are invalid
- Resolver is not available or configured

## Related Directives

- [`@text`](./text.md) - Define text variables and templates
- [`@data`](./data.md) - Define data structures
- [`@exec`](./exec.md) - Define parameterized commands
- [`@add`](./add.md) - Add content to the document (opposite of @output)