---
updated: 2026-02-18
tags: #arch, #streaming, #sdk
related-docs: docs/dev/OUTPUT.md, docs/dev/PIPELINE.md, docs/dev/INTERPRETER.md
related-code: interpreter/streaming/streaming-manager.ts, interpreter/streaming/adapter-registry.ts, interpreter/streaming/jsonpath.ts, interpreter/streaming/template-interpolator.ts, interpreter/streaming/accumulator.ts, interpreter/eval/pipeline/stream-bus.ts, interpreter/eval/pipeline/executor/streaming-lifecycle.ts, interpreter/eval/pipeline/stream-sinks/*.ts, interpreter/streaming/adapters/*.ts, interpreter/eval/run.ts, interpreter/eval/exec/streaming.ts, interpreter/hooks/guard-post-orchestrator.ts, sdk/types.ts, sdk/execution-emitter.ts, sdk/stream-execution.ts, interpreter/env/Environment.ts, tests/helpers/stream-recorder.ts, interpreter/env/executors/streaming.integration.test.ts
related-types: sdk/types { SDKStreamingEvent, StreamingResult, StreamExecution }, interpreter/streaming/adapters/base.ts { StreamAdapter, ParsedEvent, EventTemplate }
---

# STREAMING

## tldr

- STREAMING owns transport lifecycle: StreamBus, sinks, adapters, and SDK streaming event surfaces.
- `StreamingManager` uses terminal + progress sinks when no adapter is configured.
- Adapter path is active when an adapter is configured (`streamFormat` path; exec-invocation setup may default to `ndjson`).
- Built-in adapter registry names include `claude-code`, `claude-agent-sdk`, `@mlld/claude-agent-sdk`, `anthropic`, and `ndjson`.
- After-guards are denied during streaming by guard post orchestration; `/run` has an additional pre-check.
- `StructuredResult.streaming` is `StreamingResult` (flat optional fields), not a nested `{ accumulated, events }` wrapper.

## Principles

- Explicit opt-in: streaming is enabled only when execution requests it and streaming options allow it.
- Keep event transport separate from output/effect assembly concerns.
- Keep adapter contracts strict and typed (`ndjson | sse | text`, resettable adapters, parsed event templates).
- Keep guard timing safe: after-guards cannot run against live streamed output.

## Details

### Lifecycle Ownership

- Core manager: `interpreter/streaming/streaming-manager.ts`.
- Pipeline lifecycle bridge: `interpreter/eval/pipeline/executor/streaming-lifecycle.ts`.
- StreamBus event source: `interpreter/eval/pipeline/stream-bus.ts`.

Configuration entry paths:

- `/run` path (`interpreter/eval/run.ts`):
  - configures streaming when `with { stream: true }` is active,
  - only attaches adapter when `streamFormat` is explicitly provided,
  - otherwise leaves default sink path (terminal + progress).
- exec-invocation path (`interpreter/eval/exec/streaming.ts`):
  - configures adapter for explicit `streamFormat`,
  - otherwise falls back to `ndjson` adapter.

### Sink Behavior

`StreamingManager.configure(...)` behavior:

- Adapter provided:
  - attaches `FormatAdapterSink`, emits structured SDK streaming events.
- No adapter:
  - attaches `ProgressOnlySink` (stderr progress) and `TerminalSink` (chunk forwarding).

### Adapter Contracts (Current Types)

Source of truth: `interpreter/streaming/adapters/base.ts`.

- `StreamAdapter.format`: `'ndjson' | 'sse' | 'text'`
- `StreamAdapter` methods:
  - `processChunk(chunk)`
  - `flush()`
  - `reset()`
- `ParsedEvent`:
  - `raw?: unknown`
  - `timestamp?: number`
  - `templates?: EventTemplate`
- `EventTemplate` shape:
  - `text?: string`
  - `ansi?: string`
  - `json?: string`

### Adapter Registry and Built-ins

Source of truth: `interpreter/streaming/adapter-registry.ts`.

Built-in adapter names:

- `claude-code`
- `claude-agent-sdk`
- `@mlld/claude-agent-sdk`
- `anthropic`
- `ndjson`

Alias behavior:

- `claude-agent-sdk`, `@mlld/claude-agent-sdk`, and `anthropic` currently map to the Claude Code adapter factory.
- `ndjson` resolves to a minimal generic NDJSON adapter schema.

### Adapter Extraction and Template Boundaries

JSONPath extraction (`interpreter/streaming/jsonpath.ts`):

- Dot paths (`a.b.c`)
- Array index (`items[0]`)
- Array iteration (`items[].name`)
- Fallback paths (`['primary', 'fallback']`)

Template interpolation (`interpreter/streaming/template-interpolator.ts`):

- `@evt.path` variable interpolation into adapter outputs.
- Escapes: `@@`, `\\@`, `%%`.
- Template formats: `text`, `ansi`, `json`.

### FormatAdapterSink Accumulation Boundaries

Source of truth: `interpreter/eval/pipeline/stream-sinks/format-adapter.ts`.

- Parsed events are converted to SDK events in `toSDKEvent(...)` with hyphenated event names.
- Accumulation defaults to enabled and writes into `StreamingResult` fields (`text`, `thinking`, `toolCalls`, `usage`, `errors`).
- Raw `StreamingResult.events` are retained only when `keepRawEvents` is true.
- `stop()` flushes adapter buffers and calls `adapter.reset()`.

### SDK Streaming Events and Result Shape

Source of truth: `sdk/types.ts`.

Hyphenated streaming event names:

- `streaming:message`
- `streaming:thinking`
- `streaming:tool-use`
- `streaming:tool-result`
- `streaming:error`
- `streaming:metadata`

`StructuredResult.streaming` uses `StreamingResult` with optional fields:

- `text`
- `thinking`
- `toolCalls`
- `usage`
- `errors`
- `events`

`events` are retained only when `keepRawEvents: true` (FormatAdapterSink path).

### SDK Emitter Bridge Ownership

- `ExecutionEmitter` (`sdk/execution-emitter.ts`) is pub/sub only (`on/off/once/emit`).
- StreamBus -> SDK event mapping is owned by `Environment`:
  - public entry: `enableSDKEvents(...)`
  - internal bridge: `enableSdkEmitter(...)` + `emitMappedSdkEvents(...)`
  - source file: `interpreter/env/Environment.ts`
- Adapter-formatted `streaming:*` events are emitted through `env.emitSDKEvent(...)` from `FormatAdapterSink`.

### Guard Constraints

- Post-guard streaming denial is enforced in `interpreter/hooks/guard-post-orchestrator.ts`.
- `/run` adds a direct after-guard pre-check in `interpreter/eval/run.ts` before command execution.
- `interpreter/hooks/guard-post-hook.ts` is the hook wrapper/delegator; it does not own denial logic.

### Stream Handle Semantics

`StreamExecution` (`sdk/stream-execution.ts`) exposes:

- `on/off/once`
- `done()`
- `result()`
- `isComplete()`
- `abort()`

Async iterator note:

- The iterator subscribes to a fixed subset of SDK event types (`effect`, `command:*`, `stream:*`, `execution:complete`, `state:write`, debug events).
- It does not subscribe to all `streaming:*` adapter-formatted events.

## Gotchas

- Keep output/effect architecture in `docs/dev/OUTPUT.md`; do not duplicate effect-routing ownership here.
- Do not use underscore event names (`streaming:tool_use`, `streaming:tool_result`); current surface is hyphenated.
- Do not document obsolete adapter format `custom`; current `StreamAdapter.format` union is `ndjson | sse | text`.
