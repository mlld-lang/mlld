---
id: sdk-execution-modes
qa_tier: 3
title: SDK Execution Modes
brief: processMlld and execute — two functions for all SDK use cases
category: sdk
parent: sdk
tags: [configuration, sdk, modes, execution]
related: [config-sdk-dynamic-modules, config-sdk-execute]
related-code: [sdk/execute.ts, sdk/modes/]
updated: 2026-04-21
---

Two public functions cover all SDK use cases:

**`processMlld`** — returns output as a string (simplest API)

```typescript
const output = await processMlld(script);
```

**`execute`** — returns a structured result object

```typescript
const result = await execute(filePath, payload);
console.log(result.output);        // text output
console.log(result.stateWrites);   // state:// writes
console.log(result.sessions);      // final session-scoped state snapshots
console.log(result.effects);       // output effects
console.log(result.denials);       // guard/policy denials
console.log(result.traceEvents);   // runtime trace events
console.log(result.metrics);       // timing (totalMs, parseMs, evaluateMs)
```

`result.sessions` is the same final committed session snapshot that an attached `exe llm` call exposes inside mlld at `@someValue.mx.sessions.<name>`. Leaf values that still carry labels or other wrapper metadata remain wrapper-bearing values instead of being flattened to plain JSON.

**Streaming** — pass `stream: true` to get real-time events

```typescript
const stream = await execute(filePath, payload, { stream: true });
stream.on('effect', e => console.log(e));
stream.on('stream:chunk', e => process.stdout.write(e.text));
await stream.done();
```

The `StreamExecution` object supports `on`/`off`/`once` event subscriptions and is also an `AsyncIterable`:

```typescript
for await (const event of stream) {
  console.log(event.type, event);
}
```

**Runtime tracing** — pass trace options to capture execution events

```typescript
const result = await execute(filePath, payload, {
  trace: 'effects',
  traceMemory: true
});

const memoryEvents = result.traceEvents.filter(event => event.category === 'memory');
```

`traceMemory: true` adds `memory.*` events with RSS, heap, external, and ArrayBuffer samples. To correlate memory samples with non-memory runtime events, set `trace` as well. `processMlld()` accepts the same trace options, but since it returns only text output, use `traceFile` to persist trace events:

```typescript
await processMlld(script, {
  traceMemory: true,
  traceFile: 'tmp/trace.jsonl',
  traceStderr: false
});
```
