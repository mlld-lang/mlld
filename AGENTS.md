<AGENTS_GUIDE version="2.0.0-rc47">
<TOC>
<OVERVIEW> ...................... Purpose, scope, safety notes
<REPO_MAP> ...................... Key directories and anchor files
<WORKFLOW> ...................... Build, run, and test commands
<STYLE> ......................... Code style, imports, naming
<GRAMMAR> ....................... Peggy layout, build, testing
<INTERPRETER> ................... Architecture, env, evaluation
<PIPELINES> ..................... Operator/with, retry, parallel groups
<ITERATORS> ..................... /for, foreach, parallel loops
<SHADOW_ENV> .................... JS/Node, wrappers, lexical capture
<TYPES> ......................... Variable system and resolution contexts
<ALLIGATOR> ..................... Content loading and metadata behavior
<EFFECTS> ....................... Effect types and streaming
<ERRORS> ........................ Pattern system and generation
<LSP> ........................... Semantic tokens and coverage tests
<SECURITY> ...................... Paths, env, resolvers, run vs sh
<TIMELESS_WRITING> .............. Present‑tense only; history in CHANGELOG
<DOCS> .......................... Dev/user docs conventions
<CONTRIBUTING> .................. Git rules, releases, changelog
<DEBUGGING> ..................... Flags, tips, common tools
<CHECKLISTS> .................... Common dev tasks
<SEE_ALSO> ...................... Pointers to key docs
</TOC>

<OVERVIEW>
This guide is for agents and contributors working on mlld itself (the language, grammar, interpreter, docs, tests). It complements llms.txt (LLM-facing usage guide) by covering development architecture, coding standards, build/test workflow, and safety constraints for modifying the codebase.

Safety and scope:
- Treat this repo as production-critical. Prefer surgical changes with strong tests.
- Never run destructive commands or global git ops; keep changes localized.
- Prefer /tmp for throwaway files. Avoid noisy new files that duplicate existing ones.
- Use precise language: the language name is “mlld” (lowercase).
</OVERVIEW>

<REPO_MAP>
Top paths you’ll touch most often:
- Grammar: grammar/*.peggy, grammar/deps/grammar-core.ts, grammar/build-grammar.mjs
- Interpreter: interpreter/core/*, interpreter/eval/*, interpreter/env/*, interpreter/output/*
- Types: core/types/* (AST, Variable types, discriminators)
- Errors: core/errors/* and errors/{parse,js}/* (pattern inputs → generated outputs)
- LSP/Highlighting: services/lsp/* + tests/tokens/*
- CLI/API: bin/*, api/*, dist/* (build output)
- Docs: docs/user/* (user-facing), docs/dev/* (dev-facing), llms.txt (LLM guide)
- Tests: tests/cases/* (fixtures), tests/fixtures/* (generated), interpreter/*.test.ts (runner)
</REPO_MAP>

<WORKFLOW>
Core commands:
- Build grammar: npm run build:grammar
- Full build (quiet): npm run build
- AST debug: npm run ast -- '<mlld syntax>' or file
- Run tests: npm test (see TESTS.md for variants)
- Examples: npm run test:examples (long-running; excluded by default)
- Token precision: npm test tests/tokens/
- Fixtures: npm run build:fixtures, outputs: npm run build:outputs[:keep]

Useful env flags:
- MLLD_NO_STREAMING=true (tests), MLLD_DEBUG=true (verbose), DEBUG_MLLD_GRAMMAR=1 (parser)
- DEBUG_EXEC, DEBUG_PIPELINE, DEBUG_WHEN (focused interpreter logging)
- MLLD_PARALLEL_LIMIT=<n> (pipeline and /for parallel caps)
- MLLD_TOKEN_COVERAGE=1 (semantic token coverage checks)
</WORKFLOW>

<STYLE>
Coding standards (see CLAUDE.md, eslint, tsconfig):
- Imports: path aliases (no long relative chains); strict types; explicit returns.
- Naming: classes/interfaces PascalCase; vars/methods camelCase; directories kebab-case.
- Formatting: 2-space indent, single quotes, semicolons; keep diffs minimal.
- Git: NEVER use “git add -A”. Stage specific files; keep commits focused.
- Test artifacts: ensure unique filenames across all test suites.
- Terminology: always “mlld” lowercase.
- Comments & JSDoc: PRESENT TENSE ONLY. Do not write forward‑looking or backward‑looking notes (no “new”, “will”, “used to”, “formerly”, “deprecated since …”). Describe current behavior only. All history belongs in CHANGELOG.md.
</STYLE>

<GRAMMAR>
Peggy structure and rules (docs/dev/GRAMMAR.md):
- Layout: base/ (primitives), patterns/ (reusable), core/ (shared directive logic), directives/ (implementations).
- Synchronize AST types and grammar output; never edit generated files under grammar/generated/.
- Build order matters; rule order matters (PEG: first-match wins). Always rebuild before testing.
- Debug: npm run ast, DEBUG_MLLD_GRAMMAR=1 for parser internals.
</GRAMMAR>

<INTERPRETER>
Architecture (docs/dev/INTERPRETER.md):
- Single-pass evaluation: parse → AST → evaluate nodes directly (no orchestration layer).
- Environment handles variables/imports/execution/effects/security; effects format document output.
- Interpolation contexts and resolution: strict rules per context (display, conditional, pipelines, field access).
- Unified exec invocation and pipelines; with-clause drives pipeline execution and formats.
- Output is emitted via effect handler, not through AST nodes.
</INTERPRETER>

<PIPELINES>
Semantics (docs/dev/PIPELINE.md):
- Two syntaxes: `a | @t1 | @t2` and `a with { pipeline: [@t1, @t2] }` (identical AST/behavior).
- Context vars: `@ctx` (stage-local) and `@p`/`@pipeline` (array of stage I/O, retry history).
- Retry: a stage may request retry of the previous stage; no nested retries; Stage 0 only retryable if its source is a function.
- Format: with { format: "json|csv|xml|text" } wraps inputs for lazy parsing.
- Parallel groups: `A || B` is one stage executed concurrently with ordered results (JSON array string to next stage). Concurrency limited by MLLD_PARALLEL_LIMIT. Retry is not supported inside the group; design post-group validation to request upstream retry.
</PIPELINES>

<ITERATORS>
Behavior (docs/dev/ITERATORS.md):
- /for: simple iteration; action per iteration; object iteration exposes `_key`; collection form returns array. `/for parallel` supports global cap override and `(n, rate)` pacing.
- foreach: cartesian product execution via parameterized command form (`foreach @cmd(@arr1, @arr2)`), lazy complex variable.
- Distinction: iterator parallelism (/for parallel) vs pipeline parallelism (||) have different semantics and outputs.
</ITERATORS>

<SHADOW_ENV>
JS/Node shadow environments (docs/dev/SHADOW-ENV.md):
- JS: in-process via new Function; Node: VM-isolated; both support shadow function injection.
- Environments declared via `/exe @js|@node = { fnA, fnB }`; wrappers expose all declared shadow functions.
- Lexical capture: functions retain captured shadow envs across imports; resolution prefers captured over dynamic.
- Pass parameters explicitly; primitives and Variables are proxied with type metadata when possible.
</SHADOW_ENV>

<TYPES>
Variable system (docs/dev/TYPES.md):
- Discriminated unions preserve type + metadata from AST through evaluation (text/object/array/primitive/executable/etc.).
- Resolution contexts control wrapper preservation vs raw extraction (e.g., Display, FieldAccess, Equality, PipelineInput).
- Special arrays and content loaders preserve behaviors (custom toString/join, content getters) via metadata.
- Shadow envs receive proxies enabling introspection (`mlld` helper) without losing ergonomic use.
</TYPES>

<ALLIGATOR>
Content loading behavior (docs/dev/ALLIGATOR.md):
- `<path>` returns content-first objects with rich metadata; auto-unwrap to `.content` in templates/show/JS params.
- Globs produce arrays with preserved metadata and custom concatenation rules.
- Metadata shelf preserves file metadata through JS transformations (arrays: exact match; single file: auto reattach).
</ALLIGATOR>

<EFFECTS>
Effects and streaming (docs/dev/EFFECTS.md):
- Effect types: 'doc' (document), 'both' (CLI+doc), 'stdout', 'stderr', 'file'.
- Document assembled from effect handler; streaming can mirror document order for better UX.
- CLI vs API modes: streaming vs buffered; flags: MLLD_NO_STREAMING/MLLD_DEBUG.
</EFFECTS>

<ERRORS>
Pattern system (docs/dev/ERRORS.md):
- Parse and JS/Node error patterns live under errors/{parse,js}/* and compile into core/errors/patterns/*.generated.js.
- Patterns are pure (no imports); templates use ${VARS}. Build with npm run build:errors.
- Interpreter and executors enhance errors at parse/runtime with pattern outputs; tests verify messaging.
</ERRORS>

<LSP>
Semantic tokens and coverage:
- services/lsp/* drive tokenization; precision tests in tests/tokens/; coverage checks via MLLD_TOKEN_COVERAGE=1.
- Keep grammar/AST and token rules aligned; adjust visitors when adding syntax.
</LSP>

<SECURITY>
Boundaries and practices:
- File loading restricted to project root unless flags/config allow absolute paths.
- Env vars: allow-list via mlld.lock.json; import from @input only when permitted.
- /run forbids &&/||; use /run sh for multi-line/control-flow; prefer explicit param passing.
- Resolvers: configure prefixes (LOCAL/HTTP/GITHUB/REGISTRY) explicitly; validate URLs and domains.
</SECURITY>

<TIMELESS_WRITING>
Hard rule: keep code comments and documentation timeless and present‑tense.
- No forward‑looking or backward‑looking language anywhere in code/comments/docs. Avoid phrases like: “new”, “used to”, “now”, “will”, “formerly”, “deprecated since”, “regressed in”, “in the future”.
- Describe what mlld does today, not what changed or will change.
- Historical notes, migrations, deprecations, and comparisons live only in CHANGELOG.md (and release notes), not in source comments or docs.
- JSDoc and inline comments explain what and why in present tense, without dates or version references.
- PR descriptions and commit messages may discuss change history, but do not copy that language into code or docs.
</TIMELESS_WRITING>

<DOCS>
Conventions (docs/dev/DOCS.md, docs/dev/USERDOCS.md):
- Dev-facing docs: ALL CAPS titles; concise, architectural; pointers > prose.
- User-facing: example-first, runnable snippets with outputs; inverted pyramid structure.
- Keep llms.txt in sync with user-facing syntax/semantics; AGENTS.md complements it for repo development.
- HARD RULE: Present‑tense only. No “this used to … / now it …” and no promises about future behavior. Do not mark features as “new/legacy/deprecated since vX” in docs; document only current behavior. Record any such notes solely in CHANGELOG.md.
</DOCS>

<CONTRIBUTING>
Workflow and releases:
- Read CONTRIBUTING.md for contribution flow; follow Git rules (no git add -A). Keep PRs focused.
- CHANGELOG.md is the single source of truth for history and changes. Update it for any user-visible change; do not add historical context to code or docs.
- Generated files are gitignored; always rebuild grammar/errors before testing/committing.
- Reviews enforce timeless writing: present‑tense comments/docs, no forward/backward references. If historical context appears in a PR, move it to CHANGELOG.md.
</CONTRIBUTING>

<DEBUGGING>
Tips and flags:
- Grammar: npm run ast, DEBUG_MLLD_GRAMMAR=1, grammar/docs/DEBUG.md.
- Interpreter: DEBUG_EXEC, DEBUG_PIPELINE, DEBUG_WHEN; print @ctx/@p judiciously.
- Tests: run specific fixtures; inspect *.generated-fixture.json; disable formatter in tests by default.
- Performance: vitest.config.perf.mts and scripts/measure-performance.js.
</DEBUGGING>

<CHECKLISTS>
Add/modify a directive:
- Update grammar (patterns/core/directives), sync types in core/types, rebuild grammar.
- Implement evaluator in interpreter/eval/*; wire into interpreter/core.
- Add fixtures (tests/cases/* for valid, subdirs for invalid/exceptions/warnings) and token tests if applicable.
- Update docs (user + dev) and llms.txt if user-facing.

Add pipeline parallel semantics or transformer:
- Grammar: ensure `||` grouping or transformer reference parses correctly.
- Interpreter: implement stage execution / metadata preservation; observe retry constraints.
- Tests: parallel ordering, cap behavior, rate-limit backoff; fixtures and integration.

Add a JS/Node error pattern:
- errors/js/<name>/{pattern.js,error.md}; pure test/enhance; build with npm run build:errors; add failing+passing tests.

Iterator changes (/for, foreach):
- Grammar for new syntax (caps/rates); evaluator preserves Variable wrappers; tests for object keys, parallel caps.
</CHECKLISTS>

<SEE_ALSO>
- llms.txt — LLM-facing language guide
- docs/dev/INTERPRETER.md — Interpreter architecture
- docs/dev/GRAMMAR.md — Grammar principles and layout
- docs/dev/PIPELINE.md — Pipelines, retry, format, parallel groups
- docs/dev/ITERATORS.md — /for and foreach, parallelism
- docs/dev/SHADOW-ENV.md — JavaScript/Node shadow environments
- docs/dev/TYPES.md — Variable system and resolution contexts
- docs/dev/ALLIGATOR.md — Content loading behaviors
- docs/dev/EFFECTS.md — Effects and streaming
- docs/dev/ERRORS.md — Error pattern system
- docs/dev/TESTS.md — Fixture system, tokens, coverage
- docs/dev/DOCS.md, docs/dev/USERDOCS.md — Documentation conventions
- CLAUDE.md — Repo guidelines (style, git, module system)
- CHANGELOG.md — Version history and notable changes
</SEE_ALSO>
</AGENTS_GUIDE>
