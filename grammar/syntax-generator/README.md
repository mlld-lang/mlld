# Syntax Highlighting Generator

This directory contains scripts to generate syntax highlighting files for various editors from the mlld grammar.

## Generated Files

The following files are generated in `grammar/generated/`:
- `mlld.tmLanguage.json` - TextMate/VSCode syntax definition
- `mlld-markdown.injection.json` - Markdown injection grammar for TextMate/VSCode
- `mlld.vim` - Vim syntax file
- `markdown-mlld.vim` - Vim Markdown support
- `prism-mlld.js` - Prism.js syntax definition

## Build Process

### Automatic Building

Syntax files are automatically generated in the following scenarios:

1. **On push to main branch** - A GitHub Action will generate and commit the files
2. **During npm publish** - Files are generated as part of the build process
3. **First time setup** - If no generated files exist locally

### Manual Building

For local development, you can manually generate syntax files:

```bash
# Generate syntax files (only if they don't exist)
npm run build:syntax

# Force regenerate syntax files
npm run build:syntax:force

# Or use environment variable
FORCE_SYNTAX_BUILD=true npm run build:syntax
```

### Skipping Syntax Build

To skip syntax generation during builds:

```bash
# Skip syntax build
SKIP_SYNTAX_BUILD=true npm run build

# This is useful for feature branches to avoid conflicts
```

## Why Conditional Building?

The syntax files are generated from the grammar and can cause merge conflicts when multiple developers are working on grammar changes. To avoid this:

1. **Generated files are gitignored** - They're not committed in feature branches
2. **Conditional generation** - Files are only generated when necessary
3. **Main branch only** - In CI, files are only generated for the main branch

## Development Workflow

1. When working on grammar changes in a feature branch:
   - Syntax files won't be regenerated automatically
   - Use `npm run build:syntax:force` to test your changes locally
   - Don't commit the generated files

2. When merging to main:
   - The GitHub Action will automatically generate and commit the files
   - This ensures syntax files are always up-to-date on main

3. For releases:
   - Syntax files are generated during the npm publish process
   - This ensures published packages always have the latest syntax definitions

## Troubleshooting

If you're having issues with syntax highlighting:

1. Check if generated files exist: `ls grammar/generated/`
2. Force regenerate: `npm run build:syntax:force`
3. Check for grammar errors: `npm run build:grammar:core`
4. Review the build output for any errors

## Architecture

The `build-syntax.js` script:
1. Reads the grammar definition from `grammar/base/tokens.peggy`
2. Extracts directive names and patterns
3. Generates syntax files for each supported editor
4. Copies files to appropriate editor directories

The `build-syntax-conditional.js` script:
1. Checks various conditions to determine if syntax should be built
2. Calls `build-syntax.js` if conditions are met
3. Provides appropriate console output explaining the decision