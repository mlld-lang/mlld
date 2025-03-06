**NOTE:** If you're looking for [the old 'meld' package for aspect oriented programming](https://www.npmjs.com/package/meld/v/1.3.2), you'll want to pin your version to `<2.0.0`

---

# meld (pre-release)

meld is a prompt scripting language.

## Installation

```bash
npm install -g meld
```

or just run it with `npx meld`

## CLI Usage

Process meld files from the command line:

```bash
# Basic usage - outputs .xml file
meld input.mld

# Specify output format
meld input.mld --format md

# Specify output file
meld input.mld --output output.xml

# Print to stdout instead of file
meld input.mld --stdout
```

### Supported Options

- `--format, -f`: Output format (default: md)
  - Supported formats: md, xml
- `--output, -o`: Output file path (default: input filename with new extension)
- `--stdout`: Print to stdout instead of file

### Supported File Extensions

- `.mld` is standard `.mld.md` is another option.
- `.md`: Meld can just interpret regular old markdown files with added meld syntax, too.

## JavaScript API

Meld has a fairly extensive js API which give access to its AST, interpreted variables, etc., but it's not documented yet. However, here's meld's simple API for processing content directly:

```javascript
// ES Module import
import runMeld from 'meld';

// Process meld content
const meldContent = `
  @text greeting = "Hello"
  @text name = "World"
  
  ${greeting}, ${name}!
`;

// Simple usage
const result = await runMeld(meldContent);
console.log(result); // "Hello, World!"

// With options
const xmlResult = await runMeld(meldContent, {
  format: 'xml',
  transformation: true
});
```

## Writing Meld Files

Meld is a simple scripting language designed to work within markdown-like documents. It processes special `@directive` lines while preserving all other content as-is.

### Core Directives

```meld
@text name = "value"              # Define a text variable
@data config = { "key": "value" } # Define a structured data variable
@path docs = "$PROJECTPATH/docs"  # Define a path (must use $PROJECTPATH or $HOMEPATH)
@embed [file.md]                  # Embed content from another file
@embed [file.md # section]        # Embed specific section from file
@run [command]                    # Run a shell command
@import [file.mld]               # Import another meld file
@define cmd = @run [echo "hi"]    # Define a reusable command
```

### Variables & Interpolation

```meld
{{variable}}            # Reference a variable
{{datavar.field}}       # Access data field
$pathvar                # Reference a path variable

# Variables can be used in strings and commands:
@text greeting = "Hello {{name}}!"
@run [cat {{file}}]
```

### Comments & Code Fences

```meld
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
```meld
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
```meld
@path docs = "$PROJECTPATH/docs"
@path home = "$HOMEPATH/meld"
```

### Data Variables

- Store structured data (objects/arrays)
- Support field access
```meld
@data user = { "name": "Alice", "id": 123 }
@text name = "User: {{user.name}}"
```

## License

[MIT](LICENSE)