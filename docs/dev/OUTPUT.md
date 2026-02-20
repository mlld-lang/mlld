---
updated: 2026-02-18
tags: #arch, #output, #effects
related-docs: docs/dev/STREAMING.md, docs/dev/INTERPRETER.md, docs/dev/DATA.md
related-code: interpreter/output/intent.ts, interpreter/output/renderer.ts, interpreter/output/normalizer.ts, interpreter/env/EffectHandler.ts, interpreter/env/Environment.ts, interpreter/core/interpreter/traversal.ts, interpreter/core/interpreter/evaluator.ts, interpreter/index.ts, sdk/types.ts
related-types: sdk/types { StructuredEffect }, interpreter/env/EffectHandler { Effect }
---

# OUTPUT

## tldr

- OUTPUT owns intent emission, effect routing, normalization, and final document assembly.
- Effect routing types are `doc | both | stdout | stderr | file`.
- `Environment` converts intents to effects (`intentToEffect`) and emits effects (`emitEffect`) with capability/security context.
- Final markdown output is normalized by `normalizeOutput(...)` at interpretation end.
- STREAMING transport (bus/sinks/adapters/events) is documented separately in `docs/dev/STREAMING.md`.

## Principles

- Keep document assembly deterministic: normalize once at the end of interpretation.
- Keep output routing explicit: intent type maps to effect type; directives can still emit effects directly.
- Keep security metadata attached to effects in structured/debug/stream result modes.
- Keep streaming transport concerns out of OUTPUT ownership.

## Details

### Intent Ownership

- Non-directive text/newline/code-fence intent emission lives in:
  - `interpreter/core/interpreter/traversal.ts`
  - `interpreter/core/interpreter/evaluator.ts`
- Intent buffering/collapse is handled by `OutputRenderer` in `interpreter/output/renderer.ts`.
- Intent helpers/types live in `interpreter/output/intent.ts`.

### Break Collapsing Semantics

Source of truth: `interpreter/output/renderer.ts` (`OutputRenderer.flushBreaks()`).

- Pending collapsible breaks are emitted up to a max of 2:
  - 1 -> 1
  - 2 -> 2
  - 3+ -> 2
- Break collapsing does not reduce adjacent collapsible breaks to a single break.

### Intent-to-Effect Routing

`Environment.intentToEffect(...)` maps intents to effects in `interpreter/env/Environment.ts`:

- `content` -> `doc`
- `break` -> `doc`
- `progress` -> `stdout`
- `error` -> `stderr`

`Environment.emitEffect(...)` then:

- attaches capability/security snapshot context,
- routes through the active `EffectHandler`,
- emits SDK `effect` events when an emitter is present.

### Effect Types and Handler Semantics

Source of truth: `interpreter/env/EffectHandler.ts`.

- `doc`: document buffer only (no direct stdout streaming in `DefaultEffectHandler`).
- `both`: stdout when streaming enabled + document buffer.
- `stdout`: stdout only.
- `stderr`: stderr only.
- `file`: filesystem side effect.
  - `mode: 'append'` is notification-only in handler (append already executed by evaluator paths).
  - write mode (`mode: 'write'` or unset) performs file write in handler.

### Document Assembly Path

- `env.renderOutput()` flushes pending break intents.
- `interpret()` reads the document via `effectHandler.getDocument()`.
- Markdown normalization then runs through `normalizeOutput(...)` (`interpreter/index.ts`).

### Normalizer Rules (Current)

Source of truth: `interpreter/output/normalizer.ts`.

- strips leading newlines before normalization
- preserves frontmatter block boundaries
- protects fenced code blocks and markdown tables from paragraph/header rewrites
- strips trailing whitespace per line
- enforces blank line before headers
- enforces blank line after headers when followed by non-header text
- inserts paragraph breaks with JSON/list guards
- collapses 3+ newlines to max 2
- enforces single trailing newline

### Structured Effects and Security Metadata

- `sdk/types.ts` defines `StructuredEffect` with `security` and optional `provenance`.
- `interpreter/index.ts` collects effects from `EffectHandler.getEffects()` and maps them into structured result output.
- Non-document modes (`structured`, `stream`, `debug`) default to effect recording (`recordEffects`).

## Gotchas

- Do not claim `doc` effects stream to stdout in current `DefaultEffectHandler`; they do not.
- `append` file effects are not replayed by handler writes.
- OUTPUT owns effect semantics and document assembly; STREAMING owns transport and adapter event surfaces.
