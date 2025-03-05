# Variables in Meld

Meld has three distinct types of variables, each with its own syntax and usage patterns.

## Variable Types

### Path Variables

Path variables are used for filesystem paths and command arguments:

```meld
$path                # Reference a path variable
$HOMEPATH or $~      # Special path variable for home directory
$PROJECTPATH or $.   # Special path variable for project root
```

- Must be defined with `@path` directive
- All paths must be absolute (via $HOMEPATH or $PROJECTPATH)
- Used primarily inside `[]` brackets
- Cannot use field access or formatting
- Path segments are separated by forward slashes

Example:
```meld
@path docs = "$PROJECTPATH/docs"
@embed [$docs/guide.md]
```

### Text Variables

Text variables store unstructured text:

```meld
{{variable}}            # Reference a text variable
{{variable>>(format)}}  # Reference with formatting
```

- Defined with `@text` directive
- No field access (text is atomic)
- Environment variables ({{ENV_*}}) are a special case of text variables

Example:
```meld
@text greeting = "Hello"
@text name = "World"
@text message = `{{greeting}}, {{name}}!`
```

### Data Variables

Data variables store structured data:

```meld
{{variable}}                   # Reference a data variable
{{variable.field}}            # Access a field in a data variable
{{variable.field>>(format)}}  # Reference with formatting
```

- Defined with `@data` directive
- Support field access ({{config.name}})
- Fields can be nested ({{config.user.name}})
- Can be formatted with `>>`

Example:
```meld
@data user = {{ name: "Alice", id: 123 }}
@text greeting = `Hello, {{user.name}}! Your ID is {{user.id}}.`
```

## Variable Type Conversion

Variables can be converted between types automatically in many contexts:

### Data to Text Conversion

- Simple values (strings, numbers) convert directly to text
- Objects and arrays convert to JSON string representation

```meld
@data config = {{ name: "test", version: 1 }}
@text simple = `Name: {{config.name}}`          # Outputs: Name: test
@text object = `Config: {{config}}`             # Outputs: Config: {"name":"test","version":1}
```

### Text in Data Contexts

- Text variables can be used as values in data structures
- Text variables can also be used as object keys

```meld
@text name = "Alice"
@text key = "username"

@data user = {{
  {{key}}: {{name}},              # Dynamic key from text
  id: 123,
  settings: {
    displayName: {{name}}        # Nested text value
  }
}}
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

```meld
@text greeting = "Hello" ++ " " ++ "World"
@text message = {{intro}} ++ {{body}}
```

- Requires spaces on both sides of `++`
- Can concatenate string literals, template literals, and text variables
- Cannot concatenate across multiple lines