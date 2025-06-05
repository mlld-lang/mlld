# Syntax Highlighting Build Process

This document explains how syntax highlighting files are generated and when they are built.

## Overview

The mlld project generates syntax highlighting files for various editors (VSCode, Vim, Sublime, etc.) from the grammar definition. These files are located in `grammar/generated/` and are automatically generated from the Peggy grammar.

## Problem: Merge Conflicts

Previously, syntax highlighting files were generated on every build, which caused frequent merge conflicts when multiple developers were working on grammar changes. The generated files would differ between branches, creating unnecessary conflicts during merges.

## Solution: Conditional Building

To solve this problem, syntax highlighting generation is now conditional:

### When Syntax Files Are Built

1. **On push to main branch** - A GitHub Action automatically generates and commits the files
2. **During npm publish** - Ensures published packages have up-to-date syntax files
3. **First time setup** - If no generated files exist locally
4. **Manual generation** - When explicitly requested by developers

### When Syntax Files Are NOT Built

1. **Feature branches** - To avoid merge conflicts
2. **Pull requests** - Generated files are not needed for PR reviews
3. **Regular local builds** - If files already exist

## Developer Workflow

### Working on Feature Branches

When developing in a feature branch:

```bash
# Normal build - syntax files are NOT regenerated
npm run build

# If you need to test syntax highlighting changes
npm run build:syntax:force

# Don't commit the generated files in your feature branch
```

### Testing Syntax Highlighting

To test your grammar changes with syntax highlighting:

```bash
# Force regenerate syntax files
npm run build:syntax:force

# Install in your editor (example for VSCode)
npm run install:vscode
```

### Environment Variables

- `SKIP_SYNTAX_BUILD=true` - Skip syntax generation even if it would normally run
- `FORCE_SYNTAX_BUILD=true` - Force syntax generation even if files exist

Example:
```bash
# Skip syntax build during full build
SKIP_SYNTAX_BUILD=true npm run build

# Force syntax build
FORCE_SYNTAX_BUILD=true npm run build:syntax
```

## CI/CD Integration

### GitHub Actions

The `.github/workflows/build-syntax.yml` workflow:
- Triggers on push to main when grammar files change
- Generates syntax files
- Commits them with `[skip ci]` to avoid triggering other workflows

### NPM Publishing

The npm publish workflow:
- Always generates fresh syntax files
- Ensures published packages have the latest syntax definitions

## File Structure

```
grammar/
├── syntax-generator/
│   ├── build-syntax.js              # Main generator script
│   ├── build-syntax-conditional.js  # Conditional wrapper
│   └── README.md                    # Detailed documentation
└── generated/                       # Output directory (gitignored)
    ├── mlld.tmLanguage.json        # VSCode/TextMate
    ├── mlld-markdown.injection.json # Markdown support
    ├── mlld.vim                    # Vim syntax
    ├── markdown-mlld.vim           # Vim Markdown support
    └── prism-mlld.js              # Prism.js for web
```

## Troubleshooting

### Syntax highlighting not working

1. Check if files exist: `ls grammar/generated/`
2. Force regenerate: `npm run build:syntax:force`
3. Reinstall in editor: `npm run install:editors`

### Merge conflicts in generated files

This should not happen anymore, but if it does:

1. Delete the conflicted files: `rm -rf grammar/generated/`
2. Checkout from main: `git checkout main -- grammar/generated/`
3. Or regenerate: `npm run build:syntax:force`

### Files not being generated in CI

Check the GitHub Action logs:
- Ensure grammar files actually changed
- Check for errors in the build process
- Verify the workflow has write permissions

## Implementation Details

The conditional build logic (`build-syntax-conditional.js`) checks:

1. Environment variables (`SKIP_SYNTAX_BUILD`, `FORCE_SYNTAX_BUILD`)
2. CI environment (only builds on main branch)
3. Local file existence (builds if missing)

This ensures syntax files are available when needed but don't cause unnecessary conflicts during development.