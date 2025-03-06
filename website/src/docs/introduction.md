---
layout: docs.njk
title: "Introduction to Meld"
---

{% raw %}
# Introduction to Meld

Meld is a simple and constrained scripting language designed for use within markdown-like documents. It allows you to create dynamic content by interpreting special directive lines while preserving all other content as-is.

## Core Concepts

Meld works by processing only lines that begin with directives (like `@text`, `@run`, etc.) while treating all other content as literal text. This makes it ideal for creating dynamic, templated documents.

### Key Features

- Simple, predictable syntax with clear boundaries
- Focused on markdown integration and content generation
- Support for variables, file imports, and command execution
- Preserves existing content structure

## Basic Example

```meld
@text name = "World"
@path docs = "$PROJECTPATH/docs"

Hello, {{name}}!

@embed [$docs/example.md]

@run [echo "Current time: $(date)"]
```

This example:
1. Defines a text variable `name` with the value "World"
2. Defines a path variable `docs` pointing to the project's docs folder
3. Uses the text variable in a template string
4. Embeds content from an external file
5. Runs a shell command and includes its output

## Next Steps

- Learn about [variables and interpolation](./variables.md)
- Explore the [directives](./directives/README.md) available in Meld
- Check the complete [grammar reference](./grammar-reference.md) for detailed syntax
{% endraw %}