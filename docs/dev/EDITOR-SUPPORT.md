# Editor Support and Syntax Highlighting

This document describes how Mlld's syntax highlighting is generated and maintained across different editors.

## Overview

Mlld uses a **single source of truth** approach for syntax highlighting. All syntax definitions are automatically generated from the Peggy grammar files, ensuring consistency across all editors and the documentation website.

## Architecture

```
grammar/
  mlld.peggy                    # Main grammar (source of truth)
  directives/*.peggy            # Directive-specific grammars
  
  syntax-generator/
    build-syntax.js             # Generator script
    
  generated/                    # Output directory
    prism-mlld.js              # For website
    mlld.tmLanguage.json       # For VSCode/TextMate
    mlld.vim                   # For Vim
    markdown-mlld.vim          # For Vim (Markdown support)
    mlld-markdown.injection.json # For VSCode (Markdown support)
```

## How It Works

### 1. Grammar Extraction

The `build-syntax.js` script reads the Peggy grammar files and extracts:
- Directives from `ReservedDirective` rule
- Token patterns for variables, templates, paths, etc.
- Operator keywords and literals

### 2. Pattern Generation

The script generates regex patterns for each token type:
- `@directive` - Reserved directives (@text, @data, @run, etc.)
- `@variable` - Any @identifier that's not a directive
- `[[...]]` - Template blocks with {{variable}} interpolation
- `[...]` - Path/URL brackets
- `"..."` - String literals
- `>>` - Comments
- Operators, numbers, booleans, null

### 3. Output Generation

The script generates syntax files for each target:
- **Prism.js** - For website syntax highlighting
- **TextMate/VSCode** - JSON grammar format
- **Vim** - Vim syntax format with highlight groups

### 4. Automatic Distribution

Generated files are automatically copied to:
- `website/src/prism-mlld.js` - Website highlighting
- `editors/vscode/syntaxes/` - VSCode extension
- `editors/vim/syntax/` - Vim plugin

## Build Process

Syntax generation is integrated into the main build pipeline:

```bash
# Generate syntax files (runs automatically with build:grammar)
npm run build:syntax

# Or run the full build
npm run build
```

The `build:grammar` script includes `build:syntax`, so grammar changes automatically trigger syntax regeneration.

## Adding New Tokens

To add new syntax highlighting for a new directive or token:

1. **Update the Grammar** - Add the new directive/token to the appropriate Peggy file
2. **Run Build** - `npm run build:grammar` (includes syntax generation)
3. **Verify** - Check generated files in `grammar/generated/`
4. **Test** - Open example files in each editor to verify highlighting

The generator will automatically:
- Extract new directives from the `ReservedDirective` rule
- Include them in all generated syntax files
- Maintain consistent highlighting across all platforms

## Token Types and Styling

### Token Mappings

| Mlld Token | Prism Class | VSCode Scope | Vim Group |
|------------|-------------|--------------|-----------|
| @directive | keyword | keyword.control.directive.mlld | mlldDirective |
| @variable | variable | variable.other.mlld | mlldVariable |
| [[...]] | template-block | string.template.mlld | mlldTemplate |
| {{...}} | template-variable | variable.template.mlld | mlldTemplateVar |
| [...] | path | string.path.mlld | mlldPath |
| "..." | string | string.quoted.double.mlld | mlldString |
| >> | comment | comment.line.double-angle.mlld | mlldComment |

### Color Themes

Each editor handles theming differently:
- **Website** - Uses Prism's `prism-tomorrow` theme
- **VSCode** - Inherits from user's color theme
- **Vim** - Uses Vim's highlight groups

## Debugging Syntax Issues

### Common Issues

1. **Directive Not Highlighted**
   - Check if it's in `grammar/base/tokens.peggy` under `ReservedDirective`
   - Run `npm run build:syntax` to regenerate
   
2. **Pattern Not Matching**
   - Test the regex in the generated file
   - Check for conflicting patterns (order matters)
   
3. **Editor Not Updated**
   - Verify files were copied to editor directories
   - Reload the editor/extension
   - Check editor is using the correct syntax file

### Testing

Test syntax highlighting with:
```bash
# Generate a test file with all syntax elements
cat > test-syntax.mld << 'EOF'
>> This is a comment
@text greeting = "Hello, world!"
@data config = { name: "test", count: 42 }
@path docs = [@~/Documents]
@run [(echo "test")]
@add [[Welcome {{greeting}}!]]
@import all from [config.mld]
@exec cmd(param) = @run [(echo @param)]
@url api = [https://api.example.com]
EOF

# Open in each editor to verify
```

## Maintenance

### Regular Tasks

1. **After Grammar Changes** - Always run `npm run build:grammar`
2. **Before Releases** - Verify all editors have latest syntax
3. **Adding Directives** - Update `ReservedDirective` in grammar

### File Locations

Generated syntax files:
- `grammar/generated/prism-mlld.js`
- `grammar/generated/mlld.tmLanguage.json`
- `grammar/generated/mlld.vim`

Editor integration:
- VSCode: `editors/vscode/syntaxes/`
- Vim: `editors/vim/syntax/`
- Website: `website/src/prism-mlld.js`

## Language Server

mlld now includes a Language Server Protocol (LSP) implementation for advanced IDE features:

```bash
# Start the language server
mlld language-server
```

See [LANGUAGE-SERVER.md](./LANGUAGE-SERVER.md) for detailed documentation on:
- Installation and setup
- Editor integration guides
- Available features
- Configuration options

## Future Improvements

1. **Semantic Highlighting** - Use AST for context-aware highlighting
2. **Enhanced Language Server** - Additional features like formatting, refactoring
3. **Theme Generator** - Consistent themes across all editors
4. **Live Preview** - Real-time highlighting in web playground

## Contributing

When adding new syntax features:

1. Update the Peggy grammar first
2. Run `npm run build:grammar` to regenerate syntax
3. Test in all supported editors
4. Update example files if needed
5. Document any new token types

Remember: The Peggy grammar is the source of truth. Never manually edit generated syntax files.