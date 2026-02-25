---
id: sdk-state
qa_tier: 2
title: State Management
brief: Mutable state via @state, state:// writes, and in-flight updates
category: sdk
parent: sdk
tags: [sdk, state, stateWrites, update_state]
related: [sdk-execute, sdk-payload, sdk-dynamic-modules]
related-code: [sdk/execute.ts, sdk/state/StateManager.ts]
updated: 2026-02-24
---

## @state Module

Hydrate mutable state from the SDK:

```typescript
const result = await execute('./agent.mld', payload, {
  state: { conversationId: '123', count: 0 }
});
```

Access in mlld:

```mlld
import { @conversationId, @count } from @state
show `Conversation @conversationId, count @count`
```

`@state` is a reserved variable — it's always available when state is provided via SDK or CLI.

## state:// Protocol

Write state back from mlld using the `state://` protocol:

```mlld
var @countUpdate = { count: 5 }
output @countUpdate to "state://count"
output @result to "state://lastResult"
```

State writes are collected in the execution result:

```typescript
for (const write of result.stateWrites) {
  await updateState(write.path, write.value);
}
```

`stateWrites` merges final-result writes and streamed `state:write` events emitted during execution.

## In-Flight State Updates

SDK clients can mutate `@state` during execution via `update_state`. This enables external control of running scripts:

```python
# Python
handle = client.process_async(
    'loop(99999, 50ms) until @state.exit [\n  continue\n]\nshow "done"',
    state={'exit': False},
    timeout=10,
)

time.sleep(0.12)
handle.update_state('exit', True)
print(handle.result())
```

```go
// Go
handle, _ := client.ProcessAsync(script, &mlld.ProcessOptions{
    State: map[string]any{"exit": false},
    Timeout: 10 * time.Second,
})
time.Sleep(120 * time.Millisecond)
handle.UpdateState("exit", true)
output, _ := handle.Result()
```

All language SDKs support `update_state` with retry semantics on `REQUEST_NOT_FOUND`.
