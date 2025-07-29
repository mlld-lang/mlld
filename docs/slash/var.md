---
layout: docs.njk
title: "/var Directive"
---

# /var Directive

The `/var` directive is the unified way to define all types of variables in mlld, including text strings, data structures, and primitive values.

## Syntax

```mlld
/var @identifier = "value"
/var @identifier = "Hello @name!"
/var @identifier = `Template with @variable`
/var @identifier = ::Template with @variable::
/var @identifier = :::Template with {{variable}}:::
/var @identifier = /run "command"
```

Where:
- `@identifier` is the variable name (requires `@` prefix when creating)
- `value` can be:
  - Quoted strings (with optional @ interpolation in double quotes)
  - Backtick templates (with @ interpolation)
  - Double colon templates (with @ interpolation)
  - Triple colon templates (with {{}} interpolation)
  - Results from `/run` or other directives

## Identifier Requirements

- Must start with a letter or underscore
- Can contain letters, numbers, and underscores
- Case-sensitive
- Cannot be empty

## Variable Types

The `/var` directive automatically infers the type from the value:

### Text Values

Text values can be defined using different quote styles:

```mlld
/var @simple = "Plain string"              # Double quotes
/var @interpolated = "Hello @name!"        # @ interpolation in double quotes
/var @literal = 'Single quotes @name'      # Single quotes (no interpolation)
/var @backtick = `Hello @name!`            # Backtick template with @ interpolation
/var @template = :::Hello {{name}}!:::       # Double-bracket template with {{}} interpolation
```

For multi-line templates, use double brackets:

```mlld
/var @multiline = ::
  This is a
  multi-line
  template with {{variables}}
::
```

### Data Structures

Objects and arrays use JSON syntax:

```mlld
/var @config = { "name": "app", "version": "1.0" }   # Object
/var @items = ["one", "two", "three"]               # Array

# Multi-line objects
/var @user = {
  "name": "Alice",
  "id": 123,
  "roles": ["admin", "editor"],
  "settings": {
    "theme": "dark",
    "notifications": true
  }
}
```

#### Variable Interpolation in Data

Data structures can contain variable references:

```mlld
/var @name = "John"
/var @keyName = "username"
/var @user = {
  @keyName: @name,    >> Dynamic key name
  "id": 123,
  "active": true
}
```

#### Executable Variables in Data

Data structures can reference and execute executable variables:
- `@execVar` - stores a reference to the executable (lazy evaluation)
- `@execVar()` - executes immediately and stores the result

```mlld
/exe @getTimestamp() = "date +%s"
/exe @formatName(name) = :::{{name}} (formatted):::

/var @info = {
  >> Store executable references (not executed)
  "timestampCmd": @getTimestamp,
  "formatter": @formatName,
  
  >> Execute and store results
  "currentTime": @getTimestamp(),
  "formatted": @formatName("Alice")
}

>> Later, execute stored executables
/run @info.timestampCmd()
/show @info.formatter("Bob")
```

### Primitive Values

```mlld
/var @count = 42                    # Number
/var @price = 19.99                 # Decimal
/var @active = true                 # Boolean
/var @disabled = false              # Boolean
/var @empty = null                  # Null
```

### Expressions and Operators

Variables can be assigned the result of expressions using logical and comparison operators:

```mlld
# Comparison operators
/var @isEqual = @x == @y            # Equality (mlld coercion rules)
/var @notEqual = @a != @b           # Inequality
/var @isGreater = @score > 90       # Greater than
/var @isLessOrEqual = @age <= 18    # Less than or equal

# Logical operators
/var @canAccess = @isAdmin && @isActive     # AND (short-circuits)
/var @hasPermission = @isOwner || @isMod    # OR (short-circuits)
/var @isLocked = !@isOpen                   # NOT

# Ternary conditional
/var @status = @score > 90 ? "excellent" : "good"

# Parentheses for precedence
/var @complex = (@a || @b) && (@c != @d)
```

#### Truthiness and Type Coercion

mlld follows these rules for truthiness:
- **Falsy**: `false`, `null`, `undefined`, `""`, `0`, `[]`, `{}`
- **Truthy**: Everything else
- **Note**: Empty arrays and objects are falsy (unlike JavaScript!)

Equality comparisons use mlld-specific coercion:
- `"true" == true` → true
- `"false" == false` → true
- `null == undefined` → true
- Numbers compared numerically: `"5" == 5` → true

### When Expressions (Value-Returning)

Use `when:` to create conditional values that return the first matching result:

```mlld
# Basic when expression
/var @greeting = when: [
  @time < 12 => "Good morning"
  @time < 18 => "Good afternoon"
  true => "Good evening"
]

# With operators in conditions
/var @access = when: [
  @role == "admin" && @active => "full"
  @role == "user" && @verified => "limited"
  true => "none"
]

# With tail modifiers (pipelines)
/var @message = when: [
  @lang == "es" => "Hola"
  @lang == "fr" => "Bonjour"
  true => "Hello"
] | @uppercase
```

Features:
- Returns the value of the first matching condition
- Returns `null` if no conditions match
- Re-evaluates on each access (lazy evaluation)
- Supports pipeline modifiers on the result

### Command Results

```mlld
/var @date = run "date"             # No @ before run
/var @files = run {ls -la}          # Braces for commands
```

## Referencing Variables

Variables are referenced differently based on context:
- In directives: `@identifier` or `@identifier.field`
- In double quotes: `@identifier`
- In backtick templates: `@identifier`
- In double-colon templates `::...::`: `{{identifier}}` or `{{identifier.field}}`

```mlld
/var @name = "World"
/var @greeting = "Hello, @name!"           # @ interpolation
/var @welcome = `Welcome, @name!`           # @ in backticks
/var @message = :::Greetings, {{name}}!:::   # {{}} in double colons
/show @greeting
```

### Field Access

Access nested fields using dot notation:

```mlld
/var @user = { "name": "Alice", "id": 123 }
/show @user.name
/show :::User {{user.name}} has ID {{user.id}}:::

/var @config = { 
  "app": { 
    "name": "MyApp",
    "version": "1.0.0"
  }
}
/show :::Running {{config.app.name}} v{{config.app.version}}:::
```

### Array Access

Use dot notation to access array elements:

```mlld
/var @fruits = ["apple", "banana", "cherry"]
/show @fruits.0                              # "apple"
/show :::My favorite is {{fruits.1}}:::        # "My favorite is banana"
```

## Variable Interpolation

Different template styles support different interpolation syntax:

### Double Quotes and Backticks (@ interpolation)
- Text variables: `"Hello, @name!"`
- Field access: `"User: @user.name"`
- Array access: `"Score: @scores.0"`
- File references: `"Content: <README.md>"`
- File with field access: `"Version: <package.json>.version"`

### Double-Colon Templates ({{}} interpolation)
- Text variables: `:::Hello, {{name}}!:::`
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
/var @msg3 = :::Welcome, {{name}}!:::       # {{}} in double colons
```

## Error Handling

- Empty values are not allowed
- Quotes must match (no mixing of quote types)
- Circular references in variables will be detected and prevented
- Variable resolution has a maximum depth (10 levels) to prevent infinite recursion
- JSON parsing errors (if value is invalid JSON)
- Variable resolution errors
- Execution errors when using /run or /show as sources

## Notes

- Variables must be created with the `@` prefix: `/var @name = "value"`
- Type is automatically inferred from the value syntax
- Double quotes and backticks support @ interpolation
- Single quotes treat @ as literal text (no interpolation)
- Double-colon templates `::...::` require `{{var}}` syntax for interpolation
- The key rule: "Double colons, double braces"
- Primitive values (numbers, booleans, null) preserve their types
- Field access is available for objects and arrays using dot notation
- Simple data values are automatically converted to text when used in string contexts
- Entire objects/arrays are converted to JSON strings when used in text contexts