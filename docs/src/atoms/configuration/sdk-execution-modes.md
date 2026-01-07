---
id: config-sdk-execution-modes
title: SDK Execution Modes
brief: Four modes for SDK consumers
category: configuration
parent: sdk
tags: [configuration, sdk, modes, execution]
related: [config-sdk-dynamic-modules, config-sdk-execute]
related-code: [sdk/execute.ts, sdk/modes/]
updated: 2026-01-05
---

Four modes for SDK consumers:

**document** (default): Returns string

```typescript
const output = await processMlld(script);
```

**structured**: Returns full result object

```typescript
const result = await interpret(script, { mode: 'structured' });
console.log(result.effects);
console.log(result.stateWrites);
```

**stream**: Real-time events

```typescript
const handle = interpret(script, { mode: 'stream' });
handle.on('stream:chunk', e => process.stdout.write(e.text));
await handle.done();
```

**debug**: Full trace

```typescript
const result = await interpret(script, { mode: 'debug' });
console.log(result.trace);
```
