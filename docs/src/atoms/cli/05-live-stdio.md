---
id: config-live-stdio
title: Live STDIO Transport
brief: Persistent NDJSON RPC server for SDK calls
category: configuration
parent: cli
tags: [cli, sdk, rpc, stdio, transport]
related: [config-sdk-execute, config-sdk-execution-modes, config-sdk-dynamic-modules]
related-code: [cli/commands/live.ts, cli/commands/live-stdio-server.ts, sdk/execute.ts, sdk/types.ts]
updated: 2026-02-16
qa_tier: 2
---

Persistent NDJSON RPC transport for long-running SDK operations.

```bash
mlld live --stdio
```

**Protocol format:**

```json
>> Request
{"method":"process","id":1,"params":{"script":"show 'hello'"}}

>> Event stream (during execution)
{"event":{"id":1,"type":"stream:chunk","content":"hello"}}
{"event":{"id":1,"type":"state:write","path":"key","value":"val"}}

>> Result
{"result":{"id":1,"output":"hello","exports":[]}}
```

**Methods:**

- `process` — Execute script text via `params.script`
- `execute` — Run file via `params.filepath` with optional payload/state/dynamicModules
- `analyze` — Static analysis via `params.filepath`
- `state:update` — Update in-flight `@state` for `params.requestId` (path + value)
- `cancel` — Abort active request by id

**Process params:**

```json
{
  "script": "show 'hello'",
  "filePath": "/example/context.mld",
  "mode": "strict",
  "payload": {"key": "value"},
  "state": {"sessionId": "123"},
  "dynamicModules": {"@custom": {"data": [1,2,3]}},
  "allowAbsolutePaths": true
}
```

**Execute params:**

```json
{
  "filepath": "./agent.mld",
  "payload": {"task": "analyze"},
  "state": {"conversationId": "abc"},
  "dynamicModules": {"@tools": "export @search = ..."},
  "timeoutMs": 30000,
  "mode": "markdown"
}
```

**State updates** (during execution):

```json
>> Request to update in-flight state
{"method":"state:update","id":2,"params":{
  "requestId": 1,
  "path": "loopControl.stop",
  "value": true
}}

>> Response
{"result":{"id":2,"requestId":1,"path":"loopControl.stop"}}
```

**Lifecycle:**

- Server runs until stdin EOF, SIGINT, or SIGTERM
- Each request uses fresh interpreter environment
- AST caching persists across requests (mtime-based invalidation)
- Active requests abort on shutdown or explicit `cancel`

**SDK integration:**

Go, Python, Rust, and Ruby SDKs maintain persistent `mlld live --stdio` subprocesses. Each provides async handle APIs:

```python
handle = client.execute_async("./script.mld", payload)
handle.update_state("flag", True)  # In-flight state mutation
result = handle.wait()
```

**Error codes:**

- `INVALID_JSON` — Malformed request
- `INVALID_REQUEST` — Missing required fields
- `REQUEST_IN_PROGRESS` — Duplicate request id
- `REQUEST_NOT_FOUND` — Cancel/state:update for unknown id
- `STATE_UNAVAILABLE` — No dynamic `@state` to update
- `METHOD_NOT_FOUND` — Unknown method
- `RUNTIME_ERROR` — Execution failure
- `ABORTED` — Canceled request
- `TIMEOUT` — Execution exceeded limit
