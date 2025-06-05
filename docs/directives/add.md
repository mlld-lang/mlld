---
layout: docs.njk
title: "@add Directive"
---

# @add Directive

The `@add` directive includes content from external files, variables, or templates into your Mlld document.

## Syntax

```mlld
@add [path]
@add [path # section]
@add [path # section] as "# New Title"
@add "Section Title" from [path]
@add "Section Title" from [path] as "# New Title"
@add @variable
@add [[template content with {{variables}}]]
@add @templateFunction(param1, param2)
```

Where:
- `path` is the path to the file to include
- `section` is optional text that identifies a specific section to extract
- `"# New Title"` is an optional replacement title for the section
- `@variable` is a variable reference
- `[[...]]` is a template with variable interpolation

## Including Files

Basic file inclusion:
```mlld
@add [README.md]
@add [docs/guide.md]
```

## Section Extraction

Extract specific sections from files:

```mlld
# Extract a section keeping its original title
@add [guide.md # Getting Started]

# Extract a section with a new title
@add [guide.md # Getting Started] as "# Quick Start"

# Extract by section title from the beginning
@add "Getting Started" from [guide.md]
@add "Getting Started" from [guide.md] as "# Quick Start"
```

## Including Variables

Add content from variables:

```mlld
@text greeting = "Hello, world!"
@add @greeting

@data user = { "name": "Alice", "role": "Admin" }
@add @user.name
```

## Template Content

Add content with variable interpolation:

```mlld
@text name = "Alice"
@text role = "Admin"
@add [[Welcome {{name}}! Your role is: {{role}}]]
```

## Template Functions

Use template functions defined with @text:

```mlld
@text greet(name) = @add [[Hello, {{name}}!]]
@add @greet("World")

@text message(user, action) = @add [[{{user}} {{action}} successfully!]]
@add @message("Alice", "logged in")
```

## Path Types

Paths can be:
- Relative: `[docs/guide.md]`
- Absolute: `[/usr/local/docs/guide.md]`
- Project relative: `[@./docs/guide.md]`
- From path variable: `[@docsPath/guide.md]`
- URLs: `[https://example.com/guide.md]`

## Error Handling

The implementation handles these error scenarios:
- File not found
- Section not found in target file
- Invalid syntax
- Circular file inclusions

## Examples

Include entire file:
```mlld
@add [README.md]
@add [@./docs/architecture.md]
```

Include specific sections:
```mlld
@add [docs/api.md # Authentication]
@add "## Installation" from [README.md]
```

Include with renamed sections:
```mlld
@add [guide.md # Getting Started] as "# Quick Start Guide"
@add "Installation" from [README.md] as "## Setup Instructions"
```

Include from URLs:
```mlld
@add [https://raw.githubusercontent.com/example/repo/main/README.md]
```

## Notes

- Missing files will generate errors
- Section matching is case-sensitive
- For non-markdown files, the entire file content is included
- The implementation protects against circular file inclusions
- Template variables use `{{variable}}` syntax inside `[[...]]` blocks