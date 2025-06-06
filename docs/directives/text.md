---
layout: docs.njk
title: "@text Directive"
---

# @text Directive

The `@text` directive defines a text variable that can store string values.

## Syntax

```mlld
@text identifier = "value"
@text identifier = @add [content]
@text identifier = @run [(command)]
```

Where:
- `identifier` is the variable name (must be a valid identifier)
- `value` can be a quoted string, the result of an `@add` directive, or the result of an `@run` directive

## Identifier Requirements

- Must start with a letter or underscore
- Can contain letters, numbers, and underscores
- Case-sensitive
- Cannot be empty

## String Values

Text values can be defined using different quote styles:

```mlld
@text simple = "Plain string"       # Double quotes
@text also_simple = 'Single quotes' # Single quotes
@text template = [[Hello {{name}}]]  # Template with variable interpolation
```

For multi-line templates, use double brackets:

```mlld
@text multiline = [[
  This is a
  multi-line
  template with {{variables}}
]]
```

## Referencing Text Variables

Text variables are referenced differently based on context:
- In directives: `@identifier`
- In templates `[[...]]`: `{{identifier}}`

```mlld
@text name = "World"
@text greeting = [[Hello, {{name}}!]]
@add @greeting
```

## Variable Interpolation

Templates (using double brackets) support variable interpolation:

- Text variables: `[[Hello, {{name}}!]]`
- Field access: `[[User: {{user.name}}]]`


## Examples

Basic text variable:
```mlld
@text title = "My Document"
@text author = "Jane Smith"
```

Using the result of a command:
```mlld
@text date = @run [(date +"%Y-%m-%d")]
```

Embedding file content:
```mlld
@text header = @add [header.md]
```

## Error Handling

- Empty values are not allowed
- Quotes must match (no mixing of quote types)
- Circular references in variables will be detected and prevented
- Variable resolution has a maximum depth (10 levels) to prevent infinite recursion

## Notes

- Text variables cannot have field access (use data variables for structured data)
- Text variables can be used in templates, commands, and data structures
- Only templates `[[...]]` support variable interpolation with `{{var}}`
- In directives, use `@var` syntax