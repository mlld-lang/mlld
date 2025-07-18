# Changelog

All notable changes to the mlld project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-rc12]

### Fixed
- **URL-relative import resolution**: Fixed relative imports when running scripts from URLs
  - Scripts loaded from URLs (e.g., via `npx mlld@latest https://...`) can now use relative imports
  - `../modules/file.mld` correctly resolves to full URL when current file is a URL
  - Enables serverless execution of mlld scripts with local module dependencies
  - Fixes registry review system import resolution issues

## [2.0.0-rc11]

### Fixed
- **Import collision detection**: Fixed false positive collisions with system variables
  - System variables like frontmatter (`@fm`) no longer trigger import collision errors
  - Multiple modules with frontmatter can now be imported without conflicts
  - Collision detection now only applies to legitimate user-defined variables
  - Resolves registry review deployment issues caused by frontmatter variable conflicts

## [2.0.0-rc10]

### Added
- **URL execution support**: Run mlld scripts directly from URLs
  - Execute scripts from any HTTP/HTTPS URL: `mlld https://example.com/script.mld`
  - Useful for CI/CD pipelines: `npx mlld@latest https://raw.githubusercontent.com/user/repo/main/script.mld`
  - In-memory execution without temporary files
  - Automatic redirect handling (up to 5 redirects)
  - Configurable timeout and size limits via CLI options
- **mlld clean command**: New command for cleaning cached module metadata
  - `mlld clean <module...>` - Remove specific modules from lock file and cache
  - `mlld clean --all` - Clear all cached imports and force fresh resolution
  - `mlld clean --registry` - Clear only registry modules (preserving local modules)
  - `--verbose` flag for detailed output during cleaning operations
  - Helps resolve issues with stale cached module data preventing proper imports

### Fixed
- **Registry import system**: Complete overhaul of module import processing
  - Fixed registry imports returning empty objects instead of module exports
  - Unified import processing path for both local and registry imports
  - Added proper frontmatter extraction for registry resolver imports
  - Improved error handling with specific 404 detection and clear error messages
- **Registry URL validation**: Added publish-time verification
  - Verify generated URLs are publicly accessible before publishing
  - Check that published content matches recorded integrity hashes
  - Prevent broken modules from being published without detection
- **Lock file path handling**: Fixed CLI commands to use correct lock file location
  - Commands now properly read `mlld.lock.json` from project root instead of `.mlld/` subdirectory
  - Affects `mlld ls`, `mlld clean`, and other commands that manage module metadata

## [2.0.0-rc7]

### Fixed
- **Logger compatibility with serverless environments**: 
  - Fixed winston logger attempting to create logs directory in read-only filesystems
  - File transports are now conditionally added only when logs directory exists
  - Prevents ENOENT errors when running mlld in Vercel, AWS Lambda, and other serverless platforms

## [2.0.0-rc6]

### Added
- **Enhanced `/when` directive support**:
  - Variable function calls in when actions: `/when !@condition => /var @result = @function(@param)`
  - Non-existent fields now evaluate to falsy instead of throwing errors
  - Works in all when forms: simple (`@when @obj.missing => ...`), block, and with modifiers
- Updated module publishing flow

## [2.0.0-rc5]

### Changed
- **Variable Type System**: Complete refactor of how variables flow through mlld
  - Variables now preserve type information and metadata throughout evaluation
  - Type detection uses O(1) property checks instead of content inspection
  - Shadow environments (JS, Node, Python) receive rich type info via proxies
  
### Added
- **Bash Variable Adapter**: Clean adapter for bash/sh environments
  - Bash receives string values while other languages get full type information
  - Fixes JavaScript errors when bash tries to access helper functions
- **Type Introspection**: New methods for runtime type checking
  - `mlld.getType()`, `mlld.isVariable()`, `mlld.getMetadata()`

### Fixed
- ArrayVariable storing AST structure instead of evaluated values
- Empty string returns and JavaScript errors in bash/sh execution
- Overly broad type guards that matched any string array

### Removed
- Enhanced variable passing feature flag (now always enabled)
- Legacy factory functions `createRenamedContentArray` and `createLoadContentResultArray`

## [2.0.0-rc4]

### Added
- **File Reference Interpolation**: File references `<file.md>` can now be interpolated in strings and templates
  - Interpolate in backticks: `` `Content: <README.md>` ``
  - Interpolate in double quotes: `"Including <file.txt> here"`
  - Field access on files: `<package.json>.name`, `<data.json>.users[0].email`
  - Works with globs: `<*.md>.fm.title` gets all markdown titles
  - Special `<>` placeholder in 'as' clauses: `<*.md> as "# <>.filename"`
- **Condensed Pipe Syntax**: Both file references and variables support pipe transformations
  - File pipes: `<file.json>|@json|@xml` - load JSON and convert to XML
  - Variable pipes: `@data|@upper|@trim` - transform variable values
  - No spaces allowed in condensed syntax (use full `| @transform` in directives)
- **Variable Pipe Support**: Variables can now use pipes in interpolation contexts
  - In templates: `` `Data: @myvar|@json` ``
  - In quotes: `"Name: @user.name|@upper"`
  - Transforms can be built-in or imported from modules
- **Triple Colon Template Syntax**: New `:::...:::` syntax for `{{var}}` interpolation
  - Addresses the common case of needing backticks inside templates
  - Example: `:::Code example: `getData()` returns {{data}}:::`
  - Double colon `::...::` syntax now uses `@var` interpolation instead of `{{var}}`

### Changed
- **Template Interpolation Syntax**: Double colon `::...::` now uses `@var` interpolation instead of `{{var}}`
  - **Migration required**: Change `::Hello {{name}}::` to `:::Hello {{name}}:::`
  - Double colon templates can now include backticks: `::The `function()` returns @value::`
  - This change enables technical documentation with inline code examples
- **Removed Foreach Section Pattern**: The `foreach <@array # section>` syntax has been removed
  - Migration: Use `<*.md # section> as "template"` instead
  - The new file interpolation syntax completely supersedes this pattern
  - Simpler and more intuitive: direct glob + template in one expression

### Fixed
- Circular file references now emit warnings instead of errors
  - `<**/*.mld>` in an .mld file correctly returns all OTHER .mld files
  - Prevents infinite loops while allowing useful self-excluding patterns

### Changed
- **Reserved Variables Now Lowercase**: All built-in reserved variables have been converted to lowercase for consistency
  - `@NOW` → `@now` (current timestamp)
  - `@DEBUG` → `@debug` (debug information)
  - `@INPUT` → `@input` (stdin/environment access)
  - `@PROJECTPATH` → `@base` (project root directory)
- **Removed @. Alias**: The `@.` alias for project root has been removed; use `@base` instead
- **Simplified Naming**: Aligns with interpreter's `basePath` terminology and modern naming conventions

## [2.0.0-rc3]

### Added
- **Dev Mode**: Local module development support with automatic prefix mapping
  - `mlld mode dev` - Enable dev mode (persists in lock file)
  - `mlld dev status` - Show current mode and detected local modules
  - `mlld dev list` - List all local modules with their publish names
  - `--dev` flag for one-time dev mode override
  - `MLLD_DEV=true` environment variable support
  - Automatically maps `@author/module` imports to local files in `llm/modules/`
- **Mode Command**: Set mlld execution mode
  - `mlld mode dev/development` - Enable development mode
  - `mlld mode prod/production` - Enable production mode
  - `mlld mode user` - Default user mode
  - `mlld mode clear/reset` - Remove mode setting (defaults to user)
  - Mode stored in `mlld.lock.json` under `config.mode`
  - Future extensibility for security modes with different permissions
- **Alligator Syntax**: New syntax for file loading that eliminates bracket ambiguity
  - File loading: `<file.md>` replaces `[file.md]`
  - Section extraction: `<file.md # Section>` replaces `[file.md # Section]`
  - URL loading: `<https://example.com/file.md>` replaces `[https://example.com/file.md]`
  - Resolver paths: `<@./path>` and `<@PROJECTPATH/path>` replace bracketed versions
  - Square brackets `[...]` now exclusively mean arrays, removing all ambiguity
  - Clear visual distinction: angles `<>` load content, brackets `[]` define arrays
- **Glob Pattern Support**: Alligator syntax now supports glob patterns for loading multiple files
  - Glob patterns: `<*.md>`, `<**/*.ts>`, `<src/**/*.js>`
  - Returns array of LoadContentResult objects with metadata
  - Each file includes content and rich metadata properties
- **Rich Metadata for Loaded Content**: Files and URLs loaded with `<>` syntax now include metadata
  - **File Metadata**:
    - `content`: The file's text content (default when used as string)
    - `filename`: Just the filename (e.g., "README.md")
    - `relative`: Relative path from current directory
    - `absolute`: Full absolute path
    - `tokest`: Estimated token count based on file type (750/KB for text, 500/KB for code)
    - `tokens`: Exact token count using tiktoken (lazy-evaluated)
    - `fm`: Parsed frontmatter for markdown files (lazy-evaluated)
    - `json`: Parsed JSON for .json files (lazy-evaluated)
  - **URL Metadata** (additional properties for URLs):
    - `url`: The full URL
    - `domain`: Just the domain (e.g., "example.com")
    - `title`: Page title (extracted from HTML)
    - `description`: Meta description or og:description
    - `html`: Raw HTML content (for HTML pages)
    - `text`: Plain text extraction (HTML stripped)
    - `md`: Markdown version (same as content for HTML)
    - `headers`: Response headers object
    - `status`: HTTP status code
    - `contentType`: Content-Type header value
  - Access metadata with field syntax: `@file.filename`, `@url.domain`, `@page.title`, etc.
  - Smart object behavior: shows content when displayed, preserves metadata when stored
  - Note: Some metadata properties use lazy evaluation and may not be accessible in certain contexts due to issue #315
- **HTML to Markdown Conversion**: URLs returning HTML are automatically converted to clean Markdown
  - Uses Mozilla's Readability to extract article content (removes navigation, ads, sidebars)
  - Uses Turndown to convert the clean HTML to well-formatted Markdown
  - `/show <https://example.com/article>` displays the article as Markdown by default
  - Raw HTML still accessible via `@page.html` property (when #315 is resolved)

### Fixed
- Duplicate `--dev` case clause in ArgumentParser
- Property name consistency (`dev` vs `devMode`) across CLI interfaces

## [2.0.0]

Represents an overhaul and consolidation of all syntax. 

The `/` command approach creates clear disambiguiation between commands and variables/executables, while also setting the stage for using mlld in chat contexts. We are moving to a simple variable definition model with `/var` while allowing rich expression for different types based on the provided syntax.

### Updated Syntax:
- Directives: Changed from @ prefix to / prefix (e.g., @text → /var, @add → /show)
- Variable creation: Now requires @ prefix (e.g., /var @name = "value")
- Command syntax: Changed from [(command)] to {command} or "command" (single-line, non-shellscript)
- Code syntax: must use {...} for code blocks
- Unified /var: Replaced multiple directives (@text, @data) with single /var
- Renamed directives: @add → /show, @exec → /exe
- /output for file output
- Comments: Use >> for line start/end comments (but not in params/objects/templates)
- Template syntax: Changed from [[...]] to ::...:: to avoid array parsing ambiguity

### Updated Interpolation:
- Double quotes: Now support @variable interpolation
- Backticks: Primary template syntax with @variable interpolation
- Double colons: Template syntax for @-heavy content, uses {{variable}}
- Commands: Use @variable in both {...} and "..." forms

### Added:
- **Namespace Imports**: Import entire files or modules as namespaced objects
  - File imports: `/import [./file.mld]` creates namespace from filename (e.g., `@file`)
  - Custom alias: `/import [./file.mld] as myname` creates `@myname` namespace
  - Module imports: `/import @author/module` creates `@module` namespace
  - Access fields: `@namespace.field` to access imported variables
  - Replaces deprecated wildcard syntax `/import { * } from [file]`
- **Primitive Value Support**: Direct assignment of unquoted numbers, booleans, and null
  - Numbers: `/var @count = 42`, `/var @price = 19.99`
  - Booleans: `/var @active = true`, `/var @disabled = false`
  - Null: `/var @empty = null`
  - Type preservation: Primitives maintain their JavaScript types through the system
  - JavaScript semantics: Type coercion follows JavaScript rules (e.g., `"text" + 5 = "text5"`)
  - Exec invocation support: Primitive literals in function calls (e.g., `@add(@num, 8)`)
- **Built-in @now Variable**: New built-in variable for current timestamp
  - Returns ISO 8601 timestamp: `2024-01-15T10:30:00.000Z`
  - Available in all contexts where variables are allowed
  - Also available as `mlld_now()` function in JavaScript/Node shadow environments
- **@mlld/time Module**: Comprehensive date/time functionality replaces simple built-in time operations with full-featured module

## [1.4.11]

### Fixed
- Fixed pipeline operator converting JSON array strings to `[object Object]` (#272)
  - ExecInvocation nodes with pipelines are now handled correctly in data value evaluation
  - Functions are executed first, then their JSON string results are passed through the pipeline
  - Pipeline now preserves JSON array data as strings instead of mangling them
  - This fix ensures data can be properly passed between functions in a pipeline
- Fixed pipeline format feature to provide wrapped input to all pipeline stages
  - Previously only the first pipeline stage received wrapped input objects with `text`, `type`, and `data` properties
  - Now all stages consistently receive wrapped input, enabling format-aware processing throughout the pipeline
  - This allows subsequent pipeline stages to access parsed data (e.g., `input.csv` for CSV format)

## [1.4.10]
### Fixed
- Fixed parser failing on bracket characters (`[` or `]`) in JavaScript/code string literals (#273)
  - Code content within `[(...))]` blocks is now treated as opaque text
  - Enables string comparisons like `if (char === "[")` and array literals like `["[", "]"]`
  - Fixes regex patterns, JSON parsing, and other code using bracket characters

## [1.4.9]
### Fixed
- Fixed Node.js exec functions throwing ReferenceError when optional parameters are not provided
  - All declared parameters are now properly initialized in the execution context, even when undefined
  - Enables functions like `filterByFrontmatter(files, field, value)` to be called with just `(files, field)`
  - Affects both shadow environment (VM) and subprocess execution modes

## [1.4.8]
### Added
- **Pipeline-aware @debug**: The @debug variable now includes pipeline execution context when evaluated during pipeline operations
  - Shows current stage number and total stages in pipeline
  - Displays the command/transformer being executed
  - Includes input data details (type, length, preview)
  - Lists outputs from previous pipeline stages
  - Context is accessible in child environments via parent chain lookup

### Fixed
- Fixed `mlld setup` command throwing "Cannot read properties of null (reading 'config')" error when no mlld.lock.json exists
- Fixed pipeline `@data` variable evaluation returning null for complex pipeline expressions
  - `VariableReferenceWithTail` nodes now properly marked for lazy evaluation
  - Enables correct execution of expressions like `@data result = @input | @transformer1 | @transformer2`
- Fixed incorrect MlldCommandExecutionError constructor usage that caused "Cannot use 'in' operator" errors
  - Updated all error instantiations to use new signature with proper sourceLocation parameter
- Fixed Node.js shadow environment keeping process alive due to uncleaned timers
  - Added `cleanup()` method to NodeShadowEnvironment to clear timers and VM context
  - Environment cleanup is now called after CLI execution to ensure clean process exit
  - Prevents hanging processes when using setTimeout/setInterval in @exec node functions

## [1.4.7]

### Fixed
- #270 LocalResolver fails to resolve .mld.md files with 'Access denied' error

## [1.4.6]
### Added
- **Node shadow env support**
- Some resolver bugs

### Fixed
- @debug / @DEBUG wasn't working
- Created better naming clarity with prefix/resolver/registry distinction and refactor
- JS shadow env bug
- @data not allowing RHS @run 

### Documentation
- Lots of docs updates for resolvers
- Added missing alias and setup commands to cli help text

## [1.4.5]

### Added
- **mlld run Command**: Execute mlld scripts from a configured directory
  - Run scripts by name: `mlld run script-name` (without .mld extension)
  - List available scripts: `mlld run` (no arguments)
  - Script directory configured in `mlld.lock.json` via `mlld setup`
  - Default script directory: `llm/run/`
  - Helpful error messages showing available scripts when script not found

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
  - Transformers can be chained in pipelines: `run [(cmd)] | @json | @csv`
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
