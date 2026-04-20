---
id: sdk-execute-function
qa_tier: 3
title: Execute Function
brief: File-based execution with state management and boundary labels
category: sdk
parent: sdk
tags: [configuration, sdk, execute, state]
related: [config-sdk-dynamic-modules, config-sdk-execution-modes]
related-code: [sdk/execute.ts, sdk/state/StateManager.ts]
updated: 2026-04-20
---

File-based execution with state management.

```typescript
const result = await execute('./agent.mld', payload, {
  state: { conversationId: '123', messages: [...] },
  payloadLabels: { history: ['untrusted'] },
  timeout: 30000
});

for (const write of result.stateWrites) {
  await updateState(write.path, write.value);
}

for (const session of result.sessions) {
  console.log(session.name, session.finalState);
}
```

Features:
- In-memory AST caching (mtime-based invalidation)
- State hydration via `@state` module
- Payload injection via `@payload`, including per-field labels via `payloadLabels`
- State writes via `state://` protocol (merged from streamed events + final result)
- Session-scoped state final snapshots via `result.sessions`, matching `@returnedValue.mx.sessions.<name>` inside mlld
- Stream handles emit `session_write` events when committed session slot writes occur
- Stream handles support `updateState(path, value, labels?)`, `writeFile(path, content)`, and event consumption via async iteration or `next_event`
- `mcpServers` maps logical names to MCP server commands per-execution
- Results include `stateWrites`, `sessions`, `effects` (with security metadata), `denials` (guard/policy), and `metrics` (timing)

`result.sessions` is the final committed state per attached session frame. Per-write session activity stays in the event stream:

```typescript
const stream = await execute('./agent.mld', payload, { stream: true });

for await (const event of stream) {
  if (event.type === 'session_write') {
    console.log(event.session_write.slot_path, event.session_write.next);
  }
}
```

These snapshots preserve wrapper-bearing leaves. If a final slot value still carries labels or other `.mx` metadata, that leaf remains a structured runtime value in `result.sessions` instead of being flattened away.

**MCP server injection** lets parallel `execute()` calls each get independent MCP server instances:

```typescript
const result = await execute('./agent.mld', payload, {
  mcpServers: { tools: 'uv run python3 server.py --config abc' }
});
```

The script uses `import tools from mcp "tools" as @t` — `"tools"` resolves to the SDK-provided command instead of being treated as a shell command.
