---
updated: 2025-11-23
tags: #arch, #streaming
related-docs: docs/dev/PIPELINE.md, docs/dev/EFFECTS.md
related-code: interpreter/eval/pipeline/stream-bus.ts, interpreter/eval/pipeline/stream-sinks/*.ts, interpreter/eval/pipeline/executor.ts, interpreter/env/executors/*.ts
---

# STREAMING

## tldr

Streaming emits chunks during execution instead of buffering. Executors spawn async processes, emit CHUNK events to StreamBus, sinks render progress to stderr. Opt-in via `stream` keyword (desugars to `with { stream: true }`). After-guards incompatible; before-guards work normally.

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

## Gotchas

- After-guards incompatible with streaming (validation needs complete output)
- Fixture tests can't validate incremental behavior (only check final output)
- JavaScriptExecutor in-process (synchronous, can't stream like spawn-based executors)
- Parallel groups return first result only without the fix in `parallel-exec.ts`
- StreamBus is singleton (global state, test cleanup required)
