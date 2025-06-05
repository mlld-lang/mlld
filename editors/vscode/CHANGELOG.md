# Change Log

All notable changes to the "mlld-vscode" extension will be documented in this file.

## [0.1.0] - 2024-01-XX

### Initial Release
- Syntax highlighting for all MLLD directives
- Real-time syntax validation using the MLLD parser
- Intelligent autocomplete for:
  - Directives (@text, @data, @path, etc.)
  - Variables and variable references
  - File paths with special variables (@PROJECTPATH, @CWD)
  - Section headers with [file.md # Section] syntax
  - Template variable interpolation {{variable}}
- Go to Definition for variables
- Hover information showing variable types
- Full support for .mlld, .mld, and .md file extensions
- Code snippets for common patterns
- Semantic token provider for enhanced highlighting