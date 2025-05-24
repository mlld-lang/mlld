# mlld Language Support for VSCode

This extension provides rich language support for mlld, a modular prompt scripting language.

## Features

### Intelligent File Detection
- `.mlld` and `.mld` files are always treated as mlld
- `.md` files are automatically detected:
  - Switches to mlld mode only when mlld directives are found
  - Detection looks for: `@text`, `@data`, `@path`, `@run`, `@exec`, `@add`, or `@import`
  - Shows a notification allowing you to keep it as markdown if preferred
  - Use Command Palette: "mlld: Switch to mlld Mode" to manually switch

### Syntax Highlighting
- Full syntax highlighting for all MLLD directives
- Variable highlighting with `@variableName` and `{{variableName}}` patterns
- Embedded code block highlighting (JavaScript, Shell)
- Comment highlighting with `>>` prefix

### Language Features (Coming Soon)
- **Autocomplete**: Path completion, variable completion, section headers
- **Go to Definition**: Navigate to variable declarations
- **Hover Information**: See variable values and types
- **Error Checking**: Real-time syntax validation using the MLLD parser

## Supported Directives

- `@text` - Text variable assignment
- `@data` - Data structures (JSON)
- `@path` - Path variable assignment
- `@run` - Command execution
- `@exec` - Code execution with return value
- `@add` - Content inclusion and templates
- `@import` - Import variables from other files

## Extension Settings

This extension contributes the following settings:

* `mlld.enableAutocomplete`: Enable/disable autocomplete features
* `mlld.projectPath`: Override @PROJECTPATH detection
* `mlld.includePaths`: Additional paths for import resolution

## Known Issues

- The shorthand syntax `[file.md # Section]` is not yet supported

## Release Notes

### 0.1.0

Initial release with syntax highlighting support