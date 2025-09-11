---
updated: 2025-08-24
tags: #arch, #interpreter
related-docs: docs/dev/AST.md, docs/dev/TYPES.md, docs/dev/PIPELINE.md, docs/dev/RESOLVERS.md, docs/dev/SHADOW-ENV.md, docs/dev/IMPORTS.md, docs/dev/ITERATORS.md, docs/dev/ALLIGATOR.md, docs/dev/EXEC-VARS.md, llms.txt
related-code: interpreter/index.ts, interpreter/core/interpreter.ts, interpreter/core/interpolation-context.ts, interpreter/eval/*.ts, interpreter/env/Environment.ts, interpreter/env/ImportResolver.ts, interpreter/env/VariableManager.ts, interpreter/env/executors/*.ts, interpreter/eval/pipeline/*, core/types/*
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
  - `evaluate(node|nodes, env, context?)`: recursive AST evaluator; central dispatcher for directives, literals, expressions, exec invocations, when/for, objects/arrays, file/code fences, frontmatter.
  - `interpolate(nodes, env, ctx)`: primary interpolation path for templates/quotes and condensed pipes.

### Phases and Data Flow

1. Parse (Peggy) → AST (`core/types`)
2. Evaluate (single pass):
   - Document: iterate nodes; emit "doc" effects for non-directive content.
   - Directives: route to eval modules (run/sh/exe, when, for, import, output, etc.).
   - Expressions/Literals: `eval/expression.ts` and literal handlers.
   - Exec Invocation: `eval/exec-invocation.ts` (unified for `@fn(...)`, with tail `with { ... }`).
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
  - FieldAccess: preserve wrappers and access path; missing -> `undefined` in conditions.
  - StringInterpolation: unwrap to primitives/strings; auto-exec executables when interpolated where appropriate.
  - Equality/Expression: strict comparisons without coercion; avoid auto-exec.
- Field access: `utils/field-access.ts` supports dot/bracket/numeric; handles `variableIndex` indirection by resolving index variables.
- Array slicing: supports `@arr[a:b]`, negative indices, and open ranges; preserves metadata for special arrays.
- Interpolation: `interpolate()` processes unified template/quote nodes, variable refs, file refs, and condensed pipes; escapes via `interpolation-context`.

### Exec + Pipelines

- Exec invocation: `eval/exec-invocation.ts` resolves command reference (object method calls supported), binds params in child env, applies `with` options (pipeline, format, etc.), executes via appropriate executor (shell/code/template/section/resolver).
- Pipelines:
  - Condensed: `@value|@json|@xml|@upper` processed by `eval/pipeline/unified-processor`.
  - With-clause: `run [...] with { pipeline: [...] }` sets `pipelineContext` on env for each stage.
  - Inline effects: built-ins `| log`, `| output`, `| show` attach to the preceding stage, run after it succeeds, and re-run on each retry attempt.
  - Streaming: optional sinks in `eval/pipeline/stream-sinks/*` (progress-only, terminal); ambient `@ctx` exposes attempt/hint history for retry semantics.

### Metadata Preservation

- LoadContentResult metadata shelf: exec invocation preserves file metadata across JS transforms (see `eval/exec-invocation.ts`).

### Iteration

- `/for`: `eval/for.ts` iterates arrays/objects; action per item; emits effects immediately (show/output/log); collection form returns array results; supports `_key` pattern for object keys.
- `foreach`: `eval/data-value-evaluator.ts` (Cartesian product) executes parameterized commands/templates over arrays; lazy complex data until needed; capped combinations for performance.

### Imports and Resolvers

- Imports: `eval/import/*` delegates to `Environment.importResolver`:
  - Module imports: `@user/module` via registry/HTTP/GitHub resolvers.
  - Path imports: quoted/local paths and resolver-prefixed angle brackets (e.g., `<@base/file.mld>`); angle brackets denote "load contents" semantics.
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
- Inspect pipeline context via ambient `@ctx` (stages, attempts, hint).

### Hint Scoping in Pipelines

`@ctx` is ambient and amnesiac: it reflects only the current stage. As part of retry semantics, `@ctx.hint` (the retry payload) is:

- Visible only inside the body of the retried stage while it executes.
- Cleared before inline effects on that stage and before re-executing the requesting stage.
- Null in downstream stages and inline effects.

This keeps `@ctx.hint` tightly scoped to the location where it is meaningful, while leaving aggregate history visible via `@p.retries.all`.

## Quick Map

- /var: `interpreter/eval/var.ts` — unified variable creation (text/data/primitive/path/section)
- /run, /sh: `interpreter/eval/run.ts` — command and shell execution, with-clause plumbing
- /exe: `interpreter/eval/exe.ts` — define executables (command/code/template/section/ref)
- @fn(...): `interpreter/eval/exec-invocation.ts` — unified invocation with `with { ... }`
- /show: `interpreter/eval/show.ts` — display content, header transforms
- /log: inline effect via pipelines; shorthand for output-to-stdout in actions
- /when: `interpreter/eval/when.ts`, `interpreter/eval/when-expression.ts` — conditionals
- /for: `interpreter/eval/for.ts` — iteration over arrays/objects
- foreach (operator): `interpreter/eval/data-value-evaluator.ts` — cartesian execution
- /import: `interpreter/eval/import/*` — path/module/function resolvers, namespace/selected
- /output: `interpreter/eval/output.ts` — file and stream outputs
- Expressions: `interpreter/eval/expression.ts` — binary/unary/ternary
- Pipelines: `interpreter/eval/pipeline/unified-processor.ts` — condensed + structured
- Interpolation: `interpreter/core/interpreter.ts#interpolate` — templates, pipes, file refs
