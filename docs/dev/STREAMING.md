---
updated: 2025-12-02
tags: #arch, #streaming, #sdk
related-docs: docs/dev/PIPELINE.md, docs/dev/EFFECTS.md
related-code: interpreter/streaming/streaming-manager.ts, interpreter/eval/pipeline/stream-bus.ts, interpreter/streaming/adapters/*.ts, sdk/execution-emitter.ts
---

# STREAMING

## tldr

Streaming emits chunks during execution instead of buffering. Executors spawn async processes, emit CHUNK events to StreamBus. Format adapters parse NDJSON chunks into structured events (text, tool use, etc.) and emit to SDK via ExecutionEmitter. Scripts opt-in via `stream` keyword; SDK consumers choose consumption mode (`document`, `structured`, `stream`, `debug`). After-guards incompatible with streaming; before-guards work normally.

## Principles

- Explicit opt-in (no auto-detection or magic)
- Progress to stderr (stdout stays clean for piping)
- Chunks emit during execution (not after buffering)
- Parallel results buffer for ordered output
- Script controls execution mode, API controls consumption

## Details

**Entry points**: `StreamingManager.configure()` attaches sinks for a run/exec, `PipelineExecutor` emits pipeline events, executors stream chunks via the injected bus, `executeParallelExecInvocations()` handles parallel exec stages.

**Event Flow**:
- Executors emit via the StreamingManager-provided `StreamBus`: `PIPELINE_START|COMPLETE|ABORT`, `STAGE_START|SUCCESS|FAILURE`, `CHUNK`
- Events include: `pipelineId`, `stageIndex`, `parallelIndex?`, `source`, `timestamp`, `metadata?`
- StreamingManager configures sinks based on options:
  - With `streamFormat`: `FormatAdapterSink` parses NDJSON, extracts structured data, emits SDK events
  - Without `streamFormat`: Default `ndjson` adapter handles generic NDJSON parsing
  - `TerminalSink`: Routes raw CHUNK text to stdout/stderr (used when no adapter)
  - `ProgressOnlySink`: Token counts to stderr (TTY-aware, carriage-return or newline)
- FormatAdapterSink and TerminalSink are mutually exclusive (adapter replaces terminal sink)
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

## Format Adapters

Format adapters parse NDJSON streaming output into structured events. All streaming uses the adapter path.

**Architecture**:
```
CHUNK events → FormatAdapterSink → Adapter.processChunk() → ParsedEvent[]
                                                         → env.emitSDKEvent()
                                                         → Accumulator (text, toolCalls)
```

**Key Components**:
- `StreamingManager` (`interpreter/streaming/streaming-manager.ts`): Owns StreamBus and sink lifecycle
- `FormatAdapterSink` (`interpreter/eval/pipeline/stream-sinks/format-adapter.ts`): Subscribes to bus, delegates to adapter
- `adapter-registry.ts`: Lazy-loads adapters by name (`claude-code`, `ndjson`, `@mlld/claude-agent-sdk`)
- Adapters (`interpreter/streaming/adapters/*.ts`): Define schemas for parsing specific NDJSON formats
- `stream-format.ts`: Resolves `streamFormat` values (names or AdapterConfig objects) into adapters

**Adapter Interface**:
```typescript
interface StreamAdapter {
  name: string;
  format: 'ndjson' | 'sse' | 'custom';
  processChunk(chunk: string): ParsedEvent[];
  flush(): ParsedEvent[];
}

interface ParsedEvent {
  kind: 'message' | 'thinking' | 'tool-use' | 'tool-result' | 'error' | 'metadata' | 'unknown';
  data: Record<string, unknown>;
  raw: unknown;
  timestamp: number;
  templates?: Record<string, string>;
}
```

**Built-in Adapters**:
| Name | Aliases | Purpose |
|------|---------|---------|
| `claude-code` | `claude-agent-sdk`, `@mlld/claude-agent-sdk` | Claude SDK NDJSON format |
| `ndjson` | - | Generic NDJSON (default when streaming enabled) |

**Schema Matching**: Adapters define schemas with `matchPath` and `matchValue` to identify event types:
```typescript
{
  kind: 'message',
  matchPath: 'type',        // JSONPath to check
  matchValue: 'text',       // Expected value
  extract: { chunk: ['text', 'content'] },  // Fields to extract (with fallbacks)
  visibility: 'always'      // 'always' | 'optional' | 'hidden'
}
```

**Usage**:
- Name lookup:
  ```mlld
  /run stream @cmd() with { streamFormat: "claude-code" }
  ```
- Adapter config object (AdapterConfig shape: `{ name, format: 'ndjson', schemas, defaultSchema? }`):
  ```mlld
  /import { @claudeAgentSdkAdapter } from @mlld/stream-claude-agent-sdk
  /run stream @cmd() with { streamFormat: @claudeAgentSdkAdapter }
  ```
  `@claudeAgentSdkAdapter` matches the built-in `claude-code` schema but ships via module install.

**SDK Events from Adapters**: FormatAdapterSink emits SDK events for each parsed event:
- `streaming:message` - Text content chunks
- `streaming:thinking` - Thinking/reasoning blocks
- `streaming:tool_use` - Tool invocations
- `streaming:tool_result` - Tool outputs
- `streaming:error` - Error events
- `streaming:metadata` - Usage stats, stop reasons

**Accumulated Results**: After streaming completes, `StreamingManager.finalizeResults()` returns accumulated data which populates `StructuredResult.streaming`:
```typescript
interface StructuredResult {
  output: string;
  effects: StructuredEffect[];
  exports: ExportMap;
  streaming?: {
    accumulated: { text?: string; toolCalls?: any[]; thinking?: string };
    events: ParsedEvent[];
  };
}
```

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
- Async iterable: `for await (const event of streamHandle) { ... }` yields the same SDK events as `.on(...)`

### ExecutionEmitter Bridge

`ExecutionEmitter` bridges StreamBus events to SDK events:
- `CHUNK` → `stream:chunk`
- `PIPELINE_*` / `STAGE_*` → `stream:progress`, `command:start`, `command:complete`

FormatAdapterSink emits additional SDK events for parsed streaming content:
- `streaming:message` - Text chunks extracted from NDJSON
- `streaming:thinking` - Reasoning/thinking blocks
- `streaming:tool_use` - Tool invocation events
- `streaming:tool_result` - Tool output events
- `streaming:error` - Error events from stream
- `streaming:metadata` - Usage stats, model info

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
- StreamingManager scopes a StreamBus per interpretation and tears down sinks after execution
- Stream mode returns handle immediately; execution runs async in background
