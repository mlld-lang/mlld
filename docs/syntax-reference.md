---
layout: docs.njk
title: "Syntax Reference"
---

# Syntax Reference

This document provides a reference for the mlld syntax.

## Core Tokens

### Directives

Directives must appear at start of line (no indentation) and use the `/` prefix:
```
/show      - Include content from files
/run      - Execute shell commands
/import   - Import variables and commands from other mlld files
/exe     - Create reusable commands
/var     - Define text variables
/path     - Define filesystem path variables
/var     - Define structured data variables
/when     - Conditional actions
/for      - Iterate over collections
/output   - Write content to files or streams
/log     - Write messages to stdout
```

### Comments

Comments use `>>` (two greater-than signs) and can appear at start of line or end of line:
```mlld
>> This is a comment at start of line
/var @message = "Hello"  >> This is an end-of-line comment
```

- Start-of-line: `>> This is a comment`
- End-of-line: `/text @name = "Alice" >> This is also a comment`
- Inside templates/strings: `::Hello >> World::` - >> is treated as literal text, not a comment

### Delimiters

```
< >     File/URL loading and content extraction
:: ::   Double colon template boundaries (@ interpolation)
::: ::: Triple colon template boundaries ({{}} interpolation)
{ }     Command boundaries (braces for multi-line)
" "     Command boundaries (quotes for single-line)
` `     Backtick templates (with @ interpolation)
{{ }}   Variable interpolation in templates
#       Section marker
=       Assignment (requires spaces on both sides)
.       Metadata/field accessor
,       List separator
()      Command parameter list
:       Schema reference operator (optional)
|       Pipeline operator
[]      Array indexing and slicing
```

## Pipelines

### Basic

```mlld
/var @out = /run "echo hello" | @upper | @md
```

- Outside templates/quotes: spaced and stacked pipes are allowed.
- Inside templates/quotes: use condensed form only (e.g., `` `Hi @name|@upper` ``).
- Equivalent to: `with { pipeline: [@upper, @md] }`.

### Inline Effects

```mlld
/var @r = @data | @transform | log "ok" | show "done" | output to {file: { path: "out.txt" }}
```

- `| log` → writes to stderr; `| show` → stdout + document; `| output` → file/stream/env.
- Effects attach to the preceding stage and re-run on retries; they do not create stages.

### Context Variables

- `@pipeline` (alias `@p`) exposes stage outputs by index: `@p[0]`, `@p[1]`, `@p[-1]`.
- Retry info: `@pipeline.try`, `@pipeline.tries`, `@pipeline.retries.all`.
- Ambient `@ctx` within stages: `@ctx.try`, `@ctx.tries`, `@ctx.input`, `@ctx.hint`.

See: [Pipelines](./pipeline.md)

### Operators

```
# Comparison Operators
==      Equality (with mlld type coercion)
!=      Inequality
>       Greater than
<       Less than
>=      Greater than or equal
<=      Less than or equal

# Logical Operators
&&      Logical AND (short-circuits)
||      Logical OR (short-circuits)
!       Logical NOT (unary)

# Conditional Operator
? :     Ternary conditional (test ? true_value : false_value)

# Grouping
()      Parentheses for explicit precedence
```

#### Operator Precedence (highest to lowest)
1. `()` - Parentheses
2. `!` - Logical NOT
3. `>`, `<`, `>=`, `<=` - Comparison
4. `==`, `!=` - Equality
5. `&&` - Logical AND
6. `||` - Logical OR
7. `? :` - Ternary conditional

### String Values

- Must be quoted with ', ", or `
- Quotes must match (no mixing)
- Backslashes and quotes within strings are treated as literal characters
- Use `\.` to include a literal dot without triggering field access
- Single-line strings (', ") cannot contain newlines
- Double quotes (") support @ interpolation: "Hello @name"
- Backtick templates (`) support @ interpolation: `Hello @name!`
- Double-bracket templates support {{}} interpolation: :::Hello {{name}}!:::

### Identifiers

- Must start with letter or underscore
- Can contain letters, numbers, underscore
- Case-sensitive
- Cannot be empty

## Variable Types

### Path Variables

Syntax: Variables are created with `@identifier` and referenced with `@identifier`
```mlld
/path @docs = "./documentation"    # Create path variable
@docs                              # Reference path variable
<@./path>                          # Resolver path (needs alligators)
<@PROJECTPATH/config>              # Project root resolver path
```

### Text Variables

Variables are created with `@identifier` prefix and referenced differently based on context:
```mlld
/var @name = "Alice"              # Create text variable
@name                              # Reference in directives
"Hello @name"                     # Reference in double quotes
`Welcome @name!`                   # Reference in backtick templates
:::Content with {{name}}:::          # Reference in double-bracket templates
```

### Data Variables

Variables are created with `@identifier` prefix and support field access:
```mlld
/var @config = { "port": 3000 }   # Create data variable
@config                            # Reference data variable
@config.port                       # Field access with dot notation
@users.0                           # Array element access
@users[0:2]                        # Array slice (start:end)
::Port: {{config.port}}::          # Reference in template
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

### /show

```mlld
/show <path>
/show <path # section_text>
/show <path> as "# New Title"           # Rename section
/show "Section" from <path>
/show "Section" from <path> as "# New Title"
/show @variable                          # Add variable content
/show "Literal text"                    # Add literal text
/show :::Template with {{var}}:::          # Add template
/show {echo "Hello"}                    # Run command and display
/show js { console.log("Hi"); "Done" }  # Run JS and display
```

### /when

```mlld
# Simple form with operators
/when @score > 90 => show "Excellent!"
/when @isAdmin && @isActive => show "Admin panel"
/when !@isLocked => show "Available"

# Block forms
/when [
  @env == "prod" => @config = "production.json"     # Implicit var
  none => @config = "development.json"
]
/when first [
  @task == "build" => @compile()
  * => @default()
]

# Implicit actions (directive prefix optional)
/when @needsInit => @setup() = @initialize()            # Implicit exe
```

### /run

```mlld
/run "echo hello"                  # Single-line command with quotes
/run {echo "hello world"}          # Multi-line command with braces
/run js {console.log("Hi")}        # JavaScript code execution
/run python {print("Hello")}       # Python code execution
/run @command(@var1, @var2)         # Execute defined command
```

### /import

```mlld
/import { greeting, config } from "shared.mld"      # File import
/import { * } from "utils.mld"                      # Import all
/import { fetchData } from @corp/utils              # Module import (no quotes)
/import { readme } from <@./README.md>              # Resolver path import (alligators)
/import { API_KEY } from @INPUT                     # Environment variables
```

### /exec

```mlld
/exe @deploy(env) = "deploy.sh @env"              # Command executable
/exe @greet(name) = `Hello @name!`                # Template executable  
/exe @build(type) = {                             # Multi-line command
  npm run build:@type
  npm test
}
/exe @calculate(x) = js {return @x * 2}           # Code executable
/exe @getIntro(file) = <@file # Introduction>     # Section executable
/exe @js = { formatDate, parseJSON }               # Shadow environment

# Conditionals inside /exe
/exe @grade(score) = when [                        # Bare when: all matches run, last value returned
  @score >= 90 => "A"
  @score >= 80 => "B"
  * => "C"
]
/exe @httpStatus(code) = when first [              # when first: stop at first match
  @code >= 500 => "server error"
  @code >= 400 => "client error"
  * => "ok"
]
```

### /for

```mlld
# Output form - executes action for each item
/for @item in @array => show @item
/for @file in <*.md> => show `Processing @file.filename`

# Object iteration with key access
/for @value in @config => show `@value_key: @value`

# Collection form - returns array
/var @doubled = for @n in @numbers => @n * 2
/var @greetings = for @name in @names => `Hello, @name!`
```

### /var

```mlld
/var @name = "value"                    # Simple text
/var @greeting = "Hello @name!"         # With @ interpolation
/var @template = `Welcome @user!`       # Backtick template
/var @content = :::Hello {{name}}!:::     # Double-bracket template
/var @result = /run "date"              # From command output

# With expressions
/var @isValid = @score > 80 && @completed      # Logical expression
/var @status = @isPro ? "premium" : "basic"    # Ternary
/var @hasAccess = !@isBlocked                  # Negation

# With when expressions (value-returning)
/var @message = when [
  @lang == "es" => "Hola"
  @lang == "fr" => "Bonjour"
  true => "Hello"
]
```

### /path

```mlld
/path @docs = "./documentation"         # Simple path
/path @output = "results/@date.txt"     # Path with interpolation
/path @template = 'templates/@var.html'  # Single quotes (no interpolation)
/path @api = https://api.example.com/data (5m)  # URL with cache duration
```

### /data 

```mlld
/var @config = { "port": 3000 }         # JSON object
/var @users = ["Alice", "Bob"]         # Array
/var @settings : schema = value         # With schema validation
/var @result = /run "ls -la"           # From command output
```

## Templates

### Backtick Templates (Primary - with @ interpolation)
```mlld
/var @message = `Hello @name, welcome to @place!`
/var @link = `<@title>(@url)`
```

### Double Colon Templates (Alternative to backticks - with @ interpolation)
```mlld
/var @docs = ::The `getData()` function returns @value::
/var @code = ::
  Use `npm install` to setup
  Then call `init(@name)` to start
::
```
Double colon syntax is useful when you need backticks inside your template.

### Triple Colon Templates (For {{}} interpolation)
```mlld
/var @tweet = :::Hey {{user}}, check out {{handle}}'s new post!:::
/var @prompt = :::
  System: {{role}}
  Context: {{context.data}}
  User: {{username}}
:::
```

## Variable Interpolation Rules

### Context-Specific Rules:
- **Double quotes**: `"Hello @name"` - @ interpolation works
- **Single quotes**: `'Hello @name'` - @ is literal text (no interpolation)
- **Backtick templates**: `` `Hello @name!` `` - @ interpolation works
- **Double colon templates**: `::Hello @name!::` - @ interpolation works
- **Triple colon templates**: `:::Hello {{name}}!:::` - Use {{}} for variables
- **Commands in braces**: `{echo "User: @name"}` - @ interpolation works
- **Directives**: `/add @greeting` - Direct @ reference

### Key Rule: Template Interpolation
- Single/double quotes, backticks, and `::...::` use `@variable` syntax
- Triple colons `:::...:::` use `{{variable}}` syntax
