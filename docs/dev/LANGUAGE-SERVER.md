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
- `/for` - Iterate over collections
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

### 6. Embedded Language Highlighting

The language server provides syntax highlighting for embedded code blocks using web-tree-sitter:

#### Supported Syntax

```mlld
# Multi-line blocks
/run js {
  const x = 42;
  console.log(x);
}

# Inline code
/var @result = js { return Math.random(); }
/exe @deploy() = sh { npm test && npm run deploy }

# Supported languages
/run js { ... }     # JavaScript
/run py { ... }     # Python  
/run sh { ... }     # Bash/Shell
```

#### Implementation

- **EmbeddedLanguageService** manages tree-sitter parsers for each language
- Converts tree-sitter ASTs to LSP semantic tokens
- WASM parser files must be bundled in production builds

### 7. Semantic Tokens (Syntax Highlighting)

The language server provides semantic tokens for accurate syntax highlighting that understands context. Unlike simple TextMate grammars, semantic tokens analyze the full AST to provide context-aware highlighting.

#### How Semantic Highlighting Works

1. **AST-Based Analysis**: The parser generates a complete AST with location information
2. **Visitor Pattern**: `ASTSemanticVisitor` traverses the AST, generating tokens for each node
3. **Context Tracking**: A context stack tracks template types, interpolation rules, and language modes
4. **Token Generation**: Each AST node generates semantic tokens with precise positions
5. **VSCode Integration**: Tokens are sent to VSCode which maps them to theme colors

#### Token Type Mapping

mlld uses VSCode's standard semantic token types for maximum theme compatibility:

```typescript
const TOKEN_TYPE_MAP = {
  // mlld-specific → VSCode standard
  'directive': 'keyword',          // /var, /show, etc.
  'variableRef': 'variable',       // @variable references
  'interpolation': 'variable',     // @var in templates
  'template': 'operator',          // Template delimiters (::, :::, `)
  'templateContent': 'string',     // Template content
  'embedded': 'label',             // Language labels (js, python)
  'embeddedCode': 'string',        // Embedded code content
  'alligator': 'string',           // File paths in <>
  'alligatorOpen': 'operator',     // < bracket
  'alligatorClose': 'operator',    // > bracket
  'xmlTag': 'type',                // XML tags in triple-colon
  'section': 'label',              // Section names (#section)
  'boolean': 'keyword',            // true/false
  'null': 'keyword',               // null
  // Standard types (pass through)
  'keyword': 'keyword',
  'variable': 'variable',
  'string': 'string',
  'operator': 'operator',
  'parameter': 'parameter',
  'comment': 'comment',
  'number': 'number',
  'property': 'property'
}
```

#### Highlighted Elements

- **Directives** - `/var`, `/show`, `/run`, etc. → `keyword`
- **Variables** - Declaration vs reference distinction → `variable`
- **Templates** - Different template types with proper interpolation rules:
  - Backtick templates with `@var` interpolation
  - Double-colon templates `::...::` with `@var` interpolation
  - Triple-colon templates `:::...:::` with `{{var}}` interpolation
  - Single quotes as literal strings (no interpolation)
- **Operators** - All operators (`&&`, `||`, `!`, `==`, `>`, `=>`, `=`, etc.) → `operator`
- **Template Delimiters** - Backticks, colons → `operator` (for visual distinction)
- **File References** - Alligator syntax `<file.md>` (except in triple-colon where it's XML)
- **Embedded Languages** - Regions marked for `js`, `python`, `sh` code blocks
- **Comments** - Both `>>` and `<<` comment styles → `comment`
- **Data Structures** - Arrays and objects with mlld constructs properly highlighted
- **Field Access** - Dot notation (`@user.name`) and array indexing (`@items[0]`)

#### Context-Aware Highlighting

The semantic tokens understand mlld's complex interpolation rules:
- `@var` in templates is highlighted as interpolation
- `@var` outside templates is highlighted as variable reference
- Single quotes never interpolate
- Command contexts (`/run {echo "@name"}`) support interpolation
- Objects and arrays preserve mlld constructs as full AST nodes

#### Implementation Details

The semantic token generation follows this flow:

1. **Parse Document** → AST with full location information
2. **Visit AST** → `ASTSemanticVisitor` processes each node type
3. **Dispatch to Visitors** → Specialized visitors handle different node types:
   - `DirectiveVisitor` - Handles directives and their specific syntax
   - `ExpressionVisitor` - Handles operators, literals, and expressions (including `for` expressions)
   - `VariableVisitor` - Handles variable references and field access
   - `FileReferenceVisitor` - Handles alligator syntax and comments
   - `ForeachVisitor` - Handles foreach command syntax
4. **Generate Tokens** → Each visitor adds tokens with:
   - Line and character position
   - Length (calculated from AST locations)
   - Token type (mapped to VSCode standard types)
   - Modifiers (declaration, reference, etc.)
5. **Send to Client** → VSCode receives tokens and applies theme colors

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
| `mlldLanguageServer.validationDelay` | number | 1000 | Delay in ms before showing errors (reduces noise while typing) |
| `mlldLanguageServer.semanticTokenDelay` | number | 250 | Delay in ms before updating syntax highlighting |
| `mlldLanguageServer.showIncompleteLineErrors` | boolean | false | Show errors for incomplete lines while typing |

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

### Graceful Incomplete Line Handling

The language server implements intelligent error suppression to improve the editing experience:

1. **Debounced Validation** - Errors are delayed by `validationDelay` ms (default: 1000ms) to avoid showing errors while typing
2. **Smart Error Filtering** - Common "incomplete line" errors are suppressed on the line being edited
3. **Token Preservation** - Syntax highlighting is preserved even when parsing fails by using the last valid tokens
4. **Different Delays** - Semantic tokens update faster (250ms) than error validation (1000ms)

This prevents annoying red squiggles while typing new directives like `/var @name = "value"` and maintains syntax highlighting even when the document temporarily has syntax errors.

### Semantic Token Architecture

The semantic token implementation uses:
- **AST Visitor Pattern** - `ASTSemanticVisitor` traverses the parsed AST
- **Context Stack** - Tracks template types, interpolation rules, and language contexts
- **Shared Highlighting Rules** - Common rules between LSP and TextMate grammars
- **Full AST Preservation** - mlld constructs in arrays/objects retain location information
- **Standard Token Types Only** - Maps mlld-specific types to VSCode's built-in semantic token types for maximum compatibility

#### Abstraction Helpers

To eliminate code duplication and ensure consistent tokenization, the semantic token implementation uses specialized helper classes in `services/lsp/utils/`:

- **OperatorTokenHelper** - Centralizes all operator tokenization:
  - `tokenizeOperatorBetween()` - Find and tokenize operators between AST nodes
  - `tokenizeBinaryExpression()` - Handle comparison/logical operators (`==`, `&&`, etc.)
  - `tokenizePropertyAccess()` - Handle field access (`.property`, `[index]`)
  - `tokenizePipelineOperators()` - Handle pipe operators (`|`)
  - `tokenizeDelimiters()` - Handle braces, brackets, parentheses
  - `tokenizeTernaryOperators()` - Handle `?` and `:` in ternary expressions

- **CommentTokenHelper** - Handles comment tokenization:
  - Tokenizes `>>` and `<<` comment markers
  - Manages end-of-line and standalone comments
  - Handles comment location quirks from the AST

- **TemplateTokenHelper** - Manages template contexts:
  - Handles different template delimiters (backticks, `::`, `:::`)
  - Tracks interpolation contexts and variable styles
  - Manages template type for proper variable handling

- **LanguageBlockHelper** - Centralizes embedded language handling:
  - Tokenizes language identifiers (`js`, `node`, `sh`, etc.)
  - Handles opening/closing braces for code blocks
  - Coordinates with embedded language service

These helpers achieve ~50% code reduction in visitor implementations and ensure consistent operator tokenization across the entire LSP.

#### Key Design Decisions

1. **No Custom Token Types**: We map all mlld concepts to VSCode's standard semantic token types. This ensures compatibility with all themes without requiring custom theme rules.

2. **Operator-Based Template Delimiters**: Template delimiters (backticks, colons) are mapped to `operator` instead of `string` to make them visually distinct from content.

3. **Offset-Based Length Calculation**: Token lengths must be calculated using `location.end.offset - location.start.offset`, not column positions, to handle multi-byte characters correctly.

4. **Context-Aware Tokenization**: The visitor pattern allows tracking context (template type, language mode) to apply different rules in different situations.

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
# Server-side debug logging
DEBUG=mlld:lsp mlld language-server

# VSCode client-side debug logging  
DEBUG_LSP=true code .
```

**Debug Mode**: Files with 'test-syntax' in the name trigger additional debug output.

#### Semantic Token Coverage Testing

Test semantic token coverage with environment variables:

```bash
# Enable coverage checking
MLLD_TOKEN_COVERAGE=1 npm test

# Skip operator coverage checking
MLLD_TOKEN_COVERAGE=1 MLLD_TOKEN_CHECK_OPERATORS=0 npm test

# Skip punctuation coverage checking
MLLD_TOKEN_COVERAGE=1 MLLD_TOKEN_CHECK_PUNCTUATION=0 npm test

# Include markdown content coverage
MLLD_TOKEN_COVERAGE=1 MLLD_TOKEN_CHECK_MARKDOWN=1 npm test
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

#### Semantic Token Implementation Checklist

When adding new syntax support:
1. Identify the AST node type in the grammar
2. Add node type to visitor mapping in `ASTSemanticVisitor.initializeVisitors()`
3. Create or update the appropriate visitor class
4. Handle token position calculation (1-based AST to 0-based LSP)
5. Test with VSCode Token Inspector
6. Add test cases to semantic tokens tests

### Known Issues

- **Parser Location Quirk**: The AST has inconsistent @ symbol inclusion for variable references with field access. This is handled with a workaround in the semantic visitor but should be fixed in the parser.
- **Object Property Locations**: Plain JavaScript values in objects/arrays don't have location information, only mlld constructs do.
- **Template Delimiters in Objects**: Exact delimiter positions aren't available for templates inside object values, so these aren't tokenized to avoid guessing.
- **Variable Field Access Position Drift**: Position calculation for field access can drift due to manual tracking in the `visitFieldAccess` method.
- **Missing Operator Nodes**: Some operators aren't AST nodes and require manual position calculation using text search methods.

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

### Semantic Highlighting Not Working

If syntax highlighting isn't showing correctly:

1. **Check VSCode Settings**:
   ```json
   {
     "editor.semanticHighlighting.enabled": true
   }
   ```

2. **Verify Extension is Using LSP**:
   - Open Output panel → "mlld Language Server"
   - Should see: `[SEMANTIC] Processing AST` logs

3. **Use Token Inspector**:
   - Place cursor on a token
   - Run: `Developer: Inspect Editor Tokens and Scopes` 
   - Should show semantic token type
   - This tool is invaluable for debugging - it shows:
     - The exact semantic token type (or "Other" if no token)
     - The color being applied by the theme
     - TextMate scopes (if any)
     - Whether semantic tokens are overriding syntax highlighting

4. **Enable Debug Logging**:
   ```bash
   # VSCode client-side debugging
   DEBUG_LSP=true code .
   ```
   Then check Developer Tools console for `[TOKEN]` logs
   
   For server-side debugging:
   ```bash
   DEBUG=mlld:lsp mlld language-server
   ```

5. **Test with Default Theme**:
   - Some themes don't support all semantic token types
   - Try "Dark+ (default dark)" which has full support

6. **Common Issues**:
   - **Operators not colored**: Check theme supports `operator` semantic token
   - **Comments not colored**: Ensure proper length calculation (offset-based)
   - **Templates look wrong**: Template delimiters map to `operator` for visibility

