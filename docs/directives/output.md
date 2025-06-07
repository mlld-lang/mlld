# @output

The `@output` directive writes content to files instead of including it in the rendered document. It's useful for generating configuration files, splitting documentation, or creating multiple output files from a single mlld document.

## Syntax

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

The `@output` directive provides a way to write content to files during mlld processing. Unlike other directives that produce output in the document, `@output` silently writes to the specified file and produces no visible output.

### Key Features

- **No document output**: The directive itself produces no output in the rendered document
- **Automatic directory creation**: Creates nested directories as needed
- **Multiple output formats**: Supports variables, templates, commands, and literal text
- **Format detection**: Automatically formats certain data types (e.g., objects as JSON)

## Examples

### Basic Variable Output

```mlld
@text readme = "# My Project\n\nWelcome to my project!"
@data config = { "name": "my-app", "version": "1.0.0" }

@output @readme [README.md]
@output @config [package.json]
```

### Parameterized Template Output

```mlld
@text taskTemplate(issue, assignee) = @add [[
# Task {{issue}}
Assigned to: {{assignee}}

Please review the issue and provide updates.
]]

@output @taskTemplate("123", "Alice") [tasks/task-123.md]
@output @taskTemplate("124", "Bob") [tasks/task-124.md]
```

### Command Output

```mlld
@exec generateReport(type) = @run [python report.py --type @type]

@output @generateReport("weekly") [reports/weekly.txt]
@output @generateReport("monthly") [reports/monthly.txt]
```

### Document Output

```mlld
# Project Documentation

This is the main documentation that will be rendered.

@text apiDocs = "# API Reference\n\nAPI documentation here..."
@output @apiDocs [docs/api.md]

# The document continues here

More content for the main document.

@output [output/full-document.md]
```

### Literal Text Output

```mlld
@output "Copyright 2024 - All rights reserved" [LICENSE.txt]
@output "node_modules/\n*.log\n.env" [.gitignore]
```

## Behavior

1. **File paths**: Paths can be relative (resolved from the current working directory) or absolute
2. **Directory creation**: Parent directories are created automatically if they don't exist
3. **Overwriting**: Existing files are overwritten without warning
4. **Data formatting**: 
   - Objects and arrays are automatically formatted as JSON when output to `.json` files
   - Other data types are converted to strings
5. **No output**: The directive produces no output in the document itself

## Common Use Cases

- **Configuration generation**: Generate multiple config files from data variables
- **Documentation splitting**: Break large documents into smaller files
- **Report generation**: Create multiple reports from templates
- **Code generation**: Generate source files based on data or templates
- **Multi-format output**: Create the same content in different formats

## Error Handling

The directive will fail if:
- The specified variable, template, or command doesn't exist
- File system permissions prevent writing
- The path contains invalid characters
- Disk space is insufficient

## Related Directives

- [`@text`](./text.md) - Define text variables and templates
- [`@data`](./data.md) - Define data structures
- [`@exec`](./exec.md) - Define parameterized commands
- [`@add`](./add.md) - Add content to the document (opposite of @output)