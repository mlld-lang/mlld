---
updated: 2025-07-30
tags: #editors, #syntax, #lsp, #semantic-tokens
related-docs: docs/dev/LANGUAGE-SERVER.md, editors/HIGHLIGHTING.md
related-code: grammar/syntax-generator/build-syntax.js, services/lsp/ASTSemanticVisitor.ts
related-types: services/lsp/ASTSemanticVisitor { TokenInfo, VisitorContext }
---

# mlld Editor Support

## tldr

mlld provides two levels of editor support: basic TextMate grammars for regex-based highlighting and a full Language Server Protocol implementation with semantic tokens. For the best experience, use VSCode or Neovim with LSP enabled.

```mld
>> mlld with semantic highlighting knows context
/var @msg = `Hello @name!`     >> @name highlighted as interpolation
/var @ref = @name               >> @name highlighted as variable reference
/var @data = {"user": @name}    >> @name highlighted as variable reference
/run {echo "@name"}             >> @name highlighted as interpolation
```

## Principles

- LSP is the primary solution - Semantic tokens provide context-aware highlighting
- TextMate grammars are "good enough" - Basic highlighting for non-LSP editors
- Parser is the source of truth - LSP uses the real AST, not regex patterns
- Pragmatic over perfect - Ship working features, iterate on edge cases

## Details

### Language Server Protocol (LSP)

The mlld LSP provides intelligent features through semantic tokens:

**Semantic Token Types**:
- `directive` - /var, /show, /run, etc.
- `variable` - Variable declarations with @
- `variableRef` - Variable references
- `interpolation` - Variables in templates/commands
- `template` - Template delimiters (backticks, ::, :::)
- `operator` - Logical, comparison, ternary operators
- `embedded` - Language identifiers (js, python, etc.)
- `embeddedCode` - Code regions for syntax injection
- `alligator` - File references <file.md>
- `property` - Object property access

**Context Awareness**:
- Different highlighting for @var in templates vs directives
- Triple-colon templates use {{var}}, others use @var
- Single quotes never interpolate
- Commands allow @var interpolation

**Starting the LSP**:
```bash
mlld language-server    # or mlld lsp
```

**Editor Configuration**:
- VSCode: Automatic with extension
- Neovim: Configure built-in LSP client
- Vim: Use coc.nvim or vim-lsp

### TextMate Grammars

Basic syntax highlighting for editors without LSP support:

**Generation**:
```bash
npm run build:syntax              # Normal build
FORCE_SYNTAX_BUILD=true npm run build:syntax  # Force regenerate
```

**Coverage**:
- Directives and keywords
- Basic variable highlighting (no context)
- Comment syntax
- String literals

**Limitations**:
- Can't distinguish interpolation contexts
- No semantic understanding
- May highlight invalid syntax

### Installation

**VSCode/Cursor** (Best Experience):
```bash
npm run install:vscode
# Extension provides LSP + TextMate fallback
```

**Neovim** (LSP Support):
```lua
-- In init.lua
require'lspconfig'.mlld_ls.setup{
  cmd = {"mlld", "language-server"},
  filetypes = {"mld", "mlld"}
}
```

**Vim** (Basic Highlighting):
```bash
npm run install:vim
# Or use coc.nvim for LSP support
```

## Gotchas

- TextMate grammars CANNOT handle context-sensitive syntax correctly
- Embedded language blocks marked as regions, actual highlighting by editor
- Parser location quirks documented in ASTSemanticVisitor.ts
- Primitive values in objects/arrays lack individual highlighting
- Template delimiters in object values skipped to avoid position guessing

## Debugging

**LSP Issues**:
- Check language server running: `ps aux | grep mlld`
- Enable debug: `DEBUG=mlld:lsp mlld lsp`
- Verify semantic tokens in editor developer tools

**Highlighting Issues**:
- For best results, use editor with LSP support
- TextMate highlighting is basic by design
- Check file extension (.mld or .mlld)
- Reload editor after changes