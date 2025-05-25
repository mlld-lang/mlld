# Editor Support Research

## Popular Code Editors and Their Syntax Highlighting Formats

### 1. **TextMate-based** (Can use .tmLanguage.json)
- **VSCode** / **VSCodium** - Most popular, uses TextMate grammars
- **Sublime Text** - Uses .sublime-syntax (YAML) or .tmLanguage
- **Atom** (deprecated but still used) - TextMate grammars
- **Nova** (Panic) - Uses custom format but can adapt TextMate bundles
- **TextMate** itself (macOS)
- **Brackets** - Can use TextMate grammars

### 2. **Vim-based**
- **Vim** - Uses Vim syntax files
- **Neovim** - Same as Vim, plus Tree-sitter support
- **MacVim** - Same as Vim

### 3. **Emacs**
- Uses Emacs Lisp for syntax highlighting (font-lock)
- Different format entirely

### 4. **JetBrains IDEs**
- **IntelliJ IDEA** / **WebStorm** / **PyCharm** etc.
- Uses custom XML-based syntax files or Language Server Protocol

### 5. **Other Editors**
- **Zed** - Uses Tree-sitter grammars
- **Helix** - Uses Tree-sitter grammars
- **Kate** (KDE) - Uses XML syntax files
- **Gedit** (GNOME) - Uses GtkSourceView XML format
- **Notepad++** - Uses XML-based User Defined Language

## Recommended Support Strategy

### Phase 1 (Current)
1. **TextMate format** → VSCode, Sublime Text, Atom, TextMate, Nova (adapted)
2. **Vim format** → Vim, Neovim, MacVim
3. **Prism.js** → Website documentation

### Phase 2 (Future)
4. **Tree-sitter grammar** → Modern editors (Zed, Helix, Neovim)
5. **Language Server Protocol** → Universal support for all LSP-capable editors

## Markdown Integration Strategy

For `.md` files, we need different approaches:

1. **VSCode**: Use injection grammar to highlight Meld directives in Markdown
2. **Vim**: Use `after/syntax/markdown.vim` to add Meld highlighting
3. **Sublime**: Use scope injection in .sublime-syntax

The key is that Meld syntax should only activate when a line starts with a Meld directive (`@text`, `@run`, etc.)