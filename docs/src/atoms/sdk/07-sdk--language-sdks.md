---
id: sdk-language-sdks
qa_tier: 3
title: Language SDKs
brief: Thin wrappers for Go, Python, Rust, Ruby, and Elixir, including boundary-label APIs
category: sdk
parent: sdk
tags: [sdk, go, python, rust, ruby, elixir]
related: [sdk-basics, sdk-execute, sdk-state, cli-live-stdio]
related-code: [sdk/go, sdk/python, sdk/rust, sdk/ruby, sdk/elixir]
updated: 2026-03-15
---

Thin wrappers around the mlld CLI for Go, Python, Rust, Ruby, and Elixir. Each keeps a persistent `mlld live --stdio` subprocess for repeated calls via NDJSON RPC.

**Tradeoff:** Feature parity with CLI semantics and low maintenance, but requires Node.js at runtime.

## Core API (all languages)

All SDKs provide:

- `process(script, options)` — execute inline mlld
- `execute(filepath, payload, options)` — file-based execution with state
- `analyze(filepath)` — static analysis without execution
- `process_async` / `execute_async` — async with handle for in-flight control
- Handle: `wait`, `result`, `cancel`, `update_state(path, value)`

`ExecuteResult.state_writes` merges final-result writes and streamed `state:write` events in all languages.

## Boundary Labels

All SDKs now support labels on values crossing into the runtime:

- Payload labels:
  TypeScript/live transport use `payloadLabels`
  Python, Ruby, and Elixir use `payload_labels`
  Go uses `PayloadLabels`
  Rust uses `payload_labels` on `ProcessOptions` / `ExecuteOptions`
- State update labels:
  Python, Ruby, and Elixir use `update_state(..., labels=[...])`
  Go uses variadic labels: `UpdateState(path, value, "untrusted")`
  Rust exposes `update_state_with_labels(...)`

Those labels surface on `@payload.*.mx.labels` and `@state.*.mx.labels`, then propagate through normal mlld policy/guard flow.

## Installation

```bash
# Go
go get github.com/mlld-lang/mlld/sdk/go

# Python
pip install mlld-sdk

# Rust
# Add to Cargo.toml: mlld = "0.1"

# Ruby
cd sdk/ruby && gem build mlld.gemspec && gem install ./mlld-*.gem

# Elixir
cd sdk/elixir && mix deps.get
```

## Quick Start Examples

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

## Elixir-Specific Features

The Elixir SDK adds BEAM-native features:

- **Supervision** — `Mlld.Client` is a GenServer with child spec support
- **Connection pool** — `Mlld.Pool` with checkout/checkin and overflow
- **Telemetry** — `:telemetry` events with `[:mlld, ...]` prefix
- **Phoenix bridge** — `Mlld.Phoenix.stream_execute` for channel integration

## Requirements

All SDKs require:
- `mlld` CLI on PATH (or command override)
- Node.js runtime
