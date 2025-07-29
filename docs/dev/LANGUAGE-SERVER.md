# mlld Language Server

The mlld language server provides intelligent editing features for mlld files in any LSP-compatible editor.

## Overview

The language server implements the Language Server Protocol (LSP) to provide:
- Real-time syntax validation
- Intelligent autocomplete
- Hover information
- Go-to-definition
- Multi-file analysis

## Installation

### Prerequisites

The language server requires the `vscode-languageserver` package:

```bash
npm install --save-dev vscode-languageserver
```

### Starting the Server

Once the dependency is installed, start the language server with:

```bash
mlld language-server
# or use the short alias
mlld lsp
```

## Features

### 1. Syntax Validation

- Real-time parsing using the mlld grammar
- Clear error messages with line/column information
- Validates directive syntax and structure

### 2. Autocomplete

The server provides context-aware completions for:

#### Directives
After typing `@`, suggests available directives:
- `@text` - Define text variables
- `@data` - Define structured data
- `@path` - Define file paths
- `@run` - Execute commands
- `@exec` - Define reusable commands
- `@add` - Add content to output
- `@import` - Import from files/modules
- `@when` - Conditional execution
- `@url` - Define URLs

#### Variables
- After `@` - suggests defined variables with `@` prefix
- Inside `{{...}}` - suggests variables without prefix
- Shows variable type (text, data, path, exec)

#### File Paths
After typing `[`, suggests:
- `.mld` files in the current directory
- `.md` files for markdown imports
- Relative paths based on current file location

### 3. Hover Information

Hover over variables to see:
- Variable type (text, data, path, exec)
- Source (local or imported)
- Import path if applicable

### 4. Go to Definition

Ctrl/Cmd+Click on variable references to:
- Jump to variable declaration
- Navigate to import sources
- Find exec command definitions

### 5. Multi-file Analysis

The server tracks:
- Import dependencies
- Variable definitions across files
- Export declarations

## Editor Integration

### VSCode

The mlld VSCode extension (in `editors/vscode`) can be configured to use the language server:

```json
{
  "mlld.languageServer.enable": true,
  "mlld.languageServer.path": "mlld",
  "mlld.languageServer.arguments": ["language-server"]
}
```

### Neovim

Configure the built-in LSP client in your Neovim config:

```lua
require'lspconfig'.mlld_ls.setup{
  cmd = {"mlld", "language-server"},
  filetypes = {"mlld", "mld"},
  root_dir = require'lspconfig'.util.root_pattern("mlld.config.json", ".git"),
  settings = {
    mlldLanguageServer = {
      maxNumberOfProblems = 100,
      enableAutocomplete = true
    }
  }
}
```

### Other Editors

Any LSP-compatible editor can use the mlld language server:

1. Configure the command: `mlld language-server`
2. Set file types: `*.mlld`, `*.mld`
3. Configure settings under `mlldLanguageServer` namespace

## Configuration

The language server supports these settings:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `mlldLanguageServer.maxNumberOfProblems` | number | 100 | Maximum number of diagnostics per file |
| `mlldLanguageServer.enableAutocomplete` | boolean | true | Enable/disable autocomplete |
| `mlldLanguageServer.projectPath` | string | auto | Override project path detection |
| `mlldLanguageServer.includePaths` | string[] | [] | Additional paths for import resolution |

## Architecture

### Document Management

The server maintains:
- Open document tracking
- Incremental document synchronization
- Parse result caching

### Analysis Pipeline

1. **Parse** - Use mlld grammar to parse documents
2. **Analyze** - Extract variables, imports, exports
3. **Cache** - Store analysis results for performance
4. **Update** - Send diagnostics and update completions

### Performance

- Incremental parsing on document changes
- Cached analysis results
- Debounced validation
- Lazy import resolution

## Development

### Running Tests

```bash
npm test cli/commands/language-server.test.ts
```

### Debugging

Enable debug logging:
```bash
DEBUG=mlld:lsp mlld language-server
```

### Adding Features

1. Update type definitions in `language-server.ts`
2. Implement handlers in `language-server-impl.ts`
3. Add tests for new capabilities
4. Update this documentation

## Troubleshooting

### Server Won't Start

```
Error: Language server dependencies not installed.
```

Solution: Install the required package:
```bash
npm install --save-dev vscode-languageserver
```

### No Completions

Check that:
1. `enableAutocomplete` is true in settings
2. File has `.mlld` or `.mld` extension
3. Document has been saved at least once

### Performance Issues

1. Increase `maxNumberOfProblems` if needed
2. Check for circular imports
3. Ensure reasonable file sizes

