# mlld TextMate Grammar

TextMate grammar files for mlld syntax highlighting in TextMate-compatible editors.

## Files

- `mlld.tmLanguage.json` - Main syntax for `.mld` and `.mld.md` files
- `mlld-markdown.injection.json` - Injection grammar for mlld in Markdown

## Compatible Editors

- **Sublime Text**
- **TextMate**
- **Nova**
- **BBEdit** (with TextMate bundle support)
- **JetBrains IDEs** (via TextMate bundle plugin)
- **Zed** (supports TextMate grammars)

## Installation

### Sublime Text

Copy to your Packages directory:

```bash
# macOS
mkdir -p ~/Library/Application\ Support/Sublime\ Text/Packages/mlld/
cp *.json ~/Library/Application\ Support/Sublime\ Text/Packages/mlld/

# Linux
mkdir -p ~/.config/sublime-text/Packages/mlld/
cp *.json ~/.config/sublime-text/Packages/mlld/

# Windows
mkdir %APPDATA%\Sublime Text\Packages\mlld
copy *.json %APPDATA%\Sublime Text\Packages\mlld\
```

### TextMate

Create a bundle:

```bash
mkdir -p ~/Library/Application\ Support/TextMate/Bundles/mlld.tmbundle/Syntaxes/
cp mlld.tmLanguage.json ~/Library/Application\ Support/TextMate/Bundles/mlld.tmbundle/Syntaxes/
```

### Other Editors

Consult your editor's documentation for importing TextMate grammars.

## Regeneration

These files are auto-generated from `grammar/syntax-generator/build-syntax.js`:

```bash
npm run build:syntax:force
```
