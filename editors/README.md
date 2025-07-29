---
updated: 2025-07-29
tags: #editors, #syntax, #tooling
related-docs: docs/dev/LANGUAGE-SERVER.md
related-code: grammar/syntax-generator/build-syntax.js
---

# mlld Editor Support

## tldr

Editor extensions for mlld. Syntax highlighting auto-generated from grammar. Install with `npm run install:editors` or individually per editor.

```mld
>> mlld with proper syntax highlighting
/var @result = @a && @b || !@c
/var @greeting = when: [
  @time < 12 => "Morning"
  true => "Evening"
]
/run js {
  // JavaScript highlighting in code blocks
  console.log("Hello, @name!");
}
```

## Principles

- Single source of truth - All syntax derived from Peggy grammar
- Zero manual editing - Generated files overwritten on build
- Language embedding - Code blocks use native language highlighting
- Consistent tokens - Same highlighting across VSCode, Vim, and web

## Details

### Syntax Generation

```bash
# Force regenerate all syntax files
FORCE_SYNTAX_BUILD=true npm run build:syntax

# Normal build includes syntax generation
npm run build:grammar
```

Generator extracts from grammar:
- Directives from `ReservedDirective` rule
- Operators, keywords, and patterns from token definitions
- Embedded language blocks (js/python/bash)

### Supported Syntax

**New in rc29-rc30**:
- Logical operators: `&&`, `||`, `!`
- Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Ternary: `? :`
- When expressions: `when: [...] =>`
- Alligator syntax: `<file.md>`
- Triple colons: `:::...:::`
- Embedded languages: `js {...}`, `python {...}`, `bash {...}`

### File Structure

```
editors/
├── vscode/syntaxes/      # TextMate grammars
├── vim/syntax/           # Vim syntax files
└── textmate/             # Generic TextMate bundle

grammar/
├── syntax-generator/
│   └── build-syntax.js   # Generator script
└── generated/            # Output files
```

### Installation

**VSCode/Cursor**:
```bash
npm run install:vscode  # or install:cursor
# OR: Install from marketplace / VSIX
```

**Vim/Neovim**:
```bash
npm run install:vim
# OR: Manual copy to ~/.vim/
```

**All editors**:
```bash
npm run install:editors
```

## Gotchas

- NEVER edit files in `syntaxes/` or `syntax/` - regenerated on build
- Language embedding requires base language support (JS/Python/Bash)
- VSCode needs reload after extension changes
- Vim needs `:syntax on` and may need `:set ft=mlld`

## Debugging

**Syntax not working**:
1. Check file extension is `.mld` or `.mlld`
2. Verify syntax files were generated: `ls editors/vscode/syntaxes/`
3. Force rebuild: `FORCE_SYNTAX_BUILD=true npm run build:syntax`
4. Reload editor/window

**Adding new syntax**:
1. Update grammar in `grammar/patterns/` or `grammar/directives/`
2. Add to `ReservedDirective` if new directive
3. Update patterns in `build-syntax.js`
4. Rebuild and test