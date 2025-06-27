---
layout: docs.njk
title: "/text Directive"
---

# /text Directive

The `/text` directive defines a text variable that can store string values.

## Syntax

```mlld
/var @identifier = "value"
/var @identifier = "Hello @name!"
/var @identifier = `Template with @variable`
/var @identifier = ::Template with {{variable}}::
/var @identifier = /run "command"
```

Where:
- `@identifier` is the variable name (requires `@` prefix when creating)
- `value` can be:
  - Quoted strings (with optional @ interpolation in double quotes)
  - Backtick templates (with @ interpolation)
  - Double-bracket templates (with {{}} interpolation)
  - Results from `/run` or other directives

## Identifier Requirements

- Must start with a letter or underscore
- Can contain letters, numbers, and underscores
- Case-sensitive
- Cannot be empty

## String Values

Text values can be defined using different quote styles:

```mlld
/var @simple = "Plain string"              # Double quotes
/var @interpolated = "Hello @name!"        # @ interpolation in double quotes
/var @literal = 'Single quotes @name'      # Single quotes (no interpolation)
/var @backtick = `Hello @name!`            # Backtick template with @ interpolation
/var @template = ::Hello {{name}}!::       # Double-bracket template with {{}} interpolation
```

For multi-line templates, use double brackets:

```mlld
/var @multiline = ::
  This is a
  multi-line
  template with {{variables}}
::
```

## Referencing Text Variables

Text variables are referenced differently based on context:
- In directives: `@identifier`
- In double quotes: `@identifier`
- In backtick templates: `@identifier`
- In double-bracket templates `::...::`: `{{identifier}}`

```mlld
/var @name = "World"
/var @greeting = "Hello, @name!"           # @ interpolation
/var @welcome = `Welcome, @name!`           # @ in backticks
/var @message = ::Greetings, {{name}}!::   # {{}} in double brackets
/show @greeting
```

## Variable Interpolation

Different template styles support different interpolation syntax:

### Double Quotes and Backticks (@ interpolation)
- Text variables: `"Hello, @name!"`
- Field access: `"User: @user.name"`
- Array access: `"Score: @scores.0"`

### Double-Bracket Templates ({{}} interpolation)
- Text variables: `::Hello, {{name}}!::`
- Field access: `::User: {{user.name}}::`
- Array access: `::Score: {{scores.0}}::`


## Examples

Basic text variable:
```mlld
/var @title = "My Document"
/var @author = "Jane Smith"
```

Using @ interpolation:
```mlld
/var @user = "Alice"
/var @greeting = "Welcome back, @user!"
```

Using the result of a command:
```mlld
/var @date = /run "date +%Y-%m-%d"
```

Using different template styles:
```mlld
/var @name = "World"
/var @msg1 = "Hello, @name!"              # @ in double quotes
/var @msg2 = `Greetings, @name!`          # @ in backticks
/var @msg3 = ::Welcome, {{name}}!::       # {{}} in double brackets
```

## Error Handling

- Empty values are not allowed
- Quotes must match (no mixing of quote types)
- Circular references in variables will be detected and prevented
- Variable resolution has a maximum depth (10 levels) to prevent infinite recursion

## Notes

- Variables must be created with the `@` prefix: `/text @name = "value"`
- Text variables cannot have field access (use data variables for structured data)
- Double quotes and backticks support @ interpolation
- Single quotes treat @ as literal text (no interpolation)
- Double-bracket templates `::...::` require `{{var}}` syntax for interpolation
- The key rule: "Double brackets, double braces"