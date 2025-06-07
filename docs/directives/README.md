---
layout: docs.njk
title: "mlld Directives"
---

# mlld Directives

Directives are the core building blocks of mlld. They always start with an `@` symbol and must appear at the beginning of a line (no indentation). Each directive has a specific purpose and syntax.

## Available Directives

- [@text](./text.md) - Define text variables
- [@data](./data.md) - Define structured data variables
- [@path](./path.md) - Define filesystem path variables
- [@add](./add.md) - Include content from files, variables, or templates
- [@run](./run.md) - Execute shell commands and include output
- [@import](./import.md) - Import variables from other mlld files
- [@output](./output.md) - Write content to files
- [@url](./url.md) - Reference remote URLs
- [@exec](./exec.md) - Create reusable commands
- [@when](./when.md) - Conditional actions 

## Directive Placement Rules

- Directives must appear at the start of a line (no indentation)
- `@import` directives should generally appear at the top of the file
- Other directives can appear anywhere in the file
- Directives inside code fences (``` ```) are treated as plain text

## Common Syntax Elements

Most directives follow this general pattern:

```
@directive [required] optional
```

Where:
- `@directive` is the directive name
- `[required]` is required content in brackets
- `optional` is additional optional content

## Next Steps

For detailed information on each directive, follow the links above or explore the individual documentation files.
