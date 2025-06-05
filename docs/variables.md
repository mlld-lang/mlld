---
layout: docs.njk
title: "Variables"
---

# Variables

Mlld has three distinct types of variables, each with its own syntax and usage patterns.

## Variable Types

### Path Variables

Path variables are used for filesystem paths and command arguments:

```mlld
@path                # Reference a path variable in directives
[@path]              # Use in path contexts (inside brackets)
[@~/path]            # Home directory path
[@./path]            # Project root path
```

- Must be defined with `@path` directive
- Used primarily inside `[]` brackets in path contexts
- Cannot use field access or formatting
- Path segments are separated by forward slashes
- Special prefixes: `~` for home directory, `.` for project root

Example:
```mlld
@path docs = [@./docs]
@add [@docs/guide.md]
```

### Text Variables

Text variables store unstructured text:

```mlld
@variable            # Reference in directives
{{variable}}         # Reference in templates [[...]]
```

- Defined with `@text` directive
- No field access (text is atomic)
- In directives: use `@variable`
- In templates `[[...]]`: use `{{variable}}`

Example:
```mlld
@text greeting = "Hello"
@text name = "World"
@text message = [[{{greeting}}, {{name}}!]]
```

### Data Variables

Data variables store structured data:

```mlld
@variable             # Reference in directives
@variable.field       # Field access in directives
{{variable}}          # Reference in templates
{{variable.field}}    # Field access in templates
```

- Defined with `@data` directive
- Support field access (`@config.name` in directives, `{{config.name}}` in templates)
- Fields can be nested (`@config.user.name`, `{{config.user.name}}`)

Example:
```mlld
@data user = { "name": "Alice", "id": 123 }
@text greeting = [[Hello, {{user.name}}! Your ID is {{user.id}}.]]```

### Array Access

When working with arrays, use dot notation to access array elements by index:

```mlld
@data items = ["apple", "banana", "cherry"]
@text first = [[First item: {{items.0}}]]
@text second = [[Second item: {{items.1}}]]
```

Note: Currently, only dot notation is supported for array access. Bracket notation (`items[0]`) is not supported.

## Variable Type Conversion

Variables can be converted between types automatically in many contexts:

### Data to Text Conversion

- Simple values (strings, numbers) convert directly to text
- Objects and arrays convert to JSON string representation

```mlld
@data config = { "name": "test", "version": 1 }
@text simple = [[Name: {{config.name}}]]          # Outputs: Name: test
@text object = [[Config: {{config}}]]             # Outputs: Config: {"name":"test","version":1}
```

### Object and Array Formatting

When referencing complete objects or arrays (rather than their individual fields), Mlld formats them based on the context:

#### Array Formatting

When referencing an entire array:

```mlld
@data fruits = ["apple", "banana", "orange"]
```

- **Inline context** (within text, template literals):
  ```mlld
  @text list = [[My fruits: {{fruits}}]]  # Outputs: My fruits: apple, banana, orange
  ```
  Arrays are formatted as comma-separated values with spaces.

- **Block context** (in embed directives, standalone references):
  ```mlld
  @add @fruits
  ```
  Simple arrays (of strings, numbers) use comma-separated values with spaces.
  
  Arrays of objects are formatted as properly indented JSON:
  ```mlld
  @data people = [{ "name": "Alice", "age": 30 }, { "name": "Bob", "age": 25 }]
  @add @people
  ```
  This outputs the array as properly indented JSON:
  ```json
  [
    {
      "name": "Alice",
      "age": 30
    },
    {
      "name": "Bob",
      "age": 25
    }
  ]
  ```

#### Object Formatting

When referencing an entire object:

```mlld
@data config = { "host": "localhost", "port": 8080 }
```

- **Inline context**:
  ```mlld
  @text settings = [[My config: {{config}}]]  # Outputs: My config: {"host":"localhost","port":8080}
  ```
  Objects are formatted as compact JSON without whitespace.

- **Block context** (in embed directives, standalone references):
  ```mlld
  @add @config
  ```
  Objects are formatted as properly indented JSON:
  ```json
  {
    "host": "localhost",
    "port": 8080
  }
  ```

### Text in Data Contexts

- Text variables can be used as values in data structures
- Text variables can also be used as object keys

```mlld
@text name = "Alice"
@text key = "username"

@data user = {
  @key: @name,              # Dynamic key from text
  "id": 123,
  "settings": {
    "displayName": @name        # Nested text value
  }
}
```

## Where Variables Can Be Used

Variable references are allowed in:
- Inside square brackets `[...]` for paths and commands
- Inside object literals `{{...}}` and single-line objects
- Inside template literals (backtick strings) for string interpolation
- Inside directive values after `=`

They are NOT allowed in:
- Plain text lines
- Regular string literals (use template literals instead)
- Outside of specific interpolation contexts

## String Concatenation

You can concatenate strings using the `++` operator:

```mlld
@text greeting = "Hello" ++ " " ++ "World"
@text message = @intro ++ @body
```

- Requires spaces on both sides of `++`
- Can concatenate string literals, template literals, and text variables
- Cannot concatenate across multiple lines