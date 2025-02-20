**NOTE:** If you're looking for [the old 'meld' package for aspect oriented programming](https://www.npmjs.com/package/meld/v/1.3.2), you'll want to pin your version to `<2.0.0`

---

# meld

This is the interpreter, cli, and sdk for the meld prompt scripting language.

## Installation

```bash
npm install meld
```

## CLI Usage

The Meld CLI provides a simple way to process Meld files from the command line:

```bash
# Basic usage - outputs .llm file
meld input.meld

# Specify output format
meld input.meld --format md

# Specify output file
meld input.meld --output output.llm

# Print to stdout instead of file
meld input.meld --stdout
```

### Supported Options

- `--format, -f`: Output format (default: xml)
  - Supported formats: md, xml
- `--output, -o`: Output file path (default: input filename with new extension)
- `--stdout`: Print to stdout instead of file

### Supported File Extensions

- `.meld`: Standard Meld files
- `.meld.md`: Meld files with Markdown content
- `.mll`: Alternative extension for Meld files
- `.mll.md`: Alternative extension for Meld Markdown files

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
@import [file.meld]               # Import another meld file
@define cmd = @run [echo "hi"]    # Define a reusable command
```

### Variables & Interpolation

```meld
${textvar}                    # Reference a text variable
#{datavar}                    # Reference a data variable
#{datavar.field}             # Access data field
$pathvar                     # Reference a path variable

# Variables can be used in strings and commands:
@text greeting = "Hello ${name}!"
@run [cat ${file}]
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
@text template = `Hello ${name}!`
@text multiline = [[`
  Multi-line
  template with ${vars}
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
@text name = "User: #{user.name}"
```

## SDK Usage

The Meld SDK provides three main functions for working with Meld content:

### Parse Meld Content

Parse raw Meld content into an AST:

```typescript
import { parseMeld } from 'meld';

const content = `
@text name = "World"
Hello, {name}!
`;

const nodes = parseMeld(content);
```

### Interpret Meld AST

Interpret parsed AST nodes with optional initial state:

```typescript
import { interpretMeld, InterpreterState } from 'meld';

// Create initial state (optional)
const initialState = new InterpreterState();
initialState.setText('greeting', 'Hi');

// Interpret the nodes
const finalState = interpretMeld(nodes, initialState);
```

### Run Meld Files

Convenience function to read and interpret Meld files in one step:

```typescript
import { runMeld } from 'meld';

// Run with default options (llm format)
const { state, output } = await runMeld('path/to/file.meld');

// Run with custom options
const { state, output } = await runMeld('path/to/file.meld', {
  format: 'md',  // or 'llm'
  initialState: new InterpreterState()
});

// Use the state for further operations
console.log(state.getVariables());

// Use the formatted output
console.log(output);
```

### Error Handling

The SDK provides specialized error types for robust error handling:

```typescript
import { parseMeld, MeldParseError, MeldInterpretError } from 'meld';

try {
  const nodes = parseMeld(invalidContent);
} catch (error) {
  if (error instanceof MeldParseError) {
    console.error('Parse error:', error.message);
  }
  // Handle other errors...
}
```

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Run tests: `npm test`

## License

MIT