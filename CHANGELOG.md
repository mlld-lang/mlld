# Changelog

All notable changes to the mlld project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.4]

### Added
- Check for reserved words when publishing

## [1.4.3]

### Added
- **mlld test Command**: New command for running mlld test suites
  - Discovers and runs `.test.mld` files in test directories
  - Supports custom test directories with `--test-dir` flag
  - Shows detailed test results with pass/fail status
  - Integrates with CI/CD workflows
- **Built-in Transformers**: Common data format transformers are now built into mlld
  - `@XML` / `@xml` - Convert content to SCREAMING_SNAKE_CASE XML using llmxml
  - `@JSON` / `@json` - Pretty-print JSON or convert markdown structures to JSON
  - `@CSV` / `@csv` - Convert JSON/markdown tables to CSV format
  - `@MD` / `@md` - Format markdown using prettier
  - Transformers can be chained in pipelines: `@run [(cmd)] | @json | @csv`
  - Both uppercase (canonical) and lowercase (convenience) forms available
- **Smart Pipeline Parameter Handling**: Pipelines now intelligently pass data to multi-parameter functions
  - Single parameter functions continue to work as before (pass @INPUT as first param)
  - Multi-parameter functions with JSON input auto-destructure: `{"name": "Smith", "title": "Dr."}` → `@greet` maps to name="Smith", title="Dr."
  - Non-JSON input falls back to first parameter with empty strings for missing params
  - @INPUT variable available in each pipeline step with the piped data
- **Enhanced JavaScript Error Handling**: JavaScript/Node.js errors now properly integrate with mlld's error system
  - Error messages are preserved and shown in context
  - Stack traces included for debugging
  - Works in pipelines and shows full execution context
- **Namespace Imports**: Support for importing all variables from a file under a namespace alias (#264)
  - Import .mld files: `@import { * as utils } from "utils.mld"` - access as `{{utils.helper}}`
  - Import JSON files: `@import { * as config } from "config.json"` - access as `{{config.name}}`
  - Nested object access: `{{config.database.host}}` for deep properties
  - Works in templates with dot notation for clean, organized variable access

### Fixed
- Template executable property naming consistency (`template` vs `templateContent`)
- JavaScript return values now properly parsed from JSON (fixes falsy value handling in @when)
- Empty string parameter binding in pipelines
- Parameter binding when fewer arguments than parameters
- Pipeline syntax validation (only executables allowed after pipe operator)
- Module path resolution in built-in transformer imports
- isCommandVariable import in interpreter for executable variable handling
- **Template interpolation in foreach**: Fixed parameter interpolation in exec templates used with foreach - must use `{{param}}` syntax inside `[[...]]` templates
- **Shell parameter access**: Fixed exec functions with shell/sh commands to properly access parameters as environment variables using `$param` syntax
- **Array length property**: Removed incorrect test expectation for `.length` property on arrays (not implemented in mlld)
- **Grammar test expectations**: Fixed text directive test expecting undefined `meta.run` property for command execution
- **Shadow environment support for JavaScript**: Restored shadow environment functionality for `js` language
  - `js` execution uses in-process evaluation with direct function access
  - `node` execution uses subprocess isolation without shadow environment support
  - Shadow functions in `js` are synchronous for simple expressions, avoiding need for `await`
- **When directive comparisons**: Fixed `@when` with `first:` modifier to use value comparison instead of truthiness
  - `@when @var first: [...]` now compares `@var` value against each condition like switch syntax
  - Added string-boolean comparison: `"true"` matches `true`, `"false"` matches `false`
  - Consolidated comparison logic across all when variants for consistency
- **Pipeline parsing**: Fixed grammar to prevent pipelines from crossing line boundaries

### Changed
- **Template newline handling**: Moved newline stripping from interpreter to grammar level
  - Grammar now strips leading newline after `[[` and trailing newline before `]]`
  - These newlines are treated as formatting for readability, not content
  - More efficient and consistent than post-processing
  - Removed unused `normalizeTemplateContent()` function

### Documentation
- Added `docs/pipeline.md` - Comprehensive pipeline documentation
- Added `docs/transformers.md` - Built-in transformer reference
- Added `docs/security.md` - Security considerations for mlld usage
- Updated `docs/input-variables.md` with pipeline @INPUT documentation
- Updated `llms.txt` with pipeline and transformer information

## [1.4.2]

### Added
- Initial groundwork for pipeline support (full implementation in 1.4.3)

## [1.4.1]

### Added
- **VSCode Extension 0.3.0**: LSP implementation with autocomplete, syntax validation, hover info, go-to-definition
- **Markdown formatting**: prettier integration (default on, `--no-format` to disable)
- **Fuzzy path matching** for local files: case-insensitive and whitespace-flexible (`./my-file` finds `My File.mld`)

### Fixed
- `mlld language-server` command added to CLI
- Template normalization for leading/trailing newlines
- `variable.metadata` property access in add evaluator
- JavaScript/Node.js exec functions now support `return` statements - returned values are captured as JSON instead of requiring `console.log(JSON.stringify(...))`

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
