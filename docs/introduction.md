---
layout: docs.njk
title: "Introduction to mlld"
---

# Introduction to mlld

mlld is a simple and constrained scripting language designed for use within markdown-like documents. It allows you to create dynamic content by interpreting special directive lines while preserving all other content as-is.

## Core Concepts

mlld works by processing only lines that begin with directives (like `/text`, `/run`, etc.) while treating all other content as literal text. This makes it ideal for creating dynamic, templated documents.

### Key Features

- Simple, predictable syntax with clear boundaries
- Focused on markdown integration and content generation
- Support for variables, file imports, and command execution
- Preserves existing content structure

## Basic Example

```mlld
/var @name = "World"
/var @hour = 14
/var @greeting = @hour < 12 ? "Good morning" : "Good afternoon"

This line will be interpreted as plain text.

```
This will remain a codefence.
```

/show `@greeting, @name!`

/when @hour >= 9 && @hour < 17 => show "Office hours - support available"

/show <@./docs/example.md>

/run "echo Current time: $(date)"
```

This example:
1. Defines variables including one using the ternary operator
2. Shows how plain text is preserved as-is
3. Uses template interpolation to display a greeting
4. Uses operators in a conditional to show office hours
5. Includes content from an external file
6. Runs a shell command and includes its output

## Next Steps

- Learn about [variables and interpolation](./variables.md)
- Explore the [directives](./directives/README.md) available in mlld
- Check the complete [grammar reference](./grammar-reference.md) for detailed syntax