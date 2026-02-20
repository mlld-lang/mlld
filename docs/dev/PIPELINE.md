---
updated: 2026-02-18
tags: #arch, #pipeline, #retry, #transformers
related-docs: docs/dev/DATA.md, docs/dev/INTERPRETER.md, docs/dev/ITERATORS.md, docs/dev/VAR-EVALUATION.md
related-code: grammar/patterns/with-clause.peggy, interpreter/eval/pipeline/unified-processor.ts, interpreter/eval/pipeline/executor.ts, interpreter/eval/pipeline/state-machine.ts, interpreter/eval/pipeline/context-builder.ts, interpreter/eval/pipeline/command-execution.ts, interpreter/eval/pipeline/detector.ts, interpreter/eval/with-clause.ts, interpreter/eval/var/rhs-content.ts, interpreter/eval/exec-invocation.ts, interpreter/builtin/transformers.ts, interpreter/env/Environment.ts
related-types: interpreter/eval/pipeline/state-machine { PipelineState, RetryContext, StageContext }, interpreter/utils/structured-value { StructuredValue }
---

# Pipeline Architecture

## tldr

- Pipeline execution is single-pass: parse pipeline AST, then execute stage-by-stage through `processPipeline(...)`.
- Runtime orchestration is split between `PipelineExecutor` (execution loop) and `PipelineStateMachine` (retry/state transitions).
- `@p`/`@pipeline` expose stage history as `StructuredValue` wrappers; ambient `@mx` exposes stage-local execution context.
- Built-in transformers are registered by `Environment.initializeBuiltinTransformers()` and executed through pipeline and exec-invocation paths.
- Retry history types are structured, not string-only: `RetryContext.allAttempts` and `PipelineState.allRetryHistory` both use `StructuredValue[]`.
- Parallel stages are first-class: leading `||` groups, with-clause `parallel`/`delay`, and shorthand caps all execute in current runtime.
- `/with` clause behavior for pipelines is canonical here; supported pipeline keys are `pipeline`, `format`, `parallel`, `delay` (`delayMs` in AST), `stream`, and `streamFormat`.

## Principles

- Preserve structure: stage boundaries normalize values to `StructuredValue` so `.text` and `.data` stay available.
- Keep retries explicit: one active retry context at a time, with upstream-only retry requests.
- Keep context local: `@mx` and `@p.try`/`@p.tries` are stage/context scoped, not global accumulators.
- Keep syntax current: canonical directive forms are `/var`, `/exe`, `/run`, `/show`, and `with { pipeline: [...] }`.

## Details

### Entry Points

- `interpreter/eval/pipeline/unified-processor.ts`
  - `processPipeline(...)` is the main entry for condensed pipelines and `with`-clause pipelines.
  - Handles source setup, retryability metadata, and hand-off to executor runtime.
- `interpreter/eval/pipeline/executor.ts`
  - Composition root for pipeline runtime collaborators (`execution-loop-runner`, `single-stage-runner`, `parallel-stage-runner`, `output-processor`, `stage-output-cache`).
- `interpreter/eval/pipeline/command-execution.ts`
  - Executes stage command references and built-in transformers in pipeline runtime.
- `interpreter/eval/exec-invocation.ts`
  - Executes transformer invocations outside pipeline runtime, then applies optional `with` tails (including pipeline tails).
- Variable and executable evaluation ownership (`/var`, `/exe`, reference vs invocation semantics):
  - Canonical architecture lives in `docs/dev/VAR-EVALUATION.md`.

### Pipeline Command Execution Orchestration

Source of truth:

- `interpreter/eval/pipeline/command-execution.ts`
- `interpreter/eval/pipeline/command-execution/*`

Stable public contracts:

- `resolveCommandReference(command, env)`
- `executeCommandVariable(commandVar, args, env, stdinInput?, structuredInput?, hookOptions?)`

Execution flow:

1. Resolve command reference (`resolve-command-reference`).
2. Normalize executable descriptor (`normalize-executable`).
3. Bind pipeline parameters (`bind-pipeline-params`).
4. Run preflight checks:
   - guard preflight (`preflight/guard-preflight`)
   - policy preflight (`preflight/policy-preflight`)
5. Dispatch by executable branch:
   - command/provider (`handlers/execute-command`)
   - code family (`handlers/execute-code`)
   - node function/class (`handlers/execute-node`)
   - template (`handlers/execute-template`)
   - command reference recursion (`handlers/execute-command-ref`)
6. Finalize output wrapping and policy descriptor merge (`finalize-result`).

Boundary rules:

- `command-execution.ts` composes orchestration only.
- Handlers own branch-specific behavior and return branch-local outputs.
- Shared helper behavior stays under `command-execution/*`.
- Handlers do not import orchestrator internals (enforced by `command-execution/dependency-boundary.test.ts`).

### Grammar Surface

Pipeline/collection parsing currently lives in these files:

- `grammar/patterns/tail-modifiers.peggy`
- `grammar/patterns/with-clause.peggy`
- `grammar/patterns/command-reference.peggy`
- `grammar/patterns/foreach.peggy`
- `grammar/patterns/iteration.peggy`
- `grammar/patterns/variables.peggy`
- `grammar/directives/var.peggy`
- `grammar/directives/exe.peggy`
- `grammar/directives/run.peggy`
- `grammar/directives/when.peggy`
- `grammar/directives/for.peggy`

No `grammar/directives/data.peggy` file exists in current grammar layout.

### /with Clause (Canonical)

Source of truth:

- Grammar: `grammar/patterns/with-clause.peggy`
- Detection/metadata extraction: `interpreter/eval/pipeline/detector.ts`
- Runtime application: `interpreter/eval/with-clause.ts`

Currently implemented pipeline-related `/with` keys:

- `pipeline`
- `format`
- `parallel`
- `delay` (stored as `delayMs` by grammar)
- `stream`
- `streamFormat`

Related `asSection` support:

- `detectPipeline`/`extractPipelineMetadata` propagate `asSection` metadata where present.
- Section and load-content rename application is implemented in `interpreter/eval/var/rhs-content.ts`.

Not part of current `/with` runtime semantics:

- `with { needs: ... }` is not parsed/evaluated as with-clause behavior in current grammar/evaluator paths.

### Runtime Types That Must Stay Accurate

Source of truth: `interpreter/eval/pipeline/state-machine.ts`.

- `PipelineState.allRetryHistory: Map<string, StructuredValue[]>`
- `RetryContext.allAttempts: StructuredValue[]`
- `StageContext.structuredOutputs?: Record<number, StructuredValue | undefined>`
- `StageContext.previousOutputs: string[]` and `StageContext.previousStructuredOutputs?: Array<StructuredValue | undefined>` are both maintained for stage context assembly.

### Context Variables (`@p`, `@pipeline`, `@mx`)

- `context-builder.ts` sets `@pipeline` and alias `@p` in stage environments.
- Stage context assembly (`previousOutputs`, structured snapshots, attempt history) is built in `PipelineStateMachine.buildStageContext(...)`.
- Ambient `@mx` is built separately via `ContextManager.buildAmbientContext(...)` from pipeline/context snapshots.
- `@p` stores `StructuredValue` stage outputs; interpolation/display paths use `.text`, while computation paths use `.data`.

### Parallel Stage Behavior

- Leading parallel groups are implemented in grammar (`grammar/patterns/tail-modifiers.peggy`):
  - `LeadingParallelPipeline` supports prefixes like `|| @a() || @b()`.
  - The rule emits a `withClause` payload containing `pipeline` and optional `parallel`/`delayMs`.
- Parallel cap/pacing options are implemented in two active grammar paths:
  - Shorthand caps: `PipelineParallelSpec` in `grammar/patterns/directive-ending.peggy` parses `(<cap>)` and `(<cap>, <delay>)`.
  - With-clause options: `parallel` and `delay` map to `parallel` and `delayMs` in `grammar/patterns/with-clause.peggy`.
- Runtime wiring:
  - `detectPipeline(...)` propagates `parallelCap`/`delayMs` from with-clause metadata.
  - `PipelineExecutor` receives those values and routes array stages to `PipelineParallelStageRunner`.
- Execution semantics (`interpreter/eval/pipeline/executor/parallel-stage-runner.ts`):
  - Branches run through `runWithConcurrency(...)` with `ordered: true` and optional pacing (`paceMs: delayMs`).
  - Concurrency default is `getParallelLimit()` from `interpreter/utils/parallel.ts`, which falls back to `4` or `MLLD_PARALLEL_LIMIT` when set.
  - Branch outputs are aggregated in declaration order.
  - Branch failures are converted into marker objects (`index`, `key`, `message`, `error`, `value`) and surfaced via parallel error context (`resetParallelErrorsContext(...)`).
  - `retry` emitted by any branch is rejected for the stage (`retry not supported in parallel stage`).

### Built-in Transformers

Definitions: `interpreter/builtin/transformers.ts`.
Registration: `Environment.initializeBuiltinTransformers()` in `interpreter/env/Environment.ts`.

Registration behavior:

- Registers uppercase canonical and lowercase alias variables for every transformer.
- Wires variant maps for both casings (`parse.loose`, `PARSE_LOOSE`, etc.).
- Marks transformer variables with internal built-in metadata used by execution paths.

Current transformer set:

- `typeof`
- `exists`
- `xml`
- `parse` + variants: `loose`, `strict`, `llm`, `fromlist`
- `json` (deprecated alias) + variants: `loose`, `strict`, `llm`, `fromlist`
- `csv`
- `md`
- `upper`
- `lower`
- `trim`
- `pretty`
- `sort`

Execution paths:

- Pipeline stages: `interpreter/eval/pipeline/command-execution.ts`.
  - Built-ins execute through `commandVar.internal.transformerImplementation(...)`.
  - Results pass through `normalizeTransformerResult(...)` and are finalized via structured wrapping (`createCommandExecutionFinalizer` + `wrapExecResult`).
- Exec invocation path: `interpreter/eval/exec-invocation.ts`.
  - Transformer results pass through `normalizeTransformerResult(...)`, then `applyInvocationWithClause(...)` wraps/forwards results for downstream usage.

`@parse.llm` behavior:

- Attempts JSON extraction from fenced and unfenced LLM output text.
- Returns parsed JSON value when extraction + parse succeeds.
- Returns `false` when no parseable JSON is found.

### Structured Result Continuity

- Transformer result normalization is centralized in `interpreter/utils/transformer-result.ts`.
- Pipeline and exec-invocation paths both normalize then wrap transformer output before handing it to downstream stages/with clauses.
- This keeps transformer outputs compatible with pipeline context/history and guard metadata flows.

## Gotchas

- Do not document removed directive forms such as `@exec`, `@data`, or `@text`.
- `@p.try` and `@p.tries` are context-local; they reset outside an active retry context.
- Retry history (`@p.retries.all`) is structured history; do not treat it as string-only.
- `@mx` execution context and value `.mx` metadata are different namespaces (see `docs/dev/DATA.md`).
- Do not document `with { needs: ... }` as canonical `/with` behavior.

## Debugging

- Set `MLLD_DEBUG=true` for pipeline transition/execution logs.
- Set `MLLD_DEBUG_STRUCTURED=true` for structured value boundary logging in executor runtime.
- Characterization/behavior tests live under `interpreter/eval/pipeline/*.test.ts` and `interpreter/eval/pipeline/executor/*.test.ts`.
