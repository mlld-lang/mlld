---
layout: docs.njk
title: "/data Directive"
---

# /data Directive

The `/data` directive defines a structured data variable that can store objects, arrays, or other complex data types.

## Syntax

```mlld
/var @identifier = value
```

Where:
- `@identifier` is the variable name (requires `@` prefix when creating)
- `value` can be an object literal, array literal, string literal, or the result of an `/add`, `/run`, or other directive

## Identifier Requirements

- Must start with a letter or underscore
- Can contain letters, numbers, and underscores
- Case-sensitive
- Cannot be empty

## Supported Data Types

The /data directive supports all standard JSON data types:
- Objects (key-value pairs)
- Arrays
- Strings
- Numbers
- Booleans
- null

## Object and Array Literals

Data objects can be defined using JSON syntax:

```mlld
/var @config = { "name": "test", "version": 1 }
```

For multi-line objects:

```mlld
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

Arrays can be defined as well:

```mlld
/var @colors = ["red", "green", "blue"]
```

## Variable Interpolation in Data

Data structures can contain variable references in both keys and values:

```mlld
/var @name = "John"
/var @keyName = "username"
/var @user = {
  @keyName: @name,    >> Dynamic key name
  "id": 123,
  "active": true
}
```

## Executable Variables in Data

Data structures can reference and execute executable variables using the universal pattern:
- `@execVar` - stores a reference to the executable (lazy evaluation)
- `@execVar()` - executes immediately and stores the result

```mlld
/exe @getTimestamp() = "date +%s"
/exe @formatName(name) = [[{{name}} (formatted)]]

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

This pattern allows for powerful composition and lazy evaluation strategies.

## Referencing Data Variables

Data variables are referenced differently based on context:
- In directives: `@identifier` or `@identifier.field`
- In templates `[[...]]`: `{{identifier}}` or `{{identifier.field}}`

```mlld
/var @user = { "name": "Alice", "id": 123 }
/var @greeting = [[Hello, {{user.name}}!]]
/show @user.name
```

You can access nested fields using dot notation:

```mlld
/var @config = { 
  "app": { 
    "name": "MyApp",
    "version": "1.0.0"
  }
}
/var @appInfo = [[App: {{config.app.name}} v{{config.app.version}}]]
```

### Accessing Array Elements

Use dot notation to access array elements:

```mlld
/var @fruits = ["apple", "banana", "cherry"]
/var @favorite = [[My favorite fruit is {{fruits.0}}]]
/var @list = [[Items: {{fruits.0}}, {{fruits.1}}, and {{fruits.2}}]]
```

Note: Currently, only dot notation is supported for array access. Bracket notation (`fruits[0]`) is not supported.

## JSON String Format

Values can also be provided as JSON strings which are parsed:

```mlld
/var @config = '{"key": "value"}'
```

## Examples

Basic data variable:
```mlld
/var @settings = { 
  "darkMode": true,
  "fontSize": 16
}
```

Using variables in data:
```mlld
/var @name = "John"
/var @user = { 
  "username": @name,
  "active": true 
}
```

Using command output as data:
```mlld
/var @gitInfo = /run "git log -1 --format='%H,%an,%ae,%s'"
```

Using executable variables:
```mlld
/exe @getDate() = "date"
/exe @getUser() = "whoami"

>> Store references to executables
/var @commands = {
  "date": @getDate,
  "user": @getUser
}

>> Execute and store results
/var @results = {
  "date": @getDate(),
  "user": @getUser()
}
```

## Error Handling

The following errors are possible with data directives:
- JSON parsing errors (if value is invalid JSON)
- Variable resolution errors
- Execution errors when using /run or /add as sources

## Notes

- Field access is only available for data variables
- Data variables can be used in templates and directives
- Simple data values are automatically converted to text when used in string contexts
- Entire objects/arrays are converted to JSON strings when used in text contexts
- Schema validation is planned but not yet implemented