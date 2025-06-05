---
layout: docs.njk
title: "Syntax Reference"
---

# Syntax Reference

This document provides a comprehensive reference for the Mlld syntax.

## Core Tokens

### Directives

Directives must appear at start of line (no indentation):
```
@add      - Include content from files
@run      - Execute shell commands
@import   - Import variables and commands from other Mlld files
@exec     - Create reusable commands
@text     - Define text variables
@path     - Define filesystem path variables
@data     - Define structured data variables
@when     - Conditional actions
```

### Comments

Lines that begin with `>> ` (two greater-than signs followed by a space) are treated as comments:
```mlld
>> This is a comment
>> Comments must start at beginning of line (no indentation)
@text message = "Hello"  >> Invalid - comments must be on their own line
```

- Must appear at start of line (no indentation)
- Everything after `>> ` on that line is ignored
- Cannot be added to the end of directive lines
- Preserves comments exactly as written

### Delimiters

```
[ ]     Path boundaries
[[ ]]   Template boundaries
[( )]   Command boundaries
{{ }}   Multi-line object boundaries
#       Section marker
=       Assignment (requires spaces on both sides)
.       Metadata/field accessor
,       List separator
()      Command parameter list
:       Schema reference operator (optional)
++      String concatenation operator (requires spaces on both sides)
```

### String Values

- Must be quoted with ', ", or `
- Quotes must match (no mixing)
- Backslashes and quotes within strings are treated as literal characters
- Single-line strings (', ") cannot contain newlines
- Template literals (`) can interpolate variables: `Hello {{name}}`

### Identifiers

- Must start with letter or underscore
- Can contain letters, numbers, underscore
- Case-sensitive
- Cannot be empty

## Variable Types

### Path Variables

Syntax: `@identifier`
```mlld
@path                # Reference a path variable
[@./path]           # Project root path
```

### Text Variables

Syntax: `@identifier` in regular text, `{{identifier}}` in templates
```mlld
@textvar                       # Text variable reference
[[Content with {{textvar}}]]   # Variable in template
```

### Data Variables

Syntax: `@identifier` in regular text, `{{identifier}}` in templates
```mlld
@datavar                       # Data variable reference
@datavar.field                 # Data variable field access
@datavar[0]                    # Array element access
[[Content: {{datavar.field}}]] # Variable in template
```

## Code Fences

Triple backticks that:
- Must appear at start of line
- Can optionally be followed by a language identifier
- Must be closed with exactly the same number of backticks
- Content inside is treated as literal text
- Support nesting with different numbers of backticks

Example:
```mlld
​```python
def hello():
    print("Hi")  # @text directives here are preserved as-is
​```
```

## Directive Patterns

### @add

```mlld
@add [path]
@add [path # section_text]
@add [path] as "# New Title"           # Rename section
@add "Section" from [path]
@add "Section" from [path] as "# New Title"
```

### @run

```mlld
@run [(command_text)]
@run [(language code_text)]
@run @command(@var1, @var2)
```

### @import

```

### @exec

```mlld
@exec identifier = @run [(content)]
@exec command(param1, param2) = @run [(content @param1 @param2)]
@exec command = @run js [(code)]
```

### @text

```mlld
@text identifier = "value"
@text identifier = @add [path]
@text identifier = @run [(command)]
```

### @path

```mlld
@path identifier = [@./path]
@path identifier = [/absolute/path]
@path identifier = [relative/path]
```

### @data 

```mlld
@data identifier = value
@data identifier : schema = value
```

## Template Literals

Template literals:
```mlld
@text prompt = [[`
  System: {{role}}
  
  Context:
  {{context.data}}
  
  User: {{username}}
`]]
```

## Variable Interpolation Rules

Quotes are literal
Double bracket templates, double braces variables
@variables everywhere else
