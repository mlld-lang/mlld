---
updated: 2026-02-18
tags: #arch, #interpreter
related-docs: docs/dev/AST.md, docs/dev/TYPES.md, docs/dev/PIPELINE.md, docs/dev/RESOLVERS.md, docs/dev/SHADOW-ENV.md, docs/dev/IMPORTS.md, docs/dev/ITERATORS.md, docs/dev/DATA.md, docs/dev/VAR-EVALUATION.md, docs/dev/SECURITY.md, docs/dev/HOOKS.md, docs/dev/OUTPUT.md, docs/dev/STREAMING.md, llms.txt
related-code: interpreter/index.ts, interpreter/core/interpreter.ts, interpreter/core/interpolation-context.ts, interpreter/eval/*.ts, interpreter/eval/exec/*.ts, interpreter/eval/import/*.ts, interpreter/eval/pipeline/*, interpreter/eval/auto-unwrap-manager.ts, interpreter/env/Environment.ts, interpreter/env/ImportResolver.ts, interpreter/env/VariableManager.ts, interpreter/env/executors/*.ts, interpreter/output/*.ts, core/types/*, core/policy/*
related-types: core/types { MlldNode, DirectiveNode, ExecInvocation, VariableReferenceNode, WithClause }, core/types/variable { Variable }
---

# INTERPRETER ARCHITECTURE

## tldr

- Single-pass, AST-driven evaluation: parse once, evaluate directly.
- `Environment` is the runtime: variables, imports, execution, effects, security.
- Output is intent-first (`OutputIntent` → `OutputRenderer` → effects) with effect-handler output as primary and node formatting as fallback.
- OUTPUT/STREAMING boundary: `docs/dev/OUTPUT.md` owns intent/effect/normalization; `docs/dev/STREAMING.md` owns StreamBus/sinks/adapters/SDK stream-event transport.
- Lazy by default for complex data; strict contexts switch behavior (conditions, interpolation, field access).
- Unified exec invocation and pipelines; resolvers unify modules, paths, and built-ins.

## Principles

- Single pass: parser → AST → interpreter; no separate "resolution phase".
- Evaluators are autonomous; no orchestration service layer.
- Preserve types from AST → Variable → evaluation.
- Fail fast with precise, directive-scoped errors.
- Security- and resolver-aware imports and execution.

## Details

### Entry Points

- `interpreter/index.ts`:
  - `interpret(source, options)`: parses with `@grammar/parser`, builds `PathContext`, constructs `Environment`, then calls `evaluate(ast, env)`.
  - Configures streaming defaults and output mode; per-run/per-exec streaming sinks are configured later by evaluators via `StreamingManager.configure(...)`.
- `interpreter/core/interpreter.ts`:
  - Entry point composition for `evaluate`, `interpolate`, and `cleanNamespaceForDisplay`.
  - Wires interpolation security recording and delegates node dispatch to `interpreter/core/interpreter/evaluator.ts`.
- `interpreter/core/interpreter/evaluator.ts`:
  - Core AST node dispatch pipeline for directives, literals, expressions, exec invocations, when/for, objects/arrays, file/code fences, and frontmatter.
  - Owns document/text traversal behavior and routes to extracted handler modules under `interpreter/core/interpreter/handlers/`.

### Core Extraction Seams

- Entrypoint contract (`interpreter/core/interpreter.ts`) stays stable:
  - `evaluate(node, env, context?)` returns `{ value, env }` (plus optional process metadata in command/code paths).
  - `interpolate(nodes, env, context?, options?)` returns interpolated string output.
  - `cleanNamespaceForDisplay(namespaceObject)` returns JSON text with frontmatter plus exported variables/executables.
- Ownership map for extracted core modules:
  - `interpreter/core/interpreter/traversal.ts`: array/document traversal, frontmatter-first handling, non-directive intent emission, node recording order.
  - `interpreter/core/interpreter/dispatch.ts`: node-type to dispatch-target mapping and unknown-node error creation.
  - `interpreter/core/interpreter/resolve-variable-reference.ts`: variable lookup fallback, expression-context missing-variable behavior, field traversal, condensed-pipe application, `commandRef` execution branch.
  - `interpreter/core/interpreter/interpolation-security.ts`: descriptor collection, merge, and recording around interpolation.
  - `interpreter/core/interpreter/value-resolution.ts`: shared helper for resolving variable kinds to runtime values.
  - `interpreter/core/interpreter/namespace-display.ts`: namespace display formatting/filtering for frontmatter and exports.
- Unknown-node invariant remains: `Unknown node type: <type>` (`interpreter/core/interpreter/dispatch.ts`).
- Characterization coverage for these seams lives in `interpreter/core/interpreter.characterization.test.ts`.

### Phases and Data Flow

1. Parse (Peggy) → AST (`core/types`)
2. Evaluate (single pass):
   - Document: iterate nodes; emit "doc" effects for non-directive content.
   - Directives: route to eval modules (run/sh/exe, when, for, import, output, etc.).
   - Expressions/Literals: `eval/expressions.ts`, `eval/new-expression.ts`, and literal handlers.
   - Exec Invocation: `eval/exec-invocation.ts` (unified for `@fn(...)`, with tail `with { ... }`).
     - Orchestration and dispatch: `eval/exec-invocation.ts`
     - Argument binding: `eval/exec/args.ts`
     - Guard/policy flow: `eval/exec/guard-policy.ts`
     - Built-in method dispatch: `eval/exec/builtins.ts`
     - Command executable handler: `eval/exec/command-handler.ts`
     - Code executable handler: `eval/exec/code-handler.ts`
     - Non-command/non-code handlers: `eval/exec/non-command-handlers.ts`
     - Streaming setup/teardown: `eval/exec/streaming.ts`
   - Data values: `eval/data-value-evaluator.ts` (arrays/objects; lazy for complex nodes).
   - Pipelines: `eval/pipeline/unified-processor.ts` (condensed pipes and `with { pipeline: [...] }`), with retry orchestration via `eval/pipeline/state-machine.ts`.
3. Intent/Effects → Output:
   - Interpreter/evaluators emit intents and effects (`doc|stdout|stderr|both|file`) through `Environment`.
   - `OutputRenderer` collapses/flushes intent output and routes to effects.
   - `interpret()` reads final document from effect handler when available; falls back to node formatter only if no document-capable effect handler is present.
   - Canonical docs: `docs/dev/OUTPUT.md` (intent/effect/normalization) and `docs/dev/STREAMING.md` (StreamBus/sinks/adapters/SDK stream-mode flow).

### Environment Responsibilities

- File/path context: `PathContext` for project/file/execution directories.
- Variables: `VariableManager` manages typed variables, reserved names, parameter scoping, wrappers for complex data.
- Imports: `ImportDirectiveEvaluator` + `ImportRequestRouter` orchestrate import semantics; `ImportResolver` handles low-level path/module/url resolution.
- Resolvers: `ResolverManager` with built-ins (`now`, `debug`, `input`, `keychain`) and prefix configs (e.g., `@root/...`).
- Execution: `Environment` composes command/code execution and keeps `CommandExecutorFactory` creation behind a single boundary.
- Shadow envs: `Environment` manages language-specific injection (`js`, `node`, `python`) and shadow-environment lifecycle.
- Caching and registry: URL/module cache + lock file via registry manager.
- Security: policy and guard integration across run/exec/pipeline/output/import contexts, tool/MCP scope enforcement, plus URL/domain validation.
- Effects and output: `Environment` maps intents/effects, controls import-time doc suppression, and mirrors SDK/runtime events.

### Environment Internal Zones

- Zone 1: Constructor/bootstrap wiring for root and child environments.
- Zone 2: Security, policy, tool scope, descriptor stack, and state write-through behavior.
- Zone 3: Variable and resolver management, import bindings, and reserved-variable hydration.
- Zone 4: Operation/pipeline/guard/denied context stacks plus guard history.
- Zone 5: Output intent/effect routing and SDK event bridge behavior.
- Zone 6: Command/code execution wrappers and shadow-environment lifecycle.
- Zone 7: Child environment creation, inheritance, merge, and cleanup tracking.
- Zone 8: Runtime configuration for streaming, URL options, ephemeral mode, and local modules.
- Zone 9: Diagnostics and tracing (directive trace, collected errors, source cache).
- Zone 10: Path context and path-related property accessors.

### Variable Model and Resolution

- Types: primitives (number/boolean/null), text-like, structured (object/array), path, pipeline input, executable.
- Creation: `/var` infers type from syntax; `/exe` builds executable variables (command/code/template/section/ref).
- Reference vs invocation: `@fn` (reference executable) vs `@fn(...)` (exec invocation) is universal across contexts.
- Resolution contexts (`utils/variable-resolution`):
  - FieldAccess: preserve wrappers and access path; missing fields return null unless a condition requests undefined.
  - StringInterpolation: unwrap to primitives/strings; auto-exec executables when interpolated where appropriate.
  - Equality/Expression: strict comparisons without coercion; avoid auto-exec.
- Field access: `utils/field-access.ts` supports dot/bracket/numeric; `@obj.field?` is a valid optional suffix; handles `variableIndex` indirection by resolving index variables.
- Array slicing: supports `@arr[a:b]`, negative indices, and open ranges; preserves metadata for special arrays.
- Interpolation: `interpolate()` processes unified template/quote nodes, variable refs, file refs, and condensed pipes; escapes via `interpolation-context`.
- Ambient execution context: `@mx` is built by `ContextManager.buildAmbientContext()` and exposed at lookup time by `VariableManager` (`getVariable('mx')`).
- Reserved-name rule: user code cannot define `@mx`; `VariableManager.setVariable()` throws for `name === 'mx'`.
- Value metadata is separate: `.mx` on Variables/StructuredValues is data metadata and provenance (see `docs/dev/DATA.md`).

### Exec + Pipelines

- Exec invocation:
  - `eval/exec-invocation.ts` handles resolution tracking, builtin dispatch routing, and post-invocation `with` tails.
  - `eval/exec/command-handler.ts` executes command executables (autoverify/signature flow, env/provider injection, fallback execution, command-level pipeline).
  - `eval/exec/code-handler.ts` executes code executables (mlld control-flow languages, shell/code language execution, shadow env capture, structured output normalization).
  - `eval/exec/non-command-handlers.ts` executes template/data/pipeline/command-ref/section/resolver executable types.
- Pipelines:
  - Condensed: `@value|@parse|@xml|@upper` processed by `eval/pipeline/unified-processor`.
  - Command-execution orchestration entrypoint: `eval/pipeline/command-execution.ts` (command reference resolution, executable normalization, preflight checks, branch handler dispatch, final result wrapping).
  - `/with` clause behavior is canonical in `docs/dev/PIPELINE.md` (grammar: `grammar/patterns/with-clause.peggy`, runtime: `eval/with-clause.ts`).
  - Inline effects: built-ins `| log`, `| output`, `| show` attach to the preceding stage, run after it succeeds, and re-run on each retry attempt.
  - Retry/source semantics: `processPipeline()` can inject synthetic source-stage context for retryable sources; attempts are tracked by the pipeline state machine.
  - Streaming: run/exec configure `StreamingManager` sinks at execution time; defaults are terminal+progress, while `streamFormat` uses adapter sinks and suppresses terminal output.
- Structured execution: exec invocation, `/run`, and pipeline stages surface `StructuredValue` wrappers with `.text` and `.data` properties. Display/interpolation paths automatically use `.text`. `@p`/`@pipeline` hold wrappers, so use helpers (`asText`/`asData`) in low-level code that inspects stage history.

### Metadata Preservation

- `AutoUnwrapManager` preserves LoadContentResult metadata across JS/Node/Python boundaries and is used in exec, run, and pipeline command paths (`eval/auto-unwrap-manager.ts`).

### Content Loader Seams

Canonical user-facing alligator/content behavior lives in `docs/dev/DATA.md`; interpreter seam ownership is documented here.

- Composition entrypoint: `interpreter/eval/content-loader.ts`.
  - Wires shared dependencies and delegates runtime routing to `ContentLoaderOrchestrator`.
- Orchestration router: `interpreter/eval/content-loader/orchestrator.ts`.
  - Routes AST, URL, glob, and single-file branches.
- Branch boundaries:
  - AST: `interpreter/eval/content-loader/ast-pattern-resolution.ts`, `interpreter/eval/content-loader/ast-variant-loader.ts`
  - URL: `interpreter/eval/content-loader/url-handler.ts`
  - Glob: `interpreter/eval/content-loader/glob-loader.ts`
  - Single file: `interpreter/eval/content-loader/single-file-loader.ts`
- Shared helper boundaries:
  - `interpreter/eval/content-loader/source-reconstruction.ts`
  - `interpreter/eval/content-loader/section-utils.ts`
  - `interpreter/eval/content-loader/transform-utils.ts`
  - `interpreter/eval/content-loader/policy-aware-read.ts`
  - `interpreter/eval/content-loader/security-metadata.ts`
- Finalization boundary:
  - `interpreter/eval/content-loader/finalization-adapter.ts` (`finalizeLoaderResult(...)`)
  - Load-content normalization uses `wrapLoadContentValue(...)` from `interpreter/utils/load-content-structured.ts` with metadata/security merge.
- Optional/error behavior invariants:
  - Optional glob failure path returns empty-array wrapper (`finalizeLoaderResult([], { type: 'array' })`).
  - Optional non-glob failure path returns `null`.
  - `MlldSecurityError` is passed through (not remapped) by orchestrator/glob paths.

### Iteration

- `/for`: `eval/for.ts` iterates arrays/objects; action per item; emits effects immediately (show/output/log); collection form returns array results; exposes key via `.mx.key` accessor. `for @key, @value` binds the key variable and skips the implicit `@value_key` binding.
- `foreach`: `eval/data-value-evaluator.ts` (Cartesian product) executes parameterized commands/templates over arrays; lazy complex data until needed; capped combinations for performance.

### Imports and Resolvers

- Imports are orchestrated by `ImportDirectiveEvaluator` and routed by `ImportRequestRouter` across input/resolver/module/node/file-url/directory/MCP handlers (`eval/import/*`).
- `Environment.importResolver` remains the low-level resolver/cache layer used by import handlers.
- Policy import context handling is applied by `PolicyImportContextManager` during import evaluation.
- Import directive guard: module child environments set `isImporting` and evaluate with `isExpression: true`, suppressing doc emission and skipping side-effect directives (`/run`, `/output`, `/show`, `/append`) during import-time execution.
- Export manifests: `eval/export.ts` records `/export` declarations on the child environment; `VariableImporter.processModuleExports` enforces the manifest and surfaces `EXPORTED_NAME_NOT_FOUND` while `/export { * }` defers to the temporary auto-export fallback.
- Import collisions: `ImportBindingGuards` (and MCP import checks) enforce `IMPORT_NAME_CONFLICT` before binding; `Environment.setImportBinding` records successful bindings.
- Name protection: resolver names reserved (cannot create variables shadowing them); prefixes registered into env as path variables when configured.

### Shadow Environments

- JS: in-process execution; shadow functions injected as parameters; designed for synchronous composition among shadow functions.
- Node: isolated VM (`NodeShadowEnvironment`) with captured shadow functions; used by node execution paths.
- Python: `PythonShadowEnvironment` exists and executes with shadow-function injection when present; Python execution falls back to subprocess behavior when no shadow state is needed.

### Errors and Debugging

- Parse: `MlldParseError` with enhanced formatting and location; optional pattern capture.
- Runtime: directive-scoped errors (e.g., `MlldInterpreterError`, specialized directive errors) with source context.
- Debug flags: `MLLD_DEBUG` plus targeted flags (`MLLD_DEBUG_GUARDS`, `MLLD_DEBUG_CHAINING`, `MLLD_DEBUG_STDIN`, `MLLD_DEBUG_EXEC_IO`, `MLLD_DEBUG_STRUCTURED`, `MLLD_DEBUG_FOREACH`, `MLLD_DEBUG_FIX`, `MLLD_DEBUG_VERSION`). `DEBUG_EXEC` is used in import object-reference resolution.
- Collected errors: `outputOptions.collectErrors` aggregates and formats at end of run.

## Gotchas

- Use angle brackets for file contents `<path>`; quoted strings are literals; `<@root/...>` required for resolver paths.
- `run` vs `sh`: `run` supports single-line with pipes only; use `sh` for `&&`, `||`, or multi-line scripts.
- Executables: `@fn` is a value; `@fn()` executes. In templates, executables may auto-exec or stringify depending on context.
- Conditions: missing fields resolve to `undefined` (not errors) to support truthiness checks.
- Document output: non-directive AST nodes emit "doc" effects; comments and inline `>>`/`<<` comment lines are skipped.

## Debugging

- Enable granular logs with `MLLD_DEBUG=true`, then add scoped flags as needed (for guards/chaining/stdin/exec-io/structured/foreach/fix/version).
- Capture parse errors (pattern dev): `captureErrors: true` interpret option.
- Use directive trace: `enableTrace` option (on by default) to inspect directive flow.
- Inspect pipeline context via ambient `@mx` (stages, attempts, hint).
- Keep namespaces distinct: ambient `@mx` is runtime execution context; value `.mx` metadata is documented in `docs/dev/DATA.md`.

### Hint Scoping in Pipelines

`@mx` is ambient and amnesiac: it reflects only the current stage. As part of retry semantics, `@mx.hint` (the retry payload) is:

- Visible in the current stage context, including inline effects for that stage.
- Not carried into downstream stage contexts (each stage gets its own pipeline snapshot).

This keeps `@mx.hint` tightly scoped to the location where it is meaningful, while leaving aggregate history visible via `@p.retries.all`.

## Quick Map

- /var: `interpreter/eval/var.ts` + `interpreter/eval/var/*` — orchestration + specialized RHS/metadata/pipeline modules (see `docs/dev/VAR-EVALUATION.md`)
- /run, /sh: `interpreter/eval/run.ts` + `interpreter/eval/run-modules/*` — orchestration entrypoint with extracted command/code execution, executable resolution+dispatch, policy helpers, and output lifecycle modules
- /export: `interpreter/eval/export.ts` — accumulate manifest entries, reset fallback on wildcard
- /exe: `interpreter/eval/exe.ts` — define executables (command/code/template/section/ref)
- @fn(...): `interpreter/eval/exec-invocation.ts` — unified orchestration with `with { ... }`
- Exec command handler: `interpreter/eval/exec/command-handler.ts` — command executable execution path
- Exec code handler: `interpreter/eval/exec/code-handler.ts` — code executable execution path
- Exec non-command handlers: `interpreter/eval/exec/non-command-handlers.ts` — template/data/pipeline/ref/section/resolver execution paths
- /show: `interpreter/eval/show.ts` — display content, header transforms
- /log: `grammar/directives/output.peggy` + `interpreter/eval/pipeline/builtin-effects.ts` — `/log` directive sugar and inline `| log` both emit to `stderr`
- /when: `interpreter/eval/when.ts`, `interpreter/eval/when-expression.ts` — conditionals
- /bail: `interpreter/eval/bail.ts` — fail-fast bailout directive evaluation
- /env: `interpreter/eval/env.ts` — environment variable and env-file handling
- /for: `interpreter/eval/for.ts` — iteration over arrays/objects
- /loop: `interpreter/eval/loop.ts` + `interpreter/core/interpreter/evaluator.ts` — `/loop` directive and `LoopExpression` runtime evaluation
- foreach (operator): `interpreter/eval/data-value-evaluator.ts` and `interpreter/eval/foreach.ts` — cartesian execution
- Executable foreach: code executable with language `mlld-foreach` handled in `interpreter/eval/exec/code-handler.ts`
- /import: `interpreter/eval/import/ImportDirectiveEvaluator.ts` + `interpreter/eval/import/ImportRequestRouter.ts` — import orchestration, handler routing, and binding/manifest integration
- /output: `interpreter/eval/output.ts` — file and stream outputs
- /load-content (`<...>`): `interpreter/eval/content-loader.ts` + `interpreter/eval/content-loader/*` — source reconstruction, branch routing, and finalization
- Expressions: `interpreter/eval/expressions.ts` + `interpreter/eval/new-expression.ts` — binary/unary/ternary and `new` expression handling
- Pipelines: `interpreter/eval/pipeline/unified-processor.ts` — condensed + structured
- Pipeline command execution orchestration: `interpreter/eval/pipeline/command-execution.ts` — stage command reference resolution + executable branch dispatch
- Pipeline executor runtime: `interpreter/eval/pipeline/executor.ts` + `interpreter/eval/pipeline/executor/*` — composition root, execution loop, stage runners, and streaming lifecycle
- Interpolation: `interpreter/core/interpreter.ts#interpolate` — templates, pipes, file refs

### Working Directory Resolution

- Grammar attaches `workingDir` metadata for `cmd:/abs`, `sh:/abs`, `bash:/abs`, `js:/abs`, `node:/abs`, and `python:/abs` in `/run`, inline pipelines, and `/exe` definitions.
- `resolveWorkingDirectory()` (`interpreter/utils/working-directory.ts`) uses the FilePath interpolation context, requires absolute existing directories, and rejects tilde or Windows paths.
- Executors accept per-call `workingDirectory` overrides; if absent, they fall back to the environment execution directory instead of guessing.
