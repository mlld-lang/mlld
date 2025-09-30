---
updated: 2025-09-11
tags: #plan, #pipelines
related-docs: docs/dev/GRAMMAR.md, docs/dev/INTERPRETER.md, docs/dev/PIPELINE.md, docs/dev/ITERATORS.md
related-code: grammar/*.peggy, interpreter/eval/pipeline/*, interpreter/eval/exec-invocation.ts, core/types/*
---

# PARALLEL PIPELINE PLAN

## GOALS

- Enable pipelines that start with a parallel stage.
- Allow `(parallel, delay)` shorthand on pipelines and parallel groups.
- Preserve existing AST shape by translating shorthand into `with { pipeline, parallel, delay }`.

## GRAMMAR TASKS

- Expand pipeline stage pattern so a parallel group (`A || B`) can appear at the start of a pipeline expression.
- Add optional `(cap, delay)` suffix after any pipeline expression.
  - Parse using existing `/for` loop tuple pattern.
  - Populate AST fields `parallel` and `delay` in the surrounding `WithClause`.
- Support `(cap, delay)` inside `with { ... }` blocks as an alternative input.
- Ensure the resulting AST matches the longhand form:
  ```
  with {
    pipeline: [[@a, @b, @c], @collect],
    parallel: 3,
    delay: 20s
  }
  ```

## INTERPRETER TASKS

- Update `eval/pipeline/unified-processor.ts` to accept pipelines whose first stage is a parallel group.
- When a pipeline is only a parallel group, treat the group as stage `0` with `null` input.
- Apply `parallel` and `delay` options from the surrounding `WithClause` to all parallel stages.
- Reuse loop pacing utilities for enforcing caps and delays; place shared logic under `utils/parallel.ts` if needed.
- Ensure stage results remain ordered according to declaration.
- Respect `MLLD_PARALLEL_LIMIT` as a default when `parallel` is unspecified.

## DOCS TASKS

- Document immediate parallel pipelines and `(cap, delay)` shorthand in:
  - `docs/dev/GRAMMAR.md`
  - `docs/dev/INTERPRETER.md`
  - `docs/dev/PIPELINE.md`
  - `llms.txt` (user syntax)

## TESTING TASKS

- Grammar fixtures:
  - Parse pipeline starting with parallel group.
  - Parse pipeline with `(cap, delay)` suffix and compare AST to longhand `with` form.
- Interpreter tests:
  - Execute `/show` with immediate parallel stage and downstream collector.
  - Verify concurrency cap and delay pacing through mocked timestamp assertions.
  - Confirm `(cap, delay)` and `with { parallel, delay }` behave identically.

## INTEGRATION NOTES

- Ensure retry semantics remain unchanged; parallel groups still disallow retries within the group.
- Preserve stage output as JSON array string when feeding downstream stages.
- Keep comments and docs in present tense.
