**NOTE:** If you're looking for [the old 'mlld' package for aspect oriented programming](https://www.npmjs.com/package/mlld/v/1.3.2), you'll want to pin your version to `<2.0.0`

---

# mlld (pre-release)

mlld is a prompt scripting language.

## Installation

```bash
npm install -g mlld
```

or just run it with `npx mlld`

## CLI Usage

Process mlld files from the command line:

```bash
# Basic usage - outputs .xml file
mlld input.mld

# Specify output format
mlld input.mld --format md

# Specify output file
mlld input.mld --output output.xml

# Print to stdout instead of file
mlld input.mld --stdout
```

### Supported Options

- `--format, -f`: Output format (default: md)
  - Supported formats: md, xml
- `--output, -o`: Output file path (default: input filename with new extension)
- `--stdout`: Print to stdout instead of file

### Supported File Extensions

- `.mld` is standard `.mld.md` is another option.
- `.md`: Mlld can just interpret regular old markdown files with added mlld syntax, too.

## JavaScript API

Mlld has a fairly extensive js API which give access to its AST, interpreted variables, etc., but it's not documented yet. However, here's mlld's simple API for processing content directly:

```javascript
// ES Module import
import runMlld from 'mlld';

// Process mlld content
const mlldContent = `
  @text greeting = "Hello"
  @text name = "World"
  
  @embed [[{{greeting}}, {{name}}!]]
`;

// Simple usage
const result = await runMlld(mlldContent);
console.log(result); // "Hello, World!"

// With options
const xmlResult = await runMlld(mlldContent, {
  format: 'xml',
  transformation: true
});
```

## Writing Mlld Files

Mlld is a simple scripting language designed to work within markdown-like documents. It processes special `@directive` lines while preserving all other content as-is.

### Core Directives

```mlld
@text name = "value"              # Define a text variable
@data config = { "key": "value" } # Define a structured data variable
@path docs = "$PROJECTPATH/docs"  # Define a path (must use $PROJECTPATH or $HOMEPATH)
@embed [file.md]                  # Embed content from another file
@embed [file.md # section]        # Embed specific section from file
@run [command]                    # Run a shell command
@import [file.mld]               # Import another mlld file
@define cmd = @run [echo "hi"]    # Define a reusable command
```

### Variables & Interpolation

Must be inside an @ directive to be interpolated

```mlld
{{variable}}            # Reference a variable
{{datavar.field}}       # Access data field
$pathvar                # Reference a path variable

# Variables can be used in strings and commands:
@text greeting = "Hello {{name}}!"
@run [cat {{file}}]
```

### Comments & Code Fences

```mlld
>> This is a comment
>> Comments must start at line beginning

# Code fences preserve content exactly:
```python
def hello():
    print("Hi")  # @text directives here are preserved as-is
```
```

### String Values

- Use single quotes, double quotes, or backticks
- Quotes must match (no mixing)
- Use backticks for template strings with variables:
```mlld
@text simple = "Hello"
@text template = `Hello {{name}}!`
@text multiline = [[`
  Multi-line
  template with {{vars}}
`]]
```

### Path Variables

- Must use `$PROJECTPATH` (or `$.`) or `$HOMEPATH` (or `$~`)
- Forward slashes as separators
```mlld
@path docs = "$PROJECTPATH/docs"
@path home = "$HOMEPATH/mlld"
# Example Usage:
@embed [$docs/some_file.txt] 
```

### Data Variables

- Store structured data (objects/arrays)
- Support field access
```mlld
@data user = { "name": "Alice", "id": 123 }
@text name = "User: {{user.name}}"
```

## License

[MIT](LICENSE)