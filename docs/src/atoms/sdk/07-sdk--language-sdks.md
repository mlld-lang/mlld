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
updated: 2026-04-04
---

Thin wrappers around the mlld CLI for Go, Python, Rust, Ruby, and Elixir. Each keeps a persistent `mlld live --stdio` subprocess for repeated calls via NDJSON RPC.

See `sdk/SPEC.md` for the canonical interface specification.

## Core API (all languages)

All SDKs provide:

- `process(script, options)` — execute inline mlld, return text
- `execute(filepath, payload, options)` — file-based execution, return structured result
- `analyze(filepath)` — static analysis without execution
- `process_async` / `execute_async` — return a handle for in-flight control

### ExecuteResult

Every `execute` call returns a structured result:

| Field | Description |
|-------|-------------|
| `output` | Text output |
| `state_writes` | All state:// writes (merged: streamed + final) |
| `exports` | Exported values |
| `effects` | Output effects with security metadata |
| `denials` | Guard/policy label-flow denials observed during execution |
| `trace_events` | Runtime trace events (when `trace` option is set) |
| `metrics` | Timing statistics (total_ms, parse_ms, evaluate_ms) |

### Options

Common options for `process` and `execute`:

| Option | Description |
|--------|-------------|
| `payload_labels` | Per-field security labels for payload |
| `state` | Injected as `@state` |
| `dynamic_modules` | Injected as importable modules |
| `dynamic_module_source` | Source label for dynamic modules |
| `mcp_servers` | Logical name to MCP server command |
| `mode` | Parsing mode: `"strict"` or `"markdown"` |
| `allow_absolute_paths` | Allow absolute path access |
| `timeout` | Override client default |
| `trace` | Runtime trace level: `"off"`, `"effects"`, or `"verbose"` |
| `trace_file` | Write trace events as JSONL to a file path |

## Handle API

Handles follow a three-state lifecycle: **PENDING → STREAMING → COMPLETE**.

All handle types provide:

| Method | Description |
|--------|-------------|
| `request_id` | Unique request identifier |
| `cancel()` | Request graceful cancellation |
| `update_state(path, value, labels?)` | Mutate in-flight `@state` |
| `next_event(timeout?)` | Block until next event; returns null on timeout |
| `wait()` / `result()` | Block until complete, return final result |

`ExecuteHandle` also provides:

| Method | Description |
|--------|-------------|
| `write_file(path, content)` | Write a file within the execution context (auto-signed) |

### Event types from next_event

| Type | Payload | Description |
|------|---------|-------------|
| `"state_write"` | `StateWrite` | A state:// write occurred |
| `"guard_denial"` | `GuardDenial` | A guard/policy denied an operation |
| `"complete"` | none | Execution finished |

Events are buffered in FIFO order. State writes and guard denials from events are merged into the final `ExecuteResult` regardless of whether `next_event` was called — ignoring events does not lose data.

### Terminal semantics

- `result()` is idempotent — multiple calls return the same value
- After `cancel()`, the handle transitions to COMPLETE with an error
- After `result()` returns, `next_event` returns null
- `update_state` and `write_file` error after COMPLETE

## Label Helpers

All SDKs provide helpers for attaching security labels to payload values:

**Python:**
```python
from mlld import execute, trusted, untrusted, labeled

result = execute("script.mld", {
    "config": trusted({"mode": "safe"}),
    "user_input": untrusted(raw_input),
    "data": labeled(value, "pii", "sensitive"),
})
```

**Go:**
```go
payload := map[string]any{
    "config":     mlld.Trusted(config),
    "user_input": mlld.Untrusted(rawInput),
    "data":       mlld.Labeled(value, "pii", "sensitive"),
}
```

**Rust:**
```rust
payload.insert("config", trusted(config));
payload.insert("user_input", untrusted(raw_input));
payload.insert("data", labeled(value, &["pii", "sensitive"]));
```

**Ruby:**
```ruby
payload = {
  "config" => Mlld.trusted(config),
  "user_input" => Mlld.untrusted(raw_input),
  "data" => Mlld.labeled(value, "pii", "sensitive"),
}
```

**Elixir:**
```elixir
payload = %{
  "config" => Mlld.trusted(config),
  "user_input" => Mlld.untrusted(raw_input),
  "data" => Mlld.labeled(value, ["pii", "sensitive"]),
}
```

Labels surface on `@payload.*.mx.labels` and propagate through mlld policy/guard flow.

## MCP Server Injection

All SDKs support per-execution MCP server commands:

```python
result = client.execute("./agent.mld", payload,
    mcp_servers={"tools": "uv run python3 mcp_server.py"})
```

In the mlld script, `import tools from mcp "tools"` resolves to the SDK-provided command. Each `execute()` call gets an independent server lifecycle.

## Filesystem Integrity

All SDKs expose signing and verification:

```python
signed = client.sign("docs/note.txt", identity="user:alice")
verified = client.verify("docs/note.txt")
status = client.fs_status("src/**/*.mld")
content_sig = client.sign_content("runtime payload", "user:alice")

# Write file within an active execution (auto-signed)
handle = client.execute_async("./agent.mld")
file_sig = handle.write_file("out.txt", "hello from sdk")
```

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
    timeout: 10_000)
IO.puts(result.output)
```

## Elixir-Specific Features

The Elixir SDK adds BEAM-native features beyond the core spec:

- **Supervision** — `Mlld.Client` is a GenServer with child spec support
- **Connection pool** — `Mlld.Pool` with checkout/checkin and overflow
- **Telemetry** — `:telemetry` events with `[:mlld, ...]` prefix
- **Event subscriptions** — `subscribe`/`unsubscribe` for OTP-style message passing
- **Task integration** — `process_task`/`execute_task` for Task.await/yield
- **Phoenix bridge** — `Mlld.Phoenix.stream_execute` for channel integration

## Requirements

All SDKs require:
- `mlld` CLI on PATH (or command override)
- Node.js runtime
