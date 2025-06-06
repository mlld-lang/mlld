# mlld Editor Support

This directory contains editor extensions and plugins for mlld syntax highlighting and language support.

## Available Editors

### VSCode Extension (`vscode/`)
Full-featured VSCode/Cursor extension with:
- Syntax highlighting for `.mld` and `.mlld` files
- Automatic detection of mlld directives in Markdown files
- Code snippets and auto-completion
- Bracket matching and auto-closing
- Comment toggling support

**Installation**: Available on the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=mlld.mlld-vscode)

### Vim Plugin (`vim/`)
Vim syntax highlighting plugin with:
- Syntax highlighting for `.mld` and `.mlld` files
- Automatic filetype detection
- mlld directive detection in Markdown files
- Proper indentation support

**Installation**: Copy the `vim/` directory contents to your `~/.vim/` directory

## Syntax Highlighting

All syntax highlighting is **automatically generated** from the mlld grammar files. This ensures consistency across all editors and the documentation website.

For detailed information about:
- How syntax highlighting is generated
- Adding new tokens or directives  
- Debugging highlighting issues
- Build process integration

See the [Editor Support Documentation](../docs/dev/EDITOR-SUPPORT.md).

## Quick Start

```bash
# Generate/update syntax files for all editors
npm run build:syntax

# Full build (includes syntax generation)
npm run build
```

## Installing Editor Support

### Vim/Neovim
```bash
npm run install:vim
```

### VSCode
```bash
npm run install:vscode
```

### Cursor
```bash
npm run install:cursor
```

### Windsurf
```bash
npm run install:windsurf
```

### All Editors at Once
```bash
npm run install:editors  # Installs for Vim and VSCode
```

## Publishing

### VSCode Extension
```bash
# Package the extension locally (.vsix file)
npm run package:vscode

# Publish to VSCode Marketplace (requires authentication)
npm run publish:vscode
```

## File Structure

```
editors/
├── vscode/               # VSCode/Cursor extension
│   ├── syntaxes/        # Generated syntax files
│   ├── src/             # Extension source code
│   └── package.json     # Extension manifest
│
├── vim/                  # Vim plugin
│   ├── syntax/          # Generated syntax files
│   ├── ftdetect/        # Filetype detection
│   ├── ftplugin/        # Filetype-specific settings
│   └── after/           # Markdown integration
│
└── mlld-vscode/         # Published VSCode extension
    └── [build files]    # Do not edit directly
```

## Contributing

When making changes to editor support:

1. **Syntax Changes**: Update the grammar in `grammar/` and run `npm run build:syntax`
2. **Feature Changes**: Edit the source files in each editor's directory
3. **Testing**: Test changes in the actual editor before committing

Never manually edit generated syntax files - they will be overwritten on the next build.