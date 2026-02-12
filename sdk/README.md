# mlld SDKs

Thin wrappers around the mlld CLI for Go, Python, Rust, and Ruby.

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

`update_state` sends live `state:update` requests to mutate in-flight `@state` for that request.

## State Writes

`execute` result state writes merge:

- final `stateWrites` from the completion payload
- streamed `state:write` events emitted during execution

## Requirements

- `mlld` CLI on PATH (or command override)
- Node.js runtime
