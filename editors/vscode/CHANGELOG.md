# Change Log

All notable changes to the "mlld-vscode" extension will be documented in this file.

## [0.4.0] - 2025-01-08

### Changed
- Updated all documentation to use correct mlld v2 syntax
- Directives now use `/` prefix instead of `@` (e.g., `/var` instead of `@text`)
- Updated supported directives list to match current language spec

## [0.3.0] - 2024-12-17

### Added
- Full Language Server Protocol (LSP) integration
- Intelligent autocomplete for:
  - All directives (@text, @data, @path, @run, @exec, @add, @import, @when, @output)
  - Reserved variables (@PROJECTPATH, @., @TIME, @INPUT, @DEBUG)
  - Module imports from registries (@author/module)
  - Resolver-aware completions (TIME formats, INPUT env vars)
  - Foreach syntax support
  - With clause completions (pipeline, needs)
- Real-time syntax validation
- Hover information for variables
- Go-to-definition functionality
- Multi-file analysis with import tracking

### Changed
- Extension now uses the mlld language server for intelligent features
- Improved TextMate grammar synchronized with actual mlld parser

## [0.2.0] - 2024-XX-XX

### Added
- Additional syntax highlighting patterns

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