# mlld SDKs

Thin wrappers around the mlld CLI for Go, Python, Rust, Ruby, and Elixir.

## Philosophy

These SDKs wrap the mlld CLI rather than reimplementing it. This gives you:

- **Feature parity with CLI semantics**
- **Low maintenance overhead**
- **Shared transport behavior across languages**

The tradeoff is requiring Node.js at runtime.

## Installation

### Go

```bash
go get github.com/mlld-lang/mlld/sdk/go
```

### Python

```bash
pip install mlld-sdk
```

### Rust

```toml
[dependencies]
mlld = "0.1"
```

### Ruby

```bash
cd sdk/ruby
gem build mlld.gemspec
gem install ./mlld-*.gem
```

### Elixir

```bash
cd sdk/elixir
mix deps.get
```

## Core API

All SDKs provide these blocking operations:

- `process(script, options)`
- `execute(filepath, payload, options)`
- `analyze(filepath)`

All SDKs also keep a persistent `mlld live --stdio` subprocess per client.

## In-Flight Control API

Each SDK exposes handle APIs for long-running process/execute calls:

- Start request: `process_async(...)` / `execute_async(...)`
- Handle operations: `wait`/`result`, `cancel`, `update_state(path, value)`

Live transports can also emit structured `guard_denial` events before a request finishes. The Python SDK exposes these directly via `handle.next_event()`.

`update_state` sends live `state:update` requests to mutate in-flight `@state` for that request.

## State Writes

`execute` result state writes merge:

- final `stateWrites` from the completion payload
- streamed `state:write` events emitted during execution

Structured execute results also expose `denials`, a list of structured guard/policy label-flow denials observed during the run.

## MCP Server Injection

`execute` and `process` accept an `mcp_servers` map (logical name → shell command). When a script uses `import tools from mcp "name"`, the runtime checks this map before treating the spec as a command. Each execution gets its own server lifecycle, enabling parallel calls with independent MCP server state.

## Requirements

- `mlld` CLI on PATH (or command override)
- Node.js runtime
