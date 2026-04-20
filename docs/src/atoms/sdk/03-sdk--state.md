---
id: sdk-state
qa_tier: 2
title: State Management
brief: Mutable state via @state, state:// writes, in-flight updates, and boundary labels
category: sdk
parent: sdk
tags: [sdk, state, stateWrites, update_state]
related: [sdk-execute, sdk-payload, sdk-dynamic-modules]
related-code: [sdk/execute.ts, sdk/state/StateManager.ts]
updated: 2026-04-20
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

## Labeled State Updates

Boundary values injected through `update_state` can carry security labels, just like labeled values declared in mlld source.

```python
handle.update_state("tool_result", result_text, labels=["untrusted"])
```

```go
handle.UpdateState("tool_result", resultText, "untrusted")
```

```rust
handle.update_state_with_labels("tool_result", result_text, ["untrusted"])?;
```

Labels applied through SDK state updates:

- are visible on `@state.some_path.mx.labels`
- propagate through normal mlld label flow
- are optional; omitting labels preserves unlabeled behavior for that updated path

## Event Streaming

Handles emit events during execution. Use `next_event` to consume them:

```python
handle = client.execute_async("./agent.mld", payload)

while True:
    event = handle.next_event(timeout=5)
    if event is None or event.type == "complete":
        break
    if event.type == "state_write":
        print(f"State: {event.state_write.path} = {event.state_write.value}")
    elif event.type == "session_write":
        print(f"Session: {event.session_write.slot_path} = {event.session_write.next}")
    elif event.type == "guard_denial":
        print(f"Denied: {event.guard_denial.operation}")

result = handle.result()
```

State writes and guard denials from events are merged into the final `ExecuteResult` regardless of whether `next_event` was called. Session writes stay event-stream only; the final committed session state is returned in `result.sessions`. That snapshot matches `@returnedValue.mx.sessions.<name>` for the attached `exe llm` call, including wrapper-bearing leaves when slot values still carry labels or other `.mx` metadata. `result()` can be called at any time — it blocks until execution completes.

## Handle Lifecycle

Handles follow a three-state lifecycle: PENDING → STREAMING → COMPLETE. After COMPLETE, `next_event` returns null, `result()` returns the cached result (idempotent), and `update_state` errors. See `sdk/SPEC.md` for full terminal semantics.
