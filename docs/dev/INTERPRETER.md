---
updated: 2026-02-01
tags: #arch, #interpreter
related-docs: docs/dev/AST.md, docs/dev/TYPES.md, docs/dev/PIPELINE.md, docs/dev/RESOLVERS.md, docs/dev/SHADOW-ENV.md, docs/dev/IMPORTS.md, docs/dev/ITERATORS.md, docs/dev/ALLIGATOR.md, docs/dev/EXEC-VARS.md, llms.txt
related-code: interpreter/index.ts, interpreter/core/interpreter.ts, interpreter/core/interpolation-context.ts, interpreter/eval/*.ts, interpreter/eval/exec/*.ts, interpreter/env/Environment.ts, interpreter/env/ImportResolver.ts, interpreter/env/VariableManager.ts, interpreter/env/executors/*.ts, interpreter/eval/pipeline/*, core/types/*
related-types: core/types { MlldNode, DirectiveNode, ExecInvocation, VariableReferenceNode, WithClause }, core/types/variable { Variable }
---

# INTERPRETER ARCHITECTURE

## tldr

- Single-pass, AST-driven evaluation: parse once, evaluate directly.
- `Environment` is the runtime: variables, imports, execution, effects, security.
- Output uses effect streaming (doc/stdout/stderr); nodes are no longer the output surface.
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
  - Attaches optional streaming sinks (`progress`, `full`) before evaluation; formats final output (Markdown/XML) from effect handler.
- `interpreter/core/interpreter.ts`:
  - Entry point composition for `evaluate`, `interpolate`, and `cleanNamespaceForDisplay`.
  - Wires interpolation security recording and delegates node dispatch to `interpreter/core/interpreter/evaluator.ts`.
- `interpreter/core/interpreter/evaluator.ts`:
  - Core AST node dispatch pipeline for directives, literals, expressions, exec invocations, when/for, objects/arrays, file/code fences, and frontmatter.
  - Owns document/text traversal behavior and routes to extracted handler modules under `interpreter/core/interpreter/handlers/`.

### Phases and Data Flow

1. Parse (Peggy) → AST (`core/types`)
2. Evaluate (single pass):
   - Document: iterate nodes; emit "doc" effects for non-directive content.
   - Directives: route to eval modules (run/sh/exe, when, for, import, output, etc.).
   - Expressions/Literals: `eval/expression.ts` and literal handlers.
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
   - Pipelines: `eval/pipeline/unified-processor.ts` (condensed pipes and `with { pipeline: [...] }`); optional streaming sinks.
3. Effects → Formatter: `Environment.emitEffect('doc'|'stdout'|'stderr'|'file', ...)` accumulated by effect handler; formatted by `interpreter/output/formatter.ts` + markdown formatter when selected.

### Environment Responsibilities

- File/path context: `PathContext` for project/file/execution directories.
- Variables: `VariableManager` manages typed variables, reserved names, parameter scoping, wrappers for complex data.
- Imports: `ImportResolver` orchestrates file/module/function resolvers, URL cache, approval bypass, fuzzy local matching.
- Resolvers: `ResolverManager` with built-ins (`now`, `debug`, `input`) and prefix configs (e.g., `@base/...`).
- Execution: `CommandExecutorFactory` (shell/JS/Node) with streaming, timeouts, and shadow envs.
- Shadow envs: language-specific injection (`js`, `node`) and a VM-backed `NodeShadowEnvironment`.
- Caching and registry: URL/module cache + lock file via registry manager.
- Security: `SecurityManager` for URL limits, protocol/domain validation.
- Effects and output: `EffectHandler` (default or custom), blank-line normalization, markdown formatting.

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

### Exec + Pipelines

- Exec invocation:
  - `eval/exec-invocation.ts` handles resolution tracking, builtin dispatch routing, and post-invocation `with` tails.
  - `eval/exec/command-handler.ts` executes command executables (autoverify/signature flow, env/provider injection, fallback execution, command-level pipeline).
  - `eval/exec/code-handler.ts` executes code executables (mlld control-flow languages, shell/code language execution, shadow env capture, structured output normalization).
  - `eval/exec/non-command-handlers.ts` executes template/data/pipeline/command-ref/section/resolver executable types.
- Pipelines:
  - Condensed: `@value|@json|@xml|@upper` processed by `eval/pipeline/unified-processor`.
  - With-clause: `run [...] with { pipeline: [...] }` sets `pipelineContext` on env for each stage.
  - Inline effects: built-ins `| log`, `| output`, `| show` attach to the preceding stage, run after it succeeds, and re-run on each retry attempt.
  - Streaming: optional sinks in `eval/pipeline/stream-sinks/*` (progress-only, terminal); ambient `@mx` exposes attempt/hint history for retry semantics.
- Structured execution: exec invocation, `/run`, and pipeline stages surface `StructuredValue` wrappers with `.text` and `.data` properties. Display/interpolation paths automatically use `.text`. `@p`/`@pipeline` hold wrappers, so use helpers (`asText`/`asData`) in low-level code that inspects stage history.

### Metadata Preservation

- LoadContentResult metadata shelf: exec invocation preserves file metadata across JS transforms (see `eval/exec-invocation.ts`).

### Iteration

- `/for`: `eval/for.ts` iterates arrays/objects; action per item; emits effects immediately (show/output/log); collection form returns array results; exposes key via `.mx.key` accessor. `for @key, @value` binds the key variable and skips the implicit `@value_key` binding.
- `foreach`: `eval/data-value-evaluator.ts` (Cartesian product) executes parameterized commands/templates over arrays; lazy complex data until needed; capped combinations for performance.

### Imports and Resolvers

- Imports: `eval/import/*` delegates to `Environment.importResolver`:
  - Module imports: `@user/module` via registry/HTTP/GitHub resolvers.
  - Path imports: quoted/local paths and resolver-prefixed angle brackets (e.g., `<@base/file.mld>`); angle brackets denote "load contents" semantics.
- Import directive guard: module child environments set `isImporting` so `/run`, `/output`, and `/show` skip execution while the import evaluates, preventing module-level side effects.
- Export manifests: `eval/export.ts` records `/export` declarations on the child environment; `VariableImporter.processModuleExports` enforces the manifest and surfaces `EXPORTED_NAME_NOT_FOUND` while `/export { * }` defers to the temporary auto-export fallback.
- Import collisions: `Environment.setImportBinding` stores successful bindings per directive and `ensureImportBindingAvailable` throws `IMPORT_NAME_CONFLICT` before a duplicate alias reaches `setVariable`.
- Name protection: resolver names reserved (cannot create variables shadowing them); prefixes registered into env as path variables when configured.

### Shadow Environments

- JS: in-process execution; shadow functions injected as parameters; designed for synchronous composition among shadow functions.
- Node: isolated VM (`NodeShadowEnvironment`) with captured shadow functions; used for `node`/`js` executors as configured.
- Helpers: variable proxy/introspection helpers for external envs are provided (e.g., Python generator utilities) but no Python shadow execution.

### Errors and Debugging

- Parse: `MlldParseError` with enhanced formatting and location; optional pattern capture.
- Runtime: directive-scoped errors (e.g., `MlldInterpreterError`, specialized directive errors) with source context.
- Debug flags: `DEBUG_EXEC`, `DEBUG_FOR`, `DEBUG_PIPELINE`, `MLLD_DEBUG`, `DEBUG_PEGGY`; directive trace enabled by default and configurable via `enableTrace`.
- Collected errors: `outputOptions.collectErrors` aggregates and formats at end of run.

## Gotchas

- Use angle brackets for file contents `<path>`; quoted strings are literals; `<@base/...>` required for resolver paths.
- `run` vs `sh`: `run` supports single-line with pipes only; use `sh` for `&&`, `||`, or multi-line scripts.
- Executables: `@fn` is a value; `@fn()` executes. In templates, executables may auto-exec or stringify depending on context.
- Conditions: missing fields resolve to `undefined` (not errors) to support truthiness checks.
- Document output: non-directive AST nodes emit "doc" effects; comments and inline `>>`/`<<` comment lines are skipped.

## Debugging

- Enable granular logs: `DEBUG_EXEC=1`, `DEBUG_FOR=1`, `DEBUG_PIPELINE=1`, `MLLD_DEBUG=true`.
- Capture parse errors (pattern dev): `captureErrors: true` interpret option.
- Use directive trace: `enableTrace` option (on by default) to inspect directive flow.
- Inspect pipeline context via ambient `@mx` (stages, attempts, hint).

### Hint Scoping in Pipelines

`@mx` is ambient and amnesiac: it reflects only the current stage. As part of retry semantics, `@mx.hint` (the retry payload) is:

- Visible only inside the body of the retried stage while it executes.
- Cleared before inline effects on that stage and before re-executing the requesting stage.
- Null in downstream stages and inline effects.

This keeps `@mx.hint` tightly scoped to the location where it is meaningful, while leaving aggregate history visible via `@p.retries.all`.

## Quick Map

- /var: `interpreter/eval/var.ts` — unified variable creation (text/data/primitive/path/section)
- /run, /sh: `interpreter/eval/run.ts` — command and shell execution, with-clause plumbing
- /export: `interpreter/eval/export.ts` — accumulate manifest entries, reset fallback on wildcard
- /exe: `interpreter/eval/exe.ts` — define executables (command/code/template/section/ref)
- @fn(...): `interpreter/eval/exec-invocation.ts` — unified orchestration with `with { ... }`
- Exec command handler: `interpreter/eval/exec/command-handler.ts` — command executable execution path
- Exec code handler: `interpreter/eval/exec/code-handler.ts` — code executable execution path
- Exec non-command handlers: `interpreter/eval/exec/non-command-handlers.ts` — template/data/pipeline/ref/section/resolver execution paths
- /show: `interpreter/eval/show.ts` — display content, header transforms
- /log: inline effect via pipelines; shorthand for output-to-stdout in actions
- /when: `interpreter/eval/when.ts`, `interpreter/eval/when-expression.ts` — conditionals
- /for: `interpreter/eval/for.ts` — iteration over arrays/objects
- foreach (operator): `interpreter/eval/data-value-evaluator.ts` and `interpreter/eval/foreach.ts` — cartesian execution
- Executable foreach: code executable with language `mlld-foreach` handled in `interpreter/eval/exec/code-handler.ts`
- /import: `interpreter/eval/import/*` — path/module/function resolvers, namespace/selected
- /output: `interpreter/eval/output.ts` — file and stream outputs
- Expressions: `interpreter/eval/expression.ts` — binary/unary/ternary
- Pipelines: `interpreter/eval/pipeline/unified-processor.ts` — condensed + structured
- Interpolation: `interpreter/core/interpreter.ts#interpolate` — templates, pipes, file refs

### Working Directory Resolution

- Grammar attaches `workingDir` metadata for `cmd:/abs`, `sh:/abs`, `bash:/abs`, `js:/abs`, `node:/abs`, and `python:/abs` in `/run`, inline pipelines, and `/exe` definitions.
- `resolveWorkingDirectory()` (`interpreter/utils/working-directory.ts`) uses the FilePath interpolation context, requires absolute existing directories, and rejects tilde or Windows paths.
- Executors accept per-call `workingDirectory` overrides; if absent, they fall back to the environment execution directory instead of guessing.
