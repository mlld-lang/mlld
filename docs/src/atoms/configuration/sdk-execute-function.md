---
id: config-sdk-execute
title: Execute Function
brief: File-based execution with state management
category: configuration
parent: sdk
tags: [configuration, sdk, execute, state]
related: [config-sdk-dynamic-modules, config-sdk-execution-modes]
related-code: [sdk/execute.ts, sdk/state/StateManager.ts]
updated: 2026-01-05
---

**File-based execution with state management:**

```typescript
const result = await execute('./agent.mld', payload, {
  state: { conversationId: '123', messages: [...] },
  timeout: 30000
});

for (const write of result.stateWrites) {
  await updateState(write.path, write.value);
}
```

Features:
- In-memory AST caching (mtime-based invalidation)
- State hydration via `@state` module
- Payload injection via `@payload`
- State writes via `state://` protocol
