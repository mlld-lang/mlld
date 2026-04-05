# mlld SDKs

Thin wrappers around the mlld CLI for Go, Python, Rust, Ruby, and Elixir.

See [SPEC.md](SPEC.md) for the canonical interface specification.

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

- `process(script, options)` — execute a script string, return text
- `execute(filepath, payload, options)` — run a file with payload, return structured result
- `analyze(filepath)` — static analysis without execution

All SDKs keep a persistent `mlld live --stdio` subprocess per client.

## In-Flight Control API

Each SDK exposes handle APIs for long-running process/execute calls:

- Start request: `process_async(...)` / `execute_async(...)`
- Handle operations: `wait`/`result`, `cancel`, `update_state(path, value, labels?)`
- Event consumption: `next_event(timeout?)` — returns `state_write`, `guard_denial`, or `complete` events in order
- File operations: `write_file(path, content)` on `ExecuteHandle` — writes a file within the execution context and auto-signs it

JS/TS exposes equivalent semantics through `StreamExecution` async event iteration.

Handles follow a three-state lifecycle (PENDING → STREAMING → COMPLETE). State writes and guard denials from events are merged into the final `ExecuteResult` regardless of whether `next_event` was called — ignoring events does not lose data.

## State Writes

`execute` result state writes merge:

- final `stateWrites` from the completion payload
- streamed `state:write` events emitted during execution

Structured execute results also expose `denials` (guard/policy label-flow denials), `effects` (output effects), and `metrics` (execution timing).

## MCP Server Injection

`execute` and `process` accept an `mcp_servers` map (logical name → shell command). When a script uses `import tools from mcp "name"`, the runtime checks this map before treating the spec as a command. Each execution gets its own server lifecycle, enabling parallel calls with independent MCP server state.

## Security Labels

Payload fields can carry security labels for mlld's taint tracking:

```python
# Python
from mlld import execute, trusted, untrusted
result = execute("script.mld", {
    "config": trusted({"mode": "safe"}),
    "user_input": untrusted(raw_input),
})
```

All wrapper SDKs provide `labeled(value, *labels)`, `trusted(value)`, and `untrusted(value)` helpers. These wrap values so the SDK can extract and send per-field labels via the `payload_labels` parameter.

## Filesystem Integrity

All SDKs expose cryptographic signing and verification for files in an mlld project:

- `fs_status(glob?)` — query signature/integrity status for tracked files
- `sign(path, identity?, metadata?)` — sign a file
- `verify(path)` — verify a file's signature
- `sign_content(content, identity)` — sign runtime content and persist in `.sig/content/`

## Requirements

- `mlld` CLI on PATH (or command override)
- Node.js runtime
