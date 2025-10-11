# Changelog

All notable changes to the mlld project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-rc68]
### Fixed
- Template executables detect JSON-looking strings and wrap them as structured values, so downstream pipelines receive native objects instead of escaped text (#435).
- Foreach iteration normalizes stage outputs that stringify JSON and passes parsed arrays/objects forward, restoring the behaviour users expect from `| @json` inputs.
- `/show` array rendering unwraps structured elements to their `.data` view when possible, keeping canonical text intact for load-content metadata and structured JSON displays.

## [2.0.0-rc67]
### Fixed
- Pipelines sanitize JSON-like shell output by escaping control characters inside string literals, so `/run` stages that echo newline-bearing JSON feed structured data forward correctly.

## [2.0.0-rc64]
### Fixed
- **Alligator section parsing with "as" substring**: Fixed grammar bug where section names containing "as" (like "Gotchas", "Installation", "Basic Usage") were rejected
  - Changed `AlligatorSectionChar` rule from `!"as"` to `!(" as")` to only exclude the `as` keyword when used for renaming
  - Section syntax like `<file.md # Gotchas>` now works correctly
  - Distinguishes between section names with "as" and the rename keyword: `<file.md # Section> as "New Title"`
  - Added test coverage in `tests/cases/slash/show/alligator-section-as-substring/`
- Preserved structured pipeline outputs across chained executables by wrapping JSON-like strings returned from JS/Node stages, preventing downstream stages from receiving `[object Object]` text (#435).
- Updated run/exec structured handling and regression fixtures so batch/parallel pipelines, foreach separators, and retry fallbacks assert native arrays/objects instead of stringified JSON, closing the remaining gaps from #435 user scenarios.

## [2.0.0-rc63]
### Fixed
- Fixed local resolver to recognize all mlld extensions as modules when they contain directives. Previously only .mlld.md files were explicitly treated as modules, causing "Import target is not a module" errors when importing .mld files via custom resolver prefixes like @context/.
- Improved content type detection to parse file contents for mlld directives across all module extensions, maintaining backward compatibility for files with non-standard extensions that contain valid mlld code.
- Missing `--tag` on cli added
- Update docs to cover modules, registry, resolvers

### Added
- Batch and condensed pipeline stages now receive the structured wrapper instead of raw strings, so helpers can work with native arrays/objects without JSON.parse.
- **Custom tag support for publishing**: `mlld publish --tag <name>` allows publishing modules with custom version tags
  - Publish with beta/alpha tags: `mlld publish module.mld --tag beta`
  - Tag validation ensures alphanumeric + hyphens only, 2-50 character length
  - Reserved tags (`latest`, `stable`) are rejected with clear error messages
  - Users can import using custom tags: `/import { @helper } from @alice/utils@beta`

## [2.0.0-rc62]

### Added
- **Batch pipelines for collection expressions**: `for` and `foreach` now accept a trailing `=> |` pipeline that runs after iteration completes. The batch phase reuses standard pipeline syntax, applies to the gathered array, and may return arrays, scalars, or objects. Grammar attaches the pipeline to `ForExpression.meta.batchPipeline` and `ForeachCommandExpression`, and the interpreter processes the results via `processPipeline()` before emitting the final variable or display output.

### Notes
- Batch pipelines behave like condensed pipelines: each stage receives string input, so helpers that expect arrays should parse the string back to JSON. Currently parallel groups (`||`) share the same semantics but are not fully supported/tested.

## [2.0.0-rc61]

### Added
- **Loose JSON parsing modes**: `@json` now accepts relaxed JSON syntax (single quotes, trailing commas, comments) using JSON5, with explicit `@json.loose` and `@json.strict` variants for opting in or enforcing strict parsing. Error messages direct users to the loose mode when strict parsing fails.

### Fixed
- **Structured data handling in field access**: Fixed array operations on nested StructuredValue wrappers
  - Field access now properly unwraps nested StructuredValue before array operations
  - Fixes potential runtime errors with deeply nested structured data (e.g., `@nested[0]` where `@nested` is a wrapped array)
  - Related to #435 structured data edge cases
  - Fixed in `interpreter/utils/field-access.ts:477` and `:248`

- **Exec invocation stdin handling**: Fixed stdin coercion missing StructuredValue unwrapping
  - Exec invocations now properly unwrap StructuredValue when preparing stdin data
  - Aligns with run.ts stdin handling (same pattern as the golden standard)
  - Prevents double-wrapping or incorrect stringification of structured values passed via stdin
  - Related to #435 structured data edge cases
  - Fixed in `interpreter/eval/exec-invocation.ts:49`

- **Shell interpolation of structured values**: Complex arrays/objects now survive shell argument quoting
  - Shared `classifyShellValue` helper drives `/run` and `@exe` stdin/argument coercion
  - Interpolation tracks both single- and double-quoted spans, avoiding `[object Object]` and broken quoting
  - File-content fixtures confirm literal `$`, `` ` ``, and quotes reach the shell intact
  - Covers regressions from #435 user scenario

- **Variable assignment with wrapped values**: Fixed String() conversions producing [object Object]
  - Variable assignments now use `valueToString()` helper that checks for StructuredValue wrappers
  - Uses `asText()` helper for StructuredValue wrappers instead of naive String() conversion
  - Applies fix to 7 locations in var.ts where String() was used on complex values (lines 725, 751, 763, 773, 782, 820, 823)
  - Variable type detection now properly unwraps StructuredValue before Array.isArray() checks (3 locations: lines 719, 745, 757)
  - Related to #435 structured data edge cases
  - Fixed in `interpreter/eval/var.ts`

## [2.0.0-rc60]

### Fixed
- **Shell command interpolation with nested arrays**: Fixed arrays of objects/arrays being converted to `[object Object]` in shell commands
  - Shell command context (e.g., `echo @array`) now properly JSON-stringifies complex array elements
  - Previously `String(object)` produced `[object Object]`, breaking data flow through shell executables
  - Example: `/exe @func(e) = run { echo @e }` now correctly outputs JSON for nested arrays
  - Fixes remaining edge case from #435 (https://github.com/mlld-lang/mlld/issues/435#issuecomment-3386904732)
- Addressed instances of old mlld.lock.json file expectations throughout codebase

## [2.0.0-rc59]

### Changed
- **CLI commands aligned with new config file naming**: Updated all CLI commands to reference the new dual-file configuration system
  - `mlld-config.json`: User-editable project settings (dependencies, preferences, resolver configuration)
  - `mlld-lock.json`: Auto-generated lock file (versions, hashes, sources)
  - Replaced `mlld.lock.json` references throughout CLI commands and help text
  - Commands updated: `setup`, `alias`, `run`, `init-module`
  - Editor integrations updated: Neovim LSP, VS Code Language Server
  - Backward compatibility maintained: LSP and editor tooling check for old `mlld.lock.json` as fallback
  - All commands now use `ProjectConfig` abstraction

## [2.0.0-rc58]

### Fixed
- **Foreach with structured values**: `foreach` now unwraps StructuredValue arguments
  - Previously failed with "got structured text" when array came from pipeline
  - Example: `/var @chunked = @data | @chunk(2)` then `foreach @process(@chunked)` now works
  - Aligns with JavaScript stages which already unwrap automatically

## [2.0.0-rc57]

### Added
- **MCP server**: `mlld mcp` serves exported `/exe` functions as MCP tools
  - Exposes functions over JSON-RPC stdio transport
  - Default discovery: `llm/mcp/` directory when no path specified
  - Config modules: `--config module.mld.md` exports `@config = { tools?, env? }`
  - Environment overrides: `--env KEY=VAL` (MLLD_ prefix required)
  - Tool filtering: `--tools tool1,tool2` or via config
  - Duplicate tool names halt with error showing conflicting sources
  - Example: `/exe @greet(name) = js { return \`Hello ${name}\`; }` becomes `greet` tool

### Changed
- **Data flow between stages**: Native types preserved throughout pipelines
  - Loaders return parsed data: `<data.json>` yields object, not JSON string
  - Pipeline stages pass arrays/objects directly: `@data | @process` receives native type
  - JavaScript functions receive parsed values without `JSON.parse()`
  - Templates and output convert to text automatically
  - Fixes #435 

### Breaking
- Remove `JSON.parse()` calls in JavaScript stages - will fail on already-parsed data
- Use `.text` to access stringified data, `.data` to get structured data in string context 
- Pipelines expecting JSON strings will receive objects/arrays instead

## [2.0.0-rc56]

### Added
- **Import Types System**: Control how modules and resources are resolved
  - `module` imports: Pre-installed registry modules (offline after install)
  - `static` imports: Content embedded at parse time (zero runtime cost)
  - `live` imports: Always fresh data (fetched every execution)
  - `cached(TTL)` imports: Smart caching with time limits (5m, 1h, 7d, etc.)
  - `local` imports: Direct access to development modules in `llm/modules/`
  - Example: `/import module { api } from @corp/tools`, `/import cached(1h) <https://api.example.com> as @data`

- **Module management**:
  - `mlld install @author/module`: Install modules from public registry
  - `mlld update`: Update modules to latest compatible versions
  - `mlld outdated`: Check for available updates
  - `mlld ls`: View installed modules with status and sizes
  - Registry integration with CDN-distributed module catalog

- **Configuration Files**:
  - `mlld-config.json`: Your project settings (dependencies, preferences)
  - `mlld-lock.json`: Auto-generated locks (versions, hashes, sources)

- **Simplified Development Workflow**:
  - Use `/import local { helper } from @author/module` to access modules in `llm/modules/` using published name (if you are @author or can publish to private @author registry)
  - Useful for iterating on modules before publishing

### Changed
- Import syntax now requires `@` prefix on imported names: `/import { @helper } from module`
- Module publishing requires explicit `/export { ... }` manifests
- Import failures now stop execution (exit code 1) instead of continuing
- Smart import type inference based on source patterns
- Pipelines support leading `||` operator for immediate parallel execution: `/var @result = || @a() || @b() || @c()` runs all three functions concurrently
- Leading parallel syntax works in `/var`, `/run`, and `/exe` definitions
- Pipeline concurrency controls: `(n, wait)` shorthand syntax and `with { parallel: n, delay: wait }` for caps and pacing

### Fixed
- Module installation fetches from real registry instead of placeholders
- Version resolution respects "latest" tags and semantic versioning
- Module integrity verified with SHA-256 hashes

## [2.0.0-rc55]

### Added
- Stdin support for `/run` directive and `/exe` definitions:
  - New syntax: `/run { command } with { stdin: @variable }` passes data directly via stdin without shell escaping
  - Pipe sugar: `/run @data | { command }` normalizes to `with { stdin: @data }` for cleaner syntax
  - Works in executable definitions: `/exe @func(data) = run { command } with { stdin: @data }`
  - Pipe sugar in executables: `/exe @func(data) = run @data | { command }`
  - Eliminates JSON double-stringification when passing structured data to commands like `jq`, `cat`, etc.
  - Preserves shell safety while enabling proper JSON/CSV/XML data flow through pipelines

- JSON data access pattern for JavaScript functions (addresses #428):
  - `.data` and `.json` accessors parse JSON strings during variable evaluation before passing to functions
  - `.text` and `.content` accessors preserve original string content
  - Eliminates need for manual `JSON.parse()` calls in JavaScript functions
  - Works consistently across files, variables, and command output
  - Example: `/var @json = '{"items": []}'; /run @process(@json.data)` passes parsed array to function

- Native mlld functions in pipelines:
  - `/exe` functions using `for` and `foreach` constructs now work as pipeline stages
  - Fixes "Unsupported code language: mlld-foreach" errors
  - Enables seamless composition: `/var @result = @data.data | @filterNative | @transformJS | @json`
  - Mixed pipelines with native mlld, JavaScript, and shell commands all work together

## [2.0.0-rc54]
### Added
- Expose structured module dependency resolution with `ModuleInstaller.resolveDependencies` so CLI flows reuse aggregated metadata.
- Add dependency summaries across install/update/outdated/info commands via shared helper, with optional dev-dependency inclusion.
- Introduce `cli/utils/dependency-summary.ts` to normalize runtime/tool/package output and conflict warnings.
### Changed
- Cache modules with structured needs/dependency metadata to avoid re-parsing frontmatter.
- `ResolverManager` persists structured metadata when fetching modules, enabling downstream analysis.


### Added
- Directive execution guard suppresses `/run`, `/output`, and `/show` while modules import, eliminating unintended side effects.
- Imported executables and templates now capture their module environment so command references resolve sibling functions consistently.
- Registry module imports now enforce `mlld.lock` versions, failing fast on mismatches while remaining backward-compatible with legacy lock entries.
- Explicit `/export { ... }` manifests for modules: grammar, AST, evaluation, and import pipeline honour declared bindings while falling back to auto-export for manifest-less files.
- Import collision protection surfaces `IMPORT_NAME_CONFLICT` with precise locations when multiple directives bind the same name, covering both namespace and selective imports.
- End-to-end fixture ensures exported shadow-environment helpers retain access to nested helpers and mlld functions across module boundaries.
- Inline template loops: `/for … /end` inside templates
  - Supported in backticks and `::…::` templates; line-start only for both `/for` and `/end` within the template body
  - Not supported in `:::…:::` or `[[…]]` templates
  - Interpreter uses existing TemplateForBlock evaluation; no changes to runtime semantics outside template contexts
- AST selectors in alligator expressions `<file.ext { methodName (variable) }>` covering JavaScript, TypeScript, Python, Go, Rust, Ruby, Java, C#, Solidity, C, and C++.

### Fixed
- Foreach templates now keep long numeric strings intact during interpolation
- Command-reference executables now preserve array and object types when passing arguments to nested functions (previously JSON.stringify'd them)
- Imported arrays preserve array behaviour after module import, so `.length` and `/for` iteration no longer fail after crossing module boundaries
- Triple-colon template exports keep their template metadata, rendering `{{ }}` placeholders and leaving `<@...>` markers unaltered when imported
- JavaScript `@` syntax misuse surfaces the educational guidance even when V8 reports "Unexpected token", keeping the fix-it copy visible
- Regression fixtures cover imported arrays, triple-colon imports, triple alligator literals, and JS `@` misuse to prevent regressions

## [2.0.0-rc53]
### Fixed
- Large integers were getting wrongly rounded by js auto-parsing

## [2.0.0-rc52]
### Fixed
- `::: {{var}} :::` template syntax had issues with <alligators>. 

## [2.0.0-rc51]
### Fixed
- Language Server transport defaults to stdio when no explicit flag is provided
  - Prevents Neovim startup error: "Connection input stream is not set"
  - Preserves VS Code behavior when it passes `--stdio` (or other transports)

## [2.0.0-rc50]
### Added
- **`mlld nvim-setup` command**: Auto-configure Neovim LSP support
  - Detects Neovim setup (LazyVim, vanilla, etc.) and creates appropriate config
  - Cross-platform: uses `where` on Windows, `which` on Unix
  - Alias: `mlld nvim` for convenience

- **LSP/Editor updates**: Semantic tokens cover pipeline parallel groups (`||`), with.pipeline (incl. nested) and `with { format: ... }`, and `/for parallel`; directive/completion tweaks include `/log` and format values. VS Code extension runs semantic-only (legacy providers removed); fallback TextMate grammar highlights `parallel` and `format`.

- Expression system completeness:
  - when-expressions usable in `/var` assignments, array literals, and function arguments
  - `when` allowed in `for` collection RHS; `none => skip` filters non-matches
  - `foreach` allowed in `/exe` RHS; executable foreach callable like any other function
  - `/show foreach @func(@arrays)` with `with { separator, template }` formatting options
### Fixed
- #411: Nested `/for` collection returns `[]` for empty arrays in both plain `/show` and when piped to `@json`. Removes accidental `{}` output.
- `isLoadContentResultArray` does not match untagged empty arrays; prevents misclassification of generic empty arrays.

## [2.0.0-rc49]
### Added
- **Pipeline parallel groups**: `A || B || C` executes commands concurrently as a single stage
  - With-clause parity: nested arrays represent a parallel group (e.g., `with { pipeline: [ [@left, @right], @combine ] }`)
  - Concurrency capped by `MLLD_PARALLEL_LIMIT` (default `4`); results preserve declaration order and flow to the next stage as a JSON array string
- **Rate-limit resilience in pipelines**: 429/"rate limit" errors trigger exponential backoff with bounded retries per stage
- **Unified effect attachment**: Single helper attaches inline builtin effects (show/log/output) to preceding stages and to each branch of parallel groups
- **/for parallel execution**: Parallel iteration with optional cap and pacing
  - Default cap from `MLLD_PARALLEL_LIMIT`; override per loop: `/for 3 parallel @x in @items => ...`
  - Optional pacing between starts: `/for (3, 1s) parallel @x in @items => ...` (units: ms, s, m, h)
  - Directive form streams effects as iterations complete; collection form preserves input order in results

### Fixed
- **Retry in parallel groups**: Returning `retry` from within a parallel group rejects with a clear error (retry is unsupported inside the group)
- **Parallel limit hardening**: `MLLD_PARALLEL_LIMIT` parsing clamps invalid/low values to defaults; limit is read per execution to respect environment overrides

### Documentation
- Updated developer docs for parallel execution: shorthand `||` rule (no leading `||`), with-clause nested group syntax, effect behavior on groups, and references to tests
- Updated iterator docs to include `/for parallel` with cap overrides and pacing; clarified iterator vs pipeline parallelism and rate-limit behavior

## [2.0.0-rc48]
### Added
- **Large variable support for bash/shell executors**: Automatic handling of variables exceeding Node.js environment limits
  - Shell mode (`/run sh {...}`) automatically injects large variables directly into scripts, bypassing Node's ~128KB limit
  - Works transparently - use `$varname` as usual, mlld handles the injection method based on size
  - Enabled by default via `MLLD_BASH_HEREDOC` (can be disabled if needed)
  - Configurable threshold via `MLLD_MAX_BASH_ENV_VAR_SIZE` (default: 131072 bytes)

### Fixed
- **E2BIG errors with large data**: Fixed Node.js throwing errors when passing large variables to shell commands
  - Common when loading entire codebases: `<**/*.js>`, `<**/*.sol>`, etc.
  - Affects audit workflows processing multiple files simultaneously
  - Simple `/run {...}` commands now provide helpful error messages suggesting shell mode

### Documentation
- Updated large variables documentation with clearer, more accessible language
- Removed unnecessary configuration details since feature is enabled by default
- Added explanation of why shell mode works (direct script injection vs environment passing)

## [2.0.0-rc47]
### Added
- e2e tests for method chaining and templates
- Deprecation tracker and DeprecationError
- Deprecation notice for array dot notation

### Changed
- Interpolation precedence for quotes/templates

### Fixed
- Post-field/index on execs across contexts
- Tail pipeline on builtin methods
- Template method calls

## [2.0.0-rc46]
### Fixed
- **Method calls in when conditions**: Fixed grammar bug preventing method calls on function results in `/when` and `/exe...when` conditions
- **CommendRef interpolation issue**: Fixed grammar bug preventing full interpolation of values inside quotes/templates inside executables

## [2.0.0-rc45]
### Added
- **Builtin methods for arrays and strings**: Common JavaScript methods available on variables
  - Array methods: `.includes(value)`, `.indexOf(value)`, `.length()`, `.join(separator)`
  - String methods: `.includes(substring)`, `.indexOf(substring)`, `.length()`, `.toLowerCase()`, `.toUpperCase()`, `.trim()`, `.startsWith(prefix)`, `.endsWith(suffix)`, `.split(separator)`
  - Methods work with both literal and variable arguments: `@list.includes("item")` or `@list.includes(@search)`
  - Implemented as field access exec patterns, treated as ExecInvocations internally
  - Example: `/show @fruits.includes("banana")` returns `true` if the array contains "banana"
  - Eliminates need for JavaScript wrappers for common operations
- **External template file support**: `.att` and `.mtt`
  - `.att` (at template): interpolates `@vars` and `<file.md>` references
  - `.mtt` (mustache template): interpolates `{{vars}}` (simple mustache‑style)
  - Define as executables: `/exe @name(params) = template "path/to/file.att|.mtt"`
  - Invoke with arguments: `/show @name("val1", "val2")`
- **Testing improvements**: 
  - Basic documentation tests to ensure published docs have valid syntax
  - Performance test suite

### Changed
- `/import` no longer accepts `.att`/`.mtt`. Importing these files emits an educational error with the proper usage example (use `/exe ... = template "path"`).

### Fixed
- **Incorrect docs:** Corrected errant syntax in docs, added testing infrastructure for ensuring published docs' syntax is always valid.
- **when-expression `none` condition evaluation**: Fixed bug where variable assignments prevented `none` conditions from executing
  - Variable assignments (`@var = value`) in when expressions are now correctly treated as side effects, not return values, enabling the `none` condition to execute when no value-producing actions match (e.g., `show`, function calls, `retry`). Most importantly, conditions that only assign variables no longer prevent `none` from executing when later conditions don't match
- **Triple-colon template interpolation in executables (#379)**: Fixed bug where triple-colon templates with `{{var}}` syntax weren't being interpolated when passed as arguments to executable functions
- **Undefined variable syntax preservation**: Fixed bug where undefined variables in triple-colon templates incorrectly displayed as `@varname` instead of preserving the original `{{varname}}` syntax
- **Parser incorrectly matching variables in plain text**: Fixed 3+ month old bug where `{{var}}` syntax was being parsed as variable references in plain text/markdown content

## [2.0.0-rc44]
### Fixed
- when-expression in `/exe`: local assignments now visible to subsequent actions; conditions evaluate against accumulated env.
- Effect streaming restored for when-actions; `show` tagged and handled pipeline-aware to avoid unintended echoes at stage end.
- Pipeline retries with `show` in stage: preserve attempt output and continue by forwarding prior input; final stage suppresses echo.
- `/run` output handling hardened: always stringified before newline; mlld-when returns unwrap tagged `show` for expected echo.

### Tests
- Add fixture verifying local assignment visibility within `/exe` when-expressions.

## [2.0.0-rc43]
### Added
- **`--allow-absolute` flag**: Override project root restrictions for file access
  - Permits loading files from absolute paths outside project directory
  - Applies to `<file>` syntax, `/path` directives, and `/import` statements
  - Security opt-in: default behavior maintains project root isolation
  - Persists in `mlld.lock.json` under `security.allowAbsolutePaths` when configured

## [2.0.0-rc42]
### Fixed
- **Removed command timeout restrictions for LLM workflows**: Completely removed 30-second timeout limits from all command executors
  - LLM commands can now run as long as needed without timing out
  - Previously, commands would silently fail after 30 seconds, causing issues with large prompts or complex reasoning tasks
  - Affects all shell commands, JavaScript execution, and Node.js subprocess execution

## [2.0.0-rc41]
### Fixed
- **CLI markdown streaming and document output**: Fixed effects system to properly handle markdown content in CLI output (#342)
  - CLI now displays markdown content progressively during execution (streaming mode)
  - `/output "file.md"` directive correctly outputs complete document including both markdown and directive results
  - Markdown content from mlld files is now included in CLI output alongside directive results
  - Updated test expectations to reflect correct behavior with preserved newlines from markdown content
  - Added basic architectural docs for effects system

## [2.0.0-rc40]
### Added
- **`/log` directive support in action contexts**: Extended `/log` to work in for loops and when blocks
  - `/for @item in @items => log @item` - Log each item during iteration
  - `/when [ condition => log "message" ]` - Log in when block actions
  - Produces identical output to `/output to stdout` with cleaner syntax
  - Grammar implementation follows DRY principles using existing OutputSource patterns

- **Pipeline inline effects**: Builtins `| log`, `| output`, and `| show` work as inline effects
  - Attach to preceding functional stage, re-run on each retry attempt
  - `log` outputs to stderr, `output` to files/streams/env, `show` to document
  - `output to file` resolves `@base/...` and relative paths from project root

- **Pipeline context variables**: New `@ctx` and `@p`/`@pipeline` variables in pipelines
  - `@ctx`: Lightweight per-stage context with `try`, `tries`, `stage`, `input`, `hint`, `lastOutput`, `isPipeline`
  - `@p`/`@pipeline`: Array-like outputs with positive/negative indexing, `@p[-1]` gets latest output
  - `@p.retries.all` provides full retry history for audit trails

- **Retry hints**: The `retry` action can now carry hints to the next attempt
  - String hints: `retry "need more detail"`
  - Object hints: `retry { temperature: 0.8 }`
  - Function hints: `retry @somefunc(@input)`
  - Access via `@ctx.hint` in the retried stage

- **Effect architecture**: Complete overhaul of how side effects (show, output, log directives) are handled
  - New EffectHandler system for managing output operations
  - Immediate effect execution in for loops and when blocks
  - Effects in exe+when blocks called from for expressions now execute immediately
  - Progress messages appear in real-time during long-running operations

- **Automatic JSON parsing**: Shell commands returning JSON are now automatically parsed into objects/arrays
  - Eliminates need for manual `JSON.parse()` calls when working with APIs and JSON-returning commands
  - Configurable via `MLLD_AUTO_PARSE_JSON` environment variable (defaults to enabled)

- **Shell alias resolution**: Automatic resolution of shell aliases in command execution
  - Commands like `claude`, `ll`, `la` now work in mlld scripts when defined as shell aliases
  - Configurable via `MLLD_RESOLVE_ALIASES` environment variable (defaults to enabled)
  - Debug output available with `MLLD_DEBUG_ALIASES=true` to see alias resolution in action

- **Fixed `none` keyword in when expressions**: Corrected bug where `none` was always executing
  - The `none` keyword now properly executes only when no other conditions match
  - Affects when expressions used in `/exe` functions (e.g., `/exe @func() = when [...]`)
  - Side effects in when expressions now work correctly without duplication

### Fixed
- **Grammar ordering for `/when` bare blocks**: Fixed PEG parser ordering issue preventing bare `/when [...]` blocks from working
  - `/when [ condition => action ]` now works correctly with all action types including `log`
  
- **`/show` directive in for loops**: Fixed `/show` not working properly in for loops
  - Show directives now emit output immediately during iteration
  
- **Field access in `/output` directive grammar**: Fixed field access bug when outputting object fields
  - `/output @data.field to "file.txt"` now correctly outputs just the field value

- **LoadContentResult metadata preservation**: Auto-unwrap shelf preserves metadata across JS transforms
  - Files loaded with `<file.md>` retain their metadata properties after JS transformations
  - #362: field access for special variables (@input, @ctx)

### Internal
- **AST-based `@base` handling**: Now properly resolved for file I/O and show paths
- **Stage numbering**: Stages are 1-indexed and count only functional transforms (builtins don't create stages)

## [2.0.0-rc39]
### Added
- **`/log` directive**: New syntactic sugar for `/output to stdout` for more concise console output (#357)

### Fixed
- **When expression behavior**: Bare `when` expressions now correctly evaluate ALL matching conditions
  - Previously, `when [...]` in `/exe` functions incorrectly stopped at the first match (switch-like behavior)
  - Now properly evaluates all conditions and returns the last matching value
  - Added support for `when first [...]` modifier for explicit switch-case semantics
  - Fixed doubled output from `/show` directives in for loops with when expressions
  - Side effects (show, output directives) inside when expressions now execute correctly
- **Field access in /output directive source**: Fixed field access not working when outputting object fields
  - `/output @data.content to "file.txt"` now correctly outputs just the field value, not the entire object

### Changed
- **No longer supporting `/` on RHS**: 
  - Previously mlld allowed slashes in directives on the right side (`=> /show` or `= /run` etc)
  - Removed to emphasize the `/` is purposeful meaning "start of line interpreted as mlld"
  - Now if you use `/` on RHS, you get an educational error explaining the `/` is only for start of line
- **When expression semantics**: Clear distinction between bare `when` and `when first`
  - `when [...]` - Evaluates ALL matching conditions, returns last value
  - `when first [...]` - Stops at first match (classic switch behavior)
  - Updated 11 test files that expected switch-like behavior to use `when first`
  - Grammar now properly supports `when first` modifier in `/exe` expressions

### Added
- **None keyword for /when blocks**: New `none` keyword that matches when no other conditions have matched
  - Provides semantic fallback: `/when [ @x > 5 => show "high", none => show "default" ]`
  - Multiple `none` conditions allowed at end of block: all execute in bare `/when`, first executes in `/when first`
  - Works in `/exe` when expressions: `/exe @handler() = when: [ @valid => @value, none => "fallback" ]`
  - Must appear as the last condition(s) in a when block (validated at parse time)
  - Cannot appear after wildcard `*` (would be unreachable)
  - Clearer than using `*` or complex negations like `!(@a || @b || @c)`
- **Test coverage for when expressions**: New test demonstrating bare `when` evaluates all conditions
  - `tests/cases/valid/slash/when/exe-when-all-matches/` shows the difference between `when` and `when first`

## [2.0.0-rc38]
### Added
- Error enhancement system for JS errors

### Fixed
- For loop bugs / missing implementation details

## [2.0.0-rc37]

### Added
- **Nested For Loops**: The `/for` directive now supports nesting for multi-dimensional iteration
  - Nest multiple for loops: `/for @x in @outer => for @y in @inner => show "@x-@y"`
  - Unlimited nesting depth: Can chain any number of for loops together
  - Each nested loop maintains its own scope with access to parent variables
  - Works with all for loop features: arrays, objects (with `_key` access), and expressions
  - Example triple nesting: `/for @x in ["A", "B"] => for @y in [1, 2] => for @z in ["X", "Y"] => show "@x-@y-@z"`
  - Enables complex iteration patterns for data processing and code review automation

### Fixed
- **Array Literal Evaluation**: Fixed interpreter to properly handle array literal nodes from grammar
  - Objects with `type: 'array'` from the grammar are now correctly evaluated as arrays
  - Enables literal arrays in for loops: `/for @x in [1, 2, 3]` now works properly

## [2.0.0-rc36] 

### Added
- **Array Slice Operations**: Native array slicing syntax for extracting subsets of arrays
  - Basic slicing: `@array[0:5]` extracts items from index 0 to 5 (exclusive)
  - Negative indices: `@array[-3:]` gets last 3 items, `@array[:-1]` gets all except last
  - Open-ended slices: `@array[2:]` from index 2 to end, `@array[:3]` from start to index 3
  - Works with all array types including LoadContentResult arrays from glob patterns
  - Preserves metadata through slice operations (e.g., `<*.md>[0:5]` maintains file metadata)
  - Grammar foundation laid for future filter operations (`@array[?field>value]` syntax reserved)

### Fixed
- **Shell Command Validation**: Replaced buggy regex-based shell operator detection with proper `shell-quote` library
  - Fixed false positives where legitimate `>` characters in content were incorrectly flagged as dangerous redirects
  - Pipes (`|`) continue to work correctly for command chaining
  - Removed overly restrictive blocking of redirect operators (`>`, `>>`, `<`) since they only affect local files
  - Dangerous operators (`&&`, `||`, `;`, `&`) remain blocked to prevent command injection and zombie processes
  - Improved error messages now show the rejected command and suggest using `/run sh { ... }` for less restrictive execution
  - Resolves issues with multiline content containing angle brackets being rejected

## [2.0.0-rc35]

### Added
- **Pipeline Context Variable**: The `@pipeline` context variable provides access to pipeline execution state
  - Array indexing: `@pipeline[0]` (pipeline input), `@pipeline[1]` (first stage output), `@pipeline[-1]` (previous stage output)
  - Retry tracking: `@pipeline.try` increments with each retry attempt (starts at 1)
  - Stage information: `@pipeline.stage` shows current pipeline stage number
  - Output history: `@pipeline.length` indicates number of completed stages
  - Attempt history: `@pipeline.tries` array contains all retry attempts for current stage

- **Pipeline Retry Mechanism**: The `retry` keyword enables automatic re-execution of pipeline stages
  - Return `retry` from functions to re-execute the previous pipeline stage
  - Access attempt number via `@pipeline.try` (starts at 1, increments with each retry)
  - Guard retries with conditions to prevent infinite loops: `@pipeline.try < 3 => retry`
  - All retry attempts stored in `@pipeline.tries` array for best-of-N selection patterns
  - Each retry context limited to 10 attempts, with global limit of 20 retries per stage
  - Works seamlessly with `/exe` functions using `when` expressions for validation logic
  - Example: `/exe @validate() = when: [@isValid(@_) => @_, @pipeline.try < 3 => retry, * => null]`
  - Simplified architecture: Only the immediately previous stage can be retried (no nested retries)

- **Issue #342 – Pipeline whitespace and stacked pipes**:
  - Outside templates/quotes, pipelines now support spaced and multi-line stacked forms for variables and `<file>` values
  - Inside templates/quotes/interpolation, condensed-only `|@transform` remains supported adjacent to the value
  - Node-level attachment: pipelines attach to the value node (variable or load-content), not directive tail
  - Added fixtures under `tests/cases/valid/feat/pipeline/*`; updated grammar unit tests accordingly
  - Optional-whitespace pipelines outside templates now support full arguments via `CommandArgumentList` (objects, arrays, nested execs, and variable field access like `@var.field`)
  - Introduced dedicated TemplatePipe (no-args) for template contexts; template pipes do not accept arguments to avoid ambiguity
  - Internal grammar cleanup: consolidated non-template pipe handling under the optional-whitespace form; condensed-pipe pattern retained only for template interpolation

- **When/Exe syntax improvements**:
  - Optional colon support for `/when` block and match forms, and for `/exe` RHS when expressions
    - `when [ ... ]` works alongside `when: [ ... ]` (backward compatible)
  - Grammar support for switch-style `/exe` when-expression modifier: `/exe @fn() = when first [ ... ]`
    - Modifier is parsed and attached to `WhenExpression.meta.modifier`
    - Interpreter behavior for `first` in exe when-expressions will land in the next release

### Fixed
- **Pipeline State Management**: Enhanced state tracking across pipeline stages with proper attempt counting and history preservation
- **Issue #341 - `/exe...when` RHS Actions**: `/exe` functions with `when:` expressions now support all `/when` RHS actions (show, variable assignment, output, function calls) with local variable semantics
- **Removed `/var...when`**: Eliminated redundant feature in favor of more capable `/exe...when` 
- **Unified Template/Quote Grammar**: Consolidated duplicate grammar patterns
- **Prohibited Implicit Executables in `/when` RHS**: Removed ability to define executables within when actions for cleaner separation
- **Field access in with-clause pipeline arguments**: Fixed evaluation of field access (e.g., `@p.try`) in `with { pipeline: [...] }` arguments by using multi-field access resolution; resolves "Unknown field access type: undefined" during pipeline execution
- **LoadContentResult metadata preservation in pipelines**: Metadata (filename, frontmatter, etc.) now automatically preserved when LoadContentResult objects pass through JavaScript transformations in pipelines
  - Single files: Auto-reattachment of metadata to transformed content
  - Arrays: Exact content matching restores metadata where possible
  - Transparent to JS functions - they receive content strings as before
  - Enables patterns like `<file.md> | @transform` where `@transform` result still has `.filename` property available

## [2.0.0-rc34]

### Added
- **Array Index Support in For Loops**: The `_key` pattern
now provides array indices when iterating over arrays
  - Arrays provide their indices as keys: `0`, `1`, `2`, etc.
  - Example: `/for @item in ["a", "b", "c"] => /show
"@item_key: @item"` outputs `0: a`, `1: b`, `2: c`
  - Objects continue to provide property names as keys
  - Enables consistent key access patterns across all
collection types

- **Dot Escape Sequence**: Added `\.` to escape sequences for
  literal dots in strings
  - Disambiguates between field access and string
concatenation
  - `@variable.field` - attempts to access the `field`
property
  - `@variable\.txt` - produces the string value followed by
`.txt`
  - Works in all string contexts: double quotes, backticks,
and templates
  - Example: `/output @content to "file-@num\.txt"` creates
`file-42.txt`

- **Metadata Shelf for Alligator Arrays**: Preserves LoadContentResult metadata when arrays pass through JavaScript functions
  - When `<*.md>` arrays are passed to JS functions like `slice()`, metadata (filename, frontmatter, etc.) is preserved
  - Enables patterns like: `/var @subset = @slice(@files, 0, 5)` followed by `/for @file in @subset => /show @file.filename`
  - Transparent to JS functions - they receive content strings as before
  - Fixes issue where `@file.filename` would fail after JS array operations

### Fixed
- **Missing Slash in For Actions**: Fixed syntax error on
line 18 of `llm/run/testing.mld` where `/show` was missing
its slash prefix

- **LoadContentResult Preservation in For Loops**: For loops now properly preserve LoadContentResult objects
  - `@file` in `/for @file in <*.md>` maintains its properties (filename, content, fm, etc.)
  - Field access like `@file.filename` works correctly in all for loop contexts

## [2.0.0-rc33]

### Added
- **Wildcard (*) Literal**: New wildcard literal that always evaluates to true in conditional contexts -- specifically useful as a catch-all in a multiple condition /when sequence in order to be more immediately understandable than '/when... true' 
  - Basic usage: `/when * => /show "Always executes"`
  - Default handler in when blocks: `/when [@condition => action, * => "default"]`
  - Catch-all pattern in exe functions: `/exe @handler() = when: [* => "default response"]`
  - Works with logical operators: `/when * && @check => action`
  - Evaluates to true in ternary expressions: `/var @result = * ? "yes" : "no"`
  - Follows Unix glob convention where `*` means "match anything"

### Fixed
- **Template Variable References**: Fixed parsing bug where tail modifier keywords (`with`, `pipeline`, `needs`, `as`, `trust`) were incorrectly interpreted inside template contexts
  - Created separate `TemplateVariableReference` pattern for template interpolation that doesn't check for tail modifiers
  - Keywords like "with" can now appear as literal text after variables in templates
  - Fixes: `/exe @claude(prompt,tools) = `@prompt with @tools`` now parses correctly
  - Affects backtick templates, double-colon templates, and double-quoted strings
  - Template variables should never have tail modifiers - those constructs only make sense in command contexts

- **Shell Escaping in /for Loops**: Fixed shell command escaping issues when iterating over arrays with special characters
  - Loop variables are now properly quoted when used in shell commands
  - Handles filenames with spaces, quotes, and other special characters correctly
  - Example: `/for @file in <*.md> => /run echo "@file"` now works with "file with spaces.md"

- **Nested Function Execution**: Fixed execution of nested functions in imported modules
  - Functions like `@module.category.function()` now execute correctly instead of returning string representations
  - Deeply nested module exports are now properly resolved as executable functions
  - Affects complex module structures with multiple levels of organization

## [2.0.0-rc32]

### Added
- **For Loop Iteration**: New `/for` directive for iteration over arrays and objects
  - Output form: `/for @item in @collection => action` - Executes action for each item
  - Collection form: `/var @results = for @item in @collection => expression` - Collects results into array
  - Array iteration: `/for @item in ["a", "b", "c"] => /show @item`
  - Object iteration: `/for @value in {"x": 1, "y": 2} => /show @value` 
  - Object key access: `@value_key` pattern provides access to keys when iterating objects
  - Works with all iterable values including globs: `/for @file in <*.md> => /show @file.filename`
  - Preserves variable type information throughout iteration for consistent behavior
  - Semantic token support in LSP for syntax highlighting
  - Compatible with pipelines and transformations

## [2.0.0-rc31]

### Added
- **Enhanced error display with source context**: Errors now show the exact source location with surrounding context and a visual pointer
  - Compiler-style error messages with line numbers and caret indicators pointing to the precise error location

- **Improved Error Pattern System**: Complete refactor of parse error enhancement for better performance and maintainability
  - Patterns are now pure functions that extract variables (no imports allowed)
  - Templates use `${VARIABLE}` placeholders for dynamic error messages
  - Build-time compilation: All patterns compile into single `parse-errors.generated.js` file
  - Convention-over-configuration pair of `pattern.js`, `error.md`, and `example.md` 
  - Build integration: `npm run build:errors` compiles all patterns

- **LSP Semantic Tokens Support**: Full semantic highlighting via Language Server Protocol
  - Context-aware highlighting for all template types (backtick, double-colon, triple-colon)
  - Proper interpolation detection based on template context (@var vs {{var}})
  - Command content interpolation with @variable support
  - Field access and array indexing highlighting (@user.profile.name, @items[0])
  - Embedded language region marking for editor syntax injection
  - Mixed array/object support - highlights mlld constructs within data structures
  - Operator highlighting for logical (&&, ||, !), comparison (==, !=, <, >), and ternary (? :)
  - Error recovery and graceful handling of partial ASTs
  - Performance optimizations with text caching
  - Available in VSCode and any LSP-compatible editor (Neovim, etc.)

- **Enhanced LSP Error Reporting**: Precise error locations and improved error messages
  - Errors now use exact start/end positions from parser's mlldErrorLocation data
  - Full-line highlighting when errors occur at the beginning of a line
  - Multi-line error messages display with proper formatting in VSCode
  - Parser error messages can be edited directly in the grammar files
  - Example error messages include all valid syntax patterns

## [2.0.0-rc30]

This release allows mlld to function as a logical router

### Added
- **Logical and Comparison Operators in Expressions**
  - New operators for `/var` assignments and `/when` conditions: `&&`, `||`, `==`, `!=`, `!`, `?`, `:`
  - Expression parsing with proper operator precedence: `@a && @b || @c` parses as `((@a && @b) || @c)`
  - Ternary conditional expressions: `/var @result = @test ? @trueVal : @falseVal`
  - Binary expressions with comparison: `/var @isEqual = @x == @y`, `/var @different = @a != @b`
  - Unary negation: `/var @opposite = !@condition`
  - Parentheses for explicit precedence: `/var @complex = (@a || @b) && (@c != @d)`
  - Full expression support in when conditions: `/when @tokens > 1000 && @mode == "production" => /show "High usage detected"`
  - Short-circuit evaluation: `&&` and `||` operators properly short-circuit for performance
  - Type coercion following mlld semantics: `"true" == true` → true, `null == undefined` → true
  - Comparison operators: `<`, `>`, `<=`, `>=` for numeric comparisons

- **Implicit When Actions**
  - Simplified syntax within `/when` blocks - directive prefix is now optional
  - Variable assignments: `/when @prod => @config = "production"` (no `/var` needed)
  - Function calls: `/when @ready => @setupDatabase()` (no `/run` needed)
  - Exec assignments: `/when @processing => @transform() = @processData(@input)` (no `/exe` needed)
  - Mixed implicit/explicit actions in blocks: `/when @cond => [@x = "value", /var @y = "other"]`

- **RHS When Expressions (Value-Returning)**
  - When expressions as values in `/var` assignments: `/var @greeting = when: [@time < 12 => "Good morning", @time < 18 => "Good afternoon", true => "Good evening"]`
  - When expressions in `/exe` definitions: `/exe @processData(type, data) = when: [@type == "json" => @jsonProcessor(@data), @type == "xml" => @xmlProcessor(@data), true => @genericProcessor(@data)]`
  - First-match semantics - returns the first matching condition's value
  - Returns `null` when no conditions match
  - Lazy evaluation in variables - re-evaluates on each access
  - Pipeline support: `/var @result = when: [...] | @uppercase`

- **Enhanced String Interpolation**
  - Fixed file reference interpolation in double-quoted strings: `"Content from <file.md> here"`
  - Consistent handling of both `@variable` and `<file.md>` interpolation patterns
  - Proper support for `wrapperType: 'doubleQuote'` in interpreter evaluation
  - Safety checks prevent empty value arrays from causing "missing value" errors

### Changed
- **Hybrid console.log behavior in JavaScript execution**
  - `console.log()` now always outputs to stdout for debugging visibility
  - When a function has an explicit return value, that value is stored in the variable
  - When a function has no return value but uses console.log, the console output becomes the result (backward compatibility)
  - This approach maintains compatibility with existing tests while providing better debugging experience
  - Example: `js { console.log("debug"); return "result" }` shows "debug" on stdout and stores "result"
  - Example: `js { console.log("output") }` shows "output" on stdout AND stores "output" as the result

### Fixed
- **Grammar and Parser Improvements**
  - Fixed CommandReference type mismatches between grammar output and TypeScript expectations
  - Added translation layer in evaluators to handle both legacy and new AST formats
  - Improved error recovery and backward compatibility for when directive patterns
  
- **Test Infrastructure Stability**
  - Updated test expectations to align with new console.log behavior
  - Fixed test cases that relied on specific output formatting
  - Resolved shadow environment test issues with variable interpolation in literal strings

## [2.0.0-rc28]

### Fixed
- **ImportResolver PathContext issue in ephemeral mode**
  - Fixed TypeError when running mlld scripts via `npx mlldx@latest` with local file paths
  - ImportResolver was not receiving PathContext when Environment.setEphemeralMode() recreated it
  - Ephemeral mode now properly passes PathContext to ImportResolver constructor
  - Enables relative imports to work correctly in ephemeral/CI environments

- **Double-colon syntax (`::...::`) now properly handles colons in content**
  - Fixed parser incorrectly terminating on single colons (`:`) inside double-colon templates
  - Grammar fix in `DoubleColonTextSegment` changed from `![:@<]` to `!("::" / "@" / "<")`
  - Affects all uses of double-colon syntax: `/var`, `/exe`, `/show`, data objects, etc.
  - Now correctly handles URLs (`https://example.com`), times (`3:30`), ratios (`16:9`), and other colon-containing content
  - Double-colon syntax works as complete alternative to backticks for templates with `@var` interpolation
  - Triple-colon syntax `:::...:::` continues to support `{{var}}` interpolation

### Changed
- **Renamed WhenSwitchForm to WhenMatchForm**
  - Grammar and types now use "WhenMatchForm" for the `/when @var: [...]` syntax
  - More accurate naming - this form executes actions for all matching conditions, not just the first
  - Updated subtype from `whenSwitch` to `whenMatch` throughout codebase for more accurate reflection of functionality

## [2.0.0-rc27]

### Added
- **Registry Direct Publishing for Module Updates**
  - Module owners can now publish updates directly without PR review
  - First module publish still requires PR for quality control
  - Automatic PR detection prevents duplicate submissions
  - Interactive version bump when conflicts occur
  - Auto-grant publish rights after first module is merged
  - API service live at registry-api.mlld.org for direct publishing

- **Version and Tag Support for Registry Modules**
  - Import specific versions: `@import { ... } from @author/module@1.0.0`
  - Semver range support: `@import { ... } from @author/module@^1.0.0`
  - Tag support: `@import { ... } from @author/module@beta`
  - Version resolution follows semver rules
  - Backward compatible - existing imports continue to work

### Fixed
- **Support for variables in /run code blocks**
  - Fixed regression where `/run js (@variable) {...}` syntax wasn't working
  - Variables can now be passed to code blocks: `/run js (@name, @data) { console.log(name, data) }`
  - Changed grammar to require `@variable` references (not bare identifiers) since `/run` executes immediately
  - Aligns with design principle: bare identifiers are for parameters in `/exe` definitions, `@` references are for existing variables
  - Works with all supported languages: `js`, `node`, `python`, `bash`, etc.
  - Variables are auto-unwrapped (LoadContentResult objects become their content strings)

## [2.0.0-rc26]

### Added
- **Auto-unwrapping of LoadContentResult objects in JavaScript/Node functions**
  - LoadContentResult objects (from `<file>` syntax) are now automatically unwrapped to their content strings when passed to JS/Node functions
  - Enables natural usage: `/run @processFile(<data.txt>)` - the function receives the file content as a string, not the LoadContentResult object
  - Also handles LoadContentResultArray from glob patterns: `<*.txt>` unwraps to an array of content strings
  - Maintains mlld's content-first philosophy where file content is the primary concern
  - Works with all JavaScript (`js`) and Node.js (`node`) executables

## [2.0.0-rc25]

### Added
- **Built-in @typeof() function for type introspection**
  - New transformer function that returns type information for any mlld variable
  - Syntax: `@typeof(@variable)` returns the variable's type (e.g., "simple-text", "primitive (number)", "object (3 properties)")
  - Includes source directive information: `@typeof(@myVar)` → "simple-text [from /var]"
  - Works with all variable types: simple-text, path, primitive, object, array, executable, pipeline-input
  - Can be used in pipelines: `@myVar | @typeof`
  - Available in both uppercase (@TYPEOF) and lowercase (@typeof) forms

## [2.0.0-rc24]

### Fixed
- **Inconsistent handling of LoadContentResult objects between /show and /output**
  - Fixed `/output` to match `/show` behavior when outputting variables containing `<file>` alligator syntax results
  - `/output @myfile` now outputs just the file content (not the full metadata object) when `@myfile` contains a LoadContentResult
  - Also handles arrays of LoadContentResult objects from glob patterns, concatenating their content with double newlines
  - Both commands now consistently treat the alligator syntax as accessing file content, not the full file object

## [2.0.0-rc23]

### Fixed
- **Namespace import structure for better ergonomics**
  - Namespace imports intelligently unwrap single-export modules
- `/import @mlld/env as @environment` now allows `@environment.get()` instead of requiring `@environment.env.get()`
  - Modules exporting a single main object matching common patterns (module name, 'main', 'default', 'exports') are automatically unwrapped
  - Multiple-export modules remain unchanged, preserving full namespace structure

- **Shadow environment preservation regression from rc22**
  - Fixed issue where shadow environments were lost when accessing imported executables through field access
  - rc22's manual reconstruction of ExecutableVariable from `__executable: true` objects was missing deserialization of captured shadow environments
  - Shadow environments (stored as objects during export) are now properly deserialized back to Maps
  - Captured shadow environments are correctly passed to code execution via `__capturedShadowEnvs` parameter
  - Functions like `@github.pr.review()` can now access their required shadow environment functions

- **Node.js executable path in test environments**
  - Fixed `mlld-wrapper.cjs` to use `process.execPath` instead of hardcoded 'node'
  - Fixed test utility to use `process.execPath` for cross-environment compatibility
  - Resolves "spawn node ENOENT" errors in environments where 'node' is not in PATH

## [2.0.0-rc22]

### Fixed
- **Nested executable field access in `/run` directives**
  - Fixed interpreter bug where `/run @github.pr.review(...)` and similar nested field access patterns failed
  - Handles both local ExecutableVariable objects and serialized `__executable: true` format from imports
  - Properly reconstructs executable metadata for imported modules with nested structure

## [2.0.0-rc21]

### Added
- **Environment variable management for CLI**
  - Added `--env` flag to load environment variables from a specific file
  - `mlld test` command automatically loads `.env` and `.env.test` files from the current directory
  - `mlldx` supports `--env` flag for ephemeral environments
- **Test isolation improvements**
  - Tests now run in isolated processes when multiple test files are executed
  - Prevents environment variable pollution between test modules
  - Shadow environment functions are properly cleaned up between tests
  - Added `--isolate` flag for explicit process isolation

### Changed
- **Test command environment handling**
  - Removed console output capture that was interfering with HTTP requests
  - Improved test result parsing from isolated subprocess output
  - Better error handling for test cleanup failures

### Fixed
- **Variable contamination between test modules**
  - Shadow environment variables no longer leak between test files
  - Each test gets a clean environment state
  - Process isolation ensures complete separation when running multiple tests

## [2.0.0-rc20]

### Added
- **Shadow environment preservation through imports**
  - Functions that use shadow environments now work correctly when imported from modules
  - Implements lexical scoping for shadow environments - functions retain access to their original shadow context
  - Supports both JavaScript and Node.js shadow environments

### Fixed
- **Shadow environment functions not accessible after import**
  - Previously, functions relying on shadow environment helpers would fail with "function not defined" errors
  - Shadow environments are now captured at function definition time and restored during execution
  - Enables proper module encapsulation with internal helper functions

## [2.0.0-rc19]

### Added
- **Async/await support in JavaScript executor**
  - JavaScript code blocks now automatically support `await` syntax
  - Detects `await` keyword and creates async functions transparently
  - Shadow environment functions work with async code

## [2.0.0-rc18]

### Fixed
- **Module import resolution for nested object structures**
  - Fixed bug where functions in deeply nested module exports appeared as strings instead of executables
  - ObjectReferenceResolver now recursively resolves VariableReference nodes in nested objects
  - Affects modules with 3+ level nesting like `@mlld/github` where `github.pr.view` was showing as `"@pr_view"` instead of `<function>`
  - Registry review workflow and all GitHub integrations now work properly
- **System variable export filtering**
  - Fixed module export filtering to properly exclude system variables using `metadata.isSystem`
  - Prevents namespace collisions when importing multiple modules with frontmatter
  - System variables like `@fm` are no longer incorrectly exported from modules

## [2.0.0-rc16]

### Changed
- **@input resolver no longer strips MLLD_ prefix** 
  - Environment variables with `MLLD_` prefix are now imported with their full names
  - What you set is what you get: `MLLD_GITHUB_TOKEN` imports as `MLLD_GITHUB_TOKEN`, not `GITHUB_TOKEN`

## [2.0.0-rc15]

### Added
- **mlldx command for ephemeral/CI environments**: New binary for serverless and CI use cases
  - `mlldx` runs with ephemeral mode enabled - all caching happens in memory only
  - No filesystem persistence for read-only containers and serverless functions
  - Auto-approves all imports, no interactive prompts that would hang CI/CD pipelines
  - Available via npx: `npx mlldx@latest script.mld` or installed globally
  - Ships from same package as mlld
  - Useful for GitHub Actions, Vercel functions, AWS Lambda, and other ephemeral environments

## [2.0.0-rc14]

### Fixed
- **Serverless environment support**: Fixed cache directory creation in read-only filesystems
  - Automatically uses `/tmp` for cache in serverless environments (Vercel, AWS Lambda)
  - Detects serverless by checking for `/var/task` path or environment variables
  - Enables mlld to run in read-only container environments

## [2.0.0-rc13]

### Added
- **Import auto-approval CLI flags**: New flags for non-interactive environments
  - `--risky-approve-all`, `--yolo`, `-y` flags to bypass import security prompts
  - Essential for serverless/CI environments where interactive prompts would hang
  - Enables registry review system to work in Vercel functions

### Fixed
- **mlld clean command cache clearing**: Enhanced to remove all cached imports
  - Now clears immutable import cache in `.mlld/cache/imports/` directory
  - Removes both content files and metadata (`.meta.json` files)
  - Fixes stale import cache issues when remote files are updated
- **Serverless environment support**: Fixed cache directory creation in read-only filesystems
  - Automatically uses `/tmp` for cache in serverless environments (Vercel, AWS Lambda)
  - Detects serverless by checking for `/var/task` path or environment variables
  - Enables mlld to run in read-only container environments

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
- Custom alias: `/import [./file.mld] as @myname` creates `@myname` namespace
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
  - Import .mld files: `@import { * as @utils } from "utils.mld"` - access as `{{utils.helper}}`
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
