# Streaming Format Adapters

Streaming format adapters parse streaming output from external processes (NDJSON, SSE, etc.) and extract structured events that can be displayed or accumulated.

## Architecture

```
Executors → StreamBus → FormatAdapterSink → Parse Format
                                          → Extract Data
                                          → Apply Templates
                                          → Emit SDK Events
                                          → Accumulate Results
```

## Quick Start

### Using the Claude Code Adapter

```typescript
import { createClaudeCodeAdapter } from 'mlld/interpreter/streaming/adapters/claude-code';
import { FormatAdapterSink } from 'mlld/interpreter/eval/pipeline/stream-sinks/format-adapter';

const adapter = createClaudeCodeAdapter();
const sink = new FormatAdapterSink({
  adapter,
  accumulate: true,
  onEvent: (event) => {
    if (event.type === 'streaming:message') {
      process.stdout.write(event.chunk);
    }
  }
});

// Process streaming chunks
sink.handle({ type: 'CHUNK', chunk: '{"type":"text","text":"Hello"}\\n', ... });

// Get accumulated result
sink.stop();
const result = sink.getResult();
console.log(result.text); // "Hello"
```

### Using the Adapter Registry

```typescript
import { getAdapter, registerAdapter } from 'mlld/interpreter/streaming/adapter-registry';

// Get builtin adapter
const adapter = await getAdapter('claude-code');

// Register custom adapter
registerAdapter('my-format', {
  version: '1.0.0',
  factory: () => createNDJSONAdapter({
    name: 'my-format',
    schemas: [...]
  })
});
```

## Components

### StreamAdapter Interface

All adapters implement the `StreamAdapter` interface:

```typescript
interface StreamAdapter {
  readonly name: string;
  readonly format: 'ndjson' | 'sse' | 'text';

  processChunk(chunk: string): ParsedEvent[];
  flush(): ParsedEvent[];
  reset(): void;
}
```

### ParsedEvent

Events parsed by adapters have the following structure:

```typescript
interface ParsedEvent {
  kind: 'thinking' | 'message' | 'tool-use' | 'tool-result' | 'error' | 'metadata' | 'unknown';
  data: Record<string, unknown>;
  raw?: unknown;
  timestamp?: number;
  templates?: EventTemplate;
}
```

### EventSchema

Schemas define how to match and extract data from streaming events:

```typescript
interface EventSchema {
  kind: ParsedEventKind;
  match?: Record<string, unknown>;     // Match exact field values
  matchPath?: string;                   // Path to match
  matchValue?: unknown;                 // Expected value at path
  extract: ExtractionConfig;            // Fields to extract
  templates?: EventTemplate;            // Output templates
  visibility?: 'always' | 'hidden' | 'optional';
}
```

## JSONPath Extraction

The adapter system supports JSONPath-like expressions for extracting data:

```typescript
// Dot notation
'user.profile.name'

// Array indexing
'items[0]'
'content[1].text'

// Array iteration
'items[].name'  // Collects from all items

// Fallback paths
['primary', 'fallback', 'default']
```

## Templates

Templates provide formatted output with variable interpolation:

```typescript
const templates = {
  text: '@evt.chunk',
  ansi: '%dim%@evt.text%reset%'
};
```

### Variable Syntax
- `@evt.field` - Extract field from event data
- `@evt.nested.field` - Nested field access
- `@@` - Escaped @ (outputs literal @)
- `%%` - Escaped % (outputs literal %)

### ANSI Color Codes
- `%red%`, `%green%`, `%blue%`, etc. - Colors
- `%bold%`, `%dim%`, `%italic%` - Modifiers
- `%reset%` - Reset all formatting

## FormatAdapterSink

The `FormatAdapterSink` connects adapters to the StreamBus:

```typescript
const sink = new FormatAdapterSink({
  adapter: createClaudeCodeAdapter(),
  visibility: {
    showThinking: true,
    showTools: false,
    showMetadata: false,
    showAll: false
  },
  accumulate: true,
  keepRawEvents: false,
  onEvent: (event) => { ... }
});
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `adapter` | `StreamAdapter` | The adapter to use |
| `visibility` | `StreamingVisibility` | Control which events are displayed |
| `accumulate` | `boolean` | Accumulate results (default: true) |
| `keepRawEvents` | `boolean` | Keep all raw events in result |
| `onEvent` | `function` | Callback for each event |

### Visibility Control

```bash
# CLI flags
mlld script.mld --show-thinking
mlld script.mld --show-tools
mlld script.mld --show-metadata
mlld script.mld --show-all-streaming
mlld script.mld --stream-format ansi
```

## StreamingAccumulator

The accumulator collects streaming data into a structured result:

```typescript
import { createAccumulator, createTextAccumulator } from 'mlld/interpreter/streaming/accumulator';

// Full accumulator
const acc = createAccumulator();
acc.accumulate(event);
const result = acc.getResult();

// Text-only accumulator
const textAcc = createTextAccumulator();
```

### Accumulation Configuration

```typescript
const config = {
  concat: [
    { from: ['message'], field: 'chunk', to: 'text' },
    { from: ['thinking'], field: 'text', to: 'thinking' }
  ],
  collect: [
    { from: ['tool-use'], transform: (d) => ({ name: d.name }), to: 'toolCalls' }
  ],
  capture: [
    { from: ['metadata'], transform: (d) => d.usage, to: 'usage' }
  ]
};
```

## Builtin Adapters

### claude-code

Adapter for Claude Code SDK NDJSON streaming output.

Event types:
- `thinking` - Model reasoning
- `text` - Message content
- `tool_use` - Tool invocations
- `tool_result` - Tool results
- `error` - Error events
- `result` - Usage metadata

### Creating Custom Adapters

```typescript
import { createNDJSONAdapter } from 'mlld/interpreter/streaming/adapters/ndjson';

const myAdapter = createNDJSONAdapter({
  name: 'my-api',
  schemas: [
    {
      kind: 'message',
      matchPath: 'event',
      matchValue: 'message',
      extract: {
        chunk: 'data.content',
        role: 'data.role'
      },
      templates: {
        text: '@evt.chunk',
        ansi: '%cyan%[@evt.role]%reset% @evt.chunk'
      }
    }
  ]
});
```

## SDK Event Types

Events emitted to SDK consumers:

```typescript
type SDKStreamingEvent =
  | SDKStreamingThinkingEvent
  | SDKStreamingMessageEvent
  | SDKStreamingToolUseEvent
  | SDKStreamingToolResultEvent
  | SDKStreamingErrorEvent
  | SDKStreamingMetadataEvent;
```

Each event includes:
- `type` - Event type string
- `formatted` - Pre-formatted output (plain + ansi)
- `displayed` - Whether it was shown to user
- `timestamp` - Event timestamp

## StreamingResult

The accumulated result structure:

```typescript
interface StreamingResult {
  text?: string;           // Concatenated messages
  thinking?: string;       // Concatenated thinking
  toolCalls?: StreamingToolCall[];
  usage?: StreamingUsageMetadata;
  errors?: SDKStreamingErrorEvent[];
  events?: SDKStreamingEvent[];  // When keepRawEvents: true
}
```

## Files

| File | Description |
|------|-------------|
| `interpreter/streaming/adapters/base.ts` | Base adapter interface |
| `interpreter/streaming/adapters/ndjson.ts` | NDJSON adapter |
| `interpreter/streaming/adapters/claude-code.ts` | Claude Code adapter |
| `interpreter/streaming/adapter-registry.ts` | Adapter registry |
| `interpreter/streaming/jsonpath.ts` | JSONPath extraction |
| `interpreter/streaming/template-interpolator.ts` | Template system |
| `interpreter/streaming/accumulator.ts` | Result accumulation |
| `interpreter/eval/pipeline/stream-sinks/format-adapter.ts` | StreamBus sink |
| `core/utils/ansi-processor.ts` | ANSI color processing |
