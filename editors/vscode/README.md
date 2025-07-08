# mlld Language Support for VSCode

This extension provides rich language support for mlld, a modular prompt scripting language.

## Features

### Intelligent File Detection
- `.mlld` and `.mld` files are always treated as mlld
- `.md` files are automatically detected:
  - Switches to mlld mode only when mlld directives are found
  - Detection looks for: `/var`, `/show`, `/run`, `/exe`, `/path`, `/import`, `/when`, `/output`
  - Shows a notification allowing you to keep it as markdown if preferred
  - Use Command Palette: "mlld: Switch to mlld Mode" to manually switch

### Syntax Highlighting
- Full syntax highlighting for all mlld directives
- Variable highlighting with `@variableName` in templates and directives
- Backtick template syntax with `` `text @variable` ``
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

- `/var` - Variable assignment (text, data, paths)
- `/show` - Display content to output
- `/run` - Command execution
- `/exe` - Define executable commands
- `/path` - Path manipulation
- `/import` - Import variables from other files or modules
- `/when` - Conditional execution
- `/output` - Direct output to files or streams

## Extension Settings

This extension contributes the following settings:

* `mlld.enableAutocomplete`: Enable/disable autocomplete features
* `mlld.projectPath`: Override @PROJECTPATH detection
* `mlld.includePaths`: Additional paths for import resolution

## Variable Syntax

- **Create variables**: `/var @name = "value"`
- **Reference in templates**: `` /show `Hello @name!` ``
- **Reference in commands**: `/run {echo "@name"}`
- **Access object fields**: `/show @user.name`
- **Access array elements**: `/show @scores.0`

## Command Syntax

- **Shell commands**: `/run {echo "hello"}` or `/run "echo hello"`
- **JavaScript**: `/run js {console.log("hello")}`
- **Executables**: `/exe @cmd = run {echo "@msg"}`
- **Comments**: `>> This is a comment`

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