---
layout: docs.njk
title: "@data Directive"
---

---
layout: docs.njk
title: "@data Directive"
---

# @data Directive

The `@data` directive defines a structured data variable that can store objects, arrays, or other complex data types.

## Syntax

```meld
@data identifier = value
```

Where:
- `identifier` is the variable name (must be a valid identifier)
- `value` can be an object literal, array literal, string literal, or the result of an `@add`, `@run`, or `@call` directive

## Identifier Requirements

- Must start with a letter or underscore
- Can contain letters, numbers, and underscores
- Case-sensitive
- Cannot be empty

## Supported Data Types

The @data directive supports all standard JSON data types:
- Objects (key-value pairs)
- Arrays
- Strings
- Numbers
- Booleans
- null

## Object and Array Literals

Data objects can be defined using object literal syntax:

```meld
@data config = {{ name: "test", version: 1 }}
```

For multi-line objects:

```meld
@data user = {{
  name: "Alice",
  id: 123,
  roles: ["admin", "editor"],
  settings: {
    theme: "dark",
    notifications: true
  }
}}
```

Arrays can be defined as well:

```meld
@data colors = ["red", "green", "blue"]
```

## Variable Interpolation in Data

Data structures can contain variable references in both keys and values:

```meld
@text name = "John"
@text keyName = "username"
@data user = {{
  {{keyName}}: {{name}},    # Dynamic key name
  id: 123,
  active: true
}}
```

## Referencing Data Variables

Data variables are referenced using the `{{identifier}}` syntax:

```meld
@data user = {{ name: "Alice", id: 123 }}
@text greeting = `Hello, {{user.name}}!`
```

You can access nested fields using dot notation:

```meld
@data config = {{ 
  app: { 
    name: "MyApp",
    version: "1.0.0"
  }
}}
@text appInfo = `App: {{config.app.name}} v{{config.app.version}}`
```

### Accessing Array Elements

Use dot notation to access array elements:

```meld
@data fruits = ["apple", "banana", "cherry"]
@text favorite = `My favorite fruit is {{fruits.0}}`
@text list = `Items: {{fruits.0}}, {{fruits.1}}, and {{fruits.2}}`
```

Note: Currently, only dot notation is supported for array access. Bracket notation (`fruits[0]`) is not supported.

## JSON String Format

Values can also be provided as JSON strings which are parsed:

```meld
@data config = '{"key": "value"}'
```

## Examples

Basic data variable:
```meld
@data settings = {{ 
  darkMode: true,
  fontSize: 16
}}
```

Using variables in data:
```meld
@text name = "John"
@data user = {{ 
  username: {{name}},
  active: true 
}}
```

Using command output as data:
```meld
@data gitInfo = @run [git log -1 --format="%H,%an,%ae,%s"]
```

## Error Handling

The following errors are possible with data directives:
- JSON parsing errors (if value is invalid JSON)
- Variable resolution errors
- Execution errors when using @run or @add as sources

## Notes

- Field access is only available for data variables
- Data variables can be formatted with the `>>` operator
- Simple data values are automatically converted to text when used in string contexts
- Entire objects/arrays are converted to JSON strings when used in text contexts
- Schema validation is planned but not yet implemented