---
layout: docs.njk
title: "mlld Directives"
---

# mlld Directives

Directives are the core building blocks of mlld. They always start with a `/` symbol and must appear at the beginning of a line (no indentation). Each directive has a specific purpose and syntax.

## Available Directives

- [/var](./var.md) - Define variables (text, data structures, primitives)
- [/show](./show.md) - Display content from files, variables, or templates
- [/run](./run.md) - Execute shell commands and code
- [/exe](./exe.md) - Create reusable commands, templates, and functions
- [/import](./import.md) - Import variables from other mlld files or modules
- [/output](./output.md) - Write content to files, streams, or environment
- [/when](./when.md) - Conditional logic and routing
- [/path](./path.md) - Define filesystem path variables 

## Directive Placement Rules

- Directives must appear at the start of a line (no indentation)
- `/import` directives should generally appear at the top of the file
- Other directives can appear anywhere in the file
- Directives inside code fences (``` ```) are treated as plain text

## Common Syntax Elements

Most directives follow this general pattern:

```
/directive @variable = value
/directive "content"
/directive {multi-line content}
```

Where:
- `/directive` is the directive name (with `/` prefix)
- `@variable` is the variable name (with `@` prefix when creating)
- `value` can be strings, templates, or command outputs
- Commands use braces `{}` for multi-line or quotes `""` for single-line

## Next Steps

For detailed information on each directive, follow the links above or explore the individual documentation files.
