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
