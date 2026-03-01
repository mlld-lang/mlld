---
layout: docs.njk
title: "SDK"
type: category
order: 100
---

The mlld SDK embeds the interpreter in Node.js applications. Four execution modes cover file-based runs, string evaluation, dynamic module injection, and static analysis. State management enables multi-turn workflows. Language SDKs wrap the core for Go, Python, Rust, Ruby, and Elixir.

## SDK

Two public functions cover all SDK use cases:

**`processMlld`** — returns output as a string (simplest API)

```typescript
const output = await processMlld(script);
```

**`execute`** — returns a structured result object

```typescript
const result = await execute(filePath, payload);
console.log(result.output);
console.log(result.effects);
console.log(result.stateWrites);
```

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

### Execute Function

File-based execution with state management.

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

### State Management

#### @state Module

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

#### state:// Protocol

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

#### In-Flight State Updates

SDK clients can mutate `@state` during execution via `update_state`. This enables external control of running scripts:

```python
### Python
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

### Dynamic Module Injection

Inject runtime context without filesystem I/O.

```typescript
execute('./script.mld', { text: 'user input', userId: '123' });
```

```mlld
>> @payload is available directly — no import required
show @payload.text
var @name = @payload.userId ? @payload.userId : "anonymous"
```

Destructuring import also works for required fields:

```mlld
import { text, userId } from @payload
show @text
```

CLI usage with `mlld run`:

```bash
mlld run myscript --topic foo --count 5
```

```mlld
>> In myscript.mld
show `Topic: @payload.topic, Count: @payload.count`
```

Dynamic imports are labeled `src:dynamic` and marked untrusted.

### Analyze Module

Static analysis without execution.

```typescript
const analysis = await analyzeModule('./tools.mld');

if (!analysis.valid) {
  console.error('Errors:', analysis.errors);
}

const tools = analysis.executables
  .filter(e => analysis.exports.includes(e.name));
```

Use cases: MCP proxy, module validation, IDE/LSP, security auditing.

### Payload Access

`@payload` contains data passed to a script at invocation time. It's available as a direct variable — no import required.

```mlld
show `Topic: @payload.topic, Count: @payload.count`
var @env = @payload.env ? @payload.env : "dev"
```

**Destructuring import** (required fields - fails if missing):

```mlld
import { topic, count } from @payload
show `Topic: @topic, Count: @count`
```

**SDK usage**:

```typescript
execute('./script.mld', { topic: 'foo', count: 5 });
```

**CLI usage** — `mlld run`, direct invocation, and `-e` all support payload:

```bash
mlld run myscript --topic foo --count 5
mlld script.mld --topic foo --count 5
mlld -e 'show @payload.topic' --topic foo
```

Unknown flags become `@payload` fields automatically. Kebab-case flags are converted to camelCase (e.g., `--dry-run` becomes `@dryRun`).

`@payload` is always `{}` when no flags are passed — safe to reference fields without checking.

### Language SDKs

Thin wrappers around the mlld CLI for Go, Python, Rust, Ruby, and Elixir. Each keeps a persistent `mlld live --stdio` subprocess for repeated calls via NDJSON RPC.

**Tradeoff:** Feature parity with CLI semantics and low maintenance, but requires Node.js at runtime.

#### Core API (all languages)

All SDKs provide:

- `process(script, options)` — execute inline mlld
- `execute(filepath, payload, options)` — file-based execution with state
- `analyze(filepath)` — static analysis without execution
- `process_async` / `execute_async` — async with handle for in-flight control
- Handle: `wait`, `result`, `cancel`, `update_state(path, value)`

`ExecuteResult.state_writes` merges final-result writes and streamed `state:write` events in all languages.

#### Installation

```bash
### Go
go get github.com/mlld-lang/mlld/sdk/go

### Python
pip install mlld-sdk

### Rust
### Add to Cargo.toml: mlld = "0.1"

### Ruby
cd sdk/ruby && gem build mlld.gemspec && gem install ./mlld-*.gem

### Elixir
cd sdk/elixir && mix deps.get
```

#### Quick Start Examples

**Python:**

```python
from mlld import Client

client = Client()
output = client.process('show "Hello World"')

result = client.execute('./agent.mld', {'text': 'hello'},
    state={'count': 0},
    dynamic_modules={'@config': {'mode': 'demo'}},
    timeout=10)
print(result.output)
client.close()
```

**Go:**

```go
client := mlld.New()
output, _ := client.Process(`show "Hello World"`, nil)

result, _ := client.Execute("./agent.mld",
    map[string]any{"text": "hello"},
    &mlld.ExecuteOptions{
        State: map[string]any{"count": 0},
        Timeout: 10 * time.Second,
    })
fmt.Println(result.Output)
client.Close()
```

**Rust:**

```rust
let client = Client::new();
let output = client.process(r#"show "Hello World""#, None)?;

let result = client.execute("./agent.mld",
    Some(json!({"text": "hello"})),
    Some(ExecuteOptions {
        state: Some(json!({"count": 0})),
        timeout: Some(Duration::from_secs(10)),
        ..Default::default()
    }))?;
println!("{}", result.output);
```

**Elixir:**

```elixir
{:ok, client} = Mlld.Client.start_link(command: "mlld", timeout: 30_000)

{:ok, result} = Mlld.Client.execute(client, "./agent.mld", %{"text" => "hello"},
    state: %{"count" => 0},
    dynamic_modules: %{"@config" => %{"mode" => "demo"}},
    timeout: 10_000)
IO.puts(result.output)
```

#### Elixir-Specific Features

The Elixir SDK adds BEAM-native features:

- **Supervision** — `Mlld.Client` is a GenServer with child spec support
- **Connection pool** — `Mlld.Pool` with checkout/checkin and overflow
- **Telemetry** — `:telemetry` events with `[:mlld, ...]` prefix
- **Phoenix bridge** — `Mlld.Phoenix.stream_execute` for channel integration

#### Requirements

All SDKs require:
- `mlld` CLI on PATH (or command override)
- Node.js runtime
