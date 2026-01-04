# mlld Editor Support

Editor integrations for mlld syntax highlighting and language features.

## Quick Start

| Editor | Recommended Setup |
|--------|-------------------|
| **VSCode/Cursor** | Install extension from marketplace or `npm run install:vscode` |
| **Neovim** | `mlld nvim-setup` for LSP + highlighting |
| **Vim** | Copy `editors/vim/` to `~/.vim/` |
| **Sublime Text** | Copy `editors/textmate/*.json` to Packages/User/ |

## Architecture

mlld provides two levels of editor support:

### 1. LSP (Language Server Protocol)

Full-featured support with semantic highlighting, autocomplete, go-to-definition, and real-time validation.

```bash
mlld language-server  # or: mlld lsp
```

**Supported:** VSCode, Neovim (0.8+), any LSP-compatible editor

**Features:**
- Context-aware highlighting (knows `@var` in templates vs directives)
- Autocomplete for directives, variables, file paths
- Hover information for variables and functions
- Go-to-definition for variables and imports
- Real-time syntax validation

### 2. Regex-based Highlighting

Basic syntax highlighting using TextMate grammars (VSCode, Sublime) or Vim syntax files.

**Features:**
- Directive keywords
- Variables and operators
- Comments and strings
- Template delimiters

**Limitations:**
- No context awareness
- No autocomplete or validation
- May highlight invalid syntax

## Directory Structure

```
editors/
├── vscode/      # VSCode extension (LSP + TextMate fallback)
├── vim/         # Vim/Neovim syntax files
├── textmate/    # Generic TextMate grammars (Sublime, etc.)
└── web/         # Prism.js for websites
```

## Regenerating Syntax Files

Syntax files are generated from `grammar/syntax-generator/`:

```bash
npm run build:syntax        # Only if files missing
npm run build:syntax:force  # Force regenerate
```

## Editor-Specific Guides

- [VSCode Extension](vscode/README.md) - Full LSP support
- [Vim/Neovim](vim/README.md) - Syntax + LSP setup
- [TextMate Grammars](textmate/README.md) - Sublime Text, Nova, etc.
- [Web/Prism.js](web/README.md) - Website highlighting
