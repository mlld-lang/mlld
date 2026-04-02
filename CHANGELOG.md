# Changelog

All notable changes to the mlld project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0]

### Added
- `@policy.build(...)` and `@policy.validate(...)` now return additive compiler diagnostics in `report`, exposing stripped args, repair steps, dropped entries/elements, ambiguous values, and compiled proofs without changing existing `policy` / `valid` / `issues` consumers.

### Fixed
- Imported and rebound `var tools` collections now preserve shaped auth metadata and executable bindings across export/import, `let` aliases, and `exe` params, so `@policy.build(...)`, `@policy.validate(...)`, and direct `@tools[@name](@args)` dispatch keep working. Plain object executable maps now also spread matching single-object args by parameter name during dynamic keyed calls, including nested object and array values.
- Function-tool MCP bridges now stay restartable briefly during per-invocation cleanup, preventing intermittent `mlld_tools` disconnects when Claude respawns the bridge proxy after an initial successful tool call.

## [2.0.6]

### Added
- Executables can now declare authorization control args directly with `with { controlArgs: [...] }`. `policy.authorizations`, `mlld validate`, and `mlld analyze` now consume that metadata without requiring a `var tools` wrapper, and native function-tool / MCP bridge calls carry it through at runtime.
- Boundary input canonicalization for projected record values: native tool calls and `with { policy }` authorization bundles now accept exact emitted handles, masked previews, and bare visible fact literals for security-relevant args, canonicalize them back to live values, and fail closed on ambiguity with handle guidance.
- URL exfiltration defense: values now expose `mx.urls`, runtime maintains `@mx.urls.registry` from external inputs, and the managed `no-novel-urls` rule blocks influenced exe arguments that introduce URLs not present in execution input context unless `policy.urls.allowConstruction` permits the domain.

### Fixed
- `exe ... => record` now refines inherited exe `untrusted` at field granularity: fact fields clear the inherited taint, data and demoted fields keep it, whole-object checks still see mixed-trust records recursively, and record wrappers no longer hoist child fact labels during assignment or handle discovery.
- `policy.authorizations` now fails closed on native `tool:w` paths. Unconstrained or incomplete authorizations are rejected for bridged tool calls, and when trusted control-arg metadata is missing, every declared parameter is treated as a control arg.
- Authorization-generated privileged guards now preserve built-in positive checks for destination/target trust and untrusted privileged inputs. Matching authorizations no longer punch through rules like `no-send-to-unknown`, `no-send-to-external`, `no-destroy-unknown`, or `no-untrusted-privileged`.
- Native bridged tool calls now key `policy.authorizations.allow` against the exposed tool name instead of an internal temporary bridge executable name.
- `with { policy: ... }` now activates managed `policy.defaults.rules` even when the applied policy fragment has no `authorizations` block. Base policy rules like `no-send-to-unknown` and `no-untrusted-destructive` now enforce correctly on fallback task-policy paths.

## [2.0.5]

### Added
- Wildcard index `[*]` for array element projection: `@arr[*].field` extracts a field from every element, producing a flat array. Works anywhere arrays appear — variables, guard expressions, template interpolation. Combines naturally with `.includes()` for membership checks like `@mx.tools.history[*].name.includes("verify")`.
- Tool provenance rollout: `.mlld/sec/audit.jsonl` now assigns a stable `id` to every event, exe/native tool invocations emit `toolCall` records with args/timing/result summaries, result values carry `.mx.tools` lineage with audit references, and guards now expose that lineage as `@mx.tools.history`.
- Dynamic MCP tool collections: `var tools @name = mcp @expr` now builds a first-class `ToolCollection` directly from runtime-discovered MCP server tools, complementing the existing `import tools from mcp "..."` flow.
- SDK `mcp_servers` option on `execute()` and `process()`: maps logical names to MCP server commands per-execution. `import tools from mcp "name"` resolves against the map before treating the spec as a shell command. Enables parallel executions with independent MCP server instances. Supported in TypeScript, Python, and live stdio transport.
- MCP tool argument coercion: arguments are automatically coerced to match the declared `inputSchema` types. String-to-array wrapping (`"x"` → `["x"]`), string-to-number/integer, string-to-boolean, string-to-null, and JSON string parsing for object/array types. Runs at the MCP call boundary using schema type info from `tools/list`.
- MCP tool argument name matching: when calling an MCP tool with variable-reference arguments whose names match schema property names, arguments are matched by name instead of position. Exe wrappers can declare params in any order (e.g. control args first) and mlld routes them to the correct MCP schema properties.
- Policy authorization bundles phase 1: `policy.authorizations` now enforces task-scoped default-deny envelopes for `tool:w` operations, supports tolerant literal/`eq`/`oneOf` arg pinning, reads trusted `controlArgs` from `var tools` metadata, composes across policy layers, and fails closed when invalid fragments are activated through `with { policy }`. `mlld validate` and `mlld analyze` now also report unknown tools/args, missing control-arg coverage, and unconstrained authorizations with context-aware diagnostics.
- Tolerant comparison operators `~=` and `!~=` for guard/`when`/expression conditions. The new matcher handles string vs single-item array coercion, order-independent flat arrays, subset matching for array expectations, null/empty equivalence when the expected side is empty, numeric string coercion, and comma-separated string to array matching. This makes LLM-produced guard args much easier to validate without hand-written normalization logic.
- `mlld validate` / `mlld analyze` now surface policy declarations (`policies`), executable labels, richer guard metadata (`filter`, `privileged`, `arms`), and a new `--context` option for validating guards against tool modules. Context-aware validation warns on missing exe filters, missing operation labels, and `@mx.args.*` references that do not match the guarded executable signature.
- Filesystem integrity rollout across phases 1-3: write-executor outputs are signed, content-loader verifies raw file bytes on read, signer policies assign file trust labels, and `filesystem_integrity` rules add identity-aware write protection on top of normal filesystem capability checks.
- Filesystem integrity phase 4: `mlld status` reports verified/modified/unsigned files with signer labels and taint metadata, runtime reads populate `@mx.sig` (including `@mx.sig.files("glob")`), and the Python/live SDK surface now exposes `fs:status` via `client.fs_status()`.
- Filesystem integrity phase 5: the Python SDK and live stdio transport now expose `sign`, `verify`, and `sign_content`, and `ExecuteHandle.write_file()` writes execution-scoped files that are auto-signed as `agent:{script}` with taint/provenance metadata.
- Policy built-ins now include destination-aware send rules: `no-send-to-unknown` requires the first argument to `exfil:send` operations to carry `known`, and `no-send-to-external` requires `known:internal` for internal-only send policies.
- Policy built-ins now include `no-destroy-unknown`, which requires the first argument to `destructive:targeted` operations to carry `known`. This gives delete/cancel/remove flows the same positive-check protection model as the send-specific rules and supports pinned-target privileged overrides when policies are not locked.
- SDK boundary labels: payload field labels and labeled in-flight `@state` updates are now available across the live transport and all maintained language SDKs (Go, Python, Rust, Ruby, Elixir). `payloadLabels` / `payload_labels` attach labels to individual `@payload` fields, and SDK state updates can now send `labels` so injected values participate in normal label flow. Python also keeps the `trusted()`, `untrusted()`, and `labeled()` helpers for inline payload construction.
- Guards now expose named operation inputs through `@mx.args`, including dot access for identifier-safe names (`@mx.args.value`), bracket access for arbitrary names (`@mx.args["repo-name"]`), and the reserved discovery list `@mx.args.names`. The named-arg snapshot is available in guard bodies, after-guards, and denied handlers for both direct exec calls and pipeline-stage bindings.
- Guards now support function filters (`guard before @send_email = when [...]`), matching by exe name. This parallels the existing hook `@fnName` syntax and enables guards scoped to specific executables without requiring label-based matching.
- Hooks now match `op:` filters against operation labels (e.g., `hook before op:tool:w`), not just built-in operation types. This aligns hook and guard trigger semantics — both now treat custom labels as valid `op:` targets.
- Guard and managed policy label-flow denials now surface as structured SDK observability data. Streamed executions emit immediate `guard_denial` events, structured execute results collect `denials`, and the live stdio / Python / Ruby / Go / Rust / Elixir SDK layers now preserve that payload without string parsing.

### Fixed
- Brace-syntax AST selectors (`<file.py { ClassName }>`) now return source code as text instead of JSON metadata objects, matching the behavior of markdown `#` section selectors. Metadata fields remain accessible via `.data` (e.g., `@result[0].name`, `@result[0].type`).
- `toolCall` audit events are now emitted only when an executable/tool body actually runs. Early returns from pre-guards or parameter label-flow checks no longer create false tool-call records, and `duration` now measures body execution only.
- After-guards now preserve taint-only provenance on both `@mx.taint` and `@output.mx.taint`, so source markers such as `src:mcp` and `src:js` remain visible in after-guard checks.
- TypeScript AST extractor is now lazy-loaded, so `npm install -g mlld` no longer requires a globally installed `typescript` package. The `typescript` module is only imported when extracting definitions from `.ts` files.
- Python package resolver no longer eagerly detects pip/uv during environment bootstrap. Detection is deferred until a `@py/` or `@python/` import is actually resolved, so scripts that don't use Python imports work without Python installed.
- `py { }`, `bash { }`, and `node { }` blocks now show actionable error messages when the required binary is missing (e.g. "Python 3 is not installed. Install it to use py { } blocks") instead of the raw `spawn ENOENT` error.
- Logical `||` now preserves normal boolean semantics for ordinary exec/method-call expressions such as `@model.includes(...) || ...` instead of misrouting them through parallel exec handling. Explicit streamed chains (`stream @a() || stream @b()`) still run in parallel, and longer streamed chains now include every operand.
- `continue { ... }` and `done { ... }` inside `when` branches now resolve branch-local `let` bindings correctly. Previously, inline object arguments were returned as unevaluated AST and resolved later in the loop scope where `let` bindings from the `when` branch were no longer visible.
- Truthiness evaluation now fails closed when it receives error-like payloads from runtime evaluation or parallel-loop error markers, preventing `when`, `&&`, `||`, `!`, and ternary conditions from accidentally treating errors as truthy values.
- Standalone executable invocation (`@fn(...)` / `/run @fn(...)`) now preserves per-argument security descriptors through the `runExec` dispatcher, so callee parameters keep labels for both bare variable arguments and inline object/array literals instead of dropping `mx.labels` at the exe boundary.
- Control-flow label propagation now covers conditional `when [...]` expressions and `/if` branches. Selected `when` results inherit labels from evaluated conditions, including fallback arms, and `/if` branch results plus branch-local updates now retain the condition's security context.
- Policy extraction in `mlld analyze` / `mlld validate` now includes `operations` mappings and `locked` state consistently, privileged-guard validation now catches missing policy operation mappings, and the MCP built-ins `mlld_validate` / `mlld_analyze` now route through the same analyzer surface as the CLI so inline validation sees the same semantic/context warnings.
- Array equality now compares list values structurally in shared expression/`when`/guard matching, so conditions like `@mx.args.recipients == ["john@gmail.com"]` work for privileged policy exceptions and other pinned-argument checks. Added regression coverage for nested array coercion and guard-level array arg matching.
- Privileged guard `allow` decisions can now override policy label-flow denials and built-in label-flow rules by default, which enables policy-plus-guard exception envelopes for destructive/exfil/privileged flows. Policies can opt back into absolute denial behavior with `locked: true`, and managed label-flow checks now run through the guard pipeline so denied handlers and `when` expressions preserve the correct policy denial semantics.
- Executable argument evaluation now falls back to object/array literal descriptors when a wrapper variable loses its aggregate `mx` labels, so nested `untrusted` values in config objects still trigger `untrusted-llms-get-influenced` and `no-untrusted-destructive`. Added regression coverage for parsed `messages` config objects, nested object field label access, and destructive-policy enforcement through object wrappers.
- Quoted template interpolation inside nested `when`/denied-handler blocks now reparses split bracket/dot tails after variable references, so expressions like `@mx.args["names"]` and chained forms such as `@mx.args["names"].mx.labels.join(",")` resolve correctly instead of rendering the tail as literal text.
- Namespace-qualified MCP calls (`@mcp.sendEmail()`) from an exe with the same unqualified name (`@sendEmail`) no longer falsely trigger the circular reference guard. The recursion detector was comparing unqualified method names, ignoring the namespace prefix, so every exe wrapper that delegated to its MCP counterpart was rejected as self-recursive.
- Policy object keys that interpolate path-like values such as `@base/docs/*.txt` now materialize to their string form instead of degrading to `"[object Object]"`, which fixes config-imported `filesystem_integrity` globs in `mlld status`.
- `when` expressions no longer misclassify plain object results that happen to include a `type` key as internal AST nodes. Inline object literals like `{ type: "response" }` now return correctly instead of collapsing to `undefined`.
- Live transport (`mlld live --stdio`): `stdout` effects no longer write raw text to stdout when streaming is disabled, which was corrupting the NDJSON protocol. Content is now captured in the document buffer instead. Fixes SDK `execute()`/`process()` calls failing with `invalid live response` when scripts produce multiline output (e.g. via `claude -p`).
- Python SDK: `_reader_loop` now buffers incomplete JSON lines instead of failing all pending requests. Provides defense-in-depth against any stdout contamination reaching the transport.
- SDK/runtime error serialization now strips internal manager/environment state from wrapped causes and live-transport event payloads, so Python and JS callers see the real runtime failure without multi-kilobyte environment dumps.
- Registry/module resolution now invalidates stale lockfile cache entries when a versioned import requests a different version, and refreshed lock entries persist the resolved `registryVersion` so subsequent versioned imports reuse the correct cache entry.
- Pipe inside ternary branches (`var @x = @val ? @val | @filter : null`) now produces an actionable parse error explaining the limitation and showing two workarounds (exe block wrapper or split into separate steps) instead of a generic "Text content not allowed in strict mode" message.
- CLI: added `--state` so scripts can populate `@state` from `@file.json`, inline JSON objects, or `KEY=VALUE` flags without routing through `--inject`.
- `mlld info` now builds source URLs correctly for directory-backed registry modules, fixing broken `# tldr` lookups that previously produced `undefined` paths.
- `state://` writes now preserve structured objects and booleans as native values instead of flattening them through the text surface first. This also fixes live `@state` snapshots and SDK payloads receiving `"[object Object]"` or stringified booleans in affected flows, and adds first-class support for inline object/array literals in `output ... to "state://..."`.
- Structured-value text fallbacks no longer silently degrade plain or circular objects to `"[object Object]"`. Objects now prefer JSON serialization, and genuinely unserializable values surface as `[unserializable object]` instead.
- Python SDK state-write decoding now normalizes composite JSON payloads from both streamed `state:write` events and final `stateWrites` results, avoiding manual `json.loads(...)` for object values and preventing mixed-type duplicate entries during merge.
- `when` expressions no longer swallow hard policy denials (`MlldDenialError`). Previously, a policy-denied action inside a `when` arm was silently caught and mishandled as a soft guard denial, allowing execution to continue. Hard denials now propagate correctly.
- Field access on `@payload` and other object variables now preserves security metadata (labels, taint) when resolving nested fields via method calls and builtins. Previously, extracting the raw value before field traversal dropped per-field descriptors.
- Parsed JSON nested objects now expose direct `.mx.labels` access consistently, instead of only preserving labels after reassignment or on primitive leaves.
- Before-guards on exe invocations now fire for field-access arguments such as `@args.data`, matching bare-variable behavior and policy label-flow enforcement.
- URL alligator results now expose `.mx.text`, `.mx.html`, and `.mx.md` correctly. Previously, the content-type-derived accessors on `LoadContentResultURLImpl` were not propagated through the StructuredValue metadata path, so `.mx.html.isDefined()` and `.mx.md.isDefined()` returned `false` for HTML pages.
- Guard `op:` prefix now accepts colon-compound labels (e.g., `op:tool:w`, `op:net:r`). Previously `GuardOpIdentifier` only allowed dot-separated segments, so `op:tool:w` failed to parse. Guards also now warn when a data filter like `guard before tool:w` matches a known operation label, suggesting `op:tool:w` instead.
- Live SDK state updates now preserve their labels on the updated `@state` path/top-level export instead of collapsing those labels onto the entire reserved `@state` object, and `mlld live --stdio` now forwards `state:update.labels` through to the runtime.
- Bundled language-server semantic highlighting no longer crashes at startup, and agent-style `when` scripts now get full token coverage instead of leaving semantic highlight gaps.
- Imported executable arrays now work in `exe llm` `config.tools`, so tool lists exported from helper modules preserve their function references instead of re-resolving in the caller scope.
- Native `exe llm` tool calling via `config.tools` now preserves label-flow provenance across the internal function-tool bridge. Tool-call args inherit the enclosing LLM/input descriptor plus prior tool-result taint, so label-based defenses like `untrusted-llms-get-influenced` and `no-untrusted-destructive` apply to subsequent native function tool calls instead of resetting at the JSON bridge boundary.
- `exe llm` calls with only exe-ref tools (no string tools) no longer leak the CLI's native built-in tools to the model. The runtime now exposes `@mx.llm.native` (the native tool names CSV), and `@mlld/claude` passes `--tools ""` when `native` is empty to suppress built-in tools. Previously, only the `inBox` path suppressed native tools; exe-ref-only calls outside a box left all 25+ built-in tools visible alongside the intended MCP-bridged tools.
- Markdown section extraction (`<file # section>`) no longer strips inline backtick content. The `llmxml` library's `getSection()` was parsing markdown into an AST and re-serializing it, which dropped inline code spans. Replaced with a text-based extractor that preserves content verbatim.

### Documentation
- Added/updated docs for tolerant comparison (`~=` / `!~=`), privileged-guard validation guidance, and the expanded `mlld validate` JSON/context workflow.
- Python SDK README now documents editable installs for local development (`uv pip install -e ./sdk/python`) so SDK changes apply immediately in downstream projects.

## [2.0.4]

### Added
- `exe recursive` label — self-calling exe functions with bounded depth. Add `recursive` to any `exe` label list to allow a function to call itself up to a configurable depth limit (default 64, override with `MLLD_RECURSION_DEPTH`). Works with `exe llm`, inside `for`/`for parallel` loops (each branch tracks depth independently), and composes with checkpointing. Non-recursive functions retain existing immediate-throw behavior on self-call.
- VirtualFS contract freeze baseline: finalized public API/migration decisions, phase plan, and regression checklist artifacts (`plan-virtualfs.md`, `docs/dev/VIRTUALFS-CONTRACT.md`, `tests/virtualfs/REGRESSION-CHECKLIST.md`)
- `VirtualFS` core `IFileSystemService` implementation with copy-on-write overlay semantics (`empty`/`over`, shadow-first reads, delete masking, directory merge behavior) plus new core/integration test coverage
- `VirtualFS` lifecycle APIs for inspect/apply/revert workflows: `changes`/`diff`, `discard`, `reset`, scoped/global `flush`, deterministic `export`, and `apply` with strict patch typings
- `VirtualFS.fileDiff(path)` unified diff inspection with deterministic output; inspection naming finalized with `changes()` canonical and `diff()` compatibility alias
- SDK/interpreter VirtualFS integration: SDK now exports `VirtualFS` on the public surface, package exports include `mlld/sdk`, and interpreter import workflows are covered against VirtualFS-backed parsing/directory behaviors
- Test harness migration: `MemoryFileSystem` now wraps `VirtualFS.empty()` for semantics parity, with dedicated parity tests and updated test-environment docs
- VirtualFS final hardening pass: added stress regression coverage for deep merge/delete-mask and repeated `flush`/`discard` lifecycle cycles, plus SDK default `NodeFileSystem` behavior checks when `fileSystem` is omitted

### Changed
- `mlld nvim-setup` now auto-updates outdated configs instead of requiring `--force`; shows version transition (e.g. `Updated config v15 → v16`)

### Fixed
- Circular reference guard now fires after argument evaluation rather than before. This fixes a pre-existing bug where `@f(@f(x))` — a non-recursive nested call of the same function — was incorrectly rejected as circular. Arguments are evaluated in the caller's scope before the callee's body begins, so nesting the same function as an argument is valid and now works correctly.
- For-loop variables (`@varName`, `@varName_key`, `@varName.field`) are now marked as block-scoped and can shadow parent-scope variables with the same name. This fixes a bug where `exe recursive` functions containing `for`/`for parallel` loops would throw `VariableRedefinitionError` on the recursive call when the loop variable name matched one in an ancestor scope.
- `exe recursive` label now survives module import boundaries. Previously, importing a function that internally called a `recursive`-labelled function (directly or transitively through a wrapper) would drop the `recursive` label during `capturedModuleEnv` rehydration, causing a spurious `CircularReference` error at runtime. Fixed in `CapturedEnvRehydrator` (now threads the `__metadata__` map through deserialization so inner executables retain their labels) and `VariableManager.hasVariable` (now searches `capturedModuleEnv` so the recursion guard resolves correctly for captured-scope executables).
- MCP server: strip namespace prefix from tool calls (e.g., `server-name:tool_name` → `tool_name`) to support clients that send namespaced tool names
- MCP server: handle `notifications/initialized` per protocol spec instead of returning an error that caused clients to restart the server
- MCP server: suppress responses for JSON-RPC notifications (messages without `id`)
- MCP server: `tools/call` returned "Tool not found" for exported functions with snake_case names due to incorrect camelCase round-trip in `resolveToolKey`
- `PythonPackageManager` availability probes now use `spawnSync` instead of `execSync`, avoiding `EPERM` errors in sandboxed environments where `execSync` is restricted.
- Neovim: disable snippet/generic autocompletion (nvim-cmp, blink.cmp) for `.mld` files — mlld scripts are not code and general snippets are noise
- `mlld nvim-setup` leaked debug output (`true table: 0x...`) when checking for nvim-lspconfig
- Streaming `stream` flags now resolve expression values (for example `stream: @config.stream`) across exec/run/show/pipeline paths; only strict boolean `true` enables streaming
- Per-call MCP config generation now hard-fails on unknown in-box VFS tool names and MCP tool-name collisions
- Per-invocation scope cleanups now deterministically tear down transient per-call MCP bridge resources
- `mlld run` checkpoint guidance and resume semantics now match script-level resume policy, named checkpoint policies, and workspace replay behavior
- Imported module `/needs { packages: { node: [...] } }` checks now resolve Node packages from the imported module path, including built CLI runs
- Namespace imports now preserve sibling command-ref scope for top-level exported executables

### Documentation
- Completed VirtualFS coverage across dev/user docs and SDK atoms, including architecture placement, no-grammar-impact note, test-harness guidance, SDK usage patterns, and docs-mirroring SDK example tests
- Clarified the `untrusted-llms-get-influenced` contract in policy/security docs: any `llm` input can trigger `influenced`, including structured config fields such as `messages`, `system`, and tool definitions, and added regression coverage for that path

## [2.0.3]

### Added
- `mlld install skill`, `mlld install skills`, and `mlld skills install` all alias to `mlld skill install`
- `@payload` is a direct variable — no import required. `show @payload.name` just works. Import still works for destructuring (`import { name } from @payload`).
- Added `/mlld:fanout` and `/mlld:query` skills to teach agents about RLM in mlld

### Fixed
- `mlld -e` now collects unknown flags into `@payload` instead of rejecting them
- Registry directory modules (e.g. `@mlld/airlock`, `@mlld/gh-issues`) failed to import because strict-mode `.mld` content was parsed as markdown when the resolver path had no recognized file extension

## [2.0.2]

### Fixed
- `mlld skill install` fails for public users due to stale private git submodule in repo
- `mlld skill install --local` fails because `.claude-plugin/marketplace.json` was missing from npm package

## [2.0.1]

### Fixed
- Publish workflow: fix RubyGems publish for subdirectory gems (`rubygems/release-gem` doesn't support `gem-directory`)
- Publish workflow: add `ex_doc` dependency to Elixir SDK so `mix hex.publish` can build docs

## [2.0.0]

### Added
- `@mlld/claude-stream` registry module: drop-in `@mlld/claude` replacement that defaults to `stream-json` output with `streamFormat: "claude-code"` on all exported executables.
- `mlld howto <keyword>` keyword search across atom tags, titles, and briefs. Single match shows full content; multiple matches show a selection list.
- Markdown section selectors now support include/exclude sets (`# a, b; !# c`), quoted heading names, optional selectors (`"name"?`), and fuzzy prefix matching that ignores punctuation/case.
- `.flat(depth?)` and `.at(index)` array builtin methods.
- `autosign` category renamed from `templates` to `instructions`. Aliases retained for backward compatibility: `instruction`, `instruct`, `inst`, `templates`.
- `autosign: { labels: ["prompt"] }` signs variables with matching security labels.
- `verify_all_instructions: true` policy shorthand for `defaults: { autosign: ["instructions"], autoverify: true }`.
- Autoverify now only injects verification for variables marked as instructions, not all signed variables.
- Autoverify now injects a scoped `verify` MCP tool when an `llm` executable runs under a tool collection.
- `@mx.tools.results` now exposes per-tool latest results for guard checks.
- Tool-collection schema supports `optional` exposed parameters; MCP required fields and runtime argument checks now respect optional parameters.
- Verify tool responses now include structured pass/fail output with `allPassed`, per-variable `results`, and composition metadata (signed instruction provenance vs interpolated data taint/sources).
- Signing now writes `signed:<var>` provenance labels; composed instruction variables inherit signed provenance for cascading verification targets.

### Fixed
- `format: "xml"` output now applies XML conversion in the main document-render path instead of silently returning markdown/plain text.
- `/output` and `/append` now reject paths that resolve to `[object Object]` to prevent accidental writes to invalid filenames.
- `mlld validate --format json` now populates `needs.cmd` with detected command names (from `/needs` declarations and shell command analysis), not just empty arrays.
- `@now` resolver import context now honors custom format-string imports (for example `YYYY-MM-DD`, `HH:mm:ss`) instead of always returning ISO.
- Expression parsing now supports builtin method calls directly on array literals (for example `[1, 2, 3].join("-")`).
- AST-aware JSON serialization now preserves interpolated wrapped-string content instead of returning empty strings.
- Markdown chunk parsing now ignores prose `::` text on non-directive lines, preventing false template-fence state during validation/tokenization.
- Policy config now supports `deny_cmd` shorthand (for example `deny_cmd: ["npm:run:*"]`) and merges it into command deny rules.
- Command deny patterns are now enforced for `sh`/`bash` code blocks before execution, so denied commands (for example `cmd:npm:run:*`) cannot bypass policy through shell blocks.
- Direct `=> @toolCall()` returns inside `env with { tools: ... }` blocks now preserve tool-collection label taint, matching the existing `let`-binding behavior.
- Ambiguous `when @cond [ ... ]` parse errors now include explicit `for...when` static-condition guidance with the pre-filter pattern (`var @items = @cond ? @list : []`).
- `mlld validate` now warns on `for...when` static conditions that do not reference loop variables (`for-when-static-condition`), with suppression support via `validate.suppressWarnings`.
- CLI/help text for output formatting now refers to markdown output normalization (and legacy `--pretty` alias behavior) instead of removed Prettier integration.
- Removed the dead `ConfigLoader`/`mlld.config.json` pipeline; import-approval persistence and config discovery now use `mlld-config.json`/`mlld-lock.json` paths only.
- `RegistryManager` now fetches locked module content and enforces lock integrity checks before caching, instead of bypassing integrity verification in locked-fetch paths.
- Streaming declared on executable definitions now propagates correctly through `run @exe(...)` and `show @exe(...)`; adapter pipelines activate even when invocation-level `stream` is omitted.
- Executable-definition `streamFormat` is now respected across invocations, and invocation-level `streamFormat` correctly takes precedence when both are present.
- `show` streaming invocations no longer double-emit output when executable-definition streaming is active.
- CLI streaming debug flags are now wired end-to-end: `--show-json` mirrors raw NDJSON to stderr and `--append-json` appends raw NDJSON to JSONL output files.
- Hook registration now emits a runtime warning for unknown `op:<type>` hook filters (while still registering the hook for forward compatibility).
- `--resume "checkpoint-name"` now pre-scans source-declared checkpoints so named resume targets are available even when a prior run never reached that checkpoint.
- `mlld validate` now warns when a trailing exe parameter can be omitted by callsites but is passed through to another function call (a runtime `Undefined variable` failure pattern).
- `autosign` now signs all string literal syntaxes (`"..."`, backtick, `'...'`), not just `::` templates.
- Removed implicit `mlld verify` command capability bypass under autoverify; verification enforcement now routes through tracked tool calls.
- `env with { ... } [ ... ]` configless block syntax for `/env`.
- `/exe` definitions now accept `env` blocks directly on the RHS (`/exe @fn(...) = env with { ... } [ ... ]`).
- `@typeInfo(...)` builtin for rich type/provenance diagnostics, while `@typeof(...)` remains for simple type checks.
- Directory module import convention: importing `./dir` now resolves `./dir/index.mld` when present; `./dir/` continues to mean collection import.
- `sh(@var) { ... }` syntax support in `exe` definitions (previously run-only).
- Standalone `/auth @name = ...` directive for top-level credential declarations, including short form (`"API_KEY"`) and object forms (`{ from, as }`).
- Exported executables now capture module auth bindings so imported `using auth:name` works without requiring callers to import policy objects.
- AST selector results now mirror metadata on `.mx` (`name`, `type`, `line`), and glob selectors populate source path metadata on `.mx.relative` while retaining top-level selector fields.
- Pipeline and `while` stage command execution now supports block-form executables (`mlld-exe-block`) and env executables (`mlld-env`) with the same dispatch behavior as direct invocation.
- `done`/`continue` literal parsing no longer consumes following lines as accidental values, and `while` stages now handle `done null` without null-pointer failures.
- `@typeof(...)` now treats structured null payloads as `null` (not string `"null"`), including unmatched `when` results wrapped in structured values.
- Registry installs no longer mutate lock entries before install success, preventing lock-file corruption when requested versions fail to resolve.
- `mlld update` now respects pinned lock constraints: exact versions stay pinned, and range constraints update within their pinned range.
- `@root/...` and `@base/...` file-not-found errors now include the resolved absolute path for easier debugging.
- `mlld validate` undefined-variable checks now ignore non-variable `@` text patterns (emails/scoped packages) and honor implicit loop locals (`@item`, `@index`, `@key`).
- `mlld validate` now treats pipeline alias `@p`, resolver-prefix variables from `mlld-config.json`, and `hook @name ...` declarations as known variables to avoid false undefined-variable warnings.
- Hook operation validation now recognizes `op:log` as a known operation type.
- CLI error reporting now marks handled errors and avoids secondary re-emission paths, so representative runtime failures emit one formatted error block.
- `var`/`let` pipeline shorthand now preserves custom stages immediately before builtin effects (`log`, `show`, `output`, `append`) instead of silently dropping prior stages in parsed pipeline order.
- Namespace executable internals now seal `capturedModuleEnv` from enumeration/JSON serialization, and namespace missing-field errors now show sanitized export-only diagnostics (without internal runtime dumps).
- Namespace method calls now prefer exported functions over colliding built-in string methods (for names like `trim`, `split`, `replace`, etc.).
- `mlld publish` now reads file frontmatter metadata defaults (`title`, `description`/`about`, `version`, `tags`/`keywords`, `author`) and lets CLI metadata flags override them.
- Reserved CLI env loading flag renamed from `--env` to `--mlld-env`; `--env` now flows through to payload fields (for example `@payload.env`).

### Fixed
- Removed the legacy `/exe @fn(...) = [@file # section]` special case; section/file extraction in executable bodies now uses alligator syntax (`<file.md # "Section">`).
- `/exe` bodies now accept alligator section selectors directly (including selector sets/negation/optional selectors) via normal load-content execution.
- `cmd { ... }` parsing now keeps `|` literal inside double-quoted strings with `@param` interpolation, and `\@` now consistently emits a literal `@` inside unquoted command words.
- Inline `var @x = js { ... }` assignments now preserve typed results (`[]`, `{}`, numbers, booleans, null) instead of returning JSON strings.
- JS implicit-return normalization now ignores `return` statements inside nested lambdas/functions, so top-level expression bodies still return correctly.
- Module imports no longer inherit unrelated module-level labels on every export; export metadata now stays scoped to each variable’s own security descriptor.
- CLI command execution errors no longer print raw stderr twice before formatted mlld error output.
- `mlld publish` for directory modules now constructs correct raw GitHub URLs; previously `detectGitInfo` received the directory path instead of the entry file path, producing a `/.` base path that made URL verification fail.
- Consecutive indented `>>` comment lines inside `/if` and `/for` block bodies now parse correctly.
- `mlld publish` metadata updates (repo, bugs, mlldVersion) are now written to disk, committed, and pushed automatically. Previously option [1] "Apply changes and continue" only updated in-memory state and never persisted the file.
- `mlld publish` auto-commit now pushes to remote and refreshes the commit SHA before URL verification, so the constructed raw.githubusercontent.com URL points to an accessible commit.
- `mlld publish` directory module metadata updates now write to `module.yml` instead of incorrectly adding frontmatter to the entry file.
- `mlld publish` manifest parser now reads `repo`, `bugs`, `homepage`, and `keywords` from `module.yml`, preventing the enhancer from perpetually flagging them as updates when they already exist.
- `mlld publish` metadata commit gracefully skips when the file content is unchanged, instead of failing with a fatal error.
- `run` directive now resolves cross-module executable dependencies; imported functions called via `run @fn(...)` can access their own module's imports. Previously only `var @_ = @fn(...)` worked.
- Repeated `--env` CLI flags now accumulate instead of overwriting; all entries are available in `@input`.
- `when` value-match wildcard arms (`* => show ...`) now execute directive actions instead of silently dropping them.
- `let` object literals now evaluate expression-valued properties (`when`, ternary, binary, unary) instead of leaking raw AST nodes.
- MCP tool routing now reports clear not-found errors for wrong tool names (with snake_case suggestion), instead of surfacing recursive/circular errors.
- Equality behavior is unified through a single implementation across expression and `when` condition evaluation.
- Guard denial output is deduplicated and default errors omit verbose guard JSON internals unless debug mode is enabled.
- Missing-file path guidance and import suggestions now consistently prefer `@root` in user-facing hints.
- Deprecated-json anti-pattern detection is narrower and no longer triggers on variable names that merely contain `json`.
- Auth binding resolution now composes captured module auth with caller `policy.auth` and caller standalone `auth`; caller bindings override same-name module bindings.
- Keychain auth lookup now falls back to `process.env[as]` when keychain entries are missing, and unsupported provider schemes return explicit errors.
- Error display now renders all content (header, source context, details, suggestion) inside the `mlld error` box frame. Directive trace chain appears at top, error details below. Fixes `:unknown` locations in trace and strips `/` prefix from directive names.
- `src:mcp` taint no longer applies to inputs of MCP-served tools (`mlld mcp`); it remains scoped to data returned from imported MCP tools.
- Imported guards now resolve internal executable dependencies in the module where the guard was defined; consumers do not need to import helper executables separately.
- Re-importing the same module in one execution (for example, guard import plus policy import) reuses cached module evaluation and no longer re-registers guards.
- Security label/taint propagation now survives template-literal interpolation passed as executable arguments.
- Executable argument expressions (`? :`, unary/binary forms, and when-expression values) now preserve security descriptors.
- Array/object literals now retain label/taint metadata from nested expression values.
- Executable source taint is now medium-specific: `src:js`, `src:sh`, `src:py`, `src:cmd`, and `src:template`; pure mlld executables use `src:exe`.
- Security descriptor propagation through `js`/`sh`/`py`/`cmd` executable blocks is now covered for round-trip, transform, and multi-label flows.
- Object spread in `/var` assignments now preserves security labels and taint from spread sources.
- Label propagation audit coverage now spans templates, expression branches, collection construction/spread, method chains, accessor paths, and loop/when transformations.
- Privileged guard `when` actions now accept shorthand label modifications (`trusted!`, `!label`, `clear!`) with action targets (for example `* => trusted!,!secret @output`).
- Label-modification actions now also accept escaped bang forms (`trusted\!`, `clear\!`, `\!label`) in guard and return contexts.
- `cmd { ... }` shell-operator parse/runtime errors now emit context-aware guidance, suggesting `run sh(@path) { ... }` in run contexts and `exe @fn(path) = sh { ... }` in exe contexts.
- Executable outputs now inherit taint introduced by nested tool/executable calls during actual execution paths (for example, nested `net:r` labels now propagate to parent `exe` output only when invoked).
- `var tools` normalization no longer triggers `before <operation-label>` guard evaluation; those guards now run only during actual operation execution.
- Guard quantifier helpers now attach to object-valued guard inputs, preventing `@input.any.mx.*` field-access failures in operation guards.
- `npm run test:case -- ...` now accepts `tests/cases/...`, `tests/fixtures/...`, absolute paths, and direct `example.md`/`example.mld` fixture paths.
- Return label trust asymmetry is preserved for executable returns; explicit `=> untrusted ...` results no longer regain `trusted` from ambient invocation descriptors.
- `/needs { py: [...] }` dependency checks now prefer `pip3` and fall back to `pip`.
- `import { @FOO } from @input` now resolves missing fields to `null` instead of throwing `Export not found`.
- Selected `@input` imports now always include every requested key in resolver export payloads, using `null` when absent.
- `for @key, @value in @obj` now iterates parsed JSON object keys for values loaded from `<file.json>`, instead of StructuredValue wrapper fields.
- `js { ... }` and `node { ... }` blocks now parse regex literals with quoted character classes (for example `/^["']|["']$/g`) without cascading parse failures.
- `policy.operations` now uses `risk-category -> labels[]` mappings (for example `exfil: ["net:w"]`) instead of `label -> risk-category`.
- StructuredValue wrapper access is explicit via `.mx.text` and `.mx.data`, while top-level field access remains user-data-first for keys like `text`, `data`, and `type`.

## [2.0.0-rc82]

### Breaking
- **Template interpolation behavior change**: `@item-file` in templates resolves as a single identifier instead of `@item` plus literal `-file`. Use `@item\-file` (backslash boundary) for the old behavior.

### Added
- **Hyphenated identifiers**: Variable names, field access, imports, and exports support hyphens (`@skip-live`, `@payload.max-retries`, `import { output-format } from @payload`). No trailing, leading, or double hyphens. `mlld validate` detects `@var-literal` patterns that shadow previous `@var` + literal text behavior and suggests backslash boundary (`@var\-literal`).
- **`@fileExists(path)` builtin**: Filesystem existence check that resolves its argument to a path string, then checks if the file exists. Unlike `@exists(@var)` (which checks variable existence), `@fileExists(@var)` resolves the variable value and checks the file.
- **`mlld validate` improvements**:
  - Concise directory output with compact view (green checkmarks, inline issues, summary line); `--verbose` for full details
  - Cross-directory template param resolution across the project tree
  - Template for-loop iterator exclusion (no longer flags `@item` as undefined)
  - `@for` anti-pattern detection in `.att` templates
  - Undefined variable detection with hints for common mistakes (e.g., `@mx.now` → `@now`)
  - Variable redefinition detection with immutability guidance
  - Exe parameter shadowing warnings with suppression via `mlld-config.json`
  - Guard timing extraction, exe invocation argument checks, and `--format json` guards/needs coverage
  - Built-in name conflict detection for `let`/`var` collisions with transformer names
  - When-in-exe clarity warning for implicit value actions
  - Mutable `@state` anti-pattern warnings
  - `--error-on-warnings` flag exits with code 1
- **JSON5 fallback for `.json` / `.jsonl` loading**: Files with trailing commas, single quotes, or comments now parse via JSON5 fallback when strict `JSON.parse` fails.
- **`mlld live --stdio`**: Persistent NDJSON RPC transport for long-running SDK calls
  - Accepts `process`, `execute`, `analyze`, `cancel`, and `state:update` methods over stdio
  - Streams SDK events as NDJSON while requests execute
  - Returns structured completion payloads per request id
  - Aborts active requests on `cancel`, stdin EOF, SIGINT, or SIGTERM
- **Ruby SDK wrapper**: `sdk/ruby` adds persistent live transport support with `process`, `execute`, `analyze`, and module-level convenience helpers.
- **`mlld mcp-dev`**: MCP server for language introspection tools (`mlld_validate`, `mlld_analyze`, `mlld_ast`), separate from `mlld mcp` which serves user-defined tools
- **Template interpolation shortcuts**: `@var?` omits falsy values and `@var??"default"` (or single-quoted) provides nullish fallback in templates
- **Multiline method chaining**: Method chains can continue across lines in expressions when each continuation line starts with `.`
- **Loop iteration metadata**: Access loop state via `@mx.for.index`, `@mx.for.total`, `@mx.for.key`, `@mx.for.parallel` inside `for` blocks (works in both sequential and `parallel()` loops). Loop-bound variables expose `@item.mx.index` (zero-based, preserves original position in parallel). Object iteration exposes `@item.mx.key`.
- **Top-level script returns (`=>`)**: Strict scripts accept bare `=>` and markdown scripts use `/=>` as an explicit script return.
  - `=> @value` terminates script execution immediately.
  - Top-level `if` and `when` branches can return through the script context.
  - Imported `.mld` modules expose script return values through `default`.
  - Scripts without `=>` do not emit implicit final return output.
- **Key/value for loops**: `for @key, @value in @obj` binds the key variable and skips the implicit `@value_key` binding
- **`for parallel` variables**: Cap and pacing parameters accept variables
- **`when @condition => [block]`**: Conditional blocks with full statement support
  - Execute multiple statements when condition is true: `when @ready => [let @x = 1; show @x]`
  - Supports `let`, `var`, nested `when`, `for`, and return via `=>`
  - Consistent with `exe` and `for` block semantics
- **`env` directive**: Scoped environment blocks with per-block environment config, `with { tools }` tool filtering, and `mcps` server allowlists enforced at runtime
- **MCP tool imports**: `import tools { @tool } from mcp "server"` and `import tools from mcp "server" as @name` proxy MCP servers as mlld executables
- **External MCP server spawning**: MCP configs accept command/npm servers with startup/idle lifecycle limits and guard routing
- **Return label modifications**: `=> pii @var`, `=> untrusted @var`, `=> trusted! @var`, `=> !label @var`, `=> clear! @var` apply label changes to returned values with trust asymmetry and privilege checks
- **Node module imports**: `import { @x } from node @package` auto-wraps exports, supports `new` constructor expressions, and streams async iterables
- **`mlld howto core-modules`**: List official @mlld modules with descriptions; `mlld howto @mlld/claude` shows module documentation directly
- **`mlld init`**: Quick non-interactive project initialization
  - Creates `mlld-config.json` and `mlld-lock.json` with sensible defaults
  - Creates `llm/run/` (scripts) and `llm/modules/` (local modules) directories
  - `--force` to overwrite existing config; `--script-dir` and `--local-path` for customization
- **Policy and security system**:
  - Label flow enforcement checks labeled data flows through run/show/output, pipelines, and `using` auth injections
  - `defaults.unlabeled` and `defaults.rules` enforce built-in label flow rules, including `untrusted-llms-get-influenced` auto-labeling and `no-sensitive-exfil`
  - Named policies via `/policy @name = { ... }` for export/import
  - `using auth:name` and `using @var as "ENV"` (plus `with { auth, using }`) pass credentials into exec/run from policy auth sources
  - `defaults.autosign` signs template content or variables selected by name patterns
  - `defaults.autoverify` prepends verify instructions for signed variables passed to llm-labeled executables
  - `capabilities.deny` command patterns block commands at runtime with hierarchical `op:cmd:*` most-specific precedence
  - Keychain access enforcement for auth injection and builtins with `{projectname}` expansion
  - Linux keychain provider uses secret-tool for system keychain access
- **Security audit log**: Records sign/verify, label/bless, and file write taint entries in `.mlld/sec/audit.jsonl`. Caches write-taint entries for file read lookups. File loads and imports merge prior write taint from the audit log.
- **User-defined privileged guards**: Guard directives support `guard privileged ...` and `with { privileged: true }`, staying active under guard overrides with privileged label operations.
- **Optional load syntax**: `<file.md>?` and `<**/*.md>?` returns null or empty array if file or glob results don't exist
- **Debug flags**: `MLLD_DEBUG_CLAUDE_POLL` emits poll diagnostics, `MLLD_CLAUDE_POLL_LOG` captures `claude` output, `MLLD_DEBUG_EXEC_IO` logs stdin write failures
- **Bare match form**: `when @expr [patterns]` works without the colon — `when @mode ["active" => x; * => y]` is now valid alongside the colon form
- **Bare exec invocation statements**: `@func()` in strict mode and `/@func()` in markdown mode execute with the same semantics as `run @func()`
- **`bail` directive**: `bail <message>` (and `/bail <message>` in markdown mode) terminates the entire script with exit code `1`, including from nested `if`/`when`/`for` blocks and imported modules.
- **CLI file payload flags**: `mlld <file>` accepts extra `--flag value` pairs and exposes them via `@payload`
- **`/hook` directive**: User-defined before/after hooks on functions, operations (`op:for:iteration`, `op:for:batch`, `op:loop`, `op:import`), and data labels
  - Transform chaining and per-hook error isolation (`@mx.hooks.errors`)
  - Function arg-prefix (`startsWith`) matching and hook-body directive/executable emissions
  - Loop operation contexts with `@mx.for.batchIndex`/`@mx.for.batchSize` metadata
  - User hooks run around built-in guard/taint hooks; nested operations suppress user hooks (non-reentrancy)
- **Checkpoint caching**: Automatic checkpoint caching for `llm` operations (no opt-in required)
  - `mlld run --fresh|--resume|--fork` and `mlld checkpoint list|inspect|clean`
  - Named checkpoints: `checkpoint "name"` with interpolation and `when` branch support
  - Resume targeting: `--resume @fn`, `--resume @fn:index`, `--resume @fn("prefix")`, `--resume "name"` with exact-match priority, prefix fallback, and ambiguity errors
  - Fork read-only overlay support for branching from existing checkpoint state
  - `@mx.checkpoint.hit`/`@mx.checkpoint.key` metadata; guard bypass on cache-hit paths
  - `--no-checkpoint` disables entirely, `--new` aliases `--fresh`
- **`mlld update` and `mlld outdated` in CLI help**: Both commands were missing from `mlld --help` output
- **`mlld registry update` unified with `mlld update`**: Delegates to the same `updateCommand` for consistent behavior
- **LSP tree-sitter WASM support**: `python` and `bash` code blocks (alongside `javascript`) for embedded syntax analysis

### Changed
- Hook directives no longer emit unused `scope` metadata in parsed hook filter nodes and hook directive meta; the dead `HookScope`/`HookDefinition.scope` shape has been removed.
- **Mandatory whitespace around arithmetic operators**: `@a - @b` requires spaces; `@a-b` is a hyphenated identifier, not subtraction. Applies to `+`, `-`, `*`, `/`, `%`.
- **CLI payload keys preserve hyphens**: `--skip-live` produces `@payload.skip-live` (primary) with deprecated `@payload.skipLive` camelCase alias.
- **StructuredValue `.mx` surface model**: Field access uses `.mx.*` for wrapper/system metadata (`.mx.text`, `.mx.data`). Top-level dotted access resolves through user data. System metadata (`.text`, `.data`, `.type`) no longer leaks at the top level.
- Built-in transformer/helper names are shadowable by user variables in scope (`@exists`, `@json`, `@upper`, `@keep`, etc.), and pipeline validation resolves scoped variables before builtin fallback. `mlld validate` reports builtin-name shadowing as informational output.
- JSON parsing transformers are canonicalized under `@parse` (`@parse`, `@parse.strict`, `@parse.loose`, `@parse.llm`, `@parse.fromlist`), while `@json*` names continue as deprecated aliases. `mlld validate` warns on `@json*` usage.
- Go/Python/Rust/Ruby SDK wrappers use persistent `mlld live --stdio` transport instead of per-call CLI shellouts.
  - All expose async handle APIs for `process` and `execute` with `wait/result`, `cancel`, and `update_state`.
  - `process` accepts payload/state/dynamic module injection options across wrappers.
  - `execute` merges `stateWrites` from final results and streamed `state:write` events.
- **`mlld init` renamed to `mlld module`**: Module creation is now `mlld module` (alias: `mlld mod`)
  - Previous `mlld init` behavior (interactive module creation) moved to `mlld module`
  - New `mlld init` provides quick project setup (see Added above)
  - `mlld setup` remains the interactive configuration wizard
- Environment providers use `@create` + `@execute` + `@release` with `envName`; `@checkpoint` is now `@snapshot`
- Named environment configs skip release by default; `keep` is ignored
- `nodePackageManager` config option runs the configured package manager after `mlld install`
- **`mlld run` timeout is now unlimited by default**
  - Previously defaulted to 5 minutes (300000ms)
  - `--timeout` now accepts human-readable durations: `5m`, `1h`, `30s`, `2d`, or raw milliseconds
- **`run` is now silent by default**: No more "Running: ..." status messages or blank lines for no-output commands. Use `| log "message"` for custom progress, or `--show-progress` to restore old behavior.

### Fixed
- **`mlld update` silently skipping registry modules**: `isRegistryEntry()` now recognizes `raw.githubusercontent.com` hosts, so registry modules are no longer skipped during updates.
- **`mlld outdated` showing "no registry metadata"**: Metadata path corrected to `resolution.metadata`.
- **`@` escaping consistency**: `@@` and `\@` produce literal `@` in all contexts — cmd blocks, backtick/prose templates, double/single quotes, `::...::` templates, `.att` template files, and streaming templates.
- **Guard operation label matching**: `op:cmd`, `op:run`, and `op:exe` labels match exe invocations with alias expansion across `cmd`, `sh`, `js`, `node`, and `py`. `guard before <label>` matches exe operation labels in addition to data labels, with deduplication preventing double-firing.
- **Guard `@input`/`@output` operation context**: Operation guards expose `@input.any.text.includes(...)` (with `all`/`none` variants) for content inspection. Post-operation guards bind `@input` to inputs and `@output` to return values.
- **Working-directory overrides for `run`**: `run cmd:@dir { ... }` works consistently in top-level, `if`, `for`, `when`, nested block, and result-collecting (`=>`) contexts. `var` assignments route through run execution for cwd/policy/guard parity. `~` expansion supported.
- **Ternary expression correctness**: Ternary expressions returning arrays or objects preserve actual values instead of stringifying to JSON. Missing field access in conditions returns undefined instead of throwing. Method calls in branches (`@tier ? @tier.split(",") : []`) parse correctly. Array/object literals work in ternary and when result positions.
- **Conditional object fields**: `"key"?: @value` syntax correctly includes/excludes fields across all compositions — objects with only conditional fields, mixed literal and conditional fields, bare `var` keyword, and literal truthy values.
- **Variable scoping isolation**: Function parameters no longer leak back to the caller's scope. `let` bindings in when/for blocks and nested function scopes no longer clobber outer variables. Let bindings never merge back to parent scope.
- **StructuredValue correctness**: `.trim()` works on JSONL arrays. JS blocks receive native arrays from StructuredValue inputs (`.keep` preserves wrapper when needed). `cmd`/`sh` outputs wrapped with `.text`, `.data`, and `.mx` metadata. `/output` and `/show` write clean JSON without wrapper fields. Nested arrays normalize correctly. Parameters in shadow environments recursively unwrap.
- **`@root` alias**: `@root` is available as a preferred alias for `@base` — both resolve to the project root with full interpolation parity.
- **`for parallel` canary fail-fast**: Runs the first qualifying iteration synchronously and propagates its error.
- **`var` inside block statements**: `if`, `for`, and `when ... => [ ... ]` action blocks raise a targeted parse error with guidance to use `let`.
- **Inline comment marker spacing**: `<<` and `>>` require preceding whitespace when used as inline comments.
- **Per-item parse resilience in glob JSON loading**: One malformed `.json` file no longer kills the entire glob array; it degrades to text with `parseError` metadata.
- **Bare `bail` statement boundary**: `bail` without an inline message no longer consumes the next directive line.
- **Content loader parse diagnostics**: JSON and JSONL parse failures retain specific error details.
- **Nested guard denials in `when` actions**: Route through denied handlers instead of surfacing as condition failures.
- **Pipeline null values**: JSON `null` values pass through pipeline stages correctly.
- **Guard transform unwrapping**: Fixed double-wrapping that caused Variable-inside-Variable nesting.
- **Before label guard transform composition**: Sequential `before ... for <label>` guards evaluate against the latest transformed input.
- **`run js`/`run node` console precedence**: Explicit return values take precedence over `console.log` output.
- **NaN truthiness handling**: `"NaN"` (case-insensitive) is falsy across `if`, `when`, and conditional inclusion.
- **Python `exe` code normalization**: Python blocks dedent shared leading indentation; `py { ... }` single-line syntax works. `py` parses in assignment contexts wherever `python` is accepted.
- **Run-dispatched exec null parameter preservation**: `/run @exe(...)` preserves runtime `null` for conditional fragments.
- **Tool-call tracking in exec invocation**: `@mx.tools.calls` records regular executable invocations (not only MCP calls). `@mx.tools.allowed` and `@mx.tools.denied` populated from env mcpConfig.
- **String concatenation with `+` diagnostics**: Targeted error for non-numeric `+` with template-interpolation hint.
- **`var run ... using auth:name` parity**: Auth injection preserved through var command nodes.
- **Var expression descriptor propagation**: Taint/label metadata carries through var RHS and assignment resolution.
- **`@mx.op.labels` guard access**: Resolves as an array even when operations have no labels.
- **Before operation guard transform boundaries**: Combined guards unwrap replacement values before reinsertion.
- **Denied handler consistency in `for` loops**: Same fallback values inside and outside loops.
- **Install confirmation guidance**: `mlld install` prints `module@version installed` with ready-to-copy import statement.
- **For directive `when` guard blocks**: `/for` directives parse `for @item in @items when @cond [ ... ]` with block return syntax. For-expression guards accept block bodies in addition to `=>` forms.
- **Relative path scope**: `output`/`append` paths resolve from the script file directory.
- **Template file alligator path scope**: `<file>` loads in templates resolve from the template file directory.
- **Export manifest enforcement**: Importers cannot read unexported module members through internal captured env.
- **Multi-line import parsing**: Import lists parse correctly across multiple lines. Malformed import errors anchor to the import directive.
- **`mlld init` resolver config**: Writes resolver prefixes to `resolvers.prefixes`. Runtime reads both legacy `resolverPrefixes` and normalized form.
- **`when` values in exe blocks**: `WhenExpression` statements correctly early-return non-null values. Validation warns on implicit value actions in exe-block `when` branches.
- **`@payload` resolver guidance**: Unresolved `@payload` imports explain the `mlld run` context.
- **`file.mx.path` metadata alias**: Exposes `.mx.path` as alias of `.mx.absolute`.
- **Directive error line numbers**: Correctly extracts line/column from AST source locations.
- **Error messages no longer prefix directives with `/`**: `for expects an array` instead of `/for expects an array`.
- **`let` shadowing**: `let` inside blocks errors when redefining outer non-block-scoped variables.
- **When expression error diagnostics**: Errors include condition text, source location, full condition/action pair text, and preserve caller file paths.
- **Spread operator typo**: `..@var` produces a targeted error suggesting `...@var`.
- **`/run @exe(...)` structured arguments**: Inline object/array literals and spread parameters (`{ ...@data }`) preserved as runtime data for code executables.
- **Array `.includes()` with variable references**: Compares normalized values for consistent membership checks.
- **Structured field-access arguments in search methods**: `includes`, `indexOf`, `startsWith`, `endsWith` normalize StructuredValue arguments across expression contexts.
- **Imported executable parameter shadowing**: Caller variables no longer collide with imported parameter names.
- **Exe-block code parameter binding**: Code blocks (`sh`/`cmd`/`js`/`python`/`node`) inside executable blocks receive bound parameters. Path objects bind to resolved path strings.
- **Exe return arithmetic after invocations**: `=> @fn(...) * 1` and similar continuations parse correctly.
- **If/when guidance**: Parse errors include educational cheat sheet showing if vs when semantics and valid forms.
- **Expressions in function arguments**: Binary and ternary expressions parse inside function arguments and array literals. Block expressions surface a targeted parse error.
- **For-expression file metadata**: Mapping/filtering file-loaded values preserves `.mx` metadata.
- **Return statements in when-expression blocks**: Bubble to the enclosing exe function.
- **Shell alias resolution in `sh {}` blocks**: Shell aliases now resolve correctly (previously only worked in `cmd {}` blocks).
- **`output ... to @variable` in when blocks**: Variable targets work in output directives inside when blocks.
- **`let` pipelines with backtick templates**: `let @x = \`template\` | log` correctly executes the pipeline instead of silently stripping it.
- **`run stream @exec()` parsing**: Run directives accept stream modifiers and tail options on exec invocations.
- **After-guard retry**: Retryable after-guard flows emit output once. `run @exe(...)` contexts mark sources as retryable for `guard after ... => retry`.
- **For block return-only syntax**: `[ => @x * 2 ]` parses correctly in for loops.
- **When expressions in var assignments**: Uses first-match semantics. Wildcard `*` patterns match correctly.
- **Command stdin EPIPE handling**: stdin write errors no longer crash mlld. Large shell parameters switch to heredoc at 64KB using `read` to avoid command substitution limits.
- **Pipeline scalar stage binding**: Stage inputs auto-parse JSON scalars for code-language stages.
- **Pipeline JS transformer logging**: Trailing expression return values preserved alongside `console.log` output.
- **Pipeline context references**: `@p[-1]` correctly returns evaluated outputs when pipelines start with exe calls.
- **log/output falsy values**: `false` and `0` output correctly instead of empty string.
- **Field access on 'type' property**: Returns user data value instead of internal Variable type discriminator.
- Missing object/array fields named `source` or `metadata` now resolve as missing data in expressions and `@exists`, instead of falling back to Variable metadata.
- **JSON/JSONL parse errors**: Shows proper error messages instead of "Failed to load content".
- **HTML/XML detection in templates**: Angle bracket content matching HTML patterns (`<tagname attr="value">`) recognized as literal HTML. Backslash-escaped characters (`\@`, `\.`, `\*`, `@@`) prevent false file reference detection inside angle brackets.
- **Backtick template literals in exec arguments**: `@echo(@name)` where `@name` holds a backtick literal correctly evaluates.
- **Pipeline retry @input staleness**: Leading effects see fresh values during retry.
- **Circular imports**: Clear error message instead of infinite recursion.
- **Empty arrays in for loops**: Iterate zero times instead of throwing.
- **`foreach` with separator**: `with {separator: "..."}` applies correctly.
- **`sh {}` blocks in `for parallel()`**: Execute concurrently instead of blocking the event loop.
- **Empty comments consuming next line**: `>>` alone no longer consumes the following line.
- **Negation with method calls in templates**: `!@arr.includes("c")` evaluates correctly.
- **for-when in exe blocks**: Returns array value for `.length` and other operations.
- **When block accumulation in exe**: Augmented assignments execute correctly inside when blocks.
- **Glob JSON parsing**: Glob-loaded `.json` files auto-parse; `.mx` metadata preserved in for loops.
- **`mlld howto` display**: Atom list shows correctly under category headers.
- **Triple-colon template file references**: `<...>` inside triple-colon templates treated as literal text.
- **When expression null actions**: Null results no longer fall through to the next condition.
- **Loop control in when action blocks**: `done` and `continue` propagate to enclosing loops.
- **For-expression OR conditions**: `||` treated as logical OR in `for ... when` filters.
- **Section extraction with parentheses**: `<file # section>` matches headings with parentheses.
- **Dynamic module registration**: Supports mixed user-data and external modules in one run.
- **Path resolution guidance**: Missing file paths include did-you-mean suggestions; relative paths resolve from current mlld file.
- **Template extension field-access hint**: `@name.json` ambiguity explained with escape suggestion.

### Documentation
- **Removed deprecated transformers**: `@xml`, `@csv`, `@md`, `@upper`, `@lower` no longer documented (moving to userland modules)
- **`show { ... }` object-literal docs cleanup**: Uses `var`-then-`show` examples instead of inline forms
- **File loading docs for `.jsonl`**: Documents `<file.jsonl>` auto-parsing
- **Guard timing and composition clarity**: Docs compare `before LABEL` vs `before op:TYPE`, document `always` timing, before-transform last-wins vs after-transform chaining, and `denied` handler scope
- **Module and import docs**: Distinguish import forms, document relative path resolution from script directory, and clarify `needs` as requirement validation
- **Pipeline basics docs**: Lists built-in transformers, clarifies stage behavior, includes retry/fallback examples
- **Conditional variable docs**: Distinguishes tight template form (`@var??"default"`) from spaced expression form (`@a ?? @b`)
- **Template syntax accuracy**: `.att` documentation uses correct syntax and clarifies condensed pipe syntax

### Removed
- **`when` first-match modifier**: Removed. `when` uses first-match semantics by default.
- **`.content` accessor on StructuredValue**: Use `.text` instead. `LoadContentResult.content` unchanged.
- **`/show` command/code execution forms**: Use `/run` instead.
- **`/path` directive**: Use `/var` assignments and `<...>` for content loading.

## [2.0.0-rc81-ab]

### Added
- Source provenance taint labels apply to command outputs, URL loads, and @input resolver values
- Guard allow actions support label modifications (`addLabels`, `removeLabels`, `warning`) with protected label enforcement
- Guard env actions route execution through environment providers with `src:env:*` labels and `@release` lifecycle
- `@mlld/env-docker` environment provider module
- `/profiles` directive declares capability profiles and exposes the selected profile in `@mx.profile`
- `mlld env` starts MCP servers from `@mcpConfig()` output and injects MCP connection env for spawned sessions
- SDK analyze metadata includes module profiles
- Optional field access suffix `?` for explicit missing-field access
- `/if` directive for conditional execution with optional `else` blocks and exe-level returns

### Changed
- `when` defaults to first-match behavior for directive and expression forms; the first-match modifier warns and behaves the same

### Fixed
- Guard override lists accept unquoted `@guard` names
- Resolver caching skips non-module resolvers, preserving metadata like `@input` taint
- Missing field access returns null instead of throwing

## [2.0.0-rc81]

### Added
- **Python executor hardening**: `py { }` now has feature parity with `node { }` for code execution
  - Basic execution: `exe @add(a, b) = py { return int(a) + int(b) }`
  - Multi-line code blocks with proper indentation handling
  - Standard library support: `import json`, `import math`, etc.
  - Variable passing with mlld metadata preservation (`__mlld_type__`, `__mlld_metadata__`)
  - `mlld.is_variable()` helper to check if a value is a wrapped mlld Variable
  - Array/list indexing and iteration support
  - Return type support: strings, numbers, lists, dicts all work correctly
- **Python shadow environments**: Define reusable Python functions accessible across code blocks
  - Syntax: `exe py = { helper1, helper2 }` exposes functions to all `py { }` blocks
  - Functions persist across executions within a session
  - Supports cross-function calls within the same environment
  - Works with lexical scoping through imports (captured at definition time)
- **Python streaming output**: `py { }` blocks support streaming via StreamBus
  - `print()` output streams incrementally during execution
  - Progress visible in real-time for long-running Python code
- **Python package imports** (experimental): Import Python packages into mlld scripts
  - Syntax: `import "@py/numpy"` or `import "@python/pandas"`
  - PythonPackageResolver introspects packages and generates mlld wrappers
  - PythonAliasResolver provides `@python/` as an alias for `@py/`
  - Integrates with mlld-lock.json for package version tracking
- **Self-documenting help system**: `mlld howto` provides LLM-accessible documentation directly in the CLI
  - `mlld howto` - Show topic tree with intro pinned at top
  - `mlld howto intro` - Introduction with mental model and key concepts
  - `mlld howto <topic>` - Show all help for a specific topic (e.g., `mlld howto when`)
  - `mlld howto <topic> <subtopic>` - Show specific subtopic (e.g., `mlld howto when-inline`)
  - `mlld howto grep <pattern>` - Search across all atoms for matching lines
  - `mlld qs` / `mlld quickstart` - Quick start guide
  - Built on atom-based documentation architecture (docs/src/atoms/) enabling DRY content reuse
  - Pattern documented in docs/dev/HOWTO-PATTERN.md for adoption by other tools
  - Documentation atoms: 106 atoms extracted covering intro, syntax, commands, modules, patterns, security, configuration, and common mistakes
  - Git pre-commit hook auto-updates atom 'updated' dates when modified atoms are staged
  - Colorized terminal output: syntax-highlighted code blocks, colored headers, topic tree with colored categories and IDs
- **Prose execution**: Define executable functions that invoke a prose interpreter via LLM
  - Syntax: `exe @fn(params) = prose:@config { inline content }`
  - File-based: `exe @fn(params) = prose:@config "file.prose"`
  - Template files: `.prose.att` (`@var`) and `.prose.mtt` (`{{var}}`); `.prose` files do not interpolate
  - Config uses model executors: `{ model: @opus, skills: [...] }`
  - Pre-built configs available from `@mlld/prose` public module
  - Requires [OpenProse](https://prose.md) skill or another prose interpreter
  - Skills must be approved in Claude Code before use
  - See [docs/user/prose.md](docs/user/prose.md) for full documentation
- **`mlld validate`**: Static analysis command for syntax validation without execution
  - `mlld validate <file>` - Validate syntax and show module structure (exports, imports, executables, guards, needs)
  - `--format json` - Machine-readable JSON output for tooling integration
  - `--ast` - Include parsed AST in JSON output (requires `--format json`)
  - Returns exit code 1 for invalid files, enabling CI/toolchain integration
  - `mlld analyze` as alias
- **Loop blocks**: Block-based iteration with `loop`, `until`, pacing, `@input`, and `@mx.loop` context

### Changed
- **Terminology**: "prose mode" renamed to "markdown mode" to avoid confusion with prose execution
  - `.md` and `.mld.md` files use "markdown mode" (slash-prefixed directives)
  - "prose" now refers to OpenProse/prose execution, not the file format

### Fixed
- **`mlld howto` shows all atom categories**: Fixed howto command to load atoms from all 8 categories (syntax, commands, control-flow, modules, patterns, configuration, security, mistakes) instead of only control-flow
- **Ternary expressions with template literals**: Fixed parse error when using backtick templates in ternary branches (e.g., `@x > 3 ? \`big: @x\` : "small"`). Templates are now properly parsed in ternary contexts without interfering with other expression parsing.
- **Python error handling**: Python errors now show helpful context like `node { }` errors
  - Syntax errors include line numbers and context
  - Runtime errors (NameError, ZeroDivisionError, etc.) include stack traces
  - Error messages propagate correctly through the CLI error handler

## [2.0.0-rc80]

### Added
- **`mlld docs @author/module`**: New command to display module documentation, showing `# tldr` section followed by `# docs` section from published modules
- **`mlld info` shows real registry data**: Now fetches actual module metadata from registry (version, needs, license, repo, keywords) and appends the `# tldr` section
- **Colorized CLI output**: Module info and docs display with syntax highlighting for mlld code blocks, colored headers, and formatted metadata
- **`mlld-run` blocks use strict mode**: Code inside `mlld-run` fenced blocks now parses in strict mode (slashes optional, no prose between directives)
- **Transitive dependency installation**: `mlld install` now automatically installs mlld module dependencies (npm-style)
  - When installing `@alice/utils`, its `dependencies` from frontmatter are discovered and installed
  - Recursive: transitive deps of deps are also installed
  - All modules recorded in `mlld-lock.json` (config unchanged - only direct deps in `mlld-config.json`)
  - Install summary shows breakdown: "3 modules installed (1 direct, 2 transitive)"
  - Lazy runtime fetching still works as fallback for modules not pre-installed

### Fixed
- **Module publish validation for exe declarations**: Fixed `ExportValidator` not recognizing exe declarations where the identifier is a `VariableReference` node. This caused `mlld publish` to fail with "Exported name is not declared" errors for modules like `@mlld/array` and `@mlld/string`.
- **Module scope isolation for nested imports**: Fixed bug where importing a module that internally imports from another module would cause "variable already imported" errors. Child module scopes are now properly isolated from parent scope during import evaluation.
- **Executable preservation in object properties**: Fixed bug where executables stored as object properties would lose their Variable wrapper during import, causing `isExecutableVariable()` to return false. Object property executables are now properly reconstructed during import.
- **Registry publish SHA error**: Fixed "sha wasn't supplied" error when publishing new versions of existing modules. The existing tags.json SHA is now properly fetched and provided when updating.
- **Duplicate version publish check**: `mlld publish` now checks if the specific version already exists in the registry before attempting to create a PR, preventing wasted effort on duplicate publishes.

## [2.0.0-rc79]

### Added
- **Strict mode for .mld files**: Bare directive syntax without slash prefixes
  - `.mld` files use strict mode: bare directives (`var`, `show`, `exe`), text lines error, blank lines ignored
  - `.mld.md` and `.md` files use markdown mode: require `/` prefix, text becomes content (existing behavior)
  - Slash prefix optional in strict mode for backward compatibility (`/var` and `var` both work)
  - SDK defaults to strict mode for raw strings (no file path) and unknown extensions
  - File extension determines parsing mode: `.mld` → strict, `.mld.md`/`.md` → markdown
  - CLI flags: `--loose`/`--markdown`/`--md`/`--prose` force markdown mode
  - Mode included in AST cache keys to differentiate same file parsed in different modes
- **Block syntax for exe and for**: Multi-statement bodies using `[...]` delimiters
  - Exe blocks: `/exe @func() = [let @x = 1; let @y = 2; => @x + @y]` (statements separated by newlines or semicolons)
  - For blocks: `/for @item in @items [show @item; let @count += 1]` (`=>` optional for block bodies)
  - When-expression exe block actions: `when [ @cond => [...] ]` supports full exe block semantics (let, side effects, return)
  - `let @var = value` creates block-scoped variables; `let @var += value` for augmented assignment (arrays, strings, objects, numbers)
  - `=> @value` optional return must be the last statement when present in exe blocks
  - Nested for/when inside blocks supported; inner directives are slashless
  - Blocks use `[...]` (not `{...}`) to distinguish mlld control flow from code/command/data
- **Block syntax for var**: `/var @value = [let @x = ...; => @x]` evaluates a local statement block and returns its value
- **Block comments in bracket bodies**: `>>`/`<<` comments inside `[...]` blocks (exe, for, when, guard, when-expressions) are consumed as whitespace
- **While loops**: Bounded iteration with `done`/`continue` control flow
  - `/while (100) @processor` - directive form with iteration cap
  - `@input | while(100, 1s) @processor` - pipeline stage with optional pacing
  - `done @value` terminates iteration and returns value
  - `continue @newState` advances to next iteration with new state
  - `@mx.while.iteration` (1-based) and `@mx.while.limit` available in processor
- **Streaming format adapters**: NDJSON streaming parsed via configurable adapters
  - `with { streamFormat: "claude-code" }` for Claude SDK-specific parsing
  - Default `ndjson` adapter handles generic JSON streaming
  - `with { streamFormat: @adapterConfig }` accepts custom AdapterConfig objects
- **Command working directories**: `cmd:/abs/path`, `sh:/abs/path`, `bash:/abs/path`, `js:/abs/path`, `node:/abs/path`, and `python:/abs/path` set the execution directory for `/run`, inline pipelines, and `/exe` definitions; execution fails on relative, missing, or non-Unix paths
- **Template collection imports**: Load entire directories of templates with shared parameter signatures
  - `/import templates from "@base/agents" as @agents(message, context)` imports all `.att`/`.mtt` files
  - Access by filename: `@agents["alice"](@msg, @ctx)` or nested: `@agents.support["helper"]`
- **Directory module imports**: Import a directory that loads each immediate subdirectory `index.mld`
  - Returns an object keyed by sanitized directory name with each `index.mld` export set as the value
  - Skips `_*` and `.*` directories by default, override with `with { skipDirs: [] }`
- **@exists() builtin**: Returns true when an expression evaluates without error (string args check paths; glob args require at least one match)
- **When separators**: Semicolons separate when arms in directives and expressions
- **Bound-value when-expressions**: `when @value first [...]` and `when @value [...]` support pattern arms like `>= 0.7`, `>= 0.3 && < 0.7`, and `*`
- **Nullish coalescing operator**: `??` returns the left operand when it is not nullish, otherwise returns the right operand
- **For-when filter sugar**: `for ... when ...` drops non-matches without null placeholders via implicit `none => skip` branch
- **Conditional inclusion (`@var?`)**: Universal pattern for conditionally including content based on truthiness
  - Commands/Templates: `@var?`...`` - include backtick template if truthy (e.g., `cmd { echo @tools?`--tools` }`)
  - Strings: `@var?"..."` - include quoted fragment if truthy (e.g., `"Hello @title?"@title "`)
  - Arrays: `[@a, @b?, @c]` - omit element if falsy
  - Objects: `{key?: @val}` - omit pair if value is falsy
  - Field access supported: `@obj.field?`...`` evaluates full path before truthiness check
- **Object mx helpers**: `@obj.mx.keys`, `@obj.mx.values`, and `@obj.mx.entries` expose object utilities
- **For-loop item keys**: `@item.mx.key` exposes the current object key (alongside `@item_key`)
- **Parallel execution error accumulation**: Errors accumulate in `@mx.errors` array instead of failing fast
  - `/for parallel @x in @xs [complex-block]` supported with block-scoped `let` only
  - Failed iterations produce error markers `{ index, key?, message, error, value }` in results
  - Parallel pipeline groups (`|| @a || @b || @c`) also accumulate errors
- **Comments in block bodies**: `>>` (start-of-line) and `<<` (end-of-line) comments work inside `[...]` blocks

### Changed
- **Renamed `@ctx` to `@mx`**: The execution context variable is now `@mx` ("mlld execution"). Access retry count via `@mx.try`, hints via `@mx.hint`, stage info via `@mx.stage`, etc. The `.ctx` metadata namespace on variables is now `.mx` ("metadata")—use `@file.mx.filename`, `@file.mx.tokens`, etc.
- `/exe` RHS pipe sugar accepts direct `@value | cmd { ... }` pipelines (legacy `run` form still works); identity definitions keep with-clause pipelines when evaluating parameters
- **Mode-aware parsing**: Environment variable `MLLD_STRICT=1` forces strict mode, `MLLD_STRICT=0` forces markdown mode, overriding file extension inference
  - FormatAdapterSink and TerminalSink are mutually exclusive
- **Import from @payload and @state**: Route files can now import fields from execute() payload and state
  - `/import { @message, @userId } from @payload` imports specific fields
  - `/import { @conversationId } from @state` imports state fields
  - Enables explicit, auditable access to runtime-injected data
  - Similar pattern to `/import { USER } from @input` for environment variables
- **Live @state and literal payload strings**: `@state` reads stay fresh after state writes, and `@payload/@state` dynamic modules emit literal strings so @mentions and user data do not interpolate.
- **LoadContentResult implements StructuredValue surface**: File loading now returns values with `.text`, `.data`, and `.mx` surfaces. Access metadata via `.mx.filename`, `.mx.tokens`, `.mx.fm` etc. Direct property access (`.content`, `.filename`) remains for backward compatibility but `.mx` is recommended for new code.
- **Simplified .keep usage**: Metadata now accessible in mlld contexts without `.keep` (e.g., `@file.mx.filename` works directly). `.keep` only needed when passing to JS/Node to preserve StructuredValue wrapper. Apply `.keep` at call site (`@process(@file.keep)`) rather than variable creation.

### Fixed
- **@debug variable stack overflow**: Fixed infinite recursion when accessing `@debug`. Variable metadata getter was calling itself recursively when building context snapshot.
- **Exe block return-only syntax**: Exe blocks can now return directly without a let statement: `exe @f() = [ => { name: "hello" } ]`
- **Method calls in object literal values**: Method calls like `@x.trim()` now work as object literal values in returns: `=> { file: @f.mx.relative, review: @review.trim() }`
- **`.mx` access in for loops**: File metadata (`@f.mx.relative`, `@f.mx.filename`) now accessible when iterating over glob results in all contexts: direct interpolation, object literals (`{ file: @f.mx.relative }`), and exe function parameters.
- **@json error clarity**: `@json` throws clear errors when parsing fails instead of silently mangling input. Detects markdown code fences and suggests `@json.llm`.
- **Pipeline filter error**: Writing `| json` instead of `| @json` now gives helpful error: "Pipeline filters require the @ prefix"
- **Arithmetic operators in exe blocks**: Math operators (`+`, `-`, `*`, `/`, `%`) work in exe blocks, let assignments, and return values
- **Universal StructuredValue model**: All runtime values flow as StructuredValues with `.text`, `.data`, and `.mx` surfaces. Boundaries use `asData()`/`asText()` for extraction. Fixes when-expressions returning numbers, object serialization, and numeric comparisons.
- **Field access precedence**: User data properties take precedence over guard quantifiers (`.all`, `.any`, `.none`). Core metadata (`.type`, `.mx`) always from Variable.
- **Standalone @ in double-quoted strings**: `@` not followed by identifier treated as literal character (`.startsWith("@")` now works)
- **Setup in nested directories**: `mlld setup` detects parent config and prompts to update parent or create new local config
- Effect actions (`show`, `log`, `output`, `append`) work uniformly in all RHS contexts
- Streaming no longer produces duplicate output when using format adapters
- Regex arguments are parsed as RegExp values, so `.match(/.../)` conditions (including grouped patterns) work in when-expressions and other exec calls without falling back to strings
- Block directive parse errors reparse with correct offsets for better error locations
- Registry publish flow improvements: recreates missing fork refs, minimal PR bodies, better error messages
- Module installer honors requested versions by purging mismatched cache entries
- Lock file normalization strips version suffixes to prevent duplicates
- Variable boundary escaping (`@var\.ext`) works in all interpolation contexts
- `@@` and `\@` both escape to literal `@`
- Template paths support `@var` interpolation in double-quoted strings
- CLI `--payload` alias for `--inject`
- **ESM bundle compatibility**: MJS bundle fixed for Node 24+ ESM projects (converted `require()` calls to ESM imports)
- **LSP: Mode-aware highlighting**: Language server detects `.mld` (strict) vs `.mld.md` (markdown) and highlights bare directives correctly; text content in strict mode shows diagnostics; completions adapt to mode
- **/var augmented assignment errors**: Invalid `@x = @y += @z` errors stop at the `+=` instead of earlier lines in LSP diagnostics
- **Exe block += evaluation**: `let @result = @a; @result += @b` concatenates arrays instead of replacing them
- `run` statements work inside `[...]` blocks for `/exe` and `/for` bodies
- Fixed `/run @value | cmd { ... }` parsing so `@value` becomes `with { stdin: ... }` (matches `/exe` RHS pipe sugar)
- **LSP: rc78 syntax support**: Semantic tokens for block syntax `[...]`, `let` keyword, `+=` augmented assignment, `while`/`done`/`continue`, `stream` directive, working directories `cmd:/path`, when semicolons
- **LSP bug fixes**: When block assignments ([#327](https://github.com/mlld-lang/mlld/issues/327)), pipe transform parity ([#328](https://github.com/mlld-lang/mlld/issues/328)), EOL comments in when ([#329](https://github.com/mlld-lang/mlld/issues/329)), variable interpolation in /run ([#330](https://github.com/mlld-lang/mlld/issues/330)), function execution in /run ([#331](https://github.com/mlld-lang/mlld/issues/331)), array/object value highlighting ([#332](https://github.com/mlld-lang/mlld/issues/332))
- **LSP debugging tools**: `npm run validate:tokens`, `npm run test:nvim-lsp <file>` for testing semantic highlighting
- **LSP tokenization fixes**: Negative char positions causing Neovim crashes, missing visitor registrations (field/numericField/arrayIndex/LetAssignment/ExeReturn), container object recursion in visitChildren(), ExecInvocation wrong token type.

## [2.0.0-rc77]

### Added
- **CLI `--structured` mode**: New `--structured` flag outputs JSON with effects, exports, stateWrites, and full security metadata for auditing and programmatic consumption
- **CLI `--inject` flag**: Runtime module injection via `--inject @module=value` or `--inject @module=@file.json`. Enables testing with mock data and dynamic context without temp files. Multiple `--inject` flags supported.
- **MCP static analysis**: `mlld mcp` now uses `analyzeModule()` for tool discovery instead of code execution, improving security by discovering tools without running arbitrary code
- **SDK execution modes**: `interpret(mode)` with four modes for different consumption patterns
  - `document` (default): Returns plain string output
  - `structured`: Returns `{ output, effects, exports, environment }` with security metadata on all effects
  - `stream`: Returns `StreamExecution` handle with real-time event delivery (`.on()`, `.off()`, `.done()`, `.result()`, `.abort()`)
  - `debug`: Returns `DebugResult` with AST, variables, ordered trace, and timing
- **Dynamic module injection**: `processMlld(script, { dynamicModules: {...} })` enables runtime context injection without filesystem I/O. All dynamic imports automatically labeled `src:dynamic` for guard enforcement. Enables multi-tenant applications (inject per-user/project context from database). Optional `dynamicModuleSource` parameter adds custom source labels (e.g., `src:user-upload`, `src:database`) for fine-grained guard policies distinguishing between trusted and untrusted dynamic data.
- **State write protocol**: `/output @value to "state://path"` captures state updates as structured data instead of writing to filesystem. State writes included in `StructuredResult.stateWrites` with security metadata.
- **SDK runtime execution**: `execute(filepath, payload, options)` provides file-based route execution with in-memory AST caching, state hydration (`@state`, `@payload`), timeout/cancellation, and full effects logging.
- **SDK analysis tools**: `analyzeModule(filepath)` extracts capabilities, imports, exports, guards, and security metadata without execution. Enables static analysis, capability checking, and module introspection.
- **Effect security metadata**: All effects in structured/stream/debug modes include `security` field with labels, taint tracking, and provenance for auditing and policy enforcement.
- **Execution events**: `ExecutionEmitter` bridges streaming infrastructure to SDK events (`stream:chunk`, `command:start/complete`, `effect`, `execution:complete`) for real-time monitoring.
- **Directory-based taint tracking**: File loads now include `dir:*` labels for all parent directories, enabling guards like `@input.ctx.taint.includes('dir:/tmp/uploads')` to prevent executing uploaded files.

### Changed
- **Security model streamlined**: `SecurityDescriptor` now uses `taint: DataLabel[]` (accumulated labels) instead of single `taintLevel` enum. Automatic labels added: `src:exec` (commands), `src:file` (file loads), `src:dynamic` (runtime injection), `dir:/path` (file directories).
- Effect handler now records effects when `mode: 'structured' | 'stream' | 'debug'`; default `document` mode skips recording for performance.
- **`mlld run` now uses `execute()`**: Run command leverages AST caching, metrics, and timeout support from SDK's `execute()`. New `--timeout` and `--debug` flags available.

### Fixed
- **Whitespace normalization** ([#396](https://github.com/mlld-lang/mlld/issues/396)): Introduced OutputIntent abstraction with collapsible breaks to eliminate extra blank lines. Newlines from document structure now collapse automatically, producing consistent output spacing.
- **Prettier dependency removed** ([#281](https://github.com/mlld-lang/mlld/issues/281)): Replaced Prettier with simple line-based normalizer. Eliminates hanging bug, removes JSON protection hacks, and improves performance (~0ms vs ~50ms). The `@md` transformer now normalizes output (strips trailing whitespace, collapses blank lines) rather than reformatting.
- Array slicing now supports variable interpolation in slice indices ([#457](https://github.com/mlld-lang/mlld/issues/457)). Previously `@arr[0:@limit]` would fail to parse; now `@arr[@start:@end]`, `@arr[0:@limit]`, and `@arr[@offset:]` all work as expected.
- Fixed issue where `/var @item = cmd {..}` would fail due to missing grammar pattern
- Pipeline effects (`output`, `show`, `append`, `log`) run through guard pre/post hooks. `op:output`/`op:show`/`op:append`/`op:log` guards block both directives and inline effects; guard retries on effects deny with a clear message.

## [2.0.0-rc76]

### Fixed
- Circular reference detection for executables ([#255](https://github.com/mlld-lang/mlld/issues/255)): mlld now detects when an executable calls itself recursively without a terminating condition and throws a clear `CircularReferenceError` instead of causing a stack overflow. This includes both direct recursion (`@f()` calling `@f()`) and mutual recursion (`@ping()` ↔ `@pong()`). Legitimate patterns like pipeline retries and builtin method calls are excluded from detection.
- Liberal import syntax: quoted module paths like `"@local/module"` and `"@base/file.mld"` now work alongside unquoted forms ([#300](https://github.com/mlld-lang/mlld/issues/300)). The interpreter detects resolver patterns in quoted strings and routes them correctly instead of treating them as variable interpolation.
- ProjectPathResolver now recognizes `.mld.md` and `.mlld.md` extensions as modules, fixing imports from `@base/...` paths
- SpecialVariablePath in grammar now stops at line boundaries, preventing path parsing from consuming content across newlines

## [2.0.0-rc75]

### Added
- Object spread syntax `{ ...@var, key: value }` for composing objects with left-to-right overrides; spreading non-objects now errors.
- Augmented assignment `@var += value` for local variable accumulation in when blocks. Supports arrays (concat), strings (append), and objects (shallow merge). Only works with local `let` bindings, maintaining global immutability.

### Fixed
- Improved error message for alligator field access inside XML/HTML tags - now detects pattern and suggests variable workaround
- Fixed `as` transform pattern for glob patterns - `<*.md> as "### <>.ctx.filename"` now correctly transforms each file instead of returning empty array
- `/show` directive now errors on multiple arguments instead of silently ignoring extras ([#370](https://github.com/mlld-lang/mlld/issues/370)). Use templates for multiple values: `/show \`@a @b\``

## [2.0.0-rc74]

### Fixed
- `run cmd {...}` syntax now works consistently in `/var` and `/exe` contexts, not just `/run` directives. Previously `/var @x = run cmd {echo "hi"}` and `/exe @f() = run cmd {echo "hi"}` would fail to parse. Both `run {...}` (implicit cmd) and `run cmd {...}` (explicit) are now supported everywhere for backwards compatibility.

## [2.0.0-rc73]

### Added
- `let` keyword for local variables in `/when` blocks: `let @x = value` creates block-scoped variables before conditions, enabling cleaner conditional logic without polluting outer scope
- `/run cmd {command}` syntax for shell commands, consistent with `cmd {..}` in other contexts. Bare `/run {command}` still works for backwards compatibility.
- AST selector wildcards ([#505](https://github.com/mlld-lang/mlld/issues/505)): `{ handle* }`, `{ *Validator }`, `{ *Request* }`, `{ get? }` for pattern-based symbol matching
- AST type filters: `{ *fn }`, `{ *var }`, `{ *class }`, `{ *interface }`, `{ *type }`, `{ *enum }`, `{ *struct }`, `{ *trait }`, `{ *module }`, `{ * }` to get all definitions of a specific type
- AST name listing: `{ ?? }`, `{ fn?? }`, `{ var?? }`, `{ class?? }` return string arrays of definition names instead of code
  - Single file: returns plain string array for simple iteration
  - Glob patterns: returns per-file structured results `[{ names: string[], file, relative, absolute }]` enabling queries like `/for @f in <**/*.py { class?? }> => show "@f.names.length classes in @f.relative"`
- Section listing for markdown: `# ??`, `# ##??`, `# ###??` return arrays of heading titles
  - Single file: plain string array
  - Glob patterns: per-file structured results `[{ names: string[], file, relative, absolute }]`
- Variable interpolation in AST selectors: `{ *@type }`, `{ @type?? }` for dynamic pattern construction
- Usage patterns with wildcards and type filters: `{ (handle*) }`, `{ (*fn) }` find functions that use matched symbols
- Validation: mixing content selectors with name-list selectors now throws clear error
- LSP/syntax highlighting: `/guard`, `/stream`, `/append`, `/export` directives; guard keywords (`before`, `after`, `always`, `allow`, `deny`, `retry`); `let`/`var` in when blocks; import types (`module`, `static`, `live`, `cached`, `local`); data labels; pipeline operators (`|`, `||`); type-checking methods (`.isArray()`, etc.); AST selector patterns

### Changed
- **BREAKING**: Variable assignments in `/when` actions now require explicit `var` prefix. Use `var @x = value` for outer-scope variables, `let @x = value` for block-local variables. Bare `@x = value` syntax now throws an educational error.

### Fixed
- Field access with pipes in `/show` now correctly extracts field values before piping ([#506](https://github.com/mlld-lang/mlld/issues/506)). Previously `@data.0.code | cmd {head -3}` would pipe the parent array instead of the code field value. Field access now happens before pipeline processing for both `VariableReference` and `VariableReferenceWithTail` node types.
- Export directive grammar now correctly distinguishes guards from variables ([#498](https://github.com/mlld-lang/mlld/issues/498)). Previously all exports were marked as `guardExport`, breaking `/export` for executables and variables. Now uses runtime guard registry check.
- `/export` directive now recognized by grammar context detection - added missing `export` keyword to `DirectiveKind` enum. Export filtering now works correctly for namespace imports.
- `/export { * }` wildcard syntax now parses correctly - added `*` as valid export identifier
- Module tests updated to use current `/export { name }` and `/exe @func() = \`...\`` syntax
- Documentation updated: `/export guard @name` changed to `/export { @guardName }`
- JSON field access in executables now requires explicit `.data` accessor (e.g., `@var.data.field`)
- Glob pattern test files renamed with unique prefixes to prevent virtual filesystem collisions
- Frontmatter access in glob results now uses `.ctx.fm.field` accessor
- Test expectations updated for current JSON formatting and blank line behavior

## [2.0.0-rc72]

### Added
- Type-checking builtin methods: `.isArray()`, `.isObject()`, `.isString()`, `.isNumber()`, `.isBoolean()`, `.isNull()`, `.isDefined()` return booleans for conditional logic ([#414](https://github.com/mlld-lang/mlld/issues/414)). Note: `.isDefined()` safely returns `false` for missing variables or fields without throwing.

### Fixed
- Method chaining after array access now works: `@msg.split("_")[0].toUpperCase()` ([#408](https://github.com/mlld-lang/mlld/issues/408))
- `mlld init` is now path-aware - selecting "llm/modules" while already in that directory no longer creates nested paths ([#453](https://github.com/mlld-lang/mlld/issues/453))

### Removed
- Grammar cleanup: Removed undocumented `when any` and `when all` modifiers. Use `&&` and `||` operators for AND/OR logic in conditions.

## [2.0.0-rc71]

### Fixed
- JSON escape sequences (`\n`, `\t`, etc.) now preserved when piping data through shell commands like `echo` ([#456](https://github.com/mlld-lang/mlld/issues/456)). Previously, escape sequence normalization in command executables would convert properly-escaped `\\n` back to actual newlines, corrupting JSON data.
- Pipeline synthetic source stage preserves StructuredValue wrappers so with-clause pipelines keep JSON arrays/objects intact through `/exe` when-expression actions ([#461](https://github.com/mlld-lang/mlld/issues/461)).

## [2.0.0-rc70]

### Added
- Streaming support: `stream` keyword, `/stream` directive, and `with { stream: true }` enable live chunk emission with progress sinks and executor streaming (shell, bash, node). Parallel groups stream concurrently and buffer results. Suppress with `--no-stream` or `MLLD_NO_STREAM`.
- Streaming UX MVP:
  - Auto-parse NDJSON for `stream` execs (paths: message.content[].text/result/delta.text/completion/error.message).
  - Live stdout for message text with spacing/dedupe; thinking/tool-use to stderr (`💭 text`, `🔧 name input=preview`); tool results suppressed for noise.
  - Raw event visibility: `--show-json` (or `MLLD_SHOW_JSON=true`) mirrors NDJSON to stderr; `--append-json [file]` writes NDJSON to JSONL (default `YYYY-MM-DD-HH-MM-SS-stream.jsonl` when omitted).
  - Streaming `/show ...` avoids double-print of streamed content.

### Security

**Guards**:
- Policy enforcement for data access and operations
- Syntax: `/guard <label> { allow/deny/retry }` with optional conditions
- Guards trigger on data labels (`secret`, `pii`) or operations (`op:run`, `op:exe`)
- Support `allow`, `deny`, and `retry` decisions
- Can transform data with `allow @transform(@input)`
- Fire before operations (input validation) or after operations (output validation)

**Expression Tracking**:
- Guards see security labels through all transformations (closes `@secret.trim()` bypass hole)
- Provenance preserved through: chained builtin methods, template interpolation, field access, iterators, pipelines, nested expressions
- Example: `@secret.trim().slice(0, 5)` preserves `secret` label through entire chain
- Guards fire at directive boundaries, exe invocations, and pipeline stages

**Guard Composition**:
- All guards execute in registration order (file top-to-bottom, imports flatten at position)
- Multiple guards compose with decision precedence: deny > retry > allow @value > allow
- Transform chaining: Guard N output → Guard N+1 input with full provenance tracking
- Guard history exposed via `@ctx.guard.trace/hints/reasons` for denied handlers
- Pipeline guard history via `@p.guards` tracks guard activity across all pipeline stages
- Deterministic IDs for unnamed guards: `<unnamed-guard-N>`
- Per-input guards (data labels) and per-operation guards (`op:run`, `op:exe`, etc.)

**Before/After Guards**:
- Guards fire before operations (input validation) or after operations (output validation)
- Syntax: `/guard @name before datalabel = when [...]` where TIMING is `before`, `after`, or `always`
- Syntactic sugar: `/guard @name for LABEL` is equivalent to `before` timing (explicit `before` recommended)
- Context: `@input` in before guards, `@output` in after guards, both available in denied handlers
- Execution order: before guards → operation → after guards
- Retries supported in pipeline context for both before and after guards

**Allow @value Transforms**:
- Guards transform inputs/outputs: `allow @redact(@input)` or `allow @sanitize(@output)`
- Transforms chain with metadata preservation (`guard:@name` appended to sources)
- Works in both before guards (input sanitization) and after guards (output sanitization)
- Cross-scope chaining: per-input guard transforms flow to per-operation guards
- Provenance tracking: labels union, taint maximum, sources accumulate

**Guard Overrides**:
- Per-operation control: `with { guards: { only: [...], except: [...], false } }`
- `guards: false` disables all guards (emits warning to stderr)
- `only: ["@guard"]` runs specified guards only (unnamed guards excluded)
- `except: ["@guard"]` skips named guards (unnamed guards still run)
- Conflict detection: throws error if both `only` and `except` specified

### Added
- StructuredValue `.ctx`/`.internal` surfaces power provenance, security, and behavior metadata
- `/append` directive and `| append` pipeline builtin for incremental file writes (JSONL/text) with shared `/output` source evaluation
- `@json.llm` transformer extracts JSON from LLM responses with code fences or embedded prose. Returns `false` when no JSON found.
- `@json.fromlist` transformer converts plain text lists (one item per line) to JSON arrays
- Chained builtin methods on variables: string methods (slice, substring, substr, replace, replaceAll, padStart, padEnd, repeat, split, join) and array methods (slice, concat, reverse, sort) work in chains like `@secret.trim().slice(0, 6)` with security labels preserved
- Structured-value helpers: added `keepStructured`/`keep` helper and `.keepStructured`/`.keep` field-access sugar to retain metadata/provenance without unwrapping content. Built-in `@keep`/`@keepStructured` executables allow helper-style usage in scripts.
- For loops accept dotted iteration variables and bind both the base element and its field (e.g., `for @item.path in @files`) with proper field access errors.
- For loop bodies can be `when [...]` across /for, /var, and /exe, using first-match semantics per iteration and feeding branch results into loop outputs.

- Alligator JSON ergonomics: `<*.json>` and `<*.jsonl>` auto-parse to StructuredValues (parsed `.data`, raw `.text`, `.ctx` preserved); use `.text` when raw strings are needed.

### Fixed
- Templates now correctly parse comparison operators like `<70%` and `< 70` instead of treating them as file references

- Inline `/for` loops in templates only trigger at line start (not mid-line)
- **When-expression pipelines**: `/exe … = when [...]` actions now accept `| append`, `| log`, `| output`, and `| show` stages without misparsing ternary expressions (fixes `slash/when/exe-when-expressions-operators`).

- Backtick and `::` templates handle XML-like tags identically

- Fixed false circular reference warnings when parallel tasks load the same file
- Inline pipeline effect detection now differentiates builtin `append` from user-defined commands, restoring stage execution for execs named `append`
- Alligator syntax in for expressions: `for @f in @files => <@f>` and property access like `for @f in @files => <@f>.fm.title` now work correctly
- Module content suppression during imports - imported module content no longer appears in stdout
- Shell pipe detection respects quoted strings - pipe characters inside quoted arguments no longer trigger pipe handling
- Transformer variant resolution in pipelines - `@json.fromlist`, `@json.llm`, `@json.loose`, and `@json.strict` work correctly in all pipeline contexts
- Alligator `.relative` resolves from inferred `@base` (or the script path when base is unavailable) so metadata matches project-root paths
- Comma in `when` condition lists now emits a targeted parse error instead of a generic /exe syntax failure
- Wrong parallel syntax order (`/for parallel 18` instead of `/for 18 parallel`) now shows helpful error with correct syntax examples

### Changed
- Braced commands require explicit `cmd { ... }`; bare `{ ... }` parses as structured data, pipelines accept inline value stages with structured output, and bare brace commands raise a targeted parse error
- Enhanced error message for `run sh` in `/exe` explains distinction between bare commands and shell scripts
- Shell commands now run from project root when `@base` is inferred, otherwise from script directory
- `/for` parallel syntax uses `parallel(cap, pacing)` instead of `(cap, pacing) parallel`. Old syntax still parses with a warning.
- Unified file loading uses StructuredValue metadata consistently: text files unwrap to strings by default, JSON/JSONL unwrap to parsed objects/arrays, `.ctx` carries file/URL metadata, `.keep` passes wrappers into JS/Node, and `MLLD_LOAD_JSON_RAW` is removed in favor of `.text` for raw access.

## [2.0.0-rc69]
### Fixed
- JS and Node executors treat expression-style blocks as implicit returns, so `/var` assignments and pipelines receive native objects/arrays and property access like `@repo.name` works without helper wrappers.
- Node shadow executor surfaces the underlying runtime error message while still cleaning up timers, restoring the `node-shadow-cleanup` regression coverage.

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
- **Grammar ordering for `/when` blocks**: Fixed PEG parser ordering issue preventing block-only `/when [...]` syntax from working
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
- **When expression behavior**: Default `when` expressions now correctly evaluate ALL matching conditions
  - Previously, `when [...]` in `/exe` functions incorrectly stopped at the first match (switch-like behavior)
  - Now properly evaluates all conditions and returns the last matching value
  - Added support for a first-match modifier for explicit switch-case semantics
  - Fixed doubled output from `/show` directives in for loops with when expressions
  - Side effects (show, output directives) inside when expressions now execute correctly
- **Field access in /output directive source**: Fixed field access not working when outputting object fields
  - `/output @data.content to "file.txt"` now correctly outputs just the field value, not the entire object

### Changed
- **No longer supporting `/` on RHS**: 
  - Previously mlld allowed slashes in directives on the right side (`=> /show` or `= /run` etc)
  - Removed to emphasize the `/` is purposeful meaning "start of line interpreted as mlld"
  - Now if you use `/` on RHS, you get an educational error explaining the `/` is only for start of line
- **When expression semantics**: Clear distinction between default `when` and the first-match modifier
  - `when [...]` - Evaluates ALL matching conditions, returns last value
  - First-match modifier - Stops at first match (classic switch behavior)
  - Updated 11 test files that expected switch-like behavior to use the first-match modifier
  - Grammar now properly supports the first-match modifier in `/exe` expressions

### Added
- **None keyword for /when blocks**: New `none` keyword that matches when no other conditions have matched
  - Provides semantic fallback: `/when [ @x > 5 => show "high", none => show "default" ]`
  - Multiple `none` conditions allowed at end of block: all execute in default `/when`, first executes with the first-match modifier
  - Works in `/exe` when expressions: `/exe @handler() = when: [ @valid => @value, none => "fallback" ]`
  - Must appear as the last condition(s) in a when block (validated at parse time)
  - Cannot appear after wildcard `*` (would be unreachable)
  - Clearer than using `*` or complex negations like `!(@a || @b || @c)`
- **Test coverage for when expressions**: New test demonstrating default `when` evaluates all conditions
  - `tests/cases/valid/slash/when/exe-when-all-matches/` shows the difference between default `when` and the first-match modifier

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
  - Grammar support for switch-style `/exe` when-expression first-match modifier
    - Modifier is parsed and attached to `WhenExpression.meta.modifier`
    - Interpreter behavior for the modifier in exe when-expressions lands in the next release

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
