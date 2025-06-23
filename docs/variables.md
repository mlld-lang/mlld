---
layout: docs.njk
title: "Variables"
---

# Variables

mlld has three distinct types of variables, each with its own syntax and usage patterns.

## Variable Types

### Path Variables

Path variables are used for filesystem paths and command arguments:

```mlld
/path @docs = "./documentation"    # Define a path variable
@docs                              # Reference a path variable
[@./path]                          # Resolver path (with brackets)
[@PROJECTPATH/config]              # Project root resolver path
```

- Must be defined with `/path` directive with `@` prefix
- Can use @ interpolation in double quotes: `/path @output = "results/@date.txt"`
- Cannot use field access or formatting
- Path segments are separated by forward slashes
- Special resolvers: `@PROJECTPATH` or `@.` for project root

Example:
```mlld
/path @docs = "./docs"
/add [@docs/guide.md]
/path @output = "build/@version"
```

### Text Variables

Text variables store unstructured text:

```mlld
/text @greeting = "Hello"          # Define with @ prefix
@greeting                          # Reference in directives
"Message: @greeting"               # Reference in double quotes
`Welcome: @greeting`               # Reference in backticks
[[Text: {{greeting}}]]             # Reference in double-bracket templates
```

- Defined with `/text` directive with `@` prefix
- No field access (text is atomic)
- In directives and double quotes: use `@variable`
- In double-bracket templates `[[...]]`: use `{{variable}}`
- Key rule: "Double brackets, double braces"

Example:
```mlld
/text @greeting = "Hello"
/text @name = "World"
/text @message1 = "@greeting, @name!"          # @ interpolation
/text @message2 = [[{{greeting}}, {{name}}!]]  # {{}} in templates
```

### Data Variables

Data variables store structured data:

```mlld
/data @user = { "name": "Alice" }   # Define with @ prefix
@user                              # Reference in directives
@user.name                         # Field access in directives
"User: @user.name"                 # Field access in double quotes
{{user}}                           # Reference in templates
{{user.name}}                      # Field access in templates
```

- Defined with `/data` directive with `@` prefix
- Support field access with dot notation
- In directives and double quotes: use `@variable.field`
- In double-bracket templates: use `{{variable.field}}`

Example:
```mlld
/data @user = { "name": "Alice", "id": 123 }
/text @greeting1 = "Hello, @user.name! ID: @user.id"           # @ interpolation
/text @greeting2 = [[Hello, {{user.name}}! Your ID is {{user.id}}.]]  # {{}} in templates
```

### Array Access

When working with arrays, use dot notation to access array elements by index:

```mlld
/data @items = ["apple", "banana", "cherry"]
/text @first = "First item: @items.0"               # @ interpolation with dot notation
/text @second = [[Second item: {{items.1}}]]        # {{}} in templates
/add "Third item: @items.2"                         # Direct reference
```

Note: Only dot notation is supported for array access. Bracket notation (`items[0]`) is not supported.

## Variable Type Conversion

Variables can be converted between types automatically in many contexts:

### Data to Text Conversion

- Simple values (strings, numbers) convert directly to text
- Objects and arrays convert to JSON string representation

```mlld
/data @config = { "name": "test", "version": 1 }
/text @simple = "Name: @config.name"              # Outputs: Name: test
/text @object = [[Config: {{config}}]]            # Outputs: Config: {"name":"test","version":1}
```

### Object and Array Formatting

When referencing complete objects or arrays (rather than their individual fields), mlld formats them based on the context:

#### Array Formatting

When referencing an entire array:

```mlld
/data @fruits = ["apple", "banana", "orange"]
```

- **Inline context** (within text, templates):
  ```mlld
  /text @list1 = "My fruits: @fruits"      # @ interpolation
  /text @list2 = [[My fruits: {{fruits}}]] # {{}} in templates
  ```
  Arrays are formatted as comma-separated values with spaces.

- **Block context** (in embed directives, standalone references):
  ```mlld
  /add @fruits
  ```
  Simple arrays (of strings, numbers) use comma-separated values with spaces.
  
  Arrays of objects are formatted as properly indented JSON:
  ```mlld
  /data @people = [{ "name": "Alice", "age": 30 }, { "name": "Bob", "age": 25 }]
  /add @people
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
/data @config = { "host": "localhost", "port": 8080 }
```

- **Inline context**:
  ```mlld
  /text @settings = [[My config: {{config}}]]  # Outputs: My config: {"host":"localhost","port":8080}
  ```
  Objects are formatted as compact JSON without whitespace.

- **Block context** (in embed directives, standalone references):
  ```mlld
  /add @config
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
/text @name = "Alice"
/text @key = "username"

/data @user = {
  @key: @name,              # Dynamic key from text
  "id": 123,
  "settings": {
    "displayName": @name    # Nested text value
  }
}
```

## Where Variables Can Be Used

Variable references are context-specific:

### @ Interpolation contexts:
- In directives: `/add @variable`
- In double quotes: `"Hello @name"`
- In backtick templates: `` `Welcome @user` ``
- In command braces: `/run {echo "@message"}`
- In object values: `/data @config = { "user": @name }`

### {{}} Interpolation contexts:
- In double-bracket templates: `[[Hello {{name}}!]]`
- ONLY in `[[...]]` templates

### NOT allowed in:
- Plain text lines (not starting with `/`)
- Single quotes: `'Hello @name'` (@ is literal)
- Outside of mlld directive lines

