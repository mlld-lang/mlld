---
updated: 2025-11-28
tags: #arch, #streaming, #sdk
related-docs: docs/dev/PIPELINE.md, docs/dev/EFFECTS.md
related-code: interpreter/eval/pipeline/stream-bus.ts, sdk/execution-emitter.ts, sdk/stream-execution.ts, interpreter/env/executors/*.ts
---

# STREAMING

## tldr

Streaming emits chunks during execution instead of buffering. Executors spawn async processes, emit CHUNK events to StreamBus, which bridges to SDK events via ExecutionEmitter. Scripts opt-in via `stream` keyword; SDK consumers choose consumption mode (`document`, `structured`, `stream`, `debug`). After-guards incompatible with streaming; before-guards work normally.

## Principles

- Explicit opt-in (no auto-detection or magic)
- Progress to stderr (stdout stays clean for piping)
- Chunks emit during execution (not after buffering)
- Parallel results buffer for ordered output
- Script controls execution mode, API controls consumption

## Details

**Entry points**: `PipelineExecutor.attachStreamingSinks()`, `ShellCommandExecutor.executeStreamingCommand()`, `executeParallelExecInvocations()`

**Event Flow**:
- Executors emit via `getStreamBus()`: `PIPELINE_START|COMPLETE|ABORT`, `STAGE_START|SUCCESS|FAILURE`, `CHUNK`
- Events include: `pipelineId`, `stageIndex`, `parallelIndex?`, `source`, `timestamp`, `metadata?`
- Sinks attach when any stage has `stream` flag:
  - `TerminalSink`: Routes CHUNK text to stdout/stderr
  - `ProgressOnlySink`: Token counts to stderr (TTY-aware, carriage-return or newline)
- Effect handler stays separate (document assembly, not streaming)

**Executors**:
- ShellCommandExecutor, BashExecutor, NodeExecutor: spawn child processes, emit CHUNK on stdout/stderr data events
- Decoders flush with `.end()` on close (preserves trailing multi-byte UTF-8)
- Context flag `streamingEnabled` triggers spawn-based execution vs buffered
- PythonExecutor delegates to ShellCommandExecutor (inherits streaming)
- JavaScriptExecutor in-process (no streaming)

**Parallel Execution**:
- `@a() || @b()` for ExecInvocations routes to `executeParallelExecInvocations()` helper
- Converts to parallel pipeline stage, runs via PipelineExecutor
- Chunks from both branches emit concurrently with distinct `parallelIndex`
- Results buffer until all branches complete, then aggregate to array

**Suppression**:
- CLI: `--no-stream` or env `MLLD_NO_STREAM=true` disables sinks
- API: `interpret(..., { streaming: { enabled: false } })`
- Streaming disabled = no CHUNK events, no progress display, still buffers correctly

**Guards**:
- Before-guards: Work normally with streaming
- After-guards: Error when `streamingEnabled=true` (need complete output to validate)
- Error message suggests: remove `after`, use `with { stream: false }`, or buffer-then-validate pattern
- Implementation: `guard-post-hook.ts` checks `operation.metadata.streaming`

**Testing**:
- Integration: `streaming.integration.test.ts` validates timing (chunks at different times), all executors, parallel overlap
- Fixtures: `tests/cases/feat/streaming/` validate syntax and final output (not timing)
- Helper: `stream-recorder.ts` captures events with timestamps for timing assertions

## SDK Execution Modes

SDK v2 introduces execution modes that control how consumers receive output:

| Mode | Returns | Real-time Events | Use Case |
|------|---------|------------------|----------|
| `document` | `string` | No | Default CLI behavior |
| `structured` | `{ output, effects, exports, environment }` | No | Extract data programmatically |
| `stream` | `StreamExecution` handle | Yes | Real-time UIs, progress |
| `debug` | `DebugResult` with trace | Yes | Development, debugging |

**Key principle**: Script controls execution (`stream` keyword), SDK controls consumption (mode selection).

### Stream Mode Handle

`StreamExecution` handle returned by `interpret(mode:'stream')`:

- `.on(type, handler)` / `.off(type, handler)` - Event subscription
- `.once(type, handler)` - One-time handler
- `.done()` - Promise that resolves on completion
- `.result()` - Promise that resolves to StructuredResult
- `.isComplete()` - Check if execution finished
- `.abort()` - Cancel execution (triggers cleanup)

### ExecutionEmitter Bridge

`ExecutionEmitter` bridges StreamBus events to SDK events:
- `CHUNK` → `stream:chunk`
- `PIPELINE_*` / `STAGE_*` → `stream:progress`, `command:start`, `command:complete`

Environment owns the emitter and propagates it to child environments. Effects emit SDK events with security metadata when an emitter is attached.

## CLI Flags

- `mlld script.mld` → mode `document`, streams to stdout
- `mlld script.mld --debug` → mode `stream`, progress to stderr
- `mlld script.mld --debug --json` → mode `debug`, JSON to stdout
- `mlld script.mld --no-stream` → mode `document`, streaming disabled

Single stdout writer enforced: document text OR JSON, never both.

## Gotchas

- After-guards incompatible with streaming (validation needs complete output)
- Fixture tests can't validate incremental behavior (only check final output)
- JavaScriptExecutor in-process (synchronous, can't stream like spawn-based executors)
- Parallel groups return first result only without the fix in `parallel-exec.ts`
- StreamBus is singleton (global state, test cleanup required)
- Stream mode returns handle immediately; execution runs async in background
