# Meld Language Support for VSCode

This extension provides rich language support for Meld, a powerful markdown composition language.

## Features

### Automatic Detection for Markdown Files
- Automatically detects `.md` files containing Meld directives
- Switches to Meld mode when `@` directives or `>>` comments are found
- Use Command Palette: "Meld: Set Language Mode to Meld" to manually switch

### Syntax Highlighting
- Full syntax highlighting for all Meld directives
- Variable highlighting with `@variableName` and `{{variableName}}` patterns
- Embedded code block highlighting (JavaScript, Shell)
- Comment highlighting with `>>` prefix

### Language Features (Coming Soon)
- **Autocomplete**: Path completion, variable completion, section headers
- **Go to Definition**: Navigate to variable declarations
- **Hover Information**: See variable values and types
- **Error Checking**: Real-time syntax validation using the Meld parser

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

* `meld.enableAutocomplete`: Enable/disable autocomplete features
* `meld.projectPath`: Override @PROJECTPATH detection
* `meld.includePaths`: Additional paths for import resolution

## Known Issues

- The shorthand syntax `[file.md # Section]` is not yet supported

## Release Notes

### 0.1.0

Initial release with syntax highlighting support