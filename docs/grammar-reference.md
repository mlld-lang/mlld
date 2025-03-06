# Meld Grammar Reference

This document provides a comprehensive reference for the Meld syntax.

## Core Tokens

### Directives

Directives must appear at start of line (no indentation):
```
@embed    - Include content from files
@run      - Execute shell commands
@import   - Import variables and commands from other Meld files
@define   - Create reusable commands
@text     - Define text variables
@path     - Define filesystem path variables
@data     - Define structured data variables
```

### Comments

Lines that begin with `>> ` (two greater-than signs followed by a space) are treated as comments:
```meld
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
[ ]     Command/path boundaries
[[ ]]   Multi-line command boundaries
{ }     Function embed boundaries
{{ }}   Multi-line object boundaries
#       Section marker
=       Assignment (requires spaces on both sides)
.       Metadata/field accessor
,       List separator
>>      Format operator
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
- Multi-line strings use [[` and `]] delimiters

### Identifiers

- Must start with letter or underscore
- Can contain letters, numbers, underscore
- Case-sensitive
- Cannot be empty

## Variable Types

### Path Variables

Syntax: `$identifier`
```meld
$path                # Reference a path variable
$HOMEPATH or $~      # Special path variable for home directory
$PROJECTPATH or $.   # Special path variable for project root
```

### Text Variables

Syntax: `{{identifier}}`
```meld
{{textvar}}                    # Text variable reference
{{textvar>>(format)}}         # Formatted text variable
```

### Data Variables

Syntax: `{{identifier}}`
```meld
{{datavar}}                    # Data variable reference
{{datavar.field}}             # Data variable field access
{{datavar.0}}                 # Array element access (use dot notation)
{{datavar.field>>(format)}}   # Formatted data field access
```

## Code Fences

Triple backticks that:
- Must appear at start of line
- Can optionally be followed by a language identifier
- Must be closed with exactly the same number of backticks
- Content inside is treated as literal text
- Support nesting with different numbers of backticks

Example:
```meld
​```python
def hello():
    print("Hi")  # @text directives here are preserved as-is
​```
```

## Directive Patterns

### @embed

```meld
@embed [path]
@embed [path # section_text]
@embed [path] as ###                    # ### parsed as count of # chars
@embed [path # section_text] as ###
@embed [path] under header_text
```

### @run

```meld
@run [command_text]
@run [command_text] under header_text
@run [$command({{textvar1}}, {{textvar2}})]
```

### @import

```meld
@import [path]
```

### @define

```meld
@define identifier = @run [content]
@define command(param1, param2) = @run [content {{param1}} {{param2}}]
@define command.risk = "description"
@define command.about = "description"
@define command.meta = "description"
```

### @text

```meld
@text identifier = "value"
@text identifier = @embed [content]
@text identifier = @run [command]
```

### @path

```meld
@path identifier = "$HOMEPATH/path"
@path identifier = "$~/path"
@path identifier = "$PROJECTPATH/path"
@path identifier = "$./path"
```

### @data 

```meld
@data identifier = value
@data identifier : schema = value
```

## String Concatenation

Uses the `++` operator with required spaces on both sides:

```meld
@text greeting = "Hello" ++ " " ++ "World"
@text message = {{intro}} ++ {{body}}
```

## Template Literals

Delimited by backticks (`):
```meld
`Hello {{name}}!`                        # Text variable
`Config: {{config.name}}`                # Data variable with field
`{{greeting}}, your ID is {{user.id}}`    # Mixed variables
```

Multi-line template literals:
```meld
@text prompt = [[`
  System: {{role}}
  
  Context:
  {{context.data}}
  
  User: {{username}}
`]]
```

## Variable Interpolation Rules

Variable references are allowed in:
- Inside square brackets [...] for paths and commands
- Inside object literals {{...}} and single-line objects
- Inside template literals (backtick strings) for string interpolation
- Inside directive values after = (including object literals and template literals)

They are NOT allowed in:
- Plain text lines
- Regular string literals (use template literals instead)
- Outside of the contexts listed above

Rules for specific variable types:
- Path variables ($path) only allowed in path contexts
- Text variables ({{text}}) allowed in all interpolation contexts
- Data variables ({{data}}) allowed in all interpolation contexts except command parameters