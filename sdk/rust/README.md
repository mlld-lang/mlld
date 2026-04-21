# mlld Rust SDK

Rust wrapper for mlld using a persistent NDJSON RPC transport over `mlld live --stdio`.

## Installation

```toml
[dependencies]
mlld = "0.1"
```

## Requirements

- Rust 2021 edition
- Node.js runtime
- mlld CLI available by command path

## Quick Start

```rust
use mlld::{Client, ExecuteOptions};
use serde_json::json;
use std::collections::HashMap;
use std::time::Duration;

fn main() -> mlld::Result<()> {
    let client = Client::new();

    let output = client.process(r#"show "Hello World""#, None)?;
    println!("{}", output);

    let mut modules = HashMap::new();
    modules.insert("@config".to_string(), json!({ "mode": "demo" }));

    let result = client.execute(
        "./agent.mld",
        Some(json!({ "text": "hello" })),
        Some(ExecuteOptions {
            state: Some(json!({ "count": 0 })),
            dynamic_modules: Some(modules),
            timeout: Some(Duration::from_secs(10)),
            ..Default::default()
        }),
    )?;
    println!("{}", result.output);

    client.close();
    Ok(())
}
```

## In-Flight Events and State Updates

```rust
let mut handle = client.execute_async("./agent.mld", Some(payload), None)?;

// Consume events as they arrive
loop {
    match handle.next_event(Some(Duration::from_secs(5)))? {
        Some(event) if event.event_type == "state_write" => {
            println!("State: {} = {:?}", event.state_write.unwrap().path, event.state_write.unwrap().value);
        }
        Some(event) if event.event_type == "complete" => break,
        _ => break,
    }
}

// Or skip events and get the final result directly
let result = handle.result()?;
```

## MCP Server Injection

```rust
let mut mcp = HashMap::new();
mcp.insert("tools".to_string(), "uv run python3 mcp_server.py".to_string());

let result = client.execute(
    "./agent.mld",
    Some(payload),
    Some(ExecuteOptions {
        mcp_servers: Some(mcp),
        ..Default::default()
    }),
)?;
```

## Security Labels

```rust
use mlld::{labeled, trusted, untrusted};

let mut payload = HashMap::new();
payload.insert("config", trusted(json!({"mode": "safe"})));
payload.insert("user_input", untrusted(raw_input));
payload.insert("data", labeled(value, &["pii", "sensitive"]));

let result = client.execute("script.mld", Some(&payload), None)?;
```

## Filesystem Integrity

```rust
let signed = client.sign("docs/note.txt", Some(SignOptions { identity: Some("user:alice".into()), ..Default::default() }))?;
let verified = client.verify("docs/note.txt", None)?;
let status = client.fs_status(Some("src/**/*.mld"), None)?;
let content_sig = client.sign_content("runtime payload", "user:alice", None)?;

// Write file within an active execution
let mut handle = client.execute_async("./agent.mld", None, None)?;
let file_sig = handle.write_file("out.txt", "hello from sdk", None)?;
```

## API

### Client

- `Client::new()`
- `with_command(command)` / `with_command_args(args)` / `with_timeout(timeout)` / `with_working_dir(dir)`
- `process(script, opts)` / `process_async(script, opts) -> ProcessHandle`
- `execute(filepath, payload, opts)` / `execute_async(filepath, payload, opts) -> ExecuteHandle`
- `analyze(filepath)`
- `fs_status(glob, opts) -> Vec<FilesystemStatus>`
- `sign(path, opts) -> FileVerifyResult`
- `verify(path, opts) -> FileVerifyResult`
- `sign_content(content, identity, opts) -> ContentSignature`
- `close()`

### Handle Methods

`ProcessHandle` and `ExecuteHandle` both provide:

- `request_id()`
- `cancel()`
- `update_state(path, value)` / `update_state_with_labels(path, value, labels)`
- `next_event(timeout) -> Option<HandleEvent>`
- `wait()` / `result()`

`ExecuteHandle` also provides:

- `write_file(path, content, timeout) -> FileVerifyResult`

### ProcessOptions / ExecuteOptions

- `file_path` (ProcessOptions only)
- `payload` (ProcessOptions only)
- `payload_labels: Option<HashMap<String, Vec<String>>>`
- `state` / `dynamic_modules` / `dynamic_module_source`
- `mcp_servers: Option<HashMap<String, String>>`
- `mode` / `allow_absolute_paths` / `timeout`

### Label Helpers

- `labeled(value, labels) -> LabeledValue`
- `trusted(value) -> LabeledValue`
- `untrusted(value) -> LabeledValue`

### Convenience Functions

- `mlld::process(...)` / `mlld::execute(...)` / `mlld::analyze(...)`
- `mlld::fs_status(...)` / `mlld::sign(...)` / `mlld::verify(...)` / `mlld::sign_content(...)`

## Notes

- Each `Client` keeps one live RPC subprocess for repeated calls.
- `ExecuteResult.state_writes` merges final-result writes and streamed `state:write` events.
- `ExecuteResult.denials` collects structured guard/policy label-flow denials.
- `ExecuteResult.effects` contains output effects with security metadata.
- `ExecuteResult.metrics` contains timing statistics.
- `next_event` yields `HandleEvent` with type `"state_write"`, `"session_write"`, `"guard_denial"`, `"trace_event"`, or `"complete"`.
