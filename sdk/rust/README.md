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

    // Optional command override (local repo build example)
    // let client = Client::new()
    //     .with_command("node")
    //     .with_command_args(["./dist/cli.cjs"]);

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

## In-Flight State Updates

```rust
use mlld::{Client, ProcessOptions};
use serde_json::json;
use std::time::Duration;

let client = Client::new();
let mut handle = client.process_async(
    "loop(99999, 50ms) until @state.exit [\n  continue\n]\nshow \"done\"",
    Some(ProcessOptions {
        state: Some(json!({ "exit": false })),
        mode: Some("strict".to_string()),
        timeout: Some(Duration::from_secs(10)),
        ..Default::default()
    }),
)?;

std::thread::sleep(Duration::from_millis(120));
handle.update_state("exit", true)?;

let output = handle.result()?;
println!("{}", output);
```

## API

### Client

- `Client::new()`
- `with_command(command)`
- `with_command_args(args)`
- `with_timeout(timeout)`
- `with_working_dir(dir)`
- `close()`
- `process(script, opts)`
- `process_async(script, opts) -> ProcessHandle`
- `execute(filepath, payload, opts)`
- `execute_async(filepath, payload, opts) -> ExecuteHandle`
- `analyze(filepath)`

### Handle Methods

`ProcessHandle` and `ExecuteHandle` both provide:

- `request_id()`
- `cancel()`
- `update_state(path, value)`
- `wait()`
- `result()`

### Convenience Functions

- `mlld::process(...)`
- `mlld::execute(...)`
- `mlld::analyze(...)`

## Notes

- Each `Client` keeps one live RPC subprocess for repeated calls.
- `ExecuteResult.state_writes` merges final-result writes and streamed `state:write` events.
- Blocking client methods remain as wrappers around handle APIs.
