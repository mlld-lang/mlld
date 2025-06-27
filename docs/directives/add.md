---
layout: docs.njk
title: "/add Directive"
---

# /add Directive

The `/add` directive includes content from external files, variables, or templates into your mlld document.

## Syntax

```mlld
/show [path]
/show [path # section]
/show [path # section] as "# New Title"
/show "Section Title" from [path]
/show "Section Title" from [path] as "# New Title"
/show @variable
/show "literal text"
/show ::template content with {{variables}}::
/show @templateFunction(param1, param2)
```

Where:
- `path` is the path to the file to include
- `section` is optional text that identifies a specific section to extract
- `"# New Title"` is an optional replacement title for the section
- `@variable` is a variable reference
- `::...::` is a template with variable interpolation

## Including Files

Basic file inclusion:
```mlld
/show [README.md]
/show [docs/guide.md]
```

## Section Extraction

Extract specific sections from files:

```mlld
# Extract a section keeping its original title
/show [guide.md # Getting Started]

# Extract a section with a new title
/show [guide.md # Getting Started] as "# Quick Start"

# Extract by section title from the beginning
/show "Getting Started" from [guide.md]
/show "Getting Started" from [guide.md] as "# Quick Start"
```

## Including Variables

Add content from variables:

```mlld
/var @greeting = "Hello, world!"
/show @greeting

/var @user = { "name": "Alice", "role": "Admin" }
/show @user.name
```

## Template Content

Add content with variable interpolation:

```mlld
/var @name = "Alice"
/var @role = "Admin"
/show ::Welcome {{name}}! Your role is: {{role}}::
```

## Template Functions

Use template functions defined with /exec:

```mlld
/exe @greet(name) = ::Hello, {{name}}!::
/show @greet("World")

/exe @message(user, action) = ::{{user}} {{action}} successfully!::
/show @message("Alice", "logged in")
```

## Path Types

Paths can be:
- Relative: `[docs/guide.md]`
- Absolute: `[/usr/local/docs/guide.md]`
- Project relative: `[@./docs/guide.md]`
- From path variable: `[@docsPath/guide.md]`
- URLs: `[https://example.com/guide.md]`
- Resolver paths: `[@PROJECTPATH/docs/guide.md]`

## Error Handling

The implementation handles these error scenarios:
- File not found
- Section not found in target file
- Invalid syntax
- Circular file inclusions

## Examples

Include entire file:
```mlld
/show [README.md]
/show [@./docs/architecture.md]
```

Include specific sections:
```mlld
/show [docs/api.md # Authentication]
/show "## Installation" from [README.md]
```

Include with renamed sections:
```mlld
/show [guide.md # Getting Started] as "# Quick Start Guide"
/show "Installation" from [README.md] as "## Setup Instructions"
```

Include from URLs:
```mlld
/show [https://raw.githubusercontent.com/example/repo/main/README.md]
```

Include literal text and variables:
```mlld
/var @status = "active"
/show "System status: @status"
/show @status
```

## Notes

- Missing files will generate errors
- Section matching is case-sensitive
- For non-markdown files, the entire file content is included
- The implementation protects against circular file inclusions
- Template variables use `{{variable}}` syntax inside `::...::` blocks