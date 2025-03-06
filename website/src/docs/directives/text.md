---
layout: docs.njk
title: "@text Directive"
---

# @text Directive

The `@text` directive defines a text variable that can store string values.

## Syntax

```meld
@text identifier = "value"
@text identifier = @embed [content]
@text identifier = @run [command]
```

Where:
- `identifier` is the variable name (must be a valid identifier)
- `value` can be a quoted string, the result of an `@embed` directive, or the result of an `@run` directive

## Identifier Requirements

- Must start with a letter or underscore
- Can contain letters, numbers, and underscores
- Case-sensitive
- Cannot be empty

## String Values

Text values can be defined using different quote styles:

```meld
@text simple = "Plain string"       # Double quotes
@text also_simple = 'Single quotes' # Single quotes
@text template = `Hello {{name}}`    # Template literal with variable
```

For multi-line strings, use template literals with the `[[` and `]]` delimiters:

```meld
@text multiline = [[`
  This is a
  multi-line
  string with {{variables}}
`]]
```

## Referencing Text Variables

Text variables are referenced using the `{{identifier}}` syntax:

```meld
@text name = "World"
@text greeting = `Hello, {{name}}!`
```

## Variable Interpolation

Template literals (using backticks) support variable interpolation:

- Text variables: `Hello, {{name}}!`
- Nested variables: `Hello, {{user.{{userType}}}}`

## String Concatenation

```meld
@text first = "Hello"
@text second = "World"
@text message = {{first}} ++ " " ++ {{second}}
```

- Requires spaces on both sides of the `++` operator
- Joins string parts without adding spaces between them
- Cannot concatenate across multiple lines

## Examples

Basic text variable:
```meld
@text title = "My Document"
@text author = "Jane Smith"
```

Using the result of a command:
```meld
@text date = @run [date +"%Y-%m-%d"]
```

Embedding file content:
```meld
@text header = @embed [header.md]
```

## Error Handling

- Empty values are not allowed
- Quotes must match (no mixing of quote types)
- Circular references in variables will be detected and prevented
- Variable resolution has a maximum depth (10 levels) to prevent infinite recursion

## Notes

- Text variables cannot have field access (use data variables for structured data)
- Text variables can be used in template strings, commands, and data structures
- Only backtick strings support variable interpolation