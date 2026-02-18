---
updated: 2026-02-18
tags: #arch, #var
related-docs: docs/dev/INTERPRETER.md, docs/dev/TYPES.md, docs/dev/PIPELINE.md, docs/dev/ALLIGATOR.md
related-code: interpreter/eval/var.ts, interpreter/eval/var/*.ts
---

# VAR EVALUATION ARCHITECTURE

## tldr

- `prepareVarAssignment` and `evaluateVar` remain the `/var` entrypoints.
- `interpreter/eval/var.ts` orchestrates assignment flow.
- Specialized modules under `interpreter/eval/var/` own RHS evaluation, tool normalization, variable construction, and pipeline finalization.

## ENTRYPOINTS

- `prepareVarAssignment(directive, env, context?)`
- `evaluateVar(directive, env, context?)`

`evaluateVar` calls `prepareVarAssignment`, writes the resolved variable into the environment, and runs autosign handling.

## MODULE BOUNDARIES

- `interpreter/eval/var.ts`
  - Orchestrates assignment evaluation.
  - Builds descriptor/capability context.
  - Coordinates RHS dispatch, variable construction, pipeline finalization, and final metadata attachment.
- `interpreter/eval/var/assignment-context.ts`
  - Derives identifier, source location, base descriptors, and operation metadata for `/var`.
- `interpreter/eval/var/security-descriptor.ts`
  - Tracks descriptor merge state and interpolation-aware descriptor capture.
- `interpreter/eval/var/rhs-content.ts`
  - Evaluates non-execution RHS content (data/template/path/content forms).
- `interpreter/eval/var/reference-evaluator.ts`
  - Evaluates variable references and tails, including condensed-pipe reference forms.
- `interpreter/eval/var/execution-evaluator.ts`
  - Evaluates execution-capable RHS nodes:
    - `code`
    - `command`
    - `ExecInvocation`
    - `ExeBlock`
    - `WhenExpression`
    - `ForExpression`
    - `LoopExpression`
    - `foreach`
    - `foreach-command`
    - `NewExpression`
    - `Directive` where `kind === 'env'`
- `interpreter/eval/var/rhs-dispatcher.ts`
  - Routes RHS nodes to the correct evaluator branch and returns typed dispatch results.
- `interpreter/eval/var/collection-evaluator.ts`
  - Detects complex object/array shapes used by variable-construction strategy selection.
  - Evaluates collection entries/items for dispatcher and variable-builder flows.
- `interpreter/eval/var/tool-scope.ts`
  - Normalizes tool collections and tool scopes.
  - Enforces bind/expose validation and parent-child subset constraints.
- `interpreter/eval/var/variable-builder.ts`
  - Selects variable-construction strategy by RHS shape.
  - Applies source/security/internal metadata for constructed variables.
- `interpreter/eval/var/pipeline-finalizer.ts`
  - Applies pipeline skip matrix.
  - Executes unified pipeline when eligible.
  - Rewrites post-pipeline string and structured outputs into final variable wrappers.

## CALL FLOW

1. `prepareVarAssignment` builds assignment context and descriptor state.
2. `createRhsDispatcher(...).evaluate(valueNode)` resolves the RHS into one of:
   - executable-variable override
   - return-control override
   - for-expression variable
   - plain resolved value
3. Tool collections route through `normalizeToolCollection` when `/var tools ...` is active.
4. `createVariableBuilder(...).build(...)` constructs the initial variable wrapper.
5. `createPipelineFinalizer(...).process(variable)` applies pipeline execution and post-pipeline rewrites.
6. `finalizeVariable` attaches capability/security metadata and normalized `mx`.
7. `evaluateVar` stores the variable in `Environment` and triggers autosign flow.

## DATA FLOW NOTES

- Descriptor state merges security metadata from interpolation, RHS evaluation, and pipeline inputs.
- Variable wrappers remain typed through the full flow (`simple-text`, `primitive`, `array`, `object`, `template`, `structured`, executable-derived forms).
- Tool collection validation reads executable signatures from environment variables and enforces parameter coverage constraints.

## Executable Variables

- `/exe` defines executable variables (grammar: `grammar/directives/exe.peggy`).
- Reference/invocation semantics are universal:
  - `@fn` returns an executable reference.
  - `@fn(...)` invokes through `interpreter/eval/exec-invocation.ts`.
- Lazy reference behavior in value contexts:
  - `interpreter/eval/data-values/VariableReferenceEvaluator.ts` preserves executable variables for non-invocation references, enabling deferred execution.
