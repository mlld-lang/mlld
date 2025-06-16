# Changelog

All notable changes to the mlld project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0]
Added:
- **New Resolver Architecture** - Complete overhaul of how mlld loads files and modules:
  - Pluggable resolver system for extensible file/module loading
  - Built-in resolvers: TIME, DEBUG, INPUT, PROJECTPATH, LOCAL, GITHUB, HTTP, REGISTRY
  - Content type detection for proper handling of different file formats
  - Private module support via GitHub and local directory resolvers
  - JSON import support: `@import { key } from "./data.json"`
- **New CLI Commands**:
  - `mlld setup` - Interactive configuration wizard for resolvers and authentication
  - `mlld alias` - Create path aliases for module imports
  - `mlld auth` - GitHub authentication management (login/logout/status)
  - `mlld env` - Manage allowed environment variables
- **Private Modules**:
  - GitHub resolver for private repositories with secure authentication
  - Enhanced `mlld publish` with `--private` flag and custom `--path` support
  - Path aliases map prefixes to local paths (e.g., `@shared/` → `../shared-modules`)
  - Location-aware `mlld init` prompts to use configured module directories
- **Environment Variables**:
  - Access control via `mlld.lock.json` security settings
  - Import allowed variables through @INPUT: `@import { API_KEY } from @INPUT`
  - Manage with `mlld env allow/remove/list`
- **Developer Mode (`--dev` flag)**:
  - Test modules with their final import paths before publishing
  - Automatic fallback to local versions when modules aren't found in repositories
  - Smart error messages guide developers to use `@local/` imports or publish their modules
  - Detects uncommitted changes and suggests using dev mode for testing
- **Shadow Environments** for @exec: `@exec js = { helperA, helperB }`
  - Inject helper functions into JavaScript execution contexts
- **Negation Operator** for @when conditions:
  - `@when !@variable => @action`
  - Works with all @when forms (simple, switch, block)
- **mlld Stacktrace** - Shows execution context when errors occur:
  - Directive execution path with file:line locations
  - Failed imports show parse errors inline
  - Error display in bordered box
  - (More work on this intended)
- **Unified Executable Syntax** - Simplified and added @exec definitions:
  - Direct syntax without @run prefix: `@exec greet(name) = [(echo "Hello, @name!")]`
  - Template executables: `@exec greeting(name) = [[Hello {{name}}!]]` or `` `Hello @name!` ``
  - Section executables: `@exec getSection(file, section, newheader) = [@file # @section] as @newheader`
  - Resolver executables: `@exec fetch(path) = @resolver/api/@path` 
  - Code executables: `@exec calc(x) = js [(return x * 2)]` (drops @run requirement)
- **Configuration Updates**:
  - Global config moved to `~/.config/mlld/mlld.lock.json`
  - Resolver registry configuration with priority support
  - Secure token storage using keytar (system keychain)

Fixed:
- **@PROJECTPATH variable** - Now correctly resolves to project root directory
- **Import error messages** - Much clearer error messages for import failures
- **Content type detection** - Consistent handling of .mld, .json, and other file types
- Shadow environment functions in @exec now properly handle async/await
- Numeric parameters in @exec functions are now correctly converted from strings
- **@when directive grammar bug** - Fixed parsing of `@add @variable` inside @when actions (#258)
- **@run with template executables** - Fixed "nodes is not iterable" error when using @run with @exec template functions
- **Truthiness documentation** - Clarified that strings "false" and "0" are falsy in @when conditions (matching existing behavior)

Changed:
- **@text deprecation** - Parameterized templates must now use `@exec` instead of `@text`. Using `@text name(params)` now throws an error directing to use `@exec`

Breaking Changes:
- None expected, but this is a major architectural change. Please report any issues!

## [1.3.4]
Added:
- Made keytar installation optional for npx purposes

## [1.3.3]
I can't remember what I did for 1.3.3 and I forgot to add it to the changelog.

## [1.3.2]
Fixed:
- @when now can supports running exec invocations

## [1.3.1]
Added:
- @when now has full support for @output variants added in 1.3.0

## [1.3.0]
Added:
- File output: @output @variable to "path/to/file.ext"
- Stream output: @output @variable to stdout/stderr
- Environment variables: @output @variable to env or env:CUSTOM_NAME
- Format conversion: @output @variable to "file.json" as json
- Resolver output: @output @variable to @resolver/path (placeholder for future implementation)

## [1.2.1 - 1.2.2]
Fixed:
- Module publishing PR to correct path / structure

## [1.2.0]
Added: 
- Private modules! Just like regular modules... but privater!

Fixed:
- #248: Drop @run requirement for exec invocation in @text
- #250: Exec functions show as '[command: undefined]' when called
- #252: Unclear @run requirement for exec function calls

## [1.1.7]
Fixed:
- @data directives storing ExecInvocation nodes were not being evaluated when accessed through @add

## [1.1.6]
Added:
- Toggle for turning off line normalization:
   `--no-normalize-blank-lines` CLI flag
   `normalizeBlankLines: false` in the API

## [1.1.5]
Fixed:
- Publishing a module as an org

Added:
- Newline trimming / normalization by default

## [1.1.1 - 1.1.4] 
Fixed:
- Stuff I broke
- Formatting issues
- Publishing blocked by overly aggressive validation

## [1.1.0]
New:
- #240 Support for node with `@run node [(...)]`

Fixed:
- #239 Stopped section-getters repeating headers
- Foreach / section targeting bugs
- Made llmxml shut up (copious logging)

Added:
- #238 Support for backtick templates with @var interpolation like: "@add `my var is @var`"

## [1.0.3]

Fixed:
- #235 Parser choking on EOF after closing backticks
- #234 Added blank line between frontmatter and h1 in mlld init template
- #233 Fixed yaml parsing issues by switching to graymatter 
- Created a resolver for @PROJECTPATH / @. variables to align with switch to resolver pattern

Known issues:
- #237 @INPUT variable is currently broken by fix for @. / @PROJECTPATH - # 
- #236 Template parsing fails with nested brackets in double-bracket templates

## [1.0.2]

Added:
- Foreach section extraction syntax: `foreach [@array.field # section] as [[template]]`
- Direct iteration over file arrays with section extraction for documentation assembly
- Support for variable section names: `[@docs.path # @docs.section]`

## [1.0.1]

Added:
- @add [file.md # @sectionVariable] syntax for variable section references
- Integration with foreach for collecting multiple sections dynamically

## [1.0.0]

Initial versioned release. 
