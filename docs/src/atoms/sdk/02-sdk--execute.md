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
updated: 2026-03-15
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
```

Features:
- In-memory AST caching (mtime-based invalidation)
- State hydration via `@state` module
- Payload injection via `@payload`, including per-field labels via `payloadLabels`
- State writes via `state://` protocol
- Stream handles can apply labeled in-flight state updates with `updateState(path, value, labels?)`
- `mcpServers` maps logical names to MCP server commands per-execution

**MCP server injection** lets parallel `execute()` calls each get independent MCP server instances:

```typescript
const result = await execute('./agent.mld', payload, {
  mcpServers: { tools: 'uv run python3 server.py --config abc' }
});
```

The script uses `import tools from mcp "tools" as @t` — `"tools"` resolves to the SDK-provided command instead of being treated as a shell command.
