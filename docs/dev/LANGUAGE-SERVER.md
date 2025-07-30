# mlld Language Server

The mlld language server provides intelligent editing features for mlld files in any LSP-compatible editor.

## Overview

The language server implements the Language Server Protocol (LSP) to provide:
- Real-time syntax validation
- Intelligent autocomplete
- Hover information
- Go-to-definition
- Multi-file analysis
- Semantic syntax highlighting

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
After typing `/`, suggests available directives:
- `/var` - Define variables (replaces /text, /data)
- `/show` - Display content (replaces /add)
- `/path` - Define file paths
- `/run` - Execute commands
- `/exe` - Define reusable commands (replaces /exec)
- `/import` - Import from files/modules
- `/when` - Conditional execution
- `/output` - Define output target

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

### 6. Semantic Tokens (Syntax Highlighting)

The language server provides semantic tokens for accurate syntax highlighting that understands context:

#### Highlighted Elements
- **Directives** - `/var`, `/show`, `/run`, etc.
- **Variables** - Declaration vs reference distinction
- **Templates** - Different template types with proper interpolation rules:
  - Backtick templates with `@var` interpolation
  - Double-colon templates `::...::` with `@var` interpolation
  - Triple-colon templates `:::...:::` with `{{var}}` interpolation
  - Single quotes as literal strings (no interpolation)
- **Operators** - Logical (`&&`, `||`, `!`), comparison (`==`, `>`, etc.), ternary (`?:`)
- **File References** - Alligator syntax `<file.md>` (except in triple-colon where it's XML)
- **Embedded Languages** - Regions marked for `js`, `python`, `sh` code blocks
- **Comments** - Both `>>` and `<<` comment styles
- **Data Structures** - Arrays and objects with mlld constructs properly highlighted
- **Field Access** - Dot notation (`@user.name`) and array indexing (`@items[0]`)

#### Context-Aware Highlighting
The semantic tokens understand mlld's complex interpolation rules:
- `@var` in templates is highlighted as interpolation
- `@var` outside templates is highlighted as variable reference
- Single quotes never interpolate
- Command contexts (`/run {echo "@name"}`) support interpolation
- Objects and arrays preserve mlld constructs as full AST nodes

## Editor Integration

### VSCode

The mlld VSCode extension automatically uses the language server when installed. Semantic highlighting provides superior syntax highlighting compared to the TextMate grammar, with full context awareness.

To ensure you're using the language server:
1. Install the mlld VSCode extension
2. The extension will automatically start the language server
3. Semantic tokens will provide accurate, context-aware highlighting

### Neovim

Configure the built-in LSP client in your Neovim config:

```lua
-- Define the mlld language server config
local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

if not configs.mlld_ls then
  configs.mlld_ls = {
    default_config = {
      cmd = {'mlld', 'language-server'},
      filetypes = {'mld', 'mlld'},
      root_dir = lspconfig.util.root_pattern('mlld.lock.json', '.git'),
      settings = {
        mlldLanguageServer = {
          maxNumberOfProblems = 100,
          enableAutocomplete = true
        }
      }
    }
  }
end

-- Enable the server
lspconfig.mlld_ls.setup{}

-- Enable semantic tokens for highlighting (Neovim 0.9+)
vim.api.nvim_create_autocmd('LspAttach', {
  callback = function(args)
    local client = vim.lsp.get_client_by_id(args.data.client_id)
    if client.name == 'mlld_ls' and client.server_capabilities.semanticTokensProvider then
      vim.lsp.semantic_tokens.start(args.buf, args.data.client_id)
    end
  end,
})
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
- Semantic token generation

### Analysis Pipeline

1. **Parse** - Use mlld grammar to parse documents
2. **Analyze** - Extract variables, imports, exports
3. **Generate Tokens** - Create semantic tokens using AST visitor pattern
4. **Cache** - Store analysis results and text extracts for performance
5. **Update** - Send diagnostics, completions, and semantic tokens

### Performance

- Incremental parsing on document changes
- Cached analysis results
- Text extraction caching for semantic tokens
- Debounced validation
- Lazy import resolution

### Semantic Token Architecture

The semantic token implementation uses:
- **AST Visitor Pattern** - `ASTSemanticVisitor` traverses the parsed AST
- **Context Stack** - Tracks template types, interpolation rules, and language contexts
- **Shared Highlighting Rules** - Common rules between LSP and TextMate grammars
- **Full AST Preservation** - mlld constructs in arrays/objects retain location information

## Development

### Running Tests

```bash
# Test language server functionality
npm test cli/commands/language-server.test.ts

# Test semantic tokens implementation
npm test tests/lsp/semantic-tokens.test.ts
npm test tests/lsp/semantic-tokens-unit.test.ts
npm test tests/lsp/highlighting-rules.test.ts
```

### Debugging

Enable debug logging:
```bash
DEBUG=mlld:lsp mlld language-server
```

### Adding Features

1. Update type definitions in `language-server.ts`
2. Implement handlers in `language-server-impl.ts`
3. For semantic tokens:
   - Update `ASTSemanticVisitor` in `services/lsp/`
   - Add new token types/modifiers as needed
   - Update shared highlighting rules in `core/highlighting/rules.ts`
4. Add tests for new capabilities
5. Update this documentation

### Known Issues

- **Parser Location Quirk**: The AST has inconsistent @ symbol inclusion for variable references with field access. This is handled with a workaround in the semantic visitor but should be fixed in the parser.
- **Object Property Locations**: Plain JavaScript values in objects/arrays don't have location information, only mlld constructs do.
- **Template Delimiters in Objects**: Exact delimiter positions aren't available for templates inside object values, so these aren't tokenized to avoid guessing.

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

