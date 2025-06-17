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

### Language Features (Powered by Language Server)
- **Intelligent Autocomplete**: 
  - Directives, variables, and reserved variables
  - Module imports with registry support
  - Context-aware completions (foreach, with clauses)
  - File paths and section headers
- **Go to Definition**: Navigate to variable declarations
- **Hover Information**: See variable types and sources
- **Error Checking**: Real-time syntax validation using the mlld parser
- **Multi-file Analysis**: Tracks imports and variable usage across files

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

## Requirements

- mlld CLI must be installed: `npm install -g mlld`
- For language server features: `npm install --save-dev vscode-languageserver`

## Release Notes

### 0.3.0

Added full Language Server Protocol support with intelligent features

### 0.1.0

Initial release with syntax highlighting support